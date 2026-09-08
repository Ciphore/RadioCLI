import {readFileSync} from 'node:fs';
import {endianness, release} from 'node:os';

type PlatformId = 'darwin' | 'win32' | 'linux' | 'freebsd' | 'openbsd' | 'netbsd' | 'android' | 'termux' | 'haiku' | 'sunos' | 'aix' | 'unknown';
type Libc = 'glibc' | 'musl' | 'bionic' | 'unknown' | 'none';

export type PlatformProfile = {
  id: PlatformId;
  platform: string;
  arch: string;
  armVersion: number | null;
  endianness: 'LE' | 'BE';
  release: string;
  nodeVersion: string;
  nodeMajor: number;
  libc: Libc;
  isWsl: boolean;
  osRelease: string;
};

type PlatformInput = {
  platform?: string;
  arch?: string;
  armVersion?: number | null;
  endianness?: 'LE' | 'BE';
  release?: string;
  nodeVersion?: string;
  libc?: Libc;
  env?: NodeJS.ProcessEnv;
  osRelease?: string;
};

const knownPlatforms = new Set<string>(['darwin', 'win32', 'linux', 'freebsd', 'openbsd', 'netbsd', 'android', 'haiku', 'sunos', 'aix']);

/** Host facts are independent from service readiness and project support tiers. */
export function identifyPlatform(input: PlatformInput = {}): PlatformProfile {
  const platform = input.platform ?? process.platform;
  const env = input.env ?? process.env;
  const termux = (platform === 'android' || platform === 'linux') && Boolean(env.TERMUX_VERSION || env.PREFIX?.match(/^\/data\/(?:data|user\/\d+)\/com\.termux(?:\.[^/]+)?\/files\/usr\/?$/));
  const id: PlatformId = termux ? 'termux' : knownPlatforms.has(platform) ? platform as PlatformId : 'unknown';
  const kernelRelease = input.release ?? release();
  const nodeVersion = (input.nodeVersion ?? process.versions.node).replace(/^v/, '');
  const arch = input.arch ?? process.arch;
  const armVersion = input.armVersion !== undefined ? input.armVersion
    : platform === process.platform && arch === process.arch ? Number(Reflect.get(process.config.variables, 'arm_version')) : null;
  return {
    id,
    platform,
    arch,
    armVersion: arch === 'arm' && armVersion !== null && Number.isInteger(armVersion) && armVersion > 0 ? armVersion : null,
    endianness: input.endianness ?? endianness(),
    release: kernelRelease,
    nodeVersion,
    nodeMajor: Number.parseInt(nodeVersion, 10),
    libc: platform === 'android' || termux ? 'bionic' : input.libc ?? (platform === 'linux' ? nativeLibc(platform) : 'none'),
    isWsl: id === 'linux' && Boolean(env.WSL_INTEROP || env.WSL_DISTRO_NAME || /microsoft|wsl/i.test(kernelRelease)),
    osRelease: input.osRelease ?? (platform === 'linux' && platform === process.platform ? readLinuxOsRelease() : '')
  };
}

export type NativeAdapterPolicy = {
  scheduler: 'launchd' | 'task-scheduler' | 'systemd' | null;
  inhibitor: 'caffeinate' | 'logind' | 'windows' | null;
  volume: 'macos' | 'windows' | 'unix-audio' | null;
  terminal: 'macos' | 'windows' | 'unix' | null;
  ipc: 'named-pipe' | 'unix-socket';
  posixPermissions: boolean;
  airPlay: boolean;
};

/** Selecting a native adapter does not establish that its service is running. */
export function nativeAdapters(host: PlatformProfile = identifyPlatform()): NativeAdapterPolicy {
  const portable: NativeAdapterPolicy = {scheduler: null, inhibitor: null, volume: null, terminal: null, ipc: 'unix-socket', posixPermissions: true, airPlay: false};
  if (host.id === 'darwin') return {...portable, scheduler: 'launchd', inhibitor: 'caffeinate', volume: 'macos', terminal: 'macos', airPlay: true};
  if (host.id === 'win32') return {...portable, scheduler: 'task-scheduler', inhibitor: 'windows', volume: 'windows', terminal: 'windows', ipc: 'named-pipe', posixPermissions: false};
  if (host.id === 'linux') return {...portable, scheduler: 'systemd', inhibitor: 'logind', volume: 'unix-audio', terminal: 'unix'};
  if (['freebsd', 'openbsd', 'netbsd'].includes(host.id)) return {...portable, terminal: 'unix'};
  return portable;
}

export function readLinuxOsRelease(platform: string = process.platform): string {
  if (platform !== 'linux') return '';
  try { return readFileSync('/etc/os-release', 'utf8'); }
  catch { return ''; }
}

let detectedLibc: Libc | undefined;
function nativeLibc(platform: string): Libc {
  if (platform !== process.platform) return 'unknown';
  if (detectedLibc) return detectedLibc;
  try {
    const report = process.report.getReport() as {header?: {glibcVersionRuntime?: string}; sharedObjects?: string[]};
    detectedLibc = report.header?.glibcVersionRuntime ? 'glibc'
      : report.sharedObjects?.some(path => /(?:ld-musl|libc\.musl)/.test(path)) ? 'musl' : 'unknown';
  } catch { detectedLibc = 'unknown'; }
  return detectedLibc;
}
