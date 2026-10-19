import {resolveCommandDetails} from '../platform/executables.js';
import {sessionBusSocket} from '../platform/mpris.js';
import {isAirPlayPlatformSupported} from './backend-install.js';
import {runAirPlayCommand, type AirPlayCommandRunner} from './airplay-process.js';
import {probeAirPlaySender, type AirPlaySenderLoadability} from './airplay-sender-health.js';

export type AirPlayReadiness = {
  eligible: boolean;
  discoveryExecutable: boolean;
  discoveryService: 'ready' | 'unavailable' | 'unverified';
  senderLoaded: boolean;
  ffmpeg: boolean;
  ready: boolean;
  message: string;
};

type ReadinessOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  release?: string;
  resolve?: (command: string) => string | undefined;
  hasCommand?: (command: string) => boolean;
  run?: AirPlayCommandRunner;
  sender?: () => Promise<AirPlaySenderLoadability>;
};

/** Does not browse the network, activate services, or open a receiver. */
export async function probeAirPlayReadiness({platform = process.platform, env = process.env, release,
  resolve = command => resolveCommandDetails(command, {platform, env}).path ?? undefined,
  hasCommand = command => Boolean(resolve(command)), run = runAirPlayCommand, sender = probeAirPlaySender}: ReadinessOptions = {}): Promise<AirPlayReadiness> {
  const eligible = isAirPlayPlatformSupported(platform, env, release);
  const discoveryExecutable = eligible && hasCommand(platform === 'linux' ? 'avahi-browse' : 'dns-sd');
  const ffmpeg = eligible && hasCommand('ffmpeg');
  const busctl = eligible && platform === 'linux' && hasCommand('busctl') ? resolve('busctl') : undefined;
  let discoveryService: AirPlayReadiness['discoveryService'] = 'unverified';
  const senderResult = eligible ? sender() : Promise.resolve({loaded: false, message: 'AirPlay is not supported in this environment.'});
  if (!discoveryExecutable) discoveryService = 'unavailable';
  else if (platform === 'linux' && busctl) {
    const socket = sessionBusSocket(env.DBUS_SYSTEM_BUS_ADDRESS ?? 'unix:path=/run/dbus/system_bus_socket');
    if (!socket) discoveryService = 'unavailable';
    else {
      // --system still honors executable/network transport overrides. Pass only
      // one validated Unix address and remove all inherited D-Bus fallbacks.
      const address = `unix:${socket.startsWith('\0') ? 'abstract' : 'path'}=${encodeURIComponent(socket.startsWith('\0') ? socket.slice(1) : socket)}`;
      const childEnv = {...env};
      for (const key of Object.keys(childEnv)) if (key.startsWith('DBUS_')) delete childEnv[key];
      const result = await run(busctl, [`--address=${address}`, '--auto-start=no', '--timeout=0.5', 'call', 'org.freedesktop.Avahi', '/', 'org.freedesktop.Avahi.Server', 'GetState'], 600, 4096, {env: childEnv});
      discoveryService = result.code === 0 && /^i\s+2\s*$/.test(result.output.trim()) && !result.truncated && !result.timedOut ? 'ready' : 'unavailable';
    }
  }
  const senderLoaded = (await senderResult).loaded;
  const ready = eligible && discoveryExecutable && ffmpeg && senderLoaded && discoveryService !== 'unavailable';
  const message = !eligible ? 'AirPlay is experimental on macOS and native Linux; this environment is not supported.'
    : !discoveryExecutable ? `AirPlay discovery requires ${platform === 'linux' ? 'avahi-browse' : 'dns-sd'}.`
      : discoveryService === 'unavailable' ? 'The Avahi discovery service is not ready. Local playback remains available.'
        : !ffmpeg ? 'AirPlay playback requires FFmpeg.'
          : !senderLoaded ? 'The optional AirPlay sender could not load. Local playback remains available.'
            : discoveryService === 'unverified' ? 'AirPlay prerequisites are present; the discovery service and receiver connection must still be verified.'
              : 'Experimental AirPlay prerequisites are ready; select a receiver to verify playback.';
  return {eligible, discoveryExecutable, discoveryService, senderLoaded, ffmpeg, ready, message};
}
