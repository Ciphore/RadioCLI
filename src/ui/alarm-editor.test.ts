import {describe, expect, it} from 'vitest';
import type {Station} from '../types.js';
import {adjustTime, alarmInputFromDraft, cycleWeekdays, defaultAlarmDraft, draftFromAlarm, draftNextOccurrence, toggleWeekday, validateAlarmDraft} from './alarm-editor.js';

const station: Station = {id: 'kexp', provider: 'radio-browser', name: 'KEXP', tags: ['indie'], streamUrl: 'https://example.test/live'};

describe('alarm editor model', () => {
  it('creates a useful local recurring default with reliability and playback settings', () => {
    const draft = defaultAlarmDraft(station, new Date('2026-08-22T12:00:00.000Z'));
    const input = alarmInputFromDraft(draft, new Date('2026-08-22T12:00:00.000Z'));
    expect(input.station).toEqual(station);
    expect(input.schedule.type).toBe('recurring');
    expect(input.playback).toMatchObject({volume: 70, fadeSeconds: 30, stopAfterMinutes: 60});
    expect(input.reliability).toMatchObject({missedRunGraceMinutes: 15, wakeIfSupported: true, keepAwakeUntilAlarm: false});
    expect(draftNextOccurrence(draft, new Date('2026-08-22T12:00:00.000Z'))).not.toBeNull();
  });

  it('validates missing stations, civil time, timezone, and past one-time alarms inline', () => {
    expect(validateAlarmDraft(defaultAlarmDraft(), new Date('2026-08-22T12:00:00.000Z'))).toBe('Choose a primary station.');
    expect(validateAlarmDraft({...defaultAlarmDraft(station), time: '25:90'})).toBe('Time must use 24-hour HH:mm.');
    expect(validateAlarmDraft({...defaultAlarmDraft(station), timezone: 'Mars/Olympus'})).toMatch('valid IANA timezone');
    expect(validateAlarmDraft({...defaultAlarmDraft(station), scheduleType: 'once', date: '2000-01-01', time: '00:00'})).toBe('One-time alarm must be in the future.');
  });

  it('cycles weekday presets and round-trips an existing alarm', () => {
    expect(cycleWeekdays('1,2,3,4,5', 1)).toBe('6,7');
    expect(cycleWeekdays('6,7', -1)).toBe('1,2,3,4,5');
    const input = alarmInputFromDraft(defaultAlarmDraft(station), new Date(0));
    const draft = draftFromAlarm({...input, id: 'alarm', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()});
    expect(draft.station?.name).toBe('KEXP');
    expect(draft.weekdays).toBe('1,2,3,4,5');
  });

  it('adjusts segmented time with wrapping and toggles individual weekdays', () => {
    expect(adjustTime('23:59', 'hour', 1)).toBe('00:59');
    expect(adjustTime('00:00', 'minute', -1)).toBe('00:59');
    expect(toggleWeekday('1,2,3,4,5', 2)).toBe('1,3,4,5');
    expect(toggleWeekday('1,3,4,5', 7)).toBe('1,3,4,5,7');
    expect(toggleWeekday('7', 7)).toBe('7');
  });

  it('rejects normalized dates and nonexistent or ambiguous one-time civil times', () => {
    const base = {...defaultAlarmDraft(station), scheduleType: 'once' as const, timezone: 'America/Los_Angeles'};
    expect(validateAlarmDraft({...base, date: '2027-02-30', time: '06:00'}, new Date(0))).toBe('Enter a real calendar date.');
    expect(validateAlarmDraft({...base, date: '2027-03-14', time: '02:30'}, new Date(0))).toMatch('does not exist');
    expect(validateAlarmDraft({...base, date: '2027-11-07', time: '01:30'}, new Date(0))).toMatch('occurs twice');
    const input = alarmInputFromDraft({...base, date: '2027-03-14', time: '03:30'}, new Date(0));
    expect(input.schedule).toEqual({type: 'once', at: '2027-03-14T10:30:00.000Z'});
  });
});
