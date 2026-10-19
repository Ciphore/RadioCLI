import {describe, expect, it} from 'vitest';
import type {Alarm} from '../types.js';
import {AlarmOccurrenceCache} from './occurrence-cache.js';

const alarm = {id: 'morning', enabled: true, schedule: {type: 'recurring', time: '01:30',
  weekdays: [1,2,3,4,5,6,7], timezone: 'America/Los_Angeles'}} as Alarm;

describe('alarm occurrence cache', () => {
  it('expires at a DST fold occurrence, invalidates clock reversal, and isolates returned Dates', () => {
    const cache = new AlarmOccurrenceCache();
    const before = new Date('2026-11-01T08:00:00Z');
    const first = cache.next(alarm, before)!;
    expect(first.toISOString()).toBe('2026-11-01T08:30:00.000Z');
    first.setFullYear(1900);
    expect(cache.next(alarm, new Date('2026-11-01T08:01:00Z'))?.toISOString()).toBe('2026-11-01T08:30:00.000Z');
    expect(cache.next(alarm, new Date('2026-11-01T08:30:00Z'))?.toISOString()).toBe('2026-11-02T09:30:00.000Z');
    expect(cache.next(alarm, before)?.toISOString()).toBe('2026-11-01T08:30:00.000Z');
  });
  it('invalidates schedule, enabled, and snooze changes', () => {
    const cache = new AlarmOccurrenceCache();
    const now = new Date('2026-10-03T08:00:00Z');
    expect(cache.next(alarm, now)).not.toBeNull();
    expect(cache.next({...alarm, enabled: false}, now)).toBeNull();
    expect(cache.next({...alarm, nextOverride: {at: '2026-10-03T08:15:00Z', createdAt: now.toISOString(), reason: 'snooze'}}, now)?.toISOString()).toBe('2026-10-03T08:15:00.000Z');
    expect(cache.next({...alarm, schedule: {...alarm.schedule, type: 'once', at: '2026-10-03T09:00:00Z'}}, now)?.toISOString()).toBe('2026-10-03T09:00:00.000Z');
  });
});
