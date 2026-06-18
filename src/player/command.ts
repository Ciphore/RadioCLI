import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
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
  return lookupOnPath(command) ?? probeKnownLocations(command);
}

function lookupOnPath(command: string): string | null {
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(lookup, [command], {encoding: 'utf8'});
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return null;
  }

  const first = result.stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean);
  return first ?? null;
}

function probeKnownLocations(command: string): string | null {
  for (const candidate of candidatePaths(command)) {
    if (existsSync(candidate)) {
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
    return [`${command}.exe`, `${command}.com`, `${command}.bat`, `${command}.cmd`, command];
  }

  return [command];
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
