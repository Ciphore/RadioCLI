import {renameSync} from 'node:fs';

/** Keep the destination intact until the replacement succeeds. Windows readers
 * and virus scanners can briefly deny replacement even in a writable folder. */
export function replaceFileSync(source: string, destination: string, platform: NodeJS.Platform = process.platform): void {
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (let retry = 0; ; retry++) {
    try { renameSync(source, destination); return; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (platform !== 'win32' || !['EACCES', 'EPERM', 'EBUSY'].includes(code ?? '') || retry >= 10) throw error;
      // At most 550 ms in total, while retaining the writer lock and flushed
      // temporary file. Never unlink the destination to work around a lock.
      Atomics.wait(pause, 0, 0, (retry + 1) * 10);
    }
  }
}
