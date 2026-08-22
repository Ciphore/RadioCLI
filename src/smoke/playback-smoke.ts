import {setTimeout as delay} from 'node:timers/promises';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PlayerController} from '../player/player-controller.js';
import {JsonLibraryStore} from '../storage/store.js';
import type {Station} from '../types.js';

const originalRadioCliHome = process.env.RADIOCLI_HOME;
const originalMpvAudioOutput = process.env.RADIOCLI_MPV_AUDIO_OUTPUT;
const smokeHome = mkdtempSync(join(tmpdir(), 'radiocli-playback-'));
process.env.RADIOCLI_HOME = smokeHome;
process.env.RADIOCLI_MPV_AUDIO_OUTPUT = 'null';

try {
  const store = new JsonLibraryStore();
  store.updateSettings({volume: 0});
  const player = new PlayerController(() => store.snapshot().settings);
  const backends = player.refreshDetectedBackends();

  if (backends.length === 0) {
    throw new Error('No playback backend found. Install mpv or ffplay.');
  }

  store.updateSettings({preferredBackend: backends.includes('mpv') ? 'mpv' : 'ffplay'});
  const fixture = join(smokeHome, 'silence.wav');
  writeFileSync(fixture, silentWav(5));
  const station: Station = {
    id: 'playback-smoke',
    provider: 'playlist',
    name: 'RadioCLI playback smoke',
    tags: ['smoke'],
    streamUrl: fixture
  };
  console.log(`backend=${backends.join(',')}`);
  console.log(`station=${station.name}`);
  console.log('source=local-wav');

  try {
    await player.play(station, fixture);
    await delay(1200);
  } finally {
    await player.stop();
  }
  console.log('playback_smoke=ok');
} finally {
  if (originalRadioCliHome === undefined) {
    delete process.env.RADIOCLI_HOME;
  } else {
    process.env.RADIOCLI_HOME = originalRadioCliHome;
  }
  if (originalMpvAudioOutput === undefined) {
    delete process.env.RADIOCLI_MPV_AUDIO_OUTPUT;
  } else {
    process.env.RADIOCLI_MPV_AUDIO_OUTPUT = originalMpvAudioOutput;
  }

  rmSync(smokeHome, {force: true, recursive: true});
}

function silentWav(seconds: number): Buffer {
  const sampleRate = 44_100;
  const channels = 2;
  const bitsPerSample = 16;
  const dataBytes = seconds * sampleRate * channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
}
