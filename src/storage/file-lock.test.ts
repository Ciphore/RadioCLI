import * as fs from 'node:fs';
import {mkdtempSync, mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {acquireFileLock} from './file-lock.js';

vi.mock('node:fs', async original => ({...await original<typeof import('node:fs')>()}));
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true}); });
function fixture() { const root = mkdtempSync(join(tmpdir(), 'radiocli-lock-')); roots.push(root); return join(root, 'library.lock'); }

describe('library writer ownership', () => {
  it('releases its marker after a partial owner-marker write fails', () => {
    const directory = fixture();
    const write = fs.writeFileSync;
    vi.spyOn(fs, 'writeFileSync').mockImplementationOnce((...args) => {
      write(...args);
      throw Object.assign(new Error('full disk'), {code: 'ENOSPC'});
    });
    expect(() => acquireFileLock(directory)).toThrow(expect.objectContaining({code: 'ENOSPC'}));
    expect(fs.existsSync(directory)).toBe(false);
    acquireFileLock(directory)();
  });

  it('never expires a live writer, even after clock changes or a long suspension', () => {
    const directory = fixture(); const release = acquireFileLock(directory);
    const original = readdirSync(directory);
    utimesSync(directory, new Date(0), new Date(0));
    expect(() => acquireFileLock(directory, 20)).toThrow(expect.objectContaining({code: 'EBUSY'}));
    expect(readdirSync(directory)).toEqual(original);
    release();
    const next = acquireFileLock(directory); const replacement = readdirSync(directory);
    release(); // An old release must not remove a later owner's lock.
    expect(readdirSync(directory)).toEqual(replacement);
    next();
  });

  it.each(['', 'unknown-owner', 'owner-999999999999999999999-123'])('leaves unknown/legacy ownership intact (%s)', marker => {
    const directory = fixture(); mkdirSync(directory);
    if (marker) writeFileSync(join(directory, marker), '');
    utimesSync(directory, new Date(0), new Date(0));
    expect(() => acquireFileLock(directory, 20)).toThrow(expect.objectContaining({code: 'EBUSY'}));
    expect(readdirSync(directory)).toEqual(marker ? [marker] : []);
  });

  it.each(['ESRCH', 'EPERM', 'EINVAL'])('reclaims only a positively dead owner (%s)', code => {
    const directory = fixture(); mkdirSync(directory);
    const owner = `owner-12345-${randomUUID()}`; writeFileSync(join(directory, owner), '');
    vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error('probe'), {code}); });
    if (code === 'ESRCH') { const release = acquireFileLock(directory); expect(readdirSync(directory)).not.toContain(owner); release(); }
    else { expect(() => acquireFileLock(directory, 20)).toThrow(expect.objectContaining({code: 'EBUSY'})); expect(readdirSync(directory)).toEqual([owner]); }
  });

  it('recovers a released generation after cleanup failure while its PID is still alive', () => {
    const directory = fixture(); const release = acquireFileLock(directory);
    const unlink = vi.spyOn(fs, 'unlinkSync').mockImplementationOnce(() => { throw Object.assign(new Error('busy'), {code: 'EACCES'}); });
    release(); unlink.mockRestore();
    expect(readdirSync(directory)[0]).toMatch(/^released-/);
    // This is an ownership assertion, not a sub-30ms filesystem benchmark.
    acquireFileLock(directory)();
    expect(fs.existsSync(directory)).toBe(false);
  });

  it('cannot reap a replacement generation after inspecting a dead owner', () => {
    const directory = fixture(); mkdirSync(directory);
    const dead = `owner-12345-${randomUUID()}`; writeFileSync(join(directory, dead), '');
    const alive = `owner-${process.pid}-${randomUUID()}`;
    vi.spyOn(process, 'kill').mockImplementation(pid => {
      if (pid === 12345) { fs.unlinkSync(join(directory, dead)); writeFileSync(join(directory, alive), ''); throw Object.assign(new Error('dead'), {code: 'ESRCH'}); }
      return true;
    });
    expect(() => acquireFileLock(directory, 20)).toThrow(expect.objectContaining({code: 'EBUSY'}));
    expect(readdirSync(directory)).toEqual([alive]);
  });
});
