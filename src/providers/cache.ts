import {existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';

type CacheEnvelope = {
  version: 1;
  entries: Record<string, {createdAt: number; value: unknown}>;
};

export class ProviderCache {
  private cache: CacheEnvelope;

  constructor(readonly filePath = defaultProviderCachePath()) {
    this.cache = this.read();
  }

  get<T>(key: string, maxAgeMs: number): T | null {
    const entry = this.cache.entries[key];
    if (!entry) {
      return null;
    }

    if (Date.now() - entry.createdAt > maxAgeMs) {
      return null;
    }

    return structuredClone(entry.value) as T;
  }

  getStale<T>(key: string): T | null {
    const entry = this.cache.entries[key];
    return entry ? (structuredClone(entry.value) as T) : null;
  }

  set(key: string, value: unknown): void {
    this.cache.entries[key] = {createdAt: Date.now(), value};
    this.write();
  }

  private read(): CacheEnvelope {
    if (!existsSync(this.filePath)) {
      return {version: 1, entries: {}};
    }

    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as CacheEnvelope;
      return parsed.version === 1 && parsed.entries ? parsed : {version: 1, entries: {}};
    } catch {
      backupBadFile(this.filePath);
      return {version: 1, entries: {}};
    }
  }

  private write(): void {
    mkdirSync(dirname(this.filePath), {recursive: true});
    writeJsonAtomically(this.filePath, this.cache);
  }
}

function defaultProviderCachePath(): string {
  if (process.env.RADIO_ATLAS_HOME) {
    return join(process.env.RADIO_ATLAS_HOME, 'radio-atlas-cache.json');
  }

  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'radio-atlas', 'radio-atlas-cache.json');
  }

  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'radio-atlas', 'radio-atlas-cache.json');
}

function writeJsonAtomically(filePath: string, value: unknown): void {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    renameSync(tempPath, filePath);
  } catch (error) {
    rmSync(tempPath, {force: true});
    throw error;
  }
}

export function backupBadFile(filePath: string): void {
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
