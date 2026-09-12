#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runCommand} from './packed-smoke.mjs';

// CI-only release fixtures, verified against the release API on 2026-09-07.
// https://github.com/mpv-player/mpv/releases/tag/v0.41.0
// Keep hashes fixed: a replaced release asset must fail rather than change CI silently.
const assets = {
  'darwin-x64': {name: 'mpv-v0.41.0-macos-15-intel.zip', sha256: '41003617ab4f7784394b5ddea7ce51b3e0838e8cfc8166ad1a378b2eda3b583c'},
  'darwin-arm64': {name: 'mpv-v0.41.0-macos-26-arm.zip', sha256: '09820c0d84f6687446b84eb9df81fcf6a26ebe869cee58ea1857d7948cfb7c71'},
  'win32-x64': {name: 'mpv-v0.41.0-x86_64-pc-windows-msvc.zip', sha256: '4e197f729f5071c6772f35fffd96e0f36e3e8a044bd9479b136bb09b7c6a80ff'},
  'win32-arm64': {name: 'mpv-v0.41.0-aarch64-pc-windows-msvc.zip', sha256: 'a822abeffd0ac88951f4084f3425f949842aa17d616f880637ebe9041e482e97'}
};

export function selectMpvAsset(platform, architecture) {
  const asset = assets[`${platform}-${architecture}`];
  if (!asset) throw new Error(`No pinned native mpv smoke asset for ${platform}/${architecture}.`);
  return {...asset, url: `https://github.com/mpv-player/mpv/releases/download/v0.41.0/${asset.name}`};
}

export function validateArchivePaths(paths) {
  for (const path of paths) {
    const normalized = path.replaceAll('\\', '/');
    assert.ok(!/[\0\r\n]/.test(normalized) && !normalized.startsWith('/') && !/^[a-z]:/i.test(normalized) && !normalized.split('/').includes('..'), `Unsafe archive path: ${JSON.stringify(path)}`);
  }
}

function zipEntryNames(bytes) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0 && end + 22 <= bytes.length, 'Invalid ZIP directory.');
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16);
  const names = [];
  for (let index = 0; index < count; index++) {
    assert.ok(offset + 46 <= bytes.length && bytes.readUInt32LE(offset) === 0x02014b50, 'Invalid ZIP entry.');
    const nameLength = bytes.readUInt16LE(offset + 28);
    const next = offset + 46 + nameLength + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32);
    assert.ok(next <= bytes.length, 'Truncated ZIP entry.');
    names.push(bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'));
    offset = next;
  }
  assert.ok(names.length > 0, 'The pinned ZIP must contain files.');
  return names;
}

/** Inspect the executable before running it; emulated x64 is not ARM64 evidence. */
export function verifyNativeBinary(bytes, platform, architecture) {
  if (platform === 'win32') {
    assert.ok(bytes.length >= 64 && bytes.toString('ascii', 0, 2) === 'MZ', 'Invalid Windows PE header.');
    const offset = bytes.readUInt32LE(0x3c);
    assert.ok(offset + 6 <= bytes.length && bytes.readUInt32LE(offset) === 0x00004550, 'Invalid Windows PE header.');
    const cpu = ({[0x8664]: 'x64', [0xaa64]: 'arm64'})[bytes.readUInt16LE(offset + 4)];
    assert.equal(cpu, architecture, 'mpv executable architecture does not match Node and the runner.');
    return {architectures: [cpu]};
  }
  assert.ok(platform === 'darwin' && bytes.length >= 32, 'Unknown executable format.');
  const cpuName = cpu => ({[0x01000007]: 'x64', [0x0100000c]: 'arm64'})[cpu];
  let architectures;
  if (bytes.readUInt32BE(0) === 0xcafebabe) {
    const slices = [];
    for (let index = 0; index < bytes.readUInt32BE(4); index++) {
      const offset = 8 + index * 20;
      assert.ok(offset + 20 <= bytes.length, 'Truncated universal Mach-O header.');
      slices.push({architecture: cpuName(bytes.readUInt32BE(offset)), offset: bytes.readUInt32BE(offset + 8), size: bytes.readUInt32BE(offset + 12)});
    }
    architectures = slices.map(slice => slice.architecture).filter(Boolean);
    const selected = slices.find(slice => slice.architecture === architecture);
    assert.ok(selected && selected.offset + selected.size <= bytes.length, 'mpv executable architecture does not match the runner.');
    bytes = bytes.subarray(selected.offset, selected.offset + selected.size);
  }
  assert.ok(bytes.length >= 32 && bytes.readUInt32LE(0) === 0xfeedfacf, 'Invalid 64-bit Mach-O header.');
  const cpu = cpuName(bytes.readUInt32LE(4));
  assert.equal(cpu, architecture, 'mpv executable architecture does not match Node and the runner.');
  let minimumMacos;
  let offset = 32;
  for (let index = 0; index < bytes.readUInt32LE(16); index++) {
    assert.ok(offset + 8 <= bytes.length, 'Truncated Mach-O command.');
    const command = bytes.readUInt32LE(offset);
    const size = bytes.readUInt32LE(offset + 4);
    assert.ok(size >= 8 && offset + size <= bytes.length, 'Invalid Mach-O command.');
    const versionOffset = command === 0x32 && size >= 24 ? 12 : command === 0x24 && size >= 16 ? 8 : null;
    if (versionOffset !== null) {
      const version = bytes.readUInt32LE(offset + versionOffset);
      minimumMacos = `${version >>> 16}.${(version >>> 8) & 0xff}.${version & 0xff}`;
    }
    offset += size;
  }
  return {architectures: architectures ?? [cpu], ...(minimumMacos ? {minimumMacos} : {})};
}

function versionAtLeast(actual, minimum) {
  const left = actual.split('.').map(Number);
  const right = minimum.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return difference > 0;
  }
  return true;
}

async function install() {
  const asset = selectMpvAsset(process.platform, process.arch);
  const root = mkdtempSync(join(process.env.RUNNER_TEMP ?? tmpdir(), 'radiocli-ci-mpv-'));
  const extracted = join(root, 'unpacked');
  mkdirSync(extracted);
  let completed = false;
  try {
    let bytes;
    if (process.env.RADIOCLI_SMOKE_MPV_ARCHIVE) bytes = readFileSync(process.env.RADIOCLI_SMOKE_MPV_ARCHIVE);
    else {
      const response = await fetch(asset.url, {signal: AbortSignal.timeout(120_000)});
      assert.ok(response.ok, `mpv asset download failed: HTTP ${response.status}.`);
      bytes = Buffer.from(await response.arrayBuffer());
    }
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, 'mpv release archive SHA256 mismatch.');
    validateArchivePaths(zipEntryNames(bytes));
    const archive = join(root, asset.name);
    writeFileSync(archive, bytes);
    let executable;
    let macos;
    if (process.platform === 'darwin') {
      runCommand('/usr/bin/ditto', ['-x', '-k', archive, extracted]);
      const packed = join(extracted, 'mpv.tar.gz');
      validateArchivePaths(runCommand('/usr/bin/tar', ['-tzf', packed]).stdout.split('\n').filter(Boolean));
      runCommand('/usr/bin/tar', ['-xzf', packed, '-C', extracted]);
      executable = join(extracted, 'mpv.app', 'Contents', 'MacOS', 'mpv');
      macos = runCommand('/usr/bin/sw_vers', ['-productVersion']).stdout.trim();
    } else {
      // Fixed PowerShell code. Neither archive path is interpolated into code.
      runCommand('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', 'Expand-Archive -LiteralPath $env:RADIOCLI_MPV_ARCHIVE -DestinationPath $env:RADIOCLI_MPV_EXTRACT -Force'], {
        env: {...process.env, RADIOCLI_MPV_ARCHIVE: archive, RADIOCLI_MPV_EXTRACT: extracted}
      });
      executable = join(extracted, 'mpv.exe');
    }
    const binary = verifyNativeBinary(readFileSync(executable), process.platform, process.arch);
    if (binary.minimumMacos) assert.ok(versionAtLeast(macos, binary.minimumMacos), `mpv requires macOS ${binary.minimumMacos}; this runner has ${macos}.`);
    const version = runCommand(executable, ['--version']).stdout.split('\n')[0];
    const evidence = {asset: asset.url, sha256: asset.sha256, platform: process.platform, architecture: process.arch, ...binary, ...(macos ? {macos} : {}), version, executable};
    if (process.env.GITHUB_PATH) appendFileSync(process.env.GITHUB_PATH, `${dirname(executable)}\n`);
    if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `RADIOCLI_MPV_PATH=${executable}\n`);
    if (process.env.RADIOCLI_SMOKE_EVIDENCE_DIR) {
      mkdirSync(process.env.RADIOCLI_SMOKE_EVIDENCE_DIR, {recursive: true});
      writeFileSync(join(process.env.RADIOCLI_SMOKE_EVIDENCE_DIR, 'mpv-asset.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    }
    console.log(`mpv_asset=${JSON.stringify(evidence)}`);
    completed = true;
  } finally {
    // Successful installs live only in runner temp for subsequent smoke steps.
    if (!completed) rmSync(root, {recursive: true, force: true});
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await install().catch(error => { console.error(error.stack ?? error.message); process.exitCode = 1; });
}
