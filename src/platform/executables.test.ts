import {chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {clearCommandCache, resolveCommandDetails} from './executables.js';

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  clearCommandCache();
  for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true});
});

describe('safe executable configuration and permissions', () => {
  it.each([
    ['freebsd', '/usr/local/bin/mpv'], ['openbsd', '/usr/local/bin/mpv'], ['netbsd', '/usr/pkg/bin/mpv'],
    ['sunos', '/opt/local/bin/mpv'], ['sunos', '/usr/pkg/bin/mpv'], ['haiku', '/boot/system/bin/mpv'],
    ['haiku', '/boot/home/config/bin/mpv'], ['haiku', '/boot/home/config/non-packaged/bin/mpv']
  ] as const)('finds the %s package prefix when an inherited PATH is incomplete', (platform, path) => {
    expect(resolveCommandDetails('mpv', {platform, env: {PATH: '/bin'}, home: '/boot/home', isRunnable: candidate => candidate === path})).toMatchObject({path, discovery: 'package-manager-shim'});
  });

  it.each(['android', 'linux'] as const)('finds native Termux commands using PREFIX on %s', platform => {
    const prefix = '/data/user/10/com.termux/files/usr';
    const path = `${prefix}/bin/mpv`;
    expect(resolveCommandDetails('mpv', {platform, env: {PATH: '/system/bin', PREFIX: prefix}, isRunnable: candidate => candidate === path})).toEqual({path, discovery: 'package-manager-shim'});
  });

  it('prefers the inherited PATH to the Termux prefix', () => {
    const path = '/private/player/bin/mpv';
    expect(resolveCommandDetails('mpv', {platform: 'android', env: {PATH: '/private/player/bin', TERMUX_VERSION: '0.118.3', PREFIX: '/data/data/com.termux/files/usr'},
      isRunnable: candidate => [path, '/data/data/com.termux/files/usr/bin/mpv'].includes(candidate)})).toEqual({path, discovery: 'path'});
  });

  it.each([undefined, 'relative/usr', '/data/data/com.termux/files/usr\n'])('does not guess a Termux prefix from %s or fall back to glibc paths', prefix => {
    expect(resolveCommandDetails('mpv', {platform: 'android', env: {TERMUX_VERSION: '0.118.3', PREFIX: prefix}, isRunnable: () => true})).toEqual({path: null, discovery: 'missing'});
  });

  it('ignores an unrelated PREFIX on ordinary Linux', () => {
    expect(resolveCommandDetails('mpv', {platform: 'linux', env: {PREFIX: '/opt/custom'}, isRunnable: candidate => candidate === '/opt/custom/bin/mpv'})).toEqual({path: null, discovery: 'missing'});
  });

  it('finds an installed AIX Toolbox executable without inferring playback package availability', () => {
    const path = '/opt/freeware/bin/python3';
    expect(resolveCommandDetails('python3', {platform: 'aix', env: {PATH: '/usr/bin'}, isRunnable: candidate => candidate === path})).toEqual({path, discovery: 'package-manager-shim'});
  });
  it('treats a configured path with spaces and Unicode as a single executable', () => {
    const path = '/opt/Radio 日本/player mpv';
    expect(resolveCommandDetails('mpv', {platform: 'linux', env: {PATH: '/usr/bin', RADIOCLI_MPV_PATH: path}, isRunnable: candidate => candidate === path})).toEqual({path, discovery: 'configured-path'});
  });

  it('never falls back silently from a broken explicit player configuration', () => {
    const result = resolveCommandDetails('mpv', {platform: 'linux', env: {RADIOCLI_MPV_PATH: '/missing/mpv'}, isRunnable: path => path === '/usr/bin/mpv'});
    expect(result).toMatchObject({path: null, discovery: 'configured-path', error: expect.stringContaining('RADIOCLI_MPV_PATH')});
    expect(resolveCommandDetails('mpv', {platform: 'linux', env: {RADIOCLI_MPV_PATH: 'mpv --script=untrusted'}, isRunnable: () => true}).path).toBeNull();
  });

  it('rejects shell scripts as configured Windows player commands', () => {
    expect(resolveCommandDetails('mpv', {platform: 'win32', env: {RADIOCLI_MPV_PATH: 'C:\\Tools\\mpv.cmd'}, isRunnable: () => true}).path).toBeNull();
    expect(resolveCommandDetails('mpv', {platform: 'win32', env: {RADIOCLI_MPV_PATH: 'D:\\Tools 日本\\mpv.exe'}, isRunnable: () => true})).toMatchObject({path: 'D:\\Tools 日本\\mpv.exe', discovery: 'configured-path'});
  });

  it('does not call an executable directory a runnable file', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-executable-'));
    roots.push(root);
    const directory = join(root, 'mpv');
    mkdirSync(directory);
    expect(resolveCommandDetails(directory).path).toBeNull();
  });

  it('finds a runnable agent command on the supplied PATH', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-executable-'));
    roots.push(root);
    const path = join(root, `radiocli-test-command${process.platform === 'win32' ? '.exe' : ''}`);
    writeFileSync(path, 'test', {mode: 0o700});
    expect(resolveCommandDetails('radiocli-test-command', {env: {PATH: root}, platform: process.platform}).path).toBe(path);
  });

  it.skipIf(process.platform === 'win32')('honors POSIX executable permission and environment changes without a stale cache', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-executable-'));
    roots.push(root);
    const path = join(root, 'player 日本');
    writeFileSync(path, '#!/bin/sh\nexit 0\n', {mode: 0o600});
    vi.stubEnv('RADIOCLI_MPV_PATH', path);
    expect(resolveCommandDetails('mpv').path).toBeNull();
    chmodSync(path, 0o700);
    clearCommandCache();
    expect(resolveCommandDetails('mpv').path).toBe(path);
    vi.stubEnv('RADIOCLI_MPV_PATH', `${path}-missing`);
    expect(resolveCommandDetails('mpv').path).toBeNull();
  });
});
