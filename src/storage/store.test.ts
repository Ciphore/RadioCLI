import {mkdtempSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {JsonLibraryStore} from './store.js';
import {defaultReceiverStyle, receiverStyleNames, themeNames, type Station} from '../types.js';

const roots: string[] = [];
const originalRadioCliHome = process.env.RADIOCLI_HOME;
const originalRadioAtlasHome = process.env.RADIO_ATLAS_HOME;

describe('JsonLibraryStore', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, {recursive: true, force: true});
    }

    restoreEnv('RADIOCLI_HOME', originalRadioCliHome);
    restoreEnv('RADIO_ATLAS_HOME', originalRadioAtlasHome);
  });

  it('persists recents, favorites, and settings', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    const station: Station = {
      id: 'station-1',
      provider: 'radio-browser',
      name: 'Test FM',
      tags: ['test']
    };

    const store = new JsonLibraryStore(file);
    store.addRecent(station);
    store.startListeningSession(station, new Date('2026-05-24T12:00:00.000Z'));
    store.finishActiveListeningSession(new Date('2026-05-24T12:05:00.000Z'));
    store.toggleFavorite(station);
    store.addImported([{...station, id: 'custom-1', provider: 'playlist', streamUrl: 'https://example.com/live'}]);
    store.updateSettings({
      theme: 'amber',
      receiverStyle: 'mesh',
      preferredBackend: 'airplay',
      preferredAirPlayDevice: '5CAAFD0046D4@Office',
      mediaKeys: {previous: ['prev'], playPause: ['pause'], next: ['next']}
    });

    const reloaded = new JsonLibraryStore(file).snapshot();
    expect(reloaded.recent[0]?.station.name).toBe('Test FM');
    expect(reloaded.activity.sessions[0]?.listenedSeconds).toBe(300);
    expect(reloaded.favorites[0]?.id).toBe('station-1');
    expect(reloaded.imported[0]?.id).toBe('custom-1');
    expect(reloaded.settings.theme).toBe('amber');
    expect(reloaded.settings.receiverStyle).toBe('mesh');
    expect(reloaded.settings.receiverStyleVersion).toBe(2);
    expect(reloaded.settings.preferredBackend).toBe('airplay');
    expect(reloaded.settings.preferredAirPlayDevice).toBe('5CAAFD0046D4@Office');
    expect(reloaded.settings.mediaKeys.next).toEqual(['next']);
  });

  it('backs up corrupt store files before resetting', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    writeFileSync(file, '{not json', 'utf8');
    const store = new JsonLibraryStore(file);
    expect(store.snapshot().settings.theme).toBe('green');
    expect(store.snapshot().settings.receiverStyle).toBe(defaultReceiverStyle);
    expect(store.snapshot().activity.sessions).toEqual([]);
    expect(readdirSync(root).some(name => name.startsWith('library.json.bad-'))).toBe(true);
  });

  it.each(['scope', 'spectrum', 'oscilloscope', 'motion-bars', 'radar', 'tuning-dial', 'cassette', `${'term'}${'flix'}-plasma`, 'sierpinksi'])(
    'migrates removed receiver style %s to the default receiver style',
    receiverStyle => {
      const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
      roots.push(root);
      const file = join(root, 'library.json');
      writeFileSync(
        file,
        JSON.stringify({
          recent: [],
          favorites: [],
          imported: [],
          activity: {sessions: []},
          settings: {
            theme: 'ruby',
            receiverStyle,
            volume: 70,
            enableRadioGarden: false,
            enableNearbyLocation: false,
            preferredBackend: 'auto',
            tuneTimeoutSeconds: 12,
            skipBrokenStreams: true
          }
        }),
        'utf8'
      );

      const state = new JsonLibraryStore(file).snapshot();
      expect(state.settings.theme).toBe('ruby');
      expect(state.settings.receiverStyle).toBe(defaultReceiverStyle);
      expect(state.settings.receiverStyleVersion).toBe(2);
      expect(state.settings.mediaKeys).toEqual({previous: [], playPause: [], next: []});
    }
  );

  it('defaults missing preferred AirPlay device to undefined', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    writeFileSync(
      file,
      JSON.stringify({
        recent: [],
        favorites: [],
        imported: [],
        activity: {sessions: []},
        settings: {
          theme: 'ruby',
          receiverStyle: 'mesh',
          volume: 70,
          enableRadioGarden: false,
          enableNearbyLocation: false,
          preferredBackend: 'auto',
          tuneTimeoutSeconds: 12,
          skipBrokenStreams: true
        }
      }),
      'utf8'
    );

    expect(new JsonLibraryStore(file).snapshot().settings.preferredAirPlayDevice).toBeUndefined();
  });

  it('persists every receiver style exposed by the UI cycle', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    const store = new JsonLibraryStore(file);

    for (const receiverStyle of receiverStyleNames) {
      store.updateSettings({receiverStyle});
      expect(new JsonLibraryStore(file).snapshot().settings.receiverStyle).toBe(receiverStyle);
    }
  });

  it('persists every display color exposed by the UI cycle', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    const file = join(root, 'library.json');
    const store = new JsonLibraryStore(file);

    for (const theme of themeNames) {
      store.updateSettings({theme});
      expect(new JsonLibraryStore(file).snapshot().settings.theme).toBe(theme);
    }
  });

  it('uses the new RADIOCLI_HOME override', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    process.env.RADIOCLI_HOME = root;

    const store = new JsonLibraryStore();
    expect(store.filePath).toBe(join(root, 'radiocli.json'));
  });

  it('still accepts the old RADIO_ATLAS_HOME override for existing setups', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-'));
    roots.push(root);
    process.env.RADIO_ATLAS_HOME = root;

    const store = new JsonLibraryStore();
    expect(store.filePath).toBe(join(root, 'radio-atlas.json'));
  });

});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
