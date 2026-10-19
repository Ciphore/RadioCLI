import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as backendInstall from './player/backend-install.js';
import {runSetup, parseSetupArgs} from './setup.js';
import {JsonLibraryStore} from './storage/store.js';
import type {AirPlayReadiness} from './player/airplay-readiness.js';

vi.mock('./agent/mcp-install.js', () => ({configureMcpIntegrations: vi.fn(async () => [])}));
vi.mock('./setup-playback.js', () => ({verifyLocalPlayback: vi.fn(async () => [])}));

const ready: AirPlayReadiness = {eligible: true, discoveryExecutable: true, discoveryService: 'ready', senderLoaded: true, ffmpeg: true, ready: true, message: 'Ready.'};
let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'radiocli-setup-airplay-'));
  vi.stubEnv('HOME', directory);
  vi.stubEnv('RADIOCLI_HOME', directory);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); rmSync(directory, {recursive: true, force: true}); });

function fixture(overrides: Partial<Parameters<typeof runSetup>[0]> = {}) {
  const output = new PassThrough();
  let text = '';
  output.on('data', chunk => { text += String(chunk); });
  const runCommand = vi.fn(async () => undefined);
  const probeAirPlay = vi.fn(async () => ready);
  const saveLinuxAirPlayEnabled = vi.fn();
  const options = {platform: 'linux' as const, osRelease: 'ID=arch', env: {HOME: directory, RADIOCLI_HOME: directory},
    args: ['--yes', '--airplay'], input: new PassThrough(), output,
    hasCommand: (_command: string) => true, getUid: () => 0, isSystemd: () => true,
    runCommand, probeAirPlay, saveLinuxAirPlayEnabled, ...overrides};
  return {options, runCommand, probeAirPlay, saveLinuxAirPlayEnabled, text: () => text};
}

describe('explicit Linux AirPlay setup', () => {
  it('parses both choices and rejects contradictory flags', () => {
    expect(parseSetupArgs(['--airplay'])).toMatchObject({airplay: true});
    expect(parseSetupArgs(['--no-airplay'])).toMatchObject({airplay: false});
    expect(() => parseSetupArgs(['--airplay', '--no-airplay'])).toThrow('either --airplay or --no-airplay');
  });
  it.each([['--yes'], ['--all', '--yes'], ['--only=mpv', '--yes']])('does not opt in or reset saved choice with %j', async (...args) => {
    const current = new JsonLibraryStore(join(directory, 'radiocli.json'));
    current.updateSettings({linuxAirPlayEnabled: true});
    const before = readFileSync(current.filePath, 'utf8');
    const {options, probeAirPlay, saveLinuxAirPlayEnabled, runCommand} = fixture({args});
    await runSetup(options);
    expect(saveLinuxAirPlayEnabled).not.toHaveBeenCalled();
    expect(probeAirPlay).not.toHaveBeenCalled();
    expect(runCommand).not.toHaveBeenCalled();
    expect(readFileSync(current.filePath, 'utf8')).toBe(before);
  });
  it.each([
    {manager: 'apt', osRelease: 'ID=debian', uid: 0, helpers: [] as string[], expected: ['apt-get install -y ffmpeg', 'apt-get install -y avahi-daemon avahi-utils', 'systemctl enable --now avahi-daemon.service']},
    {manager: 'pacman', osRelease: 'ID=arch', uid: 1000, helpers: ['sudo'], expected: ['sudo pacman -S --needed --noconfirm ffmpeg', 'sudo pacman -S --needed --noconfirm avahi', 'sudo systemctl enable --now avahi-daemon.service']},
    {manager: 'apt', osRelease: 'ID=debian', uid: 1000, helpers: ['doas'], expected: ['doas apt-get install -y ffmpeg', 'doas apt-get install -y avahi-daemon avahi-utils', 'doas systemctl enable --now avahi-daemon.service']}
  ])('reviews and executes verified $manager packages and shared service with uid $uid', async ({manager, osRelease, uid, helpers, expected}) => {
    const {options, runCommand, saveLinuxAirPlayEnabled, probeAirPlay, text} = fixture({osRelease, args: ['--yes', '--only=mpv', '--airplay', `--package-manager=${manager}`],
      getUid: () => uid, hasCommand: command => ['mpv', manager, 'systemctl', ...helpers].includes(command),
      probeAirPlay: vi.fn(async (loadSender: boolean): Promise<AirPlayReadiness> => loadSender ? ready : {...ready, discoveryService: 'unavailable'})});
    await runSetup(options);
    expect(runCommand.mock.calls.map(call => (call as unknown as [{display: string}])[0].display)).toEqual(expected);
    for (const command of expected) expect(text()).toContain(command);
    expect(text()).toContain('whole machine');
    expect(saveLinuxAirPlayEnabled).toHaveBeenCalledWith(true);
    expect(options.probeAirPlay).toHaveBeenCalledWith(false);
    expect(options.probeAirPlay).toHaveBeenCalledWith(true);
    expect(probeAirPlay).not.toHaveBeenCalled();
  });
  it.each([true, false])('dry-run choice %s has no settings, sender, service or installer side effects', async enabled => {
    const {options, probeAirPlay, runCommand, saveLinuxAirPlayEnabled, text} = fixture({args: ['--dry-run', enabled ? '--airplay' : '--no-airplay'], hasCommand: command => ['mpv', 'pacman', 'systemctl'].includes(command)});
    await runSetup(options);
    expect(text()).toContain('Dry run complete');
    expect(probeAirPlay).not.toHaveBeenCalled();
    expect(runCommand).not.toHaveBeenCalled();
    expect(saveLinuxAirPlayEnabled).not.toHaveBeenCalled();
    expect(existsSync(join(directory, 'radiocli.json'))).toBe(false);
  });
  it('requires approval even when all tools and the service are ready', async () => {
    const {options, runCommand, saveLinuxAirPlayEnabled} = fixture({args: ['--airplay']});
    await expect(runSetup(options)).rejects.toThrow('Use --yes');
    expect(runCommand).not.toHaveBeenCalled();
    expect(saveLinuxAirPlayEnabled).not.toHaveBeenCalled();
  });
  it('cancellation never saves consent or invokes a displayed service action', async () => {
    const {options, saveLinuxAirPlayEnabled, runCommand} = fixture({args: ['--airplay', '--only=mpv'], input: Object.assign(new PassThrough(), {isTTY: true}), output: Object.assign(new PassThrough(), {isTTY: true}), prompt: vi.fn(async () => false)});
    await runSetup(options);
    expect(runCommand).not.toHaveBeenCalled();
    expect(saveLinuxAirPlayEnabled).not.toHaveBeenCalled();
  });
  it.each(['install', 'service'])('does not persist opt-in after %s failure', async failure => {
    const {options, saveLinuxAirPlayEnabled, text} = fixture({hasCommand: command => failure === 'install' ? ['mpv', 'pacman', 'systemctl'].includes(command) : true,
      probeAirPlay: async () => ({...ready, discoveryService: 'unavailable'}),
      runCommand: async () => { throw new Error(`${failure} failed`); }});
    await expect(runSetup(options)).rejects.toThrow(`${failure} failed`);
    expect(saveLinuxAirPlayEnabled).not.toHaveBeenCalled();
    expect(text()).not.toContain('Setup complete.');
  });
  it('reports missing native sender separately from successfully installed prerequisites', async () => {
    const {options, text, saveLinuxAirPlayEnabled} = fixture({probeAirPlay: async () => ({...ready, senderLoaded: false, ready: false, message: 'The optional AirPlay sender could not load.'})});
    await runSetup(options);
    expect(saveLinuxAirPlayEnabled).toHaveBeenCalledWith(true);
    expect(text()).toContain('Setup required');
    expect(text()).toContain('--include=optional');
    expect(text()).not.toContain('prerequisites ready');
  });
  it('does not change an already-running shared service', async () => {
    const {options, runCommand, saveLinuxAirPlayEnabled} = fixture();
    await runSetup(options);
    expect(runCommand).not.toHaveBeenCalled();
    expect(saveLinuxAirPlayEnabled).toHaveBeenCalledWith(true);
  });
  it('accepts existing ready prerequisites without a package manager or systemd', async () => {
    const {options, runCommand, saveLinuxAirPlayEnabled} = fixture({osRelease: 'ID=unknown', hasCommand: command => ['mpv', 'ffmpeg', 'avahi-browse', 'avahi-daemon'].includes(command), isSystemd: () => false});
    await runSetup(options);
    expect(runCommand).not.toHaveBeenCalled();
    expect(saveLinuxAirPlayEnabled).toHaveBeenCalledWith(true);
  });
  it('provides manual Avahi guidance for unverified managers and non-systemd services', async () => {
    const {options, runCommand, text} = fixture({osRelease: 'ID=alpine', isSystemd: () => false,
      hasCommand: command => ['apk', 'mpv', 'ffmpeg'].includes(command), probeAirPlay: async () => ({...ready, discoveryExecutable: false, discoveryService: 'unavailable', ready: false, message: 'Avahi is missing.'})});
    await runSetup(options);
    expect(runCommand).not.toHaveBeenCalled();
    expect(text()).toContain('no verified automatic Avahi recipe');
    expect(text()).toContain('your system service manager');
    expect(text()).toContain('Setup required');
  });
  it('disables only application consent', async () => {
    const {options, runCommand, probeAirPlay, saveLinuxAirPlayEnabled, text} = fixture({args: ['--yes', '--no-airplay']});
    await runSetup(options);
    expect(saveLinuxAirPlayEnabled).toHaveBeenCalledWith(false);
    expect(runCommand).not.toHaveBeenCalled();
    expect(probeAirPlay).not.toHaveBeenCalled();
    expect(text()).toContain('keep installed packages and shared services');
  });
  it.each([{platform: 'win32' as const}, {platform: 'darwin' as const}, {platform: 'freebsd' as const}, {platform: 'linux' as const, env: {WSL_DISTRO_NAME: 'Ubuntu'}}, {platform: 'linux' as const, env: {TERMUX_VERSION: '1'}}])('rejects Linux opt-in flags on %o', async overrides => {
    const {options, runCommand, probeAirPlay, saveLinuxAirPlayEnabled} = fixture(overrides);
    await expect(runSetup(options)).rejects.toThrow('native Linux AirPlay only');
    expect(runCommand).not.toHaveBeenCalled();
    expect(probeAirPlay).not.toHaveBeenCalled();
    expect(saveLinuxAirPlayEnabled).not.toHaveBeenCalled();
  });
  it('uses the selected library home and preserves existing and concurrent settings', async () => {
    const store = new JsonLibraryStore(join(directory, 'radiocli.json'));
    store.updateSettings({theme: 'amber'});
    store.toggleFavorite({id: 'kept', provider: 'playlist', name: 'Keep me', tags: []});
    const {options} = fixture({saveLinuxAirPlayEnabled: undefined, hasCommand: command => ['mpv', 'pacman', 'systemctl'].includes(command),
      runCommand: async () => { new JsonLibraryStore(store.filePath).updateSettings({volume: 37}); }});
    await runSetup(options);
    const saved = new JsonLibraryStore(store.filePath).snapshot();
    expect(saved.settings).toMatchObject({linuxAirPlayEnabled: true, theme: 'amber', volume: 37});
    expect(saved.favorites[0]?.name).toBe('Keep me');
  });
  it('does not repair malformed settings during dry-run', async () => {
    const file = join(directory, 'radiocli.json');
    writeFileSync(file, '{broken');
    await runSetup(fixture({args: ['--dry-run', '--airplay'], saveLinuxAirPlayEnabled: undefined}).options);
    expect(readFileSync(file, 'utf8')).toBe('{broken');
  });
  it.each([true, false])('includes application consent %s and the selected runtime in final backend verification', async enabled => {
    const detect = vi.spyOn(backendInstall, 'detectPlaybackBackends').mockImplementation(options =>
      options?.platform === 'linux' && options.settings?.linuxAirPlayEnabled ? ['mpv', 'airplay'] : ['mpv']);
    const {options, text} = fixture({args: ['--yes', enabled ? '--airplay' : '--no-airplay']});
    await runSetup(options);
    expect(detect).toHaveBeenCalledWith(expect.objectContaining({platform: 'linux', env: options.env, hasCommand: options.hasCommand, settings: {linuxAirPlayEnabled: enabled}}));
    expect(text()).toContain(`Playback backends: mpv${enabled ? ', airplay' : ''}\n`);
  });
  it('honors an existing opt-in in the selected library during ordinary setup verification', async () => {
    const saved = new JsonLibraryStore(join(directory, 'radiocli.json'));
    saved.updateSettings({linuxAirPlayEnabled: true});
    const detect = vi.spyOn(backendInstall, 'detectPlaybackBackends').mockReturnValue(['mpv', 'airplay']);
    const {options, text} = fixture({args: ['--yes']});
    await runSetup(options);
    expect(detect).toHaveBeenCalledWith(expect.objectContaining({settings: {linuxAirPlayEnabled: true}}));
    expect(text()).toContain('Playback backends: mpv, airplay');
  });

  it('offers Linux experimental setup explicitly and defaults a new library to no', async () => {
    const prompt = vi.fn(async (_question: string, defaultValue: boolean) => defaultValue);
    const {options, saveLinuxAirPlayEnabled, runCommand} = fixture({args: ['--no-mcp'], input: Object.assign(new PassThrough(), {isTTY: true}), output: Object.assign(new PassThrough(), {isTTY: true}), prompt});
    await runSetup(options);
    expect(prompt.mock.calls.find(([question]) => question.includes('AirPlay — experimental'))?.[1]).toBe(false);
    expect(saveLinuxAirPlayEnabled).not.toHaveBeenCalled();
    expect(runCommand).not.toHaveBeenCalled();
  });
  it('keeps the macOS interactive component defaults and prompts unchanged', async () => {
    const prompt = vi.fn(async (_question: string, defaultValue: boolean) => defaultValue);
    const {options, saveLinuxAirPlayEnabled, probeAirPlay} = fixture({platform: 'darwin', args: ['--no-mcp'], input: Object.assign(new PassThrough(), {isTTY: true}), output: Object.assign(new PassThrough(), {isTTY: true}), prompt});
    await runSetup(options);
    expect(prompt.mock.calls.map(([question, value]) => [question.includes('mpv') ? 'mpv' : question.includes('FFmpeg') ? 'ffmpeg' : 'vlc', value])).toEqual([['mpv', true], ['ffmpeg', true], ['vlc', false]]);
    expect(saveLinuxAirPlayEnabled).not.toHaveBeenCalled();
    expect(probeAirPlay).not.toHaveBeenCalled();
  });
});
