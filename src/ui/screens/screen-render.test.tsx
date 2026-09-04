import {render} from 'ink-testing-library';
import {describe, expect, it} from 'vitest';
import type {AppSettings, LibraryState, PlaybackDiagnostics, PlaybackState, Station, TrackPlay} from '../../types.js';
import {DisplayContext, resolveDisplayMode} from '../display-context.js';
import {HelpScreen} from './HelpScreen.js';
import {NowPlayingScreen} from './NowPlayingScreen.js';
import {SettingsScreen} from './SettingsScreen.js';
import {HomeScreen} from './HomeScreen.js';
import {ExploreScreen} from './ExploreScreen.js';
import {CountriesScreen} from './CountriesScreen.js';
import {StationScreen} from './StationScreen.js';
import {buildContributionGraph, contributionLevel, contributionScaleSeconds, StatsScreen} from './StatsScreen.js';
import {settingsGroups, settingsItems} from '../screen-items.js';
import {defaultExploreCursor} from '../app-state.js';
import {StationList} from '../components/StationList.js';
import {displayWidth} from '../format.js';

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
        diagnostics={diagnostics}
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
  shareDirectoryVotes: true,
  preferredBackend: 'auto',
  tuneTimeoutSeconds: 12,
  skipBrokenStreams: true,
  mediaKeys: {previous: [], playPause: [], next: []},
  resumeOnLaunch: true,
  asciiMode: true,
  reduceMotion: false,
  transparentBackground: false
};

const library: LibraryState = {
  recent: [],
  favorites: [station],
  imported: [],
  activity: {sessions: []},
  trackHistory: [],
  searchHistory: [],
  alarms: [],
  settings
};

describe('HomeScreen rendering', () => {
  it('does not repeat playback status already shown in the app header', () => {
    const frame = render(<HomeScreen selected={0} theme="green" library={library} />).lastFrame() ?? '';

    expect(frame).not.toContain('Receiver:');
    expect(frame).not.toContain('paused · mpv');
  });
});

describe('StationList rendering', () => {
  it('replaces standard metadata with selected-station tags on the same row', () => {
    const frame = render(
      <StationList
        stations={[station]}
        selected={0}
        theme="green"
        favorites={new Set<string>()}
        pageSize={1}
        width={80}
        showCount={false}
      />
    ).lastFrame() ?? '';

    expect(frame.split('\n')).toHaveLength(1);
    expect(frame).toContain('indie');
    expect(frame).not.toContain('United States');
    expect(frame).not.toContain('MP3');
  });
});

describe('SettingsScreen rendering', () => {
  it('orders settings into a user-centered hierarchy', () => {
    expect(settingsGroups.map(group => group.label)).toEqual([
      'Playback',
      'Display',
      'Discovery & privacy',
      'Data',
      'Media keys',
      'Maintenance'
    ]);
    expect(settingsItems.indexOf('Audio output')).toBeLessThan(settingsItems.indexOf('Cycle display color'));
    expect(settingsItems.indexOf('Export preferences and library')).toBeLessThan(settingsItems.indexOf('Check for updates'));
  });

  it('shows export and import together in the Data section', () => {
    const settingsIndex = Math.max(0, settingsItems.indexOf('Export preferences and library'));
    const frame = render(
      <SettingsScreen
        selected={settingsIndex}
        settings={settings}
        appVersion="0.1.9"
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
    ).lastFrame() ?? '';

    expect(frame).toContain('Data');
    expect(frame).toMatch(/> Export preferences and library\s+JSON backup/);
    expect(frame).toMatch(/Import preferences and library\s+restore JSON backup/);
    expect(frame).not.toMatch(/Export preferences and library {8,}JSON backup/);
    const valueColumns = ([
      ['ASCII-safe display', 'on'],
      ['Reduce motion', 'off'],
      ['Mouse and trackpad scrolling', 'auto'],
      ['Nearby location', 'off'],
      ['Radio Garden adapter', 'off'],
      ['Export preferences and library', 'JSON backup'],
      ['Import preferences and library', 'restore JSON backup']
    ] as const).map(([label, value]) => {
      const line = frame.split('\n').find(candidate => candidate.includes(label)) ?? '';
      return line.lastIndexOf(value);
    });
    expect(new Set(valueColumns)).toEqual(new Set([39]));
  });

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

  it('keeps the mouse compatibility control beside the display controls', () => {
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
    expect(frame).toMatch(/  Mouse and trackpad scrolling\s+auto/);
  });
});

function renderExplore(asciiMode: boolean, width = 100, height = 24) {
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
        width={width}
        height={height}
      />
    </DisplayContext.Provider>
  );
}

describe('Explore world map rendering', () => {
  it('keeps one gutter row between the subtitle and the map/list panels', () => {
    const lines = (renderExplore(false).lastFrame() ?? '').split('\n');

    expect(lines[2]).toBe('');
    expect(lines[3]).toContain('┌');
  });

  it('rasterizes land with braille glyphs by default', () => {
    const frame = renderExplore(false).lastFrame() ?? '';
    expect(/[⠀-⣿]/.test(frame)).toBe(true);
  });

  it('replaces braille with ASCII in ASCII-safe mode', () => {
    const frame = renderExplore(true).lastFrame() ?? '';
    expect(/[⠀-⣿]/.test(frame)).toBe(false);
  });

  it('shows the station loading state exactly once', () => {
    const mode = resolveDisplayMode({}, {});
    const frame = render(
      <DisplayContext.Provider value={mode}>
        <ExploreScreen
          title="Explore"
          subtitle="Scanning"
          stations={[]}
          selected={0}
          loading
          theme="green"
          favorites={new Set<string>()}
          filterLabel="none"
          cursor={defaultExploreCursor}
          pageSize={8}
          width={100}
          height={24}
        />
      </DisplayContext.Provider>
    ).lastFrame() ?? '';

    expect(frame.match(/Loading stations/g)).toHaveLength(1);
  });

  it('keeps intermediate-width map and stations side-by-side inside the frame', () => {
    const frame = renderExplore(false, 68, 17).lastFrame() ?? '';
    const panelLine = frame.split('\n').find(line => line.includes('┌') && line.indexOf('┌') !== line.lastIndexOf('┌'));

    expect(panelLine).toBeDefined();
    expect(frame).toContain('KEXP');
    expect(Math.max(...frame.split('\n').map(displayWidth))).toBeLessThanOrEqual(68);
  });

  it('does not describe provider errors as an empty nearby result', () => {
    const frame = render(
      <StationScreen
        title="Nearby"
        subtitle="Approximate location"
        stations={[]}
        selected={0}
        loading={false}
        error="Could not load nearby stations."
        theme="green"
        favorites={new Set<string>()}
        filterLabel="none"
        pageSize={8}
        width={80}
      />
    ).lastFrame() ?? '';

    expect(frame).toContain('Could not load nearby stations.');
    expect(frame).not.toContain('No nearby stations found.');
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
    expect(frame).toMatch(/\(TL\) {2}123,456,789 stations/);
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
      alarms: [],
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

    const lines = frame.split('\n');
    const activityTitle = lines.findIndex(line => line.includes('Activity —'));
    const activityBorderEnd = lines.findIndex((line, index) => index > activityTitle && line.startsWith('└'));
    expect(activityBorderEnd - activityTitle).toBe(10);
  });

  it('keeps gapless square contribution cells at every width', () => {
    const graph = buildContributionGraph([
      {date: '2026-01-01', seconds: 3600},
      {date: '2026-12-31', seconds: 0}
    ], 170);

    expect(graph.months).toContain('Jan');
    expect(graph.months).toContain('Dec');
    expect(graph.cellText).toBe('  ');
    expect(graph.cellGap).toBe('');
    expect(graph.tileHeight).toBe(1);
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
    expect(compactWidthGraph.cellText).toBe('  ');
    expect(compactWidthGraph.cellGap).toBe('');
    expect(compactWidthGraph.rows[0]?.cells.length).toBeLessThan(normalWidthGraph.rows[0]?.cells.length ?? 0);
  });

  it('uses a rolling prior-year activity window instead of anchoring to January', () => {
    const graph = buildContributionGraph([
      {date: '2025-08-01', seconds: 1800},
      {date: '2026-07-16', seconds: 3600}
    ], 170);

    expect(graph.year).toBe(2026);
    expect(graph.months).toMatch(/^\s*Aug/);
    expect(graph.months).toContain('Jul');
    expect(graph.rows.every(row => row.cells.every(cell => cell.visible))).toBe(true);
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
    const firstPage = render(<HelpScreen theme="green" width={80} height={24} selected={0} />).lastFrame() ?? '';
    const commandPage = render(<HelpScreen theme="green" width={80} height={24} selected={40} />).lastFrame() ?? '';

    expect(firstPage).toContain('Navigation');
    expect(firstPage).toContain('Playback');
    expect(firstPage).toContain('Toggle this help');
    expect(commandPage).toContain(':doctor');
    expect(commandPage).toContain('Show playback backend status');
  });
});

describe('NowPlayingScreen rendering', () => {
  it('keeps station identity in the receiver header instead of repeating it below', () => {
    const frame = renderNowPlaying(false, false).lastFrame() ?? '';
    const stationLines = frame.split('\n').filter(line => line.includes('KEXP 90.3 FM'));

    expect(stationLines).toHaveLength(1);
    expect(stationLines[0]).toContain('UNITED STATES');
    expect(frame).not.toContain('NET 128K MP3');
  });

  it('omits redundant receiver branding and stream summary rows', () => {
    const frame = renderNowPlaying(false, false).lastFrame() ?? '';

    expect(frame).not.toContain('RADIOCLI');
    expect(frame).not.toContain('MP3 · indie');
  });

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
