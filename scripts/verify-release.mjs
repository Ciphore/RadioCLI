import {spawn} from 'node:child_process';
import {mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {npmCommand} from './packed-smoke.mjs';
import {recordReleaseEvidence, sourceIdentity, upgradeBaselines} from './release-evidence.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = sourceIdentity(root);
if (!source.revision || source.dirty !== false) throw new Error('Release verification requires a clean committed checkout. Commit the reviewed changes before collecting release evidence.');
const directory = resolve(process.env.RADIOCLI_SMOKE_EVIDENCE_DIR ?? join(root, 'output', 'release-evidence'));
mkdirSync(directory, {recursive: true});
for (const name of ['candidate.json', 'normal.json', 'omit-optional.json', 'audit-runtime.json', 'network-playback.json', 'checks.json', 'release-evidence.json', ...upgradeBaselines.map(version => `upgrade-${version}.json`)]) rmSync(join(directory, name), {force: true});
const env = {...process.env, RADIOCLI_SOURCE_REVISION: source.revision, RADIOCLI_SMOKE_EVIDENCE_DIR: directory, RADIOCLI_AUDIT_EVIDENCE_PATH: join(directory, 'audit-runtime.json')};
const npm = npmCommand({env});
const checks = [];
const gates = [
  ['typecheck', ['run', 'check']], ['lint', ['run', 'lint']], ['tests', ['run', 'test']],
  ['harness', ['--test', 'scripts/packed-smoke.test-node.mjs', 'scripts/install-smoke-mpv.test-node.mjs', 'scripts/release-evidence.test-node.mjs', 'scripts/audit-ci.test-node.mjs', 'scripts/build-airplay-native.test-node.mjs']],
  ['build', ['run', 'build']],
  ['native-tui', ['exec', '--', 'vitest', 'run', 'src/agent/tui-recovery.native.test.ts']],
  ['audit', ['run', 'audit:runtime']], ['live-data', ['run', 'smoke:data']],
  ['source-playback', ['run', 'smoke:playback']], ['native-network', ['run', 'smoke:network']],
  ['source-mcp', ['run', 'smoke:mcp']], ['background-cli', ['run', 'smoke:cli']],
  ['packed', ['run', 'fresh:check', '--', '--require-mpv', '--require-clean']],
  ['pack-preview', ['run', 'pack:check']], ['package', ['run', 'check:package']],
  ['docs-install', ['ci', '--prefix', 'apps/docs']], ['docs-audit', ['run', 'audit:docs']],
  ['docs-typecheck', ['run', 'docs:check']], ['docs-build', ['run', 'docs:build']]
];
try {
  for (const [name, args] of gates) {
    console.log(`release_check=${name}`);
    const started = Date.now();
    const status = await new Promise(resolveStatus => {
      const checkEnv = name === 'native-tui' ? {...env, RADIOCLI_REQUIRE_TUI_RECOVERY: '1', RADIOCLI_TUI_RECOVERY_BUILT: '1'}
        : name === 'docs-audit' ? {...env, RADIOCLI_AUDIT_EVIDENCE_PATH: join(directory, 'audit-docs.json')} : env;
      const child = spawn(name === 'harness' ? process.execPath : npm.command, name === 'harness' ? args : [...npm.args, ...args], {cwd: root, env: checkEnv, shell: false, windowsHide: true, stdio: 'inherit'});
      child.once('error', () => resolveStatus(1));
      child.once('close', code => resolveStatus(code ?? 1));
    });
    checks.push({name, status: status === 0 ? 'passed' : 'failed', elapsedMs: Date.now() - started});
    writeFileSync(join(directory, 'checks.json'), `${JSON.stringify(checks, null, 2)}\n`);
    if (status !== 0) { process.exitCode = 1; break; }
  }
} finally {
  const evidence = recordReleaseEvidence(directory, {expectedRevision: source.revision, checks});
  if (JSON.stringify(sourceIdentity(root)) !== JSON.stringify(source)) {
    evidence.result = 'incomplete'; evidence.reasons.push('Source identity changed during release verification.');
    writeFileSync(join(directory, 'release-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  }
  if (evidence.result !== 'passed' || checks.some(check => check.status !== 'passed')) process.exitCode = 1;
  console.log(`release_evidence=${evidence.result} directory=${directory}`);
}
