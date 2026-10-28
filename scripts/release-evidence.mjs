import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const upgradeBaselines = ['0.2.3', '0.2.4', '0.2.5'];

export function sourceIdentity(root, execute = spawnSync) {
  const readGit = args => {
    const value = execute('git', args, {cwd: root, encoding: 'utf8', shell: false, windowsHide: true, timeout: 5000});
    return value.status === 0 && !value.error ? value.stdout.trim() : null;
  };
  const revision = readGit(['rev-parse', 'HEAD']);
  const status = readGit(['status', '--porcelain', '--untracked-files=normal']);
  return {revision, dirty: status === null ? null : status !== '', lockfileSha256: existsSync(join(root, 'package-lock.json')) ? sha256(join(root, 'package-lock.json')) : null};
}

export function sha256(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }

/** Verify saved evidence for one runtime. Other devices remain explicitly unverified. */
export function buildReleaseEvidence({candidate, normal, portable, audit, network, upgrades = [], checks = [], expectedRevision}) {
  checks = Array.isArray(checks) ? checks.filter(check => check && typeof check === 'object') : [];
  upgrades = Array.isArray(upgrades) ? upgrades : [];
  const reasons = [];
  if (!candidate?.source?.revision || !/^[a-f\d]{40,64}$/i.test(candidate.source.revision)) reasons.push('Missing source revision.');
  if (candidate?.source?.dirty !== false) reasons.push('The candidate checkout was dirty or its state is unknown.');
  if (!/^[a-f\d]{64}$/i.test(candidate?.source?.lockfileSha256 ?? '')) reasons.push('Missing dependency lockfile SHA-256.');
  if (expectedRevision && candidate?.source?.revision !== expectedRevision) reasons.push('The candidate does not match the requested revision.');
  if (!/^[a-f\d]{64}$/i.test(candidate?.tarballSha256 ?? '')) reasons.push('Missing artifact SHA-256.');
  for (const [mode, record] of [['normal', normal], ['omit-optional', portable]]) {
    if (record?.result !== 'passed' || record.install !== mode) reasons.push(`Missing successful ${mode} packed installation.`);
    if (record?.tarballSha256 !== candidate?.tarballSha256) reasons.push(`${mode} tested a different artifact.`);
    if (JSON.stringify(record?.source) !== JSON.stringify(candidate?.source)) reasons.push(`${mode} source identity differs from the candidate.`);
    if (typeof record?.playback !== 'string' || !record.playback.includes('mpv: local WAV')) reasons.push(`${mode} lacks native mpv playback evidence.`);
  }
  if (![normal?.platform, normal?.architecture, normal?.node].every(value => typeof value === 'string' && value)) reasons.push('Missing runtime identity.');
  if (normal?.platform !== portable?.platform || normal?.architecture !== portable?.architecture || normal?.node !== portable?.node) reasons.push('Installation modes used different runtimes.');
  for (const baseline of upgradeBaselines) {
    const record = upgrades.find(item => item?.baseline === baseline);
    if (record?.result !== 'passed' || record.tarballSha256 !== candidate?.tarballSha256 || JSON.stringify(record?.source) !== JSON.stringify(candidate?.source)
      || ['platform', 'architecture', 'node'].some(key => record?.[key] !== normal?.[key])
      || !['in-place-install', 'saved-library-preservation', 'all-supported-receivers', 'all-supported-colors', 'installed-renderers', 'retired-style-migration', 'old-process-live-reads-and-writes', 'background-polling'].every(check => record?.checks?.includes(check))) {
      reasons.push(`Missing matching successful upgrade evidence from ${baseline}.`);
    }
  }
  if (audit?.status !== 'passed' || audit.scope !== 'required-runtime' || audit.sourceRevision !== candidate?.source?.revision) reasons.push('The required runtime audit is missing, unavailable, failed, or for a different revision or dependency scope.');
  if (!Array.isArray(audit?.arguments) || !audit.arguments.includes('--include=optional') || !audit.arguments.includes('--audit-level=low')) reasons.push('The runtime audit must include optional dependencies and all vulnerability severities.');
  if (network?.result !== 'passed' || network.sourceRevision !== candidate?.source?.revision || ['platform', 'architecture', 'node'].some(key => network?.[key] !== normal?.[key])) reasons.push('Native network evidence is missing or belongs to another revision/runtime.');
  for (const name of ['mpv_tls_rejection', 'finite_eof', 'mpv_disconnect', 'mpv_stall', 'mpv_nested_tls']) {
    if (typeof network?.checks?.[name] !== 'string' || !network.checks[name].startsWith('passed:')) reasons.push(`Required native network check did not pass: ${name}.`);
  }
  const requiredChecks = ['typecheck', 'lint', 'tests', 'harness', 'build', 'package', 'native-tui', 'native-network', 'source-mcp', 'background-cli', 'packed'];
  for (const name of requiredChecks) if (!checks.some(check => check.name === name && check.status === 'passed')) reasons.push(`Required check did not pass: ${name}.`);
  return {schemaVersion: 1, recordedAt: new Date().toISOString(), scope: 'one-runtime-packed-candidate', result: reasons.length ? 'incomplete' : 'passed', reasons,
    candidate, runtime: {platform: normal?.platform ?? null, architecture: normal?.architecture ?? null, node: normal?.node ?? null},
    checks, audit: audit ?? null, network: network ?? null, upgrades, installs: {normal: normal ?? null, omitOptional: portable ?? null},
    unverified: ['physical speaker/headphone output', 'physical AirPlay receiver', 'terminal application and hardware media keys', 'suspend/resume and wake delivery', 'other operating systems and architectures'],
    knownLimitations: ['FFmpeg/OpenSSL builds can accept a mismatched IP-address certificate even with TLS verification enabled; use DNS station URLs. Network HLS/DASH/IMF inputs require mpv because FFmpeg fallbacks cannot enforce verification on their nested requests.']};
}

export function recordReleaseEvidence(directory, {expectedRevision, checks} = {}) {
  const read = name => { try { return JSON.parse(readFileSync(join(directory, name), 'utf8')); } catch { return null; } };
  const evidence = buildReleaseEvidence({candidate: read('candidate.json'), normal: read('normal.json'), portable: read('omit-optional.json'), audit: read('audit-runtime.json'),
    network: read('network-playback.json'),
    upgrades: upgradeBaselines.map(baseline => read(`upgrade-${baseline}.json`)),
    expectedRevision, checks: checks ?? read('checks.json') ?? []});
  const filename = evidence.candidate?.filename;
  if (typeof filename !== 'string' || !filename || filename !== filename.replace(/^.*[\\/]/, '') || !existsSync(join(directory, filename)) || sha256(join(directory, filename)) !== evidence.candidate?.tarballSha256) {
    evidence.result = 'incomplete';
    evidence.reasons.push('The preserved tarball is missing or its SHA-256 differs.');
  }
  mkdirSync(directory, {recursive: true});
  writeFileSync(join(directory, 'release-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [directory = 'output/release-evidence'] = process.argv.slice(2);
  // GitHub step outcomes arrive as structured environment data, never shell code.
  const steps = process.env.RADIOCLI_CHECK_OUTCOMES ? JSON.parse(process.env.RADIOCLI_CHECK_OUTCOMES) : null;
  const checks = steps ? Object.entries(steps).map(([name, step]) => ({name, status: step.outcome === 'success' ? 'passed' : step.outcome})) : undefined;
  const result = recordReleaseEvidence(resolve(directory), {expectedRevision: process.env.GITHUB_SHA, checks});
  console.log(`release_evidence=${result.result} scope=${result.scope}`);
  for (const reason of result.reasons) console.error(reason);
  process.exitCode = result.result === 'passed' ? 0 : 1;
}
