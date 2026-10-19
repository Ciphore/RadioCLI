import {spawn} from 'node:child_process';

type AirPlayCommandResult = {output: string; code: number | null; timedOut: boolean; truncated: boolean};
export type AirPlayCommandRunner = (command: string, args: string[], timeoutMs: number, maxOutputBytes: number, options?: {env?: NodeJS.ProcessEnv}) => Promise<AirPlayCommandResult>;

/** Short, bounded probes. Only stdout is returned; protocol diagnostics stay private. */
export const runAirPlayCommand: AirPlayCommandRunner = (command, args, timeoutMs, maxOutputBytes, options) => new Promise(resolve => {
  const chunks: Buffer[] = [];
  let bytes = 0;
  let totalBytes = 0;
  let settled = false;
  let child: ReturnType<typeof spawn>;
  const finish = (code: number | null, timedOut = false, truncated = false) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    resolve({output: Buffer.concat(chunks, bytes).toString('utf8'), code, timedOut, truncated});
  };
  const stop = () => {
    if (settled || !child) return;
    // A dedicated POSIX process group includes ordinary helper descendants.
    // Closing inherited pipes and releasing the child handle also bounds the
    // parent on Windows, or if a descendant escaped into a separate session.
    if (process.platform !== 'win32' && child.pid) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* The group may already have exited. */ }
    }
    try { child.kill('SIGKILL'); } catch { /* Still release our handles if termination fails. */ }
    child.stdout?.destroy();
    child.stderr?.destroy();
    child.unref();
  };
  const timer = setTimeout(() => { stop(); finish(null, true); }, Math.max(1, timeoutMs));
  try { child = spawn(command, args, {detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: {...(options?.env ?? process.env), LC_ALL: 'C'}}); }
  catch { finish(null); return; }
  const append = (chunk: Buffer, stdout: boolean) => {
    if (settled) return;
    const remaining = Math.max(0, maxOutputBytes - totalBytes);
    totalBytes += chunk.length;
    if (stdout && remaining > 0) { const kept = chunk.subarray(0, remaining); chunks.push(kept); bytes += kept.length; }
    if (totalBytes > maxOutputBytes) { stop(); finish(null, false, true); }
  };
  child.stdout?.on('data', (chunk: Buffer) => append(chunk, true));
  child.stderr?.on('data', (chunk: Buffer) => append(chunk, false));
  child.once('error', () => { stop(); finish(null); });
  child.once('close', code => finish(code));
});
