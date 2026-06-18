import {render} from 'ink-testing-library';
import {describe, expect, it} from 'vitest';
import type {AppSettings, PlaybackDiagnostics, PlaybackState, Station, TrackPlay} from '../../types.js';
import {DisplayContext, resolveDisplayMode} from '../display-context.js';
import {HelpScreen} from './HelpScreen.js';
import {NowPlayingScreen} from './NowPlayingScreen.js';
import {SettingsScreen} from './SettingsScreen.js';
import {ExploreScreen} from './ExploreScreen.js';
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
