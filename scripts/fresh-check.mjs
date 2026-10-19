#!/usr/bin/env node
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {npmCommand, runCommand, runPackedSmoke, smokeEnvironment} from './packed-smoke.mjs';
import {sha256, sourceIdentity, upgradeBaselines} from './release-evidence.mjs';
import {runUpgradeSmoke} from './upgrade-smoke.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
if (args.some(arg => !['--require-mpv', '--require-clean'].includes(arg))) throw new Error('Usage: npm run fresh:check [-- --require-mpv] [--require-clean]');
const source = sourceIdentity(root);
if (args.includes('--require-clean') && (!source.revision || source.dirty !== false)) throw new Error('Release evidence requires a clean committed checkout.');
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
  if (JSON.stringify(sourceIdentity(root)) !== JSON.stringify(source)) throw new Error('Source identity changed while building the packed candidate. Rerun from a stable checkout.');
  const evidenceRoot = process.env.RADIOCLI_SMOKE_EVIDENCE_DIR;
  if (evidenceRoot) {
    mkdirSync(evidenceRoot, {recursive: true});
    for (const name of ['normal.json', 'omit-optional.json', 'release-evidence.json', ...upgradeBaselines.map(version => `upgrade-${version}.json`)]) rmSync(join(evidenceRoot, name), {force: true});
    copyFileSync(tarball, join(evidenceRoot, info[0].filename));
    writeFileSync(join(evidenceRoot, 'candidate.json'), `${JSON.stringify({schemaVersion: 1, packedAt: new Date().toISOString(), filename: info[0].filename, tarballSha256: sha256(tarball), source}, null, 2)}\n`);
  }
  for (const omitOptional of [false, true]) {
    await runPackedSmoke(tarball, {
      omitOptional,
      requireMpv: args.includes('--require-mpv'),
      source,
      executionMethod: process.env.RADIOCLI_SMOKE_EXECUTION_METHOD ?? 'local process',
      evidencePath: evidenceRoot ? join(evidenceRoot, `${omitOptional ? 'omit-optional' : 'normal'}.json`) : undefined
    });
  }
  for (const baseline of upgradeBaselines) {
    await runUpgradeSmoke(tarball, {baseline, source,
      evidencePath: evidenceRoot ? join(evidenceRoot, `upgrade-${baseline}.json`) : undefined});
  }
  console.log(`fresh_check=ok installs=normal,omit-optional upgrades=${upgradeBaselines.join(',')}`);
} finally {
  rmSync(temporary, {force: true, recursive: true});
}
