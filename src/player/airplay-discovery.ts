import {spawn} from 'node:child_process';
import type {AirPlayDevice} from '../types.js';
import {commandExists} from './command.js';

export type AirPlayDiscoveryOptions = {
  platform?: NodeJS.Platform;
  timeoutMs?: number;
};

export async function discoverAirPlayDevices({
  platform = process.platform,
  timeoutMs = 2500
}: AirPlayDiscoveryOptions = {}): Promise<AirPlayDevice[]> {
  if (platform !== 'darwin' || !commandExists('dns-sd')) {
    return [];
  }

  const browseOutput = await runDnsSd(['-B', '_raop._tcp', 'local'], timeoutMs).catch(() => '');
  const instances = parseRaopBrowseOutput(browseOutput);
  const devices = await Promise.all(
    instances.map(async instance => {
      const lookupOutput = await runDnsSd(['-L', instance, '_raop._tcp', 'local'], timeoutMs).catch(() => '');
      return parseRaopLookupOutput(instance, lookupOutput);
    })
  );

  return devices.filter((device): device is AirPlayDevice => Boolean(device));
}

export function parseRaopBrowseOutput(output: string): string[] {
  const instances = new Set<string>();
  for (const line of output.split('\n')) {
    const match = /\s_raop\._tcp\.\s+(.+)$/.exec(line);
    const instance = match?.[1]?.trim();
    if (instance) {
      instances.add(unescapeDnsSdName(instance));
    }
  }

  return [...instances];
}

export function parseRaopLookupOutput(instance: string, output: string): AirPlayDevice | null {
  const reachable = output.match(/ can be reached at (.+?)\.?:(\d+) \(interface \d+\)/);
  if (!reachable?.[1] || !reachable[2]) {
    return null;
  }

  const txtLine = output
    .split('\n')
    .map(line => line.trim())
    .find(line => /\bcn=/.test(line) || /\bsf=/.test(line) || /\bpk=/.test(line));
  const txt = txtLine ? txtLine.split(/\s+/).filter(Boolean) : [];
  const txtMap = txtRecordMap(txt);
  const sf = txtMap.get('sf');
  const sfValue = sf ? Number.parseInt(sf.replace(/^0x/i, ''), 16) : 0;

  return {
    id: instance,
    name: displayNameForRaopInstance(instance),
    host: unescapeDnsSdName(reachable[1]).replace(/\.$/, ''),
    port: Number(reachable[2]),
    txt,
    requiresPassword: sfValue !== 0 && sfValue !== 0x4,
    airplay2: Boolean(txtMap.get('pk') || txtMap.get('vv') === '2' || txtMap.get('et')?.split(',').some(value => ['3', '4', '5'].includes(value)))
  };
}

function displayNameForRaopInstance(instance: string): string {
  const atIndex = instance.indexOf('@');
  return atIndex === -1 ? instance : instance.slice(atIndex + 1);
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

function runDnsSd(args: string[], timeoutMs: number): Promise<string> {
  return new Promise(resolve => {
    const child = spawn('dns-sd', args, {stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', chunk => {
      output += chunk.toString('utf8');
    });
    child.stderr.on('data', chunk => {
      output += chunk.toString('utf8');
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
