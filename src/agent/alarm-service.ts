import type {Alarm, AlarmCreateInput, AlarmSchedule, IsoWeekday, Station} from '../types.js';
import {JsonLibraryStore} from '../storage/store.js';
import {canonicalizeAlarmTime, canonicalizeIsoWeekdays, canonicalizeTimeZone, nextOccurrenceForAlarm} from '../alarms/schedule.js';
import {connectActiveAlarms, type ActiveAlarmClient, type ActiveAlarmStatus} from '../alarms/active-session.js';
import {createSchedulerService, type SchedulerService} from '../alarms/scheduler.js';

type AgentAlarmSchedule =
  | {type: 'once'; at: string}
  | {type: 'recurring'; time: string; weekdays: IsoWeekday[]; timezone: string};

export type AgentAlarmCreate = {
  stationId: string;
  label?: string;
  enabled?: boolean;
  schedule: AgentAlarmSchedule;
  volume?: number;
  fadeSeconds?: number;
  stopAfterMinutes?: number;
  fallbackStationId?: string;
  missedRunGraceMinutes?: number;
  wakeIfSupported?: boolean;
  keepAwakeUntilAlarm?: boolean;
};

export type AgentAlarmUpdate = Partial<Omit<AgentAlarmCreate, 'stationId'>> & {
  stationId?: string;
  clearFallback?: boolean;
};

export class AgentAlarmService {
  constructor(
    private readonly store: JsonLibraryStore,
    private readonly resolveStation: (id: string) => Promise<Station | undefined>,
    private readonly scheduler: SchedulerService = createSchedulerService(),
    private readonly handoffToInteractive?: (status: ActiveAlarmStatus) => Promise<void>
  ) {}

  async list(): Promise<Record<string, unknown>[]> {
    return Promise.all(this.store.listAlarms().map(alarm => this.describe(alarm)));
  }

  async status(): Promise<Record<string, unknown>> {
    const alarms = this.store.listAlarms();
    return {
      active: await this.activeStatuses(),
      scheduler: await this.scheduler.runtimeStatus(alarms),
      alarms: await Promise.all(alarms.map(alarm => this.describe(alarm)))
    };
  }

  async create(input: AgentAlarmCreate): Promise<Record<string, unknown>> {
    const station = await this.requiredStation(input.stationId);
    const fallbackStation = input.fallbackStationId
      ? await this.requiredStation(input.fallbackStationId)
      : undefined;
    const alarmInput: AlarmCreateInput = {
      label: cleanLabel(input.label ?? station.name),
      enabled: input.enabled ?? true,
      station,
      schedule: normalizeSchedule(input.schedule),
      playback: {
        volume: boundedInteger(input.volume ?? 40, 'volume', 0, 100),
        fadeSeconds: boundedInteger(input.fadeSeconds ?? 0, 'fadeSeconds', 0, 3600),
        stopAfterMinutes: boundedInteger(input.stopAfterMinutes ?? 60, 'stopAfterMinutes', 1, 10080),
        ...(fallbackStation ? {fallbackStation} : {})
      },
      reliability: {
        missedRunGraceMinutes: boundedInteger(input.missedRunGraceMinutes ?? 10, 'missedRunGraceMinutes', 0, 10080),
        wakeIfSupported: input.wakeIfSupported ?? false,
        keepAwakeUntilAlarm: input.keepAwakeUntilAlarm ?? false
      }
    };
    const alarm = this.store.addAlarm(alarmInput);
    await this.syncSaved(alarm);
    return this.describe(alarm);
  }

  async update(id: string, input: AgentAlarmUpdate): Promise<Record<string, unknown>> {
    const alarm = this.requiredAlarm(id);
    const station = input.stationId ? await this.requiredStation(input.stationId) : alarm.station;
    const fallbackStation = input.clearFallback
      ? undefined
      : input.fallbackStationId ? await this.requiredStation(input.fallbackStationId) : alarm.playback.fallbackStation;
    const updated = this.store.updateAlarm(alarm.id, {
      label: input.label === undefined ? alarm.label : cleanLabel(input.label),
      enabled: input.enabled ?? alarm.enabled,
      station,
      schedule: input.schedule ? normalizeSchedule(input.schedule) : alarm.schedule,
      playback: {
        volume: boundedInteger(input.volume ?? alarm.playback.volume, 'volume', 0, 100),
        fadeSeconds: boundedInteger(input.fadeSeconds ?? alarm.playback.fadeSeconds, 'fadeSeconds', 0, 3600),
        stopAfterMinutes: boundedInteger(input.stopAfterMinutes ?? alarm.playback.stopAfterMinutes, 'stopAfterMinutes', 1, 10080),
        ...(fallbackStation ? {fallbackStation} : {})
      },
      reliability: {
        missedRunGraceMinutes: boundedInteger(input.missedRunGraceMinutes ?? alarm.reliability.missedRunGraceMinutes, 'missedRunGraceMinutes', 0, 10080),
        wakeIfSupported: input.wakeIfSupported ?? alarm.reliability.wakeIfSupported,
        keepAwakeUntilAlarm: input.keepAwakeUntilAlarm ?? alarm.reliability.keepAwakeUntilAlarm
      }
    });
    await this.syncSaved(updated);
    return this.describe(updated);
  }

  async setEnabled(id: string, enabled: boolean): Promise<Record<string, unknown>> {
    const alarm = this.store.toggleAlarm(this.requiredAlarm(id).id, enabled);
    await this.syncSaved(alarm);
    return this.describe(alarm);
  }

  async remove(id: string, confirm: boolean): Promise<{ok: true; removed: string}> {
    if (!confirm) throw new Error('Alarm removal requires confirm=true. List alarms first and confirm the exact alarm ID with the user.');
    const alarm = this.requiredAlarm(id);
    await this.scheduler.remove(alarm.id);
    if (!this.store.removeAlarm(alarm.id)) throw new Error(`Alarm not found: ${id}`);
    return {ok: true, removed: alarm.id};
  }

  async sync(): Promise<unknown> {
    return this.scheduler.syncAll(this.store.listAlarms());
  }

  async controlActive(input: {
    action: 'dismiss' | 'snooze' | 'keep-playing' | 'handoff';
    alarmId?: string;
    occurrenceAt?: string;
    snoozeMinutes?: number;
  }): Promise<{ok: true; action: string; alarm: Record<string, unknown>}> {
    const {client, status} = await this.selectActive(input.alarmId, input.occurrenceAt);
    if (input.action === 'dismiss') await client.dismiss();
    else if (input.action === 'keep-playing') await client.keepPlaying();
    else if (input.action === 'handoff') {
      if (status.state !== 'playing') throw new Error('Alarm playback is still starting.');
      if (!this.handoffToInteractive) throw new Error('Interactive playback handoff is unavailable.');
      await this.handoffToInteractive(status);
      await client.handoff();
    }
    else await client.snooze(boundedInteger(input.snoozeMinutes ?? 10, 'snoozeMinutes', 1, 1440));
    return {ok: true, action: input.action, alarm: activeStatusForAgent(status)};
  }

  private async describe(alarm: Alarm): Promise<Record<string, unknown>> {
    return {
      id: alarm.id,
      label: alarm.label,
      enabled: alarm.enabled,
      station: {id: `${alarm.station.provider}:${alarm.station.id}`, name: alarm.station.name},
      schedule: alarm.schedule,
      nextOccurrence: nextOccurrenceForAlarm(alarm, new Date())?.toISOString() ?? null,
      playback: {
        volume: alarm.playback.volume,
        fadeSeconds: alarm.playback.fadeSeconds,
        stopAfterMinutes: alarm.playback.stopAfterMinutes,
        ...(alarm.playback.fallbackStation ? {fallbackStation: {
          id: `${alarm.playback.fallbackStation.provider}:${alarm.playback.fallbackStation.id}`,
          name: alarm.playback.fallbackStation.name
        }} : {})
      },
      reliability: alarm.reliability,
      lastRun: alarm.lastRun,
      snoozedUntil: alarm.nextOverride?.at
    };
  }

  private async activeStatuses(): Promise<Record<string, unknown>[]> {
    return (await Promise.all((await connectActiveAlarms()).map(client => client.status()))).map(activeStatusForAgent);
  }

  private async selectActive(alarmId?: string, occurrenceAt?: string): Promise<{client: ActiveAlarmClient; status: ActiveAlarmStatus}> {
    const matches: Array<{client: ActiveAlarmClient; status: ActiveAlarmStatus}> = [];
    for (const client of await connectActiveAlarms()) {
      const status = await client.status();
      if ((!alarmId || status.alarmId === alarmId) && (!occurrenceAt || status.scheduledAt === occurrenceAt)) matches.push({client, status});
    }
    if (!matches.length) throw new Error('No matching alarm is currently ringing.');
    if (matches.length > 1) throw new Error('Multiple alarms are ringing. List alarm status, then provide alarm_id and optionally occurrence_at.');
    return matches[0]!;
  }

  private requiredAlarm(id: string): Alarm {
    const alarm = this.store.getAlarm(id);
    if (!alarm) throw new Error(`Alarm not found: ${id}`);
    return alarm;
  }

  private async requiredStation(id: string): Promise<Station> {
    const station = await this.resolveStation(id);
    if (!station) throw new Error(`Unknown station ID: ${id}. Search or browse first.`);
    return station;
  }

  private async syncSaved(alarm: Alarm): Promise<void> {
    try {
      await this.scheduler.sync(alarm);
    } catch (error) {
      throw new Error(`Alarm ${alarm.id} was saved, but scheduler setup is degraded: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function normalizeSchedule(schedule: AgentAlarmSchedule): AlarmSchedule {
  if (schedule.type === 'once') {
    const instant = new Date(schedule.at);
    if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(schedule.at) || !Number.isFinite(instant.getTime()) || instant.getUTCSeconds() !== 0 || instant.getUTCMilliseconds() !== 0) {
      throw new Error('One-time alarms require an absolute ISO-8601 minute with an offset or Z and zero seconds.');
    }
    if (instant.getTime() <= Date.now()) throw new Error('One-time alarms must be scheduled in the future.');
    return {type: 'once', at: instant.toISOString()};
  }
  return {
    type: 'recurring',
    time: canonicalizeAlarmTime(schedule.time),
    weekdays: canonicalizeIsoWeekdays(schedule.weekdays),
    timezone: canonicalizeTimeZone(schedule.timezone)
  };
}

function boundedInteger(value: number, label: string, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label} must be an integer from ${min} to ${max}.`);
  return value;
}

function cleanLabel(value: string): string {
  const label = value.trim();
  if (!label || label.length > 120 || /[\u0000-\u001F\u007F-\u009F]/.test(label)) throw new Error('Alarm label must be 1-120 printable characters.');
  return label;
}

function activeStatusForAgent(status: ActiveAlarmStatus): Record<string, unknown> {
  return {
    alarmId: status.alarmId,
    scheduledAt: status.scheduledAt,
    stationName: status.stationName,
    ...(status.station ? {station: {id: `${status.station.provider}:${status.station.id}`, name: status.station.name}} : {}),
    startedAt: status.startedAt,
    state: status.state,
    keepPlaying: status.keepPlaying
  };
}
