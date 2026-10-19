import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {IcyNowPlaying, PlaybackState, Station} from '../types.js';
import {JsonLibraryStore} from '../storage/store.js';
import {PlayerController} from './player-controller.js';
import {RadioEngine} from './radio-engine.js';

const roots: string[] = [];
const engines: RadioEngine[] = [];
afterEach(async () => {
  for (const engine of engines.splice(0)) await engine.close();
  vi.useRealTimers();
  for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true});
});
const first: Station = {id: 'first', provider: 'playlist', name: 'First', tags: [], streamUrl: 'https://example.test/first'};
const second: Station = {...first, id: 'second', name: 'Second', streamUrl: 'https://example.test/second'};

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'radiocli-engine-')); roots.push(root);
  const store = new JsonLibraryStore(join(root, 'library.json'));
  let state: PlaybackState = {backend: 'mpv', state: 'idle', volume: 70, muted: false, ready: false};
  const changes = new Set<(state: PlaybackState) => void>();
  const metadata = new Set<(metadata: IcyNowPlaying) => void>();
  const change = (updates: Partial<PlaybackState>) => { state = {...state, ...updates}; for (const listener of changes) listener(state); };
  const emitMetadata = (title: string) => { for (const listener of metadata) listener({title, updatedAt: new Date().toISOString()}); };
  const player = {
    getState: () => ({...state}),
    onChange: (listener: (state: PlaybackState) => void) => { changes.add(listener); listener(state); return () => changes.delete(listener); },
    onMetadata: (listener: (metadata: IcyNowPlaying) => void) => { metadata.add(listener); return () => metadata.delete(listener); },
    stop: vi.fn(async () => change({state: 'stopped', ready: false})),
    play: vi.fn(async (station: Station, url: string, options?: {startPaused?: boolean; signal?: AbortSignal}) => {
      change({state: options?.startPaused ? 'paused' : 'playing', ready: true, buffering: false, stationName: station.name, streamUrl: url});
      emitMetadata(`Track for ${station.name}`);
    }),
    pause: async () => { change({state: 'paused'}); return {ok: true}; },
    resume: async () => { change({state: 'playing'}); return {ok: true}; },
    recoverableFailure: vi.fn(() => false)
  };
  const providers = {resolve: vi.fn(async (station: Station, _options?: {signal?: AbortSignal}) => ({url: station.streamUrl!}))};
  const engine = new RadioEngine(player as unknown as PlayerController, providers, store, () => store.settings()); engines.push(engine);
  return {engine, store, player, providers, change, emitMetadata};
}

describe('shared radio engine', () => {
  it('attributes metadata emitted during startup to the candidate, and ends history on passive EOF', async () => {
    vi.useFakeTimers();
    const {engine, store, change} = fixture();
    await engine.tune(first);
    await vi.advanceTimersByTimeAsync(1000);
    await engine.tune(second);
    const track = store.snapshot().trackHistory[0];
    expect(track).toMatchObject({stationKey: 'playlist:second', title: 'Track for Second'});
    await vi.advanceTimersByTimeAsync(1000);
    change({state: 'stopped', ready: false});
    await engine.flushHistory();
    const finished = store.snapshot().activity.sessions[0]!;
    expect(finished.endedAt).toBeDefined();
    expect(finished.listenedSeconds).toBe(1);
    await vi.advanceTimersByTimeAsync(3000);
    await engine.close();
    expect(store.snapshot().activity.sessions[0]?.listenedSeconds).toBe(1);
  });

  it('never lets a late resolution become audible after Stop or a newer tune', async () => {
    const {engine, player, providers} = fixture();
    let release!: (value: {url: string}) => void;
    providers.resolve.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const pending = engine.tune(first);
    const rejected = expect(pending).rejects.toMatchObject({name: 'AbortError'});
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    await engine.stop();
    await engine.tune(second);
    release({url: first.streamUrl!});
    await rejected;
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(engine.snapshot().station).toEqual(second);
  });

  it('does not count buffering or pause as listening and resumes a separate session', async () => {
    vi.useFakeTimers();
    const {engine, store, change} = fixture();
    await engine.tune(first);
    await vi.advanceTimersByTimeAsync(2000);
    change({buffering: true});
    await engine.flushHistory();
    await vi.advanceTimersByTimeAsync(4000);
    change({buffering: false});
    await engine.flushHistory();
    await vi.advanceTimersByTimeAsync(1000);
    await engine.pause();
    expect(store.snapshot().activity.sessions.reduce((sum, session) => sum + session.listenedSeconds, 0)).toBe(3);
  });

  it('keeps a ready AirPlay receiver connected through retunes', async () => {
    const {engine, player, change} = fixture();
    await engine.tune(first);
    change({backend: 'airplay'});
    player.stop.mockClear();
    await engine.tune(second);
    expect(player.stop).not.toHaveBeenCalled();
    expect(engine.snapshot().station).toEqual(second);
  });

  it('cancels an auto-skip delay immediately and bounds transient recovery', async () => {
    vi.useFakeTimers();
    const {engine, providers, player, change} = fixture();
    providers.resolve.mockRejectedValueOnce(new Error('Unavailable.'));
    const tune = engine.tune(first, {queue: [first, second]});
    const rejected = expect(tune).rejects.toMatchObject({name: 'AbortError'});
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.snapshot().message).toContain('Skipping to Second');
    await engine.stop(); await rejected;
    await vi.advanceTimersByTimeAsync(1500);
    expect(player.play).not.toHaveBeenCalled();
    await engine.tune(first);
    player.recoverableFailure.mockReturnValue(true);
    for (const delay of [1000, 2000, 4000]) { change({state: 'error', ready: false}); await vi.advanceTimersByTimeAsync(delay); await engine.flushHistory(); }
    expect(player.play).toHaveBeenCalledTimes(4);
    change({state: 'error', ready: false}); await vi.advanceTimersByTimeAsync(10_000);
    expect(player.play).toHaveBeenCalledTimes(4);
  });

  it('cancels a pending reconnect on Stop or a new station', async () => {
    vi.useFakeTimers(); const {engine, player, change} = fixture();
    await engine.tune(first); player.recoverableFailure.mockReturnValue(true);
    change({state: 'error', ready: false}); await engine.stop();
    await vi.advanceTimersByTimeAsync(8000); expect(player.play).toHaveBeenCalledTimes(1);
    await engine.tune(first); change({state: 'error', ready: false}); await engine.tune(second);
    await vi.advanceTimersByTimeAsync(8000); expect(player.play).toHaveBeenCalledTimes(3);
    expect(engine.snapshot().station?.id).toBe(second.id);
  });

  it('restores the retry budget only after sustained healthy playback', async () => {
    vi.useFakeTimers(); const {engine, player, change} = fixture();
    await engine.tune(first); player.recoverableFailure.mockReturnValue(true);
    for (const wait of [1000, 2000, 4000]) { change({state: 'error', ready: false}); await vi.advanceTimersByTimeAsync(wait); }
    await vi.advanceTimersByTimeAsync(30_000); change({buffering: true});
    await vi.advanceTimersByTimeAsync(31_000); change({buffering: false});
    await vi.advanceTimersByTimeAsync(60_000);
    change({state: 'error', ready: false}); await vi.advanceTimersByTimeAsync(1000);
    expect(player.play).toHaveBeenCalledTimes(5);
  });
});
