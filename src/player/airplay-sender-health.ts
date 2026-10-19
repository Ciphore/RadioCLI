import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {runAirPlayCommand, type AirPlayCommandRunner} from './airplay-process.js';
import {airPlaySenderPackageJson} from './airplay-sender-package.js';

const require = createRequire(import.meta.url);

const airPlaySenderPackageName = 'node-airtunes2';

type PackageVersion = {
  name: string;
  version: string;
  root: string;
  nativeEd25519?: boolean;
  dependencies?: string[];
};

type PackageLookup = (packageName: string, paths?: string[]) => PackageVersion | null;

export type AirPlaySenderHealth = {
  available: boolean;
  safe: boolean;
  packageName: string;
  version?: string;
  message: string;
  vulnerablePackages: string[];
  warningPackages: string[];
};

export type AirPlaySenderLoadability = {loaded: boolean; message: string};
let senderProbe: {key: string; until: number; result: Promise<AirPlaySenderLoadability>} | undefined;

/** Explicit diagnostics/discovery only: loading native code stays outside the TUI. */
export async function probeAirPlaySender(options: {health?: AirPlaySenderHealth; run?: AirPlayCommandRunner; timeoutMs?: number} = {}): Promise<AirPlaySenderLoadability> {
  const health = options.health ?? airPlaySenderHealth();
  if (!health.safe) return {loaded: false, message: health.message};
  const key = `${process.execPath}:${health.packageName}:${health.version}`;
  if (!options.run && senderProbe?.key === key && senderProbe.until > Date.now()) return senderProbe.result;
  const result = (async () => {
    const code = [
      "const r = require('node:module').createRequire(process.argv[1]);",
      "try { const s = r('./');",
      "if (typeof s !== 'function' || typeof s.prototype.add !== 'function' || typeof s.prototype.stopAll !== 'function') process.exit(1);",
      // The Linux binding is otherwise loaded only when constructing a receiver.
      // Match the sender's JS fallback on a normal require failure, but contain
      // native crashes here before advertising a loadable sender. No sockets.
      "if (process.platform === 'linux') { try { r('./build/Release/airtunes'); } catch {} }",
      'process.exit(0); } catch { process.exit(1); }'
    ].join('\n');
    const probe = await (options.run ?? runAirPlayCommand)(process.execPath, ['-e', code, airPlaySenderPackageJson], Math.min(1500, Math.max(1, options.timeoutMs ?? 1500)), 4096);
    const loaded = probe.code === 0 && !probe.timedOut && !probe.truncated;
    return {loaded, message: loaded ? 'The optional AirPlay sender loaded in an isolated process.' : 'The optional AirPlay sender could not load. Local playback remains available; run radiocli doctor.'};
  })();
  if (!options.run) senderProbe = {key, until: Date.now() + 30_000, result};
  return result;
}

export function airPlaySenderHealth(lookupPackage: PackageLookup = lookupInstalledPackage): AirPlaySenderHealth {
  const sender = lookupPackage(airPlaySenderPackageName);
  if (!sender) {
    return {
      available: false,
      safe: false,
      packageName: airPlaySenderPackageName,
      message: 'AirPlay sender package is not installed.',
      vulnerablePackages: [],
      warningPackages: []
    };
  }

  const missingPackages = (sender.dependencies ?? []).filter(name => !lookupPackage(name, [sender.root]));
  if (missingPackages.length > 0) {
    return {available: false, safe: false, packageName: sender.name, version: sender.version,
      message: `Optional AirPlay sender dependencies are not installed: ${missingPackages.join(', ')}. Local playback remains available.`,
      vulnerablePackages: [], warningPackages: []};
  }
  if (!sender.nativeEd25519) {
    return {
      available: true,
      safe: false,
      packageName: sender.name,
      version: sender.version,
      message: `AirPlay sender ${sender.name}@${sender.version} is missing the native Ed25519 security fix.`,
      vulnerablePackages: [`${sender.name}@${sender.version}`],
      warningPackages: []
    };
  }

  return {
    available: true,
    safe: true,
    packageName: sender.name,
    version: sender.version,
    message: `AirPlay sender ${sender.name}@${sender.version} uses native Ed25519 with its optional runtime dependencies installed.`,
    vulnerablePackages: [],
    warningPackages: []
  };
}

function lookupInstalledPackage(packageName: string, paths?: string[]): PackageVersion | null {
  try {
    // Package exports can hide package.json while exposing the runtime entry.
    if (paths && packageName !== airPlaySenderPackageName) {
      return {name: packageName, version: 'installed', root: dirname(require.resolve(packageName, {paths}))};
    }
    const packageJsonPath = packageName === airPlaySenderPackageName ? airPlaySenderPackageJson : paths
      ? require.resolve(`${packageName}/package.json`, {paths})
      : require.resolve(`${packageName}/package.json`);
    const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {name?: string; version?: string; radiocliLegacyPairing?: string; dependencies?: Record<string, string>};
    if (!parsed.version) {
      return null;
    }

    return {
      name: parsed.name ?? packageName,
      version: parsed.version,
      root: dirname(packageJsonPath),
      ...(packageName === airPlaySenderPackageName ? {nativeEd25519: parsed.radiocliLegacyPairing === 'node:crypto', dependencies: Object.keys(parsed.dependencies ?? {})} : {})
    };
  } catch {
    return null;
  }
}
