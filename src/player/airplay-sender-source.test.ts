import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import type {EventEmitter} from 'node:events';
import {describe, expect, it, vi} from 'vitest';
import {patchAirTunesDeviceSource, patchAirTunesRtspSource} from './airplay-sender-patch.js';
import {airPlaySenderRoot} from './airplay-sender-package.js';
import {airPlaySenderHealth} from './airplay-sender-health.js';

const require = createRequire(import.meta.url);
const rtspSourcePath = optionalAirTunesRtspPath();

// The runtime compatibility patch locates its insertion points by exact string match against
// node-airtunes2's own source. If a dependency bump drifts that source, the patches silently
// no-op and the AirPlay 2 buffering/auth/empty-setup fixes regress with no other signal. The
// dependency is pinned to an exact version; this guard fails loudly if that source ever changes.
const requiredMarkers = [
  '    headers = response.headers',
  '  if (this.status != OPTIONS && this.status != OPTIONS2 && this.mode == 0) {',
  "      this.eventPort = sa1_bplist[0]['eventPort']",
  'I assume that all responses have empty bodies.',
  'Client.prototype.setPasscode = async function (passcode)',
  'Client.prototype.setVolume = function (volume, callback)',
  'Client.prototype.setTrackInfo = function (name, artist, album, callback)',
  'Client.prototype.parseObject'
];

const describeIfSenderInstalled = rtspSourcePath ? describe : describe.skip;

describeIfSenderInstalled('AirPlay sender source compatibility', () => {
  it('retains the verified upstream protocol and native source unchanged', () => {
    const provenance = JSON.parse(readFileSync(`${airPlaySenderRoot}/UPSTREAM.json`, 'utf8')) as {unmodifiedFiles: Record<string, string>};
    for (const [file, digest] of Object.entries(provenance.unmodifiedFiles)) {
      expect(createHash('sha256').update(readFileSync(`${airPlaySenderRoot}/${file}`)).digest('hex'), file).toBe(digest);
    }
  });

  it('still contains every marker the runtime patch depends on', () => {
    const source = readAirTunesRtspSource();
    for (const marker of requiredMarkers) {
      expect(source.includes(marker), `node-airtunes2 source drifted; missing marker: ${marker}`).toBe(true);
    }
  });

  it('fully patches the installed source (all fixes applied, no silent no-op)', () => {
    const source = readAirTunesRtspSource();
    const patched = patchAirTunesRtspSource(source);
    expect(patched).toContain('this.status === SETUP_AP2_1 && response.code === 401');
    expect(patched).toContain('headers = response.headers || {}');
    expect(patched).toContain('Buffer.concat([blob, Buffer.from(data)])');
    expect(patched).toContain("this.eventPort = sa1_bplist[0]['eventPort'] || this.eventPort || this.socket.remotePort || 7000");
    expect(patched).not.toContain('I assume that all responses have empty bodies.');
    expect(patched).toContain('// RadioCLI legacy Digest');
    expect(patched).toContain('this.radioCliPendingVolume');
    expect(patched).toContain('this.radioCliPendingTrack');
    expect(patched).toContain('contentLength > 1024 * 1024');
    expect(patchAirTunesRtspSource(patched)).toBe(patched);
  });

  it('preserves a zero initial volume in both device construction paths', () => {
    const source = readFileSync(require.resolve(`${airPlaySenderRoot}/lib/device_airtunes.js`), 'utf8');
    expect(source).toContain('options.volume || 50');
    expect(source).toContain('this.options.volume || 30');
    const patched = patchAirTunesDeviceSource(source);
    expect(patched).toContain('options.volume ?? 50');
    expect(patched).toContain('this.options.volume ?? 30');
    expect(patchAirTunesDeviceSource(patched)).toBe(patched);
  });

  it('prompts for a legacy receiver password and authenticates each RTSP method', async () => {
    const client = patchedClient();
    const prompt = vi.fn(); client.on('need_password', prompt);
    const send = vi.fn(); client.sendNextRequest = send;
    client.status = 0; // OPTIONS in the pinned sender.
    respond(client, 401, 'WWW-Authenticate: Digest realm="receiver", nonce="challenge"\r\n');
    expect(prompt).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
    await client.setPasscode('test-secret');
    expect(client.status).toBe(0);
    expect(send).toHaveBeenCalledOnce();
    respond(client, 200);
    expect(client.status).toBe(1); // ANNOUNCE, not PIN pairing.
    const digest = (text: string) => createHash('md5').update(text).digest('hex');
    for (const [method, uri] of [['OPTIONS', '*'], ['ANNOUNCE', 'rtsp://127.0.0.1/1']]) {
      const expected = digest(`${digest('iTunes:receiver:test-secret')}:challenge:${digest(`${method}:${uri}`)}`);
      const head = client.makeHead(method!, uri!);
      expect(head).toContain(`response="${expected}"`);
      expect(head).not.toContain('test-secret');
    }
  });

  it('fails a rejected legacy password without retrying forever', async () => {
    const client = patchedClient();
    client.status = 0;
    client.sendNextRequest = vi.fn();
    const failure = vi.fn(); client.on('pair_failed', failure);
    const cleanup = vi.fn(); client.cleanup = cleanup;
    respond(client, 401, 'WWW-Authenticate: Digest realm="receiver", nonce="challenge"\r\n');
    await client.setPasscode('wrong-secret');
    respond(client, 401, 'WWW-Authenticate: Digest realm="receiver", nonce="challenge"\r\n');
    expect(failure).toHaveBeenCalledOnce();
    expect(cleanup).toHaveBeenCalledWith('bad_password');
    expect(client.sendNextRequest).toHaveBeenCalledOnce();
  });

  it('keeps AirPlay 2 code entry on its original pairing path', async () => {
    const client = patchedClient(true);
    client.sendNextRequest = vi.fn();
    await client.setPasscode('1234');
    expect(client.status).toBe(18); // PAIR_SETUP_1.
    expect(client.sendNextRequest).toHaveBeenCalledOnce();
  });

  it('preserves legacy Apple TV PIN pairing when no Digest challenge is pending', async () => {
    const client = patchedClient();
    client.status = 15; // PAIR_PIN_SETUP_1, distinct from a RAOP password prompt.
    client.sendNextRequest = vi.fn();
    await client.setPasscode('1234');
    expect(client.status).toBe(15);
    expect(client.sendNextRequest).toHaveBeenCalledOnce();
  });

  it('delivers the latest volume and station metadata after an in-flight request', () => {
    const client = patchedClient();
    client.sendNextRequest = vi.fn();
    client.status = 4; // SETVOLUME is awaiting a response.
    client.setVolume(0);
    client.setVolume(25);
    client.setTrackInfo('New station', 'RadioCLI', 'Live radio');
    respond(client, 200); // Initial progress setup.
    respond(client, 200); // PLAYING drains the queued volume.
    expect(client.volume).toBe(25);
    expect(client.status).toBe(4);
    respond(client, 200); // Then drains station metadata.
    expect(client.trackInfo).toEqual({name: 'New station', artist: 'RadioCLI', album: 'Live radio'});
    expect(client.status).toBe(8); // SETDAAP.
    respond(client, 200);
    expect(client.status).toBe(5); // PLAYING.
  });
});

type RtspClient = EventEmitter & {
  status: number;
  volume: number;
  trackInfo: unknown;
  processData: (headers: string, raw: Buffer) => void;
  sendNextRequest: (digest?: unknown) => void;
  cleanup: (reason: string) => void;
  setPasscode: (code: string) => Promise<void>;
  setVolume: (value: number) => void;
  setTrackInfo: (name: string, artist: string, album: string) => void;
  makeHead: (method: string, uri: string) => string;
};

function patchedClient(airplay2 = false): RtspClient {
  const exports: {Client?: new (...args: unknown[]) => RtspClient} = {};
  runInNewContext(patchAirTunesRtspSource(readAirTunesRtspSource()), {
    exports, require: createRequire(rtspSourcePath!), Buffer,
    console: {log: () => undefined}, setTimeout, clearTimeout, setInterval, clearInterval
  }, {filename: rtspSourcePath!, timeout: 2000});
  return new exports.Client!(70, null, {lastSeq: 1}, {mode: airplay2 ? 2 : 0, airplay2, debug: false});
}

function respond(client: RtspClient, code: number, headers = ''): void {
  const text = `RTSP/1.0 ${code} ${code === 200 ? 'OK' : 'Unauthorized'}\r\nCSeq: 1\r\n${headers}\r\n`;
  client.processData(text, Buffer.from(text));
}

function optionalAirTunesRtspPath(): string | null {
  try {
    return airPlaySenderHealth().available ? require.resolve(`${airPlaySenderRoot}/lib/rtsp.js`) : null;
  } catch {
    return null;
  }
}

function readAirTunesRtspSource(): string {
  if (!rtspSourcePath) {
    throw new Error('node-airtunes2 is not installed.');
  }

  return readFileSync(rtspSourcePath, 'utf8');
}
