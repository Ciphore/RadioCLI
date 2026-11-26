import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {platformPaths} from '../platform/paths.js';
import {acquireFileLock} from '../storage/file-lock.js';

/** Serialize native registration changes with publication of runner claims.
 * Never hold a registration lock for the lifetime of audio playback. */
export class AlarmReconciliation {
  constructor(private readonly root = platformPaths().runtime, private readonly platform: NodeJS.Platform = process.platform) {}

  async run<T>(alarmId: string, work: () => T | Promise<T>): Promise<T> {
    const directory = join(this.root, 'alarm-reconciliation');
    mkdirSync(directory, {recursive: true, mode: 0o700});
    const path = join(directory, createHash('sha256').update(alarmId).digest('hex'));
    const deadline = performance.now() + 30_000;
    let release: (() => void) | undefined;
    while (!release) {
      try { release = acquireFileLock(path, 0, this.platform); }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        const retryable = code === 'EBUSY' || this.platform === 'win32' && (code === 'EPERM' || code === 'EACCES');
        if (!retryable || performance.now() >= deadline) throw error;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }
    try { return await work(); } finally { release(); }
  }

  active(alarmId: string): boolean {
    const directory = join(this.root, 'locks');
    if (!existsSync(directory)) return false;
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      try {
        if (JSON.parse(readFileSync(join(path, 'alarm-id'), 'utf8')) !== alarmId) continue;
        if (existsSync(join(path, 'completed'))) continue;
        const pid = Number(readFileSync(join(path, 'running'), 'utf8'));
        if (!Number.isSafeInteger(pid) || pid < 1) return true;
        try { process.kill(pid, 0); return true; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') return true; }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return false;
  }
}
