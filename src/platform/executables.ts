import {spawnSync} from 'node:child_process';
import {accessSync, constants, statSync} from 'node:fs';
import {homedir} from 'node:os';
import {posix, win32} from 'node:path';

export type CommandDiscovery = 'path' | 'configured-path' | 'package-manager-shim' | 'application-directory' | 'windows-registry' | 'missing';

export type CommandResolution = {
  path: string | null;
  discovery: CommandDiscovery;
  error?: string;
};

type CommandResolutionOptions = {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  home: string;
  isRunnable: (path: string) => boolean;
  registryPaths: (command: string) => string[];
};

export function commandExists(command: string): boolean {
  return resolveCommand(command) !== null;
}

// Resolve a runnable path for a command. GUI-launched terminals (macOS .app
// terminals, some Linux desktop launchers) frequently do not inherit the login
// shell PATH, while Windows installers often omit PATH entries entirely.
export function resolveCommand(command: string): string | null {
  return resolveCommandDetails(command).path;
}

export function resolveCommandDetails(
  command: string,
  overrides?: Partial<CommandResolutionOptions>
): CommandResolution {
  const variable = overrideVariable(command);
  const cacheKey = [command, process.env.PATH, process.env.PATHEXT, variable ? process.env[variable] : undefined].join('\0');
  if (!overrides) {
    const cached = commandCache.get(cacheKey);
    if (cached && Date.now() - cached.checkedAt < commandCacheTtlMs) return cached.resolution;
  }

  const platform = overrides?.platform ?? process.platform;
  const options: CommandResolutionOptions = {
    platform,
    env: overrides?.env ?? process.env,
    home: overrides?.home ?? homedir(),
    isRunnable: overrides?.isRunnable ?? (path => isRunnable(path, platform)),
    registryPaths: overrides?.registryPaths ?? (name => windowsRegistryPaths(name, platform))
  };
  const resolution = resolveUncached(command, options);

  if (!overrides) {
    if (commandCache.size >= 256) commandCache.clear();
    commandCache.set(cacheKey, {resolution, checkedAt: Date.now()});
  }
  return resolution;
}

function resolveUncached(command: string, options: CommandResolutionOptions): CommandResolution {
  const variable = overrideVariable(command);
  const configured = variable ? options.env[variable] : undefined;
  if (configured !== undefined) {
    const pathApi = options.platform === 'win32' ? win32 : posix;
    if (!configured || /[\0\r\n]/.test(configured) || !pathApi.isAbsolute(configured) || (options.platform === 'win32' && !/\.(exe|com)$/i.test(configured))) {
      return {path: null, discovery: 'configured-path', error: `${variable} must be an absolute native executable path, without shell arguments.`};
    }
    return options.isRunnable(configured) ? {path: configured, discovery: 'configured-path'}
      : {path: null, discovery: 'configured-path', error: `${variable} does not name a runnable file.`};
  }
  const pathMatch = lookupOnPath(command, options);
  if (pathMatch) return {path: pathMatch, discovery: 'path'};

  const shimMatch = firstRunnable(knownBinaryCandidates(command, options), options.isRunnable);
  if (shimMatch) return {path: shimMatch, discovery: 'package-manager-shim'};

  const appMatch = firstRunnable(applicationCandidates(command, options), options.isRunnable);
  if (appMatch) return {path: appMatch, discovery: 'application-directory'};

  if (options.platform === 'win32') {
    const registryMatch = firstRunnable(options.registryPaths(command), options.isRunnable);
    if (registryMatch) return {path: registryMatch, discovery: 'windows-registry'};
  }

  return {path: null, discovery: 'missing'};
}

function overrideVariable(command: string): string | undefined {
  return ({mpv: 'RADIOCLI_MPV_PATH', ffplay: 'RADIOCLI_FFPLAY_PATH', vlc: 'RADIOCLI_VLC_PATH', cvlc: 'RADIOCLI_VLC_PATH', ffmpeg: 'RADIOCLI_FFMPEG_PATH'} as Record<string, string>)[command];
}

function lookupOnPath(command: string, options: CommandResolutionOptions): string | null {
  if (command.includes('/') || command.includes('\\')) return options.isRunnable(command) ? command : null;

  const pathApi = options.platform === 'win32' ? win32 : posix;
  const separator = options.platform === 'win32' ? ';' : ':';
  const pathEntries = (options.env.PATH ?? '').split(separator).filter(Boolean);
  for (const directory of pathEntries) {
    for (const name of candidateNames(command, options.platform, options.env)) {
      const candidate = pathApi.join(directory.replace(/^"|"$/g, ''), name);
      if (options.isRunnable(candidate)) return candidate;
    }
  }
  return null;
}

function knownBinaryCandidates(command: string, options: CommandResolutionOptions): string[] {
  const pathApi = options.platform === 'win32' ? win32 : posix;
  const candidates: string[] = [];
  for (const directory of knownBinaryDirs(options)) {
    for (const name of candidateNames(command, options.platform, options.env)) {
      candidates.push(pathApi.join(directory, name));
    }
  }
  return candidates;
}

function candidateNames(command: string, platform: NodeJS.Platform, env: NodeJS.ProcessEnv): string[] {
  if (platform === 'win32' && !/\.[a-z0-9]+$/i.test(command)) {
    const extensions = (env.PATHEXT ?? '.EXE;.COM;.BAT;.CMD').split(';').filter(Boolean);
    return [...extensions.map(extension => `${command}${extension.toLowerCase()}`), command];
  }
  return [command];
}

const commandCacheTtlMs = 5000;
const commandCache = new Map<string, {resolution: CommandResolution; checkedAt: number}>();

export function clearCommandCache(): void {
  commandCache.clear();
}

function isRunnable(path: string, platform: NodeJS.Platform): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    if (platform !== 'win32') accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function knownBinaryDirs({platform, env, home}: CommandResolutionOptions): string[] {
  if (platform === 'darwin') {
    return ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/opt/local/bin', '/sw/bin', posix.join(home, '.local', 'bin')];
  }

  if (platform === 'win32') {
    const dirs: string[] = [];
    if (env.LOCALAPPDATA) dirs.push(win32.join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'));
    dirs.push(win32.join(home, 'scoop', 'shims'));
    if (env.ProgramData) dirs.push(win32.join(env.ProgramData, 'chocolatey', 'bin'));
    return dirs;
  }

  return [
    '/usr/bin',
    '/usr/local/bin',
    '/bin',
    '/usr/local/sbin',
    '/snap/bin',
    '/var/lib/flatpak/exports/bin',
    posix.join(home, '.local', 'bin')
  ];
}

// Media-player installers commonly skip PATH. Probe only their documented,
// narrow install locations so startup stays fast and filesystem access bounded.
function applicationCandidates(command: string, {platform, env, home}: CommandResolutionOptions): string[] {
  if ((command === 'vlc' || command === 'cvlc') && platform === 'darwin') {
    return [
      '/Applications/VLC.app/Contents/MacOS/VLC',
      posix.join(home, 'Applications', 'VLC.app', 'Contents', 'MacOS', 'VLC')
    ];
  }

  if (platform !== 'win32') return [];

  if (command === 'vlc' || command === 'cvlc') {
    return windowsProgramRoots(env).map(root => win32.join(root, 'VideoLAN', 'VLC', 'vlc.exe'));
  }

  if (command === 'mpv') {
    const candidates = windowsProgramRoots(env).flatMap(root => [
      win32.join(root, 'MPV Player', 'mpv.exe'),
      win32.join(root, 'MPV', 'mpv.exe'),
      win32.join(root, 'mpv', 'mpv.exe')
    ]);
    if (env.LOCALAPPDATA) {
      candidates.push(
        win32.join(env.LOCALAPPDATA, 'Programs', 'MPV Player', 'mpv.exe'),
        win32.join(env.LOCALAPPDATA, 'Programs', 'MPV', 'mpv.exe'),
        win32.join(env.LOCALAPPDATA, 'mpv', 'mpv.exe')
      );
    }
    return candidates;
  }

  return [];
}

function windowsProgramRoots(env: NodeJS.ProcessEnv): string[] {
  return [env.ProgramFiles, env['ProgramFiles(x86)']].filter((root): root is string => Boolean(root));
}

function windowsRegistryPaths(command: string, platform: NodeJS.Platform): string[] {
  if (platform !== 'win32' || command !== 'mpv') return [];

  const paths = [
    queryRegistryPath('HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\mpv.exe', '/ve'),
    queryRegistryPath('HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\mpv.exe', '/ve'),
    queryRegistryPath('HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MPV_Player_Automated_is1', '/v', 'InstallLocation')
  ];
  return paths.flatMap(path => path ? [path.toLowerCase().endsWith('.exe') ? path : win32.join(path, 'mpv.exe')] : []);
}

function queryRegistryPath(key: string, ...args: string[]): string | null {
  const result = spawnSync('reg.exe', ['query', key, ...args], {
    encoding: 'utf8',
    timeout: 1000,
    windowsHide: true
  });
  if (result.error || result.status !== 0) return null;

  const match = result.stdout.match(/REG_(?:EXPAND_)?SZ\s+(.+)$/m);
  return match?.[1]?.trim() || null;
}

function firstRunnable(paths: string[], isRunnablePath: (path: string) => boolean): string | null {
  for (const path of paths) {
    if (isRunnablePath(path)) return path;
  }
  return null;
}
