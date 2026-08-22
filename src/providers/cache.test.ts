import {mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {ProviderCache} from './cache.js';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, {recursive: true, force: true});
  }
});

describe('ProviderCache', () => {
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
});

function temporaryCachePath(): string {
  const root = mkdtempSync(join(tmpdir(), 'radiocli-cache-'));
  temporaryRoots.push(root);
  return join(root, 'cache.json');
}
