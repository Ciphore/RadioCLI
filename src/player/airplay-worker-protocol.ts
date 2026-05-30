import type {AirPlayDevice} from '../types.js';

export type AirPlayWorkerStart = {
  streamUrl: string;
  stationName: string;
  volume: number;
  muted: boolean;
  device: AirPlayDevice;
};

export type AirPlayWorkerCommand =
  | {type: 'stop'}
  | {type: 'setVolume'; volume: number}
  | {type: 'setMuted'; muted: boolean}
  | {type: 'passcode'; code: string};

export type AirPlayWorkerEvent =
  | {type: 'ready'}
  | {type: 'playing'}
  | {type: 'buffer'; status: string}
  | {type: 'password-required'}
  | {type: 'stopped'}
  | {type: 'error'; message: string};

export function encodeWorkerStart(start: AirPlayWorkerStart): string {
  return Buffer.from(JSON.stringify(start), 'utf8').toString('base64url');
}

export function decodeWorkerStart(encoded: string): AirPlayWorkerStart {
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AirPlayWorkerStart;
}

export function serializeWorkerMessage(message: AirPlayWorkerCommand | AirPlayWorkerEvent): string {
  return `${JSON.stringify(message)}\n`;
}

export function parseWorkerMessage<T extends AirPlayWorkerCommand | AirPlayWorkerEvent>(line: string): T | null {
  if (!line.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(line) as T;
    return parsed && typeof parsed === 'object' && 'type' in parsed ? parsed : null;
  } catch {
    return null;
  }
}
