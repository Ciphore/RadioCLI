import type {Alarm,AppSettings} from '../types.js';
import {connectActiveAlarms, type ActiveAlarmClient, type ActiveAlarmStatus} from '../alarms/active-session.js';
import {createSchedulerService, type SchedulerCapabilities} from '../alarms/scheduler.js';
import type {AlarmRuntimeHealthEntry} from '../alarms/runtime-health.js';
import {prepareAlarmTerminalAccess} from '../alarms/terminal-launcher.js';
import {verifyAlarmSetup,type AlarmVerificationReport,type AlarmVerificationUpdate} from '../alarms/setup-verification.js';

export type {AlarmVerificationReport} from '../alarms/setup-verification.js';

export type AlarmRuntimeSummary = {
  capabilities: SchedulerCapabilities;
  degradedAlarmIds: Set<string>;
  message: string;
};

export type TuiActiveAlarm = {
  key: string;
  status: ActiveAlarmStatus;
  dismiss(): Promise<void>;
  snooze(minutes: number): Promise<void>;
  keepPlaying(): Promise<void>;
  handoff?(): Promise<void>;
};

export type AlarmTuiService = {
  sync(alarm: Alarm): Promise<Date | null>;
  syncAll(alarms: readonly Alarm[]): Promise<Array<{id: string; occurrence: Date | null; error?: string}>>;
  remove(alarm: Alarm): Promise<void>;
  runtimeStatus(alarms: readonly Alarm[]): Promise<AlarmRuntimeSummary>;
  activeAlarms(): Promise<TuiActiveAlarm[]>;
  prepareTerminalAccess?():Promise<void>;
  verifySetup?(alarm:Alarm|undefined,settings:AppSettings,onUpdate:AlarmVerificationUpdate):Promise<AlarmVerificationReport>;
};

export function createAlarmTuiService(): AlarmTuiService {
  const scheduler = createSchedulerService();
  return serializeAlarmTuiService({
    sync: alarm => scheduler.sync(alarm),
    syncAll: alarms => scheduler.syncAll(alarms),
    async remove(alarm) {
      await scheduler.sync({...alarm, enabled: false});
      scheduler.health.remove(alarm.id);
    },
    async runtimeStatus(alarms) {
      const result = await scheduler.runtimeStatus(alarms);
      const degraded = actionableDegradedAlarmIds(result.alarms);
      const capabilities = result.capabilities;
      return {
        capabilities,
        degradedAlarmIds: degraded,
        message: capabilities.supported
          ? degraded.size ? `${degraded.size} alarm${degraded.size === 1 ? '' : 's'} need repair.` : 'Native scheduler ready.'
          : capabilities.message
      };
    },
    async activeAlarms() {
      const clients = await connectActiveAlarms();
      const statuses = await Promise.allSettled(clients.map(async client => ({client, status: await client.status()})));
      return statuses.flatMap(result => result.status === 'fulfilled' ? [activeView(result.value.client, result.value.status)] : []);
    },
    prepareTerminalAccess:()=>prepareAlarmTerminalAccess(),
    verifySetup:(alarm,settings,onUpdate)=>verifyAlarmSetup(scheduler,alarm,settings,onUpdate)
  });
}

export function actionableDegradedAlarmIds(items: ReadonlyArray<{alarmId:string;native:{healthy:boolean};health:AlarmRuntimeHealthEntry[]}>): Set<string> {
  const degraded = new Set<string>();
  for (const item of items) {
    const latestScheduler = latest(item.health.filter(entry => entry.component === 'scheduler' && !entry.occurrenceAt));
    const latestGuard = latest(item.health.filter(entry => entry.component === 'power' && !entry.occurrenceAt));
    if (!item.native.healthy || latestScheduler?.healthy === false || latestGuard?.healthy === false) degraded.add(item.alarmId);
  }
  return degraded;
}
function latest(entries: AlarmRuntimeHealthEntry[]): AlarmRuntimeHealthEntry | undefined { return entries.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0]; }

/** Serializes every mutation for one alarm while preserving concurrency across alarms. */
export function serializeAlarmTuiService(service: AlarmTuiService): AlarmTuiService {
  const queues = new Map<string, Promise<unknown>>();
  const enqueue = <T>(alarmId: string, work: () => Promise<T>): Promise<T> => {
    const previous = queues.get(alarmId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(work);
    queues.set(alarmId, current);
    void current.finally(() => { if (queues.get(alarmId) === current) queues.delete(alarmId); }).catch(() => undefined);
    return current;
  };
  return {
    sync: alarm => enqueue(alarm.id, () => service.sync(alarm)),
    syncAll: alarms => alarms.length === 0 ? service.syncAll([]) : Promise.all(alarms.map(alarm => enqueue(alarm.id, async () => {
      try {
        const [result] = await service.syncAll([alarm]);
        return result ?? {id: alarm.id, occurrence: null, error: 'Alarm sync returned no result.'};
      } catch (error) { return {id: alarm.id, occurrence: null, error: error instanceof Error ? error.message : String(error)}; }
    }))),
    remove: alarm => enqueue(alarm.id, () => service.remove(alarm)),
    runtimeStatus: alarms => service.runtimeStatus(alarms),
    activeAlarms: () => service.activeAlarms(),
    prepareTerminalAccess:()=>service.prepareTerminalAccess?.()??Promise.resolve(),
    verifySetup:service.verifySetup?(alarm,settings,onUpdate)=>service.verifySetup!(alarm,settings,onUpdate):undefined
  };
}

function activeView(client: ActiveAlarmClient, status: ActiveAlarmStatus): TuiActiveAlarm {
  return {
    key: `${status.alarmId}:${status.scheduledAt}`,
    status,
    dismiss: () => client.dismiss(),
    snooze: minutes => client.snooze(minutes),
    keepPlaying: () => client.keepPlaying(),
    handoff: () => client.handoff()
  };
}
