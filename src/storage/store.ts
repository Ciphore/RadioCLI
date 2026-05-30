import {existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {z} from 'zod';
import {
  defaultReceiverStyle,
  receiverStyleNames,
  themeNames,
  type AppSettings,
  type LibraryState,
  type ListeningSession,
  type Station
} from '../types.js';
import {backupBadFile} from '../providers/cache.js';

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
  })
  .strict();

const defaultMediaKeys = {
  previous: [],
  playPause: [],
  next: []
};

const retiredExternalStylePrefix = `${'term'}${'flix'}-`;
const removedReceiverStyles = new Set([
  'scope',
  'spectrum',
  'oscilloscope',
  'sdr',
  'signal',
  'retro',
  'neon',
  'waterfall',
  'cassette',
  'casette',
  'stars',
  'radio-waves',
  'raindrops',
  'vinyl',
  'soundwave',
  'spectrum-3d',
  'tuning-dial',
  'rf-constellation',
  'rf-constelation',
  'sphere',
  'mobius',
  's-meter',
  'jellyfish',
  'prism',
  'motion-bars',
  'motion-dots',
  'motion-braid',
  'radar',
  'blocks',
  'vu-meters',
  'spirograph',
  'dejong',
  'truchet',
  `${retiredExternalStylePrefix}fire`,
  `${retiredExternalStylePrefix}matrix`,
  `${retiredExternalStylePrefix}plasma`,
  `${retiredExternalStylePrefix}starfield`,
  `${retiredExternalStylePrefix}waterfall`,
  `${retiredExternalStylePrefix}radar`,
  'wave',
  'life',
  'particles',
  'pendulum',
  'rain',
  'fountain',
  'flow',
  'spiral',
  'ocean',
  'aurora',
  'lightning',
  'smoke',
  'ripple',
  'snow',
  'garden',
  'fireflies',
  'dna',
  'pulse',
  'boids',
  'lava',
  'sandstorm',
  'petals',
  'campfire',
  'eclipse',
  'blackhole',
  'rainforest',
  'crystallize',
  'hackerman',
  'visualizer',
  'cells',
  'atom',
  'automata',
  'globe',
  'dragon',
  'sierpinski',
  'sierpinksi',
  'mandelbrot',
  'maze',
  'metaballs',
  'nbody',
  'langton',
  'sort',
  'tetris',
  'snake',
  'invaders',
  'pong',
  'flappy-bird',
  'reaction-diffusion',
  'voronoi'
]);

function normalizeReceiverStyle(value: unknown): unknown {
  return typeof value === 'string' && removedReceiverStyles.has(value) ? defaultReceiverStyle : value;
}

const settingsSchema: z.ZodType<AppSettings> = z.object({
  theme: z.enum(themeNames).default('green'),
  receiverStyle: z.preprocess(
    normalizeReceiverStyle,
    z.enum(receiverStyleNames).default(defaultReceiverStyle)
  ),
  receiverStyleVersion: z.number().optional(),
  volume: z.number().min(0).max(100).default(70),
  enableRadioGarden: z.boolean().default(false),
  enableNearbyLocation: z.boolean().default(false),
  preferredBackend: z.enum(['auto', 'mpv', 'ffplay', 'airplay']).default('auto'),
  preferredAirPlayDevice: z.string().min(1).optional(),
  tuneTimeoutSeconds: z.number().min(3).max(45).default(12),
  skipBrokenStreams: z.boolean().default(true),
  mediaKeys: z
    .object({
      previous: z.array(z.string()).default([]),
      playPause: z.array(z.string()).default([]),
      next: z.array(z.string()).default([])
    })
    .default(defaultMediaKeys)
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
  activity: z
    .object({
      sessions: z
        .array(
          z.object({
            id: z.string(),
            station: stationSchema,
            startedAt: z.string(),
            endedAt: z.string().optional(),
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
    enableNearbyLocation: false,
    preferredBackend: 'auto',
    tuneTimeoutSeconds: 12,
    skipBrokenStreams: true,
    mediaKeys: defaultMediaKeys
  })
});

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

  updateSettings(settings: Partial<AppSettings>): LibraryState {
    this.state = {
      ...this.state,
      settings: {
        ...this.state.settings,
        ...settings,
        receiverStyleVersion: settings.receiverStyle ? 2 : this.state.settings.receiverStyleVersion
      }
    };
    this.write();
    return this.snapshot();
  }

  addRecent(station: Station): LibraryState {
    const key = stationKey(station);
    const recent = [
      {station, playedAt: new Date().toISOString()},
      ...this.state.recent.filter(item => stationKey(item.station) !== key)
    ].slice(0, 50);

    this.state = {...this.state, recent};
    this.write();
    return this.snapshot();
  }

  startListeningSession(station: Station, startedAt = new Date()): LibraryState {
    this.finishActiveListeningSession(startedAt);
    const session: ListeningSession = {
      id: `${startedAt.toISOString()}-${stationKey(station)}`,
      station,
      startedAt: startedAt.toISOString(),
      listenedSeconds: 0
    };

    this.state = {
      ...this.state,
      activity: {
        sessions: [session, ...this.state.activity.sessions].slice(0, 2000)
      }
    };
    this.write();
    return this.snapshot();
  }

  finishActiveListeningSession(endedAt = new Date()): LibraryState {
    const sessions = this.state.activity.sessions.map((session, index) => {
      if (index !== 0 || session.endedAt) {
        return session;
      }

      const started = Date.parse(session.startedAt);
      const ended = endedAt.getTime();
      const listenedSeconds = Number.isFinite(started) && ended > started
        ? Math.max(session.listenedSeconds, Math.round((ended - started) / 1000))
        : session.listenedSeconds;

      return {
        ...session,
        endedAt: endedAt.toISOString(),
        listenedSeconds
      };
    });

    this.state = {...this.state, activity: {sessions}};
    this.write();
    return this.snapshot();
  }

  toggleFavorite(station: Station): LibraryState {
    const key = stationKey(station);
    const exists = this.state.favorites.some(item => stationKey(item) === key);
    const favorites = exists
      ? this.state.favorites.filter(item => stationKey(item) !== key)
      : [station, ...this.state.favorites].slice(0, 200);

    this.state = {...this.state, favorites};
    this.write();
    return this.snapshot();
  }

  addImported(stations: Station[]): LibraryState {
    const existing = new Map(this.state.imported.map(station => [stationKey(station), station]));
    for (const station of stations) {
      existing.set(stationKey(station), station);
    }

    this.state = {
      ...this.state,
      imported: [...existing.values()].slice(0, 1000)
    };
    this.write();
    return this.snapshot();
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

  private write(): void {
    mkdirSync(dirname(this.filePath), {recursive: true});
    writeJsonAtomically(this.filePath, this.state);
  }
}

export function stationKey(station: Station): string {
  return `${station.provider}:${station.id}`;
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

  return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'radiocli', 'radiocli.json');
}

function legacyDefaultStorePath(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'radio-atlas', 'radio-atlas.json');
  }

  return join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'radio-atlas', 'radio-atlas.json');
}

function defaultState(): LibraryState {
  return {
    recent: [],
    favorites: [],
    imported: [],
    activity: {sessions: []},
    settings: {
      theme: 'green',
      receiverStyle: defaultReceiverStyle,
      receiverStyleVersion: 2,
      volume: 70,
      enableRadioGarden: false,
      enableNearbyLocation: false,
      preferredBackend: 'auto',
      tuneTimeoutSeconds: 12,
      skipBrokenStreams: true,
      mediaKeys: defaultMediaKeys
    }
  };
}

function migrateLibraryState(state: LibraryState): LibraryState {
  if (state.settings.receiverStyleVersion === 2) {
    return state;
  }

  return {
    ...state,
    settings: {
      ...state.settings,
      receiverStyle: defaultReceiverStyle,
      receiverStyleVersion: 2
    }
  };
}

function writeJsonAtomically(filePath: string, value: unknown): void {
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    renameSync(tempPath, filePath);
  } catch (error) {
    rmSync(tempPath, {force: true});
    throw error;
  }
}
