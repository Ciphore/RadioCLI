import {chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {storageReadiness} from './storage.js';

const roots: string[] = [];
// Windows ACLs and a privileged POSIX user do not enforce these chmod fixtures.
const nativePermissions = process.platform !== 'win32' && process.getuid?.() !== 0;

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'radiocli storage café '));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true});
});

describe('storageReadiness', () => {
  it('checks the nearest existing parent without creating directories or files', () => {
    const root = fixture();
    const nested = join(root, 'new data', '音楽');

    expect(storageReadiness(join(nested, 'library.json')).status).toBe('available');
    expect(existsSync(nested)).toBe(false);
    expect(readdirSync(root)).toEqual([]);
  });

  it('reports a file in the parent chain without exposing its path', () => {
    const root = fixture();
    const obstacle = join(root, 'private account');
    writeFileSync(obstacle, 'not a directory');

    const result = storageReadiness(join(obstacle, 'new', 'library.json'));
    expect(result.status).toBe('unavailable');
    expect(result.message).toMatch(/RADIOCLI_HOME.*writable/i);
    expect(result.message).not.toContain(root);
    expect(readdirSync(root)).toEqual(['private account']);
  });

  it('does not consider an existing directory to be a writable library file', () => {
    const root = fixture();
    const file = join(root, 'library.json');
    mkdirSync(file);

    expect(storageReadiness(file).status).toBe('unavailable');
    expect(readdirSync(root)).toEqual(['library.json']);
  });

  it.skipIf(!nativePermissions)('reports a read-only nearest parent without creating a write probe', () => {
    const root = fixture();
    chmodSync(root, 0o500);
    try {
      const result = storageReadiness(join(root, 'new data', 'library.json'));
      expect(result.status).toBe('unavailable');
      expect(result.message).toMatch(/RADIOCLI_HOME.*writable/i);
      expect(result.message).not.toContain(root);
      expect(readdirSync(root)).toEqual([]);
    } finally {
      chmodSync(root, 0o700);
    }
  });

  it.skipIf(!nativePermissions)('reports a read-only file even when its parent is writable', () => {
    const root = fixture();
    const file = join(root, 'library.json');
    writeFileSync(file, '{}');
    chmodSync(file, 0o400);
    try {
      expect(storageReadiness(file).status).toBe('unavailable');
      expect(readdirSync(root)).toEqual(['library.json']);
    } finally {
      chmodSync(file, 0o600);
    }
  });

  it.skipIf(!nativePermissions)('reports inaccessible ancestors without treating the destination as missing', () => {
    const root = fixture();
    const parent = join(root, 'private');
    mkdirSync(parent);
    chmodSync(parent, 0);
    try {
      const result = storageReadiness(join(parent, 'new', 'library.json'));
      expect(result.status).toBe('unavailable');
      expect(result.message).not.toContain(root);
    } finally {
      chmodSync(parent, 0o700);
    }
  });
});
