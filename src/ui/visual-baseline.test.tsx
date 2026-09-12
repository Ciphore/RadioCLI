import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {stripVTControlCharacters} from 'node:util';
import type {ComponentProps} from 'react';
import {Box, renderToString} from 'ink';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {receiverStyleNames, themeNames, type Alarm, type LibraryState, type Screen, type Station} from '../types.js';
import {AppContent} from './AppContent.js';
import {defaultExploreCursor} from './app-state.js';
import {draftFromAlarm} from './alarm-editor.js';
import {DisplayContext, resolveDisplayMode} from './display-context.js';
import {computeTerminalLayout} from './layout.js';
import {settingsGroups} from './screen-items.js';
import {alarmPickerChoices} from './screens/AlarmsScreen.js';

type ContentProps = ComponentProps<typeof AppContent>;
type BaselineCase = {
  name: string;
  screen: Screen;
  props?: Partial<ContentProps>;
  alarm?: Partial<ContentProps['alarmTui']>;
  receiverStyle?: LibraryState['settings']['receiverStyle'];
};

// Resolve Ink's own Chalk instance, including nested dependency installations.
// Its explicit color level makes these captures independent of the host TTY,
// CI, and FORCE_COLOR while retaining the actual renderer's style sequences.
const inkRequire = createRequire(import.meta.resolve('ink'));
const inkChalk = (await import(pathToFileURL(inkRequire.resolve('chalk')).href)).default as {level: number};
const originalColorLevel = inkChalk.level;
const now = '2026-09-07T12:00:00.000Z';
const station: Station = {
  id: 'kexp', provider: 'radio-browser', name: 'KEXP 90.3 FM',
  country: 'United States', countryCode: 'US', city: 'Seattle',
  tags: ['indie'], codec: 'MP3', bitrate: 128,
  latitude: 47.6062, longitude: -122.3321,
  streamUrl: 'https://example.test/kexp'
};
const otherStation: Station = {
  ...station, id: 'kcrw', name: 'KCRW 89.9 FM — A deliberately long station name',
  city: 'Santa Monica', tags: ['eclectic', 'public radio'],
  latitude: 34.0195, longitude: -118.4912
};
const alarm: Alarm = {
  id: 'morning', label: 'Morning radio', enabled: true, station,
  schedule: {type: 'recurring', time: '06:30', weekdays: [1, 2, 3, 4, 5], timezone: 'America/Los_Angeles'},
  playback: {volume: 70, fadeSeconds: 30, stopAfterMinutes: 60, fallbackStation: otherStation},
  reliability: {missedRunGraceMinutes: 15, wakeIfSupported: true, keepAwakeUntilAlarm: true},
  createdAt: '2026-08-22T00:00:00.000Z', updatedAt: '2026-08-22T00:00:00.000Z'
};
const library: LibraryState = {
  favorites: [station],
  recent: [{station: otherStation, playedAt: '2026-09-06T12:00:00.000Z'}],
  imported: [otherStation],
  activity: {sessions: [
    {id: 'listen-1', station, startedAt: '2026-09-06T12:00:00.000Z', endedAt: '2026-09-06T13:00:00.000Z', listenedSeconds: 3600},
    {id: 'listen-2', station: otherStation, startedAt: '2026-09-07T09:00:00.000Z', endedAt: '2026-09-07T09:30:00.000Z', listenedSeconds: 1800}
  ]},
  trackHistory: [
    {title: 'Bjork - Joga', stationKey: 'radio-browser:kexp', stationName: station.name, at: '2026-09-07T11:58:00.000Z'},
    {title: 'Aphex Twin - Avril 14th', stationKey: 'radio-browser:kexp', stationName: station.name, at: '2026-09-07T11:54:00.000Z'}
  ],
  searchHistory: ['tokyo jazz'],
  alarms: [alarm],
  settings: {
    theme: 'green', receiverStyle: 'pulse-grid', volume: 70,
    enableRadioGarden: false, enableNearbyLocation: false, shareDirectoryVotes: true,
    preferredBackend: 'auto', preferredAirPlayDevice: 'living-room', tuneTimeoutSeconds: 12,
    skipBrokenStreams: true, mediaKeys: {previous: [], playPause: [], next: []},
    resumeOnLaunch: true, asciiMode: false, reduceMotion: false,
    transparentBackground: false, automaticUpdateChecks: true
  }
};
const playback: ContentProps['playback'] = {backend: 'mpv', state: 'playing', volume: 70, muted: false, ready: true};
const runtime: ContentProps['alarmTui']['runtime'] = {
  capabilities: {supported: true, exactWake: false, catchUpAfterWake: true, message: 'ready'},
  degradedAlarmIds: new Set(), message: 'Native scheduler ready.'
};
const verification: NonNullable<ContentProps['alarmTui']['verification']> = {
  state: 'warning', alarmLabel: alarm.label, startedAt: now, finishedAt: now,
  steps: [
    {id: 'scheduler', label: 'Native scheduler', state: 'passed', detail: 'Disposable job registered and removed.', critical: true},
    {id: 'power', label: 'Sleep protection', state: 'warning', detail: 'Closed-lid policy cannot be overridden.', critical: false}
  ]
};
const activeAlarms: ContentProps['alarmTui']['activeAlarms'] = [{
  key: 'morning-session',
  status: {alarmId: alarm.id, scheduledAt: '2026-09-07T11:59:00.000Z', stationName: station.name, station, startedAt: '2026-09-07T11:59:00.000Z', state: 'playing'},
  dismiss: async () => undefined, snooze: async () => undefined, keepPlaying: async () => undefined
}];

// Keep this exhaustive: adding a route must also make its baseline intentional.
const screens: Record<Screen, Partial<ContentProps>> = {
  home: {}, 'now-playing': {}, library: {}, explore: {}, search: {}, countries: {},
  nearby: {}, map: {}, stations: {}, stats: {}, settings: {},
  'airplay-settings': {}, 'airplay-code': {playback: {...playback, backend: 'airplay', state: 'loading', ready: false, message: 'AirPlay code required.'}},
  help: {}, alarms: {selected: 1}, 'alarm-editor': {}, 'alarm-picker': {}, 'alarm-ringing': {}
};
const screenCases: BaselineCase[] = [
  ...Object.entries(screens).map(([screen, props]) => ({name: screen, screen: screen as Screen, props})),
  ...settingsGroups.map(group => ({name: `settings/${group.id}`, screen: 'settings' as const, props: {settingsPage: group.id}})),
  {name: 'now-playing/diagnostics', screen: 'now-playing', props: {showDiagnostics: true}},
  {name: 'now-playing/idle', screen: 'now-playing', props: {playingStation: null, nowPlaying: null, playback: {...playback, state: 'idle', ready: false}}},
  {name: 'search/loading', screen: 'search', props: {loadingStations: true, displayStations: []}},
  {name: 'library/empty', screen: 'library', props: {displayStations: [], library: {...library, favorites: [], imported: [], recent: []}}},
  {name: 'help/commands', screen: 'help', props: {selected: 40}},
  {name: 'alarms/empty', screen: 'alarms', props: {library: {...library, alarms: []}}},
  {name: 'alarms/degraded', screen: 'alarms', props: {selected: 1}, alarm: {runtime: {...runtime, degradedAlarmIds: new Set([alarm.id])}, deletingId: alarm.id}},
  {name: 'alarms/verification', screen: 'alarms', alarm: {verification}},
  {name: 'alarm-editor/time', screen: 'alarm-editor', alarm: {editorField: 'time', editorControl: 'time', timeSegment: 'minute'}},
  {name: 'alarm-editor/weekdays', screen: 'alarm-editor', alarm: {editorField: 'weekdays', editorControl: 'weekdays', weekdayIndex: 2}},
  {name: 'alarm-editor/volume', screen: 'alarm-editor', alarm: {editorField: 'volume', editorControl: 'number'}},
  {name: 'alarm-editor/save', screen: 'alarm-editor', alarm: {editorField: 'save'}},
  {name: 'alarm-picker/fallback', screen: 'alarm-picker', alarm: {pickerFallback: true, pickerChoices: alarmPickerChoices([alarm], [station], [otherStation], library.recent, station, true)}}
];
const sizes = [
  {name: 'full', columns: 100, rows: 30},
  {name: 'compact', columns: 50, rows: 16},
  {name: 'micro', columns: 24, rows: 8}
] as const;
const profiles = [
  {name: 'unicode', ascii: false, noColor: false},
  {name: 'ascii', ascii: true, noColor: false},
  {name: 'unicode-no-color', ascii: false, noColor: true},
  {name: 'ascii-no-color', ascii: true, noColor: true}
] as const;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
  vi.stubEnv('TZ', 'UTC');
});
afterEach(() => {
  inkChalk.level = originalColorLevel;
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

for (const size of sizes) {
  for (const profile of profiles) {
    describe(`screen baseline / ${size.name} / ${profile.name}`, () => {
      it.each(screenCases)('$name', baseline => capture(baseline, size, profile));
    });
  }
}

describe('receiver baseline / full / unicode', () => {
  it.each(receiverStyleNames)('%s', receiverStyle => capture({name: receiverStyle, screen: 'now-playing', receiverStyle}, sizes[0], profiles[0]));
});

const representativeReceivers = ['gallop-fine', 'pulse-grid', 'ultracode', 'braille-wave', 'manhattan'] as const;
for (const size of sizes) {
  for (const profile of profiles.filter(profile => !profile.noColor && (size.name !== 'full' || profile.ascii))) {
    describe(`receiver baseline / ${size.name} / ${profile.name}`, () => {
      it.each(representativeReceivers)('%s', receiverStyle => capture({name: receiverStyle, screen: 'now-playing', receiverStyle}, size, profile));
    });
  }
}

// Most baselines stay readable as terminal text. These focused ANSI captures
// retain the exact accents, heatmap levels, selection fills, and scene colors.
describe('palette baseline', () => {
  const paletteCases = themeNames.flatMap(theme => ['home', 'stats'].map(screen => ({
    name: `${theme}/${screen}`, screen: screen as Screen, props: {theme}
  })));
  it.each(paletteCases)('$name', baseline => capture(baseline, sizes[0], profiles[0], true));
  it.each<BaselineCase>([
    {name: 'receiver accent', screen: 'now-playing'},
    {name: 'alarm selection', screen: 'alarms', props: {selected: 1}},
    {name: 'settings selection', screen: 'settings', props: {settingsPage: 'appearance'}},
    {name: 'default receiver', screen: 'now-playing', receiverStyle: 'gallop-fine'},
    {name: 'scene', screen: 'now-playing', receiverStyle: 'manhattan'},
    {name: 'mono scene', screen: 'now-playing', receiverStyle: 'manhattan', props: {theme: 'mono'}}
  ])('$name', baseline => capture(baseline, sizes[0], profiles[0], true));
});

function capture(baseline: BaselineCase, size: (typeof sizes)[number], profile: (typeof profiles)[number], includeColor = false): void {
  inkChalk.level = profile.noColor ? 0 : 3;
  const layout = computeTerminalLayout(size.columns, size.rows);
  const baselineLibrary = baseline.props?.library ?? library;
  const renderLibrary: LibraryState = {
    ...baselineLibrary,
    settings: {...baselineLibrary.settings, theme: baseline.props?.theme ?? baselineLibrary.settings.theme, asciiMode: profile.ascii, receiverStyle: baseline.receiverStyle ?? baselineLibrary.settings.receiverStyle}
  };
  const display = resolveDisplayMode(renderLibrary.settings, profile.noColor ? {NO_COLOR: '1'} : {});
  const props: ContentProps = {
    airPlayDevices: [{id: 'living-room', name: 'Living Room', host: 'speaker.local', port: 7000, txt: [], requiresPassword: true, airplay2: true}],
    airPlayCode: '1234', appVersion: '0.2.3', backends: ['mpv', 'airplay'],
    countryFilter: '', diagnostics: {backend: 'mpv', availableBackends: ['mpv', 'airplay'], preferredBackend: 'auto', active: true, volume: 70, muted: false, ready: true, startedAt: '2026-09-07T11:30:00.000Z'},
    displayStations: [station, otherStation], editingCountryFilter: false, editingSearch: true,
    exploreCursor: defaultExploreCursor, favoriteKeys: new Set(['radio-browser:kexp']), filterLabel: 'none',
    filteredCountries: [{name: 'United States', code: 'US', stationCount: 12_345}, {name: 'Japan', code: 'JP', stationCount: 456}],
    frameWidth: layout.frameWidth, layout, library: renderLibrary, loadingCountries: false, loadingStations: false,
    nowPlaying: {title: 'Bjork - Joga', updatedAt: now}, playback, playingStation: station,
    providerHealth: {'radio-browser': 'online', 'radio-garden': 'disabled'}, searchQuery: 'tokyo jazz',
    screen: baseline.screen, settingsPage: 'root', selected: 0, showDiagnostics: false,
    sleepLabel: 'Sleep off', stationContext: {title: baseline.screen === 'library' ? 'Library' : baseline.screen === 'nearby' ? 'Nearby' : baseline.screen === 'stations' ? 'United States' : 'Explore', subtitle: 'Saved and discovered stations', stations: [station, otherStation]},
    stationFavorite: true, stationTime: '12:00', storePath: '/fixture/radiocli.json', theme: 'green',
    updateCheck: {checkedAt: now, currentVersion: '0.2.3', latestVersion: '0.3.0', updateAvailable: true},
    alarmTui: {
      draft: draftFromAlarm(alarm), editorField: 'label', editingField: false, editorControl: null,
      timeSegment: 'hour', weekdayIndex: 0, validationError: null, saving: false,
      pickerChoices: alarmPickerChoices([alarm], [station], [otherStation], library.recent, station, false),
      pickerFallback: false, runtime, verification: null, activeAlarms, activeSelected: 0,
      snoozeMinutes: 10, busyAlarmIds: new Set(), itemCount: () => undefined,
      handleInput: () => false, openForStation: () => undefined, openActive: () => undefined,
      ...baseline.alarm
    },
    ...baseline.props
  };
  props.library = renderLibrary;
  // Match App's content viewport. renderToString runs the real Ink renderer and
  // tears down its Yoga tree and effects after capturing the initial frame.
  const frame = renderToString(
    <DisplayContext.Provider value={display}>
      <Box height={layout.contentRows} width={layout.frameWidth} flexDirection="column" overflowY="hidden" flexShrink={0} backgroundColor={display.app}>
        <AppContent {...props} />
      </Box>
    </DisplayContext.Provider>,
    {columns: layout.frameWidth}
  );
  const lines = stripVTControlCharacters(frame).split('\n');
  expect(lines.length).toBeLessThanOrEqual(layout.contentRows);
  expect(frame).not.toContain('Unknown screen.');
  if (profile.noColor) expect(frame).not.toContain('\u001B[');
  const snapshot = includeColor ? frame.replaceAll('\u001B', '<ESC>') : stripVTControlCharacters(frame);
  expect(snapshot.split('\n').map(line => line.trimEnd()).join('\n')).toMatchSnapshot();
}
