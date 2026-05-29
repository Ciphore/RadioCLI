const providerIds = ['radio-browser', 'radio-garden', 'playlist'] as const;
export const themeNames = ['green', 'amber', 'blue', 'ruby', 'ice', 'teal', 'violet', 'copper', 'mono'] as const;
export const receiverStyleNames = [
  'spectrum',
  'oscilloscope',
  'waterfall',
  'cassette',
  'equalizer',
  'motion-bars',
  'motion-blob',
  'motion-area',
  'motion-dots',
  'motion-contour',
  'motion-braid',
  'radar',
  'blocks',
  'leds',
  'stars',
  'matrix',
  'hologram',
  'cube',
  'fire',
  'fireworks',
  'plasma',
  'radio-waves',
  'raindrops',
  'spinning-donut',
  'starfield',
  'termflix-fire',
  'termflix-matrix',
  'termflix-plasma',
  'termflix-starfield',
  'termflix-waterfall',
  'termflix-radar',
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
