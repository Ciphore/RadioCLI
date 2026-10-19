import {afterEach, describe, expect, it, vi} from 'vitest';
import {runAirPlayCommand} from './airplay-process.js';

afterEach(() => vi.unstubAllEnvs());

describe('bounded AirPlay subprocess probes', () => {
  it('keeps stderr private and preserves UTF-8 output', async () => {
    expect(await runAirPlayCommand(process.execPath, ['-e', 'process.stdout.write("Café"); process.stderr.write("secret");'], 1000, 4096)).toEqual({output: 'Café', code: 0, truncated: false, timedOut: false});
  });
  it('terminates hanging tools by the deadline', async () => {
    const start = Date.now();
    const result = await runAirPlayCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], 100, 4096);
    expect(result.timedOut).toBe(true);
    expect(Date.now() - start).toBeLessThan(1000);
  });
  it('bounds combined stdout and stderr even for noisy tools', async () => {
    const result = await runAirPlayCommand(process.execPath, ['-e', 'process.stdout.write("a".repeat(100000)); process.stderr.write("b".repeat(100000));'], 1000, 64);
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(64);
  });
  it('contains a missing executable failure', async () => {
    expect(await runAirPlayCommand('/nonexistent/radiocli-airplay-tool', [], 1000, 4096)).toMatchObject({code: null, output: '', timedOut: false});
  });
  it('uses an explicit child environment without merging ambient overrides', async () => {
    vi.stubEnv('DBUS_SYSTEM_BUS_ADDRESS', 'unixexec:path=/probe-only');
    vi.stubEnv('RADIOCLI_PROBE_SECRET', 'secret-token');
    const result = await runAirPlayCommand(process.execPath, ['-e', 'process.stdout.write(JSON.stringify({bus:process.env.DBUS_SYSTEM_BUS_ADDRESS,secret:process.env.RADIOCLI_PROBE_SECRET,locale:process.env.LC_ALL,chosen:process.env.RADIOCLI_PROBE_CHOSEN}))'], 1000, 4096, {env: {RADIOCLI_PROBE_CHOSEN: 'yes'}});
    expect(result).toEqual({output: '{"locale":"C","chosen":"yes"}', code: 0, timedOut: false, truncated: false});
  });

  it.skipIf(process.platform === 'win32').each([
    ['airplay', 'timeout'], ['airplay', 'output-cap'], ['doctor', 'timeout'], ['doctor', 'output-cap']
  ] as const)('lets the parent Node process exit after %s %s with descendant-held pipes', async (probe, stop) => {
    const directory = mkdtempSync(join(tmpdir(), 'radiocli-probe-lifetime-'));
    const helper = join(directory, 'probe-helper');
    // Both stdout and stderr remain open in the sleeping descendant. Measuring
    // only promise settlement would miss those handles keeping Node alive.
    writeFileSync(helper, `#!/bin/sh\n/bin/sleep 5 &\nprintf ready\nprintf private >&2\n${stop === 'output-cap' ? 'printf %8192s x >&2\n' : ''}wait\n`, {mode: 0o700});
    const code = probe === 'airplay'
      ? `import {runAirPlayCommand} from ${JSON.stringify(new URL('./airplay-process.ts', import.meta.url).href)};
         const result = await runAirPlayCommand(${JSON.stringify(helper)}, [], 100, 4096);
         console.log(JSON.stringify({bounded: result.timedOut || result.truncated}));`
      : `import {probeNativeIntegrations} from ${JSON.stringify(new URL('../platform/diagnostics.ts', import.meta.url).href)};
         import {identifyPlatform} from ${JSON.stringify(new URL('../platform/runtime.ts', import.meta.url).href)};
         const report = await probeNativeIntegrations({
           host: {...identifyPlatform(), id: 'linux'}, env: {DBUS_SESSION_BUS_ADDRESS: 'unix:path=/probe-bus'},
           libraryPath: () => ${JSON.stringify(join(directory, 'absent.json'))},
           resolve: command => command === 'busctl' ? ${JSON.stringify(helper)} : undefined,
           omarchy: () => {throw new Error('unverified')},
           terminalPlan: () => {throw new Error('unverified')},
           mpv: () => ({status: 'unsupported', args: [], reason: 'unverified'}), isSocket: () => false,
           airPlay: async () => ({eligible:false,discoveryExecutable:false,discoveryService:'unverified',senderLoaded:false,ffmpeg:false,ready:false,message:'unverified'})
         });
         console.log(JSON.stringify({bounded: report.desktopMedia.sessionBus.status === 'unavailable'}));`;
    try {
      const start = Date.now();
      const result = await promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
        cwd: fileURLToPath(new URL('../../', import.meta.url)), timeout: 8000, maxBuffer: 4096
      });
      expect(result.stdout.trim()).toBe('{"bounded":true}');
      expect(Date.now() - start).toBeLessThan(3000);
    } finally { rmSync(directory, {recursive: true, force: true}); }
  }, 10_000);
});
import {execFile} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
