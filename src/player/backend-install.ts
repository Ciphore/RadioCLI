import {ffplayInstallCommand, mpvInstallCommand, readLinuxOsRelease} from '../platform/packages.js';
export {mpvInstallCommand};
import {identifyPlatform, nativeAdapters} from '../platform/runtime.js';
import {commandExists} from './command.js';
import {airPlaySenderHealth} from './airplay-sender-health.js';

type PlaybackBackendDetectionOptions = {
  platform?: NodeJS.Platform;
  hasCommand?: (command: string) => boolean;
  hasAirPlaySender?: () => boolean;
};

export const ffplayLimitedControlsMessage = 'ffplay fallback has limited controls. Install mpv for pause, mute, volume, and media keys.';
export const vlcLimitedControlsMessage = 'VLC fallback has limited controls. Install mpv for pause, mute, volume, and media keys.';

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
  if (hasCommand('cvlc') || hasCommand('vlc')) {
    backends.push('vlc');
  }

  if (nativeAdapters(identifyPlatform({platform})).airPlay && hasCommand('ffmpeg') && hasCommand('dns-sd') && hasAirPlaySender()) {
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

  if (backend === 'vlc') {
    return {
      backend,
      label: 'VLC fallback',
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
  return `Run radiocli setup to install mpv for playback (${mpvInstallCommand(platform, osRelease)}), then run radiocli doctor.`;
}

export function playbackBackendStatusLines(
  backends: string[],
  platform: NodeJS.Platform = process.platform,
  osRelease = readLinuxOsRelease()
): string[] {
  const backendSet = new Set(backends);
  const lines = [
    'npm_install=RadioCLI installs the optional AirPlay sender when native dependencies are available; playback tools come from mpv and FFmpeg',
    'guided_setup=radiocli setup',
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

  if (backendSet.has('vlc')) {
    return [
      'playback=fallback-only',
      'playback_backend=vlc',
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
