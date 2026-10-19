import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {runAudit} from './audit-ci.mjs';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'radiocli-audit-'));
  t.after(() => rmSync(directory, {force: true, recursive: true}));
  const cli = join(directory, 'npm-cli.js');
  writeFileSync(cli, '');
  return {env: {npm_execpath: cli, RADIOCLI_SOURCE_REVISION: 'a'.repeat(40), RADIOCLI_AUDIT_EVIDENCE_PATH: join(directory, 'audit.json')},
    wait: async () => undefined, write: () => undefined, writeError: () => undefined};
}

test('audit retry success records a real successful outcome', async t => {
  const options = fixture(t);
  let attempts = 0;
  const result = await runAudit(['--omit=dev'], {...options, execute: (_program, args, execution) => {
    assert.ok(args.includes('--fetch-timeout=30000'));
    assert.equal(execution.shell, false);
    assert.equal(execution.timeout, 90_000);
    return ++attempts === 1 ? {status: 1, stderr: 'ECONNRESET'} : {status: 0, stdout: 'found 0 vulnerabilities'};
  }});
  assert.equal(result.status, 'passed');
  assert.equal(result.attempts, 2);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(readFileSync(options.env.RADIOCLI_AUDIT_EVIDENCE_PATH, 'utf8')), result);
});

test('an exhausted unavailable audit remains an explicit nonzero unknown outcome', async t => {
  const result = await runAudit([], {...fixture(t), execute: () => ({status: null, error: {code: 'ETIMEDOUT'}})});
  assert.equal(result.status, 'unavailable');
  assert.equal(result.exitCode, 2);
  assert.equal(result.attempts, 3);
});

test('dependency findings are not retried or mislabeled as a service outage', async t => {
  const result = await runAudit([], {...fixture(t), execute: () => ({status: 1, stdout: '1 high severity vulnerability'})});
  assert.equal(result.status, 'failed');
  assert.equal(result.exitCode, 1);
  assert.equal(result.attempts, 1);
});
