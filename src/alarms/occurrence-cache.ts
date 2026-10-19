import type {Alarm} from '../types.js';
import {nextOccurrenceForAlarm} from './schedule.js';

/** Reuse civil-time work until its result expires; clock reversals invalidate it. */
export class AlarmOccurrenceCache {
  private readonly entries = new Map<string, {fingerprint: string; computedAt: number; at: number | null}>();

  constructor(private readonly limit = 512) {}

  next(alarm: Alarm, now: Date): Date | null {
    const time = now.getTime();
    const fingerprint = JSON.stringify([alarm.enabled, alarm.schedule, alarm.nextOverride?.at]);
    const cached = this.entries.get(alarm.id);
    if (cached && cached.fingerprint === fingerprint && time >= cached.computedAt && (cached.at === null || cached.at > time)) {
      this.entries.delete(alarm.id);
      this.entries.set(alarm.id, cached);
      return cached.at === null ? null : new Date(cached.at);
    }
    const occurrence = nextOccurrenceForAlarm(alarm, now);
    this.entries.delete(alarm.id);
    this.entries.set(alarm.id, {fingerprint, computedAt: time, at: occurrence?.getTime() ?? null});
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
    return occurrence;
  }
}
