import {
  defaultReceiverStyle,
  receiverStyleNames,
  type ReceiverStyleId
} from './ui/visualizers/receiver-style-registry.js';

export {defaultReceiverStyle, receiverStyleNames};

const providerIds = ['radio-browser', 'radio-garden', 'playlist'] as const;
export const themeNames = ['green', 'amber', 'blue', 'ruby', 'ice', 'teal', 'violet', 'copper', 'cyan', 'lime', 'coral', 'rose', 'slate', 'mono'] as const;
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
  | 'alarms'
  | 'alarm-editor'
  | 'alarm-picker'
  | 'alarm-ringing'
  | 'airplay-settings'
  | 'airplay-code'
  | 'settings'
  | 'help';

export type ThemeName = (typeof themeNames)[number];

export type ReceiverStyle = ReceiverStyleId;

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
  local?: boolean;
};

export type AppSettings = {
  theme: ThemeName;
  receiverStyle: ReceiverStyle;
  receiverStyleVersion?: number;
  volume: number;
  enableRadioGarden: boolean;
  enableNearbyLocation: boolean;
  shareDirectoryVotes: boolean;
  preferredBackend: 'auto' | 'mpv' | 'ffplay' | 'vlc' | 'airplay';
  preferredAirPlayDevice?: string;
  tuneTimeoutSeconds: number;
  skipBrokenStreams: boolean;
  mediaKeys: MediaKeyBindings;
  resumeOnLaunch?: boolean;
  transparentBackground?: boolean;
  asciiMode?: boolean;
  reduceMotion?: boolean;
  mouseSupport?: boolean;
};

export type UpdateCheckState = {
  checkedAt: string;
  currentVersion: string;
  latestVersion?: string;
  updateAvailable: boolean;
  error?: string;
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
  lastActiveAt?: string;
  listenedSeconds: number;
};

type ListeningActivity = {
  sessions: ListeningSession[];
};

export type TrackPlay = {
  title: string;
  stationKey: string;
  stationName: string;
  at: string;
};

export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type AlarmSchedule =
  | {
      type: 'once';
      /** An absolute ISO-8601 instant, including an offset or `Z`. */
      at: string;
    }
  | {
      type: 'recurring';
      /** Civil time in canonical 24-hour HH:mm form. */
      time: string;
      /** ISO weekdays: Monday=1 through Sunday=7. */
      weekdays: IsoWeekday[];
      /** Explicit IANA timezone; recurring alarms remain at this civil time across DST. */
      timezone: string;
    };

type AlarmPlaybackConfig = {
  volume: number;
  fadeSeconds: number;
  stopAfterMinutes: number;
  fallbackStation?: Station;
};

type AlarmReliabilityConfig = {
  missedRunGraceMinutes: number;
  wakeIfSupported: boolean;
  /** Keep this machine awake until the next concrete occurrence. Machine-local reconciliation is required. */
  keepAwakeUntilAlarm?: boolean;
};

type AlarmRunStatus = 'played' | 'failed' | 'missed' | 'dismissed';

export type AlarmRunRecord = {
  status: AlarmRunStatus;
  scheduledAt: string;
  firedAt?: string;
  finishedAt?: string;
  message?: string;
};

type AlarmNextOverride = {
  at: string;
  createdAt: string;
  reason: 'snooze';
};

export type Alarm = {
  id: string;
  label: string;
  enabled: boolean;
  station: Station;
  schedule: AlarmSchedule;
  playback: AlarmPlaybackConfig;
  reliability: AlarmReliabilityConfig;
  createdAt: string;
  updatedAt: string;
  lastRun?: AlarmRunRecord;
  /** One-shot occurrence override. Cleared after the alarm runner records its outcome. */
  nextOverride?: AlarmNextOverride;
};

export type AlarmCreateInput = Omit<Alarm, 'id' | 'createdAt' | 'updatedAt' | 'lastRun' | 'nextOverride'>;

/**
 * Machine-local runtime state. It intentionally does not live in LibraryState or backups.
 * A guard applies only to one concrete occurrence and is never a recurring alarm preference.
 */
export type AlarmPowerGuardState = {
  alarmId: string;
  occurrenceAt: string;
  status: 'requested' | 'active' | 'released' | 'failed';
  acquiredAt?: string;
  releasedAt?: string;
  message?: string;
};

export type LibraryState = {
  recent: RecentPlay[];
  favorites: Station[];
  imported: Station[];
  activity: ListeningActivity;
  trackHistory: TrackPlay[];
  searchHistory: string[];
  alarms: Alarm[];
  updateCheck?: UpdateCheckState;
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
  airPlayDeviceName?: string;
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
