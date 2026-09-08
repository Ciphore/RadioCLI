import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {stripVTControlCharacters} from 'node:util';
import {act, type ComponentProps} from 'react';
import {Box, renderToString} from 'ink';
import {cleanup, render} from 'ink-testing-library';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {LibraryState, Screen, Station} from '../types.js';
import {AppContent} from './AppContent.js';
import {defaultExploreCursor} from './app-state.js';
import {defaultAlarmDraft} from './alarm-editor.js';
import {DisplayContext, resolveDisplayMode} from './display-context.js';
import {computeTerminalLayout} from './layout.js';
import * as visualizers from './visualizers/receiver-visualizers.js';

type ContentProps = ComponentProps<typeof AppContent>;
const station: Station = {id: 'world', provider: 'radio-browser', name: '東京 FM / Café', country: 'Japan', countryCode: 'JP', city: '東京', tags: ['jazz'], codec: 'MP3', bitrate: 128};
const library: LibraryState = {
  favorites: [station], recent: [], imported: [], activity: {sessions: []}, trackHistory: [], searchHistory: [], alarms: [],
  settings: {theme: 'green', receiverStyle: 'pulse-grid', volume: 70, enableRadioGarden: false, enableNearbyLocation: false, shareDirectoryVotes: true, preferredBackend: 'auto', tuneTimeoutSeconds: 12, skipBrokenStreams: true, mediaKeys: {previous: [], playPause: [], next: []}, resumeOnLaunch: false, asciiMode: false, reduceMotion: false, transparentBackground: false}
};
const inkRequire = createRequire(import.meta.resolve('ink'));
const inkChalk = (await import(pathToFileURL(inkRequire.resolve('chalk')).href)).default as {level: number};
const originalColorLevel = inkChalk.level;
const sizes = [{name: 'full', columns: 100, rows: 30}, {name: 'compact', columns: 50, rows: 16}, {name: 'micro', columns: 24, rows: 8}];
const routes: Screen[] = ['home', 'now-playing', 'library', 'search', 'countries', 'explore', 'map', 'nearby', 'stations', 'stats', 'settings', 'help', 'airplay-code', 'airplay-settings', 'alarms', 'alarm-editor', 'alarm-picker', 'alarm-ringing'];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-07T12:00:00.000Z'));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubEnv('INK_SCREEN_READER', 'false');
});
afterEach(() => {
  act(() => cleanup());
  inkChalk.level = originalColorLevel;
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('portable terminal rendering', () => {
  it.each(sizes)('preserves multilingual station and track data with ASCII decoration in $name', size => {
    const props = contentProps('now-playing', size);
    const display = resolveDisplayMode(library.settings, {LC_ALL: 'C', NO_COLOR: '1'});
    inkChalk.level = display.colorLevel;
    const frame = staticFrame(<DisplayContext.Provider value={display}><AppContent {...props} /></DisplayContext.Provider>, size.columns);
    expect(frame).toContain('東京 FM / Café');
    if (size.name !== 'micro') expect(frame).toContain('音楽 / Café');
    expect(frame).not.toMatch(/[\u2500-\u259f\u2800-\u28ff]/u);
    expect(frame).not.toContain('\u001B[');
  });

  it.each(sizes)('uses ASCII decoration across every route in $name', size => {
    const display = resolveDisplayMode(library.settings, {TERM: 'dumb'});
    inkChalk.level = display.colorLevel;
    for (const screen of routes) {
      const frame = staticFrame(<DisplayContext.Provider value={display}><AppContent {...contentProps(screen, size)} /></DisplayContext.Provider>, size.columns);
      expect(frame, screen).not.toMatch(/[\u2190-\u2193\u2500-\u259f\u2800-\u28ff·…›★☆∘◆“”]/u);
      expect(frame, screen).not.toContain('\u001B[');
    }
  });

  it.each(sizes)('hides receiver generation and renders readable screen-reader content in $name', async size => {
    const visualizer = vi.spyOn(visualizers, 'buildVisualizer');
    vi.stubEnv('INK_SCREEN_READER', 'true');
    const display = resolveDisplayMode(library.settings, {INK_SCREEN_READER: 'true'});
    const props = contentProps('now-playing', size);
    let view!: ReturnType<typeof render>;
    act(() => { view = render(<DisplayContext.Provider value={display}><AppContent {...props} /></DisplayContext.Provider>); });
    const frame = stripVTControlCharacters(view.lastFrame() ?? '');
    expect(visualizer).not.toHaveBeenCalled();
    expect(frame).toContain('東京 FM / Café');
    expect(frame).toContain('音楽 / Café');
    expect(frame.toLowerCase()).toContain('playing');
    expect(frame).not.toMatch(/[\u2500-\u259f\u2800-\u28ff]/u);
    const frames = view.frames.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(2400); });
    expect(view.frames).toHaveLength(frames);
  });

  it.each(['home', 'library', 'search', 'countries', 'explore', 'map', 'stats', 'settings', 'help', 'alarms', 'alarm-editor', 'alarm-picker', 'alarm-ringing'] as const)('retains the %s route in accessible output', screen => {
    vi.stubEnv('INK_SCREEN_READER', 'true');
    const display = resolveDisplayMode(library.settings, {INK_SCREEN_READER: 'true'});
    let view!: ReturnType<typeof render>;
    act(() => { view = render(<DisplayContext.Provider value={display}><AppContent {...contentProps(screen, sizes[0]!)} /></DisplayContext.Provider>); });
    const frame = stripVTControlCharacters(view.lastFrame() ?? '');
    expect(frame.trim()).not.toBe('');
    expect(frame).not.toContain('Unknown screen.');
    if (screen === 'home') {
      expect(frame).toContain('Playing');
      expect(frame).toContain('Settings');
      expect(frame).not.toContain('█');
    }
  });

  it.each([{TERM: 'dumb'}, {RADIOCLI_SCREEN_READER: '1'}])('stops compact station marquees with %j', async env => {
    const props = contentProps('library', sizes[2]!);
    props.displayStations = [{...station, name: `${station.name} — A long international station name that would scroll`}];
    const display = resolveDisplayMode(library.settings, env);
    let view!: ReturnType<typeof render>;
    act(() => { view = render(<DisplayContext.Provider value={display}><AppContent {...props} /></DisplayContext.Provider>); });
    const frames = view.frames.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(2400); });
    expect(view.frames).toHaveLength(frames);
  });

  it.each([{name: '16-color', env: {TERM: 'xterm'}, maximumLevel: 1}, {name: '256-color', env: {TERM: 'xterm-256color'}, maximumLevel: 2}])('keeps actual Ink colors within the $name terminal palette', ({env, maximumLevel}) => {
    const display = resolveDisplayMode(library.settings, env);
    inkChalk.level = display.colorLevel;
    const frame = staticFrame(<DisplayContext.Provider value={display}><Box backgroundColor={display.app}><AppContent {...contentProps('now-playing', sizes[0]!)} /></Box></DisplayContext.Provider>, 100);
    expect(frame).toContain('\u001B[');
    expect(frame).not.toMatch(/\u001B\[(?:38|48);2;/u);
    if (maximumLevel === 1) expect(frame).not.toMatch(/\u001B\[(?:38|48);5;/u);
    expect(stripVTControlCharacters(frame)).toContain('東京 FM / Café');
  });
});

function staticFrame(tree: Parameters<typeof renderToString>[0], columns: number): string {
  let frame = '';
  act(() => { frame = renderToString(tree, {columns}); });
  return frame;
}

function contentProps(screen: Screen, size: {columns: number; rows: number}): ContentProps {
  const layout = computeTerminalLayout(size.columns, size.rows);
  return {
    airPlayDevices: [], airPlayCode: '', appVersion: '0.2.3', backends: ['mpv'], countryFilter: '',
    diagnostics: {backend: 'mpv', availableBackends: ['mpv'], preferredBackend: 'auto', active: true, volume: 70, muted: false, ready: true},
    displayStations: [station], editingCountryFilter: false, editingSearch: true,
    exploreCursor: defaultExploreCursor, favoriteKeys: new Set(['radio-browser:world']), filterLabel: 'none',
    filteredCountries: [{name: 'Japan', code: 'JP', stationCount: 456}], frameWidth: layout.frameWidth, layout, library,
    loadingCountries: false, loadingStations: false, nowPlaying: {title: '音楽 / Café', updatedAt: '2026-09-07T12:00:00.000Z'},
    playback: {backend: 'mpv', state: 'playing', volume: 70, muted: false, ready: true}, playingStation: station, providerHealth: {},
    searchQuery: '東京', screen, settingsPage: 'root', selected: 0, showDiagnostics: false, sleepLabel: 'Sleep off',
    stationContext: {title: 'Library', subtitle: 'Saved stations', stations: [station]}, stationFavorite: true, stationTime: '12:00', storePath: '/fixture/radiocli.json', theme: 'green',
    alarmTui: {
      draft: defaultAlarmDraft(station), editorField: 'label', editingField: false, editorControl: null, timeSegment: 'hour', weekdayIndex: 0,
      validationError: null, saving: false, pickerChoices: [], pickerFallback: false, runtime: null, verification: null, activeAlarms: [], activeSelected: 0,
      snoozeMinutes: 10, busyAlarmIds: new Set(), itemCount: () => undefined, handleInput: () => false, openForStation: () => undefined, openActive: () => undefined
    }
  };
}
