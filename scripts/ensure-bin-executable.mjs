#!/usr/bin/env node
import {chmodSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const binPath = resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist', 'cli.js');

if (existsSync(binPath) && process.platform !== 'win32') {
  chmodSync(binPath, 0o755);
}
