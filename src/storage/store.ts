import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {z} from 'zod';
import type {AppSettings, LibraryState, Station} from '../types.js';
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

const settingsSchema: z.ZodType<AppSettings> = z.object({
  theme: z.enum(['green', 'amber', 'blue']).default('green'),
  volume: z.number().min(0).max(100).default(70),
  enableRadioGarden: z.boolean().default(false),
  enableNearbyLocation: z.boolean().default(false),
  preferredBackend: z.enum(['auto', 'mpv', 'ffplay']).default('auto'),
  tuneTimeoutSeconds: z.number().min(3).max(45).default(12),
  skipBrokenStreams: z.boolean().default(true)
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
  settings: settingsSchema.default({
    theme: 'green',
    volume: 70,
    enableRadioGarden: false,
    enableNearbyLocation: false,
    preferredBackend: 'auto',
    tuneTimeoutSeconds: 12,
    skipBrokenStreams: true
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
      settings: {...this.state.settings, ...settings}
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
      return librarySchema.parse(JSON.parse(readFileSync(this.filePath, 'utf8')));
    } catch {
      backupBadFile(this.filePath);
      return defaultState();
    }
  }

  private write(): void {
    mkdirSync(dirname(this.filePath), {recursive: true});
    writeFileSync(this.filePath, `${JSON.stringify(this.state, null, 2)}\n`, 'utf8');
  }
}

export function stationKey(station: Station): string {
  return `${station.provider}:${station.id}`;
}

export function defaultStorePath(): string {
  if (process.env.RADIO_ATLAS_HOME) {
    return join(process.env.RADIO_ATLAS_HOME, 'radio-atlas.json');
  }

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
    settings: {
      theme: 'green',
      volume: 70,
      enableRadioGarden: false,
      enableNearbyLocation: false,
      preferredBackend: 'auto',
      tuneTimeoutSeconds: 12,
      skipBrokenStreams: true
    }
  };
}
