import {EventEmitter} from 'node:events';
import {Socket} from 'node:net';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {mprisProperties, mprisServiceName, sessionBusSocket, startMpris, type MprisSnapshot} from './mpris.js';
import type {RadioSessionCommand} from '../agent/session.js';

type WireMessage = {type: number; serial: number; replySerial?: number; interface?: string; member?: string; signature?: string; body?: unknown[]; errorName?: string; destination?: string; sender?: string; path?: string};
const station = {provider: 'playlist' as const, id: 'https://user:secret@radio.test/private', name: 'RadioCLI station', tags: []};
const state = (): MprisSnapshot => ({owner: 'tui', station, queue: [station, {...station, id: 'second'}], playback: {backend: 'mpv', state: 'playing', volume: 70, muted: false, ready: true}, available: true});
const cleanups: Array<() => void> = [];
afterEach(() => { for (const close of cleanups.splice(0)) close(); vi.useRealTimers(); });
const flush = async () => { for (let count = 0; count < 12; count++) await Promise.resolve(); };

async function fixture(nameReply = 1) {
  let snapshot = state();
  let nextRequestSerial = 100;
  const sent: WireMessage[] = [];
  const connections: Array<EventEmitter & {stream: Socket; message(message: WireMessage): void}> = [];
  function makeConnection() {
    const emitter = new EventEmitter();
    const connection = Object.assign(emitter, {stream: new Socket(), message(message: WireMessage) {
      sent.push(message);
      if (message.member === 'Hello' || message.member === 'RequestName') queueMicrotask(() => emitter.emit('message', {type: 2, replySerial: message.serial, body: [message.member === 'Hello' ? ':1.8' : nameReply]}));
    }});
    connections.push(connection);
    return connection;
  }
  const command = vi.fn(async (_command: RadioSessionCommand) => ({ok: true, message: 'ok', status: snapshot}));
  const connect = vi.fn(async () => makeConnection());
  const bridge = startMpris({identity: '/private/library/radiocli.json', address: 'unix:path=/run/user/1000/bus', snapshot: () => snapshot, command, connect});
  cleanups.push(bridge.close);
  await flush();
  connections[0]!.emit('connect'); await flush();
  return {bridge, sent, connections, command, connect, set(value: Partial<MprisSnapshot>) { snapshot = {...snapshot, ...value}; }, async request(member: string, extras: Partial<WireMessage> = {}) {
    const serial = nextRequestSerial++;
    connections.at(-1)!.emit('message', {type: 1, serial, sender: ':1.22', path: '/org/mpris/MediaPlayer2', interface: 'org.mpris.MediaPlayer2.Player', member, ...extras});
    await flush(); return sent.find(message => message.replySerial === serial) ?? sent.at(-1)!;
  }};
}

describe('MPRIS metadata and capabilities', () => {
  it('reports real capabilities and omits fake seeking, duration, and private URLs', () => {
    const properties = mprisProperties({...state(), title: 'Track https://user:secret@host/path /private/token C:\\Users\\private file:///secret'});
    expect(properties.player).toMatchObject({PlaybackStatus: ['s', 'Playing'], CanSeek: ['b', false], CanPause: ['b', true], CanGoNext: ['b', true], Position: ['x', 0]});
    const serialized = JSON.stringify(properties);
    expect(serialized).toContain('Track');
    for (const privateValue of ['secret', '/private', 'Users', 'file:', 'mpris:length', 'xesam:url']) expect(serialized).not.toContain(privateValue);
    expect(mprisServiceName('/private/home')).toMatch(/^org\.mpris\.MediaPlayer2\.radiocli\.h[0-9a-f]{24}$/);
    expect(mprisServiceName('/private/home')).not.toBe(mprisServiceName('/other/home'));
  });
  it.each(['ffplay', 'vlc', 'airplay'])('does not promise pause for %s', backend => {
    expect(mprisProperties({...state(), playback: {...state().playback, backend}}).player.CanPause).toEqual(['b', false]);
  });
  it('clears metadata/transport flags for errors and loading, and distinguishes pause', () => {
    expect(mprisProperties({...state(), playback: {...state().playback, state: 'error', ready: false}}).player).toMatchObject({Metadata: ['a{sv}', []], CanPlay: ['b', false], CanGoNext: ['b', false], PlaybackStatus: ['s', 'Stopped']});
    expect(mprisProperties({...state(), playback: {...state().playback, state: 'paused', muted: true}}).player).toMatchObject({PlaybackStatus: ['s', 'Paused'], Volume: ['d', 0]});
  });
});

describe('local session bus addresses', () => {
  it('handles native abstract sockets and escaped absolute paths without a native addon', () => {
    expect(sessionBusSocket('unix:abstract=/tmp/dbus-123,guid=abcd')).toBe('\0/tmp/dbus-123');
    expect(sessionBusSocket('unix:path=/run/user/1000/my%20bus,guid=abcd')).toBe('/run/user/1000/my bus');
  });
  it.each(['unixexec:path=/tmp/run', 'tcp:host=localhost,port=1', 'unix:path=relative', 'unix:path=/ok,path=/bad', 'unix:path=/ok,abstract=bad', 'unix:path=/bad%00', 'unix:path=/bad%ZZ', `unix:path=/${'x'.repeat(108)}`])('rejects %s', address => { expect(sessionBusSocket(address)).toBeNull(); });
});

describe('MPRIS wire protocol and lifecycle', () => {
  it('claims a stable name without replacing or queueing for another owner', async () => {
    const app = await fixture();
    expect(app.sent.find(message => message.member === 'RequestName')).toMatchObject({signature: 'su', body: [mprisServiceName('/private/library/radiocli.json'), 4]});
    expect((await app.request('Get', {interface: 'org.freedesktop.DBus.Properties', signature: 'ss', body: ['org.mpris.MediaPlayer2.Player', 'CanSeek']}))).toMatchObject({type: 2, signature: 'v', body: [['b', false]]});
    expect((await app.request('GetAll', {interface: 'org.freedesktop.DBus.Properties', signature: 's', body: ['org.mpris.MediaPlayer2']}))).toMatchObject({type: 2, signature: 'a{sv}'});
    const xml = await app.request('Introspect', {interface: 'org.freedesktop.DBus.Introspectable'});
    expect(xml.body?.[0]).toContain('type="x"');
    expect(xml.body?.[0]).toContain('name="Volume" type="d" access="readwrite"');
  });
  it('sends queue actions with paused selection semantics to the real owner', async () => {
    const app = await fixture();
    await app.request('Next'); await app.request('Previous'); await app.request('Pause');
    app.set({playback: {...state().playback, state: 'paused'}});
    await app.request('PlayPause');
    expect(app.command.mock.calls.map(([command]) => command)).toEqual(['next', 'previous', 'pause', 'toggle'].map(action => ({type: 'desktop-transport', action})));
  });
  it('validates property signatures, preserves unsupported controls, and clamps volume', async () => {
    const app = await fixture();
    expect(await app.request('Seek', {signature: 'x', body: [50]})).toMatchObject({type: 2});
    expect(await app.request('SetPosition', {signature: 'ox', body: ['/org/radiocli/stale', 50]})).toMatchObject({type: 2});
    expect(await app.request('Set', {interface: 'org.freedesktop.DBus.Properties', signature: 'ssv', body: ['org.mpris.MediaPlayer2.Player', 'Volume', [[{type: 's', child: []}], ['1']]]})).toMatchObject({type: 3, errorName: 'org.freedesktop.DBus.Error.InvalidArgs'});
    await app.request('Set', {interface: 'org.freedesktop.DBus.Properties', signature: 'ssv', body: ['org.mpris.MediaPlayer2.Player', 'Volume', [[{type: 'd', child: []}], [2]]]});
    expect(app.command).toHaveBeenCalledExactlyOnceWith({type: 'set-volume', volume: 100, unmute: true});
    expect(await app.request('Get', {interface: 'org.freedesktop.DBus.Properties', signature: 'ss', body: ['org.mpris.MediaPlayer2.Player', 'constructor']})).toMatchObject({type: 3});
  });
  it('retains stopped selection and advertises Play/PlayPause and silent queue selection', async () => {
    const app = await fixture();
    await app.request('Stop');
    expect(app.command).toHaveBeenLastCalledWith({type: 'desktop-transport', action: 'stop'});
    app.set({playback: {...state().playback, state: 'stopped', ready: false}});
    expect(mprisProperties({...state(), playback: {...state().playback, state: 'stopped', ready: false}}).player).toMatchObject({CanPlay: ['b', true], CanPause: ['b', true], CanGoNext: ['b', true]});
    await app.request('Next');
    expect(app.command).toHaveBeenLastCalledWith({type: 'desktop-transport', action: 'next'});
    await app.request('Play');
    expect(app.command).toHaveBeenLastCalledWith({type: 'desktop-transport', action: 'play'});
    await app.request('PlayPause');
    expect(app.command).toHaveBeenLastCalledWith({type: 'desktop-transport', action: 'toggle'});
  });
  it('implements capability no-ops and treats Rate zero as Pause without changing the rate', async () => {
    const app = await fixture();
    await app.request('Set', {interface: 'org.freedesktop.DBus.Properties', signature: 'ssv', body: ['org.mpris.MediaPlayer2.Player', 'Rate', [[{type: 'd', child: []}], [0]]]});
    expect(app.command).toHaveBeenLastCalledWith({type: 'desktop-transport', action: 'pause'});
    expect(await app.request('Set', {interface: 'org.freedesktop.DBus.Properties', signature: 'ssv', body: ['org.mpris.MediaPlayer2.Player', 'Rate', [[{type: 'd', child: []}], [1]]]})).toMatchObject({type: 2});
    app.command.mockClear();
    app.set({station: null, queue: [], playback: {...state().playback, state: 'stopped', ready: false}});
    for (const member of ['Next', 'Previous', 'Pause', 'Play', 'Stop']) expect(await app.request(member)).toMatchObject({type: 2});
    expect(app.command.mock.calls.map(([command]) => command)).toEqual(['next', 'previous', 'pause', 'play', 'stop'].map(action => ({type: 'desktop-transport', action})));
  });
  it('does not publish duplicate unchanged events and clears the service when alarms take ownership', async () => {
    const app = await fixture();
    const before = app.sent.length;
    app.bridge.refresh(); app.bridge.refresh();
    expect(app.sent).toHaveLength(before);
    app.set({available: false}); app.bridge.refresh();
    expect(app.connections[0]!.stream.destroyed).toBe(true);
    await app.request('Play');
    expect(app.command).not.toHaveBeenCalled();
  });
  it('never exposes a second service when the data home already has an owner', async () => {
    vi.useFakeTimers();
    const app = await fixture(3);
    expect(app.connections[0]!.stream.destroyed).toBe(true);
    expect(app.sent.some(message => message.member === 'PropertiesChanged')).toBe(false);
    await app.request('Next'); expect(app.command).not.toHaveBeenCalled();
  });
  it('reconnects after bus restart and never replies through a replacement connection for an old request', async () => {
    vi.useFakeTimers();
    const app = await fixture();
    let complete: (() => void) | undefined;
    app.command.mockImplementationOnce(() => new Promise(resolve => { complete = () => resolve({ok: true, message: 'ok', status: state()}); }));
    await app.request('Next');
    app.connections[0]!.emit('error', new Error('Restart'));
    await vi.advanceTimersByTimeAsync(500);
    app.connections[1]!.emit('connect'); await flush();
    const before = app.sent.length;
    complete!(); await flush();
    expect(app.sent).toHaveLength(before);
    app.bridge.close(); await vi.advanceTimersByTimeAsync(60_000);
    expect(app.connect).toHaveBeenCalledTimes(2);
  });
  it('ignores authentication finishing after the bridge was disposed', async () => {
    vi.useFakeTimers();
    const app = await fixture();
    app.connections[0]!.emit('end');
    await vi.advanceTimersByTimeAsync(500);
    app.bridge.close();
    const before = app.sent.length;
    app.connections[1]!.emit('connect'); await flush();
    expect(app.sent).toHaveLength(before);
    expect(app.connections[1]!.stream.destroyed).toBe(true);
  });
});
