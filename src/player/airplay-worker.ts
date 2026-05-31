import {spawn, type ChildProcessByStdio} from 'node:child_process';
import {createRequire} from 'node:module';
import type {Readable} from 'node:stream';
import {airPlaySenderHealth} from './airplay-sender-health.js';
import {installAirPlaySenderPatch} from './airplay-sender-patch.js';
import {parseWorkerMessage, decodeWorkerStart, maxWorkerMessageBytes, serializeWorkerMessage, type AirPlayWorkerCommand, type AirPlayWorkerEvent} from './airplay-worker-protocol.js';

const require = createRequire(import.meta.url);

// node-airtunes2 writes diagnostics with console.log; keep stdout reserved for JSON events.
console.log = (...args: unknown[]) => {
  process.stderr.write(`${args.map(String).join(' ')}\n`);
};

type AirTunesClient = {
  add: (host: string, options: Record<string, unknown>) => {key: string; setPasscode?: (code: string) => void};
  write: (chunk: Buffer) => void;
  reset: () => void;
  stopAll: (callback?: () => void) => void;
  setVolume: (key: string, volume: number, callback?: () => void) => void;
  on: (event: 'device' | 'buffer' | 'error', listener: (...args: unknown[]) => void) => void;
};

const encodedStart = process.argv[2];

if (!encodedStart) {
  emit({type: 'error', message: 'Missing AirPlay worker start payload.'});
  process.exit(1);
}

const AirTunes = loadAirTunesSender();
const start = decodeStartPayload(encodedStart);
const airtunes = new AirTunes();
let deviceKey = '';
let ffmpeg: ChildProcessByStdio<null, Readable, Readable> | null = null;
let muted = start.muted;
let volume = start.volume;
let retuning = false;
let stopping = false;

airtunes.on('device', (key, status) => {
  if (typeof key === 'string') {
    deviceKey = key;
  }

  if (status === 'ready') {
    emit({type: 'ready'});
  } else if (status === 'playing' || status === 'pair_success') {
    emit({type: 'playing'});
  } else if (status === 'need_password') {
    emit({type: 'password-required'});
  } else if (status === 'stopped') {
    emit({type: 'stopped'});
  } else if (status === 'error') {
    emit({type: 'error', message: 'AirPlay receiver reported an error.'});
  }
});

airtunes.on('buffer', status => {
  const statusText = String(status);
  emit({type: 'buffer', status: statusText});
  if (retuning && statusText === 'playing') {
    retuning = false;
    emit({type: 'retuned'});
  }
});

airtunes.on('error', error => {
  emit({type: 'error', message: error instanceof Error ? error.message : String(error)});
});

const device = airtunes.add(start.device.host, {
  port: start.device.port,
  volume: muted ? 0 : volume,
  txt: start.device.txt,
  airplay2: start.device.airplay2,
  forceAlac: true,
  debug: false,
  mode: start.device.airplay2 ? 2 : 0
});
deviceKey = device.key;

startFfmpeg(start.streamUrl);

let stdinBuffer = '';
process.stdin.on('data', chunk => {
  stdinBuffer += chunk.toString('utf8');
  if (Buffer.byteLength(stdinBuffer, 'utf8') > maxWorkerMessageBytes) {
    emit({type: 'error', message: 'AirPlay worker command exceeded the size limit.'});
    stdinBuffer = '';
    return;
  }

  let newlineIndex = stdinBuffer.indexOf('\n');
  while (newlineIndex !== -1) {
    const line = stdinBuffer.slice(0, newlineIndex);
    stdinBuffer = stdinBuffer.slice(newlineIndex + 1);
    newlineIndex = stdinBuffer.indexOf('\n');
    const command = parseWorkerMessage<AirPlayWorkerCommand>(line);
    if (command) {
      handleCommand(command);
    }
  }
});

process.once('SIGTERM', () => stop(0));
process.once('SIGINT', () => stop(0));

function handleCommand(command: AirPlayWorkerCommand): void {
  if (command.type === 'stop') {
    stop(0);
  } else if (command.type === 'setVolume') {
    volume = clampVolume(command.volume);
    setAirPlayVolume(muted ? 0 : volume);
  } else if (command.type === 'setMuted') {
    muted = command.muted;
    setAirPlayVolume(muted ? 0 : volume);
  } else if (command.type === 'retune') {
    retuning = true;
    airtunes.reset();
    startFfmpeg(command.streamUrl);
  } else if (command.type === 'passcode') {
    device.setPasscode?.(command.code);
  }
}

function startFfmpeg(streamUrl: string): void {
  const previous = ffmpeg;
  const child = spawn('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    // Recover from transient source drops without tearing down the AirPlay session.
    // These are input options and must precede -i. -reconnect_streamed is essential for
    // non-seekable radio; with no retry cap ffmpeg keeps trying until the station returns.
    '-reconnect',
    '1',
    '-reconnect_on_network_error',
    '1',
    '-reconnect_streamed',
    '1',
    '-reconnect_delay_max',
    '2',
    '-i',
    streamUrl,
    '-f',
    's16le',
    '-ac',
    '2',
    '-ar',
    '44100',
    'pipe:1'
  ], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  ffmpeg = child;

  if (previous && !previous.killed) {
    previous.kill('SIGTERM');
  }

  child.stdout.on('data', chunk => {
    if (ffmpeg === child && !stopping) {
      airtunes.write(chunk as Buffer);
    }
  });
  child.stderr.on('data', chunk => {
    if (ffmpeg === child) {
      process.stderr.write(chunk);
    }
  });
  child.once('error', error => {
    if (ffmpeg !== child || stopping) {
      return;
    }

    emit({type: 'error', message: error.message});
    stop(1);
  });
  child.once('exit', code => {
    if (ffmpeg !== child || stopping) {
      return;
    }

    ffmpeg = null;
    if (code !== 0) {
      emit({type: 'error', message: `ffmpeg exited with code ${code}`});
    }

    stop(code ?? 0);
  });
}

function setAirPlayVolume(nextVolume: number): void {
  if (deviceKey) {
    airtunes.setVolume(deviceKey, nextVolume);
  }
}

function emit(event: AirPlayWorkerEvent): void {
  process.stdout.write(serializeWorkerMessage(event));
}

function loadAirTunesSender(): new () => AirTunesClient {
  const health = airPlaySenderHealth();
  if (!health.safe) {
    emit({type: 'error', message: health.message});
    process.exit(1);
  }

  installAirPlaySenderPatch();
  try {
    return require('node-airtunes2') as new () => AirTunesClient;
  } catch {
    emit({type: 'error', message: 'AirPlay sender bridge could not be loaded.'});
    process.exit(1);
  }
}

function decodeStartPayload(encoded: string) {
  try {
    return decodeWorkerStart(encoded);
  } catch (error) {
    emit({type: 'error', message: error instanceof Error ? error.message : 'Invalid AirPlay worker start payload.'});
    process.exit(1);
  }
}

function stop(code: number): void {
  if (stopping) {
    return;
  }

  stopping = true;
  if (ffmpeg && !ffmpeg.killed) {
    ffmpeg.kill('SIGTERM');
  }
  ffmpeg = null;

  airtunes.stopAll(() => {
    emit({type: 'stopped'});
    process.exit(code);
  });
}

function clampVolume(nextVolume: number): number {
  return Math.min(100, Math.max(0, Math.round(nextVolume)));
}
