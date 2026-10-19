import {airPlayLocalDeviceLabel} from '../player/backend-install.js';
import type {AirPlayDevice, AppSettings} from '../types.js';

export type AirPlayAvailability = {
  ready: boolean;
  label: string;
  detail: string;
};

export function isAirPlayBackendAvailable(backends: readonly string[]): boolean {
  return backends.includes('airplay');
}

export function selectedAirPlayDevice(settings: AppSettings, devices: readonly AirPlayDevice[]): AirPlayDevice | undefined {
  return devices.find(device => device.id === settings.preferredAirPlayDevice);
}

export function airPlayReceiverSettingValue(
  settings: AppSettings,
  devices: readonly AirPlayDevice[],
  backends: readonly string[],
  platform: NodeJS.Platform = process.platform
): string {
  if (platform === 'linux' && !isAirPlayBackendAvailable(backends)) return 'Setup required';
  const device = selectedAirPlayDevice(settings, devices);
  const count = airPlayDeviceCountLabel(devices.length);
  const playbackStatus = isAirPlayBackendAvailable(backends) ? undefined : 'playback unavailable';
  if (device) {
    return [device.name, device.local ? airPlayLocalDeviceLabel(platform) : playbackStatus ?? count].join(' · ');
  }

  if (settings.preferredAirPlayDevice) {
    return ['Saved receiver missing', playbackStatus ?? count].join(' · ');
  }

  if (devices.length > 0) {
    return ['Choose receiver...', playbackStatus ?? count].join(' · ');
  }

  return playbackStatus ? `No receivers found · ${playbackStatus}` : 'No receivers found';
}

export function airPlayAvailability(backends: readonly string[], devices: readonly AirPlayDevice[], platform: NodeJS.Platform = process.platform): AirPlayAvailability {
  if (!isAirPlayBackendAvailable(backends)) {
    if (platform === 'linux') return {ready: false, label: 'Setup required', detail: 'Run radiocli setup --airplay, then radiocli doctor to check FFmpeg, Avahi, and the optional sender.'};
    const detail = devices.length > 0
      ? 'RadioCLI can see receivers, but this install cannot start AirPlay yet. Run radiocli doctor.'
      : 'AirPlay is not ready on this install. Run radiocli doctor.';

    return {
      ready: false,
      label: 'Not ready',
      detail
    };
  }

  if (devices.length === 0) {
    if (platform === 'linux') return {ready: false, label: 'Unverified', detail: 'Refresh to find IPv4 receivers and verify experimental AirPlay. Select a receiver each session.'};
    return {
      ready: true,
      label: 'Ready',
      detail: 'AirPlay is installed; no receivers are visible on this network.'
    };
  }

  return {
    ready: true,
    label: 'Ready',
    detail: `${airPlayDeviceCountLabel(devices.length)} visible on this network.`
  };
}

export function airPlayDeviceDetail(device: AirPlayDevice, platform: NodeJS.Platform = process.platform): string {
  if (device.local) {
    return `${device.host}:${device.port} · ${airPlayLocalDeviceLabel(platform)} · use local output`;
  }

  const security = device.requiresPassword ? 'code shown on receiver' : 'no code';
  const protocol = device.airplay2 ? 'AirPlay 2' : 'AirPlay';
  return `${device.host}:${device.port} · ${protocol} · ${security}`;
}

function airPlayDeviceCountLabel(count: number): string {
  return `${count} receiver${count === 1 ? '' : 's'}`;
}
