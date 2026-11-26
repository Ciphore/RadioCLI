import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AlarmReconciliation} from './reconciliation.js';
import {acquireOccurrenceLock} from './runner.js';
import {SchedulerService, type SchedulerAdapter} from './scheduler.js';
import {AlarmRuntimeHealthStore} from './runtime-health.js';
import type {Alarm} from '../types.js';
import * as fileLocks from '../storage/file-lock.js';

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true}); });
describe('alarm reconciliation', () => {
  it.each(['EACCES', 'EPERM'])('retries Windows %s during lock-directory deletion', async code => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-reconcile-windows-')); roots.push(root);
    const acquire = vi.spyOn(fileLocks, 'acquireFileLock').mockImplementationOnce(() => { throw Object.assign(new Error('pending deletion'), {code}); });
    await expect(new AlarmReconciliation(root, 'win32').run('a', () => 'registered')).resolves.toBe('registered');
    expect(acquire).toHaveBeenCalledTimes(2);
  });
  it('preserves a claimed runner during resync, disable, and removal, then permits cleanup after completion', async () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-active-reconcile-')); roots.push(root);
    const gate = new AlarmReconciliation(root);
    const release = acquireOccurrenceLock('a', '2030-01-01T08:00:00Z', root)!;
    const adapter: SchedulerAdapter = {capabilities: () => ({supported: true, exactWake: false, catchUpAfterWake: false, message: 'fixture'}),
      install: vi.fn(async () => {}), remove: vi.fn(async () => {}), status: vi.fn(async () => ({installed: true, healthy: true, message: 'fixture'}))};
    const guard = {start: vi.fn(async () => {}), stop: vi.fn(async () => true)};
    const service = new SchedulerService(adapter, () => new Date('2030-01-01T07:00:00Z'), new AlarmRuntimeHealthStore(join(root, 'health.json')), guard, gate);
    const alarm = {id: 'a', enabled: true, schedule: {type: 'once', at: '2030-01-01T08:00:00Z'}, reliability: {keepAwakeUntilAlarm: true}} as Alarm;
    await service.sync(alarm); await service.sync({...alarm, enabled: false});
    await expect(service.syncAll([alarm])).resolves.toMatchObject([{id: 'a', deferred: true}]);
    await expect(service.remove('a')).rejects.toThrow(/currently playing/);
    expect(adapter.install).not.toHaveBeenCalled(); expect(adapter.remove).not.toHaveBeenCalled(); expect(guard.stop).not.toHaveBeenCalled();
    release(true);
    await service.sync({...alarm, enabled: false});
    expect(adapter.remove).toHaveBeenCalledOnce(); expect(guard.stop).toHaveBeenCalledOnce();
  });

  it('serializes a runner claim and a native registration change across independent callers', async () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-reconcile-order-')); roots.push(root);
    const order: string[] = []; let finish!: () => void;
    const first = new AlarmReconciliation(root).run('a', async () => { order.push('claim'); await new Promise<void>(resolve => { finish = resolve; }); order.push('published'); });
    const second = new AlarmReconciliation(root).run('a', () => { order.push('sync'); });
    expect(order).toEqual(['claim']); finish(); await Promise.all([first, second]);
    expect(order).toEqual(['claim', 'published', 'sync']);
  });
});
