import {closeSync, constants, fstatSync, openSync, readSync} from 'node:fs';

/** Bounded, read-only preference inspection. Never creates or repairs a library. */
export function readSettingsWithoutMigration(path: string | undefined): Record<string, unknown> | undefined {
  if (!path) return undefined;
  let descriptor: number | undefined;
  const limit = 2 * 1024 * 1024;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
    const info = fstatSync(descriptor);
    if (!info.isFile() || info.size > limit) return undefined;
    const buffer = Buffer.alloc(limit + 1);
    const size = readSync(descriptor, buffer, 0, buffer.length, 0);
    if (size > limit) return undefined;
    const data: unknown = JSON.parse(buffer.toString('utf8', 0, size));
    if (!record(data)) return undefined;
    return data.settings === undefined ? {} : record(data.settings) ? data.settings : undefined;
  } catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT' ? {} : undefined; }
  finally { if (descriptor !== undefined) try { closeSync(descriptor); } catch { /* Read-only best effort. */ } }
}

function record(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }
