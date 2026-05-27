import {existsSync, readFileSync} from 'node:fs';
import {commandExists} from './command.js';

const playbackBackends = ['mpv', 'ffplay'] as const;

export function detectPlaybackBackends(): string[] {
  return playbackBackends.filter(commandExists);
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
    'npm_install=RadioCLI only; native playback comes from mpv or ffplay',
    `install_mpv=${mpvInstallCommand(platform, osRelease)}`,
    `optional_ffplay=${ffplayInstallCommand(platform, osRelease)}`
  ];

  if (backendSet.has('mpv')) {
    return [
      'playback=ready',
      'playback_backend=mpv',
      ...lines
    ];
  }

  if (backendSet.has('ffplay')) {
    return [
      'playback=fallback-only',
      'playback_backend=ffplay',
      ...lines
    ];
  }

  return [
    'playback=missing',
    'playback_backend=none',
    ...lines
  ];
}

export function mpvInstallCommand(platform: NodeJS.Platform = process.platform, osRelease = readLinuxOsRelease()): string {
  if (platform === 'darwin') {
    return 'brew install mpv';
  }

  if (platform === 'win32') {
    return 'use WSL with sudo apt install mpv, or install mpv from https://mpv.io/installation/';
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
    return 'use WSL with sudo apt install ffmpeg, or install FFmpeg from https://ffmpeg.org/download.html';
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
