import {identifyPlatform, type PlatformProfile} from './runtime.js';

export type SystemCommand = {command: string; args: string[]};

/** Command plans only. Callers must check the session and observe execution. */
export function browserCommands(host: PlatformProfile = identifyPlatform()): SystemCommand[] {
  // termux-tools opens one URL through Android's VIEW intent.
  if (host.id === 'termux') return [{command: 'termux-open-url', args: []}];
  if (host.id === 'darwin') return [{command: 'open', args: []}];
  if (host.id === 'win32') return [{command: 'explorer', args: []}];
  if (['linux', 'freebsd', 'openbsd', 'netbsd'].includes(host.id)) return [{command: 'xdg-open', args: []}];
  return [];
}

export function clipboardCandidates(host: PlatformProfile = identifyPlatform()): SystemCommand[] {
  // No arguments makes termux-clipboard-set read stdin. Its matching Android
  // API app and permissions are still required; the caller checks execution.
  if (host.id === 'termux') return [{command: 'termux-clipboard-set', args: []}];
  if (host.id === 'darwin') return [{command: 'pbcopy', args: []}];
  if (host.id === 'win32') return [{command: 'clip', args: []}];
  if (['linux', 'freebsd', 'openbsd', 'netbsd'].includes(host.id)) return [
    {command: 'wl-copy', args: []},
    {command: 'xclip', args: ['-selection', 'clipboard']},
    {command: 'xsel', args: ['--clipboard', '--input']}
  ];
  return [];
}

export function hasGraphicalSession(host: PlatformProfile, env: NodeJS.ProcessEnv = process.env): boolean {
  if (host.id === 'darwin' || host.id === 'win32' || host.id === 'termux') return !env.SSH_CONNECTION && !env.SSH_TTY;
  return ['linux', 'freebsd', 'openbsd', 'netbsd'].includes(host.id) && Boolean(env.DISPLAY || env.WAYLAND_DISPLAY);
}
