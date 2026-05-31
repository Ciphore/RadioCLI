import {describe, expect, it} from 'vitest';
import {airPlaySenderHealth} from './airplay-sender-health.js';

describe('AirPlay sender health gate', () => {
  it('blocks AirPlay when the optional sender is missing', () => {
    const health = airPlaySenderHealth(() => null);

    expect(health).toMatchObject({
      available: false,
      safe: false,
      packageName: 'node-airtunes2'
    });
  });

  it('blocks node-airtunes2 installs with high-risk transitive dependencies', () => {
    const health = airPlaySenderHealth(packageLookup({
      'node-airtunes2': '2.5.0',
      protobufjs: '6.11.6',
      elliptic: '6.6.1'
    }));

    expect(health.safe).toBe(false);
    expect(health.vulnerablePackages).toEqual(['protobufjs@6.11.6']);
    expect(health.warningPackages).toEqual(['elliptic@6.6.1']);
  });

  it('allows the bundled sender when only the no-fix low-risk elliptic advisory remains', () => {
    const health = airPlaySenderHealth(packageLookup({
      'node-airtunes2': '2.5.0',
      protobufjs: '7.6.2',
      elliptic: '6.6.1'
    }));

    expect(health.safe).toBe(true);
    expect(health.vulnerablePackages).toEqual([]);
    expect(health.warningPackages).toEqual(['elliptic@6.6.1']);
  });

  it('allows future patched sender installs', () => {
    const health = airPlaySenderHealth(packageLookup({
      'node-airtunes2': '2.5.1',
      protobufjs: '7.5.8',
      elliptic: '6.6.2'
    }));

    expect(health).toMatchObject({
      available: true,
      safe: true,
      version: '2.5.1'
    });
    expect(health.warningPackages).toEqual([]);
  });
});

function packageLookup(packages: Record<string, string>) {
  return (packageName: string) => {
    const version = packages[packageName];
    return version ? {name: packageName, version, root: `/tmp/${packageName}`} : null;
  };
}
