import {resolve} from 'node:path';
import type {AppSettings} from '../types.js';
import type {PlayerController} from '../player/player-controller.js';
import {planMpvDesktopMedia} from '../player/mpv-desktop-media.js';
import type {RadioSessionCommand, RadioSessionResult, RadioSessionStatus} from '../agent/session.js';
import {identifyOmarchy, type OmarchyProfile} from './omarchy.js';
import {sessionBusSocket, startMpris} from './mpris.js';
import {resolveCommandDetails} from './executables.js';

type PolicyOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  omarchy?: () => OmarchyProfile;
  mpv?: () => {status: 'compatible' | 'unsupported'; args: string[]; reason: string};
};
export type DesktopMediaPolicy = {enabled: boolean; preference: 'auto' | 'on' | 'off'; reason: string; mpvArgs: string[]};

export function desktopMediaPolicy(settings: Pick<AppSettings, 'desktopMediaControls'>, options: PolicyOptions = {}): DesktopMediaPolicy {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const override = env.RADIOCLI_DESKTOP_MEDIA;
  const preference = override === 'auto' || override === 'on' || override === 'off' ? override : settings.desktopMediaControls ?? 'auto';
  const disabled = (reason: string): DesktopMediaPolicy => ({enabled: false, preference, reason, mpvArgs: []});
  if (preference === 'off') return disabled('Desktop media controls are disabled.');
  if (platform !== 'linux') return disabled('Desktop media controls currently require Linux.');
  if (!sessionBusSocket(env.DBUS_SESSION_BUS_ADDRESS ?? '')) return disabled('A local Unix session bus is required.');
  if (preference === 'auto') {
    const profile = (options.omarchy ?? (() => identifyOmarchy({platform, env})))();
    if (profile.kind !== 'quattro' || profile.source !== 'package' || !profile.session.localDesktop) return disabled('Automatic desktop media controls require a packaged Omarchy Quattro local desktop.');
  }
  const mpv = (options.mpv ?? (() => planMpvDesktopMedia({platform, env, executable: resolveCommandDetails('mpv', {platform, env}).path})))();
  if (mpv.status !== 'compatible') return disabled(mpv.reason);
  return {enabled: true, preference, reason: mpv.reason, mpvArgs: mpv.args};
}

/** State and ICY updates reuse the owning player's event stream. No additional
 * playback polling is needed and the bridge never connects through MCP. */
export function startDesktopMediaControls(options: {
  player: PlayerController;
  identity: string;
  policy: DesktopMediaPolicy;
  status(): RadioSessionStatus;
  command(command: RadioSessionCommand, permitted?: () => boolean): Promise<RadioSessionResult>;
  suspended(): boolean;
  env?: NodeJS.ProcessEnv;
}): {refresh(): void; close(): void} {
  if (!options.policy.enabled) return {refresh() {}, close() {}};
  let title: string | undefined;
  let previousStream: string | undefined;
  let previousStation: string | undefined;
  let disposed = false;
  const bridge = startMpris({
    identity: resolve(options.identity),
    address: (options.env ?? process.env).DBUS_SESSION_BUS_ADDRESS ?? '',
    command: command => options.command(command, () => !disposed),
    snapshot: () => ({...options.status(), title, available: !options.suspended() && options.player.desktopMediaCompatible()})
  });
  const refresh = () => {
    const station = options.status().station;
    const key = station ? `${station.provider}\0${station.id}` : undefined;
    if (key !== previousStation) { title = undefined; previousStation = key; }
    bridge.refresh();
  };
  const removeState = options.player.onChange(state => {
    if (state.streamUrl !== previousStream) { title = undefined; previousStream = state.streamUrl; }
    refresh();
  });
  const removeMetadata = options.player.onMetadata(metadata => { title = metadata.title; refresh(); });
  return {refresh, close() { disposed = true; removeState(); removeMetadata(); bridge.close(); }};
}
