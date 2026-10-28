import {mkdtempSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {stationFromUrl} from '../playlists/playlist.js';
import {JsonLibraryStore, stationKey} from './store.js';
import {LibraryRepository} from './repository.js';

const roots: string[] = [];
const file = () => {
  const root = mkdtempSync(join(tmpdir(), 'radiocli-repository-'));
  roots.push(root);
  return join(root, 'library.json');
};
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true}); });

describe('station identity and fresh library reads', () => {
  it('does not let a competing process replace a live writer whose lock looks old', async () => {
    const path = file(); const gate = `${path}.continue`;
    const store = new JsonLibraryStore(path); store.updateSettings({theme: 'amber'});
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
      import fs from 'node:fs';
      import {syncBuiltinESMExports} from 'node:module';
      import {JsonLibraryStore} from ${JSON.stringify(new URL('./store.ts', import.meta.url).href)};
      const sync = fs.fsyncSync; let held = false;
      fs.fsyncSync = fd => {
        if (!held) {
          held = true; process.stdout.write('locked\\n');
          const deadline = Date.now() + 10000;
          while (!fs.existsSync(${JSON.stringify(gate)})) {
            if (Date.now() > deadline) throw new Error('Fixture timed out');
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
          }
        }
        sync(fd);
      };
      syncBuiltinESMExports();
      new JsonLibraryStore(${JSON.stringify(path)}).toggleFavorite({id:'slow',provider:'radio-browser',name:'Slow writer',tags:[]});
    `], {stdio: ['ignore', 'pipe', 'pipe']});
    const exited = once(child, 'exit'); let diagnostic = ''; child.stderr.on('data', data => { diagnostic += String(data); });
    try {
      const ready = new Promise<void>((resolve, reject) => {
        child.stdout.once('data', () => resolve()); child.once('error', reject);
        child.once('exit', () => reject(new Error(`Writer exited before holding lock: ${diagnostic}`)));
      });
      await ready;
      utimesSync(`${path}.lock`, new Date(0), new Date(0));
      const station = {id: 'competing', provider: 'radio-browser' as const, name: 'Competing writer', tags: []};
      expect(() => store.toggleFavorite(station)).toThrow(expect.objectContaining({code: 'EBUSY'}));
      writeFileSync(gate, 'continue'); expect((await exited)[0], diagnostic).toBe(0);
      store.toggleFavorite(station);
      expect(new JsonLibraryStore(path).snapshot().favorites.map(item => item.id).sort()).toEqual(['competing', 'slow']);
    } finally {
      if (child.exitCode === null) { child.kill(); await exited; }
    }
  }, 15_000);

  it('retains both streams that collided under the legacy hash', () => {
    const store = new JsonLibraryStore(file());
    const a = stationFromUrl('https://example.test/Aa');
    const b = stationFromUrl('https://example.test/BB');
    expect(a.id).not.toBe(b.id);
    store.addImported([a, b]);
    store.toggleFavorite(a); store.toggleFavorite(b);
    expect(store.snapshot().imported).toHaveLength(2);
    expect(store.snapshot().favorites).toHaveLength(2);
  });

  it('migrates embedded references and unambiguous track keys without changing arbitrary IDs', () => {
    const path = file();
    const station = {...stationFromUrl('https://example.test/Aa'), id: 'custom-4bf0e7aa'};
    writeFileSync(path, JSON.stringify({favorites: [station], imported: [station],
      recent: [{station, playedAt: '2026-10-03T00:00:00Z'}], presets: [{name: 'radio', station}],
      trackHistory: [{title: 'Song', stationKey: 'playlist:custom-4bf0e7aa', stationName: 'Radio', at: '2026-10-03T00:00:00Z'}],
      activity: {sessions: [{id: 'session', station, startedAt: '2026-10-03T00:00:00Z', listenedSeconds: 0}]}}));
    const state = new JsonLibraryStore(path).snapshot();
    expect(state.favorites[0]?.legacyIds).toEqual(['custom-4bf0e7aa']);
    expect(state.presets?.[0]?.station.id).toBe(state.favorites[0]?.id);
    expect(state.recent[0]?.station.id).toBe(state.favorites[0]?.id);
    expect(state.activity.sessions[0]?.station.id).toBe(state.favorites[0]?.id);
    expect(state.trackHistory[0]?.stationKey).toBe(stationKey(state.favorites[0]!));
    expect(new JsonLibraryStore(path).snapshot().activity.sessions[0]?.endedAt).toBeUndefined();
  });

  it('refreshes external settings while retaining a live AirPlay selection', () => {
    const path = file();
    const reader = new JsonLibraryStore(path);
    reader.updateSettings({preferredBackend: 'airplay'});
    const writer = new JsonLibraryStore(path);
    writer.updateSettings({theme: 'amber', agentControl: {...writer.settings().agentControl!, enabled: true}});
    expect(reader.settings()).toMatchObject({theme: 'amber', preferredBackend: 'airplay', agentControl: {enabled: true}});
    writer.updateSettings({agentControl: {...writer.settings().agentControl!, enabled: false}});
    expect(reader.settings().agentControl?.enabled).toBe(false);
  });

  it('retains the current AirPlay output through library and alarm writes, while allowing an explicit local output', () => {
    const path = file(); const store = new JsonLibraryStore(path);
    const station = stationFromUrl('https://example.test/live');
    store.updateSettings({preferredBackend: 'airplay', preferredAirPlayDevice: 'receiver'});
    store.toggleFavorite(station);
    store.updateSettings({theme: 'amber'});
    const alarm = store.addAlarm({label: 'Radio', enabled: true, station,
      schedule: {type: 'once', at: '2030-01-01T12:00:00.000Z'},
      playback: {volume: 70, fadeSeconds: 0, stopAfterMinutes: 30},
      reliability: {missedRunGraceMinutes: 5, wakeIfSupported: false}});
    store.toggleAlarm(alarm.id, false);
    store.removeAlarm(alarm.id);
    expect(store.settings()).toMatchObject({preferredBackend: 'airplay', preferredAirPlayDevice: 'receiver', theme: 'amber'});
    expect(new JsonLibraryStore(path).settings().preferredBackend).toBe('auto');
    store.updateSettings({preferredBackend: 'auto'});
    store.toggleFavorite(station);
    expect(store.settings().preferredBackend).toBe('auto');
  });
});

describe('asynchronous library repository', () => {
  it.each([true, false])('publishes display color preference changes with worker=%s', async worker => {
    const path = file(); const writer = new JsonLibraryStore(path);
    writer.updateSettings({theme: 'jade'});
    const repository = new LibraryRepository(new JsonLibraryStore(path), {worker});
    try {
      await repository.readFresh();
      writeFileSync(`${path}.theme.json`, JSON.stringify({version: 1, theme: 'pine', libraryTheme: 'green'}));
      await expect.poll(() => repository.settings().theme, {timeout: 5000}).toBe('pine');
      await repository.updateSettings({volume: 42});
      expect(new JsonLibraryStore(path).settings()).toMatchObject({theme: 'pine', volume: 42});
      expect(JSON.parse(readFileSync(path, 'utf8')).settings.theme).toBe('green');
    } finally { await repository.close(); }
  }, 10_000);

  it.each([
    {worker: true, suffix: 'receiver.json', receiverStyle: 'mesh'},
    {worker: false, suffix: 'receiver.json', receiverStyle: 'mesh'},
    {worker: true, suffix: 'receiver-v2.json', receiverStyle: 'boat-lake'},
    {worker: false, suffix: 'receiver-v2.json', receiverStyle: 'boat-lake'}
  ] as const)('publishes $suffix changes with worker=$worker', async ({worker, suffix, receiverStyle}) => {
    const path = file(); const writer = new JsonLibraryStore(path);
    writer.updateSettings({receiverStyle: 'ultracode'});
    const repository = new LibraryRepository(new JsonLibraryStore(path), {worker});
    try {
      await repository.readFresh();
      writeFileSync(`${path}.${suffix}`, JSON.stringify({version: 1, receiverStyle, libraryReceiverStyle: 'ultracode'}));
      await expect.poll(() => repository.settings().receiverStyle, {timeout: 5000}).toBe(receiverStyle);
      await repository.updateSettings({volume: 42});
      expect(new JsonLibraryStore(path).settings()).toMatchObject({receiverStyle, volume: 42});
    } finally { await repository.close(); }
  }, 10_000);

  it('keeps acknowledged receiver output after history writes and fresh snapshots', async () => {
    const path = file(); const repository = new LibraryRepository(new JsonLibraryStore(path));
    try {
      await repository.updateSettings({preferredBackend: 'airplay', preferredAirPlayDevice: 'receiver'});
      await repository.addRecent(stationFromUrl('https://example.test/live'));
      await repository.updateSettings({theme: 'amber'});
      expect((await repository.readFresh()).settings).toMatchObject({preferredBackend: 'airplay', preferredAirPlayDevice: 'receiver'});
      expect(new JsonLibraryStore(path).settings().preferredBackend).toBe('auto');
    } finally { await repository.close(); }
  }, 15_000);

  it('drains admitted writes on close and rejects writes after the barrier', async () => {
    const path = file(); const repository = new LibraryRepository(new JsonLibraryStore(path));
    const saved = repository.updateSettings({volume: 23});
    const closed = repository.close();
    await expect(repository.updateSettings({volume: 99})).rejects.toThrow('closed');
    await Promise.all([saved, closed]);
    expect(new JsonLibraryStore(path).settings().volume).toBe(23);
    expect(repository.close()).toBe(closed);
  }, 15_000);

  it('publishes external writes when the worker is unavailable', async () => {
    const path = file(); const store = new JsonLibraryStore(path); store.updateSettings({volume: 23});
    const repository = new LibraryRepository(store, {worker: false});
    try {
      new JsonLibraryStore(path).updateSettings({theme: 'amber'});
      await new Promise<void>(resolve => { const unsubscribe = repository.subscribe(() => { unsubscribe(); resolve(); }); });
      expect(repository.settings().theme).toBe('amber');
    } finally { await repository.close(); }
  });

  it('acknowledges persisted, ordered mutations and merges another writer', async () => {
    const path = file();
    const repository = new LibraryRepository(new JsonLibraryStore(path));
    try {
      await repository.readFresh();
      const first = repository.updateSettings({theme: 'amber'});
      const second = repository.addImported([stationFromUrl('https://example.test/live')]);
      await Promise.all([first, second]);
      new JsonLibraryStore(path).updateSettings({volume: 33});
      expect((await repository.readFresh()).settings).toMatchObject({theme: 'amber', volume: 33});
      expect(repository.getSnapshot().imported).toHaveLength(1);
    } finally { await repository.close(); }
  }, 15_000);

  it('keeps the caller event loop responsive while another writer holds the lock', async () => {
    const path = file();
    const repository = new LibraryRepository(new JsonLibraryStore(path));
    try {
      await repository.readFresh();
      mkdirSync(`${path}.lock`);
      const save = repository.updateSettings({volume: 19});
      await new Promise(resolve => setTimeout(resolve, 40));
      rmSync(`${path}.lock`, {recursive: true});
      await save;
      expect(new JsonLibraryStore(path).settings().volume).toBe(19);
    } finally { rmSync(`${path}.lock`, {recursive: true, force: true}); await repository.close(); }
  }, 15_000);
});
