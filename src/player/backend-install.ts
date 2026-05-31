import {existsSync, readFileSync} from 'node:fs';
import {commandExists} from './command.js';
import {airPlaySenderHealth} from './airplay-sender-health.js';

type PlaybackBackendDetectionOptions = {
  platform?: NodeJS.Platform;
  hasCommand?: (command: string) => boolean;
  hasAirPlaySender?: () => boolean;
};

export const ffplayLimitedControlsMessage = 'ffplay fallback has limited controls. Install mpv for pause, mute, volume, and media keys.';

export type PlaybackBackendCapabilities = {
  backend: string;
  label: string;
  supportsPause: boolean;
  supportsMute: boolean;
  supportsVolume: boolean;
  supportsMediaKeys: boolean;
};

export function detectPlaybackBackends({
  platform = process.platform,
  hasCommand = commandExists,
  hasAirPlaySender = hasAirPlaySenderPackage
}: PlaybackBackendDetectionOptions = {}): string[] {
  const backends = ['mpv', 'ffplay'].filter(hasCommand);
  if (platform === 'darwin' && hasCommand('ffmpeg') && hasCommand('dns-sd') && hasAirPlaySender()) {
    backends.push('airplay');
  }

  return backends;
}

function hasAirPlaySenderPackage(): boolean {
  return airPlaySenderHealth().safe;
}

export function playbackBackendCapabilities(backend: string | null | undefined): PlaybackBackendCapabilities {
  if (backend === 'mpv') {
    return {
      backend,
      label: 'mpv',
      supportsPause: true,
      supportsMute: true,
      supportsVolume: true,
      supportsMediaKeys: true
    };
  }

  if (backend === 'ffplay') {
    return {
      backend,
      label: 'ffplay fallback',
      supportsPause: false,
      supportsMute: false,
      supportsVolume: false,
      supportsMediaKeys: false
    };
  }

  if (backend === 'airplay') {
    return {
      backend,
      label: 'AirPlay',
      supportsPause: false,
      supportsMute: true,
      supportsVolume: true,
      supportsMediaKeys: false
    };
  }

  return {
    backend: backend ?? 'none',
    label: backend || 'no backend',
    supportsPause: false,
    supportsMute: false,
    supportsVolume: false,
    supportsMediaKeys: false
  };
}

export function playbackBackendLabel(backend: string | null | undefined): string {
  return playbackBackendCapabilities(backend).label;
}

export function playbackBackendInstallHint(
  platform: NodeJS.Platform = process.platform,
  osRelease = readLinuxOsRelease()
): string {
  return `Install mpv for playback (${mpvInstallCommand(platform, osRelease)}), then run radiocli doctor.`;
}

export function playbackBackendStatusLines(
  backends: string[],
  platform: NodeJS.Platform = process.platform,
  osRelease = readLinuxOsRelease()
): string[] {
  const backendSet = new Set(backends);
  const lines = [
    'npm_install=RadioCLI only; native playback comes from mpv, ffplay, or AirPlay prerequisites',
    `install_mpv=${mpvInstallCommand(platform, osRelease)}`,
    `optional_ffplay=${ffplayInstallCommand(platform, osRelease)}`
  ];

  if (backendSet.has('mpv')) {
    return [
      'playback=ready',
      'playback_backend=mpv',
      'controls=full',
      ...lines
    ];
  }

  if (backendSet.has('ffplay')) {
    return [
      'playback=fallback-only',
      'playback_backend=ffplay',
      'controls=limited',
      'controls_hint=install mpv for pause, mute, volume, and media keys',
      ...lines
    ];
  }

  if (backendSet.has('airplay')) {
    return [
      'playback=airplay-only',
      'playback_backend=airplay',
      'controls=airplay-limited',
      'controls_hint=AirPlay supports volume and mute; pause is not supported',
      ...lines
    ];
  }

  return [
    'playback=missing',
    'playback_backend=none',
    'controls=missing',
    'controls_hint=install mpv for playback and controls',
    ...lines
  ];
}

export function mpvInstallCommand(platform: NodeJS.Platform = process.platform, osRelease = readLinuxOsRelease()): string {
  if (platform === 'darwin') {
    return 'brew install mpv';
  }

  if (platform === 'win32') {
    return 'winget install --id shinchiro.mpv -e';
  }

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

function ffplayInstallCommand(platform: NodeJS.Platform = process.platform, osRelease = readLinuxOsRelease()): string {
  if (platform === 'darwin') {
    return 'brew install ffmpeg';
  }

  if (platform === 'win32') {
    return 'winget install --id Gyan.FFmpeg -e';
  }

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

function readLinuxOsRelease(): string {
  if (process.platform !== 'linux' || !existsSync('/etc/os-release')) {
    return '';
  }

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
    if (!match) {
      continue;
    }

    for (const value of match[2]!.replaceAll('"', '').split(/\s+/)) {
      const normalized = value.trim().toLowerCase();
      if (normalized) {
        ids.add(normalized);
      }
    }
  }

  return ids;
}

function hasAny(values: Set<string>, candidates: string[]): boolean {
  return candidates.some(candidate => values.has(candidate));
}
