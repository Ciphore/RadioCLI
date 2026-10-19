import {isIP} from 'node:net';
import {lookup} from 'node:dns/promises';
import type {LookupAddress} from 'node:dns';
import {networkInterfaces} from 'node:os';
import type {AirPlayDevice} from '../types.js';
import {resolveCommandDetails} from '../platform/executables.js';
import {networkPolicy} from '../platform/network.js';
import {isAirPlayPlatformSupported} from './backend-install.js';
import {probeAirPlayReadiness} from './airplay-readiness.js';
import {runAirPlayCommand, type AirPlayCommandRunner} from './airplay-process.js';

export type AirPlayDiscoveryOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  release?: string;
  resolve?: (command: string) => string | undefined;
  hasCommand?: (command: string) => boolean;
  run?: AirPlayCommandRunner;
  readiness?: typeof probeAirPlayReadiness;
  timeoutMs?: number;
  maxDevices?: number;
  lookupConcurrency?: number;
  maxOutputBytes?: number;
};

const defaultTimeoutMs = 2500;
const defaultMaxDevices = 12;
const defaultLookupConcurrency = 4;
const defaultMaxOutputBytes = 64 * 1024;

export async function discoverAirPlayDevices({
  platform = process.platform,
  env = process.env,
  release,
  resolve = command => resolveCommandDetails(command, {platform, env}).path ?? undefined,
  hasCommand = command => Boolean(resolve(command)),
  run = runAirPlayCommand,
  readiness = probeAirPlayReadiness,
  timeoutMs = defaultTimeoutMs,
  maxDevices = defaultMaxDevices,
  lookupConcurrency = defaultLookupConcurrency,
  maxOutputBytes = defaultMaxOutputBytes
}: AirPlayDiscoveryOptions = {}): Promise<AirPlayDevice[]> {
  if (networkPolicy(env).offline || !isAirPlayPlatformSupported(platform, env, release)) {
    return [];
  }
  const tool = platform === 'linux' ? 'avahi-browse' : 'dns-sd';
  const executable = hasCommand(tool) ? resolve(tool) : undefined;
  if (!executable) {
    if (platform === 'linux') throw new Error('AirPlay discovery requires avahi-browse. Run radiocli doctor.');
    return [];
  }

  timeoutMs = Math.min(defaultTimeoutMs, Math.max(1, timeoutMs));
  maxOutputBytes = Math.min(defaultMaxOutputBytes, Math.max(1, maxOutputBytes));
  maxDevices = Math.min(defaultMaxDevices, Math.max(0, Math.floor(maxDevices)));
  if (platform === 'linux') {
    const deadline = Date.now() + timeoutMs;
    const health = await readiness({platform, env, release, resolve, hasCommand, run});
    if (!health.ready) throw new Error(health.message);
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('AirPlay readiness check timed out. Run radiocli doctor.');
    const result = await run(executable, ['--parsable', '--resolve', '--terminate', '--no-db-lookup', '_raop._tcp'], remaining, maxOutputBytes, {env});
    if (result.code !== 0 && !result.timedOut && !result.truncated) throw new Error('Avahi discovery failed. Check that the Avahi service is running with radiocli doctor.');
    return parseAvahiBrowseOutput(result.output, maxDevices);
  }

  const browseOutput = await run(executable, ['-B', '_raop._tcp', 'local'], timeoutMs, maxOutputBytes, {env}).then(result => result.output).catch(() => '');
  const instances = parseRaopBrowseOutput(browseOutput).slice(0, Math.max(0, maxDevices));
  const devices = await mapWithConcurrency(
    instances,
    Math.max(1, lookupConcurrency),
    async instance => {
      const lookupOutput = await run(executable, ['-L', instance, '_raop._tcp', 'local'], timeoutMs, maxOutputBytes, {env}).then(result => result.output).catch(() => '');
      const device = parseRaopLookupOutput(instance, lookupOutput);
      return device ? enrichAirPlayDeviceHost(device, timeoutMs) : null;
    }
  );

  return devices.filter((device): device is AirPlayDevice => Boolean(device));
}

async function enrichAirPlayDeviceHost(device: AirPlayDevice, timeoutMs: number): Promise<AirPlayDevice> {
  let timer: NodeJS.Timeout | undefined;
  const addresses = await Promise.race([
    lookup(device.host, {all: true, family: 4}).catch(() => []),
    new Promise<LookupAddress[]>(resolve => { timer = setTimeout(() => resolve([]), timeoutMs); })
  ]).finally(() => clearTimeout(timer));
  if (addresses.length === 0) {
    return device;
  }

  const localAddresses = localIpv4Addresses();
  const preferred = addresses.find(address => !isLoopbackAddress(address.address)) ?? addresses[0];
  if (!preferred) {
    return device;
  }

  return {
    ...device,
    host: preferred.address,
    local: addresses.some(address => localAddresses.has(address.address))
  };
}

function localIpv4Addresses(): Set<string> {
  const addresses = new Set(['127.0.0.1']);
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4') {
        addresses.add(entry.address);
      }
    }
  }

  return addresses;
}

function isLoopbackAddress(address: string): boolean {
  return address === '127.0.0.1' || address.startsWith('127.');
}

export function parseRaopBrowseOutput(output: string): string[] {
  const instances = new Set<string>();
  for (const line of output.split('\n')) {
    const match = /\s_raop\._tcp\.\s+(.+)$/.exec(line);
    const instance = sanitizeDnsSdText(unescapeDnsSdName(match?.[1]?.trim() ?? ''), 256);
    if (instance) {
      instances.add(instance);
    }
  }

  return [...instances];
}

/** avahi-browse -pr emits resolved IPv4 and IPv6 records separately. The
 * bundled sender uses udp4, so an IPv6-only record is deliberately not offered. */
export function parseAvahiBrowseOutput(output: string, maxDevices = defaultMaxDevices): AirPlayDevice[] {
  const devices = new Map<string, AirPlayDevice>();
  const local = localIpv4Addresses();
  for (const line of output.slice(0, defaultMaxOutputBytes).split('\n')) {
    const fields = avahiFields(line);
    if (fields.length !== 10 || fields[0] !== '=' || fields[2] !== 'IPv4' || fields[4] !== '_raop._tcp' || fields[5] !== 'local') continue;
    const host = fields[7]!;
    const port = Number(fields[8]);
    if (isIP(host) !== 4 || host === '0.0.0.0' || Number(host.split('.')[0]) >= 224 || !/^\d+$/.test(fields[8]!) || port < 1 || port > 65535) continue;
    const id = sanitizeDnsSdText(unescapeDnsSdName(fields[3]!), 256);
    if (!id) continue;
    const txt = avahiTxt(fields[9]!);
    if (!txt) continue;
    const values = txtRecordMap(txt);
    const sf = Number.parseInt((values.get('sf') ?? '0').replace(/^0x/i, ''), 16) || 0;
    const device: AirPlayDevice = {
      id, name: displayNameForRaopInstance(id), host, port, txt,
      local: local.has(host),
      requiresPassword: values.get('pw')?.toLowerCase() === 'true' || (sf !== 0 && sf !== 4),
      airplay2: Boolean(values.get('pk') || values.get('vv') === '2' || values.get('et')?.split(',').some(value => ['3', '4', '5'].includes(value)))
    };
    const prior = devices.get(id);
    if (!prior || (isLoopbackAddress(prior.host) && !isLoopbackAddress(host))) devices.set(id, device);
  }
  return [...devices.values()].slice(0, Math.min(defaultMaxDevices, Math.max(0, Math.floor(maxDevices))));
}

function avahiFields(line: string): string[] {
  const fields: string[] = [];
  let start = 0;
  for (let index = 0; index < line.length && fields.length < 9; index += 1) {
    if (line[index] === '\\') { index += 1; continue; }
    if (line[index] === ';') { fields.push(line.slice(start, index)); start = index + 1; }
  }
  fields.push(line.slice(start));
  return fields;
}

function avahiTxt(value: string): string[] | null {
  const entries: string[] = [];
  let index = 0;
  while (index < value.length) {
    while (/\s/.test(value[index] ?? '') && index < value.length) index += 1;
    if (index === value.length) break;
    if (value[index] !== '"' || entries.length === 64) return null;
    const start = ++index;
    while (index < value.length && value[index] !== '"') { if (value[index] === '\\') index += 1; index += 1; }
    if (index === value.length) return null;
    const entry = sanitizeDnsSdText(unescapeDnsSdName(value.slice(start, index)), 512);
    if (entry) entries.push(entry);
    index += 1;
    if (index < value.length && !/\s/.test(value[index]!)) return null;
  }
  return entries;
}

export function parseRaopLookupOutput(instance: string, output: string): AirPlayDevice | null {
  const reachable = output.match(/ can be reached at (.+?)\.?:(\d+) \(interface \d+\)/);
  if (!reachable?.[1] || !reachable[2]) {
    return null;
  }

  const id = sanitizeDnsSdText(instance, 256);
  const host = normalizeHost(reachable[1]);
  const port = Number(reachable[2]);
  if (!id || !host || !Number.isInteger(port) || port <= 0 || port > 65535) {
    return null;
  }

  const txtLine = output
    .split('\n')
    .map(line => line.trim())
    .find(line => /\b(?:cn|sf|pk|pw)=/.test(line));
  const txt = txtLine
    ? txtLine.split(/\s+/).map(entry => sanitizeDnsSdText(entry, 512)).filter(Boolean).slice(0, 64)
    : [];
  const txtMap = txtRecordMap(txt);
  const sf = txtMap.get('sf');
  const sfValue = sf ? Number.parseInt(sf.replace(/^0x/i, ''), 16) || 0 : 0;

  return {
    id,
    name: displayNameForRaopInstance(id),
    host,
    port,
    txt,
    requiresPassword: txtMap.get('pw')?.toLowerCase() === 'true' || (sfValue !== 0 && sfValue !== 0x4),
    airplay2: Boolean(txtMap.get('pk') || txtMap.get('vv') === '2' || txtMap.get('et')?.split(',').some(value => ['3', '4', '5'].includes(value)))
  };
}

function displayNameForRaopInstance(instance: string): string {
  const atIndex = instance.indexOf('@');
  return sanitizeDnsSdText(atIndex === -1 ? instance : instance.slice(atIndex + 1), 256) || 'AirPlay receiver';
}

function txtRecordMap(txt: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of txt) {
    const equals = entry.indexOf('=');
    if (equals === -1) {
      continue;
    }

    map.set(entry.slice(0, equals), entry.slice(equals + 1));
  }

  return map;
}

function unescapeDnsSdName(value: string): string {
  const bytes: number[] = [];
  for (let index = 0; index < value.length;) {
    const match = /^\\(\d{3})/.exec(value.slice(index));
    if (match) {
      const byte = Number(match[1]);
      if (byte > 255) return '';
      bytes.push(byte);
      index += 4;
    } else if (value[index] === '\\' && index + 1 < value.length) {
      bytes.push(...Buffer.from(value[index + 1]!));
      index += 2;
    } else {
      const character = String.fromCodePoint(value.codePointAt(index)!);
      bytes.push(...Buffer.from(character));
      index += character.length;
    }
  }
  try { return new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(bytes)); }
  catch { return ''; }
}

function normalizeHost(value: string): string | null {
  const host = sanitizeDnsSdText(unescapeDnsSdName(value), 253).replace(/\.$/, '');
  if (!host || /[\s/\\]/.test(host) || !/^[A-Za-z0-9._:%-]+$/.test(host)) {
    return null;
  }

  return host;
}

function sanitizeDnsSdText(value: string, maxBytes: number): string {
  const withoutControls = value.replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ');
  let cleaned = withoutControls.replace(/\s+/g, ' ').trim();
  while (Buffer.byteLength(cleaned, 'utf8') > maxBytes) {
    cleaned = cleaned.slice(0, -1);
  }

  return cleaned.trim();
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, map: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  const workers = Array.from({length: Math.min(concurrency, items.length)}, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await map(items[index]!);
    }
  });

  await Promise.all(workers);
  return results;
}
