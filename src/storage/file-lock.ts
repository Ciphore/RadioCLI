import {mkdirSync, readdirSync, renameSync, rmdirSync, unlinkSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';

/** An owner is never evicted for being slow. Only a positively dead PID or an
 * explicitly released generation can be reclaimed. Unknown/legacy locks fail
 * closed; their age cannot distinguish a crashed writer from a suspended one. */
export function acquireFileLock(directory: string, timeoutMs = 1000, platform: NodeJS.Platform = process.platform): () => void {
  const marker = `owner-${process.pid}-${randomUUID()}`;
  const deadline = performance.now() + timeoutMs;
  const pause = new Int32Array(new SharedArrayBuffer(4));
  const retry = (error?: unknown): void => {
    if (performance.now() >= deadline) {
      if (error) throw error;
      throw Object.assign(new Error('The library lock has a live or unknown owner.'), {code: 'EBUSY'});
    }
    Atomics.wait(pause, 0, 0, 10);
  };
  // Windows can briefly deny access while a previous lock directory is pending
  // deletion. Retry only before ownership, without treating denial as absence.
  const transient = (error: unknown): boolean => platform === 'win32' && ['EACCES', 'EPERM', 'EBUSY'].includes(codeOf(error) ?? '');
  while (true) {
    let acquired = false;
    try { mkdirSync(directory, {mode: 0o700}); acquired = true; }
    catch (error) {
      if (codeOf(error) !== 'EEXIST') {
        if (!transient(error)) throw error;
        retry(error);
        continue;
      }
    }
    if (acquired) {
      try { writeFileSync(join(directory, marker), '', {mode: 0o600, flag: 'wx'}); }
      catch (error) {
        // A failed write can leave its newly created marker behind. Remove only
        // our unique file; never clear a directory belonging to a later writer.
        try { unlinkSync(join(directory, marker)); } catch { /* May not have been created. */ }
        try { rmdirSync(directory); } catch { /* Never remove another generation. */ }
        throw error;
      }
      let released = false;
      return () => { if (!released) { released = true; finishLock(directory, marker); } };
    }

    try {
      const entries = readdirSync(directory);
      const owner = entries.length === 1 ? entries[0]! : '';
      const match = /^(owner|released)-([1-9]\d*)-([a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/.exec(owner);
      if (match && Number.isSafeInteger(Number(match[2])) && (match[1] === 'released' || isDead(Number(match[2])))) {
        // Compare and claim the exact marker, never rename/delete the lock
        // directory after an observation: a different writer may now own it.
        const reaper = `owner-${process.pid}-${randomUUID()}`;
        renameSync(join(directory, owner), join(directory, reaper));
        finishLock(directory, reaper);
      }
    } catch (error) {
      if (codeOf(error) !== 'ENOENT') {
        if (!transient(error)) throw error;
        retry(error);
        continue;
      }
    }
    retry();
  }
}

function isDead(pid: number): boolean {
  try { process.kill(pid, 0); return false; }
  catch (error) { return codeOf(error) === 'ESRCH'; }
}

function finishLock(directory: string, marker: string): void {
  const released = `released-${process.pid}-${randomUUID()}`;
  try { renameSync(join(directory, marker), join(directory, released)); }
  catch { try { removeOwnedLock(directory, marker); } catch { /* Preserve the transaction result. */ } return; }
  // Publish completion before cleanup so a failed unlink is recoverable even
  // while this process is alive. Cleanup must not turn a commit into a failure.
  try { removeOwnedLock(directory, released); } catch { /* Recover on the next acquisition. */ }
}

function removeOwnedLock(directory: string, marker: string): void {
  try { unlinkSync(join(directory, marker)); }
  catch (error) { if (codeOf(error) === 'ENOENT') return; throw error; }
  // An empty directory can be concurrently replaced only by a legacy writer.
  // rmdir cannot remove a new nonempty generation, unlike recursive rm.
  try { rmdirSync(directory); }
  catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(codeOf(error) ?? '')) throw error; }
}

function codeOf(error: unknown): string | undefined { return (error as NodeJS.ErrnoException)?.code; }
