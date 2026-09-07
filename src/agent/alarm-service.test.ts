import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {SchedulerService, type SchedulerAdapter} from '../alarms/scheduler.js';
import {startActiveAlarmSession} from '../alarms/active-session.js';
import {JsonLibraryStore} from '../storage/store.js';
import type {Station} from '../types.js';
import {AgentAlarmService} from './alarm-service.js';

const roots: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true}); });

describe('agent alarm service', () => {
  it('creates and schedules an alarm from an opaque station id', async () => {
    const {service, adapter, store} = fixture();
    const alarm = await service.create({
      stationId: 'radio-browser:station-1',
      label: 'Morning news',
      schedule: {type: 'recurring', time: '07:30', weekdays: [1, 2, 3, 4, 5], timezone: 'America/Los_Angeles'}
    });

    expect(alarm).toMatchObject({label: 'Morning news', enabled: true, station: {id: 'radio-browser:station-1'}});
    expect(adapter.install).toHaveBeenCalledOnce();
    expect(store.listAlarms()).toHaveLength(1);
  });

  it('requires explicit confirmation before removing the native job and definition', async () => {
    const {service, adapter, store} = fixture();
    const created = await service.create({
      stationId: 'radio-browser:station-1',
      schedule: {type: 'recurring', time: '07:30', weekdays: [1], timezone: 'UTC'}
    });
    const id = String(created.id);

    await expect(service.remove(id, false)).rejects.toThrow('confirm=true');
    expect(store.getAlarm(id)).toBeDefined();
    await expect(service.remove(id, true)).resolves.toEqual({ok: true, removed: id});
    expect(adapter.remove).toHaveBeenCalledWith(id);
    expect(store.getAlarm(id)).toBeUndefined();
  });

  it('rejects past or second-granularity one-time alarms before saving', async () => {
    const {service, store} = fixture();
    await expect(service.create({
      stationId: 'radio-browser:station-1',
      schedule: {type: 'once', at: '2020-01-01T10:00:30Z'}
    })).rejects.toThrow('absolute ISO-8601 minute');
    expect(store.listAlarms()).toHaveLength(0);
  });

  it('starts interactive playback before acknowledging an alarm handoff', async () => {
    const order: string[] = [];
    const {service, station} = fixture(async status => {
      expect(status.station).toEqual(station);
      order.push('interactive-ready');
    });
    const active = await startActiveAlarmSession({alarmId:'alarm-1',scheduledAt:'2030-01-01T08:00:00.000Z',stationName:station.name,station,startedAt:'2030-01-01T08:00:01.000Z',state:'playing'},{onDismiss:vi.fn(),onSnooze:vi.fn(),onKeepPlaying:vi.fn(),onHandoff:()=>{order.push('alarm-stopped');}});
    try {
      await service.controlActive({action:'handoff',alarmId:'alarm-1'});
      expect(order).toEqual(['interactive-ready','alarm-stopped']);
    } finally { await active.close(); }
  });

  it('leaves the alarm active when interactive handoff cannot start', async () => {
    const alarmStopped = vi.fn();
    const {service, station} = fixture(async () => { throw new Error('interactive failed'); });
    const active = await startActiveAlarmSession({alarmId:'alarm-1',scheduledAt:'2030-01-01T08:00:00.000Z',stationName:station.name,station,startedAt:'2030-01-01T08:00:01.000Z',state:'playing'},{onDismiss:vi.fn(),onSnooze:vi.fn(),onKeepPlaying:vi.fn(),onHandoff:alarmStopped});
    try {
      await expect(service.controlActive({action:'handoff',alarmId:'alarm-1'})).rejects.toThrow('interactive failed');
      expect(alarmStopped).not.toHaveBeenCalled();
    } finally { await active.close(); }
  });

  it('does not start an interactive handoff while the alarm is still resolving', async () => {
    const handoff = vi.fn(async () => undefined);
    const {service, station} = fixture(handoff);
    const active = await startActiveAlarmSession({alarmId:'alarm-1',scheduledAt:'2030-01-01T08:00:00.000Z',stationName:station.name,station,startedAt:'2030-01-01T08:00:01.000Z',state:'starting'},{onDismiss:vi.fn(),onSnooze:vi.fn(),onKeepPlaying:vi.fn(),onHandoff:vi.fn()});
    try {
      await expect(service.controlActive({action:'handoff',alarmId:'alarm-1'})).rejects.toThrow('still starting');
      expect(handoff).not.toHaveBeenCalled();
    } finally { await active.close(); }
  });
});

function fixture(handoffToInteractive?: ConstructorParameters<typeof AgentAlarmService>[3]) {
  const root = mkdtempSync(join(tmpdir(), 'radiocli-agent-alarm-'));
  roots.push(root);
  vi.stubEnv('RADIOCLI_HOME', root);
  const store = new JsonLibraryStore(join(root, 'library.json'));
  const station: Station = {id: 'station-1', provider: 'radio-browser', name: 'Test Radio', tags: []};
  const adapter: SchedulerAdapter = {
    capabilities: () => ({supported: true, exactWake: false, catchUpAfterWake: true, message: 'test'}),
    install: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    status: vi.fn(async () => ({installed: true, healthy: true, message: 'test'}))
  };
  const scheduler = new SchedulerService(adapter, () => new Date('2026-01-01T00:00:00Z'));
  const service = new AgentAlarmService(store, async id => id === 'radio-browser:station-1' ? station : undefined, scheduler, handoffToInteractive);
  return {service, adapter, store, station};
}
