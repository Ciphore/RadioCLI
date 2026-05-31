import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';

const require = createRequire(import.meta.url);

const airPlaySenderPackageName = 'node-airtunes2';

type PackageVersion = {
  name: string;
  version: string;
  root: string;
};

type PackageLookup = (packageName: string, paths?: string[]) => PackageVersion | null;

export type AirPlaySenderHealth = {
  available: boolean;
  safe: boolean;
  packageName: string;
  version?: string;
  message: string;
  vulnerablePackages: string[];
};

export function airPlaySenderHealth(lookupPackage: PackageLookup = lookupInstalledPackage): AirPlaySenderHealth {
  const sender = lookupPackage(airPlaySenderPackageName);
  if (!sender) {
    return {
      available: false,
      safe: false,
      packageName: airPlaySenderPackageName,
      message: 'AirPlay sender package not installed. Install an audited node-airtunes2-compatible sender next to RadioCLI.',
      vulnerablePackages: []
    };
  }

  const vulnerablePackages = vulnerableAirPlaySenderPackages(sender, lookupPackage);
  if (vulnerablePackages.length > 0) {
    return {
      available: true,
      safe: false,
      packageName: sender.name,
      version: sender.version,
      message: `Installed AirPlay sender ${sender.name}@${sender.version} is blocked because vulnerable transitive dependencies were found: ${vulnerablePackages.join(', ')}.`,
      vulnerablePackages
    };
  }

  return {
    available: true,
    safe: true,
    packageName: sender.name,
    version: sender.version,
    message: `AirPlay sender ${sender.name}@${sender.version} passed the dependency safety gate.`,
    vulnerablePackages: []
  };
}

function vulnerableAirPlaySenderPackages(sender: PackageVersion, lookupPackage: PackageLookup): string[] {
  const packagePaths = [sender.root];
  const vulnerable: string[] = [];
  const protobuf = lookupPackage('protobufjs', packagePaths);
  const elliptic = lookupPackage('elliptic', packagePaths);

  if (protobuf && compareSemver(protobuf.version, '7.5.8') < 0) {
    vulnerable.push(`protobufjs@${protobuf.version}`);
  }

  if (elliptic && compareSemver(elliptic.version, '6.6.2') < 0) {
    vulnerable.push(`elliptic@${elliptic.version}`);
  }

  return vulnerable;
}

function lookupInstalledPackage(packageName: string, paths?: string[]): PackageVersion | null {
  try {
    const packageJsonPath = paths
      ? require.resolve(`${packageName}/package.json`, {paths})
      : require.resolve(`${packageName}/package.json`);
    const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {name?: string; version?: string};
    if (!parsed.version) {
      return null;
    }

    return {
      name: parsed.name ?? packageName,
      version: parsed.version,
      root: dirname(packageJsonPath)
    };
  } catch {
    return null;
  }
}

function compareSemver(left: string, right: string): number {
  const leftParts = semverParts(left);
  const rightParts = semverParts(right);
  for (let index = 0; index < 3; index += 1) {
    const delta = leftParts[index]! - rightParts[index]!;
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

function semverParts(version: string): [number, number, number] {
  const [major = '0', minor = '0', patch = '0'] = version.split(/[.-]/);
  return [
    Number.parseInt(major, 10) || 0,
    Number.parseInt(minor, 10) || 0,
    Number.parseInt(patch, 10) || 0
  ];
}
