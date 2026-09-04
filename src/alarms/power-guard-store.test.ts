import {existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {AlarmPowerGuardStore} from './power-guard-store.js';

const roots: string[] = [];

describe('AlarmPowerGuardStore', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true});
  });

  it('persists the lifecycle of one concrete machine-local occurrence', () => {
    const file = temporaryGuardFile();
    const store = new AlarmPowerGuardStore(file, {now: () => new Date('2026-08-24T05:00:00.000Z')});

    store.request('alarm-1', '2026-08-24T13:00:00.000Z');
    expect(store.get('alarm-1')).toMatchObject({status: 'requested', occurrenceAt: '2026-08-24T13:00:00.000Z'});
    expect(new AlarmPowerGuardStore(file).list()).toHaveLength(1);

    store.markActive('alarm-1', new Date('2026-08-24T05:00:01.000Z'));
    expect(store.get('alarm-1')).toMatchObject({status: 'active', acquiredAt: '2026-08-24T05:00:01.000Z'});
    store.markReleased('alarm-1', new Date('2026-08-24T13:30:00.000Z'));
    expect(store.get('alarm-1')).toMatchObject({status: 'released', releasedAt: '2026-08-24T13:30:00.000Z'});
    expect(store.clear('alarm-1')).toBe(true);
    expect(store.clear('alarm-1')).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it('records failures without process or IPC secrets and writes mode 0600', () => {
    const file = temporaryGuardFile();
    const store = new AlarmPowerGuardStore(file);
    store.request('alarm-1', '2026-08-24T13:00:00.000Z');
    store.markFailed('alarm-1', 'Power inhibition unavailable');

    expect(store.get('alarm-1')).toMatchObject({status: 'failed', message: 'Power inhibition unavailable'});
    const raw = readFileSync(file, 'utf8');
    expect(raw).not.toMatch(/processId|pid|ipc|socket|token/i);
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('requires an absolute occurrence instant and normalizes offsets to UTC', () => {
    const file = temporaryGuardFile();
    const store = new AlarmPowerGuardStore(file);

    expect(store.request('alarm-1', '2026-08-24T06:00:00-07:00').occurrenceAt)
      .toBe('2026-08-24T13:00:00.000Z');
    expect(() => store.request('alarm-2', '2026-08-24T13:00:00')).toThrow(/absolute/i);
    expect(() => store.request('alarm-3', '2026-08-24')).toThrow(/absolute/i);
    expect(store.list().map(guard => guard.alarmId)).toEqual(['alarm-1']);
  });

  it('quarantines corrupt runtime state and starts empty', () => {
    const file = temporaryGuardFile();
    writeFileSync(file, '{broken', 'utf8');

    expect(new AlarmPowerGuardStore(file).list()).toEqual([]);
    expect(existsSync(`${file}.bad`)).toBe(true);
  });

  it('prevents an old guard process from overwriting its replacement occurrence',()=>{const store=new AlarmPowerGuardStore(temporaryGuardFile());store.request('alarm-1','2026-08-24T13:00:00Z');store.request('alarm-1','2026-08-25T13:00:00Z');expect(()=>store.markReleased('alarm-1',new Date(),'2026-08-24T13:00:00Z')).toThrow(/superseded/i);expect(store.get('alarm-1')).toMatchObject({status:'requested',occurrenceAt:'2026-08-25T13:00:00.000Z'});});
});

function temporaryGuardFile(): string {
  const root = mkdtempSync(join(tmpdir(), 'radiocli-guard-'));
  roots.push(root);
  return join(root, 'alarm-power-guards.json');
}
