import {mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {planMpvDesktopMedia} from './mpv-desktop-media.js';

let root: string;
let system: string;
let user: string;
let stock: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'radiocli-mpv-media-'));
  system = join(root, 'system'); user = join(root, 'user'); stock = join(root, 'stock', 'mpris.so');
  mkdirSync(join(system, 'scripts'), {recursive: true});
  mkdirSync(join(user, 'scripts'), {recursive: true});
  mkdirSync(join(root, 'stock')); writeFileSync(stock, 'stock plugin fixture');
});
afterEach(() => rmSync(root, {recursive: true, force: true}));

const plan = () => planMpvDesktopMedia({platform: 'linux', env: {}, configDirectories: [system, user], stockMprisPath: stock});
function script(directory: string, name: string): string { const path = join(directory, 'scripts', name); writeFileSync(path, 'script fixture'); return path; }
// Windows symlink creation depends on Developer Mode. Real POSIX symlink
// behavior is exercised on every macOS/Linux job, never emulated on Windows.
function stockLink() { symlinkSync(stock, join(system, 'scripts', 'mpris.so')); }

describe('per-process mpv desktop media coexistence', () => {
  it.each(['darwin', 'win32', 'freebsd', 'android'] as const)('does not inspect or rewrite %s playback', platform => {
    expect(planMpvDesktopMedia({platform})).toMatchObject({status: 'unsupported', args: []});
  });

  it('keeps original mpv arguments when no media plugin is installed', () => {
    script(user, 'custom.lua');
    expect(plan()).toMatchObject({status: 'compatible', args: []});
  });

  it.skipIf(process.platform === 'win32')('omits only stock MPRIS while preserving normal script order, literal paths and config', () => {
    stockLink();
    const alpha = script(system, 'a.lua'); const beta = script(system, 'B.js');
    const unicode = script(user, '日本語 space,colon:quote\".lua');
    const directoryScript = join(user, 'scripts', 'bundle'); mkdirSync(directoryScript); writeFileSync(join(directoryScript, 'main.lua'), 'bundle');
    script(user, '.hidden.lua');
    const config = 'ao=pipewire,pulse\nvolume=31\nscript-opts=custom-option=value\n';
    writeFileSync(join(user, 'mpv.conf'), config);
    expect(plan()).toMatchObject({status: 'compatible', args: ['--load-scripts=no', `--script=${alpha}`, `--script=${beta}`, `--script=${directoryScript}`, `--script=${unicode}`]});
    expect(readFileSync(join(user, 'mpv.conf'), 'utf8')).toBe(config);
    expect(readFileSync(stock, 'utf8')).toBe('stock plugin fixture');
  });

  it.skipIf(process.platform === 'win32')('honors disabled autoload without enabling any user script', () => {
    stockLink(); script(user, 'custom.lua'); writeFileSync(join(user, 'mpv.conf'), 'load-scripts=no # intentional\n');
    expect(plan()).toMatchObject({status: 'compatible', args: []});
  });

  it.skipIf(process.platform === 'win32')('applies ordinary config precedence before selecting scripts', () => {
    stockLink(); writeFileSync(join(system, 'mpv.conf'), 'load-scripts=no\n'); writeFileSync(join(user, 'mpv.conf'), 'load-scripts=yes\n');
    expect(plan()).toMatchObject({status: 'compatible', args: ['--load-scripts=no']});
  });

  it.each([
    'include=other.conf', 'script=custom.lua', 'scripts-append=other.lua',
    '[custom]\nload-scripts=no', 'load-scripts="no"',
    'config=no', 'use-filedir-conf=yes'
  ])('preserves ambiguous custom config %s instead of overriding it', text => {
    writeFileSync(join(user, 'mpv.conf'), text);
    expect(plan()).toMatchObject({status: 'unsupported', args: []});
    expect(readFileSync(join(user, 'mpv.conf'), 'utf8')).toBe(text);
  });

  it('checks legacy config and encoding profiles as well as mpv.conf', () => {
    writeFileSync(join(system, 'encoding-profiles.conf'), '[custom]\nscript=mpris.so');
    expect(plan().status).toBe('unsupported');
    rmSync(join(system, 'encoding-profiles.conf'));
    writeFileSync(join(user, 'config'), 'include=legacy.conf');
    expect(plan().status).toBe('unsupported');
  });

  it('preserves ordinary profiles such as the bundled encoding profiles', () => {
    writeFileSync(join(system, 'encoding-profiles.conf'), '[enc-a]\noac=opus\n[enc-file]\nprofile=enc-a\n');
    writeFileSync(join(user, 'mpv.conf'), '[quiet]\nvolume=30\n[default]\nprofile=quiet\n');
    expect(plan()).toMatchObject({status: 'compatible', args: []});
  });

  it.each(['mpris.so', 'mpv-mpris.lua', 'mpris'])('leaves a custom media plugin %s intact', name => {
    script(user, name);
    expect(plan()).toMatchObject({status: 'unsupported', args: []});
  });

  it('fails closed on excessive config and script counts', () => {
    writeFileSync(join(user, 'mpv.conf'), 'x'.repeat(256 * 1024 + 1));
    expect(plan().status).toBe('unsupported');
    rmSync(join(user, 'mpv.conf'));
    for (let i = 0; i < 257; i++) script(user, `${i}.lua`);
    expect(plan().status).toBe('unsupported');
  });

  it('does not guess a custom executable configuration layout', () => {
    expect(planMpvDesktopMedia({platform: 'linux', executable: '/custom/bin/mpv', env: {}})).toMatchObject({status: 'unsupported', args: []});
  });

  it.skipIf(process.platform === 'win32')('respects MPV_HOME isolation, including explicit empty config', () => {
    script(user, 'custom.lua');
    expect(planMpvDesktopMedia({platform: 'linux', env: {MPV_HOME: ''}})).toMatchObject({status: 'compatible', args: []});
    expect(planMpvDesktopMedia({platform: 'linux', env: {MPV_HOME: user}})).toMatchObject({status: 'compatible', args: []});
    expect(planMpvDesktopMedia({platform: 'linux', env: {MPV_HOME: 'relative'}}).status).toBe('unsupported');
  });
});
