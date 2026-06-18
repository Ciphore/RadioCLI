import {spawn} from 'node:child_process';
import {resolveCommand} from '../player/command.js';

type SystemCommand = {
  command: string;
  args: string[];
};

// The command used to open a URL in the platform's default handler.
export function openExternalCommand(platform: NodeJS.Platform = process.platform): SystemCommand {
  if (platform === 'darwin') {
    return {command: 'open', args: []};
  }

  if (platform === 'win32') {
    // The empty "" is the window title argument `start` expects before the URL.
    return {command: 'cmd', args: ['/c', 'start', '']};
  }

  return {command: 'xdg-open', args: []};
}

// Candidate clipboard tools per platform, in priority order. pbcopy/clip ship
// with macOS/Windows; Linux/BSD rely on whichever of these is installed.
export function clipboardCommands(platform: NodeJS.Platform = process.platform): SystemCommand[] {
  if (platform === 'darwin') {
    return [{command: 'pbcopy', args: []}];
  }

  if (platform === 'win32') {
    return [{command: 'clip', args: []}];
  }

  return [
    {command: 'wl-copy', args: []},
    {command: 'xclip', args: ['-selection', 'clipboard']},
    {command: 'xsel', args: ['--clipboard', '--input']}
  ];
}

export function openExternal(url: string, platform: NodeJS.Platform = process.platform): void {
  const {command, args} = openExternalCommand(platform);
  try {
    const child = spawn(resolveCommand(command) ?? command, [...args, url], {stdio: 'ignore', detached: true});
    child.on('error', () => undefined);
    child.unref();
  } catch {
    // Opening a browser is best-effort; never crash the TUI over it.
  }
}

export function copyToClipboard(text: string, platform: NodeJS.Platform = process.platform): boolean {
  for (const {command, args} of clipboardCommands(platform)) {
    const resolved = resolveCommand(command);
    if (!resolved) {
      continue;
    }

    try {
      const child = spawn(resolved, args, {stdio: ['pipe', 'ignore', 'ignore']});
      child.on('error', () => undefined);
      child.stdin.write(text);
      child.stdin.end();
      return true;
    } catch {
      continue;
    }
  }

  return false;
}
