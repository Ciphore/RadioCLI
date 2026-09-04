import type {Alarm, AlarmSchedule, IsoWeekday} from '../types.js';

export type ScheduledOccurrenceAssessment = 'pending' | 'due' | 'missed';
export const NATIVE_DISPATCH_TOLERANCE_MS = 30_000;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', {timeZone: timezone}).format();
    return timezone.trim().length > 0;
  } catch {
    return false;
  }
}

export function canonicalizeTimeZone(timezone: string): string {
  const value = timezone.trim();
  if (!isValidTimeZone(value)) {
    throw new Error(`Invalid IANA timezone: ${timezone}`);
  }
  return new Intl.DateTimeFormat('en-US', {timeZone: value}).resolvedOptions().timeZone;
}

export function canonicalizeAlarmTime(time: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  const hour = Number(match?.[1]);
  const minute = Number(match?.[2]);
  if (!match || !Number.isInteger(hour) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error(`Invalid alarm time: ${time}. Use HH:mm in 24-hour time.`);
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function canonicalizeIsoWeekdays(weekdays: readonly number[]): IsoWeekday[] {
  if (weekdays.length === 0 || weekdays.some(day => !Number.isInteger(day) || day < 1 || day > 7)) {
    throw new Error('Alarm weekdays must contain ISO weekday numbers from 1 (Monday) to 7 (Sunday).');
  }
  return [...new Set(weekdays)].sort((left, right) => left - right) as IsoWeekday[];
}

/**
 * Finds the next instant strictly after `now`.
 *
 * Recurring alarms are resolved from their civil date/time. During a spring DST
 * gap, the first valid minute following the gap is used. During a fall overlap,
 * the earlier of the two matching instants is used, so the occurrence fires once.
 */
export function nextAlarmOccurrence(schedule: AlarmSchedule, now: Date): Date | null {
  assertValidDate(now, 'now');
  if (schedule.type === 'once') {
    const occurrence = new Date(schedule.at);
    assertValidDate(occurrence, 'one-time alarm instant');
    if (occurrence.getUTCSeconds() !== 0 || occurrence.getUTCMilliseconds() !== 0) throw new Error('One-time alarms use minute precision; seconds must be zero.');
    return occurrence.getTime() > now.getTime() ? occurrence : null;
  }

  const timezone = canonicalizeTimeZone(schedule.timezone);
  const time = canonicalizeAlarmTime(schedule.time);
  const weekdays = new Set(canonicalizeIsoWeekdays(schedule.weekdays));
  const [hourText, minuteText] = time.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const localNow = zonedParts(now, timezone);

  for (let offset = 0; offset <= 7; offset += 1) {
    const date = addCivilDays(localNow, offset);
    if (!weekdays.has(isoWeekday(date.year, date.month, date.day))) continue;
    const occurrence = resolveCivilOccurrence({...date, hour, minute}, timezone);
    if (occurrence && occurrence.getTime() > now.getTime()) return occurrence;
  }
  return null;
}

export function nextOccurrenceForAlarm(alarm: Alarm, now: Date): Date | null {
  if (!alarm.enabled) return null;
  if (alarm.nextOverride) {
    const override = new Date(alarm.nextOverride.at);
    assertValidDate(override, 'alarm next override');
    if (override.getTime() > now.getTime()) return override;
  }
  return nextAlarmOccurrence(alarm.schedule, now);
}

export function assessScheduledOccurrence(
  scheduledAt: Date,
  now: Date,
  missedRunGraceMinutes: number
): ScheduledOccurrenceAssessment {
  assertValidDate(scheduledAt, 'scheduled occurrence');
  assertValidDate(now, 'now');
  if (!Number.isFinite(missedRunGraceMinutes) || missedRunGraceMinutes < 0) {
    throw new Error('Missed-run grace must be a non-negative number of minutes.');
  }
  const elapsed = now.getTime() - scheduledAt.getTime();
  if (elapsed < 0) return 'pending';
  return elapsed <= Math.max(NATIVE_DISPATCH_TOLERANCE_MS, missedRunGraceMinutes * 60_000) ? 'due' : 'missed';
}

type CivilParts = {year: number; month: number; day: number; hour: number; minute: number};
type CivilDate = Pick<CivilParts, 'year' | 'month' | 'day'>;

function zonedParts(instant: Date, timezone: string): CivilParts {
  let formatter = formatterCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    });
    formatterCache.set(timezone, formatter);
  }
  const values = Object.fromEntries(
    formatter.formatToParts(instant)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)])
  );
  return {
    year: values.year ?? 0,
    month: values.month ?? 0,
    day: values.day ?? 0,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0
  };
}

function resolveCivilOccurrence(target: CivilParts, timezone: string): Date | null {
  const estimate = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  const start = estimate - 18 * 60 * 60_000;
  const end = estimate + 18 * 60 * 60_000;
  let firstAfterGap: Date | null = null;

  for (let time = start; time <= end; time += 60_000) {
    const candidate = new Date(time);
    const local = zonedParts(candidate, timezone);
    if (!sameCivilDate(local, target)) continue;
    const comparison = compareCivilClock(local, target);
    if (comparison === 0) return candidate;
    if (comparison > 0 && firstAfterGap === null) firstAfterGap = candidate;
  }
  return firstAfterGap;
}

function addCivilDays(date: CivilDate, days: number): CivilDate {
  const result = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {year: result.getUTCFullYear(), month: result.getUTCMonth() + 1, day: result.getUTCDate()};
}

function isoWeekday(year: number, month: number, day: number): IsoWeekday {
  const sundayBased = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (sundayBased === 0 ? 7 : sundayBased) as IsoWeekday;
}

function sameCivilDate(left: CivilDate, right: CivilDate): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

function compareCivilClock(left: Pick<CivilParts, 'hour' | 'minute'>, right: Pick<CivilParts, 'hour' | 'minute'>): number {
  return left.hour * 60 + left.minute - (right.hour * 60 + right.minute);
}

function assertValidDate(date: Date, label: string): void {
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid ${label}.`);
}
