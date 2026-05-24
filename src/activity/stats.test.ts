import {describe, expect, it} from 'vitest';
import {computeListeningStats} from './stats.js';
import type {ListeningSession, Station} from '../types.js';

const station: Station = {
  id: 'station-1',
  provider: 'radio-browser',
  name: 'Night FM',
  tags: []
};

describe('computeListeningStats', () => {
  it('computes streaks, active days, total time, and favorite station', () => {
    const sessions: ListeningSession[] = [
      session('a', new Date(2026, 4, 22, 10), 3600, station),
      session('b', new Date(2026, 4, 23, 10), 1800, station),
      session('c', new Date(2026, 4, 24, 10), 900, station)
    ];

    const stats = computeListeningStats(sessions, new Date(2026, 4, 24, 18));
    expect(stats.sessions).toBe(3);
    expect(stats.activeDays).toBe(3);
    expect(stats.currentStreak).toBe(3);
    expect(stats.longestStreak).toBe(3);
    expect(stats.totalSeconds).toBe(6300);
    expect(stats.favoriteStation?.name).toBe('Night FM');
  });

  it('includes an active session up to now', () => {
    const sessions: ListeningSession[] = [
      {
        id: 'active',
        station,
        startedAt: new Date(2026, 4, 24, 17).toISOString(),
        listenedSeconds: 0
      }
    ];

    const stats = computeListeningStats(sessions, new Date(2026, 4, 24, 17, 30));
    expect(stats.totalSeconds).toBe(1800);
    expect(stats.currentStreak).toBe(1);
  });

  it('splits a session across local day boundaries for the contribution graph', () => {
    const previousDay = new Date(2026, 4, 23);
    const today = new Date(2026, 4, 24);
    const sessions: ListeningSession[] = [
      session('overnight', new Date(2026, 4, 23, 23, 30), 5400, station)
    ];

    const stats = computeListeningStats(sessions, new Date(2026, 4, 24, 18));
    const previousDayStats = stats.days.find(day => day.date === localDay(previousDay));
    const todayStats = stats.days.find(day => day.date === localDay(today));
    expect(previousDayStats?.seconds).toBe(1800);
    expect(todayStats?.seconds).toBe(3600);
    expect(stats.activeDays).toBe(2);
    expect(stats.currentStreak).toBe(2);
  });

  it('does not collapse late-night local listening into one UTC day', () => {
    const previousDay = new Date(2026, 4, 23);
    const today = new Date(2026, 4, 24);
    const sessions: ListeningSession[] = [
      session('late-previous-day', new Date(2026, 4, 23, 23, 15), 900, station),
      session('early-today', new Date(2026, 4, 24, 0, 45), 900, station)
    ];

    const stats = computeListeningStats(sessions, new Date(2026, 4, 24, 1, 5));
    expect(stats.days.find(day => day.date === localDay(previousDay))?.seconds).toBe(900);
    expect(stats.days.find(day => day.date === localDay(today))?.seconds).toBe(900);
    expect(stats.activeDays).toBe(2);
    expect(stats.currentStreak).toBe(2);
  });

  it('keeps all-time total listening separate from the visible 371-day graph window', () => {
    const sessions: ListeningSession[] = [
      session('old', new Date(2024, 11, 1, 12), 7200, station)
    ];

    const stats = computeListeningStats(sessions, new Date(2026, 4, 24, 18));
    expect(stats.totalSeconds).toBe(7200);
    expect(stats.activeDays).toBe(0);
  });
});

function session(id: string, startedAt: Date, listenedSeconds: number, stationValue: Station): ListeningSession {
  return {
    id,
    station: stationValue,
    startedAt: startedAt.toISOString(),
    endedAt: new Date(startedAt.getTime() + listenedSeconds * 1000).toISOString(),
    listenedSeconds
  };
}

function localDay(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}
