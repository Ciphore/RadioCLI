import {spawnSync} from 'node:child_process';
import {closeSync, constants, fstatSync, openSync, readSync, statSync} from 'node:fs';
import {homedir} from 'node:os';
import {posix} from 'node:path';
import {resolveCommandDetails} from './executables.js';
import {identifyPlatform} from './runtime.js';

export type OmarchyProfile = {
  kind: 'quattro' | 'legacy' | 'development' | 'unknown' | 'none';
  version: string | null;
  major: number | null;
  source: 'package' | 'helper' | 'legacy-metadata' | null;
  root: string | null;
  packageName: string | null;
  session: {type: 'wayland' | 'x11' | 'headless'; remote: boolean; localDesktop: boolean};
  /** Prerequisites only: launcher acceptance and TUI readiness are checked separately. */
  terminal: {available: boolean; command: string | null; missing: string[]};
};

type CommandProbe = (command: string, args: readonly string[], options: {env: NodeJS.ProcessEnv; timeout: number; maxBuffer: number}) => string | null;
export type OmarchyProbeOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  home?: string;
  resolve?: (command: string) => string | undefined;
  readFile?: (path: string) => string | null;
  isDirectory?: (path: string) => boolean;
  run?: CommandProbe;
  now?: () => number;
};

type Installation = Pick<OmarchyProfile, 'kind' | 'version' | 'major' | 'source' | 'root' | 'packageName'>;
const packagedRoot = '/usr/share/omarchy';
const maxProbeBytes = 4096;
const probeTimeoutMs = 500;
const installationCache = new Map<string, {checkedAt: number; installation: Installation}>();
const probeIdentities = new WeakMap<object, number>();
let nextProbeIdentity = 0;
const absent: Installation = {kind: 'none', version: null, major: null, source: null, root: null, packageName: null};

/** Omarchy is desktop evidence, not a replacement for the Linux platform ID. */
export function identifyOmarchy(options: OmarchyProbeOptions = {}): OmarchyProfile {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const remote = Boolean(env.SSH_CONNECTION?.trim() || env.SSH_CLIENT?.trim() || env.SSH_TTY?.trim() || /^(?:1|true|yes)$/i.test(env.XDG_SESSION_REMOTE ?? ''));
  const headless = /^(?:tty|unspecified)$/i.test(env.XDG_SESSION_TYPE ?? '');
  const type = !headless && env.WAYLAND_DISPLAY?.trim() ? 'wayland' : !headless && env.DISPLAY?.trim() ? 'x11' : 'headless';
  const session: OmarchyProfile['session'] = {type, remote, localDesktop: !remote && type !== 'headless'};
  const unavailable: OmarchyProfile['terminal'] = {available: false, command: null, missing: []};
  const injected = Boolean(options.readFile || options.isDirectory || options.run);
  // Cross-platform callers/tests must not inspect the execution host's files.
  if (identifyPlatform({platform, env}).id !== 'linux' || platform !== process.platform && !injected) {
    return {...absent, session, terminal: unavailable};
  }
  const resolve = options.resolve ?? (command => resolveCommandDetails(command, {platform, env}).path ?? undefined);
  const home = options.home ?? env.HOME ?? homedir();
  const readFile = options.readFile ?? readSmallFile;
  const isDirectory = options.isDirectory ?? directoryExists;
  const run = options.run ?? probeCommand;
  const now = (options.now ?? Date.now)();
  const key = [home, env.OMARCHY_PATH, env.PATH, options.resolve, readFile, isDirectory, run].map(value => typeof value === 'function' ? probeIdentity(value) : value).join('\0');
  // Cache installation probes, but revalidate launcher executables/session on
  // every request so saved alarm selectors do not retain stale capabilities.
  const cached = installationCache.get(key);
  const installation = cached && now >= cached.checkedAt && now - cached.checkedAt < 5000 ? cached.installation
    : detectInstallation({env, home, resolve, readFile, isDirectory, run});
  if (installation !== cached?.installation) {
    if (installationCache.size >= 32) installationCache.clear();
    installationCache.set(key, {checkedAt: now, installation});
  }
  if (installation.kind !== 'quattro') return {...installation, session, terminal: unavailable};

  const command = resolveAbsolute(resolve, posix.join(packagedRoot, 'bin', 'omarchy-launch-tui')) ?? resolveAbsolute(resolve, 'omarchy-launch-tui');
  // The upstream script invokes these by name. Fallback executable discovery
  // outside PATH cannot establish that its unchanged environment can run them.
  const missing = ['setsid', 'uwsm-app', 'xdg-terminal-exec'].filter(name => !reachableOnPath(resolve, name, env.PATH));
  if (!command) missing.unshift('omarchy-launch-tui');
  if (!session.localDesktop || type !== 'wayland') missing.push('local-wayland-session');
  if (!env.DBUS_SESSION_BUS_ADDRESS?.trim()) missing.push('session-bus');
  return {...installation, session, terminal: {available: missing.length === 0, command, missing}};
}

function detectInstallation(options: Required<Pick<OmarchyProbeOptions, 'env' | 'home' | 'resolve' | 'readFile' | 'isDirectory' | 'run'>>): Installation {
  const {env, home, resolve, readFile, isDirectory, run} = options;
  const configuredRoot = safeAbsolute(env.OMARCHY_PATH);
  // A custom checkout is deliberately kept separate from the packaged release.
  if (configuredRoot && configuredRoot !== packagedRoot && isDirectory(configuredRoot)) {
    const metadata = versionFrom(readFile(posix.join(configuredRoot, 'version')));
    const helper = resolveAbsolute(resolve, posix.join(configuredRoot, 'bin', 'omarchy-version'));
    if (metadata || helper) return {kind: metadata?.major === 3 ? 'legacy' : 'development', version: metadata?.version ?? null, major: metadata?.major ?? null, source: metadata ? 'legacy-metadata' : 'helper', root: configuredRoot, packageName: null};
  }
  if (isDirectory(packagedRoot)) {
    const pacman = resolveAbsolute(resolve, 'pacman');
    if (pacman) {
      for (const name of ['omarchy-dev', 'omarchy']) {
        const output = boundedOutput(run(pacman, ['-Q', name], {env, timeout: probeTimeoutMs, maxBuffer: maxProbeBytes}));
        const match = output && new RegExp(`^${name} ([^\\s]+)$`).exec(output);
        if (!match) continue;
        const version = versionFrom(match[1]!);
        return {kind: name === 'omarchy-dev' ? 'development' : releaseKind(version?.major), version: version?.version ?? match[1]!, major: version?.major ?? null, source: 'package', root: packagedRoot, packageName: name};
      }
    }
    const helper = resolveAbsolute(resolve, posix.join(packagedRoot, 'bin', 'omarchy-version'));
    const output = helper ? boundedOutput(run(helper, [], {env: {...env, OMARCHY_PATH: packagedRoot}, timeout: probeTimeoutMs, maxBuffer: maxProbeBytes})) : null;
    const version = versionFrom(output);
    // The packaged helper strips the package name from both omarchy-dev and
    // omarchy. Its numeric output preserves version diagnostics but cannot
    // establish the stable channel needed for automatic Quattro integration.
    return {kind: output?.startsWith('dev') ? 'development' : 'unknown', version: version?.version ?? output, major: version?.major ?? null, source: output ? 'helper' : null, root: packagedRoot, packageName: null};
  }
  const legacyRoot = safeAbsolute(posix.join(home, '.local', 'share', 'omarchy'));
  const metadata = legacyRoot && isDirectory(legacyRoot) ? versionFrom(readFile(posix.join(legacyRoot, 'version'))) : null;
  if (metadata && legacyRoot) return {kind: metadata.major === 3 ? 'legacy' : 'development', ...metadata, source: 'legacy-metadata', root: legacyRoot, packageName: null};
  return {...absent};
}

function releaseKind(major: number | undefined): Installation['kind'] { return major === 4 ? 'quattro' : major !== undefined && major < 4 ? 'legacy' : 'unknown'; }
function probeIdentity(probe: object): number { const current = probeIdentities.get(probe); if (current !== undefined) return current; const next = ++nextProbeIdentity; probeIdentities.set(probe, next); return next; }
function boundedOutput(value: string | null): string | null { const trimmed = value?.trim(); return trimmed && Buffer.byteLength(value!, 'utf8') <= maxProbeBytes && !/[\0\r\n]/.test(trimmed) ? trimmed : null; }
function versionFrom(value: string | null): {version: string; major: number} | null {
  const version = boundedOutput(value);
  const match = version && /^(?:\d+:)?(\d+)\.\d+\.\d+(?:-\d+(?:\.\d+)?)?$/.exec(version);
  return match ? {version: version!, major: Number(match[1])} : null;
}
function safeAbsolute(value: string | undefined): string | null { return value && posix.isAbsolute(value) && !/[\0\r\n]/.test(value) ? posix.normalize(value) : null; }
function resolveAbsolute(resolve: (command: string) => string | undefined, command: string): string | null { return safeAbsolute(resolve(command)); }
function reachableOnPath(resolve: (command: string) => string | undefined, command: string, path: string | undefined): boolean {
  if (path === undefined || /[\0\r\n]/.test(path)) return false;
  return path.split(':').some(directory => {
    const candidate = posix.resolve(directory || '.', command);
    return resolveAbsolute(resolve, candidate) === candidate;
  });
}
function directoryExists(path: string): boolean { try { return statSync(path).isDirectory(); } catch { return false; } }
function readSmallFile(path: string): string | null {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > maxProbeBytes) return null;
    const buffer = Buffer.alloc(maxProbeBytes + 1);
    const count = readSync(descriptor, buffer, 0, buffer.length, 0);
    return count > maxProbeBytes ? null : buffer.toString('utf8', 0, count);
  } catch { return null; }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}
function probeCommand(command: string, args: readonly string[], options: Parameters<CommandProbe>[2]): string | null {
  try {
    const result = spawnSync(command, args, {...options, killSignal: 'SIGKILL', encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
    return result.error || result.status !== 0 ? null : boundedOutput(result.stdout);
  } catch { return null; }
}
