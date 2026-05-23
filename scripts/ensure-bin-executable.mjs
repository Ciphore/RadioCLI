#!/usr/bin/env node
import {chmodSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';

const binPath = resolve(new URL('..', import.meta.url).pathname, 'dist', 'cli.js');

if (existsSync(binPath) && process.platform !== 'win32') {
  chmodSync(binPath, 0o755);
}
