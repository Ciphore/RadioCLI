import {spawn, type ChildProcess, type SpawnOptions} from 'node:child_process';
import {resolveCommand} from '../platform/executables.js';
import {safeExternalHttpUrl} from '../safety.js';
import {browserCommands, clipboardCandidates, hasGraphicalSession} from '../platform/desktop.js';
import {identifyPlatform} from '../platform/runtime.js';
import {waitForLaunch} from '../platform/launch-command.js';

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
    if (!executable) continue;
    try {
      // xdg-open may run for the browser's entire lifetime. Observe startup
      // failure, then let the desktop application own its detached process.
      const child = (deps.spawn ?? spawn)(executable, [...args, safeUrl], {stdio: 'ignore', env, detached: true, windowsHide: true});
      await waitForLaunch(child);
      return true;
    } catch { /* Try the next available opener after a launch failure. */ }
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

function runHelper(command: string, args: string[], input: string, deps: ActionDeps): Promise<boolean> {
  return new Promise(resolve => {
    let child: ChildProcess | undefined;
    let settled = false;
    let stopping = false;
    let forceTimer: NodeJS.Timeout | undefined;
    let cleanupTimer: NodeJS.Timeout | undefined;
    const signal = (value: NodeJS.Signals) => {
      try { child?.kill(value); } catch { /* The failed action remains false; cleanup is still bounded. */ }
    };
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(forceTimer);
      clearTimeout(cleanupTimer);
      resolve(ok);
    };
    const stop = () => {
      if (settled || stopping) return;
      stopping = true;
      forceTimer = setTimeout(() => signal('SIGKILL'), 250);
      cleanupTimer = setTimeout(() => {
        // Even an uninterruptible OS process must not keep RadioCLI alive.
        child?.unref();
        finish(false);
      }, 1_000);
      child?.stdin?.destroy();
      signal('SIGTERM');
    };
    const timer = setTimeout(stop, deps.timeoutMs ?? 5000);
    try {
      child = (deps.spawn ?? spawn)(command, args, {stdio: ['pipe', 'ignore', 'ignore'], env: deps.env ?? process.env, windowsHide: true});
      child.on('error', () => { if (child?.pid) stop(); else finish(false); });
      child.once('close', code => finish(!stopping && code === 0));
      child.stdin?.on('error', stop);
      child.stdin?.end(input);
    } catch {
      if (child?.pid) stop(); else finish(false);
    }
  });
}
