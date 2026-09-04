import {spawnSync} from 'node:child_process';

const npmCliPath = process.env.npm_execpath;
if (!npmCliPath) {
  console.error('Unable to locate the npm CLI for the audit.');
  process.exit(1);
}

const auditArguments = [
  npmCliPath,
  'audit',
  ...process.argv.slice(2),
  '--fetch-timeout=30000',
  '--fetch-retries=1'
];
const transientFailure =
  /audit endpoint returned an error|service unavailable|network timeout|ECONNRESET|EAI_AGAIN|ETIMEDOUT/i;
const maxAttempts = 3;

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const result = spawnSync(process.execPath, auditArguments, {
    encoding: 'utf8',
    env: process.env
  });

  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');

  if (result.status === 0) {
    process.exit(0);
  }

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (!transientFailure.test(output)) {
    process.exit(result.status ?? 1);
  }

  if (attempt === maxAttempts) {
    console.error('npm audit service remained unavailable after three attempts; continuing.');
    process.exit(0);
  }

  console.error(`npm audit service unavailable; retrying (${attempt}/${maxAttempts})...`);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 5_000);
}
