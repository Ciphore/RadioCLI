import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createSocket} from 'node:dgram';
import {once} from 'node:events';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {createServer as createTcpServer, type AddressInfo} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import type {AirPlayDevice} from '../types.js';
import {discoverAirPlayDevices} from './airplay-discovery.js';
import {encodeWorkerStart, parseWorkerMessage, serializeWorkerMessage, type AirPlayWorkerCommand, type AirPlayWorkerEvent} from './airplay-worker-protocol.js';

// Requires FFmpeg, Shairport Sync with stdout/Avahi support, and a running Avahi
// daemon. Only software PCM is measured; this does not establish physical output.
const native = process.platform === 'linux' && process.env.RADIOCLI_NATIVE_AIRPLAY_TEST === '1';

describe.skipIf(!native)('native AirPlay sender', () => {
  it.each([false, true])('streams, retunes, publishes metadata and stops (password: %s)', async password => {
    await withReceiver(password, async fixture => {
      await fixture.verifyDiscovery();
      const session = fixture.startWorker(true);
      if (password) {
        await until(() => session.events.some(event => event.type === 'password-required'), 'password prompt');
        session.send({type: 'passcode', code: 'receiver-secret'});
      }
      await until(() => session.events.some(event => event.type === 'ready'), 'sender ready');
      await until(() => fixture.bytes() > 88_200, 'muted PCM');
      // Shairport applies one-bit dither even to muted PCM.
      expect(fixture.peak()).toBeLessThanOrEqual(1);
      await until(() => fixture.metadata().includes('Native station'), 'station metadata');
      session.send({type: 'setMuted', muted: false});
      await until(() => fixture.energy() > 30 && fixture.frequency() > 400, 'decoded 440 Hz audio');
      const initialEnergy = fixture.energy();
      session.send({type: 'setVolume', volume: 25});
      await until(() => fixture.energy() > 5 && fixture.energy() < initialEnergy * 0.8, 'receiver volume');
      session.send({type: 'setMuted', muted: true});
      await until(() => fixture.energy() < 1, 'receiver mute');
      session.send({type: 'setMuted', muted: false});
      session.send({type: 'retune', streamUrl: fixture.url(880), stationName: 'Retuned station'});
      await until(() => session.events.some(event => event.type === 'retuned'), 'retune acknowledgement');
      await until(() => fixture.frequency() > 750, 'decoded 880 Hz audio');
      await until(() => fixture.metadata().includes('Retuned station'), 'retuned metadata');
      const pids = session.decoderPids();
      expect(pids.length).toBeGreaterThan(0);
      if (password) session.child.kill('SIGHUP');
      else session.send({type: 'stop'});
      expect((await waitClosed(session))[0]).toBe(0);
      expect(session.events.some(event => event.type === 'error')).toBe(false);
      expect(session.stderr()).not.toContain('receiver-secret');
      expect(session.stderr()).not.toContain('stream-secret');
      await until(() => pids.every(pid => !alive(pid)), 'decoder cleanup');
    });
  }, 40_000);

  it('rejects a wrong password and releases its decoder without leaking the code', async () => {
    await withReceiver(true, async fixture => {
      const session = fixture.startWorker(false);
      await until(() => session.events.some(event => event.type === 'password-required'), 'password prompt');
      const pids = session.decoderPids();
      session.send({type: 'passcode', code: 'wrong-secret'});
      expect((await waitClosed(session))[0]).toBe(1);
      expect(session.events).toContainEqual({type: 'error', message: 'AirPlay receiver rejected the code or pairing request.'});
      expect(session.stderr()).not.toContain('wrong-secret');
      expect(session.stderr()).not.toContain('stream-secret');
      await until(() => pids.every(pid => !alive(pid)), 'decoder cleanup');
    });
  }, 20_000);

  it('stops after receiver loss and can connect in a new session', async () => {
    await withReceiver(false, async fixture => {
      const session = fixture.startWorker(false);
      await until(() => fixture.energy() > 30, 'decoded audio');
      const pids = session.decoderPids();
      await fixture.restartReceiver();
      expect((await waitClosed(session))[0]).toBe(1);
      expect(session.events.some(event => event.type === 'error')).toBe(true);
      await until(() => pids.every(pid => !alive(pid)), 'lost receiver decoder cleanup');
      const next = fixture.startWorker(false);
      await until(() => next.events.some(event => event.type === 'ready'), 'reconnected sender');
      next.send({type: 'stop'});
      expect((await waitClosed(next))[0]).toBe(0);
    });
  }, 25_000);
});

type Session = {
  child: ChildProcessWithoutNullStreams;
  closed: Promise<[number | null, NodeJS.Signals | null]>;
  events: AirPlayWorkerEvent[];
  send: (command: AirPlayWorkerCommand) => void;
  stderr: () => string;
  decoderPids: () => number[];
};
type Fixture = {
  startWorker: (muted: boolean) => Session;
  url: (frequency: number) => string;
  bytes: () => number;
  energy: () => number;
  frequency: () => number;
  peak: () => number;
  metadata: () => string;
  restartReceiver: () => Promise<void>;
  verifyDiscovery: () => Promise<void>;
};

async function withReceiver(password: boolean, check: (fixture: Fixture) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'radiocli-native-raop-'));
  const children: ChildProcessWithoutNullStreams[] = [];
  const timers = new Set<NodeJS.Timeout>();
  const metadataSocket = createSocket('udp4');
  let metadata = ''; let pcm = Buffer.alloc(0); let bytes = 0; let peak = 0;
  metadataSocket.on('message', chunk => { metadata = (metadata + chunk.toString()).slice(-64 * 1024); });
  const server = createServer((request, response) => {
    const tone = wave(Number(new URL(request.url!, 'http://localhost').pathname.slice(1)) || 440);
    response.writeHead(200, {'content-type': 'audio/wav'}); response.write(tone.header);
    const timer = setInterval(() => response.write(tone.samples), 100);
    timers.add(timer);
    response.on('close', () => { clearInterval(timer); timers.delete(timer); });
  });
  try {
    metadataSocket.bind(0, '127.0.0.1'); await once(metadataSocket, 'listening');
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const reserve = createTcpServer(); reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
    const port = (reserve.address() as AddressInfo).port;
    await new Promise<void>(resolve => reserve.close(() => resolve()));
    const config = join(directory, 'receiver.conf');
    writeFileSync(config, `general = { name = "RadioCLI native ${process.pid} ${port}"; port = ${port}; ${password ? 'password = "receiver-secret";' : ''} };\nmetadata = { enabled = "yes"; pipe_name = "${directory}/metadata"; socket_address = "127.0.0.1"; socket_port = ${metadataSocket.address().port}; };\n`);
    const startReceiver = async () => {
      const child = spawn('shairport-sync', ['-c', config, '-o', 'stdout', '-u'], {stdio: 'pipe'});
      children.push(child);
      let spawnError: Error | undefined;
      child.once('error', error => { spawnError = error; });
      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        for (let index = 0; index + 1 < chunk.length; index += 2) peak = Math.max(peak, Math.abs(chunk.readInt16LE(index)));
        pcm = Buffer.concat([pcm, chunk]).subarray(-88_200);
      });
      child.stderr.resume();
      await until(() => {
        if (spawnError) throw spawnError;
        if (child.exitCode !== null) throw new Error('The Shairport Sync fixture exited before listening.');
        return readFileSync('/proc/net/tcp', 'utf8').split('\n').some(line => {
          const fields = line.trim().split(/\s+/);
          return fields[3] === '0A' && fields[1]?.endsWith(`:${port.toString(16).toUpperCase().padStart(4, '0')}`);
        });
      }, 'software receiver listener');
      return child;
    };
    let receiver = await startReceiver();
    let discovered: AirPlayDevice | undefined;
    const url = (frequency: number) => `http://fixture:stream-secret@127.0.0.1:${(server.address() as AddressInfo).port}/${frequency}`;
    await check({
      url, bytes: () => bytes, peak: () => peak, metadata: () => metadata,
      verifyDiscovery: async () => {
        // A listening RTSP socket precedes Avahi's initial name-probing cycle.
        const deadline = Date.now() + 6000;
        do {
          const devices = await discoverAirPlayDevices({platform: 'linux'});
          const receiver = devices.find(device => device.name === `RadioCLI native ${process.pid} ${port}`);
          if (receiver) { expect(receiver).toMatchObject({port, local: true, requiresPassword: password, airplay2: false}); discovered = receiver; return; }
          await new Promise(resolve => setTimeout(resolve, 50));
        } while (Date.now() < deadline);
        throw new Error('The software receiver did not appear in Avahi discovery.');
      },
      energy: () => pcm.length ? Math.sqrt(samples(pcm).reduce((sum, value) => sum + value * value, 0) / (pcm.length / 4)) : 0,
      frequency: () => {
        const values = samples(pcm); let crossings = 0;
        for (let index = 1; index < values.length; index += 1) if (values[index - 1]! <= 0 && values[index]! > 0) crossings += 1;
        return crossings * 44_100 / Math.max(1, values.length);
      },
      restartReceiver: async () => { await terminate(receiver); receiver = await startReceiver(); },
      startWorker: muted => {
        const payload = encodeWorkerStart({streamUrl: url(440), stationName: 'Native station', ffmpegPath: '/usr/bin/ffmpeg', muted, volume: 40,
          device: discovered ?? {id: 'software', name: 'Software receiver', host: '127.0.0.1', port, txt: ['cn=0,1', 'et=0,1', 'md=0,1,2', 'am=Shairport', `pw=${password}`], requiresPassword: password, airplay2: false}});
        const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./airplay-worker.ts', import.meta.url)), payload], {stdio: 'pipe'});
        children.push(child);
        const closed = once(child, 'close') as Promise<[number | null, NodeJS.Signals | null]>;
        void closed.catch(() => undefined);
        const events: AirPlayWorkerEvent[] = []; let pending = ''; let stderr = '';
        child.stdout.on('data', chunk => {
          pending += String(chunk);
          let newline: number;
          while ((newline = pending.indexOf('\n')) >= 0) {
            const event = parseWorkerMessage<AirPlayWorkerEvent>(pending.slice(0, newline)); pending = pending.slice(newline + 1);
            if (event) events.push(event);
          }
        });
        child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-16 * 1024); });
        return {child, closed, events, send: command => { child.stdin.write(serializeWorkerMessage(command)); }, stderr: () => stderr,
          decoderPids: () => readFileSync(`/proc/${child.pid}/task/${child.pid}/children`, 'utf8').trim().split(/\s+/).filter(Boolean).map(Number)};
      }
    });
  } finally {
    for (const child of children.reverse()) await terminate(child);
    for (const timer of timers) clearInterval(timer);
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    metadataSocket.close();
    rmSync(directory, {recursive: true, force: true});
  }
}

async function terminate(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, 'close'); child.kill('SIGTERM');
  const force = setTimeout(() => child.kill('SIGKILL'), 2000);
  try { await closed; } finally { clearTimeout(force); }
}
function alive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch { return false; } }
async function waitClosed(session: Session): Promise<[number | null, NodeJS.Signals | null]> {
  let timer: NodeJS.Timeout | undefined;
  try { return await Promise.race([session.closed, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('AirPlay worker did not exit.')), 5000); })]); }
  finally { clearTimeout(timer); }
}
async function until(check: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 30)); }
  throw new Error(`Timed out waiting for ${label}.`);
}
function samples(pcm: Buffer): number[] { const result: number[] = []; for (let index = 0; index + 3 < pcm.length; index += 4) result.push(pcm.readInt16LE(index)); return result; }
function wave(frequency: number): {header: Buffer; samples: Buffer} {
  const data = Buffer.alloc(4410 * 4);
  for (let index = 0; index < 4410; index += 1) { const value = Math.round(Math.sin(index * 2 * Math.PI * frequency / 44_100) * 5000); data.writeInt16LE(value, index * 4); data.writeInt16LE(value, index * 4 + 2); }
  const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(0xfffffff7, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(44_100, 24); header.writeUInt32LE(176_400, 28);
  header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(0xffffffd3, 40);
  return {header, samples: data};
}
