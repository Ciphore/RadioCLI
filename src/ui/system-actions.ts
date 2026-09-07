import {spawn} from 'node:child_process';
import {resolveCommand} from '../player/command.js';
import {safeExternalHttpUrl} from '../safety.js';
import {browserCommands, clipboardCandidates, type SystemCommand} from '../platform/desktop.js';
import {identifyPlatform} from '../platform/runtime.js';

// The command used to open a URL in the platform's default handler.
export function openExternalCommand(platform: NodeJS.Platform = process.platform): SystemCommand {
  return browserCommands(identifyPlatform({platform}))[0] ?? {command: 'xdg-open', args: []};
}

// Candidate clipboard tools per platform, in priority order. pbcopy/clip ship
// with macOS/Windows; Linux/BSD rely on whichever of these is installed.
export function clipboardCommands(platform: NodeJS.Platform = process.platform): SystemCommand[] {
  const commands = clipboardCandidates(identifyPlatform({platform}));
  return commands.length ? commands : clipboardCandidates(identifyPlatform({platform: 'linux', env: {}}));
}

export function openExternal(url: string, platform: NodeJS.Platform = process.platform): boolean {
  const safeUrl = safeExternalHttpUrl(url);
  if (!safeUrl) {
    return false;
  }

  const {command, args} = openExternalCommand(platform);
  try {
    const child = spawn(resolveCommand(command) ?? command, [...args, safeUrl], {stdio: 'ignore', detached: true});
    child.on('error', () => undefined);
    child.unref();
    return true;
  } catch {
    // Opening a browser is best-effort; never crash the TUI over it.
    return false;
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
