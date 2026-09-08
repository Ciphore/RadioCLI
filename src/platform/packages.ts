import {commandExists} from './executables.js';
import {powershellCommand} from './shell.js';
import {identifyPlatform, readLinuxOsRelease, type PlatformProfile} from './runtime.js';

export type SetupComponent = 'mpv' | 'ffmpeg' | 'vlc';
export const packageManagers = ['brew', 'winget', 'scoop', 'choco', 'apt', 'dnf', 'pacman', 'apk', 'zypper', 'pkg', 'pkg_add', 'pkgin', 'termux-pkg', 'pkgman'] as const;
export type SetupPackageManager = typeof packageManagers[number];

export type SetupCommand = {
  component: SetupComponent | null;
  label: string;
  program: string;
  args: string[];
  display: string;
};

/** FreeBSD pkg and Termux pkg have distinct recipes and privilege models. */
export function packageManagerProgram(manager: SetupPackageManager): string {
  return manager === 'termux-pkg' ? 'pkg' : manager;
}

/** Package names/options are selected from the recipes below, never shell input. */
export function packageCommandInvocation(
  command: SetupCommand,
  platform: NodeJS.Platform,
  resolve: (command: string) => string | null = () => null
): {program: string; args: string[]} {
  const program = resolve(command.program) ?? command.program;
  const args = (command.program === 'sudo' || command.program === 'doas') && command.args[0]
    ? [resolve(command.args[0]) ?? command.args[0], ...command.args.slice(1)]
    : command.args;
  return platform === 'win32'
    ? {program: resolve('powershell.exe') ?? 'powershell.exe', args: powershellCommand([program, ...args])}
    : {program, args};
}

export function detectPackageManager(
  platform: NodeJS.Platform,
  osRelease: string,
  hasCommand: (command: string) => boolean = commandExists,
  env: NodeJS.ProcessEnv = process.env
): SetupPackageManager | null {
  const host = identifyPlatform({platform, osRelease, env});
  if (host.id === 'termux') return hasCommand('pkg') ? 'termux-pkg' : null;
  if (platform === 'darwin') return hasCommand('brew') ? 'brew' : null;
  if (platform === 'win32') return firstAvailable(['winget', 'scoop', 'choco'], hasCommand);
  if (platform === 'freebsd') return hasCommand('pkg') ? 'pkg' : null;
  if (platform === 'openbsd') return hasCommand('pkg_add') ? 'pkg_add' : null;
  // pkg on Solaris/illumos is IPS, not the FreeBSD installer.
  if (platform === 'netbsd' || platform === 'sunos') return hasCommand('pkgin') ? 'pkgin' : null;
  if (platform === 'haiku') return hasCommand('pkgman') ? 'pkgman' : null;
  if (platform !== 'linux') return null;

  const ids = linuxReleaseIds(osRelease);
  const preferred: SetupPackageManager[] = hasAny(ids, ['debian', 'ubuntu', 'linuxmint', 'pop'])
    ? ['apt']
    : hasAny(ids, ['fedora', 'rhel', 'centos'])
      ? ['dnf']
      : hasAny(ids, ['arch', 'manjaro'])
        ? ['pacman']
        : hasAny(ids, ['alpine'])
          ? ['apk']
          : hasAny(ids, ['opensuse', 'suse'])
            ? ['zypper']
            : ['apt', 'dnf', 'pacman', 'apk', 'zypper'];
  return firstAvailable(preferred, hasCommand);
}

export function packageInstallCommand(
  manager: SetupPackageManager,
  component: SetupComponent,
  {elevation = 'sudo'}: {elevation?: 'sudo' | 'doas' | null} = {}
): SetupCommand | null {
  const packages: Partial<Record<SetupPackageManager, Partial<Record<SetupComponent, string>>>> = {
    winget: {mpv: 'shinchiro.mpv', ffmpeg: 'Gyan.FFmpeg', vlc: 'VideoLAN.VLC'},
    // pkgsrc FFmpeg/ffplay packages and executables carry a major version.
    // Choose an available matching pair manually instead of guessing a catalog.
    pkgin: {mpv: 'mpv', vlc: 'vlc'},
    // Termux's main ffmpeg package omits ffplay. Enabling x11-repo and its
    // display/audio services is an explicit manual step, not a setup side effect.
    'termux-pkg': {mpv: 'mpv'},
    pkgman: {mpv: 'mpv', ffmpeg: 'ffmpeg8_tools'}
  };
  const packageName = packages[manager] ? packages[manager][component] : component;
  if (!packageName) return null;
  let program = packageManagerProgram(manager);
  let args: string[];

  if (manager === 'brew') args = ['install', component === 'vlc' ? '--cask' : packageName, ...(component === 'vlc' ? [packageName] : [])];
  else if (manager === 'winget') args = ['install', '--id', packageName, '-e', '--accept-package-agreements', '--accept-source-agreements'];
  else if (manager === 'scoop') args = ['install', packageName];
  else if (manager === 'choco') args = ['install', packageName, '-y'];
  else if (manager === 'apt') { program = 'apt-get'; args = ['install', '-y', packageName]; }
  else if (manager === 'pacman') args = ['-S', '--needed', '--noconfirm', packageName];
  else if (manager === 'apk') args = ['add', packageName];
  else if (manager === 'zypper') args = ['--non-interactive', 'install', packageName];
  else if (manager === 'dnf' || manager === 'pkg' || manager === 'termux-pkg' || manager === 'pkgman') args = ['install', '-y', packageName];
  else if (manager === 'pkg_add') args = ['-I', packageName];
  else args = ['-y', 'install', packageName];

  if (packageManagerNeedsRoot(manager) && elevation) {
    args = [program, ...args];
    program = elevation;
  }
  return {component, label: componentLabel(component), program, args, display: [program, ...args].join(' ')};
}

export function packageManagerNeedsRoot(manager: SetupPackageManager): boolean {
  return !['brew', 'winget', 'scoop', 'choco', 'termux-pkg', 'pkgman'].includes(manager);
}

export function packageManagerNotes(manager: SetupPackageManager | null, host: PlatformProfile = identifyPlatform()): string[] {
  if (manager === 'termux-pkg' || (!manager && host.id === 'termux')) return [
    'Termux pkg runs as the normal app user, without sudo or root. Use --package-manager=termux-pkg to select this recipe explicitly.',
    'The Termux ffmpeg package does not include ffplay. The separate ffplay package needs x11-repo and a configured display/audio environment; mpv is the recommended audio player.',
    'Android clipboard integration requires the termux-api package and a compatible Termux:API app; helper execution can still fail if Android denies access.'
  ];
  if (manager === 'pkgman' || (!manager && host.id === 'haiku')) return [
    'The verified HaikuPorts runtime recipe provides Node 20, below RadioCLI\'s Node 22 minimum. These playback recipes do not resolve that runtime blocker; a separate working Node 22+ port is required.',
    'Haiku ffmpeg8_tools provides ffmpeg and ffplay. A secondary-architecture install may require explicit RADIOCLI_FFMPEG_PATH and RADIOCLI_FFPLAY_PATH values.'
  ];
  if (host.id === 'aix') return ['There is no verified AIX mpv or ffplay package recipe. Provision a working native player manually and set RADIOCLI_MPV_PATH or RADIOCLI_FFPLAY_PATH; IBM Toolbox DNF availability does not establish a playback package.'];
  if (manager === 'pkg') return ['FreeBSD ffmpeg provides ffplay only when built with SDL; verify the executable separately.'];
  if (manager === 'pkgin' || host.id === 'sunos') return [
    ...(host.id === 'sunos' ? ['Solaris/illumos setup uses an existing pkgsrc/pkgin installation. IPS pkg is a different tool and is not used by this recipe.'] : []),
    'pkgsrc uses versioned FFmpeg/ffplay packages. Choose a matching available pair and set RADIOCLI_FFPLAY_PATH to the absolute ffplay executable.'
  ];
  return [];
}

export function platformLabel(platform: NodeJS.Platform, osRelease: string, env: NodeJS.ProcessEnv = process.env): string {
  if (identifyPlatform({platform, osRelease, env}).id === 'termux') return 'Android / Termux';
  if (platform === 'darwin') return `${process.arch === 'arm64' ? 'macOS Apple Silicon' : 'macOS'}`;
  if (platform === 'win32') return 'Windows';
  if (platform === 'haiku') return 'Haiku';
  if (platform === 'sunos') return 'Solaris / illumos';
  if (platform === 'aix') return 'AIX';
  if (platform === 'android') return 'Android';
  if (platform === 'linux') return osReleaseValue(osRelease, 'PRETTY_NAME') || 'Linux';
  return platform;
}

export function componentLabel(component: SetupComponent): string {
  if (component === 'ffmpeg') return 'FFmpeg / ffplay';
  if (component === 'vlc') return 'VLC fallback';
  return 'mpv';
}

function firstAvailable<T extends string>(values: T[], hasCommand: (command: string) => boolean): T | null {
  return values.find(hasCommand) ?? null;
}

function linuxReleaseIds(osRelease: string): Set<string> {
  const ids = new Set<string>();
  for (const line of osRelease.split('\n')) {
    const match = /^(ID|ID_LIKE)=(.*)$/.exec(line);
    if (!match) continue;
    for (const value of match[2]!.replaceAll('"', '').split(/\s+/)) if (value.trim()) ids.add(value.trim().toLowerCase());
  }
  return ids;
}

function osReleaseValue(osRelease: string, key: string): string {
  const line = osRelease.split('\n').find(candidate => candidate.startsWith(`${key}=`));
  return line?.slice(key.length + 1).replace(/^"|"$/g, '') ?? '';
}

function hasAny(values: Set<string>, candidates: string[]): boolean {
  return candidates.some(candidate => values.has(candidate));
}

export type PackageHintOptions = {
  hasCommand?: (command: string) => boolean;
  getUid?: () => number | undefined;
};

export function packageManagerElevation(hasCommand: (command: string) => boolean, isRoot: boolean): 'sudo' | 'doas' | null {
  return isRoot ? null : firstAvailable(['sudo', 'doas'], hasCommand);
}

export function packageInstallPrerequisites(manager: SetupPackageManager, components: SetupComponent[]): SetupCommand[] {
  if (manager !== 'scoop' || !components.some(component => component === 'mpv' || component === 'vlc')) return [];
  return [{component: null, label: 'Scoop extras bucket', program: 'scoop', args: ['bucket', 'add', 'extras'], display: 'scoop bucket add extras'}];
}

export function mpvInstallCommand(platform: NodeJS.Platform = process.platform, osRelease = readLinuxOsRelease(platform), env: NodeJS.ProcessEnv = process.env, options: PackageHintOptions = {}): string {
  return playbackInstallHint('mpv', platform, osRelease, env, options);
}

export function ffplayInstallCommand(platform: NodeJS.Platform = process.platform, osRelease = readLinuxOsRelease(platform), env: NodeJS.ProcessEnv = process.env, options: PackageHintOptions = {}): string {
  return playbackInstallHint('ffmpeg', platform, osRelease, env, options);
}

function playbackInstallHint(component: 'mpv' | 'ffmpeg', platform: NodeJS.Platform, osRelease: string, env: NodeJS.ProcessEnv, {hasCommand = commandExists, getUid = process.getuid}: PackageHintOptions): string {
  const host = identifyPlatform({platform, osRelease, env});
  const player = component === 'mpv' ? 'mpv' : 'ffplay';
  if (host.id === 'aix') return `manual native player required; no verified AIX ${player} package recipe (set RADIOCLI_${player.toUpperCase()}_PATH)`;
  const manager = detectPackageManager(platform, osRelease, hasCommand, env);
  if (component === 'ffmpeg' && host.id === 'termux') return `enable x11-repo manually, then ${manager ? 'pkg install -y ffplay' : 'install the separate ffplay package manually'} (requires configured display/audio); use mpv for audio`;
  if (component === 'ffmpeg' && (platform === 'netbsd' || platform === 'sunos')) return 'manually install a matching pkgsrc ffmpegN/ffplayN pair; set RADIOCLI_FFPLAY_PATH';

  const notes: string[] = [];
  if (component === 'ffmpeg' && platform === 'freebsd') notes.push('ffplay requires the SDL build option');
  if (!manager) return [`install ${component === 'mpv' ? 'mpv' : 'FFmpeg'} manually; no supported package manager was found`, ...notes].join('; ');
  const isRoot = getUid?.() === 0;
  const elevation = packageManagerElevation(hasCommand, isRoot);
  const command = packageInstallCommand(manager, component, {elevation});
  if (!command) return `install ${componentLabel(component)} manually`;
  if (packageManagerNeedsRoot(manager) && !isRoot && !elevation) notes.unshift('run as root; sudo/doas unavailable');
  if (manager === 'pkgin') notes.push('requires configured pkgsrc');
  if (manager === 'termux-pkg' && isRoot) notes.push('run as the normal Termux app user, without root');
  const prerequisites = packageInstallPrerequisites(manager, [component]);
  for (const prerequisite of prerequisites) notes.push(`first run ${prerequisite.display}`);
  return command.display + (notes.length ? ` (${notes.join('; ')})` : '');
}
