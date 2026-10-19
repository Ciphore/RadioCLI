import {statSync} from 'node:fs';
import {posix, resolve as absolutePath} from 'node:path';
import {readSettingsWithoutMigration} from '../storage/read-settings.js';
import {airPlayPolicy} from '../player/airplay-policy.js';
import {createSchedulerAdapter, type SchedulerCapabilities} from '../alarms/scheduler.js';
import {probeAirPlayReadiness, type AirPlayReadiness} from '../player/airplay-readiness.js';
import {runAirPlayCommand} from '../player/airplay-process.js';
import {planMpvDesktopMedia} from '../player/mpv-desktop-media.js';
import {desktopMediaPolicy} from './desktop-media.js';
import {resolveCommandDetails} from './executables.js';
import {mprisServiceName, sessionBusSocket} from './mpris.js';
import {identifyOmarchy, type OmarchyProfile} from './omarchy.js';
import {nativeAdapters, type PlatformProfile} from './runtime.js';
import {createTerminalLaunch} from './terminals.js';

type Readiness = 'ready' | 'unavailable' | 'unverified';
type PreferenceValue = 'auto' | 'on' | 'off';
type Preference = {value: PreferenceValue; source: 'environment' | 'library' | 'default'; status: 'available' | 'unverified'; message: string};
type ProbeResult = {output: string; code: number | null; timedOut: boolean; truncated: boolean};
type Probe = (command: string, args: string[], env: NodeJS.ProcessEnv) => Promise<ProbeResult>;
type Options = {
  host: PlatformProfile;
  env?: NodeJS.ProcessEnv;
  libraryPath(): string;
  resolve?: (command: string) => string | undefined;
  omarchy?: () => OmarchyProfile;
  mpv?: () => ReturnType<typeof planMpvDesktopMedia>;
  terminalPlan?: () => {terminal: string; command: string};
  run?: Probe;
  isSocket?: (path: string) => boolean;
  airPlay?: () => Promise<AirPlayReadiness>;
};

const probeTimeoutMs = 600;
const maxProbeBytes = 4096;
const unavailableOwner = {status: 'unverified' as const, message: 'RadioCLI media-service registration could not be checked.'};
const unavailableBus = {status: 'unverified' as Readiness, message: 'The local session bus could not be checked.'};

/** Explicit doctor checks only. No library migrations, service activation,
 * terminal launches, MPRIS registration, LAN discovery, or receiver connection. */
export async function probeNativeIntegrations(options: Options) {
  const {host} = options;
  const platform = host.platform as NodeJS.Platform;
  const env = options.env ?? process.env;
  const native = platform === process.platform;
  const resolve = options.resolve ?? (native ? (command: string) => resolveCommandDetails(command, {platform, env}).path ?? undefined : () => undefined);
  const safeResolve = (command: string) => attempt(() => resolve(command), undefined);
  const run = options.run ?? runProbe;
  const mayRun = native || Boolean(options.run);
  const path = attempt(options.libraryPath, undefined);
  const saved = readSettingsWithoutMigration(path);
  const preference = readPreference(saved, env);
  const airPlayConsent = airPlayPolicy({linuxAirPlayEnabled: saved?.linuxAirPlayEnabled === true}, {platform, env, release: host.release});
  const profile = attempt(() => options.omarchy ? options.omarchy()
    : native || host.id !== 'linux' ? identifyOmarchy({platform, env}) : null, null);
  const omarchy = publicOmarchy(profile, env);
  const policy = mediaPolicy(preference, profile, {...options, env, resolve: safeResolve}, native);
  const terminalLauncher = terminalReadiness(options, env, safeResolve, native);
  const [bus, audio, airPlay] = await Promise.all([
    sessionBusReadiness(host, env, path, safeResolve, run, mayRun).catch(() => ({sessionBus: unavailableBus, owner: unavailableOwner})),
    audioReadiness(options, env, safeResolve, run, mayRun).catch(() => ({
      status: 'unverified' as Readiness, backend: null, wpctl: {installed: Boolean(safeResolve('wpctl')), status: 'unverified' as Readiness},
      pactl: {installed: Boolean(safeResolve('pactl')), status: 'unverified' as Readiness}, message: 'The optional local audio check could not complete.'
    })),
    Promise.resolve().then(() => options.airPlay ? options.airPlay() : native
      ? probeAirPlayReadiness({platform, env, release: host.release, resolve: safeResolve})
      : unverifiedAirPlay(host)).catch(() => unverifiedAirPlay(host))
  ]);
  return {omarchy, desktopMedia: {preference, policy, ...bus}, terminalLauncher, audio, airPlay: {
    ...airPlay, enabled: airPlayConsent.enabled, state: airPlayConsent.state, prerequisitesReady: airPlay.ready,
    ready: airPlayConsent.enabled && airPlay.ready,
    message: airPlayConsent.enabled ? airPlay.message : `${airPlayConsent.message} ${airPlay.message}`
  }};
}

/** Doctor supplies a bounded read-only runner; scheduler installation and alarm
 * execution keep their existing adapters and lifetimes. */
export async function probeDoctorScheduler(host: PlatformProfile, env: NodeJS.ProcessEnv = process.env): Promise<SchedulerCapabilities | undefined> {
  if (host.platform !== process.platform) return undefined;
  const failed: SchedulerCapabilities = {supported: false, exactWake: false, catchUpAfterWake: false, message: 'The optional scheduler probe failed. Run radiocli alarm doctor for repair guidance.'};
  try {
    const childEnv = probeEnvironment(env);
    const platform = host.platform as NodeJS.Platform;
    let userBusAddress: string | undefined;
    let unverified = false;
    if (host.id === 'linux') {
      const fallback = localPath(env.XDG_RUNTIME_DIR) ?? (process.getuid ? `/run/user/${process.getuid()}` : null);
      const socket = sessionBusSocket(env.DBUS_SESSION_BUS_ADDRESS ?? (fallback ? `unix:path=${encodeURIComponent(posix.join(fallback, 'bus'))}` : ''));
      if (!socket) return {...failed, name: 'systemd', message: 'The systemd user-manager check requires a supported local Unix session-bus address.'};
      childEnv.DBUS_SESSION_BUS_ADDRESS = `unix:${socket.startsWith('\0') ? 'abstract' : 'path'}=${encodeURIComponent(socket.startsWith('\0') ? socket.slice(1) : socket)}`;
      userBusAddress = childEnv.DBUS_SESSION_BUS_ADDRESS;
    }
    const adapter = createSchedulerAdapter({platform, env: childEnv, run: async (command, args) => {
      let executable: string | null;
      if (userBusAddress) {
        if (command !== 'systemctl' || args.join('\0') !== ['--user', 'show', '--property=Version', '--value'].join('\0')) throw new Error('Doctor permits only the read-only user-manager version check.');
        executable = resolveCommandDetails('busctl', {platform, env: childEnv}).path;
        // systemctl can activate the user manager. Without a no-activation
        // query tool, installed scheduler tooling remains unverified.
        if (!executable) unverified = true;
        // Older busctl get-property ignores --auto-start=no. The explicit
        // Properties.Get method call applies the message flag consistently.
        args = [`--address=${userBusAddress}`, '--auto-start=no', '--timeout=2', 'call', 'org.freedesktop.systemd1', '/org/freedesktop/systemd1', 'org.freedesktop.DBus.Properties', 'Get', 'ss', 'org.freedesktop.systemd1.Manager', 'Version'];
      } else executable = resolveCommandDetails(command, {platform, env: childEnv}).path;
      if (!executable) return {code: 1, stdout: '', stderr: 'The native scheduler command is unavailable.'};
      // Keep Linux below the adapter's 3-second result deadline; a Windows
      // PowerShell bootstrap needs more time than the short audio/bus probes.
      const result = await runProbe(executable, args, childEnv, platform === 'win32' ? 10_000 : 2_500);
      const ready = usable(result) && (!userBusAddress || /^v\s+s\s+"[^"\r\n]{1,256}"\s*$/.test(result.output.trim()));
      // A headless manager may expose only systemd/private. Failure on a
      // guessed bus address cannot establish that this manager is unavailable.
      if (!ready && userBusAddress && env.DBUS_SESSION_BUS_ADDRESS === undefined) unverified = true;
      return ready ? {code: 0, stdout: result.output, stderr: ''}
        : {code: 1, stdout: '', stderr: 'The native scheduler probe failed or exceeded its read-only limits.'};
    }});
    const result = await adapter.probeCapabilities?.();
    return unverified ? undefined : result;
  } catch { return failed; }
}

function readPreference(saved: Record<string, unknown> | undefined, env: NodeJS.ProcessEnv): Preference {
  const override = env.RADIOCLI_DESKTOP_MEDIA;
  if (validPreference(override)) return {value: override, source: 'environment', status: 'available', message: 'RADIOCLI_DESKTOP_MEDIA selects the preference for this process.'};
  const defaults: Preference = {value: 'auto', source: 'default', status: 'available', message: 'No saved desktop media preference; the default is auto.'};
  const unknown: Preference = {value: 'auto', source: 'default', status: 'unverified', message: 'The saved desktop media preference could not be safely read; auto is shown as an unverified default.'};
  if (!saved) return unknown;
  const value = saved.desktopMediaControls;
  if (value === undefined) return defaults;
  return validPreference(value) ? {value, source: 'library', status: 'available', message: 'The saved desktop media preference was read without changing the library.'} : unknown;
}

function mediaPolicy(preference: Preference, profile: OmarchyProfile | null, options: Options & {env: NodeJS.ProcessEnv; resolve: NonNullable<Options['resolve']>}, native: boolean) {
  const unverified = {eligible: false, status: 'unverified' as Readiness, message: 'Desktop media policy could not be verified; existing playback is unaffected.'};
  if (preference.status === 'unverified') return unverified;
  if (preference.value === 'auto' && options.host.id === 'linux' && !profile) return unverified;
  try {
    const policy = desktopMediaPolicy({desktopMediaControls: preference.value}, {
      platform: options.host.platform as NodeJS.Platform, env: options.env,
      omarchy: () => profile!,
      mpv: options.mpv ?? (() => native ? planMpvDesktopMedia({platform: options.host.platform as NodeJS.Platform, env: options.env, executable: options.resolve('mpv')})
        : {status: 'unsupported', args: [], reason: 'The selected host mpv configuration has not been inspected.'})
    });
    return {eligible: policy.enabled, status: policy.enabled ? 'ready' as const : 'unavailable' as const,
      message: policy.enabled ? 'Current policy permits desktop media controls; this does not establish an active media-service owner.' : policy.reason};
  } catch { return unverified; }
}

function publicOmarchy(profile: OmarchyProfile | null, env: NodeJS.ProcessEnv) {
  const known = new Set(['omarchy-launch-tui', 'setsid', 'uwsm-app', 'xdg-terminal-exec', 'local-wayland-session', 'session-bus']);
  const missing = new Set(profile?.terminal.missing.filter(item => known.has(item)) ?? []);
  if (profile?.kind === 'quattro' && !sessionBusSocket(env.DBUS_SESSION_BUS_ADDRESS ?? '')) missing.add('session-bus');
  return {
    status: !profile ? 'unverified' as const : profile.kind === 'none' ? 'absent' as const : 'detected' as const,
    kind: profile?.kind ?? 'unknown',
    version: profile?.version && /^(?:(?:\d+:)?\d+\.\d+\.\d+(?:[.a-z\d-]*)?|dev(?: \([a-f\d]{7,40}\))?)$/.test(profile.version) && profile.version.length < 100 ? profile.version : null,
    major: profile?.major ?? null,
    source: profile?.source ?? null,
    packageName: profile?.packageName === 'omarchy' || profile?.packageName === 'omarchy-dev' ? profile.packageName : null,
    session: profile ? {type: profile.session.type, remote: profile.session.remote, localDesktop: profile.session.localDesktop} : null,
    terminal: {prerequisitesReady: Boolean(profile?.terminal.available && missing.size === 0), missing: [...missing]}
  };
}

function terminalReadiness(options: Options, env: NodeJS.ProcessEnv, resolve: NonNullable<Options['resolve']>, native: boolean) {
  const base = {selected: null as string | null, prerequisites: 'unverified' as Readiness, launch: 'unverified' as const};
  if (!native && !options.terminalPlan) return {...base, message: 'Terminal selection on the requested host has not been inspected.'};
  try {
    const plan = options.terminalPlan ? options.terminalPlan()
      : createTerminalLaunch({platform: options.host.platform as NodeJS.Platform, env, resolve, nodePath: process.execPath, args: []});
    const selected = terminalName(plan.terminal);
    const ready = Boolean(selected && resolve(plan.command) && (selected !== 'linux:omarchy-launch-tui' || sessionBusSocket(env.DBUS_SESSION_BUS_ADDRESS ?? '')));
    if (ready && selected?.startsWith('darwin:') && selected !== 'darwin:apple-terminal') {
      return {...base, selected, message: 'The macOS launch route is selected; the target terminal application has not been inspected, and no window was opened.'};
    }
    return {...base, selected, prerequisites: ready ? 'ready' as const : 'unavailable' as const,
      message: ready ? 'A terminal launcher and its prerequisites were found; no window was opened and TUI startup remains unverified.' : 'The selected terminal launcher is unavailable; open RadioCLI in the current terminal.'};
  } catch {
    return {...base, prerequisites: 'unavailable' as const, message: 'No usable terminal launch plan was found; terminal selection is independent from the background scheduler.'};
  }
}

function terminalName(selector: string): string | null {
  const [platform, ...parts] = selector.split(':');
  if (!['darwin', 'win32', 'linux', 'freebsd', 'openbsd', 'netbsd'].includes(platform ?? '')) return null;
  const name = posix.basename(parts.join(':'));
  return ['apple-terminal', 'iterm', 'windows-terminal', 'console', 'omarchy-launch-tui', 'ghostty', 'wezterm', 'kitty', 'gnome-terminal', 'konsole', 'xfce4-terminal', 'x-terminal-emulator', 'alacritty', 'foot', 'mate-terminal', 'qterminal', 'terminator', 'tilix', 'xterm', 'uxterm'].includes(name) ? `${platform}:${name}` : null;
}

async function sessionBusReadiness(host: PlatformProfile, env: NodeJS.ProcessEnv, libraryPath: string | undefined, resolve: NonNullable<Options['resolve']>, run: Probe, mayRun: boolean) {
  if (host.id !== 'linux') return {sessionBus: {status: 'unavailable' as const, message: 'RadioCLI desktop media controls require Linux.'}, owner: unavailableOwner};
  const socket = sessionBusSocket(env.DBUS_SESSION_BUS_ADDRESS ?? '');
  if (!socket) return {sessionBus: {status: 'unavailable' as const, message: 'No supported local Unix session-bus address is configured.'}, owner: unavailableOwner};
  const command = resolve('busctl');
  if (!command || !mayRun) return {sessionBus: {...unavailableBus, message: 'A local Unix bus is configured; busctl is unavailable for a read-only readiness check.'}, owner: unavailableOwner};
  // Rebuild exactly one Unix transport. Never forward fallback unixexec, TCP,
  // autolaunch, GUIDs, or unrecognized parameters to the D-Bus parser.
  const address = `unix:${socket.startsWith('\0') ? 'abstract' : 'path'}=${encodeURIComponent(socket.startsWith('\0') ? socket.slice(1) : socket)}`;
  const name = libraryPath ? mprisServiceName(absolutePath(libraryPath)) : 'org.freedesktop.DBus';
  const result = await run(command, [`--address=${address}`, '--auto-start=no', '--timeout=0.5', 'call', 'org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'NameHasOwner', 's', name], probeEnvironment(env));
  const owner = usable(result) && /^b (true|false)\s*$/.exec(result.output.trim());
  if (!owner) return {sessionBus: {status: 'unavailable' as const, message: 'The local session bus did not return a usable response within the bounded check.'}, owner: unavailableOwner};
  return {sessionBus: {status: 'ready' as const, message: 'The local session bus answered a read-only query without service activation.'},
    owner: !libraryPath ? unavailableOwner : owner[1] === 'true'
      ? {status: 'registered' as const, message: 'A RadioCLI media-service owner is registered for this library; playback state was not inspected.'}
      : {status: 'absent' as const, message: 'No RadioCLI media-service owner is currently registered for this library.'}};
}

async function audioReadiness(options: Options, env: NodeJS.ProcessEnv, resolve: NonNullable<Options['resolve']>, run: Probe, mayRun: boolean) {
  const linux = options.host.id === 'linux';
  const wpctl = linux ? resolve('wpctl') : undefined;
  const pactl = linux ? resolve('pactl') : undefined;
  const socket = options.isSocket ?? (options.host.platform === process.platform ? isSocket : () => false);
  const runtime = localPath(env.XDG_RUNTIME_DIR);
  const pipewireRuntime = localPath(env.PIPEWIRE_RUNTIME_DIR) ?? runtime;
  const pipewireName = env.PIPEWIRE_REMOTE ?? 'pipewire-0';
  const pipewireSocket = pipewireName.startsWith('/') ? localPath(pipewireName)
    : /^[\w.-]{1,100}$/.test(pipewireName) && !['.', '..', 'internal'].includes(pipewireName) && pipewireRuntime ? posix.join(pipewireRuntime, pipewireName) : null;
  const pulseSocket = env.PULSE_SERVER ? (env.PULSE_SERVER.startsWith('unix:') ? localPath(env.PULSE_SERVER.slice(5)) : null)
    : runtime ? posix.join(runtime, 'pulse', 'native') : null;
  const check = async (command: string | undefined, path: string | null, args: string[], extra: NodeJS.ProcessEnv, pattern: RegExp): Promise<Readiness> => {
    if (!command || !path || !socket(path)) return 'unavailable';
    if (!mayRun) return 'unverified';
    try { const result = await run(command, args, {...probeEnvironment(env), ...extra}); return usable(result) && pattern.test(result.output.trim()) ? 'ready' : 'unavailable'; }
    catch { return 'unverified'; }
  };
  const [pipewire, pulse] = linux ? await Promise.all([
    check(wpctl, pipewireSocket, ['get-volume', '@DEFAULT_AUDIO_SINK@'], {PIPEWIRE_REMOTE: pipewireSocket ?? '', PIPEWIRE_DAEMON: 'false'}, /^Volume:\s*\d+(?:\.\d+)?(?:\s+\[MUTED\])?$/),
    // libpulse disables autospawn when a server is explicitly supplied:
    // https://github.com/pulseaudio/pulseaudio/blob/master/src/pulse/context.c
    check(pactl, pulseSocket, [`--server=unix:${pulseSocket ?? ''}`, 'get-sink-volume', '@DEFAULT_SINK@'], {PULSE_SERVER: `unix:${pulseSocket ?? ''}`}, /^Volume:.*\b\d+%/)
  ]) : ['unverified', 'unverified'] as const;
  const backend = pipewire === 'ready' ? 'pipewire' as const : pulse === 'ready' ? 'pulse' as const : null;
  const status: Readiness = backend ? 'ready' : !linux || pipewire === 'unverified' || pulse === 'unverified' ? 'unverified' : 'unavailable';
  return {status, backend, wpctl: {installed: Boolean(wpctl), status: pipewire}, pactl: {installed: Boolean(pactl), status: pulse},
    message: backend ? 'A local audio server answered a read-only default-output query; audible playback and alarm-volume restoration still require acceptance checks.'
      : !linux ? 'This bounded audio-server check applies to Linux; playback readiness is checked when tuning.'
        : status === 'unverified' ? 'Local audio-server readiness could not be verified; installed tools alone do not establish usable audio.'
          : 'No local audio server answered the default-output check; installed tools alone do not establish usable audio.'};
}

function unverifiedAirPlay(host: PlatformProfile): AirPlayReadiness {
  return {eligible: nativeAdapters(host).airPlay, discoveryExecutable: false, discoveryService: 'unverified', senderLoaded: false, ffmpeg: false, ready: false,
    message: 'The optional AirPlay readiness check could not complete; local playback is unaffected.'};
}

function probeEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {...env, LC_ALL: 'C'};
  // Native clients must not inherit remote transports, autolaunch addresses,
  // daemon switches, or debug paths from optional integration overrides.
  for (const key of Object.keys(result)) if (/^(?:DBUS_|PIPEWIRE_|PULSE_)/.test(key)) delete result[key];
  return result;
}

function localPath(value: string | undefined): string | null { return value && value.startsWith('/') && value.length < 108 && !/[\s\0-\x1f\x7f;,]/.test(value) ? posix.normalize(value) : null; }
function isSocket(path: string): boolean { return attempt(() => statSync(path).isSocket(), false); }
function usable(result: ProbeResult): boolean { return result.code === 0 && !result.timedOut && !result.truncated && Buffer.byteLength(result.output) <= maxProbeBytes; }
function validPreference(value: unknown): value is PreferenceValue { return value === 'auto' || value === 'on' || value === 'off'; }
function attempt<T>(read: () => T, fallback: T): T { try { return read(); } catch { return fallback; } }

/** Combined stdout/stderr cap and an unconditional SIGKILL deadline. Stderr and
 * command errors remain private; callers only publish interpreted facts. */
function runProbe(command: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs = probeTimeoutMs): Promise<ProbeResult> {
  return runAirPlayCommand(command, args, timeoutMs, maxProbeBytes, {env});
}
