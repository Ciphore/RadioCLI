import {mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {prepareUpdateRepair, reconcileUpdatedInstallation} from './update-repair.js';
import {JsonLibraryStore} from './storage/store.js';
import {acquireOccurrenceLock} from './alarms/runner.js';

const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true}); });
describe('post-update registration repair', () => {
  it('reports active pre-upgrade alarms as deferred without changing their native registration', async () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-deferred-repair-')); roots.push(root); vi.stubEnv('RADIOCLI_HOME', root);
    const store = new JsonLibraryStore();
    const alarm = store.addAlarm({label: 'Active fixture', enabled: true, station: {id: 'fixture', provider: 'playlist', name: 'Fixture', tags: []},
      schedule: {type: 'once', at: '2099-01-01T08:00:00Z'}, playback: {volume: 40, fadeSeconds: 0, stopAfterMinutes: 30}, reliability: {missedRunGraceMinutes: 10, wakeIfSupported: false}});
    const release = acquireOccurrenceLock(alarm.id, '2026-01-01T08:00:00Z', join(root, 'runtime'))!;
    try {
      const result = await reconcileUpdatedInstallation({nodePath: process.execPath, cliPath: '/fixture/cli.js'});
      expect(result).toMatchObject({mcp: 'disabled', alarms: 0, failures: [expect.stringContaining('Dismiss it, then run radiocli alarm sync')]});
      expect(store.getAlarm(alarm.id)).toEqual(alarm);
    } finally { release(true); }
  });

  it.skipIf(process.platform === 'win32')('uses the newly installed code after Homebrew removes the old keg', async () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-update-repair-')); roots.push(root);
    const old = join(root, 'Cellar', 'radiocli', '0.2.6'); const next = join(root, 'Cellar', 'radiocli', '0.2.7');
    mkdirSync(old, {recursive: true}); mkdirSync(next, {recursive: true}); mkdirSync(join(root, 'opt'));
    writeFileSync(join(old, 'cli.cjs'), "throw new Error('retired code must not run');");
    writeFileSync(join(next, 'cli.cjs'), "process.stdout.write(JSON.stringify({mcp:'repaired',alarms:2,failures:[]}));");
    const link = join(root, 'opt', 'radiocli'); symlinkSync(old, link);
    const repair = prepareUpdateRepair({nodePath: process.execPath, cliPath: join(old, 'cli.cjs')});
    rmSync(link); symlinkSync(next, link); rmSync(old, {recursive: true});
    await expect(repair()).resolves.toEqual({mcp: 'repaired', alarms: 2, failures: []});
  });

  it.each(['{}', 'null', '{"mcp":"repaired","alarms":1,"failures":[false]}'])('rejects invalid fresh-process output %s', async output => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-bad-repair-')); roots.push(root);
    const cli = join(root, 'cli.cjs'); writeFileSync(cli, `process.stdout.write(${JSON.stringify(output)});`);
    await expect(prepareUpdateRepair({nodePath: process.execPath, cliPath: cli})()).rejects.toThrow('invalid repair result');
  });

  it('reports removed installations as failed repair', async () => {
    await expect(prepareUpdateRepair({nodePath: process.execPath, cliPath: '/radiocli-fixture-missing/cli.js'})()).rejects.toThrow('could not be resolved');
  });
});
