import {platformPaths} from '../platform/paths.js';
import {assertStorageWritable} from '../platform/storage.js';
import {chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {
  defaultReceiverStyle,
  receiverStyleNames,
  themeNames,
  type Alarm,
  type AlarmCreateInput,
  type AlarmRunRecord,
  type AppSettings,
  type IsoWeekday,
  type LibraryState,
  type ListeningSession,
  type Station,
  type TrackPlay,
  type UpdateCheckState
} from '../types.js';
import {canonicalizeAlarmTime, canonicalizeIsoWeekdays, canonicalizeTimeZone} from '../alarms/schedule.js';
import {migrateReceiverStyle} from '../ui/visualizers/receiver-style-registry.js';
import {migrateStationIdentity} from './station-identity.js';
import {stationSchema} from './station-schema.js';
import {acquireFileLock} from './file-lock.js';
import {replaceFileSync} from './replace-file.js';


const defaultMediaKeys = {
  previous: [],
  playPause: [],
  next: []
};

const MAX_ALARMS = 500;

// Keep the shared library readable by pre-scene releases whose background MCP
// workers quarantine an entire library when they see an unfamiliar enum value.
// Crossfade is the last style understood by those releases. New styles live in
// a separate preference file that old writers never read or overwrite.
const sharedLibraryReceiverStyles = new Set(receiverStyleNames.slice(0, receiverStyleNames.indexOf('crossfade') + 1));
const receiverPreferenceSchema = z.object({
  version: z.literal(1),
  receiverStyle: z.preprocess(migrateReceiverStyle, z.enum(receiverStyleNames)),
  libraryReceiverStyle: z.literal('ultracode')
});

const settingsSchema: z.ZodType<AppSettings> = z.object({
  theme: z.enum(themeNames).default('green'),
  receiverStyle: z.preprocess(
    migrateReceiverStyle,
    z.enum(receiverStyleNames).default(defaultReceiverStyle)
  ),
  receiverStyleVersion: z.number().optional(),
  volume: z.number().min(0).max(100).default(70),
  enableRadioGarden: z.boolean().default(false),
  enableNearbyLocation: z.boolean().default(true),
  shareDirectoryVotes: z.boolean().default(true),
  preferredBackend: z.enum(['auto', 'mpv', 'ffplay', 'vlc', 'airplay']).default('auto'),
  preferredAirPlayDevice: z.string().min(1).optional(),
  linuxAirPlayEnabled: z.boolean().optional(),
  tuneTimeoutSeconds: z.number().min(3).max(45).default(12),
  skipBrokenStreams: z.boolean().default(true),
  mediaKeys: z
    .object({
      previous: z.array(z.string()).default([]),
      playPause: z.array(z.string()).default([]),
      next: z.array(z.string()).default([])
    })
    .default(defaultMediaKeys),
  resumeOnLaunch: z.boolean().default(false),
  transparentBackground: z.boolean().default(false),
  asciiMode: z.boolean().default(false),
  reduceMotion: z.boolean().default(false),
  mouseSupport: z.boolean().default(true),
  automaticUpdateChecks: z.boolean().default(true),
  desktopMediaControls: z.enum(['auto', 'on', 'off']).default('auto'),
  agentControl: z.object({
    enabled: z.boolean().default(false),
    openUiOnPlay: z.boolean().default(true),
    focusNowPlaying: z.boolean().default(true),
    completionPreset: z.object({
      action: z.enum(['play', 'pause', 'resume', 'stop']).default('play'),
      source: z.enum(['recent', 'favorite', 'popular', 'country']).default('recent'),
      countryCode: z.string().length(2).optional(),
      ifPlaying: z.enum(['keep', 'replace']).default('keep'),
      openUi: z.boolean().optional()
    }).default({action: 'play', source: 'recent', ifPlaying: 'keep'})
  }).default({
    enabled: false,
    openUiOnPlay: true,
    focusNowPlaying: true,
    completionPreset: {action: 'play', source: 'recent', ifPlaying: 'keep'}
  })
});

const absoluteInstantSchema = z.string().refine(
  value => /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)),
  {message: 'Expected an absolute ISO-8601 instant with a timezone offset.'}
);
const alarmMinuteInstantSchema = absoluteInstantSchema.refine(value => new Date(value).getUTCSeconds() === 0 && new Date(value).getUTCMilliseconds() === 0,{message:'Alarm occurrences use minute precision; seconds must be zero.'});

const alarmScheduleSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('once'), at: alarmMinuteInstantSchema}),
  z.object({
    type: z.literal('recurring'),
    time: z.string().refine(value => {
      try {
        canonicalizeAlarmTime(value);
        return true;
      } catch {
        return false;
      }
    }, {message: 'Invalid alarm time; expected HH:mm.'}),
    weekdays: z.array(
      z.number().int().min(1).max(7).transform(value => value as IsoWeekday)
    ).min(1, 'Choose at least one ISO weekday.'),
    timezone: z.string().refine(value => {
      try {
        canonicalizeTimeZone(value);
        return true;
      } catch {
        return false;
      }
    }, {message: 'Invalid IANA timezone.'})
  })
]);

const alarmPlaybackSchema = z.object({
  volume: z.number().int().min(0).max(100),
  fadeSeconds: z.number().int().min(0).max(3600),
  stopAfterMinutes: z.number().int().min(1).max(7 * 24 * 60),
  fallbackStation: stationSchema.optional()
});

const alarmReliabilitySchema = z.object({
  missedRunGraceMinutes: z.number().int().min(0).max(7 * 24 * 60),
  wakeIfSupported: z.boolean(),
  keepAwakeUntilAlarm: z.boolean().default(false)
});

const alarmRunRecordSchema: z.ZodType<AlarmRunRecord> = z.object({
  status: z.enum(['played', 'failed', 'missed', 'dismissed']),
  scheduledAt: absoluteInstantSchema,
  firedAt: absoluteInstantSchema.optional(),
  finishedAt: absoluteInstantSchema.optional(),
  message: z.string().max(1000).optional()
});

const alarmSchema: z.ZodType<Alarm> = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  station: stationSchema,
  schedule: alarmScheduleSchema,
  playback: alarmPlaybackSchema,
  reliability: alarmReliabilitySchema,
  createdAt: absoluteInstantSchema,
  updatedAt: absoluteInstantSchema,
  lastRun: alarmRunRecordSchema.optional(),
  nextOverride: z.object({
    at: alarmMinuteInstantSchema,
    createdAt: absoluteInstantSchema,
    reason: z.literal('snooze')
  }).optional()
});

const alarmArraySchema = z.array(alarmSchema)
  .max(MAX_ALARMS, `RadioCLI supports at most ${MAX_ALARMS} alarms.`)
  .superRefine((alarms, context) => {
  const seen = new Set<string>();
  for (const [index, alarm] of alarms.entries()) {
    if (seen.has(alarm.id)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate alarm ID: ${alarm.id}`,
        path: [index, 'id']
      });
    }
    seen.add(alarm.id);
  }
  });

const librarySchema: z.ZodType<LibraryState> = z.object({
  recent: z
    .array(
      z.object({
        station: stationSchema,
        playedAt: z.string()
      })
    )
    .default([]),
  favorites: z.array(stationSchema).default([]),
  presets: z.array(z.object({
    name: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/),
    station: stationSchema
  })).max(200).default([]),
  imported: z.array(stationSchema).default([]),
  trackHistory: z
    .array(
      z.object({
        title: z.string(),
        stationKey: z.string(),
        stationName: z.string(),
        at: z.string()
      })
    )
    .default([]),
  searchHistory: z.array(z.string()).default([]),
  alarms: alarmArraySchema.default([]),
  updateCheck: z
    .object({
      checkedAt: z.string(),
      currentVersion: z.string(),
      latestVersion: z.string().optional(),
      updateAvailable: z.boolean(),
      error: z.string().optional()
    })
    .optional(),
  activity: z
    .object({
      sessions: z
        .array(
          z.object({
            id: z.string(),
            station: stationSchema,
            startedAt: z.string(),
            endedAt: z.string().optional(),
            lastActiveAt: z.string().optional(),
            listenedSeconds: z.number().min(0)
          })
        )
        .default([])
    })
    .default({sessions: []}),
  settings: settingsSchema.default({
    theme: 'green',
    receiverStyle: defaultReceiverStyle,
    receiverStyleVersion: 2,
    volume: 70,
    enableRadioGarden: false,
    enableNearbyLocation: true,
    shareDirectoryVotes: true,
    preferredBackend: 'auto',
    tuneTimeoutSeconds: 12,
    skipBrokenStreams: true,
    mouseSupport: true,
    automaticUpdateChecks: true,
    agentControl: {
      enabled: false,
      openUiOnPlay: true,
      focusNowPlaying: true,
      completionPreset: {action: 'play', source: 'recent', ifPlaying: 'keep'}
    },
    mediaKeys: defaultMediaKeys
  })
});

const libraryBackupSchema = z.object({
  format: z.literal('radiocli-backup'),
  version: z.literal(1),
  exportedAt: z.string(),
  library: librarySchema
});
const legacyLibraryBackupSchema = z.object({settings: z.unknown()}).passthrough();

export type LibraryImportResult = {
  state: LibraryState;
  sourcePath: string;
  safetyBackupPath?: string;
};

export class JsonLibraryStore {
  readonly filePath: string;
  private state: LibraryState;
  private readonly idGenerator: () => string;
  private readonly now: () => Date;
  private revision = '';

  constructor(
    filePath = defaultLibraryPath(),
    options: {idGenerator?: () => string; now?: () => Date} = {}
  ) {
    this.filePath = filePath;
    this.idGenerator = options.idGenerator ?? randomUUID;
    this.now = options.now ?? (() => new Date());
    this.revision = this.diskRevision();
    this.state = this.read();
    // Normalize libraries saved by an earlier preview before any legacy
    // background reader encounters its new enum value again.
    if (!sharedLibraryReceiverStyles.has(this.state.settings.receiverStyle) && !existsSync(this.receiverPreferencePath())) this.commit(this.state);
  }

  snapshot(): LibraryState {
    this.refresh();
    return this.cachedSnapshot();
  }

  cachedSnapshot(): LibraryState {
    return structuredClone(this.state);
  }

  /** Refresh atomically replaced files without recovering a live listening session. */
  refresh(): boolean {
    const revision = this.diskRevision();
    if (revision === this.revision) return false;
    const next = this.readForCurrentSession();
    this.state = next;
    this.revision = revision;
    return true;
  }

  settings(): AppSettings {
    this.refresh();
    return structuredClone(this.state.settings);
  }

  private diskRevision(): string {
    return [this.filePath, this.receiverPreferencePath()].map(file => {
      try {
        const info = statSync(file, {bigint: true});
        return `${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
        throw storageError('read the RadioCLI library', error);
      }
    }).join('|');
  }

  savePreset(name: string, station: Station): void {
    this.refresh();
    const key = normalizePresetName(name);
    const presets = this.state.presets ?? [];
    if (presets.length >= 200 && !presets.some(preset => preset.name === key)) throw new Error('RadioCLI supports at most 200 station presets. Remove one with radiocli preset remove <name>.');
    this.commit({...this.state, presets: [{name: key, station}, ...presets.filter(preset => preset.name !== key)]});
  }

  removePreset(name: string): void {
    this.refresh();
    const key = normalizePresetName(name);
    const presets = this.state.presets ?? [];
    if (!presets.some(preset => preset.name === key)) throw new Error(`No preset named ${key}. Run radiocli presets to see saved names.`);
    this.commit({...this.state, presets: presets.filter(preset => preset.name !== key)});
  }

  exportBackup(requestedPath?: string): string {
    this.refresh();
    const targetPath = requestedPath?.trim()
      ? resolveUserPath(requestedPath)
      : resolve(process.cwd(), `radiocli-backup-${fileTimestamp(new Date())}.json`);
    if (resolve(targetPath) === resolve(this.filePath)) {
      throw new Error('Choose a backup path different from the active RadioCLI library.');
    }
    if (existsSync(targetPath)) {
      throw new Error(`Backup already exists: ${targetPath}`);
    }

    writeJsonAtomically(targetPath, {
      format: 'radiocli-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      library: libraryStateForDisk(this.state)
    });
    return targetPath;
  }

  importBackup(requestedPath: string): LibraryImportResult {
    if (!requestedPath.trim()) {
      throw new Error('Choose a RadioCLI backup JSON file to import.');
    }

    const sourcePath = resolveUserPath(requestedPath);
    const sourceSize = statSync(sourcePath).size;
    if (sourceSize > 25 * 1024 * 1024) {
      throw new Error('RadioCLI backup is larger than the 25 MB safety limit.');
    }

    const parsed = JSON.parse(readFileSync(sourcePath, 'utf8')) as unknown;
    const backupResult = libraryBackupSchema.safeParse(parsed);
    if (!backupResult.success && isRadioCliBackup(parsed)) throw backupResult.error;
    const importedState = migrateLibraryState(backupResult.success
      ? backupResult.data.library
      : librarySchema.parse(legacyLibraryBackupSchema.parse(parsed)));

    const release = acquireStoreLock(this.filePath);
    try {
      const safetyBackupPath = existsSync(this.filePath)
        ? `${this.filePath}.before-import-${fileTimestamp(new Date())}.bak`
        : undefined;
      if (safetyBackupPath) {
        // Another TUI or background player may have saved since this owner
        // last refreshed. Preserve its latest data while holding the lock.
        writeJsonAtomically(safetyBackupPath, libraryStateForDisk(this.read()));
      }
      this.write(importedState);
      this.state = importedState;
      return {state: this.snapshot(), sourcePath, safetyBackupPath};
    } finally {
      release();
    }
  }

  updateSettings(settings: Partial<AppSettings>): LibraryState {
    this.refresh();
    return this.commit({
      ...this.state,
      settings: {
        ...this.state.settings,
        ...settings,
        receiverStyleVersion: settings.receiverStyle ? 2 : this.state.settings.receiverStyleVersion
      }
    });
  }

  updateCheckState(updateCheck: UpdateCheckState): LibraryState {
    this.refresh();
    return this.commit({...this.state, updateCheck});
  }

  addAlarm(input: AlarmCreateInput): Alarm {
    const release = acquireStoreLock(this.filePath);
    try {
      const latestState = this.readForCurrentSession();
      if (latestState.alarms.length >= MAX_ALARMS) {
        throw new Error(`RadioCLI supports at most ${MAX_ALARMS} alarms.`);
      }
      const existingIds = new Set([...this.state.alarms, ...latestState.alarms].map(alarm => alarm.id));
      let id: string | undefined;
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const candidate = this.idGenerator();
        if (candidate && !existingIds.has(candidate)) {
          id = candidate;
          break;
        }
      }
      if (!id) throw new Error('Unable to allocate a unique alarm ID after 100 attempts.');
      const timestamp = this.now().toISOString();
      const alarm = normalizeAlarm(alarmSchema.parse({
        ...input,
        id,
        createdAt: timestamp,
        updatedAt: timestamp
      }));
      const nextState = {...this.state, alarms: [alarm, ...this.state.alarms]};
      const mergedState = mergeLibraryChanges(this.state, latestState, nextState);
      this.write(mergedState);
      this.state = mergedState;
      return structuredClone(alarm);
    } finally {
      release();
    }
  }

  updateAlarm(
    id: string,
    updates: Partial<Pick<Alarm, 'label' | 'enabled' | 'station' | 'schedule' | 'playback' | 'reliability'>>
  ): Alarm {
    return this.mutateAlarm(id, existing => normalizeAlarm(alarmSchema.parse({
      ...existing,
      ...updates,
      updatedAt: this.now().toISOString()
    })));
  }

  removeAlarm(id: string): boolean {
    const release = acquireStoreLock(this.filePath);
    try {
      const latestState = this.readForCurrentSession();
      if (!latestState.alarms.some(alarm => alarm.id === id)) {
        this.state = latestState;
        return false;
      }
      const nextState = {...latestState, alarms: latestState.alarms.filter(alarm => alarm.id !== id)};
      this.write(nextState);
      this.state = nextState;
      return true;
    } finally {
      release();
    }
  }

  toggleAlarm(id: string, enabled?: boolean): Alarm {
    return this.mutateAlarm(id, existing => alarmSchema.parse({
      ...existing,
      enabled: enabled ?? !existing.enabled,
      updatedAt: this.now().toISOString()
    }));
  }

  getAlarm(id: string): Alarm | undefined {
    this.refresh();
    const alarm = this.state.alarms.find(item => item.id === id);
    return alarm ? structuredClone(alarm) : undefined;
  }

  listAlarms(): Alarm[] {
    this.refresh();
    return structuredClone(this.state.alarms);
  }

  recordAlarmOutcome(
    id: string,
    outcome: AlarmRunRecord,
    options: {clearNextOverride?: boolean} = {}
  ): Alarm {
    return this.mutateAlarm(id, existing => alarmSchema.parse({
      ...existing,
      lastRun: outcome,
      nextOverride: options.clearNextOverride === false ? existing.nextOverride : undefined,
      updatedAt: this.now().toISOString()
    }));
  }

  snoozeAlarm(id: string, until: Date): Alarm {
    if (!Number.isFinite(until.getTime())) throw new Error('Invalid alarm snooze instant.');
    const now = this.now();
    const canonicalUntil = new Date(Math.ceil(until.getTime() / 60_000) * 60_000);
    if (canonicalUntil.getTime() <= now.getTime()) throw new Error('Alarm snooze must be set to a future time.');
    return this.mutateAlarm(id, existing => alarmSchema.parse({
      ...existing,
      nextOverride: {at: canonicalUntil.toISOString(), createdAt: now.toISOString(), reason: 'snooze'},
      updatedAt: now.toISOString()
    }));
  }

  clearAlarmSnooze(id: string): Alarm {
    return this.mutateAlarm(id, existing => alarmSchema.parse({
      ...existing,
      nextOverride: undefined,
      updatedAt: this.now().toISOString()
    }));
  }

  addRecent(station: Station): LibraryState {
    this.refresh();
    const key = stationKey(station);
    const recent = [
      {station, playedAt: new Date().toISOString()},
      ...this.state.recent.filter(item => stationKey(item.station) !== key)
    ].slice(0, 50);

    return this.commit({...this.state, recent});
  }

  // Persist the ICY track titles a station announces so "what was that song?"
  // is answerable later. Consecutive duplicates on the same station are skipped.
  recordTrack(station: Station, title: string): LibraryState {
    this.refresh();
    const cleaned = title.trim();
    if (!cleaned) {
      return this.cachedSnapshot();
    }

    const key = stationKey(station);
    const last = this.state.trackHistory[0];
    if (last && last.title === cleaned && last.stationKey === key) {
      return this.snapshot();
    }

    const entry: TrackPlay = {
      title: cleaned,
      stationKey: key,
      stationName: station.name,
      at: new Date().toISOString()
    };

    return this.commit({...this.state, trackHistory: [entry, ...this.state.trackHistory].slice(0, 100)});
  }

  // Most-recent-first search queries for up-arrow recall in the search box.
  addSearch(query: string): LibraryState {
    this.refresh();
    const cleaned = query.trim();
    if (!cleaned) {
      return this.snapshot();
    }

    const searchHistory = [cleaned, ...this.state.searchHistory.filter(item => item !== cleaned)].slice(0, 30);
    return this.commit({...this.state, searchHistory});
  }

  startListeningSession(station: Station, startedAt = new Date()): LibraryState {
    this.refresh();
    const finishedState = recoverActiveListeningSessionInState(this.state);
    const session: ListeningSession = {
      id: `${startedAt.toISOString()}-${stationKey(station)}`,
      station,
      startedAt: startedAt.toISOString(),
      lastActiveAt: startedAt.toISOString(),
      listenedSeconds: 0
    };

    return this.commit({
      ...finishedState,
      activity: {
        sessions: [session, ...finishedState.activity.sessions].slice(0, 2000)
      }
    });
  }

  checkpointActiveListeningSession(activeAt = new Date()): LibraryState {
    this.refresh();
    const active = this.state.activity.sessions[0];
    if (!active || active.endedAt) {
      return this.snapshot();
    }
    const started = Date.parse(active.startedAt);
    const checkpoint = activeAt.getTime();
    if (!Number.isFinite(started) || !Number.isFinite(checkpoint) || checkpoint < started) {
      return this.snapshot();
    }
    const updated: ListeningSession = {
      ...active,
      lastActiveAt: activeAt.toISOString(),
      listenedSeconds: Math.max(active.listenedSeconds, Math.round((checkpoint - started) / 1000))
    };
    return this.commit({
      ...this.state,
      activity: {sessions: [updated, ...this.state.activity.sessions.slice(1)]}
    });
  }

  finishActiveListeningSession(endedAt = new Date()): LibraryState {
    this.refresh();
    const nextState = finishActiveListeningSessionInState(this.state, endedAt);
    if (nextState === this.state) {
      return this.snapshot();
    }

    return this.commit(nextState);
  }

  toggleFavorite(station: Station): LibraryState {
    this.refresh();
    const key = stationKey(station);
    const exists = this.state.favorites.some(item => stationKey(item) === key);
    const favorites = exists
      ? this.state.favorites.filter(item => stationKey(item) !== key)
      : [station, ...this.state.favorites].slice(0, 200);

    return this.commit({...this.state, favorites});
  }

  addImported(stations: Station[]): LibraryState {
    this.refresh();
    const incoming: Station[] = [];
    const incomingKeys = new Set<string>();
    for (const station of stations) {
      const key = stationKey(station);
      if (incomingKeys.has(key)) continue;
      incomingKeys.add(key);
      incoming.push(station);
    }

    return this.commit({
      ...this.state,
      imported: [
        ...incoming,
        ...this.state.imported.filter(station => !incomingKeys.has(stationKey(station)))
      ].slice(0, 1000)
    });
  }

  isFavorite(station?: Station | null): boolean {
    if (!station) {
      return false;
    }

    this.refresh();
    const key = stationKey(station);
    return this.state.favorites.some(item => stationKey(item) === key);
  }

  private mutateAlarm(id: string, change: (alarm: Alarm) => Alarm): Alarm {
    const release = acquireStoreLock(this.filePath);
    try {
      const latestState = this.readForCurrentSession();
      const existing = latestState.alarms.find(alarm => alarm.id === id);
      if (!existing) {
        this.state = latestState;
        throw new Error(`Alarm not found: ${id}`);
      }
      const alarm = change(existing);
      const nextState = {
        ...latestState,
        alarms: latestState.alarms.map(item => item.id === id ? alarm : item)
      };
      this.write(nextState);
      this.state = nextState;
      return structuredClone(alarm);
    } finally {
      release();
    }
  }

  private read(): LibraryState {
    let contents: string;
    try {
      contents = readFileSync(this.filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultState();
      throw storageError('read the RadioCLI library', error);
    }

    let state: LibraryState;
    try {
      state = migrateLibraryState(librarySchema.parse(JSON.parse(contents)));
    } catch (error) {
      if (error instanceof z.ZodError && error.issues.some(issue =>
        issue.code === 'invalid_value' && issue.path.length === 2 &&
        issue.path[0] === 'settings' && issue.path[1] === 'receiverStyle'
      )) {
        // Another running build may have saved a newer receiver. Its library
        // is intact: never quarantine it or replace it with empty defaults.
        throw new Error('The RadioCLI library uses a receiver style this process does not support. Restart RadioCLI and its MCP clients to load the updated styles.');
      }
      try {
        assertStorageWritable(this.filePath);
        renameSync(this.filePath, `${this.filePath}.bad-${Date.now()}-${randomUUID()}`);
      } catch (error) {
        // Reset only after preserving the original bytes. A failed read never reaches here.
        throw storageError('preserve the corrupt RadioCLI library', error);
      }
      return defaultState();
    }
    // A legacy writer can still change ordinary preferences and favorites. Its
    // fallback style must not erase the selection saved by an updated process.
    let preference: string;
    try { preference = readFileSync(this.receiverPreferencePath(), 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return state;
      throw storageError('read the receiver preference', error);
    }
    const parsed = receiverPreferenceSchema.safeParse(JSON.parse(preference));
    if (!parsed.success) throw new Error('The RadioCLI receiver preference is unsupported or invalid. Restart RadioCLI and its MCP clients with the latest version. Your library has been preserved.');
    if (state.settings.receiverStyle === parsed.data.libraryReceiverStyle) state.settings.receiverStyle = parsed.data.receiverStyle;
    return state;
  }

  private receiverPreferencePath(): string { return `${this.filePath}.receiver.json`; }

  private readForCurrentSession(): LibraryState {
    const next = this.read();
    // Disk intentionally stores auto instead of reopening a receiver on launch.
    // Within this owner, unrelated durable changes retain its selected output.
    if (this.state.settings.preferredBackend === 'airplay' && next.settings.preferredBackend === 'auto') {
      next.settings.preferredBackend = 'airplay';
    }
    return next;
  }

  private commit(nextState: LibraryState): LibraryState {
    const release = acquireStoreLock(this.filePath);
    try {
      const latestState = this.readForCurrentSession();
      const mergedState = mergeLibraryChanges(this.state, latestState, nextState);
      this.write(mergedState);
      this.state = mergedState;
      return this.cachedSnapshot();
    } finally {
      release();
    }
  }

  private write(state: LibraryState): void {
    try {
      assertStorageWritable(this.filePath);
      mkdirSync(dirname(this.filePath), {recursive: true, mode: 0o700});
      const diskState = libraryStateForDisk(state);
      const separateReceiver = !sharedLibraryReceiverStyles.has(state.settings.receiverStyle);
      const preferencePath = this.receiverPreferencePath();
      let previousPreference: string | undefined;
      try { previousPreference = readFileSync(preferencePath, 'utf8'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      const nextPreference = separateReceiver
        ? `${JSON.stringify({version: 1, receiverStyle: state.settings.receiverStyle, libraryReceiverStyle: 'ultracode'}, null, 2)}\n`
        : undefined;
      const preferenceChanged = previousPreference !== nextPreference;
      if (preferenceChanged) {
        if (nextPreference === undefined) rmSync(preferencePath);
        else writeTextAtomically(preferencePath, nextPreference);
      }
      try {
        writeJsonAtomically(this.filePath, separateReceiver
          ? {...diskState, settings: {...diskState.settings, receiverStyle: 'ultracode'}}
          : diskState);
      } catch (error) {
        if (preferenceChanged) {
          if (previousPreference === undefined) rmSync(preferencePath, {force: true});
          else writeTextAtomically(preferencePath, previousPreference);
        }
        throw error;
      }
      try { this.revision = this.diskRevision(); } catch { this.revision = ''; }
    } catch (error) {
      throw storageError('write the RadioCLI library', error);
    }
  }
}

export function stationKey(station: Station): string {
  return `${station.provider}:${migrateStationIdentity(station).id}`;
}

function finishActiveListeningSessionInState(state: LibraryState, endedAt: Date): LibraryState {
  const active = state.activity.sessions[0];
  if (!active || active.endedAt) {
    return state;
  }

  const started = Date.parse(active.startedAt);
  const ended = endedAt.getTime();
  const listenedSeconds = Number.isFinite(started) && ended > started
    ? Math.max(active.listenedSeconds, Math.round((ended - started) / 1000))
    : active.listenedSeconds;
  const finished: ListeningSession = {
    ...active,
    endedAt: endedAt.toISOString(),
    lastActiveAt: endedAt.toISOString(),
    listenedSeconds
  };

  return {
    ...state,
    activity: {sessions: [finished, ...state.activity.sessions.slice(1)]}
  };
}

function recoverActiveListeningSessionInState(state: LibraryState): LibraryState {
  const active = state.activity.sessions[0];
  if (!active || active.endedAt) {
    return state;
  }
  const started = Date.parse(active.startedAt);
  const checkpoint = active.lastActiveAt ? Date.parse(active.lastActiveAt) : Number.NaN;
  const recoveredEnd = Number.isFinite(checkpoint) && checkpoint >= started
    ? checkpoint
    : Number.isFinite(started)
      ? started + Math.max(0, active.listenedSeconds) * 1000
      : Date.now();
  return finishActiveListeningSessionInState(state, new Date(recoveredEnd));
}

export function defaultLibraryPath(options: Parameters<typeof platformPaths>[0] = {}): string {
  const {library, legacyLibrary} = platformPaths(options);
  for (const filePath of [library, legacyLibrary]) {
    try {
      statSync(filePath);
      return filePath;
    } catch (error) {
      // A permission failure must not select an older library or empty defaults.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw storageError('read the RadioCLI library', error);
      }
    }
  }
  return library;
}

function resolveUserPath(requestedPath: string): string {
  const unquoted = requestedPath.trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_match, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted ?? '');
  const expanded = unquoted === '~'
    ? homedir()
    : unquoted.startsWith('~/') || unquoted.startsWith('~\\')
      ? join(homedir(), unquoted.slice(2))
      : unquoted;
  return isAbsolute(expanded) ? resolve(expanded) : resolve(process.cwd(), expanded);
}

function fileTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z').replace('T', '-');
}

function defaultState(): LibraryState {
  return {
    recent: [],
    favorites: [],
    presets: [],
    imported: [],
    trackHistory: [],
    searchHistory: [],
    alarms: [],
    activity: {sessions: []},
    settings: {
      theme: 'green',
      receiverStyle: defaultReceiverStyle,
      receiverStyleVersion: 2,
      volume: 70,
      enableRadioGarden: false,
      enableNearbyLocation: true,
      shareDirectoryVotes: true,
      preferredBackend: 'auto',
      tuneTimeoutSeconds: 12,
      skipBrokenStreams: true,
      mouseSupport: true,
      automaticUpdateChecks: true,
      agentControl: {
        enabled: false,
        openUiOnPlay: true,
        focusNowPlaying: true,
        completionPreset: {action: 'play', source: 'recent', ifPlaying: 'keep'}
      },
      mediaKeys: defaultMediaKeys
    }
  };
}

function migrateLibraryState(state: LibraryState): LibraryState {
  const aliases = new Map<string, Set<string>>();
  const migrate = (station: Station): Station => {
    const next = migrateStationIdentity(station);
    if (next.id !== station.id) {
      const key = `${station.provider}:${station.id}`;
      const targets = aliases.get(key) ?? new Set<string>();
      targets.add(stationKey(next));
      aliases.set(key, targets);
    }
    return next;
  };
  const recent = state.recent.map(item => ({...item, station: migrate(item.station)}));
  const favorites = state.favorites.map(migrate);
  const imported = state.imported.map(migrate);
  const presets = state.presets?.map(item => ({...item, station: migrate(item.station)}));
  const sessions = state.activity.sessions.map(item => ({...item, station: migrate(item.station)}));
  const alarms = state.alarms.map(alarm => normalizeAlarm({...alarm, station: migrate(alarm.station),
    playback: {...alarm.playback, ...(alarm.playback.fallbackStation ? {fallbackStation: migrate(alarm.playback.fallbackStation)} : {})}}));
  return {
    ...state,
    recent, favorites, imported, presets, alarms,
    activity: {sessions},
    trackHistory: state.trackHistory.map(item => {
      const targets = aliases.get(item.stationKey);
      return targets?.size === 1 ? {...item, stationKey: [...targets][0]!} : item;
    }),
    settings: {
      ...state.settings,
      preferredBackend: state.settings.preferredBackend === 'airplay' ? 'auto' : state.settings.preferredBackend,
      receiverStyle: state.settings.receiverStyleVersion === 2 ? state.settings.receiverStyle : defaultReceiverStyle,
      receiverStyleVersion: 2
    }
  };
}

function isRadioCliBackup(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'format' in value
    && (value as {format?: unknown}).format === 'radiocli-backup';
}

function libraryStateForDisk(state: LibraryState): LibraryState {
  return state.settings.preferredBackend === 'airplay'
    ? {
        ...state,
        settings: {
          ...state.settings,
          preferredBackend: 'auto'
        }
      }
    : state;
}

function writeJsonAtomically(filePath: string, value: unknown): void {
  writeTextAtomically(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeTextAtomically(filePath: string, text: string): void {
  const tempPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    const fd = openSync(tempPath, 'wx', 0o600);
    try {
      writeFileSync(fd, text, 'utf8');
      if (process.platform !== 'win32') chmodSync(tempPath, 0o600);
      fsyncSync(fd);
    } catch (error) {
      try { closeSync(fd); } catch { /* Preserve the original persistence error. */ }
      throw error;
    }
    closeSync(fd);
    replaceFileSync(tempPath, filePath);
  } catch (error) {
    try { rmSync(tempPath, {force: true}); } catch { /* Preserve the original write failure. */ }
    throw storageError('write RadioCLI data', error);
  }
  // Flush the replacement directory where supported. Once rename succeeds the
  // transaction is committed: a directory-sync failure cannot roll it back or
  // leave the caller's in-memory state describing the previous file. Windows
  // and some network/removable filesystems do not support syncing directories.
  let directoryFd: number | undefined;
  try { directoryFd = openSync(dirname(filePath), 'r'); fsyncSync(directoryFd); }
  catch { /* The file itself was flushed before replacement. */ }
  finally { if (directoryFd !== undefined) try { closeSync(directoryFd); } catch { /* Already committed. */ } }
}

function acquireStoreLock(filePath: string): () => void {
  const lockPath = `${filePath}.lock`;
  try {
    assertStorageWritable(filePath);
    mkdirSync(dirname(filePath), {recursive: true, mode: 0o700});
  } catch (error) {
    throw storageError('write the RadioCLI library', error);
  }
  try { return acquireFileLock(lockPath); }
  catch (error) { throw storageError('lock the RadioCLI library', error); }
}

class LibraryStorageError extends Error {
  readonly code?: string;
  readonly errno?: number;

  constructor(operation: string, cause: unknown) {
    const code = (cause as NodeJS.ErrnoException | undefined)?.code;
    const detail = typeof code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(code) ? ` (${code})` : '';
    super(code === 'EBUSY'
      ? 'The RadioCLI library is busy. Retry after the other writer finishes, or set RADIOCLI_HOME to a private writable directory.'
      : `Unable to ${operation}${detail}. Check storage permissions or set RADIOCLI_HOME to a private writable directory.`, {cause});
    this.name = 'LibraryStorageError';
    this.code = code;
    this.errno = (cause as NodeJS.ErrnoException | undefined)?.errno;
  }
}

function storageError(operation: string, cause: unknown): LibraryStorageError {
  return cause instanceof LibraryStorageError ? cause : new LibraryStorageError(operation, cause);
}

function normalizePresetName(name: string): string {
  const key = name.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(key)) throw new Error('Preset names must be 1-40 letters, numbers, hyphens, or underscores, starting with a letter or number.');
  return key;
}

function mergeLibraryChanges(base: LibraryState, disk: LibraryState, next: LibraryState): LibraryState {
  return {
    recent: mergeKeyedChanges(base.recent, disk.recent, next.recent, item => stationKey(item.station), 50),
    favorites: mergeKeyedChanges(base.favorites, disk.favorites, next.favorites, stationKey, 200, true),
    presets: mergeKeyedChanges(base.presets ?? [], disk.presets ?? [], next.presets ?? [], preset => preset.name, 200, true),
    imported: mergeKeyedChanges(base.imported, disk.imported, next.imported, stationKey, 1000, true, true),
    trackHistory: mergeKeyedChanges(base.trackHistory, disk.trackHistory, next.trackHistory, item => `${item.at}:${item.stationKey}:${item.title}`, 100),
    searchHistory: mergeSearchHistory(base.searchHistory, disk.searchHistory, next.searchHistory),
    alarms: mergeKeyedChanges(base.alarms, disk.alarms, next.alarms, alarm => alarm.id, MAX_ALARMS, true),
    updateCheck: sameValue(base.updateCheck, next.updateCheck) ? disk.updateCheck : next.updateCheck,
    activity: {
      sessions: mergeKeyedChanges(base.activity.sessions, disk.activity.sessions, next.activity.sessions, item => item.id, 2000)
    },
    settings: mergeSettings(base.settings, disk.settings, next.settings)
  };
}

function normalizeAlarm(alarm: Alarm): Alarm {
  const schedule = alarm.schedule.type === 'once'
    ? {type: 'once' as const, at: new Date(alarm.schedule.at).toISOString()}
    : {
        type: 'recurring' as const,
        time: canonicalizeAlarmTime(alarm.schedule.time),
        weekdays: canonicalizeIsoWeekdays(alarm.schedule.weekdays),
        timezone: canonicalizeTimeZone(alarm.schedule.timezone)
      };
  return {...alarm, schedule};
}

function mergeKeyedChanges<T>(
  base: T[],
  disk: T[],
  next: T[],
  keyFor: (value: T) => string,
  limit: number,
  applyRemovals = false,
  applyOrderChanges = false
): T[] {
  const baseByKey = new Map(base.map(item => [keyFor(item), item]));
  const basePositions = new Map(base.map((item, index) => [keyFor(item), index]));
  const nextKeys = new Set(next.map(keyFor));
  const removedKeys = applyRemovals
    ? new Set(base.map(keyFor).filter(key => !nextKeys.has(key)))
    : new Set<string>();
  const localChanges = next.filter((item, index) => {
    const prior = baseByKey.get(keyFor(item));
    return prior === undefined || !sameValue(prior, item) || applyOrderChanges && basePositions.get(keyFor(item)) !== index;
  });
  const changedKeys = new Set(localChanges.map(keyFor));
  return [
    ...localChanges,
    ...disk.filter(item => !removedKeys.has(keyFor(item)) && !changedKeys.has(keyFor(item)))
  ].slice(0, limit);
}

function mergeSearchHistory(base: string[], disk: string[], next: string[]): string[] {
  if (sameValue(base, next)) return disk;
  return [...new Set([...next, ...disk])].slice(0, 30);
}

function mergeSettings(base: AppSettings, disk: AppSettings, next: AppSettings): AppSettings {
  const merged = {...disk} as Record<string, unknown>;
  const baseRecord = base as unknown as Record<string, unknown>;
  const nextRecord = next as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(nextRecord)) {
    if (!sameValue(baseRecord[key], value)) merged[key] = value;
  }
  return merged as unknown as AppSettings;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
