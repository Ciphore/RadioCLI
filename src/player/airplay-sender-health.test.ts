import {describe, expect, it, vi} from 'vitest';
import {airPlaySenderHealth, probeAirPlaySender} from './airplay-sender-health.js';
import {airPlaySenderPackageJson} from './airplay-sender-package.js';

const sender = {name: 'node-airtunes2', version: '2.5.0-radiocli.1', root: '/test/vendor/node-airtunes2', nativeEd25519: true, dependencies: ['@noble/ed25519', 'async']};
const dependency = {name: 'dependency', version: '1', root: '/test/node_modules'};

describe('AirPlay sender health gate', () => {
  it('blocks AirPlay when the bundled sender is missing', () => {
    expect(airPlaySenderHealth(() => null)).toMatchObject({available: false, safe: false, packageName: 'node-airtunes2'});
  });

  it('keeps omit-optional installs unavailable and leaves local playback usable', () => {
    const health = airPlaySenderHealth(name => name === 'node-airtunes2' ? sender : null);
    expect(health).toMatchObject({available: false, safe: false, vulnerablePackages: [], warningPackages: []});
    expect(health.message).toContain('@noble/ed25519, async');
    expect(health.message).toContain('Local playback remains available');
  });

  it('detects partially installed optional runtime dependencies', () => {
    const health = airPlaySenderHealth(name => name === 'node-airtunes2' ? sender : name === 'async' ? dependency : null);
    expect(health.safe).toBe(false);
    expect(health.message).toContain('@noble/ed25519');
    expect(health.message).not.toContain('@noble/ed25519, async');
  });

  it('rejects a sender that lacks the native Ed25519 fix', () => {
    const health = airPlaySenderHealth(name => name === 'node-airtunes2' ? {...sender, nativeEd25519: false} : dependency);
    expect(health).toMatchObject({available: true, safe: false, vulnerablePackages: ['node-airtunes2@2.5.0-radiocli.1']});
  });

  it('accepts the fixed sender without consulting unrelated parent-project dependencies', () => {
    const lookup = vi.fn((name: string) => name === 'node-airtunes2' ? sender : dependency);
    expect(airPlaySenderHealth(lookup)).toMatchObject({available: true, safe: true, warningPackages: [], vulnerablePackages: []});
    expect(lookup.mock.calls.map(([name]) => name)).toEqual(['node-airtunes2', '@noble/ed25519', 'async']);
  });

  it('probes the bundled package in an isolated process without importing a parent sender', async () => {
    const run = vi.fn(async (_command: string, _args: string[]) => ({code: 0, output: '', timedOut: false, truncated: false}));
    const health = airPlaySenderHealth(name => name === 'node-airtunes2' ? sender : dependency);
    expect((await probeAirPlaySender({health, run})).loaded).toBe(true);
    expect(run.mock.calls[0]?.[1]?.at(-1)).toBe(airPlaySenderPackageJson);
  });
});
