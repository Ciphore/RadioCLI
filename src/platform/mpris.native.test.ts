import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {promisify} from 'node:util';
import {describe, expect, it} from 'vitest';
import {resolveDesktopTransport, serializeRadioCommands, type RadioSessionCommand} from '../agent/session.js';
import type {Station} from '../types.js';
import {mprisServiceName, startMpris, type MprisSnapshot} from './mpris.js';

const run = promisify(execFile);
const path = '/org/mpris/MediaPlayer2';
const player = 'org.mpris.MediaPlayer2.Player';
const properties = 'org.freedesktop.DBus.Properties';

/** Required Linux CI invokes this file under dbus-run-session. Other platform
 * suites skip the native transport while retaining the deterministic tests. */
describe.skipIf(process.platform !== 'linux' || !process.env.DBUS_SESSION_BUS_ADDRESS)('native Linux MPRIS protocol', () => {
  it('serves typed properties and controls, keeps ownership, and releases the bus on suspension/disposal', async () => {
    const identity = `radiocli-native-${randomUUID()}`;
    const name = mprisServiceName(identity);
    const stations: Station[] = [
      {provider: 'playlist', id: 'one', name: 'One', tags: [], streamUrl: 'https://secret:password@example.test/stream?token=private'},
      {provider: 'playlist', id: 'two', name: 'Two', tags: []}
    ];
    const state: MprisSnapshot = {
      available: true, owner: 'headless', station: stations[0]!, queue: stations,
      playback: {backend: 'mpv', state: 'playing', ready: true, volume: 42, muted: false},
      title: 'Native radio title'
    };
    const commands: RadioSessionCommand[] = [];
    const bridge = startMpris({identity, address: process.env.DBUS_SESSION_BUS_ADDRESS!, snapshot: () => state, command: serializeRadioCommands(async command => {
      commands.push(command);
      if (command.type === 'desktop-transport') {
        const resolved = resolveDesktopTransport(command.action, state);
        if (!resolved) return {ok: true, message: 'State unchanged.', status: state};
        command = resolved;
      }
      if (command.type === 'pause') state.playback.state = 'paused';
      if (command.type === 'resume') state.playback.state = 'playing';
      if (command.type === 'stop') { state.playback.state = 'stopped'; state.playback.ready = false; }
      if (command.type === 'resume' && command.restartStopped) state.playback.ready = true;
      if (command.type === 'next') { state.station = stations[1]!; if (!command.preservePause) state.playback.state = 'playing'; }
      if (command.type === 'set-volume') { state.playback.volume = command.volume; if (command.unmute && command.volume > 0) state.playback.muted = false; }
      return {ok: true, message: 'Handled by owner.', status: state};
    })});
    let contender: ReturnType<typeof startMpris> | undefined;
    try {
      await until(async () => (await names()).includes(name));
      const all = await call(name, `${properties}.GetAll`, `string:${player}`);
      expect(all).toContain('Playing'); expect(all).toContain('Native radio title');
      expect(all).toContain('double 0.42'); expect(all).not.toContain('private'); expect(all).not.toContain('password');
      expect(all).not.toContain('mpris:length'); expect(all).toContain('CanSeek');
      const xml = await call(name, 'org.freedesktop.DBus.Introspectable.Introspect');
      expect(xml).toContain(player); expect(xml).toContain('readwrite');

      await call(name, `${player}.Pause`);
      await call(name, `${player}.Next`);
      expect(commands).toContainEqual({type: 'desktop-transport', action: 'next'});
      expect(await call(name, `${properties}.Get`, `string:${player}`, 'string:PlaybackStatus')).toContain('Paused');
      await call(name, `${properties}.Set`, `string:${player}`, 'string:Volume', 'variant:double:0.62');
      expect(commands).toContainEqual({type: 'set-volume', volume: 62, unmute: true});
      expect(await call(name, `${properties}.Get`, `string:${player}`, 'string:Volume')).toContain('double 0.62');
      await call(name, `${player}.Play`);
      expect(await call(name, `${properties}.Get`, `string:${player}`, 'string:PlaybackStatus')).toContain('Playing');
      await call(name, `${player}.Stop`);
      expect(commands).toContainEqual({type: 'desktop-transport', action: 'stop'});
      expect(await call(name, `${properties}.Get`, `string:${player}`, 'string:CanPlay')).toContain('boolean true');
      await call(name, `${player}.Play`);
      expect(commands).toContainEqual({type: 'desktop-transport', action: 'play'});
      state.playback.muted = true; bridge.refresh();
      await call(name, `${properties}.Set`, `string:${player}`, 'string:Volume', 'variant:double:0.38');
      expect(await call(name, `${properties}.Get`, `string:${player}`, 'string:Volume')).toContain('double 0.38');
      expect(state.playback.muted).toBe(false);
      await call(name, `${player}.Seek`, 'int64:1');
      await call(name, `${player}.SetPosition`, 'objpath:/org/radiocli/track/stale', 'int64:1');
      await call(name, `${properties}.Set`, `string:${player}`, 'string:Rate', 'variant:double:0');
      expect(state.playback.state).toBe('paused');
      await call(name, `${properties}.Set`, `string:${player}`, 'string:Rate', 'variant:double:1');

      contender = startMpris({identity, address: process.env.DBUS_SESSION_BUS_ADDRESS!, snapshot: () => state, command: async () => { throw new Error('Another owner must not receive this command.'); }});
      await delay(80);
      await call(name, `${player}.Pause`);
      expect(state.playback.state).toBe('paused');
      contender.close();
      state.available = false; bridge.refresh();
      await until(async () => !(await names()).includes(name));
      state.available = true; bridge.refresh();
      await until(async () => (await names()).includes(name));
      bridge.close();
      await until(async () => !(await names()).includes(name));
    } finally { contender?.close(); bridge.close(); }
  }, 15_000);
});

async function call(destination: string, method: string, ...args: string[]): Promise<string> {
  const result = await run('dbus-send', ['--session', '--print-reply', '--reply-timeout=2000', `--dest=${destination}`, path, method, ...args], {timeout: 3000, maxBuffer: 64 * 1024});
  return result.stdout;
}

async function names(): Promise<string> {
  const result = await run('dbus-send', ['--session', '--print-reply', '--reply-timeout=2000', '--dest=org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus.ListNames'], {timeout: 3000, maxBuffer: 64 * 1024});
  return result.stdout;
}

async function until(predicate: () => Promise<boolean>): Promise<void> {
  const end = Date.now() + 4000;
  while (Date.now() < end) { if (await predicate()) return; await delay(20); }
  throw new Error('The native session-bus condition did not become ready.');
}

function delay(milliseconds: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, milliseconds)); }
