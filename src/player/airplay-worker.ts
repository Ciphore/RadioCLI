import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {airPlaySenderHealth} from './airplay-sender-health.js';
import {parseWorkerMessage, decodeWorkerStart, maxWorkerMessageBytes, serializeWorkerMessage, type AirPlayWorkerCommand, type AirPlayWorkerEvent} from './airplay-worker-protocol.js';

const require = createRequire(import.meta.url);

// node-airtunes2 writes diagnostics with console.log; keep stdout reserved for JSON events.
console.log = (...args: unknown[]) => {
  process.stderr.write(`${args.map(String).join(' ')}\n`);
};

type AirTunesClient = {
  add: (host: string, options: Record<string, unknown>) => {key: string; setPasscode?: (code: string) => void};
  write: (chunk: Buffer) => void;
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
let muted = start.muted;
let volume = start.volume;
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
  emit({type: 'buffer', status: String(status)});
  if (status === 'playing') {
    emit({type: 'playing'});
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

const ffmpeg = spawn('ffmpeg', [
  '-hide_banner',
  '-loglevel',
  'error',
  '-i',
  start.streamUrl,
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

ffmpeg.stdout.on('data', chunk => {
  airtunes.write(chunk as Buffer);
});
ffmpeg.stderr.on('data', chunk => {
  process.stderr.write(chunk);
});
ffmpeg.once('error', error => {
  emit({type: 'error', message: error.message});
  stop(1);
});
ffmpeg.once('exit', code => {
  if (!stopping) {
    if (code !== 0) {
      emit({type: 'error', message: `ffmpeg exited with code ${code}`});
    }

    stop(code ?? 0);
  }
});

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
  } else if (command.type === 'passcode') {
    device.setPasscode?.(command.code);
  }
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

  try {
    return require('node-airtunes2') as new () => AirTunesClient;
  } catch {
    emit({type: 'error', message: 'AirPlay sender package could not be loaded after passing the safety gate.'});
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
  if (!ffmpeg.killed) {
    ffmpeg.kill('SIGTERM');
  }

  airtunes.stopAll(() => {
    emit({type: 'stopped'});
    process.exit(code);
  });
}

function clampVolume(nextVolume: number): number {
  return Math.min(100, Math.max(0, Math.round(nextVolume)));
}
