#!/usr/bin/env node
import {existsSync, readFileSync} from 'node:fs';
import {extname} from 'node:path';
import {spawnSync} from 'node:child_process';

const textExtensions = new Set([
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
  '.yml',
  '.yaml'
]);

const files = listTrackedFiles().filter(file => textExtensions.has(extname(file)) || dotfileIsText(file));
const failures = [];

for (const file of files) {
  if (!existsSync(file)) {
    continue;
  }

  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\n/);
  lines.forEach((line, index) => {
    if (/[ \t]+$/.test(line)) {
      failures.push(`${file}:${index + 1}: trailing whitespace`);
    }
  });

  if (text.length > 0 && !text.endsWith('\n')) {
    failures.push(`${file}: missing final newline`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
}

function listTrackedFiles() {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {encoding: 'utf8'});
  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? '');
    throw new Error('git ls-files failed');
  }

  return result.stdout.split('\n').filter(Boolean);
}

function dotfileIsText(file) {
  return [
    '.editorconfig',
    '.gitattributes',
    '.gitignore',
    '.npmrc'
  ].includes(file);
}
