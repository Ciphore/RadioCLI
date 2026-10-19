import {spawn, type ChildProcess} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {detectPlaybackBackends} from '../player/backend-install.js';
import {JsonLibraryStore} from '../storage/store.js';
import {connectRadioSession} from './session.js';
import {TuiPlayer, TuiRadioEngine, TuiSession} from './tui-session.js';
import {connectActiveAlarms, startActiveAlarmSession} from '../alarms/active-session.js';

const hasMpv = detectPlaybackBackends().includes('mpv');
if (!hasMpv && process.env.RADIOCLI_REQUIRE_TUI_RECOVERY === '1') throw new Error('The native TUI recovery check requires mpv.');
let root: string | undefined;
let view: ChildProcess | undefined;
let session: TuiSession | undefined;

afterEach(async () => {
  if (view && view.exitCode === null && view.signalCode === null) { view.kill('SIGKILL'); await new Promise<void>(resolve => view!.once('close', resolve)); }
  if (session) await session.close().catch(() => undefined);
  if (root) {
    const path = join(root, 'runtime', 'agent-session.json');
    const client = await connectRadioSession(path, {source: 'cli'});
    if (client) await client.call({type: 'stop'}).catch(() => undefined);
    if (existsSync(path)) {
      const {pid} = JSON.parse(readFileSync(path, 'utf8')) as {pid: number};
      try { process.kill(pid, 'SIGTERM'); } catch { /* Already stopped. */ }
    }
    await vi.waitFor(() => expect(existsSync(path)).toBe(false), {timeout: 10_000});
    rmSync(root, {recursive: true, force: true});
  }
  vi.unstubAllEnvs();
  root = undefined; view = undefined; session = undefined;
});

describe.skipIf(!hasMpv)('native TUI crash recovery (mpv, null audio)', () => {
  it.each(['playing', 'paused'] as const)('survives a killed %s view and reconnects without restarting the player', async state => {
    root = mkdtempSync(join(tmpdir(), 'radiocli tui recovery 音楽-'));
    vi.stubEnv('RADIOCLI_HOME', root);
    vi.stubEnv('RADIOCLI_MPV_AUDIO_OUTPUT', 'null');
    vi.stubEnv('RADIOCLI_DESKTOP_MEDIA', 'off');
    vi.stubEnv('RADIOCLI_OFFLINE', '1');
    const wav = join(root, 'station.wav');
    const rate = 8000;
    const audio = Buffer.alloc(44 + rate * 2 * 180);
    audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
    audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
    audio.writeUInt32LE(rate, 24); audio.writeUInt32LE(rate * 2, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
    audio.write('data', 36); audio.writeUInt32LE(audio.length - 44, 40); writeFileSync(wav, audio);
    const first = {id: 'recovery-first', provider: 'playlist' as const, name: 'Recovery First', tags: [], streamUrl: wav};
    const second = {...first, id: 'recovery-second', name: 'Recovery Second'};
    const store = new JsonLibraryStore();
    store.updateSettings({preferredBackend: 'mpv', volume: 20, automaticUpdateChecks: false, shareDirectoryVotes: false, desktopMediaControls: 'off'});
    const built = process.env.RADIOCLI_TUI_RECOVERY_BUILT === '1';
    const module = new URL(built ? '../../dist/agent/tui-session.js' : './tui-session.ts', import.meta.url).href;
    const script = `import {TuiSession} from ${JSON.stringify(module)};
      const session = await TuiSession.connect();
      await session.call({type:'play',station:${JSON.stringify(first)},queue:${JSON.stringify([first, second])}});
      ${state === 'paused' ? "await session.call({type:'pause'});" : ''}
      console.log('view-ready'); setInterval(()=>{},1000);`;
    view = spawn(process.execPath, [...(built ? [] : ['--import', import.meta.resolve('tsx')]), '--input-type=module', '-e', script], {env: {...process.env}, stdio: ['ignore', 'pipe', 'pipe']});
    let output = ''; let errors = '';
    view.stdout!.on('data', chunk => { output += String(chunk); });
    view.stderr!.on('data', chunk => { errors += String(chunk); });
    await vi.waitFor(() => {
      if (view?.exitCode !== null) throw new Error(`View exited: ${errors}`);
      expect(output).toContain('view-ready');
    }, {timeout: 20_000});
    const path = join(root, 'runtime', 'agent-session.json');
    const client = (await connectRadioSession(path, {source: 'cli'}))!;
    const before = await client.status();
    const {elapsedSeconds: beforeElapsed, ...beforePlayback} = before.playback;
    const owner = readFileSync(path, 'utf8');
    expect(before).toMatchObject({owner: 'tui', playback: {state, ready: true}, station: first, queue: [first, second]});
    const killed = new Promise<void>(resolve => view!.once('close', resolve));
    view.kill('SIGKILL'); await killed;
    const detached = await client.status();
    expect(detached).toMatchObject({owner: 'headless', playback: beforePlayback});
    expect(detached.playback.elapsedSeconds ?? 0).toBeGreaterThanOrEqual(beforeElapsed ?? 0);

    session = await TuiSession.connect();
    const player = new TuiPlayer(session, () => store.settings());
    const engine = new TuiRadioEngine(session);
    expect(engine.snapshot()).toMatchObject({station: first, queue: [first, second], playback: beforePlayback});
    expect(readFileSync(path, 'utf8')).toBe(owner);
    expect((await player.setVolume(35)).ok).toBe(true);
    expect(player.getState().volume).toBe(35);
    expect((await player.setMuted(true)).ok).toBe(true);
    expect(player.getState().muted).toBe(true);
    expect(player.getState().startedAt).toBe(before.playback.startedAt);
    if (state === 'playing') expect((await player.pause()).ok).toBe(true);
    expect((await player.resume()).ok).toBe(true);
    expect((await session.call({type: 'next'})).status.station).toEqual(second);
    expect((await session.call({type: 'alarm-preempt'})).status.playback.ready).toBe(false);
    expect((await engine.tune(first)).id).toBe(first.id);
    expect(new JsonLibraryStore().settings().agentControl?.enabled).toBe(false);
    // Restart only MCP, with the playback owner and the recovered view alive.
    // Abruptly losing the MCP client must not stop or orphan their player.
    store.updateSettings({agentControl: {...store.settings().agentControl!, enabled: true}});
    const playing = await client.status();
    const {elapsedSeconds: initialElapsed, ...continuousPlayback} = playing.playback;
    let lastElapsed = initialElapsed ?? 0;
    for (let restart = 0; restart < 2; restart++) {
      expect(await mcpStatus(built)).toMatchObject({connected: true, session: {station: first, playback: continuousPlayback}});
      const playback = (await client.status()).playback;
      expect(playback).toMatchObject(continuousPlayback);
      expect(playback.elapsedSeconds ?? 0).toBeGreaterThanOrEqual(lastElapsed);
      lastElapsed = playback.elapsedSeconds ?? 0;
      expect(readFileSync(path, 'utf8')).toBe(owner);
    }

    const alarmStatus = {alarmId: 'recovery-alarm', scheduledAt: new Date().toISOString(), stationName: second.name,
      station: second, startedAt: new Date().toISOString(), state: 'playing' as const};
    const dismiss = vi.fn();
    const keepPlaying = vi.fn();
    const alarm = await startActiveAlarmSession(alarmStatus, {onDismiss: dismiss, onSnooze: vi.fn(), onKeepPlaying: keepPlaying});
    try {
      expect((await client.call({type: 'alarm-preempt'})).status.playback.ready).toBe(false);
      expect(await mcpStatus(built)).toMatchObject({alarmActive: true, session: {playback: {state: 'stopped'}}});
      await engine.close();
      const hostPid = (JSON.parse(owner) as {pid: number}).pid;
      await vi.waitFor(() => {
        expect(existsSync(path)).toBe(false);
        expect(existsSync(`${path}.owner`)).toBe(false);
        expect(processAlive(hostPid)).toBe(false);
      }, {timeout: 10_000});
      const active = await connectActiveAlarms();
      expect(active).toHaveLength(1);
      expect(await active[0]!.status()).toEqual(alarmStatus);
      await active[0]!.keepPlaying();
      expect(keepPlaying).toHaveBeenCalledOnce();
      expect(dismiss).not.toHaveBeenCalled();

      // The next launch starts a new owner without a manual process kill.
      session = await TuiSession.connect();
      expect((JSON.parse(readFileSync(path, 'utf8')) as {pid: number}).pid).not.toBe(hostPid);
      expect(session.status.playback.ready).toBe(false);
      expect(await active[0]!.status()).toEqual(alarmStatus);
      await session.close();
      await vi.waitFor(() => expect(existsSync(path)).toBe(false), {timeout: 10_000});
    } finally { await alarm.close(); }
  }, 40_000);
});

function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
}

async function mcpStatus(built: boolean): Promise<unknown> {
  const cli = new URL(built ? '../../dist/cli.js' : '../cli.tsx', import.meta.url);
  const {fileURLToPath} = await import('node:url');
  const child = spawn(process.execPath, [...(built ? [] : ['--import', import.meta.resolve('tsx')]), fileURLToPath(cli), 'mcp', 'serve'],
    {env: {...process.env}, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true});
  let output = ''; let errors = '';
  const replies = new Map<number, {result?: {isError?: boolean; content?: Array<{text: string}>}}>();
  child.stderr.on('data', chunk => { errors += String(chunk); });
  child.stdout.on('data', chunk => {
    output += String(chunk);
    let newline: number;
    while ((newline = output.indexOf('\n')) >= 0) {
      const line = output.slice(0, newline).trim(); output = output.slice(newline + 1);
      if (line) { const reply = JSON.parse(line) as {id: number; result: {isError?: boolean; content?: Array<{text: string}>}}; replies.set(reply.id, reply); }
    }
  });
  const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const wait = async (id: number) => {
    await vi.waitFor(() => {
      if (child.exitCode !== null) throw new Error(`MCP exited: ${errors}`);
      expect(replies.has(id)).toBe(true);
    }, {timeout: 10_000});
    return replies.get(id)!.result;
  };
  try {
    send({jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-11-25', capabilities: {}, clientInfo: {name: 'tui-recovery', version: '1.0.0'}}});
    await wait(1);
    send({jsonrpc: '2.0', method: 'notifications/initialized'});
    send({jsonrpc: '2.0', id: 2, method: 'tools/call', params: {name: 'radio_status', arguments: {}}});
    const result = await wait(2);
    expect(result?.isError).not.toBe(true);
    return JSON.parse(result!.content![0]!.text) as unknown;
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = new Promise<void>(resolve => child.once('close', resolve));
      child.kill('SIGKILL'); await closed;
    }
  }
}
