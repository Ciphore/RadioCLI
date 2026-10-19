import {describe, expect, it} from 'vitest';
import {airPlayPolicy} from './airplay-policy.js';

describe('AirPlay opt-in policy', () => {
  it('requires an explicit saved native Linux choice', () => {
    for (const settings of [{}, {linuxAirPlayEnabled: false}, {preferredBackend: 'airplay' as const, preferredAirPlayDevice: 'saved'}]) {
      expect(airPlayPolicy(settings, {platform: 'linux', env: {}, release: ''})).toMatchObject({eligible: true, enabled: false, state: 'disabled'});
    }
    expect(airPlayPolicy({linuxAirPlayEnabled: true}, {platform: 'linux', env: {}, release: ''})).toMatchObject({enabled: true, state: 'enabled'});
  });
  it('preserves macOS regardless of the Linux preference', () => {
    for (const linuxAirPlayEnabled of [undefined, false, true]) expect(airPlayPolicy({linuxAirPlayEnabled}, {platform: 'darwin', env: {}}).enabled).toBe(true);
  });
  it.each([{platform: 'win32' as const}, {platform: 'freebsd' as const}, {platform: 'android' as const}, {platform: 'linux' as const, env: {WSL_DISTRO_NAME: 'Ubuntu'}}, {platform: 'linux' as const, env: {TERMUX_VERSION: '1'}}])('never opts unsupported environments in: %o', options => {
    expect(airPlayPolicy({linuxAirPlayEnabled: true}, options)).toMatchObject({eligible: false, enabled: false, state: 'unsupported'});
  });
});
