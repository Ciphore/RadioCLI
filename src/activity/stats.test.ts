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
      session('a', '2026-05-22T10:00:00.000Z', 3600, station),
      session('b', '2026-05-23T10:00:00.000Z', 1800, station),
      session('c', '2026-05-24T10:00:00.000Z', 900, station)
    ];

    const stats = computeListeningStats(sessions, new Date('2026-05-24T18:00:00.000Z'));
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
        startedAt: '2026-05-24T17:00:00.000Z',
        listenedSeconds: 0
      }
    ];

    const stats = computeListeningStats(sessions, new Date('2026-05-24T17:30:00.000Z'));
    expect(stats.totalSeconds).toBe(1800);
    expect(stats.currentStreak).toBe(1);
  });

  it('splits a session across day boundaries for the contribution graph', () => {
    const sessions: ListeningSession[] = [
      session('overnight', '2026-05-23T23:30:00.000Z', 5400, station)
    ];

    const stats = computeListeningStats(sessions, new Date('2026-05-24T18:00:00.000Z'));
    const may23 = stats.days.find(day => day.date === '2026-05-23');
    const may24 = stats.days.find(day => day.date === '2026-05-24');
    expect(may23?.seconds).toBe(1800);
    expect(may24?.seconds).toBe(3600);
    expect(stats.activeDays).toBe(2);
    expect(stats.currentStreak).toBe(2);
  });

  it('keeps all-time total listening separate from the visible 371-day graph window', () => {
    const sessions: ListeningSession[] = [
      session('old', '2024-12-01T12:00:00.000Z', 7200, station)
    ];

    const stats = computeListeningStats(sessions, new Date('2026-05-24T18:00:00.000Z'));
    expect(stats.totalSeconds).toBe(7200);
    expect(stats.activeDays).toBe(0);
  });
});

function session(id: string, startedAt: string, listenedSeconds: number, stationValue: Station): ListeningSession {
  return {
    id,
    station: stationValue,
    startedAt,
    endedAt: new Date(Date.parse(startedAt) + listenedSeconds * 1000).toISOString(),
    listenedSeconds
  };
}
