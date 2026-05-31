import {describe, expect, it} from 'vitest';
import type {AirPlayDevice, AppSettings} from '../types.js';
import {
  airPlayAvailability,
  airPlayDeviceDetail,
  airPlayReceiverSettingValue,
  isAirPlayBackendAvailable,
  selectedAirPlayDevice
} from './airplay-settings.js';

const device: AirPlayDevice = {
  id: '5CAAFD0046D4@Office',
  name: 'Office',
  host: 'Sonos-5CAAFD0046D4.local',
  port: 7000,
  txt: ['cn=0,1'],
  requiresPassword: false,
  airplay2: true
};

describe('AirPlay settings helpers', () => {
  it('reports availability from detected playback backends', () => {
    expect(isAirPlayBackendAvailable(['mpv', 'airplay'])).toBe(true);
    expect(airPlayAvailability(['mpv'], [device])).toMatchObject({
      ready: false,
      label: 'Not ready'
    });
  });

  it('summarizes the selected receiver without an automatic target state', () => {
    expect(airPlayReceiverSettingValue(settings(), [device], ['airplay'])).toBe('Choose receiver... · 1 receiver');
    expect(airPlayReceiverSettingValue(settings({preferredAirPlayDevice: device.id}), [device], ['airplay'])).toBe('Office · 1 receiver');
    expect(airPlayReceiverSettingValue(settings({preferredAirPlayDevice: device.id}), [{...device, local: true}], ['airplay'])).toBe('Office · this Mac');
    expect(airPlayReceiverSettingValue(settings({preferredAirPlayDevice: 'missing'}), [device], ['airplay'])).toBe('Saved receiver missing · 1 receiver');
    expect(airPlayReceiverSettingValue(settings(), [], ['airplay'])).toBe('No receivers found');
    expect(airPlayReceiverSettingValue(settings({preferredAirPlayDevice: device.id}), [device], ['mpv'])).toBe('Office · playback unavailable');
  });

  it('formats receiver metadata for the picker list', () => {
    expect(selectedAirPlayDevice(settings({preferredAirPlayDevice: device.id}), [device])).toEqual(device);
    expect(airPlayDeviceDetail(device)).toBe('Sonos-5CAAFD0046D4.local:7000 · AirPlay 2 · no code');
    expect(airPlayDeviceDetail({...device, host: '192.168.1.27', local: true})).toBe('192.168.1.27:7000 · this Mac · use local output');
    expect(airPlayDeviceDetail({...device, requiresPassword: true, airplay2: false})).toContain('code shown on receiver');
  });
});

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    theme: 'green',
    receiverStyle: 'pulse-grid',
    receiverStyleVersion: 2,
    volume: 70,
    enableRadioGarden: false,
    enableNearbyLocation: false,
    preferredBackend: 'auto',
    tuneTimeoutSeconds: 12,
    skipBrokenStreams: true,
    mediaKeys: {previous: [], playPause: [], next: []},
    ...overrides
  };
}
