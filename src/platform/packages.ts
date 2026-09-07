import {existsSync, readFileSync} from 'node:fs';
import {commandExists} from './executables.js';

export type SetupComponent = 'mpv' | 'ffmpeg' | 'vlc';
export type SetupPackageManager = 'brew' | 'winget' | 'scoop' | 'choco' | 'apt' | 'dnf' | 'pacman' | 'apk' | 'zypper';

export type SetupCommand = {
  component: SetupComponent | null;
  label: string;
  program: string;
  args: string[];
  display: string;
};

export const packageManagers: SetupPackageManager[] = ['brew', 'winget', 'scoop', 'choco', 'apt', 'dnf', 'pacman', 'apk', 'zypper'];

export function detectPackageManager(
  platform: NodeJS.Platform,
  osRelease: string,
  hasCommand: (command: string) => boolean = commandExists
): SetupPackageManager | null {
  if (platform === 'darwin') return hasCommand('brew') ? 'brew' : null;
  if (platform === 'win32') return firstAvailable(['winget', 'scoop', 'choco'], hasCommand);
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

export function packageInstallCommand(manager: SetupPackageManager, component: SetupComponent): SetupCommand {
  const packages: Record<SetupPackageManager, Record<SetupComponent, string>> = {
    brew: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    winget: {mpv: 'shinchiro.mpv', ffmpeg: 'Gyan.FFmpeg', vlc: 'VideoLAN.VLC'},
    scoop: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    choco: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    apt: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    dnf: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    pacman: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    apk: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    zypper: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'}
  };
  const packageName = packages[manager][component];
  let program: string = manager;
  let args: string[];

  if (manager === 'brew') args = ['install', component === 'vlc' ? '--cask' : packageName, ...(component === 'vlc' ? [packageName] : [])];
  else if (manager === 'winget') args = ['install', '--id', packageName, '-e', '--accept-package-agreements', '--accept-source-agreements'];
  else if (manager === 'scoop') args = ['install', packageName];
  else if (manager === 'choco') args = ['install', packageName, '-y'];
  else if (manager === 'apt') {
    program = 'sudo';
    args = ['apt-get', 'install', '-y', packageName];
  } else if (manager === 'dnf') {
    program = 'sudo';
    args = ['dnf', 'install', '-y', packageName];
  } else if (manager === 'pacman') {
    program = 'sudo';
    args = ['pacman', '-S', '--needed', '--noconfirm', packageName];
  } else if (manager === 'apk') {
    program = 'sudo';
    args = ['apk', 'add', packageName];
  } else {
    program = 'sudo';
    args = ['zypper', '--non-interactive', 'install', packageName];
  }

  return {component, label: componentLabel(component), program, args, display: [program, ...args].join(' ')};
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

export function linuxReleaseIds(osRelease: string): Set<string> {
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

export function hasAny(values: Set<string>, candidates: string[]): boolean {
  return candidates.some(candidate => values.has(candidate));
}
