import {spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {npmCommand} from './packed-smoke.mjs';

/** An unavailable audit is a distinct failure, never evidence of a clean audit. */
export async function runAudit(args, {execute = spawnSync, wait = delay, env = process.env, write = text => process.stdout.write(text), writeError = text => process.stderr.write(text)} = {}) {
  const npm = npmCommand({env});
  const auditArgs = [...npm.args, 'audit', ...args, '--fetch-timeout=30000', '--fetch-retries=1'];
  const transient = /audit endpoint returned an error|service unavailable|network timeout|ECONNRESET|EAI_AGAIN|ETIMEDOUT|ENOTFOUND|ENETUNREACH|EHOSTUNREACH/i;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = execute(npm.command, auditArgs, {encoding: 'utf8', env, shell: false, windowsHide: true, timeout: 90_000, maxBuffer: 4 * 1024 * 1024});
    write(result.stdout ?? '');
    writeError(result.stderr ?? '');
    const unavailable = transient.test(`${result.stdout ?? ''}\n${result.stderr ?? ''}\n${result.error?.code ?? ''}`);
    const status = !result.error && result.status === 0 ? 'passed' : unavailable ? 'unavailable' : 'failed';
    if (status === 'unavailable' && attempt < 3) {
      writeError(`npm audit service unavailable; retrying (${attempt}/3)...\n`);
      await wait(attempt * 5000);
      continue;
    }
    const evidence = {schemaVersion: 1, checkedAt: new Date().toISOString(), sourceRevision: env.RADIOCLI_SOURCE_REVISION ?? env.GITHUB_SHA ?? null, status, attempts: attempt,
      exitCode: status === 'passed' ? 0 : status === 'unavailable' ? 2 : result.status || 1,
      scope: args.some(arg => arg.startsWith('--prefix=')) ? args.find(arg => arg.startsWith('--prefix=')) : 'required-runtime', arguments: args};
    if (env.RADIOCLI_AUDIT_EVIDENCE_PATH) {
      mkdirSync(dirname(resolve(env.RADIOCLI_AUDIT_EVIDENCE_PATH)), {recursive: true});
      writeFileSync(env.RADIOCLI_AUDIT_EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
    }
    if (status === 'unavailable') writeError('npm audit remained unavailable; no security result was obtained. Rerun the audit before release.\n');
    return evidence;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runAudit(process.argv.slice(2)).then(result => { process.exitCode = result.exitCode; }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
