import type {Alarm, AlarmCreateInput, IsoWeekday, Station} from '../types.js';
import {nextAlarmOccurrence} from '../alarms/schedule.js';

export type AlarmDraft = {
  id?: string;
  label: string;
  enabled: boolean;
  station?: Station;
  scheduleType: 'once' | 'recurring';
  date: string;
  time: string;
  weekdays: string;
  timezone: string;
  volume: string;
  fadeSeconds: string;
  stopAfterMinutes: string;
  fallbackStation?: Station;
  missedRunGraceMinutes: string;
  wakeIfSupported: boolean;
  keepAwakeUntilAlarm: boolean;
};

export const alarmEditorFields = [
  'label', 'enabled', 'station', 'scheduleType', 'date', 'time', 'weekdays', 'timezone',
  'volume', 'fadeSeconds', 'stopAfterMinutes', 'fallbackStation', 'output',
  'missedRunGraceMinutes', 'wakeIfSupported', 'keepAwakeUntilAlarm', 'preview', 'save', 'cancel'
] as const;
export type AlarmEditorField = (typeof alarmEditorFields)[number];
export const alarmTextFields = new Set<AlarmEditorField>([
  'label', 'date', 'timezone'
]);

export type AlarmEditorControl = 'time' | 'weekdays' | 'number' | null;
export type TimeSegment = 'hour' | 'minute';

export function adjustTime(value: string, segment: TimeSegment, direction: 1 | -1): string {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  const hour = match ? Number(match[1]) : 0;
  const minute = match ? Number(match[2]) : 0;
  const nextHour = segment === 'hour' ? wrap(hour + direction, 24) : hour;
  const nextMinute = segment === 'minute' ? wrap(minute + direction, 60) : minute;
  return `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`;
}

export function toggleWeekday(value: string, weekday: IsoWeekday): string {
  const selected = new Set(parseWeekdayValues(value));
  if (selected.has(weekday)) {
    if (selected.size > 1) selected.delete(weekday);
  } else selected.add(weekday);
  return [...selected].sort((left, right) => left - right).join(',');
}

export function defaultAlarmDraft(station?: Station, now = new Date()): AlarmDraft {
  const future = new Date(now.getTime() + 5 * 60_000);
  future.setSeconds(0, 0);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return {
    label: station ? `Wake to ${station.name}` : 'Morning radio',
    enabled: true,
    station,
    scheduleType: 'recurring',
    date: localDate(future),
    time: localTime(future),
    weekdays: '1,2,3,4,5',
    timezone,
    volume: '70',
    fadeSeconds: '30',
    stopAfterMinutes: '60',
    missedRunGraceMinutes: '15',
    wakeIfSupported: true,
    keepAwakeUntilAlarm: false
  };
}

export function draftFromAlarm(alarm: Alarm): AlarmDraft {
  const once = alarm.schedule.type === 'once' ? new Date(alarm.schedule.at) : undefined;
  return {
    id: alarm.id,
    label: alarm.label,
    enabled: alarm.enabled,
    station: alarm.station,
    scheduleType: alarm.schedule.type,
    date: once ? localDate(once) : localDate(new Date()),
    time: alarm.schedule.type === 'once' ? localTime(once!) : alarm.schedule.time,
    weekdays: alarm.schedule.type === 'recurring' ? alarm.schedule.weekdays.join(',') : '1,2,3,4,5',
    timezone: alarm.schedule.type === 'recurring' ? alarm.schedule.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    volume: String(alarm.playback.volume),
    fadeSeconds: String(alarm.playback.fadeSeconds),
    stopAfterMinutes: String(alarm.playback.stopAfterMinutes),
    fallbackStation: alarm.playback.fallbackStation,
    missedRunGraceMinutes: String(alarm.reliability.missedRunGraceMinutes),
    wakeIfSupported: alarm.reliability.wakeIfSupported,
    keepAwakeUntilAlarm: Boolean(alarm.reliability.keepAwakeUntilAlarm)
  };
}

export function validateAlarmDraft(draft: AlarmDraft, now = new Date()): string | null {
  try {
    alarmInputFromDraft(draft, now);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function alarmInputFromDraft(draft: AlarmDraft, now = new Date()): AlarmCreateInput {
  const label = draft.label.trim();
  if (!label) throw new Error('Label is required.');
  if (!draft.station) throw new Error('Choose a primary station.');
  const volume = integer(draft.volume, 'Volume', 0, 100);
  const fadeSeconds = integer(draft.fadeSeconds, 'Fade', 0, 3600);
  const stopAfterMinutes = integer(draft.stopAfterMinutes, 'Stop after', 1, 10080);
  const missedRunGraceMinutes = integer(draft.missedRunGraceMinutes, 'Missed grace', 0, 10080);
  const schedule = draft.scheduleType === 'once'
    ? {type: 'once' as const, at: onceInstant(draft.date, draft.time, canonicalTimezone(draft.timezone))}
    : {
        type: 'recurring' as const,
        time: canonicalTime(draft.time),
        weekdays: parseWeekdays(draft.weekdays),
        timezone: canonicalTimezone(draft.timezone)
      };
  if (schedule.type === 'once' && new Date(schedule.at).getTime() <= now.getTime()) throw new Error('One-time alarm must be in the future.');
  return {
    label,
    enabled: draft.enabled,
    station: draft.station,
    schedule,
    playback: {volume, fadeSeconds, stopAfterMinutes, ...(draft.fallbackStation ? {fallbackStation: draft.fallbackStation} : {})},
    reliability: {missedRunGraceMinutes, wakeIfSupported: draft.wakeIfSupported, keepAwakeUntilAlarm: draft.keepAwakeUntilAlarm}
  };
}

export function draftNextOccurrence(draft: AlarmDraft, now = new Date()): Date | null {
  try { return nextAlarmOccurrence(alarmInputFromDraft({...draft, enabled: true}, new Date(0)).schedule, now); } catch { return null; }
}

export function cycleWeekdays(value: string, direction: 1 | -1): string {
  const presets = ['1,2,3,4,5', '6,7', '1,2,3,4,5,6,7'];
  const index = presets.indexOf(value);
  return presets[(index < 0 ? 0 : index + direction + presets.length) % presets.length]!;
}

function parseWeekdays(value: string): IsoWeekday[] {
  const days = [...new Set(value.split(',').map(part => Number(part.trim())))].sort((a, b) => a - b);
  if (!days.length || days.some(day => !Number.isInteger(day) || day < 1 || day > 7)) throw new Error('Weekdays use 1–7 (Monday–Sunday), separated by commas.');
  return days as IsoWeekday[];
}
function parseWeekdayValues(value: string): IsoWeekday[] {
  return value.split(',').map(Number).filter(day => Number.isInteger(day) && day >= 1 && day <= 7) as IsoWeekday[];
}
function wrap(value: number, size: number): number { return ((value % size) + size) % size; }
function canonicalTime(value: string): string { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('Time must use 24-hour HH:mm.'); return value; }
function canonicalTimezone(value: string): string { try { return new Intl.DateTimeFormat('en-US', {timeZone: value.trim()}).resolvedOptions().timeZone; } catch { throw new Error('Enter a valid IANA timezone, such as America/Los_Angeles.'); } }
function onceInstant(date: string, time: string, timezone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error('Date must use YYYY-MM-DD.');
  canonicalTime(time);
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const normalized = new Date(Date.UTC(year, month - 1, day));
  if (normalized.getUTCFullYear() !== year || normalized.getUTCMonth() + 1 !== month || normalized.getUTCDate() !== day) throw new Error('Enter a real calendar date.');
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  const estimate = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = civilFormatter(timezone);
  const probes = [estimate - 48 * 60 * 60_000, estimate, estimate + 48 * 60 * 60_000];
  const offsets = new Set(probes.map(timestamp => timezoneOffsetAt(timestamp, formatter)));
  const candidates = [...offsets].map(offset => new Date(estimate - offset)).filter(candidate => {
    const parts = civilParts(candidate, formatter);
    return parts.year === year && parts.month === month && parts.day === day && parts.hour === hour && parts.minute === minute;
  }).sort((left, right) => left.getTime() - right.getTime());
  if (candidates.length === 0) throw new Error('That local time does not exist because of a daylight-saving transition. Choose another time.');
  if (candidates.length > 1) throw new Error('That local time occurs twice because of a daylight-saving transition. Choose an unambiguous time.');
  return candidates[0]!.toISOString();
}
function civilFormatter(timezone: string): Intl.DateTimeFormat { return new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}); }
function civilParts(date: Date, formatter: Intl.DateTimeFormat): {year:number;month:number;day:number;hour:number;minute:number} {
  const values = Object.fromEntries(formatter.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  return {year: values.year ?? 0, month: values.month ?? 0, day: values.day ?? 0, hour: values.hour ?? 0, minute: values.minute ?? 0};
}
function timezoneOffsetAt(timestamp: number, formatter: Intl.DateTimeFormat): number { const parts = civilParts(new Date(timestamp), formatter); return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - timestamp; }
function integer(value: string, label: string, min: number, max: number): number { const number = Number(value); if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${label} must be ${min}–${max}.`); return number; }
function localDate(date: Date): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function localTime(date: Date): string { return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }
