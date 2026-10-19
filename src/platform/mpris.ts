import {createHash} from 'node:crypto';
import {createConnection as connectSocket, type Socket} from 'node:net';
import type {EventEmitter} from 'node:events';
import type {RadioSessionCommand, RadioSessionResult, RadioSessionStatus} from '../agent/session.js';

const objectPath = '/org/mpris/MediaPlayer2';
const rootInterface = 'org.mpris.MediaPlayer2';
const playerInterface = `${rootInterface}.Player`;
const propertiesInterface = 'org.freedesktop.DBus.Properties';
type Variant = [string, unknown];
type Properties = Record<string, Variant>;
type Message = {type: number; serial: number; replySerial?: number; sender?: string; destination?: string; path?: string; interface?: string; member?: string; signature?: string; body?: unknown[]; errorName?: string};
type Connection = EventEmitter & {stream: Socket; message(message: Message): void};
export type MprisSnapshot = RadioSessionStatus & {title?: string; available: boolean};
type Options = {
  identity: string;
  address: string;
  snapshot(): MprisSnapshot;
  command(command: RadioSessionCommand): Promise<RadioSessionResult>;
  connect?: (path: string) => Promise<Connection>;
};

/** Only local Unix transports are accepted. Never hand a unixexec or TCP
 * address to the dependency's address parser. Node handles abstract sockets. */
export function sessionBusSocket(address: string): string | null {
  if (address.length > 4096 || /[\0\r\n]/.test(address)) return null;
  for (const entry of address.split(';')) {
    if (!entry.startsWith('unix:')) continue;
    const values = new Map<string, string>();
    try {
      for (const part of entry.slice(5).split(',')) {
        const at = part.indexOf('=');
        if (at <= 0) throw new Error('Invalid bus address');
        const key = part.slice(0, at);
        if (values.has(key)) throw new Error('Duplicate bus address key');
        values.set(key, decodeURIComponent(part.slice(at + 1)));
      }
    } catch { continue; }
    const path = values.get('path');
    const abstract = values.get('abstract');
    if (path && !abstract && path.startsWith('/') && !/[\0\r\n]/.test(path) && Buffer.byteLength(path) < 108) return path;
    if (abstract && !path && !/[\0\r\n]/.test(abstract) && Buffer.byteLength(abstract) < 107) return `\0${abstract}`;
  }
  return null;
}

export function mprisServiceName(identity: string): string {
  return `${rootInterface}.radiocli.h${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
}

export function mprisProperties(snapshot: MprisSnapshot): {root: Properties; player: Properties} {
  const {playback, station, queue} = snapshot;
  const active = snapshot.available && playback.ready && ['playing', 'paused'].includes(playback.state);
  const selected = snapshot.available && Boolean(station) && (active || ['idle', 'stopped'].includes(playback.state));
  const pause = selected && playback.backend === 'mpv';
  const metadata: Array<[string, Variant]> = [];
  if (selected && station) {
    metadata.push(['mpris:trackid', ['o', `/org/radiocli/track/t${createHash('sha256').update(`${station.provider}\0${station.id}`).digest('hex').slice(0, 24)}`]]);
    metadata.push(['xesam:title', ['s', publicText(snapshot.title) || publicText(station.name) || 'RadioCLI']]);
    const stationName = publicText(station.name);
    if (stationName) metadata.push(['xesam:album', ['s', stationName]]);
  }
  return {
    root: {
      CanQuit: ['b', false], CanRaise: ['b', false], HasTrackList: ['b', false],
      Identity: ['s', 'RadioCLI'], SupportedUriSchemes: ['as', []], SupportedMimeTypes: ['as', []]
    },
    player: {
      PlaybackStatus: ['s', active ? playback.state === 'paused' ? 'Paused' : 'Playing' : 'Stopped'],
      Rate: ['d', 1], Metadata: ['a{sv}', metadata], Volume: ['d', playback.muted ? 0 : Math.max(0, Math.min(1, playback.volume / 100))],
      Position: ['x', 0], MinimumRate: ['d', 1], MaximumRate: ['d', 1],
      CanGoNext: ['b', selected && queue.length > 1], CanGoPrevious: ['b', selected && queue.length > 1],
      CanPlay: ['b', selected], CanPause: ['b', pause], CanSeek: ['b', false], CanControl: ['b', snapshot.available]
    }
  };
}

function publicText(value: string | undefined): string {
  // Broadcast text is untrusted; URI/path-shaped metadata can contain tokens.
  return (value ?? '').replace(/[\x00-\x1f\x7f-\x9f]/g, '').replace(/(?:[a-z][a-z0-9+.-]*:\/\/|\bfile:|\b[a-z]:[\\/]|(?:^|\s)[/~\\])\S*/gi, '').trim().slice(0, 512);
}

/** A small, typed MPRIS endpoint. Closing the private connection releases its
 * name, so no ReleaseName race can release a replacement owner's service. */
export function startMpris(options: Options): {refresh(): void; close(): void} {
  const path = sessionBusSocket(options.address);
  let disposed = false;
  let generation = 0;
  let connection: Connection | undefined;
  let connected = false;
  let registered = false;
  let starting = false;
  let serial = 1;
  let retries = 0;
  let timer: NodeJS.Timeout | undefined;
  let lastProperties = '';
  const pending = new Map<number, {resolve(value: unknown[]): void; reject(): void; timer: NodeJS.Timeout}>();
  const available = () => !disposed && options.snapshot().available;
  const send = (message: Omit<Message, 'serial'>): void => {
    if (connected && connection && !connection.stream.destroyed) connection.message({...message, serial: serial++});
  };
  const disconnect = () => {
    generation += 1;
    registered = false;
    starting = false;
    connected = false;
    if (timer) clearTimeout(timer);
    timer = undefined;
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(); }
    pending.clear();
    connection?.stream.destroy();
    connection = undefined;
  };
  const retry = () => {
    disconnect();
    if (!available()) return;
    timer = setTimeout(() => { timer = undefined; void start(); }, Math.min(30_000, 500 * 2 ** Math.min(6, retries++)));
    timer.unref();
  };
  const call = (member: string, signature = '', body: unknown[] = []): Promise<unknown[]> => new Promise((resolve, reject) => {
    if (!connected || !connection || connection.stream.destroyed) { reject(new Error('Session bus disconnected.')); return; }
    const id = serial++;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Session bus did not respond.')); }, 2000);
    timeout.unref();
    pending.set(id, {resolve, reject: () => reject(new Error('Session bus disconnected.')), timer: timeout});
    connection!.message({type: 1, serial: id, path: '/org/freedesktop/DBus', destination: 'org.freedesktop.DBus', interface: 'org.freedesktop.DBus', member, signature, body});
  });
  const error = (request: Message, name: string, detail: string) => send({type: 3, destination: request.sender, replySerial: request.serial, errorName: `org.freedesktop.DBus.Error.${name}`, signature: 's', body: [detail]});
  const reply = (request: Message, signature = '', body: unknown[] = []) => send({type: 2, destination: request.sender, replySerial: request.serial, signature, body});
  const receive = async (request: Message, current: number) => {
    if (current !== generation || disposed) return;
    if (request.type === 2 || request.type === 3) {
      const handler = request.replySerial === undefined ? undefined : pending.get(request.replySerial);
      if (handler) {
        pending.delete(request.replySerial!); clearTimeout(handler.timer);
        if (request.type === 2) handler.resolve(request.body ?? []); else handler.reject();
      }
      return;
    }
    if (request.type !== 1 || !registered) return;
    if (request.path !== objectPath) { error(request, 'UnknownObject', 'Unknown object.'); return; }
    try {
      if (request.interface === 'org.freedesktop.DBus.Introspectable' && request.member === 'Introspect' && !request.signature) { reply(request, 's', [introspection]); return; }
      if (request.interface === 'org.freedesktop.DBus.Peer' && request.member === 'Ping' && !request.signature) { reply(request); return; }
      const properties = mprisProperties(options.snapshot());
      if (request.interface === propertiesInterface) {
        const [iface, property, value] = request.body ?? [];
        const values = iface === rootInterface ? properties.root : iface === playerInterface ? properties.player : null;
        if (!values) { error(request, 'UnknownInterface', 'Unknown interface.'); return; }
        if (request.member === 'GetAll' && request.signature === 's') { reply(request, 'a{sv}', [Object.entries(values)]); return; }
        if (typeof property !== 'string' || !Object.hasOwn(values, property)) { error(request, 'UnknownProperty', 'Unknown property.'); return; }
        if (request.member === 'Get' && request.signature === 'ss') { reply(request, 'v', [values[property]]); return; }
        if (request.member === 'Set' && request.signature === 'ssv') {
          if (iface === playerInterface && property === 'Rate') {
            const rate = doubleVariant(value);
            if (rate === 1) reply(request);
            else if (rate === 0) {
              const result = await options.command({type: 'desktop-transport', action: 'pause'});
              if (!result.ok) throw new Error('Control unavailable.');
              if (current === generation) { reply(request); refresh(); }
            } else error(request, 'NotSupported', 'Live radio plays at its broadcast rate.');
            return;
          }
          if (iface !== playerInterface || property !== 'Volume') { error(request, 'PropertyReadOnly', 'Property cannot be changed.'); return; }
          const volume = doubleVariant(value);
          if (volume === null) { error(request, 'InvalidArgs', 'Volume must be a finite double.'); return; }
          const result = await options.command({type: 'set-volume', volume: Math.min(1, Math.max(0, volume)) * 100, unmute: true});
          if (!result.ok) throw new Error('Control unavailable.');
          if (current === generation) { reply(request); refresh(); }
          return;
        }
        error(request, 'InvalidArgs', 'Invalid properties request.'); return;
      }
      if (request.interface === playerInterface && (request.member === 'Seek' && request.signature === 'x' || request.member === 'SetPosition' && request.signature === 'ox')) { reply(request); return; }
      if (request.interface !== playerInterface || request.signature) { error(request, 'NotSupported', 'This action is not supported for live radio.'); return; }
      let action: Extract<RadioSessionCommand, {type: 'desktop-transport'}>['action'] | undefined;
      switch (request.member) {
        case 'Next': action = 'next'; break;
        case 'Previous': action = 'previous'; break;
        case 'Pause': action = 'pause'; break;
        case 'Play': action = 'play'; break;
        case 'PlayPause': action = 'toggle'; break;
        case 'Stop': action = 'stop'; break;
      }
      if (!action) { error(request, 'NotSupported', 'This action is currently unavailable.'); return; }
      const result = await options.command({type: 'desktop-transport', action});
      if (!result.ok) throw new Error('Control unavailable.');
      if (current === generation) { reply(request); refresh(); }
    } catch { if (current === generation) error(request, 'Failed', 'RadioCLI could not complete the control request.'); }
  };
  const start = async () => {
    if (!path || !available() || connection || timer || starting) return;
    starting = true;
    const current = ++generation;
    try {
      const created = await (options.connect ?? nativeConnection)(path);
      if (disposed || current !== generation || !available()) { created.stream.destroy(); return; }
      connection = created;
      created.on('error', () => { if (current === generation) retry(); });
      created.on('end', () => { if (current === generation) retry(); });
      created.stream.on('close', () => { if (current === generation) retry(); });
      created.on('message', message => { void receive(message as Message, current); });
      timer = setTimeout(() => { if (current === generation) retry(); }, 2000);
      timer.unref();
      created.once('connect', () => {
        if (current !== generation || connection !== created || !available()) { created.stream.destroy(); return; }
        connected = true;
        if (timer) clearTimeout(timer); timer = undefined;
        void (async () => {
          await call('Hello');
          if (current !== generation) return;
          const [result] = await call('RequestName', 'su', [mprisServiceName(options.identity), 4]);
          if (current !== generation) return;
          // DO_NOT_QUEUE: never replace or wait in the ownership queue.
          if (result !== 1) { retry(); return; }
          registered = true; starting = false; retries = 0; lastProperties = ''; refresh();
        })().catch(() => { if (current === generation) retry(); });
      });
    } catch { if (current === generation) retry(); }
  };
  const refresh = () => {
    if (!available()) { disconnect(); return; }
    if (!registered) { void start(); return; }
    const properties = mprisProperties(options.snapshot()).player;
    // Position is not a clock for a live broadcast and does not emit changes.
    const changed = Object.entries(properties).filter(([name]) => name !== 'Position' && name !== 'CanControl');
    const encoded = JSON.stringify(changed);
    if (encoded === lastProperties) return;
    lastProperties = encoded;
    send({type: 4, path: objectPath, interface: propertiesInterface, member: 'PropertiesChanged', signature: 'sa{sv}as', body: [playerInterface, changed, []]});
  };
  void start();
  return {refresh, close() { disposed = true; disconnect(); }};
}

async function nativeConnection(path: string): Promise<Connection> {
  const module = await import('@homebridge/dbus-native');
  const factory = module.default as unknown as {createConnection(options: {stream: Socket; authMethods: string[]}): Connection};
  const stream = connectSocket(path);
  return factory.createConnection({stream, authMethods: ['EXTERNAL']});
}

function doubleVariant(value: unknown): number | null {
  if (!Array.isArray(value) || !Array.isArray(value[0]) || !Array.isArray(value[1])) return null;
  const [type] = value[0] as Array<{type?: string}>;
  const [number] = value[1] as unknown[];
  return value[0].length === 1 && type?.type === 'd' && typeof number === 'number' && Number.isFinite(number) ? number : null;
}

const propertyXml = (values: Record<string, string>, writable: string[] = []) => Object.entries(values).map(([name, type]) => `<property name="${name}" type="${type}" access="${writable.includes(name) ? 'readwrite' : 'read'}"/>`).join('');
const introspection = `<node><interface name="org.freedesktop.DBus.Introspectable"><method name="Introspect"><arg direction="out" type="s"/></method></interface><interface name="org.freedesktop.DBus.Peer"><method name="Ping"/></interface><interface name="${propertiesInterface}"><method name="Get"><arg direction="in" type="s"/><arg direction="in" type="s"/><arg direction="out" type="v"/></method><method name="GetAll"><arg direction="in" type="s"/><arg direction="out" type="a{sv}"/></method><method name="Set"><arg direction="in" type="s"/><arg direction="in" type="s"/><arg direction="in" type="v"/></method><signal name="PropertiesChanged"><arg type="s"/><arg type="a{sv}"/><arg type="as"/></signal></interface><interface name="${rootInterface}"><method name="Raise"/><method name="Quit"/>${propertyXml({CanQuit: 'b', CanRaise: 'b', HasTrackList: 'b', Identity: 's', SupportedUriSchemes: 'as', SupportedMimeTypes: 'as'})}</interface><interface name="${playerInterface}">${['Next', 'Previous', 'Pause', 'PlayPause', 'Stop', 'Play'].map(name => `<method name="${name}"/>`).join('')}<method name="Seek"><arg direction="in" type="x"/></method><method name="SetPosition"><arg direction="in" type="o"/><arg direction="in" type="x"/></method><method name="OpenUri"><arg direction="in" type="s"/></method>${propertyXml({PlaybackStatus: 's', Rate: 'd', Metadata: 'a{sv}', Volume: 'd', Position: 'x', MinimumRate: 'd', MaximumRate: 'd', CanGoNext: 'b', CanGoPrevious: 'b', CanPlay: 'b', CanPause: 'b', CanSeek: 'b', CanControl: 'b'}, ['Volume', 'Rate'])}</interface></node>`;
