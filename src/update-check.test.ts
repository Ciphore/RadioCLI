import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  checkForUpdate,
  compareSemver,
  shouldCheckForUpdate,
  updateCommandForInstall,
  updateStatusText
} from './update-check.js';

describe('update checks', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('compares semantic versions', () => {
    expect(compareSemver('0.1.10', '0.1.9')).toBeGreaterThan(0);
    expect(compareSemver('1.0.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareSemver('0.1.9', '0.1.9')).toBe(0);
    expect(compareSemver('0.1.8', '0.1.9')).toBeLessThan(0);
  });

  it('parses npm latest metadata into an available update', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({version: '0.1.10'}), {status: 200}));

    const updateCheck = await checkForUpdate({
      currentVersion: '0.1.9',
      fetchImpl,
      now: new Date('2026-07-07T12:00:00.000Z')
    });

    expect(fetchImpl).toHaveBeenCalledWith('https://registry.npmjs.org/%40ciphore%2Fradiocli/latest', expect.any(Object));
    expect(updateCheck).toEqual({
      checkedAt: '2026-07-07T12:00:00.000Z',
      currentVersion: '0.1.9',
      latestVersion: '0.1.10',
      updateAvailable: true
    });
  });

  it('fails softly when the registry check fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', {status: 503}));

    const updateCheck = await checkForUpdate({
      currentVersion: '0.1.9',
      fetchImpl,
      now: new Date('2026-07-07T12:00:00.000Z')
    });

    expect(updateCheck.updateAvailable).toBe(false);
    expect(updateCheck.error).toContain('503');
  });

  it('uses a 24 hour cache and honors disable flags', () => {
    expect(shouldCheckForUpdate(undefined, Date.parse('2026-07-07T12:00:00.000Z'))).toBe(true);
    expect(
      shouldCheckForUpdate(
        {checkedAt: '2026-07-07T11:00:00.000Z', currentVersion: '0.1.9', latestVersion: '0.1.9', updateAvailable: false},
        Date.parse('2026-07-07T12:00:00.000Z')
      )
    ).toBe(false);
    expect(
      shouldCheckForUpdate(
        {checkedAt: '2026-07-06T11:00:00.000Z', currentVersion: '0.1.9', latestVersion: '0.1.9', updateAvailable: false},
        Date.parse('2026-07-07T12:00:00.000Z')
      )
    ).toBe(true);

    vi.stubEnv('RADIOCLI_DISABLE_UPDATE_CHECK', '1');
    expect(shouldCheckForUpdate(undefined)).toBe(false);
  });

  it('formats update status for settings', () => {
    expect(updateStatusText(undefined)).toBe('not checked yet');
    expect(updateStatusText({checkedAt: 'now', currentVersion: '0.1.9', latestVersion: '0.1.10', updateAvailable: true})).toBe('v0.1.10 available');
    expect(updateStatusText({checkedAt: 'now', currentVersion: '0.1.9', latestVersion: '0.1.9', updateAvailable: false})).toBe('current at v0.1.9');
  });

  it('detects likely install commands', () => {
    expect(updateCommandForInstall('/opt/homebrew/Cellar/radiocli/0.1.9/bin/radiocli')).toEqual({
      method: 'homebrew',
      command: 'brew update && brew upgrade radiocli'
    });
    expect(updateCommandForInstall('/usr/local/lib/node_modules/@ciphore/radiocli/dist/cli.js')).toEqual({
      method: 'npm',
      command: 'npm install -g @ciphore/radiocli@latest'
    });
    expect(updateCommandForInstall('/tmp/radiocli/dist/cli.js')).toEqual({
      method: 'unknown',
      command: 'npm install -g @ciphore/radiocli@latest'
    });
  });
});
