import {describe, expect, it, vi} from 'vitest';
import type {Alarm} from '../types.js';
import {actionableDegradedAlarmIds, serializeAlarmTuiService, type AlarmTuiService} from './alarm-tui-service.js';

const alarm: Alarm = {id: 'wake', label: 'Wake', enabled: true, station: {id: 'x', provider: 'radio-browser', name: 'X', tags: []}, schedule: {type: 'once', at: '2030-01-01T08:00:00.000Z'}, playback: {volume: 70, fadeSeconds: 0, stopAfterMinutes: 30}, reliability: {missedRunGraceMinutes: 10, wakeIfSupported: false}, createdAt: '2029-01-01T00:00:00.000Z', updatedAt: '2029-01-01T00:00:00.000Z'};
const runtime = {capabilities: {supported: true, exactWake: false, catchUpAfterWake: true, message: 'ok'}, degradedAlarmIds: new Set<string>(), message: 'ok'};
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return {promise, resolve}; }
async function started(): Promise<void> { await new Promise(resolve => setImmediate(resolve)); }

describe('serialized alarm TUI service', () => {
  it('executes rapid disable then enable in call order for the same alarm', async () => {
    const first = deferred<Date | null>(); const calls: boolean[] = [];
    const raw = fakeService(async value => { calls.push(value.enabled); if (calls.length === 1) return first.promise; return new Date(); });
    const service = serializeAlarmTuiService(raw);
    const disabling = service.sync({...alarm, enabled: false}); const enabling = service.sync({...alarm, enabled: true});
    await started(); expect(calls).toEqual([false]); first.resolve(null); await disabling; await enabling; expect(calls).toEqual([false, true]);
  });

  it('queues delete behind an unfinished install so cleanup is always last', async () => {
    const install = deferred<Date | null>(); const events: string[] = [];
    const raw = fakeService(async () => { events.push('sync-start'); await install.promise; events.push('sync-end'); return new Date(); });
    raw.remove = vi.fn(async () => { events.push('remove'); }); const service = serializeAlarmTuiService(raw);
    const syncing = service.sync(alarm); const removing = service.remove(alarm); await started(); expect(events).toEqual(['sync-start']);
    install.resolve(new Date()); await syncing; await removing; expect(events).toEqual(['sync-start', 'sync-end', 'remove']);
  });

  it('serializes syncAll items with existing per-alarm work', async () => {
    const first = deferred<Date | null>(); let count = 0; const raw = fakeService(async () => { count += 1; if (count === 1) return first.promise; return new Date(); }); raw.syncAll = vi.fn(async (alarms: readonly Alarm[]) => alarms.map(value => ({id: value.id, occurrence: new Date()}))); const service = serializeAlarmTuiService(raw);
    const direct = service.sync(alarm); const bulk = service.syncAll([{...alarm, enabled: false}]); await started(); expect(count).toBe(1); expect(raw.syncAll).not.toHaveBeenCalled(); first.resolve(new Date()); await direct; await bulk; expect(raw.syncAll).toHaveBeenCalledWith([expect.objectContaining({enabled: false})]);
  });
});

describe('actionable alarm health', () => {
  const entry = (change: Partial<{component:'scheduler'|'power'|'runner';healthy:boolean;occurrenceAt:string;updatedAt:string}> = {}) => ({alarmId:'wake',component:'scheduler' as const,healthy:true,message:'status',updatedAt:'2030-01-01T00:00:00.000Z',...change});
  it('ignores historical occurrence diagnostics and informational runner limitations', () => {
    const degraded = actionableDegradedAlarmIds([{alarmId:'wake',native:{healthy:true},health:[entry({component:'power',healthy:false,occurrenceAt:'2029-01-01T00:00:00.000Z'}),entry({component:'runner',healthy:false})]}]);
    expect(degraded.size).toBe(0);
  });
  it.each(['native','scheduler','guard'] as const)('marks a current %s failure degraded', failure => {
    const health = failure === 'scheduler' ? [entry({healthy:false})] : failure === 'guard' ? [entry({component:'power',healthy:false})] : [];
    expect(actionableDegradedAlarmIds([{alarmId:'wake',native:{healthy:failure !== 'native'},health}])).toEqual(new Set(['wake']));
  });
  it('uses only the latest current scheduler and Guard result', () => {
    const health=[entry({healthy:false,updatedAt:'2030-01-01T00:00:00Z'}),entry({healthy:true,updatedAt:'2030-01-01T00:01:00Z'}),entry({component:'power',healthy:false,updatedAt:'2030-01-01T00:00:00Z'}),entry({component:'power',healthy:true,updatedAt:'2030-01-01T00:01:00Z'})];
    expect(actionableDegradedAlarmIds([{alarmId:'wake',native:{healthy:true},health}]).size).toBe(0);
  });
});

function fakeService(sync: AlarmTuiService['sync']): AlarmTuiService { return {sync, syncAll: vi.fn(async () => []), remove: vi.fn(async () => undefined), runtimeStatus: vi.fn(async () => runtime), activeAlarms: vi.fn(async () => [])}; }
