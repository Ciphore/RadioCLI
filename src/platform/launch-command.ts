import {pathEnvironmentKeys} from './paths.js';
import type {ChildProcess} from 'node:child_process';
import {posix, win32} from 'node:path';

const applicationEnvironmentKeys = [
  'RADIOCLI_MPV_PATH',
  'RADIOCLI_FFPLAY_PATH',
  'RADIOCLI_VLC_PATH',
  'RADIOCLI_FFMPEG_PATH',
  'RADIOCLI_OFFLINE',
  'RADIOCLI_LOW_BANDWIDTH'
] as const;

const desktopEnvironmentKeys = ['DISPLAY', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS'] as const;

/** Persist only application settings and the desktop connection a job needs. */
export function launchEnvironment(
  env: NodeJS.ProcessEnv,
  options: {includeDesktop?: boolean; terminal?: string; platform?: string; cwd?: string} = {}
): Record<string, string> {
  const result: Record<string, string> = {};
  const platform = options.platform ?? process.platform;
  const path = platform === 'win32' ? win32 : posix;
  const add = (key: string, value: string | undefined) => {
    if (value === undefined) return;
    if (/[\r\n\0]/.test(value)) throw new Error(`${key} cannot contain control characters in a launch environment.`);
    result[key] = value;
  };
  for (const key of pathEnvironmentKeys) {
    const value = env[key];
    add(key, value);
    if (value === undefined) continue;
    // Empty overrides fall back; empty roots select the invoking directory.
    // Windows rejects an empty USERPROFILE, while HOME is unused there.
    if (value === '' && (key === 'RADIOCLI_HOME' || key === 'RADIO_ATLAS_HOME' || key === 'USERPROFILE' || key === 'HOME' && platform === 'win32')) continue;
    // Windows root-relative paths also depend on the invoking drive. Fully
    // qualified values need no cwd lookup (which can fail after cwd removal).
    const absolute = path.isAbsolute(value) && (platform !== 'win32' || /^(?:[a-z]:[\\/]|[\\/]{2})/i.test(value));
    if (!absolute) add(key, path.resolve(options.cwd ?? process.cwd(), value));
  }
  for (const key of applicationEnvironmentKeys) add(key, env[key]);
  if (options.includeDesktop) for (const key of desktopEnvironmentKeys) add(key, env[key]);
  add('RADIOCLI_ALARM_TERMINAL', options.terminal);
  return result;
}

/** Keep application argv and approved environment out of native shell syntax. */
export function nodeLaunchCommand(nodePath: string, args: readonly string[], environment: Record<string, string>): string[] {
  if ([nodePath, ...args, ...Object.keys(environment), ...Object.values(environment)].some(value => value.includes('\0'))) {
    throw new Error('Launch command values cannot contain NUL bytes.');
  }
  // This fixed program contains no double quotes, including after expansion.
  // PowerShell 5 and Task Scheduler only receive this program and encoded data.
  // A terminal server or scheduler may have unrelated path overrides. Clear the
  // complete identity before restoring this launch's snapshot, preserving absent
  // selectors and the path layer's existing empty-value/default semantics.
  const keys = pathEnvironmentKeys.map(key => `'${key}'`).join(',');
  const program = `const p=JSON.parse(Buffer.from(process.argv[1],'base64url').toString('utf8'));const e={...process.env};for(const k of Object.keys(e))if([${keys}].includes(process.platform==='win32'?k.toUpperCase():k))delete e[k];const r=require('node:child_process').spawnSync(process.execPath,p.args,{stdio:'inherit',env:{...e,...p.environment}});if(r.error)console.error(r.error.message);process.exit(r.status??1);`;
  return [nodePath, '-e', program, Buffer.from(JSON.stringify({args, environment}), 'utf8').toString('base64url')];
}

/** Process acceptance is separate from application/session readiness. */
export function waitForLaunch(child: ChildProcess, options: {waitForExit?: boolean} = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let acceptedTimer: NodeJS.Timeout | undefined;
    let forceTimer: NodeJS.Timeout | undefined;
    let cleanupTimer: NodeJS.Timeout | undefined;
    let stopError: Error | undefined;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(startupTimer);
      if (acceptedTimer) clearTimeout(acceptedTimer);
      clearTimeout(forceTimer);
      clearTimeout(cleanupTimer);
      if (error) reject(error); else resolve();
    };
    const signal = (value: NodeJS.Signals) => {
      try { child.kill(value); } catch { /* Retain the launch failure and bounded cleanup. */ }
    };
    const stop = (error: Error) => {
      if (settled || stopError) return;
      stopError = error;
      clearTimeout(startupTimer);
      if (acceptedTimer) clearTimeout(acceptedTimer);
      forceTimer = setTimeout(() => signal('SIGKILL'), 250);
      cleanupTimer = setTimeout(() => { child.unref(); finish(error); }, 1_000);
      signal('SIGTERM');
    };
    const startupTimer = setTimeout(() => {
      const error = new Error('Process launcher did not report process startup.');
      if (child.pid) stop(error); else finish(error);
    }, 3_000);
    // Keep a listener after acceptance: a late native error must not become an
    // unhandled EventEmitter error in the application that requested the launch.
    child.on('error', error => {
      if (!settled && child.pid) stop(error); else finish(error);
    });
    child.once('close', (code, signal) => finish(stopError ?? (code === 0 ? undefined : new Error(`Process launcher exited with ${code ?? signal ?? 'unknown status'}.`))));
    child.once('spawn', () => {
      if (options.waitForExit) {
        clearTimeout(startupTimer);
        acceptedTimer = setTimeout(() => stop(new Error('Launch bootstrap did not complete.')), 10_000);
      } else {
        child.unref();
        acceptedTimer = setTimeout(() => finish(), 100);
      }
    });
  });
}
