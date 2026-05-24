import type {MediaKeyBindings, Screen, Station} from '../types.js';
import type {TopTab} from './components/TopTabs.js';

export type StationContext = {
  title: string;
  subtitle: string;
  stations: Station[];
};

export type StationContextKey = 'explore' | 'stations' | 'search' | 'nearby' | 'recent' | 'favorites';

export type SearchFilters = {
  codec: string | null;
  language: string | null;
  minBitrate: number | null;
};

export type NavigationOptions = {
  resetSelection?: boolean;
  clearMessage?: boolean;
};

export type PlayStationOptions = {
  openNowPlaying?: boolean;
  queue?: PlaybackQueue;
};

export type PlaybackQueue = {
  title: string;
  sourceScreen: Screen;
  sourceContextKey: StationContextKey | null;
  stations: Station[];
};

export type MediaTransportAction = 'previous' | 'playPause' | 'next';
export type SleepTimerMinutes = 15 | 30 | 60 | null;

const emptyMediaKeyBindings: MediaKeyBindings = {
  previous: [],
  playPause: [],
  next: []
};

const mediaTransportActions = ['previous', 'playPause', 'next'] as const;
const sleepTimerOptions: SleepTimerMinutes[] = [null, 15, 30, 60];

export const initialStationContexts: Record<StationContextKey, StationContext> = {
  explore: {
    title: 'Explore world',
    subtitle: 'Popular stations from Radio Browser',
    stations: []
  },
  stations: {
    title: 'Country stations',
    subtitle: 'Pick a country to load stations',
    stations: []
  },
  search: {
    title: 'Search',
    subtitle: 'Matches across enabled public station directories',
    stations: []
  },
  nearby: {
    title: 'Nearby',
    subtitle: 'Opt-in approximate location for local stations',
    stations: []
  },
  recent: {
    title: 'Recent',
    subtitle: 'Stations played on this machine',
    stations: []
  },
  favorites: {
    title: 'Favorites and imports',
    subtitle: 'Saved and imported streams',
    stations: []
  }
};

export const topTabs: TopTab[] = [
  {screen: 'home', label: 'Overview'},
  {screen: 'explore', label: 'Explore'},
  {screen: 'countries', label: 'Countries'},
  {screen: 'search', label: 'Search'},
  {screen: 'nearby', label: 'Nearby'},
  {screen: 'now-playing', label: 'Now Playing'},
  {screen: 'stats', label: 'Stats'},
  {screen: 'recent', label: 'Recent'},
  {screen: 'favorites', label: 'Favorites'},
  {screen: 'settings', label: 'Settings'}
];

export function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), Math.max(max, 0));
}

export function clampVolume(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function applyStationFilters(stations: Station[], filters: SearchFilters): Station[] {
  return stations.filter(station => {
    if (filters.codec && station.codec && station.codec.toLowerCase() !== filters.codec.toLowerCase()) {
      return false;
    }

    if (filters.language && station.language && !station.language.toLowerCase().includes(filters.language.toLowerCase())) {
      return false;
    }

    if (filters.minBitrate && (station.bitrate ?? 0) < filters.minBitrate) {
      return false;
    }

    return true;
  });
}

export function formatFilterLabel(filters: SearchFilters): string {
  const parts = [
    filters.codec ? `codec ${filters.codec}` : undefined,
    filters.language ? `language ${filters.language}` : undefined,
    filters.minBitrate ? `min ${filters.minBitrate} kbps` : undefined
  ].filter(Boolean);

  return parts.join(' · ') || 'none';
}

export function formatTimeLeft(ms: number): string {
  if (ms <= 0) {
    return 'now';
  }

  const minutes = Math.ceil(ms / 60_000);
  return `${minutes}m`;
}

export function nextSleepTimerMinutes(currentMinutes: number | null): SleepTimerMinutes {
  const currentIndex = sleepTimerOptions.findIndex(option => option === currentMinutes);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % sleepTimerOptions.length : 0;
  return sleepTimerOptions[nextIndex] ?? null;
}

export function stationApproximateTime(station: Station | null): string {
  if (!station || typeof station.longitude !== 'number') {
    return 'unknown';
  }

  const offsetHours = Math.round(station.longitude / 15);
  const date = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  const sign = offsetHours >= 0 ? '+' : '';
  return `${date.toISOString().slice(11, 16)} UTC${sign}${offsetHours}`;
}

export function favoriteTarget(screen: Screen, selectedStation: Station | null, playingStation: Station | null): Station | null {
  if (screen === 'now-playing') {
    return playingStation;
  }

  if (screen === 'explore' || screen === 'stations' || screen === 'search' || screen === 'nearby' || screen === 'recent' || screen === 'favorites') {
    return selectedStation;
  }

  return playingStation;
}

export function activeTabForScreen(screen: Screen): Screen {
  return screen === 'stations' ? 'explore' : screen;
}

export function stationContextKeyForScreen(screen: Screen): StationContextKey | null {
  if (
    screen === 'explore' ||
    screen === 'stations' ||
    screen === 'search' ||
    screen === 'nearby' ||
    screen === 'recent' ||
    screen === 'favorites'
  ) {
    return screen;
  }

  return null;
}

export function isEditableInput(input: string, key: {backspace?: boolean; delete?: boolean; ctrl?: boolean; meta?: boolean}): boolean {
  return Boolean(key.backspace || key.delete || input);
}

export function applyTextInput(
  value: string,
  input: string,
  key: {backspace?: boolean; delete?: boolean; ctrl?: boolean; meta?: boolean}
): string {
  if (key.backspace || key.delete || (key.ctrl && input === 'h')) {
    return value.slice(0, -1);
  }

  if (key.ctrl || key.meta) {
    return value;
  }

  let next = value;
  for (const character of input) {
    if (character === '\u007f' || character === '\b') {
      next = next.slice(0, -1);
    } else if (character >= ' ') {
      next += character;
    }
  }

  return next;
}

export function mediaTransportActionForInput(input: string, mediaKeys: MediaKeyBindings = emptyMediaKeyBindings): MediaTransportAction | null {
  const normalized = normalizeMediaKeyBindings(mediaKeys);
  for (const action of mediaTransportActions) {
    if (normalized[action].includes(input)) {
      return action;
    }
  }

  const matches = [...input.matchAll(/\u001B\[(18|19|20)(?:;\d+)?~/g)];
  const keyCode = matches.at(-1)?.[1];
  if (keyCode === '18') {
    return 'previous';
  }

  if (keyCode === '19') {
    return 'playPause';
  }

  if (keyCode === '20') {
    return 'next';
  }

  const kittyMatches = [...input.matchAll(/\u001B\[(57428|57429|57430|57431|57433|57434|57435|57436)(?:;[0-9:;]+)?u/g)];
  const kittyCode = kittyMatches.at(-1)?.[1];
  if (kittyCode === '57431' || kittyCode === '57434' || kittyCode === '57436') {
    return 'previous';
  }

  if (kittyCode === '57428' || kittyCode === '57429' || kittyCode === '57430') {
    return 'playPause';
  }

  if (kittyCode === '57433' || kittyCode === '57435') {
    return 'next';
  }

  const modifiedArrowMatches = [...input.matchAll(/\u001B\[1;[235]([CD])/g)];
  const modifiedArrow = modifiedArrowMatches.at(-1)?.[1];
  if (modifiedArrow === 'D') {
    return 'previous';
  }

  if (modifiedArrow === 'C') {
    return 'next';
  }

  return null;
}

export function normalizeMediaKeyBindings(mediaKeys: Partial<MediaKeyBindings> | null | undefined): MediaKeyBindings {
  return {
    previous: uniqueStrings(mediaKeys?.previous ?? []),
    playPause: uniqueStrings(mediaKeys?.playPause ?? []),
    next: uniqueStrings(mediaKeys?.next ?? [])
  };
}

export function addMediaKeyBinding(mediaKeys: MediaKeyBindings, action: MediaTransportAction, input: string): MediaKeyBindings {
  const normalized = normalizeMediaKeyBindings(mediaKeys);
  return {
    ...normalized,
    [action]: uniqueStrings([...normalized[action], input]).slice(-8)
  };
}

export function mediaActionLabel(action: MediaTransportAction): string {
  if (action === 'playPause') {
    return 'play/pause';
  }

  return action;
}

export function parseMediaActionName(value: string): MediaTransportAction | null {
  const normalized = value.toLowerCase().replace(/[^a-z]/g, '');
  if (normalized === 'previous' || normalized === 'prev' || normalized === 'back') {
    return 'previous';
  }

  if (normalized === 'playpause' || normalized === 'pause' || normalized === 'play') {
    return 'playPause';
  }

  if (normalized === 'next' || normalized === 'forward') {
    return 'next';
  }

  return null;
}

export function isPlainPrintableInput(input: string): boolean {
  return input.length > 0 && [...input].every(character => character >= ' ' && character !== '\u007f');
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(value => value.length > 0))];
}
