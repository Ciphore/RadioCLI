import {chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {platformPaths} from '../platform/paths.js';
import {join} from 'node:path';

type CacheEnvelope = {
  version: 1;
  entries: Record<string, {createdAt: number; value: unknown}>;
};

type ShardedCacheEntry = {version: 1; key: string; createdAt: number; value: unknown};

const maxCacheEntries = 256;
const maxCacheBytes = 128 * 1024 * 1024;

export class ProviderCache {
  private cache: CacheEnvelope;
  private writesSincePrune = 0;

  constructor(readonly filePath = defaultProviderCachePath()) {
    this.cache = this.read();
  }

  get<T>(key: string, maxAgeMs: number): T | null {
    const entry = this.cache.entries[key] ?? this.readShard(key);
    if (!entry) {
      return null;
    }

    if (Date.now() - entry.createdAt > maxAgeMs) {
      return null;
    }

    return entry.value as T;
  }

  getStale<T>(key: string, maxAgeMs = 30 * 24 * 60 * 60 * 1000): T | null {
    const entry = this.cache.entries[key] ?? this.readShard(key);
    return entry && Date.now() - entry.createdAt <= maxAgeMs ? (entry.value as T) : null;
  }

  set(key: string, value: unknown): void {
    this.cache.entries[key] = {createdAt: Date.now(), value};
    this.writeEntry(key, this.cache.entries[key]!);
  }

  private read(): CacheEnvelope {
    if (!existsSync(this.filePath)) {
      return {version: 1, entries: {}};
    }

    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as CacheEnvelope;
      return parsed.version === 1 && parsed.entries ? parsed : {version: 1 as const, entries: {}};
    } catch {
      backupBadFile(this.filePath);
      return {version: 1, entries: {}};
    }
  }

  private readShard(key: string): CacheEnvelope['entries'][string] | undefined {
    const path = join(this.shardDirectory(), `${createHash('sha256').update(key).digest('hex')}.json`);
    if (!existsSync(path)) return undefined;
    try {
      const entry = JSON.parse(readFileSync(path, 'utf8')) as ShardedCacheEntry;
      if (entry.version !== 1 || entry.key !== key || !Number.isFinite(entry.createdAt)) return undefined;
      const cached = {createdAt: entry.createdAt, value: entry.value};
      this.cache.entries[key] = cached;
      return cached;
    } catch {
      return undefined;
    }
  }

  private writeEntry(key: string, entry: {createdAt: number; value: unknown}): void {
    const directory = this.shardDirectory();
    mkdirSync(directory, {recursive: true, mode: 0o700});
    const path = join(directory, `${createHash('sha256').update(key).digest('hex')}.json`);
    writeJsonAtomically(path, {version: 1, key, ...entry} satisfies ShardedCacheEntry);
    this.writesSincePrune += 1;
    if (this.writesSincePrune >= 16) {
      this.writesSincePrune = 0;
      this.pruneShards(directory);
    }
  }

  private pruneShards(directory: string): void {
    const files = readdirSync(directory)
      .filter(name => name.endsWith('.json'))
      .flatMap(name => {
        try {
          const path = join(directory, name);
          const stat = statSync(path);
          return [{path, bytes: stat.size, modified: stat.mtimeMs}];
        } catch {
          return [];
        }
      })
      .sort((left, right) => right.modified - left.modified);
    let totalBytes = files.reduce((total, file) => total + file.bytes, 0);
    while (files.length > maxCacheEntries || totalBytes > maxCacheBytes) {
      const file = files.pop();
      if (!file) break;
      try {
        unlinkSync(file.path);
        totalBytes -= file.bytes;
      } catch {
        // Cache eviction is best-effort.
      }
    }
  }

  private shardDirectory(): string {
    return `${this.filePath}.d`;
  }
}

function defaultProviderCachePath(): string {
  const {cache, legacyCache} = platformPaths();
  return existsSync(cache) || !existsSync(legacyCache) ? cache : legacyCache;
}

function writeJsonAtomically(filePath: string, value: unknown): void {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tempPath, `${JSON.stringify(value)}\n`, {encoding: 'utf8', mode: 0o600});
    renameSync(tempPath, filePath);
    if (process.platform !== 'win32') {
      chmodSync(filePath, 0o600);
    }
  } catch (error) {
    rmSync(tempPath, {force: true});
    throw error;
  }
}

function backupBadFile(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  const backupPath = `${filePath}.bad-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  try {
    renameSync(filePath, backupPath);
  } catch {
    // If backup fails, leave the original in place and continue with defaults in memory.
  }
}
