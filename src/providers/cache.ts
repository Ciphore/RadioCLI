import {existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile} from 'node:fs/promises';
import {platformPaths} from '../platform/paths.js';
import {parseJsonAsync, stringifyJsonAsync} from '../platform/json-worker.js';
import {join} from 'node:path';

type CacheEntry = {createdAt: number; value: unknown};
type CacheEnvelope = {version: 1; entries: Record<string, CacheEntry>};
type ShardedCacheEntry = CacheEntry & {version: 1; key: string};
type CacheOptions = {maxMemoryEntries?: number; maxMemoryBytes?: number; maxDiskEntries?: number; maxDiskBytes?: number; maxPendingOperations?: number};
type PendingRead = {invalidated: boolean; promise: Promise<CacheEntry | undefined>};
type DiskEntry = {path: string; bytes: number; modified: number; inode: number};

const maxCacheEntries = 256;
const maxCacheBytes = 128 * 1024 * 1024;
// Permit small timestamp skew between writers, but never extend freshness by
// hours or days after a system clock correction.
const maxFutureClockSkewMs = 1000;

export class ProviderCache {
  private cache: CacheEnvelope = {version: 1, entries: Object.create(null) as Record<string, CacheEntry>};
  // This set is tied to retained entries; eviction must allow disk reads again.
  private readonly checkedShards = new Set<string>();
  private readonly entrySizes = new Map<string, number>();
  private memoryBytes = 0;
  private legacyAbsent = false;
  private legacyLoadPromise: Promise<CacheEnvelope> | null = null;
  private readonly pendingShardReads = new Map<string, PendingRead>();
  private readonly pendingWrites = new Map<string, Promise<void>>();
  private pendingWriteCount = 0;
  private prunePromise = Promise.resolve();

  constructor(readonly filePath = defaultProviderCachePath(), private readonly options: CacheOptions = {}) {}

  get<T>(key: string, maxAgeMs: number): T | null {
    const entry = this.loadEntry(key);
    return entry && withinAge(entry, maxAgeMs) ? entry.value as T : null;
  }

  getStale<T>(key: string, maxAgeMs = 30 * 24 * 60 * 60 * 1000): T | null {
    return this.get<T>(key, maxAgeMs);
  }

  async getAsync<T>(key: string, maxAgeMs: number): Promise<T | null> {
    // A caller reading during a refresh observes the completed newest write.
    await this.pendingWrites.get(key)?.catch(() => undefined);
    const entry = this.memoryEntry(key) ?? await this.loadEntryAsync(key);
    return entry && withinAge(entry, maxAgeMs) ? entry.value as T : null;
  }

  getStaleAsync<T>(key: string, maxAgeMs = 30 * 24 * 60 * 60 * 1000): Promise<T | null> {
    return this.getAsync<T>(key, maxAgeMs);
  }

  set(key: string, value: unknown): void {
    if (this.pendingWrites.has(key)) throw new Error('Provider cache is refreshing this entry. Use setAsync to keep writes ordered.');
    const read = this.pendingShardReads.get(key);
    if (read) read.invalidated = true;
    const entry = {createdAt: Date.now(), value};
    const serialized = JSON.stringify({version: 1, key, ...entry} satisfies ShardedCacheEntry);
    this.remember(key, entry, retainedBytes(serialized));
    const directory = this.shardDirectory();
    mkdirSync(directory, {recursive: true, mode: 0o700});
    writeAtomically(this.shardPath(key), serialized);
    this.pruneShards(directory);
  }

  async setAsync(key: string, value: unknown): Promise<void> {
    if (this.pendingWriteCount >= (this.options.maxPendingOperations ?? 16)) throw new Error('Provider cache write capacity reached.');
    const entry = {createdAt: Date.now(), value};
    const read = this.pendingShardReads.get(key);
    if (read) read.invalidated = true;
    this.pendingWriteCount += 1;
    const previous = this.pendingWrites.get(key) ?? Promise.resolve();
    const pending = previous.catch(() => undefined).then(async () => {
      const serialized = await stringifyJsonAsync({version: 1, key, ...entry} satisfies ShardedCacheEntry, isLargeValue(value));
      this.remember(key, entry, retainedBytes(serialized));
      const directory = this.shardDirectory();
      await mkdir(directory, {recursive: true, mode: 0o700});
      const path = this.shardPath(key);
      const tempPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
      try {
        await writeFile(tempPath, `${serialized}\n`, {encoding: 'utf8', mode: 0o600, flag: 'wx'});
        await rename(tempPath, path);
      } catch (error) {
        await rm(tempPath, {force: true}).catch(() => undefined);
        throw error;
      }
      const prune = this.prunePromise.catch(() => undefined).then(() => this.pruneShardsAsync(directory));
      this.prunePromise = prune;
      await prune;
    });
    this.pendingWrites.set(key, pending);
    try { await pending; }
    finally {
      this.pendingWriteCount -= 1;
      if (this.pendingWrites.get(key) === pending) this.pendingWrites.delete(key);
    }
  }

  private memoryEntry(key: string): CacheEntry | undefined {
    const entry = this.cache.entries[key];
    if (entry) {
      const bytes = this.entrySizes.get(key)!;
      this.entrySizes.delete(key);
      this.entrySizes.set(key, bytes);
    }
    return entry;
  }

  private remember(key: string, entry: CacheEntry, bytes = retainedBytes(JSON.stringify(entry))): void {
    this.forget(key);
    if (bytes > (this.options.maxMemoryBytes ?? 64 * 1024 * 1024)) return;
    this.cache.entries[key] = entry;
    this.entrySizes.set(key, bytes);
    this.checkedShards.add(key);
    this.memoryBytes += bytes;
    while (this.entrySizes.size > (this.options.maxMemoryEntries ?? maxCacheEntries) || this.memoryBytes > (this.options.maxMemoryBytes ?? 64 * 1024 * 1024)) {
      const oldest = this.entrySizes.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.forget(oldest);
    }
  }

  private forget(key: string): void {
    this.memoryBytes -= this.entrySizes.get(key) ?? 0;
    this.entrySizes.delete(key);
    this.checkedShards.delete(key);
    delete this.cache.entries[key];
  }

  private loadEntry(key: string): CacheEntry | undefined {
    const memory = this.memoryEntry(key);
    if (memory) return memory;
    const legacy = this.readLegacy().entries[key];
    const shard = this.readShard(key);
    const entry = newerEntry(legacy, shard);
    if (entry) this.remember(key, entry);
    return entry;
  }

  private async loadEntryAsync(key: string): Promise<CacheEntry | undefined> {
    const pending = this.pendingShardReads.get(key);
    if (pending) return pending.promise;
    // Cache misses can proceed to the directory instead of growing an unbounded
    // queue of disk reads. No negative entry prevents a later shard discovery.
    if (this.pendingShardReads.size >= (this.options.maxPendingOperations ?? 16)) return undefined;
    const record: PendingRead = {invalidated: false, promise: Promise.resolve(undefined)};
    const work = async (): Promise<CacheEntry | undefined> => {
      do {
        record.invalidated = false;
        const [legacy, shard] = await Promise.all([this.readLegacyAsync(), this.readShardAsync(key)]);
        if (!record.invalidated) {
          const entry = newerEntry(legacy.entries[key], shard);
          if (entry) {
            const serialized = await stringifyJsonAsync(entry, isLargeValue(entry.value));
            if (record.invalidated) {
              await this.pendingWrites.get(key)?.catch(() => undefined);
              const current = this.memoryEntry(key);
              if (current) return current;
              continue;
            }
            this.remember(key, entry, retainedBytes(serialized));
          }
          return entry;
        }
        await this.pendingWrites.get(key)?.catch(() => undefined);
        const current = this.memoryEntry(key);
        if (current) return current;
      } while (true);
    };
    record.promise = work().finally(() => { if (this.pendingShardReads.get(key) === record) this.pendingShardReads.delete(key); });
    this.pendingShardReads.set(key, record);
    return record.promise;
  }

  private readLegacy(): CacheEnvelope {
    if (this.legacyAbsent) return emptyEnvelope();
    try {
      if (statSync(this.filePath).size > (this.options.maxDiskBytes ?? maxCacheBytes)) return emptyEnvelope();
      return validEnvelope(JSON.parse(readFileSync(this.filePath, 'utf8')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') this.legacyAbsent = true;
      else if (error instanceof SyntaxError) backupBadFile(this.filePath);
      return emptyEnvelope();
    }
  }

  private readLegacyAsync(): Promise<CacheEnvelope> {
    if (this.legacyAbsent) return Promise.resolve(emptyEnvelope());
    if (this.legacyLoadPromise) return this.legacyLoadPromise;
    const reading = (async () => {
      try {
        if ((await stat(this.filePath)).size > (this.options.maxDiskBytes ?? maxCacheBytes)) return emptyEnvelope();
        return validEnvelope(await parseJsonAsync(await readFile(this.filePath, 'utf8')));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') this.legacyAbsent = true;
        else if (error instanceof SyntaxError) await rename(this.filePath, `${this.filePath}.bad-${Date.now()}-${randomUUID()}`).catch(() => undefined);
        return emptyEnvelope();
      }
    })();
    const tracked = reading.finally(() => { if (this.legacyLoadPromise === tracked) this.legacyLoadPromise = null; });
    this.legacyLoadPromise = tracked;
    return tracked;
  }

  private readShard(key: string): CacheEntry | undefined {
    try {
      const path = this.shardPath(key);
      if (statSync(path).size > (this.options.maxDiskBytes ?? maxCacheBytes)) return undefined;
      return validShard(JSON.parse(readFileSync(path, 'utf8')), key);
    } catch { return undefined; }
  }

  private async readShardAsync(key: string): Promise<CacheEntry | undefined> {
    try {
      const path = this.shardPath(key);
      if ((await stat(path)).size > (this.options.maxDiskBytes ?? maxCacheBytes)) return undefined;
      return validShard(await parseJsonAsync(await readFile(path, 'utf8')), key);
    } catch { return undefined; }
  }

  private async pruneShardsAsync(directory: string): Promise<void> {
    const names = (await readdir(directory)).filter(name => name.endsWith('.json'));
    const files: DiskEntry[] = [];
    for (let index = 0; index < names.length; index += 32) {
      const entries = await Promise.all(names.slice(index, index + 32).map(async name => {
        const path = join(directory, name);
        try { const info = await stat(path); return {path, bytes: info.size, modified: info.mtimeMs, inode: info.ino}; }
        catch { return null; }
      }));
      files.push(...entries.filter((entry): entry is DiskEntry => entry !== null));
    }
    files.sort((left, right) => right.modified - left.modified);
    let totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
    while (files.length > (this.options.maxDiskEntries ?? maxCacheEntries) || totalBytes > (this.options.maxDiskBytes ?? maxCacheBytes)) {
      const file = files.pop();
      if (!file) break;
      try {
        const current = await stat(file.path);
        if (current.ino !== file.inode || current.mtimeMs !== file.modified || current.size !== file.bytes) continue;
        await unlink(file.path);
        totalBytes -= file.bytes;
      } catch { /* Another process may have refreshed or evicted the shard. */ }
    }
  }

  private pruneShards(directory: string): void {
    const files = readdirSync(directory).filter(name => name.endsWith('.json')).flatMap(name => {
      const path = join(directory, name);
      try { const info = statSync(path); return [{path, bytes: info.size, modified: info.mtimeMs}]; }
      catch { return []; }
    }).sort((left, right) => right.modified - left.modified);
    let totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
    while (files.length > (this.options.maxDiskEntries ?? maxCacheEntries) || totalBytes > (this.options.maxDiskBytes ?? maxCacheBytes)) {
      const file = files.pop();
      if (!file) break;
      try { unlinkSync(file.path); totalBytes -= file.bytes; } catch { /* Cache eviction is best-effort. */ }
    }
  }

  private shardDirectory(): string { return `${this.filePath}.d`; }
  private shardPath(key: string): string { return join(this.shardDirectory(), `${createHash('sha256').update(key).digest('hex')}.json`); }
}

function retainedBytes(serialized: string): number { return serialized.length * 2 + 128; }
function isLargeValue(value: unknown): boolean { return Array.isArray(value) && value.length >= 1000 || typeof value === 'string' && value.length >= 256 * 1024; }
function emptyEnvelope(): CacheEnvelope { return {version: 1, entries: Object.create(null) as Record<string, CacheEntry>}; }
function validEnvelope(value: unknown): CacheEnvelope {
  const envelope = value as Partial<CacheEnvelope> | null;
  if (envelope?.version !== 1 || !envelope.entries || typeof envelope.entries !== 'object' || Array.isArray(envelope.entries)) return emptyEnvelope();
  const entries: Record<string, CacheEntry> = Object.create(null) as Record<string, CacheEntry>;
  for (const [key, entry] of Object.entries(envelope.entries)) if (entry && Number.isFinite(entry.createdAt) && 'value' in entry) entries[key] = entry;
  return {version: 1, entries};
}
function validShard(value: unknown, key: string): CacheEntry | undefined {
  const entry = value as Partial<ShardedCacheEntry> | null;
  return entry?.version === 1 && entry.key === key && Number.isFinite(entry.createdAt) && 'value' in entry ? {createdAt: entry.createdAt!, value: entry.value} : undefined;
}
function newerEntry(legacy: CacheEntry | undefined, shard: CacheEntry | undefined): CacheEntry | undefined {
  const now = Date.now();
  if (legacy && !withinAge(legacy, Infinity, now)) legacy = undefined;
  if (shard && !withinAge(shard, Infinity, now)) shard = undefined;
  return shard && (!legacy || shard.createdAt >= legacy.createdAt) ? shard : legacy;
}
function withinAge(entry: CacheEntry, maxAgeMs: number, now = Date.now()): boolean {
  const age = now - entry.createdAt;
  return age >= -maxFutureClockSkewMs && Math.max(0, age) <= maxAgeMs;
}
function defaultProviderCachePath(): string {
  const {cache, legacyCache} = platformPaths();
  return existsSync(cache) || !existsSync(legacyCache) ? cache : legacyCache;
}
function writeAtomically(path: string, serialized: string): void {
  const temp = `${path}.tmp-${process.pid}-${randomUUID()}`;
  try { writeFileSync(temp, `${serialized}\n`, {encoding: 'utf8', mode: 0o600, flag: 'wx'}); renameSync(temp, path); }
  catch (error) { try { rmSync(temp, {force: true}); } catch {} throw error; }
}
function backupBadFile(path: string): void {
  try { renameSync(path, `${path}.bad-${Date.now()}-${randomUUID()}`); } catch { /* Cache data is recoverable. */ }
}
