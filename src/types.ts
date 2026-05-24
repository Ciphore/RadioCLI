export type ProviderId = 'radio-browser' | 'radio-garden' | 'playlist';

export type Screen =
  | 'home'
  | 'explore'
  | 'countries'
  | 'stations'
  | 'search'
  | 'nearby'
  | 'map'
  | 'now-playing'
  | 'stats'
  | 'recent'
  | 'favorites'
  | 'settings';

export type ThemeName = 'green' | 'amber' | 'blue' | 'ruby' | 'ice' | 'mono';

export type ReceiverStyle = 'sdr' | 'spectrum' | 'oscilloscope' | 'signal' | 'retro' | 'waterfall' | 'cassette' | 'equalizer' | 'radar' | 'blocks' | 'leds' | 'vinyl' | 'stars' | 'neon' | 'matrix' | 'hologram';

export type Country = {
  name: string;
  code: string;
  stationCount: number;
};

export type Station = {
  id: string;
  provider: ProviderId;
  name: string;
  country?: string;
  countryCode?: string;
  state?: string;
  city?: string;
  language?: string;
  languageCodes?: string[];
  tags: string[];
  codec?: string;
  bitrate?: number;
  homepage?: string;
  favicon?: string;
  streamUrl?: string;
  clickCount?: number;
  votes?: number;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  hls?: boolean;
  lastCheckedOk?: boolean;
};

export type LocationGuess = {
  city?: string;
  region?: string;
  country?: string;
  countryCode?: string;
  latitude: number;
  longitude: number;
  source: string;
};

export type ResolvedStream = {
  url: string;
  name?: string;
};

export type SearchOptions = {
  limit?: number;
  offset?: number;
  countryCode?: string;
  includeExperimental?: boolean;
  codec?: string;
  language?: string;
  minBitrate?: number;
};

export type AppSettings = {
  theme: ThemeName;
  receiverStyle: ReceiverStyle;
  receiverStyleVersion?: number;
  volume: number;
  enableRadioGarden: boolean;
  enableNearbyLocation: boolean;
  preferredBackend: 'auto' | 'mpv' | 'ffplay';
  tuneTimeoutSeconds: number;
  skipBrokenStreams: boolean;
};

export type RecentPlay = {
  station: Station;
  playedAt: string;
};

export type ListeningSession = {
  id: string;
  station: Station;
  startedAt: string;
  endedAt?: string;
  listenedSeconds: number;
};

export type ListeningActivity = {
  sessions: ListeningSession[];
};

export type LibraryState = {
  recent: RecentPlay[];
  favorites: Station[];
  imported: Station[];
  activity: ListeningActivity;
  settings: AppSettings;
};

export type PlaybackState = {
  backend: string;
  state: 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error';
  message?: string;
  volume: number;
  muted: boolean;
  startedAt?: string;
  streamUrl?: string;
  stationName?: string;
  ready: boolean;
  elapsedSeconds?: number;
};

export type PlaybackDiagnostics = {
  backend: string;
  availableBackends: string[];
  preferredBackend: AppSettings['preferredBackend'];
  active: boolean;
  streamUrl?: string;
  stationName?: string;
  volume: number;
  muted: boolean;
  startedAt?: string;
  ready: boolean;
};

export type IcyNowPlaying = {
  title?: string;
  raw?: string;
  updatedAt: string;
};
