import {render} from 'ink-testing-library';
import {describe, expect, it} from 'vitest';
import {receiverStyleNames} from '../types.js';
import type {
  AirPlayDevice,
  AppSettings,
  Country,
  LibraryState,
  PlaybackDiagnostics,
  PlaybackState,
  ReceiverStyle,
  Screen,
  Station
} from '../types.js';
import {AdaptiveContent} from './AdaptiveContent.js';
import {DisplayContext, resolveDisplayMode} from './display-context.js';
import {displayWidth} from './format.js';
import {defaultExploreCursor} from './app-state.js';

const station: Station = {
  id: 'kexp',
  provider: 'radio-browser',
  name: 'KEXP 90.3 FM — A deliberately long station name',
  city: 'Seattle',
  country: 'United States',
  codec: 'MP3',
  bitrate: 128,
  tags: ['indie']
};
const secondStation: Station = {
  ...station,
  id: 'kcrw',
  name: 'KCRW 89.9 FM'
};
const thirdStation: Station = {
  ...station,
  id: 'kuow',
  name: 'KUOW 94.9 FM'
};

const country: Country = {name: 'United States', code: 'US', stationCount: 12_345};
const device: AirPlayDevice = {
  id: 'living-room',
  name: 'Living Room',
  host: 'speaker.local',
  port: 7000,
  txt: [],
  requiresPassword: false,
  airplay2: true
};
const settings: AppSettings = {
  theme: 'green',
  receiverStyle: 'pulse-grid',
  volume: 70,
  enableRadioGarden: false,
  enableNearbyLocation: false,
  shareDirectoryVotes: true,
  preferredBackend: 'auto',
  tuneTimeoutSeconds: 12,
  skipBrokenStreams: true,
  mediaKeys: {previous: [], playPause: [], next: []},
  resumeOnLaunch: true,
  asciiMode: false,
  reduceMotion: false,
  transparentBackground: false
};
const library: LibraryState = {
  favorites: [station],
  recent: [{station, playedAt: '2026-08-09T00:00:00.000Z'}],
  imported: [],
  activity: {
    sessions: [{
      id: 'listen',
      station,
      startedAt: '2026-08-09T00:00:00.000Z',
      endedAt: '2026-08-09T01:00:00.000Z',
      listenedSeconds: 3600
    }]
  },
  trackHistory: [],
  searchHistory: [],
  alarms: [],
  settings
};
const playback: PlaybackState = {
  backend: 'mpv',
  state: 'playing',
  volume: 70,
  muted: false,
  ready: true
};
const diagnostics: PlaybackDiagnostics = {
  backend: 'mpv',
  availableBackends: ['mpv'],
  preferredBackend: 'auto',
  active: true,
  volume: 70,
  muted: false,
  ready: true
};

const screens: Screen[] = [
  'home',
  'now-playing',
  'library',
  'explore',
  'search',
  'countries',
  'nearby',
  'map',
  'stations',
  'stats',
  'settings',
  'airplay-settings',
  'airplay-code',
  'help'
];

describe('AdaptiveContent', () => {
  it.each([
    {mode: 'compact' as const, width: 50, height: 10},
    {mode: 'micro' as const, width: 20, height: 7}
  ])('keeps every screen inside a $width-column $mode frame', ({mode, width, height}) => {
    for (const screen of screens) {
      const frame = renderAdaptive(screen, mode, width, height);
      const lines = frame.split('\n');
      expect(lines.length, screen).toBeLessThanOrEqual(height);
      expect(Math.max(...lines.map(displayWidth)), screen).toBeLessThanOrEqual(width);
    }
  });

  it('keeps useful content instead of replacing constrained screens with warnings', () => {
    expect(renderAdaptive('stats', 'micro', 24, 7)).toContain('Listening');
    expect(renderAdaptive('settings', 'compact', 42, 10)).toContain('Automatic');
    expect(renderAdaptive('now-playing', 'micro', 24, 7)).toContain('KEXP');
    expect(renderAdaptive('search', 'micro', 24, 7)).toContain('tokyo jazz');
  });

  it.each([
    {mode: 'compact' as const, width: 50, height: 10},
    {mode: 'micro' as const, width: 24, height: 7}
  ])('keeps the favorite mark visible in $mode station lists', ({mode, width, height}) => {
    const frame = renderAdaptive('library', mode, width, height);
    expect(frame).toContain('★');
    expect(frame.match(/★/gu)).toHaveLength(1);
  });

  it('keeps a real search field in micro mode without an editing label', () => {
    const frame = renderAdaptive('search', 'micro', 24, 7);

    expect(frame).toContain('┌──────────────────────┐');
    expect(frame).toContain('│› tokyo jazz');
    expect(frame).not.toContain('Editing:');
  });

  it('keeps a detailed cursor map and selected station in true micro Explore', () => {
    const frame = renderAdaptive('explore', 'micro', 24, 7, settings.receiverStyle, [station, secondStation, thirdStation]);
    const lines = frame.split('\n');

    expect(frame).toContain('●');
    expect(frame).toContain('KEXP');
    expect(frame).toContain('KCRW');
    expect(frame).not.toContain('KUOW');
    expect(lines.filter(line => /[\u2801-\u28ff]/u.test(line))).toHaveLength(4);
    expect(Math.max(...lines.map(displayWidth))).toBeLessThanOrEqual(24);
  });

  it('allocates additional map detail as compact Explore grows', () => {
    const frame = renderAdaptive('explore', 'compact', 50, 16);

    expect(frame).toContain('RADIOCLI  Explore');
    expect(frame).toContain('●');
    expect(frame).toContain('KEXP');
    expect(frame.split('\n').filter(line => /[\u2801-\u28ff]/u.test(line)).length).toBeGreaterThanOrEqual(8);
  });

  it('separates micro headers and footers from page content and keeps the RadioCLI spectrum logo', () => {
    const home = renderAdaptive('home', 'micro', 20, 7);
    const nowPlaying = renderAdaptive('now-playing', 'micro', 20, 7);

    expect(home).toContain('RADIOCLI');
    expect(home).toMatch(/[█]{2,}/);
    expect(home.split('\n')[1]).toBe('');
    expect(home.split('\n').at(-1)).toBe('');
    expect(nowPlaying.split('\n')[1]).toBe('');
    expect(nowPlaying.split('\n').at(-1)).toBe('');
  });

  it.each(['library', 'countries', 'nearby', 'stats', 'settings'] as const)(
    'gives the %s micro screen matching space below its header and above its footer',
    screen => {
      const lines = renderAdaptive(screen, 'micro', 24, 7).split('\n');

      expect(lines[1]).toBe('');
      expect(lines.at(-1)).toBe('');
    }
  );

  it.each(['library', 'countries', 'nearby', 'stats', 'settings'] as const)(
    'gives the %s compact screen matching space below its header and above its footer',
    screen => {
      const lines = renderAdaptive(screen, 'compact', 50, 10).split('\n');

      expect(lines[2]).toBe('');
      expect(lines.at(-1)).toBe('');
    }
  );

  it('separates compact Overview, Now Playing, and Search content from their frames', () => {
    const home = renderAdaptive('home', 'compact', 50, 10).split('\n');
    const nowPlaying = renderAdaptive('now-playing', 'compact', 50, 10).split('\n');
    const search = renderAdaptive('search', 'compact', 50, 10).split('\n');

    expect(home[1]).toBe('');
    expect(home.at(-1)).toBe('');
    expect(nowPlaying[2]).toBe('');
    expect(nowPlaying.at(-1)).toBe('');
    expect(search[4]).toBe('');
    expect(search.at(-1)).toBe('');
  });

  it.each(receiverStyleNames)('renders the %s receiver style inside a 20x7 micro screen', receiverStyle => {
    const frame = renderAdaptive('now-playing', 'micro', 20, 7, receiverStyle);
    const lines = frame.split('\n');

    expect(frame).toContain('KEXP');
    expect(lines.length).toBeLessThanOrEqual(7);
    expect(Math.max(...lines.map(displayWidth))).toBeLessThanOrEqual(20);
  });
});

function renderAdaptive(
  screen: Screen,
  mode: 'compact' | 'micro',
  width: number,
  height: number,
  receiverStyle: ReceiverStyle = settings.receiverStyle,
  renderStations: Station[] = [station]
): string {
  const renderLibrary = {...library, settings: {...settings, receiverStyle}};
  return render(
    <DisplayContext.Provider value={resolveDisplayMode(settings, {})}>
      <AdaptiveContent
        mode={mode}
        screen={screen}
        selected={0}
        height={height}
        width={width}
        theme="green"
        playback={playback}
        playingStation={station}
        nowPlaying={{title: 'Artist — Track', updatedAt: '2026-08-09T00:00:00.000Z'}}
        stations={renderStations}
        countries={[country]}
        airPlayDevices={[device]}
        airPlayCode="1234"
        searchQuery="tokyo jazz"
        editingSearch
        countryFilter=""
        editingCountryFilter={false}
        loadingCountries={false}
        loadingStations={false}
        exploreCursor={defaultExploreCursor}
        library={renderLibrary}
        diagnostics={diagnostics}
        backends={['mpv']}
        favoriteKeys={new Set(['radio-browser:kexp'])}
        stationTitle="Library"
        filterLabel="none"
        sleepLabel="Sleep off"
      />
    </DisplayContext.Provider>
  ).lastFrame() ?? '';
}
