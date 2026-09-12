#!/usr/bin/env node
import {existsSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {npmCommand, runCommand, runPackedSmoke, smokeEnvironment} from './packed-smoke.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--require-mpv')) throw new Error('Usage: npm run fresh:check [-- --require-mpv]');
const temporary = mkdtempSync(join(tmpdir(), 'radiocli-pack-'));

try {
  const npm = npmCommand();
  const env = smokeEnvironment(join(temporary, 'state'));
  // npm pack runs the normal prepack build, and writes only into a temp folder.
  const packed = runCommand(npm.command, [...npm.args, 'pack', '--json', '--dry-run=false', '--pack-destination', temporary], {cwd: root, env, timeout: 180_000});
  const info = JSON.parse(packed.stdout);
  if (info.length !== 1 || !info[0]?.filename) throw new Error('npm pack did not return exactly one package.');
  const tarball = join(temporary, info[0].filename);
  if (!existsSync(tarball)) throw new Error(`npm pack did not create ${tarball}`);
  const evidenceRoot = process.env.RADIOCLI_SMOKE_EVIDENCE_DIR;
  for (const omitOptional of [false, true]) {
    await runPackedSmoke(tarball, {
      omitOptional,
      requireMpv: args.includes('--require-mpv'),
      executionMethod: process.env.RADIOCLI_SMOKE_EXECUTION_METHOD ?? 'local process',
      evidencePath: evidenceRoot ? join(evidenceRoot, `${omitOptional ? 'omit-optional' : 'normal'}.json`) : undefined
    });
  }
  console.log('fresh_check=ok installs=normal,omit-optional');
} finally {
  rmSync(temporary, {force: true, recursive: true});
}
