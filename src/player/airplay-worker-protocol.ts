import type {AirPlayDevice} from '../types.js';

const maxWorkerStartBytes = 16_384;
export const maxWorkerMessageBytes = 8192;
const maxWorkerTextBytes = 512;
const maxPasscodeBytes = 64;

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
  const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
  if (Buffer.byteLength(decoded, 'utf8') > maxWorkerStartBytes) {
    throw new Error('AirPlay worker start payload is too large.');
  }

  return validateWorkerStart(JSON.parse(decoded));
}

export function serializeWorkerMessage(message: AirPlayWorkerCommand | AirPlayWorkerEvent): string {
  return `${JSON.stringify(message)}\n`;
}

export function parseWorkerMessage<T extends AirPlayWorkerCommand | AirPlayWorkerEvent>(line: string): T | null {
  if (!line.trim()) {
    return null;
  }

  if (Buffer.byteLength(line, 'utf8') > maxWorkerMessageBytes) {
    return null;
  }

  try {
    return validateWorkerMessage(JSON.parse(line)) as T | null;
  } catch {
    return null;
  }
}

function validateWorkerStart(value: unknown): AirPlayWorkerStart {
  if (!isRecord(value) || !isRecord(value.device)) {
    throw new Error('Invalid AirPlay worker start payload.');
  }

  const streamUrl = boundedString(value.streamUrl, 'streamUrl', 4096);
  const parsedUrl = new URL(streamUrl);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('AirPlay streams must use http or https URLs.');
  }

  const device = value.device;
  const port = Number(device.port);
  const txt = Array.isArray(device.txt)
    ? device.txt.slice(0, 64).map(item => boundedString(item, 'txt', 512)).filter(Boolean)
    : [];

  return {
    streamUrl,
    stationName: boundedText(value.stationName, 'stationName', maxWorkerTextBytes),
    volume: clampVolume(Number(value.volume)),
    muted: typeof value.muted === 'boolean' ? value.muted : false,
    device: {
      id: boundedText(device.id, 'device.id', 256),
      name: boundedText(device.name, 'device.name', 256),
      host: safeHost(device.host),
      port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : invalid('device.port'),
      txt,
      requiresPassword: Boolean(device.requiresPassword),
      airplay2: Boolean(device.airplay2)
    }
  };
}

function validateWorkerMessage(value: unknown): AirPlayWorkerCommand | AirPlayWorkerEvent | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null;
  }

  if (value.type === 'stop') {
    return {type: 'stop'};
  }

  if (value.type === 'setVolume') {
    return Number.isFinite(Number(value.volume)) ? {type: 'setVolume', volume: clampVolume(Number(value.volume))} : null;
  }

  if (value.type === 'setMuted') {
    return typeof value.muted === 'boolean' ? {type: 'setMuted', muted: value.muted} : null;
  }

  if (value.type === 'passcode') {
    if (typeof value.code !== 'string' || Buffer.byteLength(value.code, 'utf8') > maxPasscodeBytes) {
      return null;
    }

    const code = cleanText(value.code, maxPasscodeBytes);
    return code ? {type: 'passcode', code} : null;
  }

  if (value.type === 'ready' || value.type === 'playing' || value.type === 'password-required' || value.type === 'stopped') {
    return {type: value.type};
  }

  if (value.type === 'buffer') {
    return {type: 'buffer', status: cleanText(value.status, 120) || 'unknown'};
  }

  if (value.type === 'error') {
    return {type: 'error', message: cleanText(value.message, maxWorkerTextBytes) || 'AirPlay worker error.'};
  }

  return null;
}

function boundedString(value: unknown, field: string, maxBytes: number): string {
  if (typeof value !== 'string' || !value.trim()) {
    return invalid(field);
  }

  const cleaned = cleanText(value, maxBytes);
  return cleaned || invalid(field);
}

function boundedText(value: unknown, field: string, maxBytes: number): string {
  return boundedString(value, field, maxBytes);
}

function cleanText(value: unknown, maxBytes: number): string {
  if (typeof value !== 'string') {
    return '';
  }

  const withoutControls = value.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim();
  let cleaned = withoutControls;
  while (Buffer.byteLength(cleaned, 'utf8') > maxBytes) {
    cleaned = cleaned.slice(0, -1);
  }

  return cleaned.trim();
}

function safeHost(value: unknown): string {
  const host = boundedString(value, 'device.host', 253).replace(/\.$/, '');
  if (/[\s/\\]/.test(host) || !/^[A-Za-z0-9._:%-]+$/.test(host)) {
    return invalid('device.host');
  }

  return host;
}

function clampVolume(volume: number): number {
  return Math.min(100, Math.max(0, Math.round(Number.isFinite(volume) ? volume : 70)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function invalid(field: string): never {
  throw new Error(`Invalid AirPlay worker ${field}.`);
}
