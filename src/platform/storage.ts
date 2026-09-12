import {accessSync, constants, statSync} from 'node:fs';
import {dirname, resolve} from 'node:path';

/** Access checks are advisory: ACLs, mounts, and permissions can change before a write. */
export function storageReadiness(filePath: string): {status: 'available' | 'unavailable'; message: string} {
  try {
    assertStorageWritable(filePath);
    return {
      status: 'available',
      message: 'Filesystem access checks passed for the library location; each operation still verifies its write.'
    };
  } catch {
    return {
      status: 'unavailable',
      message: 'The library location is not accessible for writes. Check permissions or set RADIOCLI_HOME to a private writable directory; existing readable data can still be inspected.'
    };
  }
}

/** Does not create a probe file or missing directories. The actual write remains authoritative. */
export function assertStorageWritable(filePath: string): void {
  try {
    if (!statSync(filePath).isFile()) {
      throw Object.assign(new Error('The library destination is not a regular file.'), {code: 'EINVAL'});
    }
    // An atomic rename could otherwise replace a deliberately read-only file on POSIX.
    accessSync(filePath, constants.R_OK | constants.W_OK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  let parent = dirname(resolve(filePath));
  while (true) {
    try {
      if (!statSync(parent).isDirectory()) {
        throw Object.assign(new Error('The library parent is not a directory.'), {code: 'ENOTDIR'});
      }
      accessSync(parent, constants.W_OK | constants.X_OK);
      return;
    } catch (error) {
      const ancestor = dirname(parent);
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || ancestor === parent) throw error;
      parent = ancestor;
    }
  }
}
