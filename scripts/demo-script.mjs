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

const demoHome = mkdtempSync(join(tmpdir(), 'radiocli-demo-'));

try {
  console.log('RadioCLI scripted demo');
  console.log('Commands are executed against the current local build.\n');

  runDemo('radiocli help', ['help']);
  runDemo('radiocli check', ['check']);
  runDemo('radiocli countries', ['countries'], {maxLines: 10});
  runDemo('radiocli search "japan hits"', ['search', 'japan hits'], {maxLines: 8});

  console.log('\nNext interactive step: run `radiocli`, open Search, tune a station, then press `d` for diagnostics.');
} finally {
  rmSync(demoHome, {force: true, recursive: true});
}

function runDemo(label, args, options = {}) {
  console.log(`$ ${label}`);
  const result = run(process.execPath, [bin.pathname, ...args], {
    env: {...process.env, RADIOCLI_HOME: demoHome, RADIOCLI_DISABLE_ANIMATION: '1'},
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
