import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  automaticUpdateChecksAllowed,
  checkForUpdate,
  compareSemver,
  shouldCheckForUpdate,
  updateAvailableForVersion,
  updateCommandForInstall,
  updateShellForPlatform,
  updateStatusText
} from './update-check.js';

describe('update checks', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
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

  it('does not make automatic or explicit registry requests while offline', async () => {
    vi.stubEnv('CI', 'false');
    vi.stubEnv('RADIOCLI_OFFLINE', '1');
    const fetchImpl = vi.fn(async () => new Response('{"version":"99.0.0"}'));
    expect(shouldCheckForUpdate(undefined)).toBe(false);
    expect(automaticUpdateChecksAllowed(true)).toBe(false);
    const result = await checkForUpdate({fetchImpl});
    expect(result.updateAvailable).toBe(false);
    expect(result.error).toMatch(/offline/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('bounds the registry response body after headers arrive', async () => {
    vi.useFakeTimers();
    let body!: ReadableStreamDefaultController<Uint8Array>;
    const fetchImpl = async () => new Response(new ReadableStream<Uint8Array>({start(controller) {body = controller;}}));
    let result: Awaited<ReturnType<typeof checkForUpdate>> | undefined;
    const checking = checkForUpdate({fetchImpl, timeoutMs: 100}).then(value => {result = value;});
    try {
      await vi.advanceTimersByTimeAsync(101);
      expect(result?.error).toMatch(/timed out/i);
    } finally {
      body.error(new Error('test cleanup'));
      await checking;
    }
  });

  it('uses a 24 hour cache and honors disable flags', () => {
    vi.stubEnv('CI', 'false');

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

  it('skips automatic update checks in CI', () => {
    vi.stubEnv('CI', 'true');

    expect(shouldCheckForUpdate(undefined, Date.parse('2026-07-07T12:00:00.000Z'))).toBe(false);
  });

  it('honors the persisted automatic update preference and environment overrides', () => {
    vi.stubEnv('CI', 'false');
    vi.stubEnv('RADIOCLI_DISABLE_UPDATE_CHECK', '0');

    expect(automaticUpdateChecksAllowed(true)).toBe(true);
    expect(automaticUpdateChecksAllowed(false)).toBe(false);

    vi.stubEnv('RADIOCLI_DISABLE_UPDATE_CHECK', '1');
    expect(automaticUpdateChecksAllowed(true)).toBe(false);
  });

  it('formats update status for settings', () => {
    expect(updateStatusText(undefined)).toBe('not checked yet');
    expect(updateStatusText({checkedAt: 'now', currentVersion: '0.1.9', latestVersion: '0.1.10', updateAvailable: true})).toBe('v0.1.10 available');
    expect(updateStatusText({checkedAt: 'now', currentVersion: '0.1.9', latestVersion: '0.1.9', updateAvailable: false})).toBe('current at v0.1.9');
  });

  it('ignores a persisted update notice after that version has been installed', () => {
    const stale = {checkedAt: 'now', currentVersion: '0.1.9', latestVersion: '0.1.10', updateAvailable: true};

    expect(updateAvailableForVersion(stale, '0.1.10')).toBe(false);
    expect(updateStatusText(stale, '0.1.10')).toBe('current at v0.1.10');
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
    expect(updateCommandForInstall('/Users/test/Library/pnpm/global/5/node_modules/@ciphore/radiocli/dist/cli.js')).toEqual({
      method: 'pnpm',
      command: 'pnpm add -g @ciphore/radiocli@latest'
    });
    expect(updateCommandForInstall('/Users/test/.bun/install/global/node_modules/@ciphore/radiocli/dist/cli.js')).toEqual({
      method: 'bun',
      command: 'bun add -g @ciphore/radiocli@latest'
    });
    expect(updateCommandForInstall('C:\\Users\\test\\AppData\\Local\\pnpm\\global\\5\\node_modules\\@ciphore\\radiocli\\dist\\cli.js')).toEqual({
      method: 'pnpm',
      command: 'pnpm add -g @ciphore/radiocli@latest'
    });
    expect(updateCommandForInstall('/tmp/radiocli/dist/cli.js')).toEqual({
      method: 'unknown',
      command: 'npm install -g @ciphore/radiocli@latest'
    });
  });

  it('uses the native command shell on Windows, macOS, and Linux', () => {
    expect(updateShellForPlatform('win32', 'npm install -g pkg')).toEqual({
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm install -g pkg']
    });
    expect(updateShellForPlatform('darwin', 'brew upgrade pkg')).toEqual({
      command: 'sh',
      args: ['-lc', 'brew upgrade pkg']
    });
    expect(updateShellForPlatform('linux', 'npm install -g pkg')).toEqual({
      command: 'sh',
      args: ['-lc', 'npm install -g pkg']
    });
  });
});
