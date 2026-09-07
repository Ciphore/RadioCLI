import {identifyPlatform, type PlatformProfile} from './runtime.js';

export type SystemCommand = {command: string; args: string[]};

/** Command plans only. Callers must check the session and observe execution. */
export function browserCommands(host: PlatformProfile = identifyPlatform()): SystemCommand[] {
  if (host.id === 'darwin') return [{command: 'open', args: []}];
  if (host.id === 'win32') return [{command: 'explorer', args: []}];
  if (host.id === 'linux') return [{command: 'xdg-open', args: []}];
  return [];
}

export function clipboardCandidates(host: PlatformProfile = identifyPlatform()): SystemCommand[] {
  if (host.id === 'darwin') return [{command: 'pbcopy', args: []}];
  if (host.id === 'win32') return [{command: 'clip', args: []}];
  if (host.id === 'linux') return [
    {command: 'wl-copy', args: []},
    {command: 'xclip', args: ['-selection', 'clipboard']},
    {command: 'xsel', args: ['--clipboard', '--input']}
  ];
  return [];
}

export function hasGraphicalSession(host: PlatformProfile, env: NodeJS.ProcessEnv = process.env): boolean {
  if (host.id === 'darwin' || host.id === 'win32') return !env.SSH_CONNECTION && !env.SSH_TTY;
  return Boolean(env.DISPLAY || env.WAYLAND_DISPLAY);
}
