import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {buildReleaseEvidence, recordReleaseEvidence, sha256, sourceIdentity} from './release-evidence.mjs';

function complete() {
  const source = {revision: 'a'.repeat(40), dirty: false, lockfileSha256: 'b'.repeat(64)};
  const candidate = {filename: 'candidate.tgz', source, tarballSha256: 'c'.repeat(64)};
  const installed = {source, tarballSha256: candidate.tarballSha256, result: 'passed', platform: 'linux', architecture: 'arm64', node: 'v22.0.0', playback: 'mpv: local WAV; null audio'};
  return {candidate, normal: {...installed, install: 'normal'}, portable: {...installed, install: 'omit-optional'}, audit: {status: 'passed', scope: 'required-runtime', sourceRevision: source.revision, arguments: ['--omit=dev', '--include=optional', '--audit-level=low']},
    network: {result: 'passed', sourceRevision: source.revision, platform: installed.platform, architecture: installed.architecture, node: installed.node,
      checks: {mpv_tls_rejection: 'passed: untrusted TLS', finite_eof: 'passed: stopped', mpv_disconnect: 'passed: recovered', mpv_stall: 'passed: recovered', mpv_nested_tls: 'passed: untrusted TLS'}},
    upgrades: ['0.2.3', '0.2.4', '0.2.5'].map(baseline => ({...installed, baseline,
      checks: ['in-place-install', 'saved-library-preservation', 'all-supported-receivers', 'all-supported-colors', 'installed-renderers', 'retired-style-migration', 'old-process-live-reads-and-writes', 'background-polling']})),
    checks: ['typecheck', 'lint', 'tests', 'harness', 'build', 'package', 'native-tui', 'native-network', 'source-mcp', 'background-cli', 'packed'].map(name => ({name, status: 'passed'}))};
}

test('evidence verifies only the tested artifact and runtime, retaining physical-device limits', () => {
  const result = buildReleaseEvidence(complete());
  assert.equal(result.result, 'passed');
  assert.equal(result.scope, 'one-runtime-packed-candidate');
  assert.ok(result.unverified.includes('physical AirPlay receiver'));
});

for (const [name, mutate] of [
  ['dirty source', data => { data.candidate.source.dirty = true; }],
  ['different artifact', data => { data.portable.tarballSha256 = 'd'.repeat(64); }],
  ['different source', data => { data.normal.source = {...data.normal.source, revision: 'd'.repeat(40)}; }],
  ['unavailable audit', data => { data.audit.status = 'unavailable'; }],
  ['different audit scope', data => { data.audit.scope = '--prefix=apps/docs'; }],
  ['audit omitting optional dependencies', data => { data.audit.arguments = ['--omit=dev', '--omit=optional', '--audit-level=low']; }],
  ['audit ignoring low severity findings', data => { data.audit.arguments = ['--omit=dev', '--audit-level=high']; }],
  ['failed check', data => { data.checks[0].status = 'failed'; }],
  ['skipped native network checks', data => { data.checks.find(check => check.name === 'native-network').status = 'skipped'; }],
  ['skipped native TUI recovery', data => { data.checks.find(check => check.name === 'native-tui').status = 'skipped'; }],
  ['missing background control checks', data => { data.checks = data.checks.filter(check => check.name !== 'background-cli'); }],
  ['missing upgrade evidence', data => { data.upgrades = []; }],
  ['missing one upgrade baseline', data => { data.upgrades.pop(); }],
  ['stale upgrade artifact', data => { data.upgrades[0].tarballSha256 = 'd'.repeat(64); }],
  ['foreign upgrade runtime', data => { data.upgrades[0].platform = 'win32'; }],
  ['missing color upgrade regression', data => { data.upgrades[0].checks = data.upgrades[0].checks.filter(check => check !== 'all-supported-colors'); }],
  ['missing old-process regression', data => { data.upgrades[0].checks = []; }],
  ['failed packed pipeline', data => { data.checks.find(check => check.name === 'packed').status = 'failed'; }],
  ['stale native network evidence', data => { data.network.sourceRevision = 'd'.repeat(40); }],
  ['foreign native network evidence', data => { data.network.architecture = 'x64'; }],
  ['empty native network checks', data => { data.network.checks = {}; }],
  ['unverified mandatory network check', data => { data.network.checks.mpv_stall = 'unverified: not run'; }],
  ['missing playback', data => { data.portable.playback = 'not exercised: mpv unavailable'; }],
  ['wrong requested revision', data => { data.expectedRevision = 'e'.repeat(40); }]
]) test(`release evidence rejects ${name}`, () => {
  const data = complete(); mutate(data);
  const result = buildReleaseEvidence(data);
  assert.equal(result.result, 'incomplete');
  assert.ok(result.reasons.length);
});

test('each mandatory network check is required while optional native checks can remain unverified', () => {
  for (const name of ['mpv_tls_rejection', 'finite_eof', 'mpv_disconnect', 'mpv_stall', 'mpv_nested_tls']) {
    const data = complete(); delete data.network.checks[name];
    assert.equal(buildReleaseEvidence(data).result, 'incomplete', name);
  }
  const data = complete();
  Object.assign(data.network.checks, {mpv_private_ca: 'unverified: Schannel', vlc: 'unverified: not installed'});
  assert.equal(buildReleaseEvidence(data).result, 'passed');
});

test('the preserved tarball must match the artifact tested in both installation modes', t => {
  const directory = mkdtempSync(join(tmpdir(), 'radiocli-evidence-'));
  t.after(() => rmSync(directory, {force: true, recursive: true}));
  const data = complete();
  const tarball = join(directory, data.candidate.filename);
  writeFileSync(tarball, 'fixture archive');
  for (const item of [data.candidate, data.normal, data.portable, ...data.upgrades]) item.tarballSha256 = sha256(tarball);
  for (const [filename, value] of [['candidate.json', data.candidate], ['normal.json', data.normal], ['omit-optional.json', data.portable], ['audit-runtime.json', data.audit], ['network-playback.json', data.network], ['checks.json', data.checks], ...data.upgrades.map(record => [`upgrade-${record.baseline}.json`, record])]) writeFileSync(join(directory, filename), JSON.stringify(value));
  assert.equal(recordReleaseEvidence(directory).result, 'passed');
  writeFileSync(tarball, 'changed archive');
  assert.equal(recordReleaseEvidence(directory).result, 'incomplete');
  assert.equal(JSON.parse(readFileSync(join(directory, 'release-evidence.json'), 'utf8')).result, 'incomplete');
});

test('unknown Git state is not recorded as a clean candidate', t => {
  const directory = mkdtempSync(join(tmpdir(), 'radiocli-source-'));
  t.after(() => rmSync(directory, {force: true, recursive: true}));
  const identity = sourceIdentity(directory, () => ({status: 1, stdout: ''}));
  assert.deepEqual(identity, {revision: null, dirty: null, lockfileSha256: null});
});
