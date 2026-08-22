import {chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, isAbsolute, join, resolve} from 'node:path';
import {z} from 'zod';
import {
  defaultReceiverStyle,
  receiverStyleNames,
  themeNames,
  type AppSettings,
  type LibraryState,
  type ListeningSession,
  type Station,
  type TrackPlay,
  type UpdateCheckState
} from '../types.js';
import {backupBadFile} from '../providers/cache.js';
import {migrateReceiverStyle} from '../ui/visualizers/receiver-style-registry.js';

const stationSchema: z.ZodType<Station> = z
  .object({
    id: z.string(),
    provider: z.enum(['radio-browser', 'radio-garden', 'playlist']),
    name: z.string(),
    country: z.string().optional(),
    countryCode: z.string().optional(),
    state: z.string().optional(),
    city: z.string().optional(),
    language: z.string().optional(),
    languageCodes: z.array(z.string()).optional(),
    tags: z.array(z.string()),
    codec: z.string().optional(),
    bitrate: z.number().optional(),
    homepage: z.string().optional(),
    favicon: z.string().optional(),
    streamUrl: z.string().optional(),
    clickCount: z.number().optional(),
    votes: z.number().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    distanceKm: z.number().optional(),
    hls: z.boolean().optional(),
    lastCheckedOk: z.boolean().optional()
  });

const defaultMediaKeys = {
  previous: [],
  playPause: [],
  next: []
};

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
  mouseSupport: z.boolean().default(true)
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

  constructor(filePath = defaultStorePath()) {
    this.filePath = filePath;
    this.state = this.read();
  }

  snapshot(): LibraryState {
    return structuredClone(this.state);
  }

  exportBackup(requestedPath?: string): string {
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
    const importedState = migrateLibraryState(
      backupResult.success
        ? backupResult.data.library
        : librarySchema.parse(legacyLibraryBackupSchema.parse(parsed))
    );

    const release = acquireStoreLock(this.filePath);
    try {
      const safetyBackupPath = existsSync(this.filePath)
        ? `${this.filePath}.before-import-${fileTimestamp(new Date())}.bak`
        : undefined;
      if (safetyBackupPath) {
        writeJsonAtomically(safetyBackupPath, libraryStateForDisk(this.state));
      }
      this.write(importedState);
      this.state = importedState;
      return {state: this.snapshot(), sourcePath, safetyBackupPath};
    } finally {
      release();
    }
  }

  updateSettings(settings: Partial<AppSettings>): LibraryState {
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
    return this.commit({...this.state, updateCheck});
  }

  addRecent(station: Station): LibraryState {
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
    const cleaned = title.trim();
    if (!cleaned) {
      return this.snapshot();
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
    const cleaned = query.trim();
    if (!cleaned) {
      return this.snapshot();
    }

    const searchHistory = [cleaned, ...this.state.searchHistory.filter(item => item !== cleaned)].slice(0, 30);
    return this.commit({...this.state, searchHistory});
  }

  startListeningSession(station: Station, startedAt = new Date()): LibraryState {
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
    const nextState = finishActiveListeningSessionInState(this.state, endedAt);
    if (nextState === this.state) {
      return this.snapshot();
    }

    return this.commit(nextState);
  }

  toggleFavorite(station: Station): LibraryState {
    const key = stationKey(station);
    const exists = this.state.favorites.some(item => stationKey(item) === key);
    const favorites = exists
      ? this.state.favorites.filter(item => stationKey(item) !== key)
      : [station, ...this.state.favorites].slice(0, 200);

    return this.commit({...this.state, favorites});
  }

  addImported(stations: Station[]): LibraryState {
    const existing = new Map(this.state.imported.map(station => [stationKey(station), station]));
    for (const station of stations) {
      existing.set(stationKey(station), station);
    }

    return this.commit({
      ...this.state,
      imported: [...existing.values()].slice(0, 1000)
    });
  }

  isFavorite(station?: Station | null): boolean {
    if (!station) {
      return false;
    }

    const key = stationKey(station);
    return this.state.favorites.some(item => stationKey(item) === key);
  }

  private read(): LibraryState {
    if (!existsSync(this.filePath)) {
      return defaultState();
    }

    try {
      return migrateLibraryState(librarySchema.parse(JSON.parse(readFileSync(this.filePath, 'utf8'))));
    } catch {
      backupBadFile(this.filePath);
      return defaultState();
    }
  }

  private commit(nextState: LibraryState): LibraryState {
    const release = acquireStoreLock(this.filePath);
    try {
      const latestState = this.read();
      const mergedState = mergeLibraryChanges(this.state, latestState, nextState);
      this.write(mergedState);
      this.state = mergedState;
      return this.snapshot();
    } finally {
      release();
    }
  }

  private write(state: LibraryState): void {
    mkdirSync(dirname(this.filePath), {recursive: true, mode: 0o700});
    writeJsonAtomically(this.filePath, libraryStateForDisk(state));
  }
}

export function stationKey(station: Station): string {
  return `${station.provider}:${station.id}`;
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

function defaultStorePath(): string {
  if (process.env.RADIOCLI_HOME) {
    return join(process.env.RADIOCLI_HOME, 'radiocli.json');
  }

  if (process.env.RADIO_ATLAS_HOME) {
    return join(process.env.RADIO_ATLAS_HOME, 'radio-atlas.json');
  }

  const currentPath = currentDefaultStorePath();
  const legacyPath = legacyDefaultStorePath();
  return existsSync(currentPath) || !existsSync(legacyPath) ? currentPath : legacyPath;
}

function currentDefaultStorePath(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'radiocli', 'radiocli.json');
  }

  if (process.platform === 'win32') {
    return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'RadioCLI', 'radiocli.json');
  }

  return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'radiocli', 'radiocli.json');
}

function legacyDefaultStorePath(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'radio-atlas', 'radio-atlas.json');
  }

  return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'radio-atlas', 'radio-atlas.json');
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
    imported: [],
    trackHistory: [],
    searchHistory: [],
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
      mediaKeys: defaultMediaKeys
    }
  };
}

function migrateLibraryState(state: LibraryState): LibraryState {
  return {
    ...state,
    settings: {
      ...state.settings,
      preferredBackend: state.settings.preferredBackend === 'airplay' ? 'auto' : state.settings.preferredBackend,
      receiverStyle: state.settings.receiverStyleVersion === 2 ? state.settings.receiverStyle : defaultReceiverStyle,
      receiverStyleVersion: 2
    }
  };
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
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, {encoding: 'utf8', mode: 0o600});
    renameSync(tempPath, filePath);
    if (process.platform !== 'win32') {
      chmodSync(filePath, 0o600);
    }
  } catch (error) {
    rmSync(tempPath, {force: true});
    throw error;
  }
}

function acquireStoreLock(filePath: string): () => void {
  const lockPath = `${filePath}.lock`;
  mkdirSync(dirname(filePath), {recursive: true, mode: 0o700});
  const deadline = Date.now() + 1000;
  while (true) {
    try {
      mkdirSync(lockPath, {mode: 0o700});
      return () => rmSync(lockPath, {recursive: true, force: true});
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > 10_000) {
          rmSync(lockPath, {recursive: true, force: true});
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`RadioCLI library is busy: ${filePath}`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
}

function mergeLibraryChanges(base: LibraryState, disk: LibraryState, next: LibraryState): LibraryState {
  return {
    recent: mergeKeyedChanges(base.recent, disk.recent, next.recent, item => stationKey(item.station), 50),
    favorites: mergeKeyedChanges(base.favorites, disk.favorites, next.favorites, stationKey, 200, true),
    imported: mergeKeyedChanges(base.imported, disk.imported, next.imported, stationKey, 1000, true),
    trackHistory: mergeKeyedChanges(base.trackHistory, disk.trackHistory, next.trackHistory, item => `${item.at}:${item.stationKey}:${item.title}`, 100),
    searchHistory: mergeSearchHistory(base.searchHistory, disk.searchHistory, next.searchHistory),
    updateCheck: sameValue(base.updateCheck, next.updateCheck) ? disk.updateCheck : next.updateCheck,
    activity: {
      sessions: mergeKeyedChanges(base.activity.sessions, disk.activity.sessions, next.activity.sessions, item => item.id, 2000)
    },
    settings: mergeSettings(base.settings, disk.settings, next.settings)
  };
}

function mergeKeyedChanges<T>(
  base: T[],
  disk: T[],
  next: T[],
  keyFor: (value: T) => string,
  limit: number,
  applyRemovals = false
): T[] {
  const baseByKey = new Map(base.map(item => [keyFor(item), item]));
  const nextKeys = new Set(next.map(keyFor));
  const removedKeys = applyRemovals
    ? new Set(base.map(keyFor).filter(key => !nextKeys.has(key)))
    : new Set<string>();
  const localChanges = next.filter(item => {
    const prior = baseByKey.get(keyFor(item));
    return prior === undefined || !sameValue(prior, item);
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
