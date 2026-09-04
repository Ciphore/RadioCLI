import {describe, expect, it} from 'vitest';
import {
  assessScheduledOccurrence,
  canonicalizeAlarmTime,
  canonicalizeIsoWeekdays,
  isValidTimeZone,
  nextAlarmOccurrence,
  nextOccurrenceForAlarm
} from './schedule.js';
import type {Alarm, AlarmSchedule} from '../types.js';

describe('alarm scheduling', () => {
  it('runs a one-time alarm once and never repeats', () => {
    const schedule: AlarmSchedule = {type: 'once', at: '2026-09-01T14:30:00.000Z'};

    expect(nextAlarmOccurrence(schedule, new Date('2026-09-01T14:29:59.000Z'))?.toISOString())
      .toBe('2026-09-01T14:30:00.000Z');
    expect(nextAlarmOccurrence(schedule, new Date('2026-09-01T14:30:00.000Z'))).toBeNull();
  });

  it('finds the next selected weekday at the requested civil time', () => {
    const schedule: AlarmSchedule = {
      type: 'recurring',
      time: '06:15',
      weekdays: [1, 3, 5],
      timezone: 'America/Los_Angeles'
    };

    expect(nextAlarmOccurrence(schedule, new Date('2026-08-24T14:00:00.000Z'))?.toISOString())
      .toBe('2026-08-26T13:15:00.000Z');
  });

  it('crosses month and year boundaries', () => {
    const schedule: AlarmSchedule = {
      type: 'recurring',
      time: '00:05',
      weekdays: [4],
      timezone: 'UTC'
    };

    expect(nextAlarmOccurrence(schedule, new Date('2026-12-31T00:06:00.000Z'))?.toISOString())
      .toBe('2027-01-07T00:05:00.000Z');
  });

  it('uses the explicit timezone rather than the host timezone', () => {
    const tokyo: AlarmSchedule = {type: 'recurring', time: '06:00', weekdays: [1], timezone: 'Asia/Tokyo'};
    const newYork: AlarmSchedule = {type: 'recurring', time: '06:00', weekdays: [1], timezone: 'America/New_York'};
    const now = new Date('2026-08-23T00:00:00.000Z');

    expect(nextAlarmOccurrence(tokyo, now)?.toISOString()).toBe('2026-08-23T21:00:00.000Z');
    expect(nextAlarmOccurrence(newYork, now)?.toISOString()).toBe('2026-08-24T10:00:00.000Z');
  });

  it('fires at the first valid instant after a spring-forward gap', () => {
    const schedule: AlarmSchedule = {
      type: 'recurring',
      time: '02:30',
      weekdays: [7],
      timezone: 'America/New_York'
    };

    expect(nextAlarmOccurrence(schedule, new Date('2026-03-08T00:00:00.000Z'))?.toISOString())
      .toBe('2026-03-08T07:00:00.000Z');
  });

  it('uses only the first instant in a fall-back overlap', () => {
    const schedule: AlarmSchedule = {
      type: 'recurring',
      time: '01:30',
      weekdays: [7],
      timezone: 'America/New_York'
    };

    expect(nextAlarmOccurrence(schedule, new Date('2026-11-01T00:00:00.000Z'))?.toISOString())
      .toBe('2026-11-01T05:30:00.000Z');
    expect(nextAlarmOccurrence(schedule, new Date('2026-11-01T05:30:00.000Z'))?.toISOString())
      .toBe('2026-11-08T06:30:00.000Z');
  });

  it('classifies occurrences inside and outside the missed-run grace window', () => {
    const scheduled = new Date('2026-08-24T13:00:00.000Z');
    expect(assessScheduledOccurrence(scheduled, new Date('2026-08-24T12:59:59.000Z'), 10)).toBe('pending');
    expect(assessScheduledOccurrence(scheduled, new Date('2026-08-24T13:10:00.000Z'), 10)).toBe('due');
    expect(assessScheduledOccurrence(scheduled, new Date('2026-08-24T13:10:00.001Z'), 10)).toBe('missed');
  });

  it('allows native dispatch jitter when grace is zero without treating late wake as due',()=>{const scheduled=new Date('2026-08-24T13:00:00Z');expect(assessScheduledOccurrence(scheduled,new Date('2026-08-24T13:00:30Z'),0)).toBe('due');expect(assessScheduledOccurrence(scheduled,new Date('2026-08-24T13:00:30.001Z'),0)).toBe('missed');});

  it('uses a future snooze exactly once ahead of the recurring schedule', () => {
    const alarm: Alarm = {
      id: 'snoozed',
      label: 'Snoozed alarm',
      enabled: true,
      station: {id: 'station', provider: 'radio-browser', name: 'Station', tags: []},
      schedule: {type: 'recurring', time: '06:00', weekdays: [1], timezone: 'UTC'},
      playback: {volume: 40, fadeSeconds: 0, stopAfterMinutes: 30},
      reliability: {missedRunGraceMinutes: 10, wakeIfSupported: false},
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-24T06:00:00.000Z',
      nextOverride: {
        at: '2026-08-24T06:10:00.000Z',
        createdAt: '2026-08-24T06:00:00.000Z',
        reason: 'snooze'
      }
    };

    expect(nextOccurrenceForAlarm(alarm, new Date('2026-08-24T06:05:00.000Z'))?.toISOString())
      .toBe('2026-08-24T06:10:00.000Z');
    expect(nextOccurrenceForAlarm(alarm, new Date('2026-08-24T06:10:00.000Z'))?.toISOString())
      .toBe('2026-08-31T06:00:00.000Z');
  });

  it('validates and canonicalizes timezones, times, and ISO weekdays', () => {
    expect(isValidTimeZone('America/Los_Angeles')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(canonicalizeAlarmTime('6:05')).toBe('06:05');
    expect(canonicalizeIsoWeekdays([7, 1, 1, 5])).toEqual([1, 5, 7]);
    expect(() => canonicalizeAlarmTime('24:00')).toThrow(/time/i);
    expect(() => canonicalizeAlarmTime('noon')).toThrow(/time/i);
    expect(() => canonicalizeIsoWeekdays([])).toThrow(/weekday/i);
    expect(() => canonicalizeIsoWeekdays([0, 8])).toThrow(/weekday/i);
  });
});
