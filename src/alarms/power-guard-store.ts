import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import {platformPaths} from '../platform/paths.js';
import {dirname, join} from 'node:path';
import {z} from 'zod';
import type {AlarmPowerGuardState} from '../types.js';

const instantSchema = z.string()
  .refine(
    value => /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)),
    {message: 'Expected an absolute ISO-8601 alarm occurrence instant with Z or an offset.'}
  )
  .transform(value => new Date(value).toISOString());

const guardSchema: z.ZodType<AlarmPowerGuardState> = z.object({
  alarmId: z.string().min(1),
  occurrenceAt: instantSchema,
  status: z.enum(['requested', 'active', 'released', 'failed']),
  acquiredAt: instantSchema.optional(),
  releasedAt: instantSchema.optional(),
  message: z.string().max(1000).optional()
});

const fileSchema = z.object({version: z.literal(1), guards: z.array(guardSchema)});

/** Machine-local, non-portable state for one-shot power-inhibition requests. */
export class AlarmPowerGuardStore {
  readonly filePath: string;
  private readonly now: () => Date;

  constructor(filePath = defaultAlarmPowerGuardPath(), options: {now?: () => Date} = {}) {
    this.filePath = filePath;
    this.now = options.now ?? (() => new Date());
  }

  request(alarmId: string, occurrenceAt: string): AlarmPowerGuardState {
    const guard = guardSchema.parse({alarmId, occurrenceAt, status: 'requested'});
    return this.mutate(guards => [guard, ...guards.filter(item => item.alarmId !== alarmId)], guard.alarmId);
  }

  get(alarmId: string): AlarmPowerGuardState | undefined {
    const guard = this.read().find(item => item.alarmId === alarmId);
    return guard ? structuredClone(guard) : undefined;
  }

  list(): AlarmPowerGuardState[] {
    return structuredClone(this.read());
  }

  markActive(alarmId: string, acquiredAt = this.now(), occurrenceAt?: string): AlarmPowerGuardState {
    return this.update(alarmId, guard => ({
      ...assertGuardOccurrence(guard, occurrenceAt),
      status: 'active',
      acquiredAt: validDate(acquiredAt, 'power guard acquisition').toISOString(),
      releasedAt: undefined,
      message: undefined
    }));
  }

  markFailed(alarmId: string, message: string, occurrenceAt?: string): AlarmPowerGuardState {
    return this.update(alarmId, guard => ({...assertGuardOccurrence(guard, occurrenceAt), status: 'failed', message: message.trim()}));
  }

  markReleased(alarmId: string, releasedAt = this.now(), occurrenceAt?: string): AlarmPowerGuardState {
    return this.update(alarmId, guard => ({
      ...assertGuardOccurrence(guard, occurrenceAt),
      status: 'released',
      releasedAt: validDate(releasedAt, 'power guard release').toISOString()
    }));
  }

  clear(alarmId: string): boolean {
    const release = acquireFileLock(this.filePath);
    try {
      const guards = this.read();
      if (!guards.some(guard => guard.alarmId === alarmId)) return false;
      this.write(guards.filter(guard => guard.alarmId !== alarmId));
      return true;
    } finally {
      release();
    }
  }

  private update(
    alarmId: string,
    change: (guard: AlarmPowerGuardState) => AlarmPowerGuardState
  ): AlarmPowerGuardState {
    const release = acquireFileLock(this.filePath);
    try {
      const guards = this.read();
      const existing = guards.find(guard => guard.alarmId === alarmId);
      if (!existing) throw new Error(`Alarm power guard not found: ${alarmId}`);
      const updated = guardSchema.parse(change(existing));
      this.write(guards.map(guard => guard.alarmId === alarmId ? updated : guard));
      return structuredClone(updated);
    } finally {
      release();
    }
  }

  private mutate(
    change: (guards: AlarmPowerGuardState[]) => AlarmPowerGuardState[],
    resultId: string
  ): AlarmPowerGuardState {
    const release = acquireFileLock(this.filePath);
    try {
      const next = change(this.read());
      this.write(next);
      const result = next.find(guard => guard.alarmId === resultId);
      if (!result) throw new Error(`Alarm power guard not found after update: ${resultId}`);
      return structuredClone(result);
    } finally {
      release();
    }
  }

  private read(): AlarmPowerGuardState[] {
    if (!existsSync(this.filePath)) return [];
    try {
      return fileSchema.parse(JSON.parse(readFileSync(this.filePath, 'utf8'))).guards;
    } catch {
      const badPath = `${this.filePath}.bad`;
      rmSync(badPath, {force: true});
      renameSync(this.filePath, badPath);
      return [];
    }
  }

  private write(guards: AlarmPowerGuardState[]): void {
    mkdirSync(dirname(this.filePath), {recursive: true, mode: 0o700});
    const tempPath = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    try {
      writeFileSync(tempPath, `${JSON.stringify({version: 1, guards}, null, 2)}\n`, {encoding: 'utf8', mode: 0o600});
      renameSync(tempPath, this.filePath);
      if (process.platform !== 'win32') chmodSync(this.filePath, 0o600);
    } catch (error) {
      rmSync(tempPath, {force: true});
      throw error;
    }
  }
}

function defaultAlarmPowerGuardPath(): string {
  return join(platformPaths().alarmRuntime, 'alarm-power-guards.json');
}

function validDate(date: Date, label: string): Date {
  if (!Number.isFinite(date.getTime())) throw new Error(`Invalid ${label} time.`);
  return date;
}
function assertGuardOccurrence(guard:AlarmPowerGuardState,occurrenceAt?:string){if(occurrenceAt&&guard.occurrenceAt!==new Date(occurrenceAt).toISOString())throw new Error('Alarm power guard occurrence was superseded.');return guard;}

function acquireFileLock(filePath: string): () => void {
  const lockPath = `${filePath}.lock`;
  mkdirSync(dirname(filePath), {recursive: true, mode: 0o700});
  const deadline = Date.now() + 1000;
  while (true) {
    try {
      mkdirSync(lockPath, {mode: 0o700});
      return () => rmSync(lockPath, {recursive: true, force: true});
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > 10_000) {
          rmSync(lockPath, {recursive: true, force: true});
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() >= deadline) throw new Error(`Alarm power guard state is busy: ${filePath}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
}
