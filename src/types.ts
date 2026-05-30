const providerIds = ['radio-browser', 'radio-garden', 'playlist'] as const;
export const themeNames = ['green', 'amber', 'blue', 'ruby', 'ice', 'teal', 'violet', 'copper', 'cyan', 'lime', 'coral', 'rose', 'slate', 'mono'] as const;
export const receiverStyleNames = [
  'equalizer',
  'motion-blob',
  'motion-area',
  'motion-contour',
  'leds',
  'matrix',
  'hologram',
  'cube',
  'fire',
  'fireworks',
  'plasma',
  'spinning-donut',
  'starfield',
  'mesh',
  'ribbon',
  'orbits',
  'mirror',
  'tunnel',
  'kaleidoscope',
  'constellation',
  'pulse-grid',
  'lissajous',
  'braille-wave',
  'radial-eq',
  'spectrogram',
  'nebula',
  'silk',
  'ripple-tank',
  'phyllotaxis',
  'harmonograph',
  'bloom-bars',
  'moire',
  'galaxy',
  'caustics',
  'lorenz',
  'fern',
  'chladni',
  'tesseract',
  'torus-knot',
  'rotozoomer',
  'fractal-tree',
  'julia',
  'clifford',
  'goniometer',
  'copper-bars',
  'twister',
  'coral',
  'cyclone',
  'lava-lamp',
  'newton'
] as const;

type ProviderId = (typeof providerIds)[number];

export type Screen =
  | 'home'
  | 'explore'
  | 'countries'
  | 'stations'
  | 'search'
  | 'nearby'
  | 'map'
  | 'now-playing'
  | 'library'
  | 'stats'
  | 'settings';

export type ThemeName = (typeof themeNames)[number];

export type ReceiverStyle = (typeof receiverStyleNames)[number];
export const defaultReceiverStyle = 'pulse-grid' as const satisfies ReceiverStyle;

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

export type MediaKeyBindings = {
  previous: string[];
  playPause: string[];
  next: string[];
};

export type AirPlayDevice = {
  id: string;
  name: string;
  host: string;
  port: number;
  txt: string[];
  requiresPassword: boolean;
  airplay2: boolean;
};

export type AppSettings = {
  theme: ThemeName;
  receiverStyle: ReceiverStyle;
  receiverStyleVersion?: number;
  volume: number;
  enableRadioGarden: boolean;
  enableNearbyLocation: boolean;
  preferredBackend: 'auto' | 'mpv' | 'ffplay' | 'airplay';
  preferredAirPlayDevice?: string;
  tuneTimeoutSeconds: number;
  skipBrokenStreams: boolean;
  mediaKeys: MediaKeyBindings;
};

type RecentPlay = {
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

type ListeningActivity = {
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
