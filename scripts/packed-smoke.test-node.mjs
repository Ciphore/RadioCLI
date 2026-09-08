import assert from 'node:assert/strict';
// Run explicitly with node --test; this name avoids Vitest's test-file glob.
import {mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {test} from 'node:test';

async function helpers() {
  const module = await import('./packed-smoke.mjs').catch(() => ({}));
  assert.equal(typeof module.npmCommand, 'function', 'the packed smoke must provide a shell-free npm launcher');
  return module;
}

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'radiocli smoke & 日本 '));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  return directory;
}

test('npm runs its JavaScript entry directly and preserves shell-sensitive arguments', async t => {
  const {npmCommand, runCommand} = await helpers();
  const directory = fixture(t);
  const cli = join(directory, 'npm-cli.js');
  writeFileSync(cli, 'console.log(JSON.stringify(process.argv.slice(2)));\n');
  const args = ['install', join(directory, 'a & b; $(never-run).tgz'), '100% literal !'];
  const invocation = npmCommand({env: {npm_execpath: cli}});
  assert.equal(invocation.command, process.execPath);
  assert.equal(invocation.args[0], realpathSync(cli));
  const result = runCommand(invocation.command, [...invocation.args, ...args]);
  assert.deepEqual(JSON.parse(result.stdout), args);
});

test('npm discovery resolves the Windows Node distribution layout without executing a cmd shim', async t => {
  const {npmCommand} = await helpers();
  const directory = fixture(t);
  const node = join(directory, 'node.exe');
  const cli = join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  mkdirSync(dirname(cli), {recursive: true});
  writeFileSync(node, '');
  writeFileSync(cli, '');
  assert.deepEqual(npmCommand({execPath: node, platform: 'win32', env: {}}), {command: node, args: [realpathSync(cli)]});
});

test('npm discovery fails clearly when only an unusable shim is available', async t => {
  const {npmCommand} = await helpers();
  const directory = fixture(t);
  writeFileSync(join(directory, 'npm.cmd'), '@echo off\r\n');
  assert.throws(() => npmCommand({execPath: join(directory, 'node.exe'), platform: 'win32', env: {PATH: directory}}), /npm-cli\.js/);
});

test('command failures include stderr and retain a nonzero failure', async () => {
  const {runCommand} = await helpers();
  assert.throws(() => runCommand(process.execPath, ['-e', 'console.error("fixture failure"); process.exit(7)']), /fixture failure/);
});

test('a stalled child cannot turn a smoke test into an unbounded job', async () => {
  const {runCommand} = await helpers();
  assert.throws(() => runCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {timeout: 100}), /timed out|ETIMEDOUT/);
});

test('MCP smoke rejects non-JSON stdout from the actual child process', async t => {
  const {smokeMcp} = await helpers();
  const directory = fixture(t);
  const cli = join(directory, 'broken-mcp.cjs');
  writeFileSync(cli, 'console.log("unexpected banner"); setInterval(() => {}, 1000);\n');
  await assert.rejects(smokeMcp({cli, cwd: directory, env: process.env}), /non-JSON stdout/);
});

test('MCP smoke reports an early server exit instead of waiting for its deadline', async t => {
  const {smokeMcp} = await helpers();
  const directory = fixture(t);
  const cli = join(directory, 'closed-mcp.cjs');
  writeFileSync(cli, 'console.error("fixture server exited"); process.exit(3);\n');
  await assert.rejects(smokeMcp({cli, cwd: directory, env: process.env}), /fixture server exited|exited with 3/);
});
