import * as fs from 'node:fs';
import {mkdtempSync, mkdirSync, readdirSync, rmSync, utimesSync, writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {acquireFileLock} from './file-lock.js';

vi.mock('node:fs', async original => ({...await original<typeof import('node:fs')>()}));
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true}); });
function fixture() { const root = mkdtempSync(join(tmpdir(), 'radiocli-lock-')); roots.push(root); return join(root, 'library.lock'); }
function simulatedWait() {
  let elapsed = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
  return vi.spyOn(Atomics, 'wait').mockImplementation((_array, _index, _value, timeout) => {
    elapsed += timeout ?? 0;
    return 'timed-out';
  });
}

describe('library writer ownership', () => {
  for (const operation of ['mkdirSync', 'readdirSync'] as const) {
    it.each(['EPERM', 'EACCES', 'EBUSY'])(`retries transient Windows %s during ${operation} before taking ownership`, code => {
      const directory = fixture();
      if (operation === 'readdirSync') mkdirSync(directory);
      const failure = Object.assign(new Error('previous directory is pending deletion'), {code});
      const attempt = vi.spyOn(fs, operation)
        .mockImplementationOnce(() => { throw failure; })
        .mockImplementationOnce(() => { throw failure; });
      if (operation === 'readdirSync') attempt.mockImplementationOnce(() => {
        // The other writer finishes releasing its legacy lock between retries.
        rmSync(directory, {recursive: true});
        return [];
      });
      const wait = simulatedWait();
      const release = acquireFileLock(directory, undefined, 'win32');
      expect(attempt).toHaveBeenCalledTimes(3);
      expect(wait).toHaveBeenCalled();
      expect(readdirSync(directory)).toHaveLength(1);
      expect(readdirSync(directory)[0]).toMatch(new RegExp(`^owner-${process.pid}-`));
      release();
      expect(fs.existsSync(directory)).toBe(false);
    });

    it.each(['EPERM', 'EACCES', 'EBUSY'])(`preserves persistent Windows %s from ${operation} at the original deadline`, code => {
      const directory = fixture();
      const owner = `owner-${process.pid}-${randomUUID()}`;
      if (operation === 'readdirSync') { mkdirSync(directory); writeFileSync(join(directory, owner), ''); }
      const failure = Object.assign(new Error('permission denied'), {code});
      const attempt = vi.spyOn(fs, operation).mockImplementation(() => { throw failure; });
      const wait = simulatedWait();
      let reported: unknown;
      try { acquireFileLock(directory, undefined, 'win32'); } catch (error) { reported = error; }
      expect(reported).toBe(failure);
      expect(attempt).toHaveBeenCalledTimes(101);
      expect(wait.mock.calls.reduce((total, call) => total + (call[3] ?? 0), 0)).toBe(1000);
      attempt.mockRestore();
      if (operation === 'readdirSync') expect(readdirSync(directory)).toEqual([owner]);
      else expect(fs.existsSync(directory)).toBe(false);
    });

    it.each([['linux', 'EPERM'], ['darwin', 'EACCES'], ['win32', 'EIO'], ['win32', 'ENOSPC']] as const)(
      `immediately reports %s %s from ${operation}`, (platform, code) => {
        const directory = fixture();
        if (operation === 'readdirSync') mkdirSync(directory);
        const failure = Object.assign(new Error('filesystem failure'), {code});
        const attempt = vi.spyOn(fs, operation).mockImplementation(() => { throw failure; });
        const wait = simulatedWait();
        expect(() => acquireFileLock(directory, undefined, platform)).toThrow(failure);
        expect(attempt).toHaveBeenCalledTimes(1);
        expect(wait).not.toHaveBeenCalled();
      }
    );
  }

  it('does not retry Windows owner-marker failures after creating the directory', () => {
    const directory = fixture();
    const failure = Object.assign(new Error('marker denied'), {code: 'EPERM'});
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw failure; });
    const wait = simulatedWait();
    expect(() => acquireFileLock(directory, undefined, 'win32')).toThrow(failure);
    expect(write).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
    expect(fs.existsSync(directory)).toBe(false);
  });

  it('still protects a live owner after transient Windows inspection denial', () => {
    const directory = fixture(); const release = acquireFileLock(directory);
    const original = readdirSync(directory);
    vi.spyOn(fs, 'readdirSync').mockImplementationOnce(() => { throw Object.assign(new Error('pending access'), {code: 'EPERM'}); });
    simulatedWait();
    expect(() => acquireFileLock(directory, 20, 'win32')).toThrow(expect.objectContaining({code: 'EBUSY'}));
    expect(readdirSync(directory)).toEqual(original);
    release();
  });

  it('rechecks ownership after a Windows denial while claiming a dead generation', () => {
    const directory = fixture(); mkdirSync(directory);
    const dead = `owner-12345-${randomUUID()}`;
    const alive = `owner-${process.pid}-${randomUUID()}`;
    writeFileSync(join(directory, dead), '');
    vi.spyOn(process, 'kill').mockImplementation(pid => {
      if (pid === 12345) throw Object.assign(new Error('dead'), {code: 'ESRCH'});
      return true;
    });
    const rename = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      fs.unlinkSync(join(directory, dead));
      writeFileSync(join(directory, alive), '');
      throw Object.assign(new Error('pending access'), {code: 'EPERM'});
    });
    simulatedWait();
    expect(() => acquireFileLock(directory, 20, 'win32')).toThrow(expect.objectContaining({code: 'EBUSY'}));
    expect(rename).toHaveBeenCalledTimes(1);
    expect(readdirSync(directory)).toEqual([alive]);
  });

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
