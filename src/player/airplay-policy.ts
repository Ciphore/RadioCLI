import type {AppSettings} from '../types.js';
import {identifyPlatform, nativeAdapters} from '../platform/runtime.js';

const airPlayUnsupportedMessage = 'AirPlay output is experimental on macOS and native Linux and is not supported in this environment.';
const linuxAirPlayDisabledMessage = 'Experimental Linux AirPlay is disabled for this library. Run radiocli setup --airplay to enable it.';
export const airPlaySetupRequiredMessage = 'AirPlay setup required. Run radiocli setup --airplay, then radiocli doctor.';

type PolicySettings = Partial<Pick<AppSettings, 'linuxAirPlayEnabled' | 'preferredBackend' | 'preferredAirPlayDevice'>>;
type PolicyOptions = {platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; release?: string};

export function isAirPlayPlatformSupported(platform: NodeJS.Platform = process.platform, env?: NodeJS.ProcessEnv, release?: string): boolean {
  const native = platform === process.platform;
  return nativeAdapters(identifyPlatform({platform, env: env ?? (native ? process.env : {}), release: release ?? (native ? undefined : '')})).airPlay;
}

/** Application consent is independent of optional dependencies and receiver reachability. */
export function airPlayPolicy(settings: PolicySettings = {}, {platform = process.platform, env, release}: PolicyOptions = {}) {
  const eligible = isAirPlayPlatformSupported(platform, env, release);
  const enabled = eligible && (platform === 'darwin' || settings.linuxAirPlayEnabled === true);
  const state = !eligible ? 'unsupported' as const : !enabled ? 'disabled' as const : 'enabled' as const;
  return {eligible, enabled, state, message: !eligible ? airPlayUnsupportedMessage : !enabled ? linuxAirPlayDisabledMessage : 'Experimental AirPlay is enabled.'};
}
