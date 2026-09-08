import {existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {isDirectRun, runCommand} from './cli.js';
import {detectPlaybackBackends} from './player/backend-install.js';
import {JsonLibraryStore} from './storage/store.js';
import {defaultAgentControlSettings} from './types.js';
import * as platformPaths from './platform/paths.js';
import * as schedulers from './alarms/scheduler.js';

vi.mock('./player/backend-install.js', async importOriginal => {
  const actual = await importOriginal<typeof import('./player/backend-install.js')>();
  return {
    ...actual,
    detectPlaybackBackends: vi.fn(() => [])
  };
});

const roots: string[] = [];
const originalRadioCliHome = process.env.RADIOCLI_HOME;
const originalRadioAtlasHome = process.env.RADIO_ATLAS_HOME;
const detectPlaybackBackendsMock = vi.mocked(detectPlaybackBackends);
let radioCliHome = '';
let logs: string[] = [];
let consoleLogSpy: ReturnType<typeof vi.spyOn>;

describe('CLI command dispatch', () => {
  beforeEach(() => {
    detectPlaybackBackendsMock.mockReturnValue([]);
    radioCliHome = mkdtempSync(join(tmpdir(), 'radiocli-cli-'));
    roots.push(radioCliHome);
    process.env.RADIOCLI_HOME = radioCliHome;
    delete process.env.RADIO_ATLAS_HOME;
    logs = [];
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(message => {
      logs.push(String(message));
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    vi.clearAllMocks();
    restoreEnv('RADIOCLI_HOME', originalRadioCliHome);
    restoreEnv('RADIO_ATLAS_HOME', originalRadioAtlasHome);

    for (const root of roots.splice(0)) {
      rmSync(root, {recursive: true, force: true});
    }
  });

  it('prints help without creating user library state', async () => {
    await runCommand(['help']);

    expect(logs.join('\n')).toContain('radiocli doctor');
    expect(logs.join('\n')).toContain('radiocli setup');
    expect(logs.join('\n')).toContain('radiocli add-url <url> [name]');
    expect(existsSync(join(radioCliHome, 'radiocli.json'))).toBe(false);
  });

  it('prints setup help without probing or changing the system', async () => {
    await runCommand(['setup', '--help']);

    expect(logs.join('\n')).toContain('radiocli setup --dry-run');
    expect(logs.join('\n')).toContain('--package-manager <pm>');
    expect(existsSync(join(radioCliHome, 'radiocli.json'))).toBe(false);
  });

  it('prints the installed version', async () => {
    await runCommand(['version']);

    expect(logs.join('\n')).toMatch(/^\d+\.\d+\.\d+/);
    expect(existsSync(join(radioCliHome, 'radiocli.json'))).toBe(false);
  });

  it('prints doctor setup guidance without creating user library state', async () => {
    await runCommand(['doctor']);

    expect(logs.join('\n')).toContain('npm_install=RadioCLI installs the optional AirPlay sender when native dependencies are available; playback tools come from mpv and FFmpeg');
    expect(logs.join('\n')).toContain('controls=missing');
    expect(logs.join('\n')).toContain('install_mpv=');
    expect(logs.join('\n')).toContain('mpv_path=');
    expect(logs.join('\n')).toContain('mpv_launch=');
    expect(existsSync(join(radioCliHome, 'radiocli.json'))).toBe(false);
  });

  it('prints a machine-readable, state-free doctor report', async () => {
    await runCommand(['doctor', '--json']);

    const report = JSON.parse(logs.join('\n')) as {
      radioCliVersion: string;
      platform: string;
      backends: string[];
      commands: Record<string, string | null>;
      mpv: {path: string | null; discovery: string; launchable: boolean};
      host: {id: string; arch: string};
      capabilities: Record<string, {status: string; message: string}>;
      guidance: string[];
    };
    expect(report.radioCliVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(report.platform).toBe(process.platform);
    expect(report.backends).toEqual([]);
    expect(report.commands).toHaveProperty('mpv');
    expect(report.mpv).toMatchObject({discovery: expect.any(String), launchable: expect.any(Boolean)});
    expect(report.guidance).toContain('playback=missing');
    expect(report.host).toMatchObject({id: expect.any(String), arch: process.arch});
    expect(report.capabilities.playback?.status).toBe('unavailable');
    expect(report.capabilities.storage?.status).toBe('available');
    expect(report.capabilities).toHaveProperty('backgroundScheduling');
    expect(report.capabilities).toHaveProperty('terminalReopening');
    expect(report.capabilities).toHaveProperty('screenReader');
    expect(JSON.stringify(report)).not.toContain(radioCliHome);
    expect(existsSync(join(radioCliHome, 'radiocli.json'))).toBe(false);
  });

  it('diagnoses an inaccessible data destination without creating or replacing it', async () => {
    const blockedHome = join(radioCliHome, 'not-a-directory');
    writeFileSync(blockedHome, 'preserve me');
    process.env.RADIOCLI_HOME = blockedHome;
    await runCommand(['doctor', '--json']);
    const report = JSON.parse(logs.join('\n'));
    expect(report.capabilities.storage.status).toBe('unavailable');
    expect(report.capabilities.atomicWrites.status).toBe('unavailable');
    expect(report.capabilities.storage.message).toContain('RADIOCLI_HOME');
    expect(JSON.stringify(report)).not.toContain(blockedHome);
    expect(readFileSync(blockedHome, 'utf8')).toBe('preserve me');
  });

  it('checks the selected legacy library location without migrating data during doctor', async () => {
    const paths = platformPaths.platformPaths();
    const spy = vi.spyOn(platformPaths, 'platformPaths').mockReturnValue({...paths, library: join(radioCliHome, 'absent.json'), legacyLibrary: radioCliHome});
    try {
      await runCommand(['doctor', '--json']);
      const report = JSON.parse(logs.join('\n'));
      expect(report.capabilities.storage.status).toBe('unavailable');
      expect(existsSync(join(radioCliHome, 'absent.json'))).toBe(false);
    } finally { spy.mockRestore(); }
  });

  it('reports an inaccessible user scheduler while preserving unrelated diagnostics', async () => {
    const adapter = schedulers.createSchedulerAdapter();
    const spy = vi.spyOn(schedulers, 'createSchedulerAdapter').mockReturnValue({...adapter,
      probeCapabilities: async () => ({supported: false, message: 'No active systemd user manager.', catchUpAfterWake: false, exactWake: false})});
    try {
      await runCommand(['doctor', '--json']);
      const report = JSON.parse(logs.join('\n'));
      expect(report.capabilities.backgroundScheduling).toMatchObject({status: 'unavailable', message: 'No active systemd user manager.'});
      expect(report.capabilities.storage.status).toBe('available');
      expect(existsSync(join(radioCliHome, 'radiocli.json'))).toBe(false);
    } finally { spy.mockRestore(); }
  });

  it('reports offline and constrained-terminal policy without writing state', async () => {
    vi.stubEnv('RADIOCLI_OFFLINE', '1');
    vi.stubEnv('TERM', 'dumb');
    vi.stubEnv('FORCE_COLOR', '3');
    try {
      await runCommand(['doctor', '--json']);
      const report = JSON.parse(logs.join('\n'));
      expect(report.network).toMatchObject({status: 'offline', offline: true});
      expect(report.terminal).toMatchObject({unicode: false, colorLevel: 0, reduceMotion: true, interactive: false});
      expect(report.capabilities.unicode.status).toBe('unavailable');
      expect(report.capabilities.color.status).toBe('unavailable');
      expect(existsSync(join(radioCliHome, 'radiocli.json'))).toBe(false);
    } finally {vi.unstubAllEnvs();}
  });

  it('keeps doctor usable if an optional scheduler probe fails', async () => {
    const adapter = schedulers.createSchedulerAdapter();
    const spy = vi.spyOn(schedulers, 'createSchedulerAdapter').mockReturnValue({...adapter,
      probeCapabilities: async () => { throw new Error('probe failed'); }});
    try {
      await runCommand(['doctor', '--json']);
      expect(JSON.parse(logs.join('\n')).capabilities.backgroundScheduling.status).toBe('unavailable');
    } finally { spy.mockRestore(); }
  });

  it('rejects unknown commands with the help hint', async () => {
    await expect(runCommand(['wat'])).rejects.toThrow('Unknown command: wat\nRun radiocli help.');
  });

  it('adds direct stream URLs into the isolated imported library', async () => {
    await runCommand(['add-url', 'https://streams.example.com/live.mp3', 'Example', 'FM']);

    expect(logs).toEqual(['added=Example FM']);
    const state = JSON.parse(readFileSync(join(radioCliHome, 'radiocli.json'), 'utf8')) as {
      imported: Array<{id: string; name: string; streamUrl: string; provider: string; tags: string[]}>;
    };
    expect(state.imported).toHaveLength(1);
    expect(state.imported[0]).toMatchObject({
      provider: 'playlist',
      name: 'Example FM',
      streamUrl: 'https://streams.example.com/live.mp3',
      tags: ['custom']
    });
    expect(state.imported[0]?.id).toMatch(/^custom-/);
  });

  it('recognizes npm-linked symlink entrypoints as direct runs', () => {
    const moduleFile = join(radioCliHome, 'cli.js');
    const linkedFile = join(radioCliHome, 'radiocli');
    writeFileSync(moduleFile, '', 'utf8');
    symlinkSync(moduleFile, linkedFile);

    expect(isDirectRun(linkedFile, pathToFileURL(moduleFile).href)).toBe(true);
  });

  it('rejects malformed agent values without corrupting persisted settings', async () => {
    const store = new JsonLibraryStore();
    store.updateSettings({agentControl: {...defaultAgentControlSettings, enabled: true}});

    await expect(runCommand(['agent', 'volume', 'banana'])).rejects.toThrow('Volume must be a number from 0 through 100');
    await expect(runCommand(['agent', 'volume', '101'])).rejects.toThrow('Volume must be a number from 0 through 100');
    await expect(runCommand(['agent', 'preset', '--action', 'explode'])).rejects.toThrow('Action must be play, pause, resume, or stop');
    await expect(runCommand(['agent', 'preset', '--source', 'internet'])).rejects.toThrow('Source must be recent, favorite, popular, or country');

    const reloaded = new JsonLibraryStore().snapshot();
    expect(reloaded.settings.volume).toBe(70);
    expect(reloaded.settings.agentControl?.enabled).toBe(true);
    expect(reloaded.settings.agentControl?.completionPreset).toEqual(defaultAgentControlSettings.completionPreset);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
