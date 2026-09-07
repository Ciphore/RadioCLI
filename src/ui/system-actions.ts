import {spawn, type ChildProcess, type SpawnOptions} from 'node:child_process';
import {resolveCommand} from '../player/command.js';
import {safeExternalHttpUrl} from '../safety.js';
import {browserCommands, clipboardCandidates, hasGraphicalSession, type SystemCommand} from '../platform/desktop.js';
import {identifyPlatform} from '../platform/runtime.js';

// The command used to open a URL in the platform's default handler.
export function openExternalCommand(platform: NodeJS.Platform = process.platform): SystemCommand | undefined {
  return browserCommands(identifyPlatform({platform}))[0];
}

// Candidate clipboard tools per platform, in priority order. pbcopy/clip ship
// with macOS/Windows; Linux/BSD rely on whichever of these is installed.
export function clipboardCommands(platform: NodeJS.Platform = process.platform): SystemCommand[] {
  return clipboardCandidates(identifyPlatform({platform}));
}

type ActionDeps = {
  env?: NodeJS.ProcessEnv;
  resolve?: (command: string) => string | null;
  spawn?: (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;
  timeoutMs?: number;
};

export async function openExternal(url: string, platform: NodeJS.Platform = process.platform, deps: ActionDeps = {}): Promise<boolean> {
  const safeUrl = safeExternalHttpUrl(url);
  const env = deps.env ?? process.env;
  const host = identifyPlatform({platform, env});
  if (!safeUrl || !hasGraphicalSession(host, env)) return false;
  for (const {command, args} of browserCommands(host)) {
    const executable = (deps.resolve ?? resolveCommand)(command);
    if (executable && await runHelper(executable, [...args, safeUrl], undefined, deps)) return true;
  }
  return false;
}

export async function copyToClipboard(text: string, platform: NodeJS.Platform = process.platform, deps: ActionDeps = {}): Promise<boolean> {
  const env = deps.env ?? process.env;
  const host = identifyPlatform({platform, env});
  if (!hasGraphicalSession(host, env)) return false;
  for (const {command, args} of clipboardCandidates(host)) {
    const executable = (deps.resolve ?? resolveCommand)(command);
    if (executable && await runHelper(executable, args, text, deps)) return true;
  }
  return false;
}

function runHelper(command: string, args: string[], input: string | undefined, deps: ActionDeps): Promise<boolean> {
  return new Promise(resolve => {
    let child: ChildProcess | undefined;
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => { child?.kill(); finish(false); }, deps.timeoutMs ?? 5000);
    try {
      child = (deps.spawn ?? spawn)(command, args, {stdio: input === undefined ? 'ignore' : ['pipe', 'ignore', 'ignore'], env: deps.env ?? process.env, windowsHide: true});
      child.once('error', () => finish(false));
      child.once('close', code => finish(code === 0));
      child.stdin?.on('error', () => { child?.kill(); finish(false); });
      if (input !== undefined) child.stdin?.end(input);
    } catch {
      finish(false);
    }
  });
}
