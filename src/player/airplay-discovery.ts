import {spawn} from 'node:child_process';
import {lookup} from 'node:dns/promises';
import {networkInterfaces} from 'node:os';
import type {AirPlayDevice} from '../types.js';
import {commandExists} from './command.js';

export type AirPlayDiscoveryOptions = {
  platform?: NodeJS.Platform;
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
  timeoutMs = defaultTimeoutMs,
  maxDevices = defaultMaxDevices,
  lookupConcurrency = defaultLookupConcurrency,
  maxOutputBytes = defaultMaxOutputBytes
}: AirPlayDiscoveryOptions = {}): Promise<AirPlayDevice[]> {
  if (platform !== 'darwin' || !commandExists('dns-sd')) {
    return [];
  }

  const browseOutput = await runDnsSd(['-B', '_raop._tcp', 'local'], timeoutMs, maxOutputBytes).catch(() => '');
  const instances = parseRaopBrowseOutput(browseOutput).slice(0, Math.max(0, maxDevices));
  const devices = await mapWithConcurrency(
    instances,
    Math.max(1, lookupConcurrency),
    async instance => {
      const lookupOutput = await runDnsSd(['-L', instance, '_raop._tcp', 'local'], timeoutMs, maxOutputBytes).catch(() => '');
      const device = parseRaopLookupOutput(instance, lookupOutput);
      return device ? enrichAirPlayDeviceHost(device) : null;
    }
  );

  return devices.filter((device): device is AirPlayDevice => Boolean(device));
}

async function enrichAirPlayDeviceHost(device: AirPlayDevice): Promise<AirPlayDevice> {
  const addresses = await lookup(device.host, {all: true, family: 4}).catch(() => []);
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
    .find(line => /\bcn=/.test(line) || /\bsf=/.test(line) || /\bpk=/.test(line));
  const txt = txtLine
    ? txtLine.split(/\s+/).map(entry => sanitizeDnsSdText(entry, 512)).filter(Boolean).slice(0, 64)
    : [];
  const txtMap = txtRecordMap(txt);
  const sf = txtMap.get('sf');
  const sfValue = sf ? Number.parseInt(sf.replace(/^0x/i, ''), 16) : 0;

  return {
    id,
    name: displayNameForRaopInstance(id),
    host,
    port,
    txt,
    requiresPassword: sfValue !== 0 && sfValue !== 0x4,
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
  return value.replace(/\\(\d{3})/g, (_match, code: string) => String.fromCharCode(Number(code)));
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

function runDnsSd(args: string[], timeoutMs: number, maxOutputBytes: number): Promise<string> {
  return new Promise(resolve => {
    const child = spawn('dns-sd', args, {stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    let killedForLimit = false;
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);
    const appendOutput = (chunk: Buffer) => {
      if (Buffer.byteLength(output, 'utf8') >= maxOutputBytes) {
        if (!killedForLimit) {
          killedForLimit = true;
          child.kill('SIGTERM');
        }

        return;
      }

      const remaining = maxOutputBytes - Buffer.byteLength(output, 'utf8');
      output += chunk.toString('utf8').slice(0, remaining);
    };

    child.stdout.on('data', chunk => {
      appendOutput(chunk as Buffer);
    });
    child.stderr.on('data', chunk => {
      appendOutput(chunk as Buffer);
    });
    child.once('error', () => {
      clearTimeout(timer);
      resolve(output);
    });
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(output);
    });
  });
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
