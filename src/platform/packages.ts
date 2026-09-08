import {existsSync, readFileSync} from 'node:fs';
import {commandExists} from './executables.js';
import {powershellCommand} from './shell.js';

export type SetupComponent = 'mpv' | 'ffmpeg' | 'vlc';
export type SetupPackageManager = 'brew' | 'winget' | 'scoop' | 'choco' | 'apt' | 'dnf' | 'pacman' | 'apk' | 'zypper' | 'pkg' | 'pkg_add' | 'pkgin';

export type SetupCommand = {
  component: SetupComponent | null;
  label: string;
  program: string;
  args: string[];
  display: string;
};

export const packageManagers: SetupPackageManager[] = ['brew', 'winget', 'scoop', 'choco', 'apt', 'dnf', 'pacman', 'apk', 'zypper', 'pkg', 'pkg_add', 'pkgin'];

/** Package names/options are selected from the recipes below, never shell input. */
export function packageCommandInvocation(command: SetupCommand, platform: NodeJS.Platform): {program: string; args: string[]} {
  return platform === 'win32'
    ? {program: 'powershell.exe', args: powershellCommand([command.program, ...command.args])}
    : {program: command.program, args: command.args};
}

export function detectPackageManager(
  platform: NodeJS.Platform,
  osRelease: string,
  hasCommand: (command: string) => boolean = commandExists
): SetupPackageManager | null {
  if (platform === 'darwin') return hasCommand('brew') ? 'brew' : null;
  if (platform === 'win32') return firstAvailable(['winget', 'scoop', 'choco'], hasCommand);
  if (platform === 'freebsd') return hasCommand('pkg') ? 'pkg' : null;
  if (platform === 'openbsd') return hasCommand('pkg_add') ? 'pkg_add' : null;
  if (platform === 'netbsd') return hasCommand('pkgin') ? 'pkgin' : null;
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
    pkgin: {mpv: 'mpv', vlc: 'vlc'}
  };
  const packageName = packages[manager][component];
  if (!packageName) return null;
  let program: string = manager;
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
  else if (manager === 'pkg') args = ['install', '-y', packageName];
  else if (manager === 'pkg_add') args = ['-I', packageName];
  else args = ['-y', 'install', packageName];

  if (packageManagerNeedsRoot(manager) && elevation) {
    args = [program, ...args];
    program = elevation;
  }
  return {component, label: componentLabel(component), program, args, display: [program, ...args].join(' ')};
}

export function packageManagerNeedsRoot(manager: SetupPackageManager): boolean {
  return !['brew', 'winget', 'scoop', 'choco'].includes(manager);
}

export function packageManagerNotes(manager: SetupPackageManager | null): string[] {
  if (manager === 'pkg') return ['FreeBSD ffmpeg provides ffplay only when built with SDL; verify the executable separately.'];
  if (manager === 'pkgin') return ['pkgsrc uses versioned FFmpeg/ffplay packages. Choose a matching available pair and set RADIOCLI_FFPLAY_PATH to the absolute ffplay executable.'];
  return [];
}

export function platformLabel(platform: NodeJS.Platform, osRelease: string): string {
  if (platform === 'darwin') return `${process.arch === 'arm64' ? 'macOS Apple Silicon' : 'macOS'}`;
  if (platform === 'win32') return 'Windows';
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

export function mpvInstallCommand(platform: NodeJS.Platform = process.platform, osRelease = readLinuxOsRelease()): string {
  if (platform === 'darwin') {
    return 'brew install mpv';
  }

  if (platform === 'win32') {
    return 'winget install --id shinchiro.mpv -e';
  }

  if (platform === 'freebsd') return 'pkg install -y mpv (as root, or use sudo/doas)';
  if (platform === 'openbsd') return 'doas pkg_add -I mpv';
  if (platform === 'netbsd') return 'pkgin -y install mpv (as root, or use sudo/doas)';

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

export function ffplayInstallCommand(platform: NodeJS.Platform = process.platform, osRelease = readLinuxOsRelease()): string {
  if (platform === 'darwin') {
    return 'brew install ffmpeg';
  }

  if (platform === 'win32') {
    return 'winget install --id Gyan.FFmpeg -e';
  }

  if (platform === 'freebsd') return 'pkg install -y ffmpeg; ffplay requires the SDL build option';
  if (platform === 'openbsd') return 'doas pkg_add -I ffmpeg';
  if (platform === 'netbsd') return 'install a matching pkgsrc ffmpegN/ffplayN pair; set RADIOCLI_FFPLAY_PATH';

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
