import {existsSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {runDataSmokeCli} from './data-smoke.js';
import type {AppSettings, Station} from '../types.js';

const originalRadioCliHome = process.env.RADIOCLI_HOME;
let logs: string[] = [];

describe('data smoke isolation', () => {
  beforeEach(() => {
    process.env.RADIOCLI_HOME = '/tmp/radiocli-user-home';
    logs = [];
    vi.spyOn(console, 'log').mockImplementation(message => {
      logs.push(String(message));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv('RADIOCLI_HOME', originalRadioCliHome);
  });

  it('runs with a temporary RADIOCLI_HOME and restores the caller environment', async () => {
    let capturedHome = '';

    const summary = await runDataSmokeCli(async () => {
      capturedHome = process.env.RADIOCLI_HOME ?? '';
      writeFileSync(join(capturedHome, 'probe.txt'), 'smoke isolation\n', 'utf8');
      return fakeRuntime();
    });

    expect(capturedHome).toMatch(/radiocli-smoke-/);
    expect(capturedHome).not.toBe('/tmp/radiocli-user-home');
    expect(summary.smokeHome).toBe(capturedHome);
    expect(process.env.RADIOCLI_HOME).toBe('/tmp/radiocli-user-home');
    expect(existsSync(capturedHome)).toBe(false);
    expect(logs).toEqual([
      'countries=1',
      'first_country=Japan 500',
      'search_results=1',
      'first_station=Tokyo Jazz FM',
      'resolved_url=https://streams.example.com/tokyo-jazz.mp3'
    ]);
  });
});

function fakeRuntime() {
  const firstStation = station();
  return {
    settings: settings(),
    providers: {
      countries: async () => [{name: 'Japan', code: 'JP', stationCount: 500}],
      search: async () => [firstStation],
      resolve: async (resolvedStation: Station) => ({
        url: `https://streams.example.com/${resolvedStation.id}.mp3`,
        name: resolvedStation.name
      })
    }
  };
}

function settings(): AppSettings {
  return {
    theme: 'green',
    receiverStyle: 'pulse-grid',
    receiverStyleVersion: 2,
    volume: 70,
    enableRadioGarden: false,
    enableNearbyLocation: false,
    preferredBackend: 'auto',
    tuneTimeoutSeconds: 12,
    skipBrokenStreams: true,
    mediaKeys: {previous: [], playPause: [], next: []}
  };
}

function station(): Station {
  return {
    id: 'tokyo-jazz',
    provider: 'radio-browser',
    name: 'Tokyo Jazz FM',
    tags: ['jazz']
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
