import {accessSync, constants, existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';

export function commandExists(command: string): boolean {
  return resolveCommand(command) !== null;
}

// Resolve a runnable path for a command. GUI-launched terminals (macOS .app
// terminals, some Linux desktop launchers) frequently do not inherit the login
// shell PATH, so a perfectly installed binary in /opt/homebrew/bin or a Windows
// package-manager shim looks "missing" to a bare PATH lookup. We therefore fall
// back to probing well-known install locations before giving up.
export function resolveCommand(command: string): string | null {
  const cached = commandCache.get(command);
  if (cached && Date.now() - cached.checkedAt < commandCacheTtlMs) {
    return cached.path;
  }

  const path = lookupOnPath(command) ?? probeKnownLocations(command);
  commandCache.set(command, {path, checkedAt: Date.now()});
  return path;
}

function lookupOnPath(command: string): string | null {
  if (command.includes('/') || command.includes('\\')) {
    return isRunnable(command) ? command : null;
  }

  const pathEntries = (process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':').filter(Boolean);
  for (const directory of pathEntries) {
    for (const name of candidateNames(command)) {
      const candidate = join(directory.replace(/^"|"$/g, ''), name);
      if (isRunnable(candidate)) return candidate;
    }
  }
  return null;
}

function probeKnownLocations(command: string): string | null {
  for (const candidate of candidatePaths(command)) {
    if (isRunnable(candidate)) {
      return candidate;
    }
  }

  return null;
}

function candidatePaths(command: string): string[] {
  const paths: string[] = [];
  const names = candidateNames(command);
  for (const dir of knownBinaryDirs()) {
    for (const name of names) {
      paths.push(join(dir, name));
    }
  }

  paths.push(...appBundlePaths(command));
  return paths;
}

function candidateNames(command: string): string[] {
  if (process.platform === 'win32' && !/\.[a-z0-9]+$/i.test(command)) {
    const extensions = (process.env.PATHEXT ?? '.EXE;.COM;.BAT;.CMD').split(';').filter(Boolean);
    return [...extensions.map(extension => `${command}${extension.toLowerCase()}`), command];
  }

  return [command];
}

const commandCacheTtlMs = 5000;
const commandCache = new Map<string, {path: string | null; checkedAt: number}>();

function isRunnable(path: string): boolean {
  if (!existsSync(path)) return false;
  if (process.platform === 'win32') return true;
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function knownBinaryDirs(): string[] {
  const home = homedir();
  if (process.platform === 'darwin') {
    return ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/opt/local/bin', '/sw/bin', join(home, '.local', 'bin')];
  }

  if (process.platform === 'win32') {
    const dirs: string[] = [];
    if (process.env.LOCALAPPDATA) {
      dirs.push(join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'));
    }

    dirs.push(join(home, 'scoop', 'shims'));
    if (process.env.ProgramData) {
      dirs.push(join(process.env.ProgramData, 'chocolatey', 'bin'));
    }

    return dirs;
  }

  return [
    '/usr/bin',
    '/usr/local/bin',
    '/bin',
    '/usr/local/sbin',
    '/snap/bin',
    '/var/lib/flatpak/exports/bin',
    join(home, '.local', 'bin')
  ];
}

// Some media players (notably VLC) commonly install without putting a CLI entry
// on PATH, so probe their standard application directories directly.
function appBundlePaths(command: string): string[] {
  if (command !== 'vlc' && command !== 'cvlc') {
    return [];
  }

  if (process.platform === 'darwin') {
    return [
      '/Applications/VLC.app/Contents/MacOS/VLC',
      join(homedir(), 'Applications', 'VLC.app', 'Contents', 'MacOS', 'VLC')
    ];
  }

  if (process.platform === 'win32') {
    const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)']].filter(Boolean) as string[];
    return roots.map(root => join(root, 'VideoLAN', 'VLC', 'vlc.exe'));
  }

  return [];
}
