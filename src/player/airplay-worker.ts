import {spawn, type ChildProcessByStdio} from 'node:child_process';
import {createRequire} from 'node:module';
import type {Readable} from 'node:stream';
import {airPlaySenderHealth} from './airplay-sender-health.js';
import {installAirPlaySenderPatch} from './airplay-sender-patch.js';
import {airPlaySenderRoot} from './airplay-sender-package.js';
import {canRetryPlainHttp, ffmpegCertificateFailure, ffmpegInputArguments, ffmpegInputFailure} from './ffmpeg-input.js';
import {parseWorkerMessage, decodeWorkerStart, maxWorkerMessageBytes, serializeWorkerMessage, type AirPlayWorkerCommand, type AirPlayWorkerEvent} from './airplay-worker-protocol.js';

const require = createRequire(import.meta.url);

// The optional sender logs raw authentication exchanges, including receiver codes.
// Only our bounded protocol events may leave this isolated process.
console.log = console.info = console.debug = console.warn = console.error = () => undefined;

type AirTunesClient = {
  add: (host: string, options: Record<string, unknown>) => {key: string; setPasscode?: (code: string) => void};
  write: (chunk: Buffer) => boolean;
  reset: () => void;
  stopAll: (callback?: () => void) => void;
  setVolume: (key: string, volume: number, callback?: () => void) => void;
  setTrackInfo: (key: string, name: string, artist: string, album: string) => void;
  on: (event: 'device' | 'buffer' | 'error' | 'drain', listener: (...args: unknown[]) => void) => void;
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
const decoders = new Set<ChildProcessByStdio<null, Readable, Readable>>();
let muted = start.muted;
let volume = start.volume;
let stationName = start.stationName;
let retuning = false;
let stopping = false;
let finishStop: (() => void) | undefined;

airtunes.on('device', (key, status) => {
  if (stopping) return;
  if (typeof key === 'string') {
    deviceKey = key;
  }

  if (status === 'ready') {
    publishStation();
    emit({type: 'ready'});
  } else if (status === 'playing' || status === 'pair_success') {
    emit({type: 'playing'});
  } else if (status === 'need_password') {
    emit({type: 'password-required'});
  } else if (status === 'stopped') {
    fail('AirPlay receiver disconnected. Select the receiver again to reconnect.');
  } else if (status === 'pair_failed') {
    fail('AirPlay receiver rejected the code or pairing request.');
  } else if (status === 'error') {
    fail('AirPlay receiver reported an error.');
  }
});

airtunes.on('buffer', status => {
  if (stopping) return;
  const statusText = String(status);
  emit({type: 'buffer', status: statusText});
  if (retuning && statusText === 'playing') {
    retuning = false;
    emit({type: 'retuned'});
  }
});

airtunes.on('error', () => fail('AirPlay sender failed. Select the receiver again to reconnect.'));
airtunes.on('drain', () => { if (!stopping) ffmpeg?.stdout.resume(); });

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
process.once('SIGHUP', () => stop(0));
process.stdin.once('end', () => stop(0));
process.once('uncaughtException', () => fail('AirPlay sender failed.'));
process.once('unhandledRejection', () => fail('AirPlay sender failed.'));

function handleCommand(command: AirPlayWorkerCommand): void {
  if (stopping) return;
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
    stationName = command.stationName;
    airtunes.reset();
    startFfmpeg(command.streamUrl);
    publishStation();
  } else if (command.type === 'passcode') {
    device.setPasscode?.(command.code);
  }
}

function startFfmpeg(streamUrl: string, plainHttp = false): void {
  if (stopping) return;
  const previous = ffmpeg;
  const child = spawn(start.ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    // Reconnect only network inputs, retaining the receiver session across
    // transient source drops without breaking local file playback.
    ...ffmpegInputArguments(streamUrl, {plainHttp, reconnect: true}),
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
  decoders.add(child);
  child.once('close', () => { decoders.delete(child); finishStop?.(); });

  if (previous) stopDecoder(previous);

  let pcmStarted = false;
  let diagnostic = '';
  child.stdout.on('data', chunk => {
    if (ffmpeg === child && !stopping) {
      pcmStarted ||= (chunk as Buffer).length > 0;
      if (!airtunes.write(chunk as Buffer)) child.stdout.pause();
    }
  });
  // Inspect only a bounded tail; never forward stream URLs or credentials.
  child.stderr.on('data', chunk => {
    diagnostic = (diagnostic + String(chunk)).slice(-8192);
    const failure = ffmpegInputFailure(diagnostic) ?? ffmpegCertificateFailure(diagnostic);
    if (failure && ffmpeg === child && !stopping) fail(failure);
  });
  child.stderr.resume();
  child.once('error', () => {
    if (ffmpeg !== child || stopping) {
      return;
    }

    fail('FFmpeg could not start for AirPlay playback. Run radiocli doctor.');
  });
  child.once('close', (code, signal) => {
    if (ffmpeg !== child || stopping) {
      return;
    }

    if (!plainHttp && !signal && !pcmStarted && canRetryPlainHttp(streamUrl, diagnostic)) {
      startFfmpeg(streamUrl, true);
      return;
    }
    ffmpeg = null;
    if (code !== 0) {
      emit({type: 'error', message: ffmpegInputFailure(diagnostic) ?? `ffmpeg exited with code ${code}`});
    }

    stop(code ?? 0);
  });
}

function setAirPlayVolume(nextVolume: number): void {
  if (deviceKey) {
    airtunes.setVolume(deviceKey, nextVolume);
  }
}

function publishStation(): void {
  if (deviceKey) airtunes.setTrackInfo(deviceKey, stationName, 'RadioCLI', 'Live radio');
}

function fail(message: string): void {
  if (stopping) return;
  emit({type: 'error', message});
  stop(1);
}

function stopDecoder(child: ChildProcessByStdio<null, Readable, Readable>): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const force = setTimeout(() => child.kill('SIGKILL'), 500);
  force.unref();
  child.once('close', () => clearTimeout(force));
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
    return require(airPlaySenderRoot) as new () => AirTunesClient;
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
  process.exitCode = code;
  for (const child of decoders) stopDecoder(child);
  ffmpeg = null;

  let senderStopped = false;
  const watchdog = setTimeout(() => {
    for (const child of decoders) child.kill('SIGKILL');
    process.exit(code);
  }, 1500);
  finishStop = () => {
    if (!senderStopped || decoders.size) return;
    clearTimeout(watchdog);
    emit({type: 'stopped'});
    process.exit(code);
  };
  try { airtunes.stopAll(() => { senderStopped = true; finishStop?.(); }); }
  catch { senderStopped = true; finishStop(); }
}

function clampVolume(nextVolume: number): number {
  return Math.min(100, Math.max(0, Math.round(nextVolume)));
}
