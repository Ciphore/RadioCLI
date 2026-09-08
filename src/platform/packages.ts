import {existsSync, readFileSync} from 'node:fs';
import {commandExists} from './executables.js';
import {powershellCommand} from './shell.js';
import {identifyPlatform, type PlatformProfile} from './runtime.js';

export type SetupComponent = 'mpv' | 'ffmpeg' | 'vlc';
export type SetupPackageManager = 'brew' | 'winget' | 'scoop' | 'choco' | 'apt' | 'dnf' | 'pacman' | 'apk' | 'zypper' | 'pkg' | 'pkg_add' | 'pkgin' | 'termux-pkg' | 'pkgman';

export type SetupCommand = {
  component: SetupComponent | null;
  label: string;
  program: string;
  args: string[];
  display: string;
};

export const packageManagers: SetupPackageManager[] = ['brew', 'winget', 'scoop', 'choco', 'apt', 'dnf', 'pacman', 'apk', 'zypper', 'pkg', 'pkg_add', 'pkgin', 'termux-pkg', 'pkgman'];

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
  const packages: Record<SetupPackageManager, Partial<Record<SetupComponent, string>>> = {
    brew: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    winget: {mpv: 'shinchiro.mpv', ffmpeg: 'Gyan.FFmpeg', vlc: 'VideoLAN.VLC'},
    scoop: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    choco: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    apt: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    dnf: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    pacman: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    apk: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    zypper: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    pkg: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    pkg_add: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    // pkgsrc FFmpeg/ffplay packages and executables carry a major version.
    // Choose an available matching pair manually instead of guessing a catalog.
    pkgin: {mpv: 'mpv', vlc: 'vlc'},
    // Termux's main ffmpeg package omits ffplay. Enabling x11-repo and its
    // display/audio services is an explicit manual step, not a setup side effect.
    'termux-pkg': {mpv: 'mpv'},
    pkgman: {mpv: 'mpv', ffmpeg: 'ffmpeg8_tools'}
  };
  const packageName = packages[manager][component];
  if (!packageName) return null;
  let program = packageManagerProgram(manager);
  let args: string[];

  if (manager === 'brew') args = ['install', component === 'vlc' ? '--cask' : packageName, ...(component === 'vlc' ? [packageName] : [])];
  else if (manager === 'winget') args = ['install', '--id', packageName, '-e', '--accept-package-agreements', '--accept-source-agreements'];
  else if (manager === 'scoop') args = ['install', packageName];
  else if (manager === 'choco') args = ['install', packageName, '-y'];
  else if (manager === 'apt') { program = 'apt-get'; args = ['install', '-y', packageName]; }
  else if (manager === 'dnf') args = ['install', '-y', packageName];
  else if (manager === 'pacman') args = ['-S', '--needed', '--noconfirm', packageName];
  else if (manager === 'apk') args = ['add', packageName];
  else if (manager === 'zypper') args = ['--non-interactive', 'install', packageName];
  else if (manager === 'pkg' || manager === 'termux-pkg' || manager === 'pkgman') args = ['install', '-y', packageName];
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

export function readLinuxOsRelease(platform: NodeJS.Platform = process.platform): string {
  if (platform !== 'linux' || !existsSync('/etc/os-release')) return '';
  try {
    return readFileSync('/etc/os-release', 'utf8');
  } catch {
    return '';
  }
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

export function mpvInstallCommand(platform: NodeJS.Platform = process.platform, osRelease = readLinuxOsRelease(platform), env: NodeJS.ProcessEnv = process.env): string {
  if (identifyPlatform({platform, osRelease, env}).id === 'termux') return 'pkg install -y mpv';
  if (platform === 'darwin') {
    return 'brew install mpv';
  }

  if (platform === 'win32') {
    return 'winget install --id shinchiro.mpv -e';
  }

  if (platform === 'freebsd') return 'pkg install -y mpv (as root, or use sudo/doas)';
  if (platform === 'openbsd') return 'doas pkg_add -I mpv';
  if (platform === 'netbsd' || platform === 'sunos') return 'pkgin -y install mpv (with pkgsrc configured, as root or using sudo/doas)';
  if (platform === 'haiku') return 'pkgman install -y mpv';
  if (platform === 'aix') return 'manual native player required; no verified AIX mpv package recipe (set RADIOCLI_MPV_PATH)';

  if (platform !== 'linux') {
    return 'install mpv with your system package manager';
  }

  const ids = linuxReleaseIds(osRelease);
  if (hasAny(ids, ['debian', 'ubuntu', 'linuxmint', 'pop'])) {
    return 'sudo apt install mpv';
  }

  if (hasAny(ids, ['fedora', 'rhel', 'centos'])) {
    return 'sudo dnf install mpv';
  }

  if (hasAny(ids, ['arch', 'manjaro'])) {
    return 'sudo pacman -S mpv';
  }

  if (hasAny(ids, ['alpine'])) {
    return 'sudo apk add mpv';
  }

  if (hasAny(ids, ['opensuse', 'suse'])) {
    return 'sudo zypper install mpv';
  }

  return 'install mpv with your system package manager';
}

export function ffplayInstallCommand(platform: NodeJS.Platform = process.platform, osRelease = readLinuxOsRelease(platform), env: NodeJS.ProcessEnv = process.env): string {
  if (identifyPlatform({platform, osRelease, env}).id === 'termux') return 'enable x11-repo manually, then pkg install -y ffplay (requires configured display/audio); use mpv for audio';
  if (platform === 'darwin') {
    return 'brew install ffmpeg';
  }

  if (platform === 'win32') {
    return 'winget install --id Gyan.FFmpeg -e';
  }

  if (platform === 'freebsd') return 'pkg install -y ffmpeg; ffplay requires the SDL build option';
  if (platform === 'openbsd') return 'doas pkg_add -I ffmpeg';
  if (platform === 'netbsd' || platform === 'sunos') return 'install a matching pkgsrc ffmpegN/ffplayN pair; set RADIOCLI_FFPLAY_PATH';
  if (platform === 'haiku') return 'pkgman install -y ffmpeg8_tools';
  if (platform === 'aix') return 'manual native player required; no verified AIX ffplay package recipe (set RADIOCLI_FFPLAY_PATH)';

  if (platform !== 'linux') {
    return 'install FFmpeg with your system package manager';
  }

  const ids = linuxReleaseIds(osRelease);
  if (hasAny(ids, ['debian', 'ubuntu', 'linuxmint', 'pop'])) {
    return 'sudo apt install ffmpeg';
  }

  if (hasAny(ids, ['fedora', 'rhel', 'centos'])) {
    return 'sudo dnf install ffmpeg';
  }

  if (hasAny(ids, ['arch', 'manjaro'])) {
    return 'sudo pacman -S ffmpeg';
  }

  if (hasAny(ids, ['alpine'])) {
    return 'sudo apk add ffmpeg';
  }

  if (hasAny(ids, ['opensuse', 'suse'])) {
    return 'sudo zypper install ffmpeg';
  }

  return 'install FFmpeg with your system package manager';
}
