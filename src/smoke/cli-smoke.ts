import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {detectPlaybackBackends} from '../player/backend-install.js';
import {JsonLibraryStore} from '../storage/store.js';
import type {RadioSessionStatus} from '../agent/session.js';
import type {Station} from '../types.js';

const run = promisify(execFile);
const cli = fileURLToPath(new URL('../../dist/cli.js', import.meta.url));
if (!existsSync(cli)) throw new Error('Build RadioCLI before the CLI smoke check: npm run build.');
if (!detectPlaybackBackends().includes('mpv')) throw new Error('The CLI smoke check requires mpv. Run radiocli setup.');
const root = mkdtempSync(join(tmpdir(), 'radiocli-cli-smoke-'));
const sessionPath = join(root, 'runtime', 'agent-session.json');
const env = {...process.env, RADIOCLI_HOME: root, RADIOCLI_MPV_AUDIO_OUTPUT: 'null', RADIOCLI_DESKTOP_MEDIA: 'off', RADIOCLI_OFFLINE: '1', NO_COLOR: '1'};
const command = async (...args: string[]) => (await run(process.execPath, [cli, ...args], {env, timeout: 25_000})).stdout;
const snapshot = async () => JSON.parse(await command('now', '--json')) as RadioSessionStatus | null;

try {
  const path = join(root, 'silence.wav');
  writeFileSync(path, silentWav());
  const first: Station = {id: 'smoke-first', provider: 'playlist', name: 'CLI Smoke First', tags: [], streamUrl: path};
  const second: Station = {...first, id: 'smoke-second', name: 'CLI Smoke Second'};
  const store = new JsonLibraryStore(join(root, 'radiocli.json'));
  store.updateSettings({preferredBackend: 'mpv', volume: 0, shareDirectoryVotes: false, desktopMediaControls: 'off'});
  store.toggleFavorite(first);
  store.toggleFavorite(second);

  assert.equal(await snapshot(), null);
  await command('play', '--favorites', '--quiet');
  assert.equal((await snapshot())?.playback.state, 'playing');
  assert.equal((await snapshot())?.owner, 'headless');
  const hostPid = JSON.parse(readFileSync(sessionPath, 'utf8')).pid as number;
  await command('pause', '--quiet');
  assert.equal((await snapshot())?.playback.state, 'paused');
  await command('play', '--quiet');
  assert.equal((await snapshot())?.playback.state, 'playing');
  const continued = await snapshot();
  await command('play', '--quiet');
  const unchanged = await snapshot();
  assert.equal(unchanged?.playback.startedAt, continued?.playback.startedAt, 'Repeated play must not retune active audio.');
  assert.deepEqual(unchanged?.queue, continued?.queue, 'Continuing playback must retain its station queue.');
  await command('volume', '35', '--quiet');
  assert.equal((await snapshot())?.playback.volume, 35);
  await command('mute', '--quiet');
  assert.equal((await snapshot())?.playback.muted, true);
  await command('unmute', '--quiet');
  assert.equal((await snapshot())?.playback.muted, false);
  const beforeNext = (await snapshot())?.station?.id;
  await command('next', '--quiet');
  assert.notEqual((await snapshot())?.station?.id, beforeNext);
  await command('previous', '--quiet');
  assert.equal((await snapshot())?.station?.id, beforeNext);
  await command('preset', 'save', 'smoke', '--quiet');
  await command('play', 'smoke', '--quiet');
  assert.equal(JSON.parse(readFileSync(sessionPath, 'utf8')).pid, hostPid, 'CLI calls must reuse one host.');
  assert.equal((await command('_complete', 'play', 'smo')).trim(), 'smoke');
  assert.equal(JSON.parse(await command('favorites', '--json')).length, 2);
  assert.equal(new JsonLibraryStore(store.filePath).snapshot().settings.agentControl?.enabled, false);
  await command('stop', '--quiet');
  const deadline = Date.now() + 5000;
  while (existsSync(sessionPath) && Date.now() < deadline) await delay(50);
  assert.equal(existsSync(sessionPath), false, 'Stop must release the background player session.');
  assert.equal(await snapshot(), null);
  const stats = JSON.parse(await command('stats', '--json')) as {sessions: number; totalSeconds: number};
  const sessions = new JsonLibraryStore(store.filePath).snapshot().activity.sessions;
  assert.ok(stats.sessions > 0, 'Background playback must persist listening sessions.');
  assert.equal(stats.sessions, sessions.length, 'CLI stats must read the sessions saved by the background player.');
  assert.ok(stats.totalSeconds >= 0);
  console.log('cli_smoke=ok (background mpv, null audio, shared session, controls, presets, completion, clean stop)');
} finally {
  if (existsSync(sessionPath)) {
    const {pid} = JSON.parse(readFileSync(sessionPath, 'utf8')) as {pid: number};
    await command('stop', '--quiet').catch(() => { try { process.kill(pid, 'SIGTERM'); } catch { /* Already exited. */ } });
    const deadline = Date.now() + 5000;
    while (existsSync(sessionPath) && Date.now() < deadline) await delay(50);
  }
  rmSync(root, {recursive: true, force: true});
}

function silentWav(): Buffer {
  const sampleRate = 16_000;
  const bytes = 60 * sampleRate * 2;
  const buffer = Buffer.alloc(44 + bytes);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + bytes, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(bytes, 40);
  return buffer;
}
