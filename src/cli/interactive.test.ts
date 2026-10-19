import {EventEmitter} from 'node:events';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createInterface} from 'node:readline';
import {pickStation, watchNow} from './interactive.js';
import {CliOutput} from './output.js';
import {JsonLibraryStore} from '../storage/store.js';
import type {Station} from '../types.js';
import type {RadioSessionStatus} from '../agent/session.js';

vi.mock('node:readline', () => ({createInterface: vi.fn()}));
const first: Station = {id: 'first', provider: 'playlist', name: 'First', tags: []};
const second: Station = {...first, id: 'second', name: 'Second'};
const flags = {json: false, plain: false, quiet: false, noInput: false, noColor: true};
const settings = new JsonLibraryStore('/nonexistent-radiocli-interactive-fixture/library.json').snapshot().settings;
const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
const exitCode = process.exitCode;
let originalSignals: Set<NodeJS.SignalsListener>;

beforeEach(() => {
  Object.defineProperty(process.stdin, 'isTTY', {configurable: true, value: true});
  Object.defineProperty(process.stdout, 'isTTY', {configurable: true, value: true});
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  originalSignals = new Set(process.listeners('SIGINT'));
});
afterEach(() => {
  if (stdinTTY) Object.defineProperty(process.stdin, 'isTTY', stdinTTY); else Reflect.deleteProperty(process.stdin, 'isTTY');
  if (stdoutTTY) Object.defineProperty(process.stdout, 'isTTY', stdoutTTY); else Reflect.deleteProperty(process.stdout, 'isTTY');
  process.exitCode = exitCode;
  vi.restoreAllMocks(); vi.useRealTimers();
});

describe('inline terminal interactions', () => {
  it('aborts an in-flight status request immediately when the view is cancelled', async () => {
    const read = vi.fn((signal?: AbortSignal) => new Promise<RadioSessionStatus | null>(resolve => {
      signal!.addEventListener('abort', () => resolve(null), {once: true});
    }));
    const watching = watchNow(read, new CliOutput(flags, settings));
    const signal = process.listeners('SIGINT').find(listener => !originalSignals.has(listener));
    signal!('SIGINT');
    await watching;
    expect(read.mock.calls[0]![0]?.aborted).toBe(true);
    expect(process.listeners('SIGINT')).not.toContain(signal);
  });

  it('reprompts for invalid numbers and closes after selection', async () => {
    const input = new EventEmitter() as EventEmitter & {question: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>};
    let answer: (text: string) => void = () => undefined;
    input.question = vi.fn((_prompt, callback) => { answer = callback; });
    input.close = vi.fn(() => input.emit('close'));
    vi.mocked(createInterface).mockReturnValue(input as unknown as ReturnType<typeof createInterface>);
    const selection = pickStation([first, second], new CliOutput(flags, settings), []);
    answer('3');
    expect(input.question).toHaveBeenCalledTimes(2);
    answer('2');
    await expect(selection).resolves.toEqual(second);
    expect(input.close).toHaveBeenCalledOnce();
  });

  it.each(['SIGINT', 'close'])('cancels on %s without selecting a station', async event => {
    const input = new EventEmitter() as EventEmitter & {question: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>};
    input.question = vi.fn(); input.close = vi.fn();
    vi.mocked(createInterface).mockReturnValue(input as unknown as ReturnType<typeof createInterface>);
    const selection = pickStation([first], new CliOutput(flags, settings), []);
    input.emit(event);
    await expect(selection).rejects.toMatchObject({name: 'AbortError'});
    expect(input.close).toHaveBeenCalledOnce();
  });

  it('updates one line only when playback changes and cleans up on Ctrl+C', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const status: RadioSessionStatus = {owner: 'headless', station: first, queue: [first], playback: {backend: 'mpv', state: 'playing', volume: 40, muted: false, ready: true}};
    const read = vi.fn().mockResolvedValue(status);
    const output = new CliOutput(flags, settings, {isTTY: true, columns: 100}, {TERM: 'xterm'});
    const watching = watchNow(read, output);
    const signal = process.listeners('SIGINT').find(listener => !originalSignals.has(listener));
    try {
      await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2), {timeout: 1500});
      expect(write).toHaveBeenCalledTimes(1);
      read.mockResolvedValue({...status, nowPlaying: {title: 'New song', updatedAt: '2030-01-01T00:00:00Z'}});
      await vi.waitFor(() => expect(write).toHaveBeenLastCalledWith(expect.stringContaining('New song')), {timeout: 1500});
      expect(signal).toBeDefined();
    } finally {
      signal?.('SIGINT');
      await watching;
    }
    expect(write).toHaveBeenLastCalledWith('\n');
    expect(process.listeners('SIGINT')).not.toContain(signal);
    expect(process.exitCode).toBe(130);
    expect(write.mock.calls.map(call => String(call[0])).join('')).not.toContain('\u001b[?1049');
  });
});
