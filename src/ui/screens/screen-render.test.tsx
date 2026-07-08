import {render} from 'ink-testing-library';
import {describe, expect, it} from 'vitest';
import type {AppSettings, LibraryState, PlaybackDiagnostics, PlaybackState, Station, TrackPlay} from '../../types.js';
import {DisplayContext, resolveDisplayMode} from '../display-context.js';
import {HelpScreen} from './HelpScreen.js';
import {NowPlayingScreen} from './NowPlayingScreen.js';
import {SettingsScreen} from './SettingsScreen.js';
import {ExploreScreen} from './ExploreScreen.js';
import {CountriesScreen} from './CountriesScreen.js';
import {buildContributionGraph, contributionLevel, contributionScaleSeconds, StatsScreen} from './StatsScreen.js';
import {settingsItems} from '../screen-items.js';
import {defaultExploreCursor} from '../app-state.js';

const station: Station = {
  id: 'station-1',
  provider: 'radio-browser',
  name: 'KEXP 90.3 FM',
  country: 'United States',
  tags: ['indie'],
  codec: 'MP3',
  bitrate: 128
};

const playback: PlaybackState = {
  backend: 'mpv',
  state: 'idle',
  volume: 70,
  muted: false,
  ready: false
};

const diagnostics: PlaybackDiagnostics = {
  backend: 'mpv',
  availableBackends: ['mpv'],
  preferredBackend: 'auto',
  active: false,
  volume: 70,
  muted: false,
  ready: false
};

const trackHistory: TrackPlay[] = [
  {title: 'Bjork - Joga', stationKey: 'radio-browser:station-1', stationName: 'KEXP 90.3 FM', at: '2'},
  {title: 'Aphex Twin - Avril 14th', stationKey: 'radio-browser:station-1', stationName: 'KEXP 90.3 FM', at: '1'}
];

function renderNowPlaying(asciiMode: boolean, showDiagnostics: boolean) {
  const mode = resolveDisplayMode({asciiMode}, {});
  return render(
    <DisplayContext.Provider value={mode}>
      <NowPlayingScreen
        station={station}
        playback={playback}
        metadata={null}
        theme="green"
        favorite
        pulse={0}
        diagnostics={diagnostics}
        sleepLabel="Sleep off"
        showDiagnostics={showDiagnostics}
        stationTime="12:00"
        receiverStyle="pulse-grid"
        trackHistory={trackHistory}
        width={72}
        height={30}
      />
    </DisplayContext.Provider>
  );
}

const settings: AppSettings = {
  theme: 'green',
  receiverStyle: 'pulse-grid',
  volume: 70,
  enableRadioGarden: false,
  enableNearbyLocation: false,
  preferredBackend: 'auto',
  tuneTimeoutSeconds: 12,
  skipBrokenStreams: true,
  mediaKeys: {previous: [], playPause: [], next: []},
  resumeOnLaunch: true,
  asciiMode: true,
  reduceMotion: false,
  transparentBackground: false
};

describe('SettingsScreen rendering', () => {
  it('renders the new display and playback toggles with their values', () => {
    const settingsIndex = Math.max(0, settingsItems.indexOf('Resume last station on launch'));
    const {lastFrame} = render(
      <SettingsScreen
        selected={settingsIndex}
        settings={settings}
        appVersion="0.1.9"
        updateCheck={{checkedAt: '2026-07-07T00:00:00.000Z', currentVersion: '0.1.9', latestVersion: '0.1.9', updateAvailable: false}}
        storePath="/tmp/radiocli.json"
        playback={playback}
        backends={['mpv']}
        airPlayDevices={[]}
        providerHealth={{}}
        theme="green"
        diagnostics={diagnostics}
        width={80}
      />
    );
    const frame = lastFrame() ?? '';

    expect(frame).toContain('Resume last station on launch');
    expect(frame).toContain('ASCII-safe display');
    expect(frame).toContain('Reduce motion');
    expect(frame).toContain('Transparent background');
  });

  it('changes the update settings row when an update is available', () => {
    const settingsIndex = Math.max(0, settingsItems.indexOf('Check for updates'));
    const {lastFrame} = render(
      <SettingsScreen
        selected={settingsIndex}
        settings={settings}
        appVersion="0.1.9"
        updateCheck={{checkedAt: '2026-07-07T00:00:00.000Z', currentVersion: '0.1.9', latestVersion: '0.1.10', updateAvailable: true}}
        storePath="/tmp/radiocli.json"
        playback={playback}
        backends={['mpv']}
        airPlayDevices={[]}
        providerHealth={{}}
        theme="green"
        diagnostics={diagnostics}
        width={80}
      />
    );
    const frame = lastFrame() ?? '';

    expect(frame).toContain('Install update');
    expect(frame).toContain('v0.1.10 available');
  });

  it('keeps the selected update row visible in a constrained Settings pane', () => {
    const settingsIndex = Math.max(0, settingsItems.indexOf('Check for updates'));
    const {lastFrame} = render(
      <SettingsScreen
        selected={settingsIndex}
        settings={settings}
        appVersion="0.1.9"
        updateCheck={{checkedAt: '2026-07-07T00:00:00.000Z', currentVersion: '0.1.9', latestVersion: '0.1.9', updateAvailable: false}}
        storePath="/tmp/radiocli.json"
        playback={playback}
        backends={['mpv']}
        airPlayDevices={[]}
        providerHealth={{}}
        theme="green"
        diagnostics={diagnostics}
        width={80}
        height={18}
      />
    );
    const frame = lastFrame() ?? '';

    expect(frame).toContain('> Check for updates');
  });

  it('keeps Reduce motion visible between ASCII-safe display and update checks', () => {
    const settingsIndex = Math.max(0, settingsItems.indexOf('Reduce motion'));
    const {lastFrame} = render(
      <SettingsScreen
        selected={settingsIndex}
        settings={settings}
        appVersion="0.1.9"
        updateCheck={{checkedAt: '2026-07-07T00:00:00.000Z', currentVersion: '0.1.9', latestVersion: '0.1.9', updateAvailable: false}}
        storePath="/tmp/radiocli.json"
        playback={playback}
        backends={['mpv']}
        airPlayDevices={[]}
        providerHealth={{}}
        theme="green"
        diagnostics={diagnostics}
        width={80}
        height={18}
      />
    );
    const frame = lastFrame() ?? '';

    expect(frame).toContain('  ASCII-safe display');
    expect(frame).toContain('> Reduce motion');
    expect(frame).toContain('  Check for updates');
  });
});

function renderExplore(asciiMode: boolean) {
  const mode = resolveDisplayMode({asciiMode}, {});
  return render(
    <DisplayContext.Provider value={mode}>
      <ExploreScreen
        title="Explore"
        subtitle="Move a map cursor through geotagged stations"
        stations={[station]}
        selected={0}
        loading={false}
        theme="green"
        favorites={new Set<string>()}
        filterLabel=""
        cursor={defaultExploreCursor}
        pageSize={8}
        width={100}
        height={24}
      />
    </DisplayContext.Provider>
  );
}

describe('Explore world map rendering', () => {
  it('rasterizes land with braille glyphs by default', () => {
    const frame = renderExplore(false).lastFrame() ?? '';
    expect(/[⠀-⣿]/.test(frame)).toBe(true);
  });

  it('replaces braille with ASCII in ASCII-safe mode', () => {
    const frame = renderExplore(true).lastFrame() ?? '';
    expect(/[⠀-⣿]/.test(frame)).toBe(false);
  });
});

describe('CountriesScreen rendering', () => {
  it('keeps long country rows to one terminal line', () => {
    const frame = render(
      <CountriesScreen
        countries={[
          {
            name: 'The Extremely Long Democratic Republic Of The Country With A Very Long Name',
            code: 'TL',
            stationCount: 123456789
          }
        ]}
        selected={0}
        loading={false}
        filter=""
        editingFilter={false}
        theme="green"
        pageSize={1}
        width={48}
      />
    ).lastFrame() ?? '';

    expect(frame).toContain('>');
    expect(frame).toContain('…');
    expect(frame).not.toContain('Very Long Name');
  });
});

describe('StatsScreen rendering', () => {
  it('renders activity heatmap as large calendar-year cells with readable month labels', () => {
    const library: LibraryState = {
      recent: [],
      favorites: [],
      imported: [],
      trackHistory: [],
      searchHistory: [],
      activity: {
        sessions: [
          {
            id: 'listen',
            station,
            startedAt: new Date(2026, 4, 24, 12).toISOString(),
            endedAt: new Date(2026, 4, 24, 13).toISOString(),
            listenedSeconds: 3600
          }
        ]
      },
      settings
    };
    const frame = render(
      <DisplayContext.Provider value={resolveDisplayMode({asciiMode: false}, {})}>
        <StatsScreen library={library} theme="green" width={132} height={32} />
      </DisplayContext.Provider>
    ).lastFrame() ?? '';

    expect(frame).toContain('Jan');
    expect(frame).not.toContain('██');
  });

  it('starts the contribution graph at January and uses large cells when space allows', () => {
    const graph = buildContributionGraph([
      {date: '2026-01-01', seconds: 3600},
      {date: '2026-12-31', seconds: 0}
    ], 170);

    expect(graph.months.startsWith('Jan')).toBe(true);
    expect(graph.months).toContain('Dec');
    expect(graph.cellText).toBe('  ');
    expect(graph.cellGap).toBe('');
    expect(graph.tileHeight).toBe(2);
    expect(graph.rows[4]?.cells[0]).toMatchObject({
      level: 4,
      text: '  ',
      visible: true
    });
    expect(graph.rows[0]?.cells[0]).toMatchObject({
      level: 0,
      text: '  ',
      visible: true
    });
    expect(graph.rows[6]?.cells.at(-1)).toMatchObject({
      level: 0,
      text: '  ',
      visible: true
    });

    const normalWidthGraph = buildContributionGraph([
      {date: '2026-01-01', seconds: 3600},
      {date: '2026-12-31', seconds: 0}
    ], 128);
    expect(normalWidthGraph.cellText).toBe('  ');
    expect(normalWidthGraph.cellGap).toBe('');

    const compactWidthGraph = buildContributionGraph([
      {date: '2026-01-01', seconds: 3600},
      {date: '2026-12-31', seconds: 0}
    ], 80);
    expect(compactWidthGraph.cellText).toBe(' ');
    expect(compactWidthGraph.cellGap).toBe('');
  });

  it('uses one-line heatmap cells when the stats panel is height constrained', () => {
    const graph = buildContributionGraph([
      {date: '2026-01-01', seconds: 3600},
      {date: '2026-12-31', seconds: 0}
    ], 170, 20);

    expect(graph.cellText).toBe('  ');
    expect(graph.cellGap).toBe('');
    expect(graph.tileHeight).toBe(1);
  });

  it('caps contribution color scaling so one outlier does not flatten normal active days', () => {
    const days = [
      ...Array.from({length: 19}, (_, index) => ({date: `2026-05-${String(index + 1).padStart(2, '0')}`, seconds: 3600})),
      {date: '2026-05-20', seconds: 36_000}
    ];
    const scaleSeconds = contributionScaleSeconds(days);

    expect(scaleSeconds).toBe(3600);
    expect(contributionLevel(3600, scaleSeconds)).toBe(4);
    expect(contributionLevel(900, scaleSeconds)).toBe(2);
    expect(contributionLevel(0, scaleSeconds)).toBe(0);
  });
});

describe('HelpScreen rendering', () => {
  it('lists keybinding sections and : commands', () => {
    const {lastFrame} = render(<HelpScreen theme="green" width={80} />);
    const frame = lastFrame() ?? '';

    expect(frame).toContain('Navigation');
    expect(frame).toContain('Playback');
    expect(frame).toContain(':search');
    expect(frame).toContain(':doctor');
    expect(frame).toContain('Toggle this help');
  });
});

describe('NowPlayingScreen rendering', () => {
  it('shows recent tracks for the tuned station when diagnostics are open', () => {
    const {lastFrame} = renderNowPlaying(false, true);
    const frame = lastFrame() ?? '';

    expect(frame).toContain('Bjork - Joga');
    expect(frame).toContain('UNITED STATES');
  });

  it('uses Unicode box borders by default', () => {
    const {lastFrame} = renderNowPlaying(false, false);
    const frame = lastFrame() ?? '';

    expect(/[\u2500-\u257f]/.test(frame)).toBe(true);
  });

  it('emits only ASCII characters in ASCII-safe mode', () => {
    const {lastFrame} = renderNowPlaying(true, true);
    const frame = lastFrame() ?? '';

    expect(frame).toContain('Bjork - Joga');
    // No braille, block, box-drawing, or punctuation glyphs survive ASCII mode.
    expect(/[^\x00-\x7f]/.test(frame)).toBe(false);
  });
});
