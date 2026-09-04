import {PassThrough} from 'node:stream';
import {describe, expect, it, vi} from 'vitest';
import {createSetupPlan, detectPackageManager, parseSetupArgs, runSetup, type SetupComponent} from './setup.js';

const nothingInstalled: Record<SetupComponent, boolean> = {mpv: false, ffmpeg: false, vlc: false};

describe('RadioCLI setup', () => {
  it('detects native package managers by platform and Linux family', () => {
    const available = new Set(['brew', 'winget', 'scoop', 'apt', 'dnf', 'pacman']);
    const hasCommand = (command: string): boolean => available.has(command);

    expect(detectPackageManager('darwin', '', hasCommand)).toBe('brew');
    expect(detectPackageManager('win32', '', hasCommand)).toBe('winget');
    expect(detectPackageManager('linux', 'ID=ubuntu\nID_LIKE=debian\n', hasCommand)).toBe('apt');
    expect(detectPackageManager('linux', 'ID=fedora\n', hasCommand)).toBe('dnf');
    expect(detectPackageManager('linux', 'ID=arch\n', hasCommand)).toBe('pacman');
  });

  it('prefers Scoop on Windows when WinGet is unavailable', () => {
    expect(detectPackageManager('win32', '', command => command === 'scoop')).toBe('scoop');
  });

  it('builds direct, non-shell commands for Homebrew, WinGet, and apt', () => {
    const brew = createSetupPlan({
      platform: 'darwin',
      packageManager: 'brew',
      installed: nothingInstalled,
      selected: ['mpv', 'ffmpeg', 'vlc']
    });
    expect(brew.commands.map(command => command.display)).toEqual([
      'brew install mpv',
      'brew install ffmpeg',
      'brew install --cask vlc'
    ]);

    const winget = createSetupPlan({
      platform: 'win32',
      packageManager: 'winget',
      installed: nothingInstalled,
      selected: ['mpv']
    });
    expect(winget.commands[0]).toMatchObject({
      program: 'winget',
      args: ['install', '--id', 'shinchiro.mpv', '-e', '--accept-package-agreements', '--accept-source-agreements']
    });

    const apt = createSetupPlan({
      platform: 'linux',
      packageManager: 'apt',
      installed: nothingInstalled,
      selected: ['mpv']
    });
    expect(apt.commands[0]).toMatchObject({program: 'sudo', args: ['apt-get', 'install', '-y', 'mpv']});
  });

  it('skips installed components and normalizes --only selections', () => {
    const parsed = parseSetupArgs(['--yes', '--only=vlc,mpv,mpv', '--package-manager', 'scoop']);
    expect(parsed).toMatchObject({yes: true, only: ['mpv', 'vlc'], packageManager: 'scoop'});

    const plan = createSetupPlan({
      platform: 'win32',
      packageManager: 'scoop',
      installed: {mpv: true, ffmpeg: false, vlc: false},
      selected: parsed.only!
    });
    expect(plan.commands).toHaveLength(2);
    expect(plan.commands[0]?.display).toBe('scoop bucket add extras');
    expect(plan.commands[1]?.component).toBe('vlc');
  });

  it('rejects unsafe or contradictory setup arguments', () => {
    expect(() => parseSetupArgs(['--only', 'mpv;rm'])).toThrow('--only accepts');
    expect(() => parseSetupArgs(['--all', '--only=mpv'])).toThrow('either --all or --only');
    expect(() => parseSetupArgs(['--package-manager', 'curl'])).toThrow('--package-manager accepts');
    expect(() => parseSetupArgs(['--wat'])).toThrow('Unknown setup option');
  });

  it('shows an executable dry-run plan without invoking installers', async () => {
    const output = new PassThrough();
    let text = '';
    output.on('data', chunk => { text += String(chunk); });
    const execute = vi.fn(async () => undefined);

    await runSetup({
      platform: 'win32',
      args: ['--dry-run', '--all', '--package-manager', 'winget'],
      input: new PassThrough(),
      output,
      hasCommand: () => false,
      runCommand: execute
    });

    expect(text).toContain('RADIOCLI  SETUP RECEIVER');
    expect(text).toContain('winget install --id shinchiro.mpv');
    expect(text).toContain('winget install --id Gyan.FFmpeg');
    expect(text).toContain('winget install --id VideoLAN.VLC');
    expect(text).toContain('Dry run complete');
    expect(execute).not.toHaveBeenCalled();
  });

  it('runs selected installers sequentially and prints final verification', async () => {
    const output = new PassThrough();
    let text = '';
    output.on('data', chunk => { text += String(chunk); });
    const executed: string[] = [];

    await runSetup({
      platform: 'darwin',
      args: ['--yes', '--only=mpv,ffmpeg', '--package-manager=brew'],
      input: new PassThrough(),
      output,
      hasCommand: command => command === 'brew',
      runCommand: async command => { executed.push(command.display); }
    });

    expect(executed).toEqual(['brew install mpv', 'brew install ffmpeg']);
    expect(text).toContain('Setup complete.');
    expect(text).toContain('Verification');
    expect(text).toContain('Run radiocli to start listening.');
  });
});
