#!/usr/bin/env node
import {existsSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import process from 'node:process';

const root = resolve(new URL('..', import.meta.url).pathname);
const tempProject = mkdtempSync(join(tmpdir(), 'radiocli-fresh-'));
const tempStore = mkdtempSync(join(tmpdir(), 'radiocli-store-'));
let packedTarball;

try {
  if (existsSync(join(root, 'tsconfig.build.json'))) {
    run('npm', ['run', 'build', '--silent'], {cwd: root});
  }

  const pack = run('npm', ['pack', '--json'], {cwd: root});
  const packageInfo = JSON.parse(pack.stdout)[0];
  packedTarball = resolve(root, packageInfo.filename);

  if (!existsSync(packedTarball)) {
    throw new Error(`npm pack did not create ${packedTarball}`);
  }

  writeFileSync(join(tempProject, 'package.json'), '{"private":true,"type":"module"}\n', 'utf8');
  run('npm', ['install', '--no-audit', '--fund=false', packedTarball], {cwd: tempProject, timeout: 180_000});

  const bin = process.platform === 'win32'
    ? join(tempProject, 'node_modules', '.bin', 'radiocli.cmd')
    : join(tempProject, 'node_modules', '.bin', 'radiocli');

  run(bin, ['help'], {cwd: tempProject, env: freshEnv(), timeout: 30_000});
  const check = run(bin, ['check'], {cwd: tempProject, env: freshEnv(), timeout: 45_000});

  process.stdout.write(check.stdout);
  console.log('fresh_check=ok');
} finally {
  if (packedTarball) {
    rmSync(packedTarball, {force: true});
  }

  rmSync(tempProject, {force: true, recursive: true});
  rmSync(tempStore, {force: true, recursive: true});
}

function freshEnv() {
  return {
    ...process.env,
    RADIOCLI_HOME: tempStore,
    RADIOCLI_DISABLE_ANIMATION: '1'
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    encoding: 'utf8',
    timeout: options.timeout ?? 120_000
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`${command} ${args.join(' ')} exited with ${result.status}`);
  }

  return result;
}
