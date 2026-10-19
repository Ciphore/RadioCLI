import {mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {setImmediate as nextEventLoopTurn} from 'node:timers/promises';
import * as workerThreads from 'node:worker_threads';
import {EventEmitter} from 'node:events';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ProviderCache} from './cache.js';

vi.mock('node:worker_threads', async importOriginal => ({...await importOriginal<typeof workerThreads>()}));

const temporaryRoots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, {recursive: true, force: true});
  }
});

describe('ProviderCache', () => {
  it('bounds memory and shard markers together and reloads evicted values from disk', async () => {
    const filePath = temporaryCachePath();
    const cache = new ProviderCache(filePath, {maxMemoryEntries: 2, maxMemoryBytes: 4096});
    for (let index = 0; index < 6; index += 1) await cache.setAsync(`key-${index}`, {index});
    const internals = cache as unknown as {cache: {entries: Record<string, unknown>}; checkedShards: Set<string>; memoryBytes: number};
    expect(Object.keys(internals.cache.entries)).toEqual(['key-4', 'key-5']);
    expect(internals.checkedShards.size).toBe(2);
    expect(internals.memoryBytes).toBeLessThanOrEqual(4096);
    expect(await cache.getAsync('key-0', 60_000)).toEqual({index: 0});
    expect(internals.checkedShards.size).toBe(2);
    expect(Object.keys(internals.cache.entries)).toHaveLength(2);
  });

  it('keeps values larger than the memory budget usable without retaining them', async () => {
    const filePath = temporaryCachePath();
    const cache = new ProviderCache(filePath, {maxMemoryBytes: 128});
    const value = '東京'.repeat(1000);
    await cache.setAsync('atlas', value);
    expect(await cache.getAsync('atlas', 60_000)).toBe(value);
    expect(cache.get('atlas', 60_000)).toBe(value);
    const internals = cache as unknown as {cache: {entries: Record<string, unknown>}; checkedShards: Set<string>; memoryBytes: number};
    expect(Object.keys(internals.cache.entries)).toHaveLength(0);
    expect(internals.checkedShards.size).toBe(0);
    expect(internals.memoryBytes).toBe(0);
  });

  it('enforces disk count and byte budgets after completed asynchronous writes', async () => {
    const filePath = temporaryCachePath();
    const cache = new ProviderCache(filePath, {maxDiskEntries: 3, maxDiskBytes: 900});
    for (let index = 0; index < 8; index += 1) await cache.setAsync(`key-${index}`, 'x'.repeat(200));
    const files = readdirSync(`${filePath}.d`).map(name => readFileSync(join(`${filePath}.d`, name)));
    expect(files.length).toBeLessThanOrEqual(3);
    expect(files.reduce((sum, contents) => sum + contents.byteLength, 0)).toBeLessThanOrEqual(900);
  });

  it('does not let a delayed shard read replace a newer in-process write', async () => {
    const filePath = temporaryCachePath();
    const oldRows = Array.from({length: 2000}, (_, index) => ({index, name: 'old'.repeat(60)}));
    new ProviderCache(filePath).set('atlas', oldRows);
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.spyOn(workerThreads, 'Worker').mockImplementation(function (_source, options) {
      const worker = new EventEmitter() as workerThreads.Worker;
      worker.terminate = async () => 0;
      started();
      void gate.then(() => {
        worker.emit('message', {value: JSON.parse(options!.workerData.value as string)});
        worker.emit('exit', 0);
      });
      return worker;
    });
    const cache = new ProviderCache(filePath);
    const reading = cache.getAsync('atlas', 60_000);
    await ready;
    await cache.setAsync('atlas', [{id: 'new'}]);
    release();
    expect(await reading).toEqual([{id: 'new'}]);
    expect(cache.get('atlas', 60_000)).toEqual([{id: 'new'}]);
  });

  it('bounds pending writes and rejects a synchronous write that would overtake them', async () => {
    const cache = new ProviderCache(temporaryCachePath(), {maxPendingOperations: 1});
    const writing = cache.setAsync('one', ['value']);
    await expect(cache.setAsync('two', ['value'])).rejects.toThrow(/capacity/);
    expect(() => cache.set('one', ['later'])).toThrow(/setAsync/);
    await writing;
    expect(await cache.getAsync('one', 60_000)).toEqual(['value']);
    await cache.setAsync('two', ['value']);
  });

  it('persists independent shards and restores them in a new instance', () => {
    const filePath = temporaryCachePath();
    const cache = new ProviderCache(filePath);
    cache.set('countries', [{name: 'Japan'}]);
    cache.set('stations', [{name: 'Tokyo Jazz'}]);

    const restored = new ProviderCache(filePath);
    expect(restored.get('countries', 60_000)).toEqual([{name: 'Japan'}]);
    expect(restored.get('stations', 60_000)).toEqual([{name: 'Tokyo Jazz'}]);
  });

  it('ignores one corrupt shard without losing valid cached responses', () => {
    const filePath = temporaryCachePath();
    const cache = new ProviderCache(filePath);
    cache.set('valid', {ok: true});
    const shardDirectory = `${filePath}.d`;
    mkdirSync(shardDirectory, {recursive: true});
    writeFileSync(join(shardDirectory, 'corrupt.json'), '{broken', 'utf8');

    const restored = new ProviderCache(filePath);
    expect(restored.get('valid', 60_000)).toEqual({ok: true});
    expect(readdirSync(shardDirectory)).toHaveLength(2);
  });

  it.each(['sync', 'async'] as const)('prefers a newer shard over an expired legacy entry with %s reads', async mode => {
    const filePath = temporaryCachePath();
    writeFileSync(filePath, JSON.stringify({version: 1, entries: {atlas: {createdAt: Date.now() - 41 * 86400000, value: ['old atlas']}}}));
    const cache = new ProviderCache(filePath);
    await cache.setAsync('atlas', ['new atlas']);
    const restored = new ProviderCache(filePath);
    const fresh = mode === 'async' ? await restored.getAsync('atlas', 60_000) : restored.get('atlas', 60_000);
    const stale = mode === 'async' ? await restored.getStaleAsync('atlas') : restored.getStale('atlas');
    expect(fresh).toEqual(['new atlas']);
    expect(stale).toEqual(['new atlas']);
  });

  it.each(['sync', 'async'] as const)('retains newer legacy data over an older shard with %s reads', async mode => {
    const filePath = temporaryCachePath();
    const cache = new ProviderCache(filePath);
    cache.set('atlas', ['old shard']);
    writeFileSync(filePath, JSON.stringify({version: 1, entries: {atlas: {createdAt: Date.now() + 1, value: ['new legacy']}}}));
    const restored = new ProviderCache(filePath);
    expect(mode === 'async' ? await restored.getAsync('atlas', 60_000) : restored.get('atlas', 60_000)).toEqual(['new legacy']);
  });

  it.each(['sync', 'async'] as const)('expires future-dated memory, shard and legacy entries after a clock correction (%s)', async mode => {
    const now = 1_800_000_000_000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 86_400_000);
    const filePath = temporaryCachePath();
    const writer = new ProviderCache(filePath);
    await writer.setAsync('atlas', ['saved before clock correction']);
    clock.mockReturnValue(now);
    const legacyPath = temporaryCachePath();
    writeFileSync(legacyPath, JSON.stringify({version: 1, entries: {atlas: {createdAt: now + 86_400_000, value: ['future legacy']}}}));
    for (const cache of [writer, new ProviderCache(filePath), new ProviderCache(legacyPath)]) {
      expect(mode === 'sync' ? cache.get('atlas', 1000) : await cache.getAsync('atlas', 1000)).toBeNull();
      expect(mode === 'sync' ? cache.getStale('atlas') : await cache.getStaleAsync('atlas')).toBeNull();
    }
    await writer.setAsync('atlas', ['refreshed after correction']);
    expect(mode === 'sync' ? writer.get('atlas', 1000) : await writer.getAsync('atlas', 1000)).toEqual(['refreshed after correction']);
    clock.mockReturnValue(now + 1001);
    expect(mode === 'sync' ? writer.get('atlas', 1000) : await writer.getAsync('atlas', 1000)).toBeNull();
  });

  it.each(['sync', 'async'] as const)('does not let a future legacy timestamp hide a valid shard (%s)', async mode => {
    const now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const filePath = temporaryCachePath();
    await new ProviderCache(filePath).setAsync('atlas', ['valid shard']);
    writeFileSync(filePath, JSON.stringify({version: 1, entries: {atlas: {createdAt: now + 86_400_000, value: ['future legacy']}}}));
    const cache = new ProviderCache(filePath);
    expect(mode === 'sync' ? cache.get('atlas', 1000) : await cache.getAsync('atlas', 1000)).toEqual(['valid shard']);
  });

  it.each(['sync', 'async'] as const)('does not let a future shard hide valid legacy data (%s)', async mode => {
    const now = 1_800_000_000_000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 86_400_000);
    const filePath = temporaryCachePath();
    await new ProviderCache(filePath).setAsync('atlas', ['future shard']);
    clock.mockReturnValue(now);
    writeFileSync(filePath, JSON.stringify({version: 1, entries: {atlas: {createdAt: now, value: ['valid legacy']}}}));
    const cache = new ProviderCache(filePath);
    expect(mode === 'sync' ? cache.get('atlas', 1000) : await cache.getAsync('atlas', 1000)).toEqual(['valid legacy']);
  });

  it.each(['sync', 'async'] as const)('tolerates at most one second of future clock skew (%s)', async mode => {
    const now = 1_800_000_000_000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const filePath = temporaryCachePath();
    const cache = new ProviderCache(filePath);
    cache.set('atlas', ['retained']);
    clock.mockReturnValue(now - 1000);
    expect(mode === 'sync' ? cache.get('atlas', 1000) : await cache.getAsync('atlas', 1000)).toEqual(['retained']);
    clock.mockReturnValue(now - 1001);
    expect(mode === 'sync' ? cache.get('atlas', 1000) : await cache.getAsync('atlas', 1000)).toBeNull();
  });

  it('prefers migrated shards when legacy and shard timestamps are equal', async () => {
    const filePath = temporaryCachePath();
    const cache = new ProviderCache(filePath);
    cache.set('atlas', ['new shard']);
    const shard = JSON.parse(readFileSync(join(`${filePath}.d`, readdirSync(`${filePath}.d`)[0]!), 'utf8')) as {createdAt: number};
    writeFileSync(filePath, JSON.stringify({version: 1, entries: {atlas: {createdAt: shard.createdAt, value: ['old legacy']}}}));
    expect(await new ProviderCache(filePath).getAsync('atlas', 60_000)).toEqual(['new shard']);
    expect(new ProviderCache(filePath).get('atlas', 60_000)).toEqual(['new shard']);
  });

  it('round-trips a large Unicode atlas while leaving the event loop available', async () => {
    const filePath = temporaryCachePath();
    const rows = Array.from({length: 2000}, (_, index) => ({id: index, name: '東京 · Rádio · 👩🏽‍💻', description: 'radio'.repeat(50)}));
    const cache = new ProviderCache(filePath);
    await cache.setAsync('atlas', rows);
    const restored = new ProviderCache(filePath);
    const events: string[] = [];
    const reading = restored.getAsync('atlas', 60_000).then(result => {events.push('loaded'); return result;});
    await nextEventLoopTurn();
    events.push('input');
    expect(await reading).toEqual(rows);
    expect(events).toEqual(['input', 'loaded']);
  });

  it('retains large-cache reads and writes when the environment forbids workers', async () => {
    vi.spyOn(workerThreads, 'Worker').mockImplementation(function () {throw new Error('Worker creation disabled.');});
    const filePath = temporaryCachePath();
    const rows = Array.from({length: 2000}, (_, index) => ({id: index, name: 'Radio'.repeat(50)}));
    await new ProviderCache(filePath).setAsync('atlas', rows);
    expect(await new ProviderCache(filePath).getAsync('atlas', 60_000)).toEqual(rows);
    expect(workerThreads.Worker).toHaveBeenCalled();
  });

  it('preserves the last value when a large write overlaps a smaller refresh', async () => {
    const filePath = temporaryCachePath();
    const cache = new ProviderCache(filePath);
    await Promise.all([
      cache.setAsync('atlas', Array.from({length: 2000}, (_, index) => ({id: index}))),
      cache.setAsync('atlas', [{id: 'newer'}])
    ]);
    expect(await new ProviderCache(filePath).getAsync('atlas', 60_000)).toEqual([{id: 'newer'}]);
  });

  it('keeps cached data available when its shard is corrupt', async () => {
    const filePath = temporaryCachePath();
    const cache = new ProviderCache(filePath);
    cache.set('atlas', ['valid']);
    writeFileSync(filePath, JSON.stringify({version: 1, entries: {atlas: {createdAt: Date.now(), value: ['legacy fallback']}}}));
    writeFileSync(join(`${filePath}.d`, readdirSync(`${filePath}.d`)[0]!), '{invalid');
    expect(await new ProviderCache(filePath).getAsync('atlas', 60_000)).toEqual(['legacy fallback']);
  });

  it.each(['sync', 'async'] as const)('discovers a shard created after a %s cache miss', async mode => {
    const filePath = temporaryCachePath();
    const cache = new ProviderCache(filePath);
    expect(mode === 'async' ? await cache.getAsync('atlas', 60_000) : cache.get('atlas', 60_000)).toBeNull();
    await new ProviderCache(filePath).setAsync('atlas', ['created by another process']);
    expect(mode === 'async' ? await cache.getAsync('atlas', 60_000) : cache.get('atlas', 60_000)).toEqual(['created by another process']);
  });

  it('backs up corrupt large legacy data while keeping a valid shard usable', async () => {
    const filePath = temporaryCachePath();
    const invalid = '{invalid'.repeat(40_000);
    writeFileSync(filePath, invalid);
    new ProviderCache(filePath).set('atlas', ['valid shard']);
    expect(await new ProviderCache(filePath).getAsync('atlas', 60_000)).toEqual(['valid shard']);
    const backup = readdirSync(dirname(filePath)).find(name => name.startsWith('cache.json.bad-'));
    expect(backup).toBeDefined();
    expect(readFileSync(join(dirname(filePath), backup!), 'utf8')).toBe(invalid);
  });
});

function temporaryCachePath(): string {
  const root = mkdtempSync(join(tmpdir(), 'radiocli-cache-'));
  temporaryRoots.push(root);
  return join(root, 'cache.json');
}
