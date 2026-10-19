import {randomUUID} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {parseRadioCommand} from './command-schema.js';
import {connectRadioSession, ensureRadioSession, serializeRadioCommands, startRadioSession, type RadioSessionResult} from './session.js';

const station = {id: 'first', provider: 'playlist' as const, name: 'First', tags: [], streamUrl: 'https://example.test/live'};
const idle: RadioSessionResult = {ok: true, message: 'ok', status: {owner: 'headless', station: null, queue: [], playback: {backend: 'none', state: 'idle', ready: false, volume: 70, muted: false}}};
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true}); });
function deferred() { let resolve!: () => void; const promise = new Promise<void>(finish => { resolve = finish; }); return {promise, resolve}; }
function sessionPath() { const root = mkdtempSync(join(tmpdir(), 'radiocli-command-contract-')); roots.push(root); return join(root, 'session.json'); }

describe('responsive control protocol', () => {
  it('never launches a playback owner for an already canceled request', async () => {
    const controller = new AbortController(); controller.abort(); const start = vi.fn(async () => {});
    await expect(connectRadioSession(sessionPath(), {signal: controller.signal})).rejects.toMatchObject({name: 'AbortError'});
    await expect(ensureRadioSession(start, 1000, {signal: controller.signal})).rejects.toMatchObject({name: 'AbortError'});
    expect(start).not.toHaveBeenCalled();
  });

  it.each([
    {type: 'invented-command'}, {type: 'set-volume', volume: NaN}, {type: 'set-volume', volume: 101},
    {type: 'play', station: {id: 'x'}}, {type: 'next', preserveStop: 'yes'},
    {type: 'update-settings', settings: {enableExperimentalLinuxAirPlay: true}}
  ])('rejects malformed commands before dispatch: %j', command => {
    expect(() => parseRadioCommand(command)).toThrow('Invalid radio command');
  });

  it('answers status and Stop while resolution is blocked, cancels queued transport, and admits a subsequent tune', async () => {
    const held = deferred();
    const order: string[] = [];
    const dispatch = serializeRadioCommands(async (command, signal) => {
      order.push(command.type === 'play' ? `play:${command.station.id}` : command.type);
      if (command.type === 'play' && command.station.id === 'first') { await held.promise; signal?.throwIfAborted(); }
      return idle;
    }, {responsive: true});
    const play = dispatch({type: 'play', station});
    const pause = dispatch({type: 'pause'});
    await vi.waitFor(() => expect(order).toEqual(['play:first']));
    await expect(dispatch({type: 'status'})).resolves.toEqual(idle);
    await expect(dispatch({type: 'stop'})).resolves.toEqual(idle);
    await expect(play).rejects.toMatchObject({name: 'AbortError'});
    await expect(pause).rejects.toMatchObject({name: 'AbortError'});
    await expect(dispatch({type: 'play', station: {...station, id: 'second'}})).resolves.toEqual(idle);
    expect(order).toEqual(['play:first', 'status', 'stop', 'play:second']);
    held.resolve();
  });

  it('preserves desktop Pause/Play order across a pending tune without blocking preference updates', async () => {
    const held = deferred(); const order: string[] = [];
    const dispatch = serializeRadioCommands(async command => {
      order.push(command.type === 'desktop-transport' ? command.action : command.type);
      if (command.type === 'play') await held.promise;
      return idle;
    }, {responsive: true});
    const play = dispatch({type: 'play', station});
    await vi.waitFor(() => expect(order).toEqual(['play']));
    await dispatch({type: 'update-settings', settings: {theme: 'amber'}});
    const pause = dispatch({type: 'desktop-transport', action: 'pause'});
    const resume = dispatch({type: 'desktop-transport', action: 'play'});
    expect(order).toEqual(['play', 'update-settings']);
    held.resolve(); await Promise.all([play, pause, resume]);
    expect(order).toEqual(['play', 'update-settings', 'pause', 'play']);
  });

  it('cancels pending output discovery for an authorized replacement, without canceling later transport', async () => {
    const held = deferred(); const signals = new Map<string, AbortSignal | undefined>(); const finished: string[] = [];
    const dispatch = serializeRadioCommands(async (command, signal) => {
      signals.set(command.type, signal);
      if (command.type === 'airplay-select') { await held.promise; signal?.throwIfAborted(); }
      finished.push(command.type);
      return idle;
    }, {responsive: true});
    const selection = dispatch({type: 'airplay-select', deviceId: 'receiver'});
    await vi.waitFor(() => expect(signals.has('airplay-select')).toBe(true));
    const play = dispatch({type: 'play', station});
    const pause = dispatch({type: 'pause'});
    await expect(play).resolves.toEqual(idle);
    await expect(selection).rejects.toMatchObject({name: 'AbortError'});
    await expect(pause).resolves.toEqual(idle);
    expect(signals.get('airplay-select')?.aborted).toBe(true);
    expect(signals.get('pause')?.aborted).toBe(false);
    held.resolve();
    await Promise.resolve();
    expect(finished).toEqual(['play', 'pause']);
  });

  it('does not let an unauthorized replacement cancel accepted output discovery', async () => {
    const held = deferred(); let signal: AbortSignal | undefined;
    const dispatch = serializeRadioCommands(async (command, current) => {
      if (command.type === 'airplay-select') { signal = current; await held.promise; }
      return idle;
    }, {responsive: true});
    const selection = dispatch({type: 'airplay-select', deviceId: 'receiver'});
    await vi.waitFor(() => expect(signal).toBeDefined());
    await expect(dispatch({type: 'play', station}, () => false)).rejects.toThrow('suspended');
    expect(signal?.aborted).toBe(false);
    held.resolve(); await expect(selection).resolves.toEqual(idle);
  });

  it.each(['stop', 'play'] as const)('preserves the earlier tune fence after a denied %s', async type => {
    const held = deferred(); const order: string[] = [];
    const dispatch = serializeRadioCommands(async command => {
      order.push(command.type);
      if (command.type === 'play') await held.promise;
      return idle;
    }, {responsive: true});
    const play = dispatch({type: 'play', station});
    await vi.waitFor(() => expect(order).toEqual(['play']));
    await expect(dispatch(type === 'play' ? {type, station} : {type}, () => false)).rejects.toThrow('suspended');
    const pause = dispatch({type: 'pause'});
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(order).toEqual(['play']);
    held.resolve(); await Promise.all([play, pause]);
    expect(order).toEqual(['play', 'pause']);
  });

  it('does not cancel playback for an unauthorized Stop and retains priority access when admission is full', async () => {
    const held = deferred(); let signal: AbortSignal | undefined;
    const dispatch = serializeRadioCommands(async (command, current) => {
      if (command.type === 'play') { signal = current; await held.promise; }
      return idle;
    }, {responsive: true, limit: 1});
    const play = dispatch({type: 'play', station});
    await vi.waitFor(() => expect(signal).toBeDefined());
    await expect(dispatch({type: 'stop'}, () => false)).rejects.toThrow('suspended');
    expect(signal?.aborted).toBe(false);
    await expect(dispatch({type: 'pause'})).rejects.toThrow('busy');
    await expect(dispatch({type: 'status'})).resolves.toEqual(idle);
    await dispatch({type: 'stop'});
    await expect(play).rejects.toMatchObject({name: 'AbortError'});
    held.resolve();
  });

  it('deduplicates concurrent and retried request IDs and rejects an ID with a different payload', async () => {
    const path = sessionPath(); let writes = 0; const held = deferred();
    const server = await startRadioSession(async command => {
      if (command.type === 'set-muted') { writes++; await held.promise; }
      return idle;
    }, path, {queue: 'owner'});
    try {
      const client = (await connectRadioSession(path))!; const id = randomUUID();
      const first = client.call({type: 'set-muted', muted: true}, id);
      const retry = client.call({type: 'set-muted', muted: true}, id);
      await vi.waitFor(() => expect(writes).toBe(1));
      await expect(client.call({type: 'set-muted', muted: false}, id)).rejects.toThrow('different command');
      held.resolve(); await Promise.all([first, retry]);
      await client.call({type: 'set-muted', muted: true}, id);
      expect(writes).toBe(1);
      const discovery = JSON.parse(readFileSync(path, 'utf8')) as {host: string; port: number; token: string};
      const host = discovery.host.includes(':') ? `[${discovery.host}]` : discovery.host;
      const response = await fetch(`http://${host}:${discovery.port}/command`, {method: 'POST', headers: {authorization: `Bearer ${discovery.token}`}, body: JSON.stringify({type: 'typo'})});
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({error: expect.stringContaining('Invalid radio command')});
      expect(writes).toBe(1);
    } finally { held.resolve(); await server.close(); }
  });

  it('rejects malformed HTTP responses without an uncaught parser exception', async () => {
    const path = sessionPath(); let malformed = false;
    const server = createServer((req, res) => { req.resume(); res.end(malformed ? '{invalid' : JSON.stringify(idle)); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing listener');
      writeFileSync(path, JSON.stringify({version: 1, host: '127.0.0.1', port: address.port, token: 'test', pid: process.pid}));
      const client = (await connectRadioSession(path))!; malformed = true;
      await expect(client.status()).rejects.toThrow();
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
