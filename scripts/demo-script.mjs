#!/usr/bin/env node
import {existsSync} from 'node:fs';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import process from 'node:process';

const root = new URL('..', import.meta.url);
const bin = new URL('../dist/cli.js', import.meta.url);

if (!existsSync(bin)) {
  run('npm', ['run', 'build', '--silent'], {cwd: root});
}

const demoHome = mkdtempSync(join(tmpdir(), 'radio-atlas-demo-'));

try {
  console.log('Radio Atlas scripted demo');
  console.log('Commands are executed against the current local build.\n');

  runDemo('radio-atlas help', ['help']);
  runDemo('radio-atlas check', ['check']);
  runDemo('radio-atlas countries', ['countries'], {maxLines: 10});
  runDemo('radio-atlas search "japan hits"', ['search', 'japan hits'], {maxLines: 8});

  console.log('\nNext interactive step: run `radio-atlas`, open Search, tune a station, then press `d` for diagnostics.');
} finally {
  rmSync(demoHome, {force: true, recursive: true});
}

function runDemo(label, args, options = {}) {
  console.log(`$ ${label}`);
  const result = run(process.execPath, [bin.pathname, ...args], {
    env: {...process.env, RADIO_ATLAS_HOME: demoHome, RADIO_ATLAS_DISABLE_ANIMATION: '1'},
    timeout: 30_000
  });

  const output = `${result.stdout}${result.stderr}`.trim();
  const lines = output.split('\n').filter(Boolean);
  const visibleLines = typeof options.maxLines === 'number' ? lines.slice(0, options.maxLines) : lines;
  for (const line of visibleLines) {
    console.log(line);
  }

  if (visibleLines.length < lines.length) {
    console.log(`... ${lines.length - visibleLines.length} more lines`);
  }

  console.log('');
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
