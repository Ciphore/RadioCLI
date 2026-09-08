import {PassThrough} from 'node:stream';
import {describe, expect, it, vi} from 'vitest';
import {createSetupPlan, parseSetupArgs, runSetup, type SetupComponent} from './setup.js';
import {detectPackageManager, ffplayInstallCommand, mpvInstallCommand, type SetupPackageManager} from './platform/packages.js';

const nothingInstalled: Record<SetupComponent, boolean> = {mpv: false, ffmpeg: false, vlc: false};

describe('RadioCLI setup', () => {
  it.each([
    ['darwin', '', 'brew', 'brew', {}],
    ['win32', '', 'winget', 'winget', {}],
    ['win32', '', 'scoop', 'scoop', {}],
    ['win32', '', 'choco', 'choco', {}],
    ['linux', 'ID=ubuntu\nID_LIKE=debian', 'apt', 'apt', {}],
    ['linux', 'ID=fedora', 'dnf', 'dnf', {}],
    ['linux', 'ID=arch', 'pacman', 'pacman', {}],
    ['linux', 'ID=alpine', 'apk', 'apk', {}],
    ['linux', 'ID=opensuse', 'zypper', 'zypper', {}],
    ['linux', 'ID=unknown', 'dnf', 'dnf', {}],
    ['freebsd', '', 'pkg', 'pkg', {}],
    ['openbsd', '', 'pkg_add', 'pkg_add', {}],
    ['netbsd', '', 'pkgin', 'pkgin', {}],
    ['sunos', '', 'pkgin', 'pkgin', {}],
    ['haiku', '', 'pkgman', 'pkgman', {}],
    ['android', '', 'termux-pkg', 'pkg', {TERMUX_VERSION: '0.118.3'}],
    ['linux', 'ID=debian', 'termux-pkg', 'pkg', {TERMUX_VERSION: '0.118.3'}]
  ] satisfies [NodeJS.Platform, string, SetupPackageManager, string, NodeJS.ProcessEnv][])('uses the selected %s/%s/%s setup recipes in playback hints', (platform, osRelease, manager, executable, env) => {
    const hasCommand = (command: string): boolean => [executable, 'doas'].includes(command);
    expect(detectPackageManager(platform, osRelease, hasCommand, env)).toBe(manager);
    const plan = createSetupPlan({platform, osRelease, env, packageManager: manager, installed: nothingInstalled,
      selected: ['mpv', 'ffmpeg'], elevation: 'doas'});
    const options = {hasCommand, getUid: () => 1000};
    const hints = {mpv: mpvInstallCommand(platform, osRelease, env, options), ffmpeg: ffplayInstallCommand(platform, osRelease, env, options)};
    for (const command of plan.commands) {
      if (command.component === 'mpv' || command.component === 'ffmpeg') expect(hints[command.component]).toContain(command.display);
    }
    if (manager === 'termux-pkg') expect(hints.ffmpeg).toContain('x11-repo');
    if (manager === 'pkgin') expect(hints.ffmpeg).toContain('matching pkgsrc');
    if (manager === 'pkg') expect(hints.ffmpeg).toContain('SDL');
    if (manager === 'scoop') expect(hints.mpv).toContain('scoop bucket add extras');
  });

  it('shows every Scoop prerequisite in the reviewed dry-run plan', async () => {
    const output = new PassThrough();
    let text = '';
    output.on('data', chunk => {text += String(chunk);});
    await runSetup({platform: 'win32', env: {}, args: ['--dry-run', '--only=mpv'], input: new PassThrough(), output,
      hasCommand: command => command === 'scoop'});
    expect(text).toContain('scoop bucket add extras');
    expect(text).toContain('scoop install mpv');
    expect(text).not.toContain('winget');
  });

  it('prints an ASCII-safe setup plan in a dumb terminal without control sequences', async () => {
    vi.stubEnv('TERM', 'dumb');
    const output = Object.assign(new PassThrough(), {isTTY: true});
    let text = '';
    output.on('data', chunk => {text += String(chunk);});
    try {
      await runSetup({platform: 'linux', osRelease: 'ID=debian', args: ['--dry-run', '--only=mpv'],
        input: new PassThrough(), output, hasCommand: command => command === 'apt'});
      expect(text).toContain('SETUP RECEIVER');
      expect(text).not.toMatch(/[^\x00-\x7f]/);
      expect(text).not.toContain('\u001b');
    } finally {vi.unstubAllEnvs();}
  });

  it('caps setup colors at the terminal depth', async () => {
    vi.stubEnv('TERM', 'xterm');
    vi.stubEnv('FORCE_COLOR', undefined);
    vi.stubEnv('NO_COLOR', undefined);
    const output = Object.assign(new PassThrough(), {isTTY: true, getColorDepth: () => 4});
    let text = '';
    output.on('data', chunk => {text += String(chunk);});
    try {
      await runSetup({platform: 'linux', osRelease: 'ID=debian', args: ['--dry-run', '--only=mpv'],
        input: new PassThrough(), output, hasCommand: command => command === 'apt'});
      expect(text).toContain('\u001b[32m');
      expect(text).not.toContain('38;2;');
    } finally {vi.unstubAllEnvs();}
  });

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
    expect(() => parseSetupArgs(['--mcp', '--no-mcp'])).toThrow('either --mcp or --no-mcp');
    expect(() => parseSetupArgs(['--mcp', '--agent-ui', '--headless-agent'])).toThrow('either --agent-ui or --headless-agent');
    expect(() => parseSetupArgs(['--agent-ui'])).toThrow('require --mcp');
  });

  it('supports explicit MCP setup choices', () => {
    expect(parseSetupArgs(['--yes', '--mcp'])).toMatchObject({yes: true, mcp: true, agentUi: null});
    expect(parseSetupArgs(['--yes', '--mcp', '--agent-ui'])).toMatchObject({mcp: true, agentUi: true});
    expect(parseSetupArgs(['--yes', '--mcp', '--headless-agent'])).toMatchObject({mcp: true, agentUi: false});
    expect(parseSetupArgs(['--yes', '--no-mcp'])).toMatchObject({yes: true, mcp: false});
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

  it('previews MCP enablement during a dry run without configuring clients', async () => {
    const output = new PassThrough();
    let text = '';
    output.on('data', chunk => { text += String(chunk); });
    await runSetup({
      platform: 'linux',
      args: ['--dry-run', '--mcp', '--only=mpv', '--package-manager=apt'],
      input: new PassThrough(),
      output,
      hasCommand: () => false
    });
    expect(text).toContain('Agent integration: would be enabled and installed for detected MCP clients.');
  });

  it.each([
    {platform: 'freebsd' as const, manager: 'pkg', uid: 0, commands: ['pkg'], expected: 'pkg install -y mpv'},
    {platform: 'openbsd' as const, manager: 'pkg_add', uid: 1000, commands: ['pkg_add', 'doas'], expected: 'doas pkg_add -I mpv'},
    {platform: 'linux' as const, manager: 'apk', uid: 0, commands: ['apk'], expected: 'apk add mpv'}
  ])('executes the reviewed $manager privilege plan', async ({platform, manager, uid, commands, expected}) => {
    const execute = vi.fn(async (_command: {display: string}) => undefined);
    await runSetup({platform, osRelease: 'ID=alpine', args: ['--yes', '--only=mpv', `--package-manager=${manager}`],
      input: new PassThrough(), output: new PassThrough(), hasCommand: command => commands.includes(command),
      getUid: () => uid, runCommand: execute});
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]?.[0]).toMatchObject({display: expected});
  });

  it('rejects installation when a privileged package tool has no usable privilege helper', async () => {
    const execute = vi.fn(async () => undefined);
    await expect(runSetup({platform: 'freebsd', args: ['--yes', '--only=mpv'], getUid: () => 1000,
      input: new PassThrough(), output: new PassThrough(), hasCommand: command => command === 'pkg', runCommand: execute
    })).rejects.toThrow('requires root, sudo, or doas');
    expect(execute).not.toHaveBeenCalled();
  });

  it('labels the root requirement when previewing commands without an available privilege helper', async () => {
    const output = new PassThrough();
    let text = '';
    output.on('data', chunk => {text += String(chunk);});
    await runSetup({platform: 'freebsd', env: {}, args: ['--dry-run', '--only=mpv'], getUid: () => 1000,
      input: new PassThrough(), output, hasCommand: command => command === 'pkg'});
    expect(text).toContain('pkg install -y mpv');
    expect(text).toContain('Run package commands as root; sudo/doas unavailable.');
    expect(text).not.toContain('sudo pkg');
  });

  it('shows a manual pkgsrc FFmpeg plan without invoking a guessed package', async () => {
    const output = new PassThrough();
    let text = '';
    output.on('data', chunk => { text += String(chunk); });
    const execute = vi.fn(async () => undefined);
    await runSetup({platform: 'netbsd', args: ['--dry-run', '--only=ffmpeg'], getUid: () => 0,
      input: new PassThrough(), output, hasCommand: command => command === 'pkgin', runCommand: execute});
    expect(text).toContain('manual installation required');
    expect(text).toContain('RADIOCLI_FFPLAY_PATH');
    expect(execute).not.toHaveBeenCalled();
    await expect(runSetup({platform: 'netbsd', args: ['--yes', '--only=ffmpeg'], getUid: () => 0,
      input: new PassThrough(), output, hasCommand: command => command === 'pkgin', runCommand: execute
    })).rejects.toThrow('No verified automatic installation command');
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    {platform: 'android' as const, env: {TERMUX_VERSION: '0.118.3'}, manager: 'pkg', label: 'Android / Termux', expected: 'pkg install -y mpv'},
    {platform: 'linux' as const, env: {PREFIX: '/data/data/com.termux/files/usr'}, manager: 'pkg', label: 'Android / Termux', expected: 'pkg install -y mpv'},
    {platform: 'haiku' as const, env: {}, manager: 'pkgman', label: 'Haiku', expected: 'pkgman install -y mpv'},
    {platform: 'sunos' as const, env: {}, manager: 'pkgin', label: 'Solaris / illumos', expected: 'pkgin -y install mpv'}
  ])('previews the verified $platform installation without running it', async ({platform, env, manager, label, expected}) => {
    const output = new PassThrough();
    let text = '';
    output.on('data', chunk => {text += String(chunk);});
    const execute = vi.fn(async () => undefined);
    await runSetup({platform, env, args: ['--dry-run', '--only=mpv'], input: new PassThrough(), output,
      hasCommand: command => command === manager, getUid: () => 0, runCommand: execute});
    expect(text).toContain(label);
    expect(text).toContain(expected);
    expect(text).toContain('Dry run complete');
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    {platform: 'android' as const, env: {TERMUX_VERSION: '0.118.3'}, manager: 'termux-pkg', executable: 'pkg', uid: 10123, expected: 'pkg install -y mpv'},
    {platform: 'haiku' as const, env: {}, manager: 'pkgman', executable: 'pkgman', uid: 1000, expected: 'pkgman install -y mpv'},
    {platform: 'sunos' as const, env: {}, manager: 'pkgin', executable: 'pkgin', uid: 0, expected: 'pkgin -y install mpv'}
  ])('runs the explicitly approved $manager command with its native privilege model', async ({platform, env, manager, executable, uid, expected}) => {
    const execute = vi.fn(async (_command: {display: string}) => undefined);
    await runSetup({platform, env, args: ['--yes', '--only=mpv', `--package-manager=${manager}`], input: new PassThrough(), output: new PassThrough(),
      hasCommand: command => command === executable, getUid: () => uid, runCommand: execute});
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]?.[0]).toMatchObject({display: expected});
  });

  it('requires approval before running Termux pkg and rejects root execution', async () => {
    const execute = vi.fn(async () => undefined);
    const options = {platform: 'android' as const, env: {TERMUX_VERSION: '0.118.3'}, input: new PassThrough(), output: new PassThrough(),
      hasCommand: (command: string) => command === 'pkg', runCommand: execute};
    await expect(runSetup({...options, args: ['--only=mpv'], getUid: () => 10123})).rejects.toThrow('Use --yes');
    await expect(runSetup({...options, args: ['--yes', '--only=mpv'], getUid: () => 0})).rejects.toThrow('normal Termux app user');
    expect(execute).not.toHaveBeenCalled();
  });

  it('checks the native pkg executable for an explicit Termux manager selection', async () => {
    const execute = vi.fn(async () => undefined);
    await expect(runSetup({platform: 'android', env: {TERMUX_VERSION: '0.118.3'}, args: ['--yes', '--only=mpv', '--package-manager=termux-pkg'],
      input: new PassThrough(), output: new PassThrough(), hasCommand: () => false, getUid: () => 10123, runCommand: execute
    })).rejects.toThrow('Requested package manager is not available: termux-pkg (pkg)');
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    {platform: 'android' as const, env: {TERMUX_VERSION: '0.118.3'}, manager: 'pkg'},
    {platform: 'freebsd' as const, env: {}, manager: 'termux-pkg'},
    {platform: 'sunos' as const, env: {}, manager: 'pkg'},
    {platform: 'aix' as const, env: {}, manager: 'dnf'}
  ])('rejects the wrong native recipe for $manager on $platform before even previewing an install', async ({platform, env, manager}) => {
    const execute = vi.fn(async () => undefined);
    await expect(runSetup({platform, env, args: ['--dry-run', '--only=mpv', `--package-manager=${manager}`],
      input: new PassThrough(), output: new PassThrough(), hasCommand: () => true, getUid: () => 0, runCommand: execute
    })).rejects.toThrow('No verified');
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    {platform: 'android' as const, env: {TERMUX_VERSION: '0.118.3'}, manager: 'pkg', only: 'ffmpeg', note: 'x11-repo'},
    {platform: 'haiku' as const, env: {}, manager: 'pkgman', only: 'vlc', note: 'Node 20'},
    {platform: 'sunos' as const, env: {}, manager: 'pkgin', only: 'ffmpeg', note: 'RADIOCLI_FFPLAY_PATH'}
  ])('keeps unverified $platform components manual', async ({platform, env, manager, only, note}) => {
    const output = new PassThrough();
    let text = '';
    output.on('data', chunk => {text += String(chunk);});
    const execute = vi.fn(async () => undefined);
    const options = {platform, env, input: new PassThrough(), output, hasCommand: (command: string) => command === manager, getUid: () => 1000, runCommand: execute};
    await runSetup({...options, args: ['--dry-run', `--only=${only}`]});
    expect(text).toContain('manual installation required');
    expect(text).toContain(note);
    await expect(runSetup({...options, args: ['--yes', `--only=${only}`]})).rejects.toThrow('No verified automatic installation command');
    expect(execute).not.toHaveBeenCalled();
  });

  it('shows the Haiku tools package and current Node catalog blocker together', async () => {
    const output = new PassThrough();
    let text = '';
    output.on('data', chunk => {text += String(chunk);});
    await runSetup({platform: 'haiku', env: {}, args: ['--dry-run', '--only=ffmpeg'], input: new PassThrough(), output,
      hasCommand: command => command === 'pkgman'});
    expect(text).toContain('pkgman install -y ffmpeg8_tools');
    expect(text).toMatch(/Node 20.*Node 22/);
    expect(text).not.toContain('sudo pkgman');
  });

  it('prints actionable manual AIX guidance even with a DNF command on PATH', async () => {
    const output = new PassThrough();
    let text = '';
    output.on('data', chunk => {text += String(chunk);});
    const execute = vi.fn(async () => undefined);
    const options = {platform: 'aix' as const, env: {}, input: new PassThrough(), output,
      hasCommand: (command: string) => command === 'dnf', runCommand: execute};
    await runSetup({...options, args: ['--dry-run', '--only=mpv']});
    expect(text).toContain('RADIOCLI_MPV_PATH');
    expect(text).not.toContain('dnf install');
    await expect(runSetup({...options, args: ['--yes', '--only=mpv']})).rejects.toThrow('No supported system package manager');
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    {platform: 'android' as const, env: {TERMUX_VERSION: '0.118.3'}, manager: 'pkg', uid: 10123},
    {platform: 'haiku' as const, env: {}, manager: 'pkgman', uid: 1000},
    {platform: 'sunos' as const, env: {}, manager: 'pkgin', uid: 0}
  ])('reports a native $manager failure without claiming setup completed', async ({platform, env, manager, uid}) => {
    const output = new PassThrough();
    let text = '';
    output.on('data', chunk => {text += String(chunk);});
    const execute = vi.fn(async () => {throw new Error(`${manager}: package catalog unavailable`);});
    await expect(runSetup({platform, env, args: ['--yes', '--only=mpv'], input: new PassThrough(), output,
      hasCommand: command => command === manager, getUid: () => uid, runCommand: execute
    })).rejects.toThrow('package catalog unavailable');
    expect(execute).toHaveBeenCalledOnce();
    expect(text).not.toContain('Setup complete');
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
