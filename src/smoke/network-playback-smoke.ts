import assert from 'node:assert/strict';
import {createServer, type Server, type ServerResponse} from 'node:http';
import {createServer as createTlsServer} from 'node:https';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {PlayerController} from '../player/player-controller.js';
import {RadioEngine} from '../player/radio-engine.js';
import {JsonLibraryStore} from '../storage/store.js';
import {resolveCommand} from '../platform/executables.js';
import {canRetryPlainHttp, ffmpegInputArguments} from '../player/ffmpeg-input.js';
import type {AppSettings, Station} from '../types.js';

// Required mpv verification, using only loopback fixtures and null audio. ffplay
// is checked when installed; absence is explicit rather than a false pass.
assert.ok(resolveCommand('mpv'), 'Network playback verification requires mpv.');
const root = mkdtempSync(join(tmpdir(), 'radiocli-network-'));
const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const certificate = readFileSync(fixture('localhost-cert.pem'));
const audio = readFileSync(fixture('silence.mp3'));
const originalEnv = {...process.env};
const servers: Server[] = [];
const responses = new Set<ServerResponse>();
const timers = new Set<NodeJS.Timeout>();
const players: PlayerController[] = [];
const engines: RadioEngine[] = [];
const privateCaFixtures = process.platform !== 'win32' || process.env.RADIOCLI_SMOKE_PRIVATE_CA === '1';
const results: Record<string, string> = {};
const report = (name: string, result: string) => { results[name] = result; console.log(`${name}=${result}`); };
const settings: AppSettings = {...new JsonLibraryStore(join(root, 'library.json')).settings(),
  preferredBackend: 'mpv', volume: 0, tuneTimeoutSeconds: 5, desktopMediaControls: 'off', skipBrokenStreams: false};
const station = (url: string, provider: Station['provider'] = 'playlist'): Station => ({id: 'network-fixture', name: 'Network fixture', provider, tags: [], streamUrl: url});
const makePlayer = (backend: AppSettings['preferredBackend'] = 'mpv') => {
  const player = new PlayerController(() => ({...settings, preferredBackend: backend})); players.push(player); return player;
};
async function listen(server: Server): Promise<number> {
  servers.push(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string'); return address.port;
}
function track(response: ServerResponse): void { responses.add(response); response.once('close', () => responses.delete(response)); }
async function until(predicate: () => boolean, label: string, timeout = 10_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!predicate()) { if (Date.now() >= deadline) throw new Error(`Timed out: ${label}`); await delay(100); }
}

try {
  process.env.RADIOCLI_HOME = root;
  process.env.RADIOCLI_MPV_AUDIO_OUTPUT = 'null';
  process.env.SDL_AUDIODRIVER = 'dummy'; process.env.SDL_VIDEODRIVER = 'dummy';
  process.env.RADIOCLI_VLC_AUDIO_OUTPUT = 'dummy';
  const untrusted = join(root, 'untrusted'); mkdirSync(untrusted);
  const trusted = join(root, 'trusted'); mkdirSync(trusted);
  const authorities = join(root, 'test-authorities.pem');
  writeFileSync(authorities, Buffer.concat([certificate, readFileSync(fixture('wronghost-cert.pem'))]));
  // Even an old user config opting out cannot override the application's flag.
  writeFileSync(join(trusted, 'mpv.conf'), `tls-verify=no\ntls-ca-file=${JSON.stringify(authorities)}\n`);
  process.env.MPV_HOME = untrusted;
  const wav = silentWav(3);
  let tlsRequests = 0;
  const tlsPort = await listen(createTlsServer({key: readFileSync(fixture('localhost-key.pem')), cert: certificate}, (_request, response) => {
    tlsRequests++;
    response.writeHead(200, {'content-type': 'audio/wav', 'content-length': wav.length}); response.end(wav);
  }));
  const redirectPort = await listen(createServer((_request, response) => { response.writeHead(302, {location: `https://localhost:${tlsPort}/radio.wav`}); response.end(); }));
  const player = makePlayer();
  for (const url of [`https://localhost:${tlsPort}/radio.wav`, `http://127.0.0.1:${redirectPort}/redirect`]) {
    await assert.rejects(player.play(station(url), url)); assert.equal(player.getState().ready, false);
    assert.equal(player.recoverableFailure(), false, 'Certificate failures must not enter recovery.'); await player.stop();
  }
  report('mpv_tls_rejection', 'passed: untrusted certificate and HTTP-to-HTTPS redirect');
  const valid = `https://localhost:${tlsPort}/radio.wav`;
  if (privateCaFixtures) {
    process.env.MPV_HOME = trusted;
    const wrongPort = await listen(createTlsServer({key: readFileSync(fixture('localhost-key.pem')), cert: readFileSync(fixture('wronghost-cert.pem'))}, (_request, response) => {
      response.writeHead(200, {'content-type': 'audio/wav', 'content-length': wav.length}); response.end(wav);
    }));
    const wrongHost = `https://localhost:${wrongPort}/radio.wav`;
    await assert.rejects(player.play(station(wrongHost), wrongHost)); await player.stop();
    const mismatch = `https://127.0.0.1:${tlsPort}/radio.wav`;
    // Keep this native IP identity limitation visible. A Node preflight cannot
    // secure the player's actual TLS connection and would give false assurance.
    let rejectsIpMismatch = false;
    try { await player.play(station(mismatch), mismatch); } catch { rejectsIpMismatch = true; }
    await player.stop();
    report('mpv_ip_san', rejectsIpMismatch ? 'passed: rejected' : 'KNOWN UPSTREAM LIMITATION: native TLS backend accepted a mismatched IP certificate');
    await player.play(station(valid), valid); assert.equal(player.getState().ready, true);
    await until(() => player.getState().state === 'stopped', 'finite HTTPS recording EOF'); await player.stop();
    report('mpv_private_ca', 'passed: trusted HTTPS playback and DNS-hostname mismatch rejection');
  } else {
    // The pinned Windows fixture uses Schannel, which ignores ca_file. Never
    // install a test root into the user's system trust store to make it pass.
    report('mpv_private_ca', 'unverified: Windows Schannel ignores the isolated CA file; trusted playback and DNS/IP identity fixtures require a CA-file-capable build');
  }
  const finitePort = await listen(createServer((_request, response) => {
    response.writeHead(200, {'content-type': 'audio/wav', 'content-length': wav.length}); response.end(wav);
  }));
  const finite = `http://127.0.0.1:${finitePort}/recording.wav`;
  await player.play(station(finite), finite); assert.equal(player.getState().ready, true);
  await until(() => player.getState().state === 'stopped', 'finite HTTP recording EOF');
  assert.equal(player.recoverableFailure(), false); await player.stop();
  report('finite_eof', 'passed: stopped without recovery');

  for (const mode of ['disconnect', 'stall'] as const) {
    let requests = 0; let observedFailure = false;
    const port = await listen(createServer((_request, response) => {
      const request = ++requests; track(response);
      response.writeHead(200, {'content-type': 'audio/mpeg', 'icy-name': 'Live fixture', 'accept-ranges': 'none'});
      response.write(audio);
      if (request === 1) {
        if (mode === 'disconnect') timers.add(setTimeout(() => response.destroy(), 1800));
      } else {
        const timer = setInterval(() => { if (!response.destroyed) response.write(audio); }, 1500);
        timers.add(timer); response.once('close', () => { clearInterval(timer); timers.delete(timer); });
      }
    }));
    const url = `http://127.0.0.1:${port}/live`;
    const live = makePlayer(); const store = new JsonLibraryStore(join(root, `${mode}.json`));
    const engine = new RadioEngine(live, {resolve: async () => ({url})}, store, () => settings); engines.push(engine);
    engine.onChange(state => { if (state.playback.state === 'error') observedFailure = true; });
    await engine.tune(station(url, 'radio-browser'));
    await until(() => requests >= 2 && live.getState().ready && live.getState().state === 'playing', `${mode} recovery`, 35_000);
    assert.equal(observedFailure, true); assert.equal(requests, 2);
    await engine.stop(); const stoppedRequests = requests; await delay(1200);
    assert.equal(requests, stoppedRequests); assert.equal(live.getState().ready, false);
    report(`mpv_${mode}`, 'passed: recovered; Stop prevents resurrection');
  }

  const emptyPort = await listen(createServer((_request, response) => { track(response); response.writeHead(200, {'content-type': 'audio/mpeg'}); response.flushHeaders(); }));
  const file = join(root, 'silence.wav'); writeFileSync(file, silentWav(5));
  const manifest = `#EXTM3U\n#EXT-X-TARGETDURATION:3\n#EXTINF:3,\nhttps://localhost:${tlsPort}/segment.wav\n#EXT-X-ENDLIST\n`;
  const localPlaylist = join(root, 'network.m3u8'); writeFileSync(localPlaylist, manifest);
  let changingRequests = 0;
  const mediaPort = await listen(createServer((request, response) => {
    if (request.url === '/live.m3u8') {
      response.writeHead(200, {'content-type': 'application/vnd.apple.mpegurl'}); response.end(manifest);
    } else if (request.url === '/changing' && ++changingRequests > 1) {
      response.writeHead(302, {location: valid}); response.end();
    } else {
      response.writeHead(200, {'content-type': 'audio/wav', 'content-length': wav.length}); response.end(wav);
    }
  }));
  const media = `http://127.0.0.1:${mediaPort}/media.wav`;
  const hls = `http://127.0.0.1:${mediaPort}/live.m3u8`;
  const changing = `http://127.0.0.1:${mediaPort}/changing`;
  const nestedStart = tlsRequests;
  process.env.MPV_HOME = untrusted;
  await assert.rejects(player.play(station(hls), hls)); await player.stop();
  assert.equal(tlsRequests, nestedStart, 'mpv must verify nested HTTPS before requesting its media.');
  report('mpv_nested_tls', 'passed: untrusted HTTPS segment rejected before HTTP request');
  if (resolveCommand('ffplay')) {
    const fallback = makePlayer('ffplay');
    const empty = `http://127.0.0.1:${emptyPort}/no-audio`;
    await assert.rejects(fallback.play(station(empty), empty), /Timed out/); assert.equal(fallback.getState().ready, false); await fallback.stop();
    await fallback.play(station(file), file); assert.equal(fallback.getState().ready, true); await fallback.stop();
    await assert.rejects(fallback.play(station(valid), valid)); await fallback.stop();
    await fallback.play(station(media), media); assert.equal(fallback.getState().ready, true); await fallback.stop();
    const before = tlsRequests;
    for (const target of [hls, localPlaylist]) {
      await assert.rejects(fallback.play(station(target), target), /select mpv/); await fallback.stop();
    }
    changingRequests = 0;
    await assert.rejects(fallback.play(station(changing), changing)); await fallback.stop();
    assert.ok(changingRequests >= 2); assert.equal(tlsRequests, before, 'Fallbacks must not fetch unverified nested or redirected TLS resources.');
    report('ffplay', 'passed: decoded-clock; local/HTTP; headers-only/TLS rejection; nested TLS and retry redirect blocked');
  } else report('ffplay', 'unverified: not installed');
  if (resolveCommand('ffmpeg')) {
    // Exercise actual AirPlay decoder input options independently of a receiver.
    // The Linux native suite also verifies the complete worker/RAOP path.
    const decode = async (target: string, trustedCa?: string) => {
      const run = (plainHttp = false) => decodePcm(target, [...ffmpegInputArguments(target, {plainHttp, reconnect: true}), ...(trustedCa ? ['-ca_file', trustedCa] : [])]);
      const first = await run();
      return !first.bytes && canRetryPlainHttp(target, first.diagnostic) ? run(true) : first;
    };
    for (const target of [file, media, ...(privateCaFixtures ? [valid] : [])]) {
      const result = await decode(target, target === valid ? authorities : undefined);
      assert.equal(result.code, 0, result.diagnostic); assert.ok(result.bytes > 0, 'FFmpeg must produce decoded PCM.');
    }
    const before = tlsRequests;
    for (const target of [hls, localPlaylist]) {
      const result = await decode(target); assert.equal(result.bytes, 0); assert.match(result.diagnostic, /not on whitelist/i);
    }
    changingRequests = 0;
    const changed = await decode(changing); assert.equal(changed.bytes, 0); assert.match(changed.diagnostic, /blacklist/i);
    assert.equal(tlsRequests, before);
    report('ffmpeg', `passed: local/HTTP decode; nested TLS and retry redirect blocked; trusted HTTPS ${privateCaFixtures ? 'passed' : 'unverified: CA-file support not assumed'}`);
  } else report('ffmpeg', 'unverified: not installed');
  if (resolveCommand('cvlc') || resolveCommand('vlc')) {
    const fallback = makePlayer('vlc'); const empty = `http://127.0.0.1:${emptyPort}/no-audio`;
    await assert.rejects(fallback.play(station(empty), empty), /Timed out/); assert.equal(fallback.getState().ready, false); await fallback.stop();
    for (const target of [file, media]) {
      await fallback.play(station(target), target); assert.equal(fallback.getState().ready, true); await fallback.stop();
    }
    report('vlc', 'passed: output-and-decoder readiness; headers-only rejection; local/HTTP');
  } else report('vlc', 'unverified: not installed');
  if (process.env.RADIOCLI_REQUIRE_FALLBACKS === '1') {
    for (const binary of ['ffplay', 'ffmpeg']) assert.ok(resolveCommand(binary), `${binary} is required in this verification job.`);
    assert.ok(resolveCommand('cvlc') || resolveCommand('vlc'), 'VLC is required in this verification job.');
  }
  console.log('network_playback_smoke=ok; output=null/dummy; network=loopback-only');
  if (originalEnv.RADIOCLI_SMOKE_EVIDENCE_DIR) {
    mkdirSync(originalEnv.RADIOCLI_SMOKE_EVIDENCE_DIR, {recursive: true});
    writeFileSync(join(originalEnv.RADIOCLI_SMOKE_EVIDENCE_DIR, 'network-playback.json'), `${JSON.stringify({result: 'passed', sourceRevision: originalEnv.RADIOCLI_SOURCE_REVISION ?? originalEnv.GITHUB_SHA ?? null,
      platform: process.platform, architecture: process.arch, node: process.version, checks: results}, null, 2)}\n`);
  }
} finally {
  for (const engine of engines) await engine.close();
  for (const player of players) await player.stop();
  for (const timer of timers) clearTimeout(timer);
  for (const response of responses) response.destroy();
  for (const server of servers) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  rmSync(root, {recursive: true, force: true});
}

async function decodePcm(target: string, inputArgs: string[]): Promise<{code: number | null; bytes: number; diagnostic: string}> {
  const child = spawn(resolveCommand('ffmpeg')!, ['-hide_banner', '-loglevel', 'error', ...inputArgs, '-i', target, '-t', '0.25', '-f', 's16le', '-ac', '2', '-ar', '44100', 'pipe:1'], {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
  let bytes = 0; let diagnostic = '';
  child.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; });
  child.stderr.on('data', chunk => { diagnostic = (diagnostic + String(chunk)).slice(-8192); });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 8000);
  try {
    return await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', code => resolve({code, bytes, diagnostic}));
    });
  } finally { clearTimeout(timeout); }
}

function silentWav(seconds: number): Buffer {
  const dataBytes = seconds * 44_100 * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write('RIFF'); wav.writeUInt32LE(36 + dataBytes, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(44_100, 24); wav.writeUInt32LE(88_200, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(dataBytes, 40);
  return wav;
}
