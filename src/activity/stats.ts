import type {ListeningSession, Station} from '../types.js';
import {stationKey} from '../storage/store.js';

export type DailyListening = {
  date: string;
  seconds: number;
};

export type ListeningStats = {
  favoriteStation: Station | null;
  favoriteSeconds: number;
  sessions: number;
  currentStreak: number;
  activeDays: number;
  totalTrackedDays: number;
  totalSeconds: number;
  longestStreak: number;
  days: DailyListening[];
};

const dayMs = 24 * 60 * 60 * 1000;
const trackedDays = 371;

export function computeListeningStats(sessions: ListeningSession[], now = new Date()): ListeningStats {
  const today = startOfUtcDay(now);
  const firstDay = new Date(today.getTime() - (trackedDays - 1) * dayMs);
  const lastDayEnd = new Date(today.getTime() + dayMs);
  const secondsByDay = new Map<string, number>();
  const secondsByStation = new Map<string, {station: Station; seconds: number}>();
  let totalSeconds = 0;

  for (const session of sessions) {
    const seconds = sessionSeconds(session, now);
    if (seconds <= 0) {
      continue;
    }

    totalSeconds += seconds;
    for (const allocation of splitSessionByDay(session, seconds, firstDay, lastDayEnd, now)) {
      secondsByDay.set(allocation.date, (secondsByDay.get(allocation.date) ?? 0) + allocation.seconds);
    }

    const key = stationKey(session.station);
    const current = secondsByStation.get(key) ?? {station: session.station, seconds: 0};
    secondsByStation.set(key, {station: current.station, seconds: current.seconds + seconds});
  }

  const days = Array.from({length: trackedDays}, (_, index) => {
    const date = new Date(firstDay.getTime() + index * dayMs);
    const key = isoDay(date);
    return {date: key, seconds: secondsByDay.get(key) ?? 0};
  });

  const activeDays = days.filter(day => day.seconds > 0).length;
  const favorite = [...secondsByStation.values()].sort((a, b) => b.seconds - a.seconds)[0] ?? null;

  return {
    favoriteStation: favorite?.station ?? null,
    favoriteSeconds: favorite?.seconds ?? 0,
    sessions: sessions.length,
    currentStreak: currentStreak(days),
    activeDays,
    totalTrackedDays: trackedDays,
    totalSeconds,
    longestStreak: longestStreak(days),
    days
  };
}

function sessionSeconds(session: ListeningSession, now = new Date()): number {
  const started = Date.parse(session.startedAt);
  const ended = session.endedAt ? Date.parse(session.endedAt) : now.getTime();
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended <= started) {
    return Math.max(0, Math.round(session.listenedSeconds));
  }

  return Math.max(Math.round(session.listenedSeconds), Math.round((ended - started) / 1000));
}

function isoDay(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

function splitSessionByDay(
  session: ListeningSession,
  seconds: number,
  firstDay: Date,
  lastDayEnd: Date,
  now: Date
): DailyListening[] {
  const started = Date.parse(session.startedAt);
  if (!Number.isFinite(started)) {
    return [];
  }

  const recordedEnd = session.endedAt ? Date.parse(session.endedAt) : now.getTime();
  const rawEnd = Number.isFinite(recordedEnd) && recordedEnd > started
    ? recordedEnd
    : started + seconds * 1000;
  const end = Math.max(started, rawEnd);
  const boundedStart = Math.max(started, firstDay.getTime());
  const boundedEnd = Math.min(end, lastDayEnd.getTime());
  if (boundedEnd <= boundedStart) {
    return [];
  }

  const allocations: DailyListening[] = [];
  let cursor = boundedStart;
  while (cursor < boundedEnd) {
    const dayStart = startOfUtcDay(new Date(cursor)).getTime();
    const nextDay = dayStart + dayMs;
    const segmentEnd = Math.min(nextDay, boundedEnd);
    allocations.push({
      date: isoDay(new Date(cursor)),
      seconds: Math.round((segmentEnd - cursor) / 1000)
    });
    cursor = segmentEnd;
  }

  return allocations;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function currentStreak(days: DailyListening[]): number {
  let streak = 0;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index]!.seconds <= 0) {
      break;
    }
    streak += 1;
  }
  return streak;
}

function longestStreak(days: DailyListening[]): number {
  let longest = 0;
  let current = 0;
  for (const day of days) {
    if (day.seconds > 0) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}
