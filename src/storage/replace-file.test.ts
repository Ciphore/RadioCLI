import * as fs from 'node:fs';
import {mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {replaceFileSync} from './replace-file.js';

vi.mock('node:fs', async importOriginal => ({...await importOriginal<typeof import('node:fs')>()}));

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true});
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'radiocli replace 日本 '));
  roots.push(root);
  const source = join(root, 'pending.json');
  const destination = join(root, 'library.json');
  writeFileSync(source, 'new library');
  writeFileSync(destination, 'saved library');
  return {root, source, destination};
}

describe('Windows atomic file replacement', () => {
  it.each(['EPERM', 'EACCES', 'EBUSY'])('retains saved bytes during a transient %s and then commits', code => {
    const {root, source, destination} = fixture();
    const rename = fs.renameSync;
    let attempts = 0;
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      expect(readFileSync(destination, 'utf8')).toBe('saved library');
      if (++attempts <= 2) throw Object.assign(new Error('temporarily locked'), {code});
      return rename(from, to);
    });
    const wait = vi.spyOn(Atomics, 'wait').mockReturnValue('timed-out');
    replaceFileSync(source, destination, 'win32');
    expect(attempts).toBe(3);
    expect(wait.mock.calls.map(call => call[3])).toEqual([10, 20]);
    expect(readFileSync(destination, 'utf8')).toBe('new library');
    expect(readdirSync(root)).toEqual(['library.json']);
  });

  it('bounds persistent denial and leaves both files intact for caller cleanup', () => {
    const {source, destination} = fixture();
    const failure = Object.assign(new Error('permanently denied'), {code: 'EPERM'});
    const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw failure; });
    const wait = vi.spyOn(Atomics, 'wait').mockReturnValue('timed-out');
    expect(() => replaceFileSync(source, destination, 'win32')).toThrow(failure);
    expect(rename).toHaveBeenCalledTimes(11);
    expect(wait.mock.calls.reduce((sum, call) => sum + (call[3] ?? 0), 0)).toBe(550);
    expect(readFileSync(destination, 'utf8')).toBe('saved library');
    expect(readFileSync(source, 'utf8')).toBe('new library');
  });

  it.each([['linux', 'EPERM'], ['darwin', 'EACCES'], ['win32', 'ENOSPC'], ['win32', 'EIO']] as const)(
    'immediately reports %s %s without retrying', (platform, code) => {
      const {source, destination} = fixture();
      const failure = Object.assign(new Error('write failed'), {code});
      const rename = vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw failure; });
      const wait = vi.spyOn(Atomics, 'wait').mockReturnValue('timed-out');
      expect(() => replaceFileSync(source, destination, platform)).toThrow(failure);
      expect(rename).toHaveBeenCalledTimes(1);
      expect(wait).not.toHaveBeenCalled();
      expect(readFileSync(destination, 'utf8')).toBe('saved library');
    }
  );
});
