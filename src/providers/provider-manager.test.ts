import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {AppSettings, DiscoveryPage} from '../types.js';
import {ProviderCache} from './cache.js';
import {ProviderManager} from './provider-manager.js';
import {RadioBrowserProvider} from './radio-browser.js';
import {RadioGardenProvider} from './radio-garden.js';

const roots: string[] = [];
const settings = {enableRadioGarden: true} as AppSettings;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true});
});

describe('federated discovery cursors', () => {
  it('retains Browser overflow after a mixed page instead of skipping rows 60–89', async () => {
    const fetch = catalog(180, 30);
    const providers = manager();
    const first = await providers.searchPage('Jazz', settings, {limit: 90});
    expect(first.items.filter(station => station.provider === 'radio-browser')).toHaveLength(60);
    const second = await providers.searchPage('Jazz', settings, {limit: 90, cursor: first.nextCursor});
    expect(second.items[0]?.id).toBe('s60');
    expect(second.items.map(item => item.id)).toEqual(Array.from({length: 90}, (_, index) => `s${index + 60}`));
    const third = await providers.searchPage('Jazz', settings, {limit: 90, cursor: second.nextCursor});
    expect(third.items.map(item => item.id)).toEqual(Array.from({length: 30}, (_, index) => `s${index + 150}`));
    expect(third.exhausted).toBe(true);
    const all = [first, second, third].flatMap(page => page.items);
    expect(all).toHaveLength(210);
    expect(new Set(all.map(station => `${station.provider}:${station.id}`)).size).toBe(210);
    expect(fetch.mock.calls.filter(([url]) => String(url).startsWith('https://garden.example'))).toHaveLength(1);
    expect(third.sources.find(source => source.provider === 'radio-garden')).toMatchObject({source: 'search-snapshot', consumed: 30, exhausted: true});
  });

  it('drains all Garden response hits beyond the first page without refetching the snapshot', async () => {
    const fetch = catalog(12, 100);
    const providers = manager();
    const pages: DiscoveryPage[] = [];
    let cursor: string | undefined;
    do {
      const page = await providers.searchPage('Jazz', settings, {limit: 10, cursor});
      pages.push(page);
      cursor = page.nextCursor;
      if (pages.length > 15) throw new Error('Pagination did not terminate.');
    } while (cursor);
    const all = pages.flatMap(page => page.items);
    expect(all.filter(station => station.provider === 'radio-browser')).toHaveLength(12);
    expect(all.filter(station => station.provider === 'radio-garden')).toHaveLength(100);
    expect(new Set(all.map(station => `${station.provider}:${station.id}`)).size).toBe(112);
    expect(fetch.mock.calls.filter(([url]) => String(url).startsWith('https://garden.example'))).toHaveLength(1);
  });

  it('keeps legacy displayed offsets correct when experimental results are enabled', async () => {
    catalog(180, 30);
    const providers = manager();
    const first = await providers.search('Jazz', settings, {limit: 90});
    const second = await providers.search('Jazz', settings, {limit: 90, offset: 90});
    expect(first).toHaveLength(90);
    expect(second.map(item => item.id)).toEqual(Array.from({length: 90}, (_, index) => `s${index + 60}`));
  });

  it('does not admit unverified Garden stations through explicit bitrate, codec, language or country filters', async () => {
    catalog(12, 10);
    const providers = manager();
    for (const filters of [{minBitrate: 128}, {codec: 'MP3'}, {language: 'English'}, {countryCode: 'US'}]) {
      const page = await providers.searchPage('Jazz', settings, {limit: 4, ...filters});
      expect(page.items).toHaveLength(4);
      expect(page.items.every(station => station.provider === 'radio-browser')).toBe(true);
    }
  });

  it('retries a failed optional source without losing the primary continuation', async () => {
    let failGarden = true;
    catalog(6, 2, () => { if (failGarden) throw new Error('Garden temporarily unavailable'); });
    const providers = manager();
    const first = await providers.searchPage('Jazz', settings, {limit: 4});
    expect(first.items.map(station => station.id)).toEqual(['s0', 's1', 's2', 's3']);
    expect(first.sources.find(source => source.provider === 'radio-garden')).toMatchObject({status: 'unavailable', exhausted: false});
    failGarden = false;
    const second = await providers.searchPage('Jazz', settings, {limit: 4, cursor: first.nextCursor});
    expect(new Set(second.items.map(station => station.id))).toEqual(new Set(['s4', 's5', 'g0', 'g1']));
    expect(second.exhausted).toBe(true);
  });

  it('cancels both provider requests rather than waiting for their full deadlines', async () => {
    const signals: AbortSignal[] = [];
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    vi.stubGlobal('fetch', vi.fn((_url: unknown, init?: RequestInit) => {
      signals.push(init!.signal!);
      if (signals.length === 3) started();
      return new Promise<Response>(() => undefined);
    }));
    const controller = new AbortController();
    const request = manager().searchPage('Jazz', settings, {limit: 4, signal: controller.signal});
    await ready;
    controller.abort();
    await expect(request).rejects.toMatchObject({name: 'AbortError'});
    expect(signals).toHaveLength(3);
    expect(signals.every(signal => signal.aborted)).toBe(true);
  });
});

function manager(): ProviderManager {
  const root = mkdtempSync(join(tmpdir(), 'radiocli-federation-'));
  roots.push(root);
  return new ProviderManager(
    new RadioBrowserProvider(['https://directory.example'], new ProviderCache(join(root, 'cache.json'))),
    new RadioGardenProvider('https://garden.example/api')
  );
}

function catalog(browserCount: number, gardenCount: number, beforeGarden?: () => void) {
  const rows = Array.from({length: browserCount}, (_, index) => ({stationuuid: `s${index}`, name: `Jazz ${index}`, clickcount: 1000 - index, codec: 'MP3', language: 'English', countrycode: 'US', bitrate: 192}));
  const hits = Array.from({length: gardenCount}, (_, index) => ({_source: {type: 'channel', title: `Garden ${index}`, url: `/listen/jazz/g${index}`}}));
  const fetch = vi.fn((input: string | URL) => {
    const url = new URL(String(input));
    if (url.hostname === 'garden.example') {
      beforeGarden?.();
      return Response.json({hits});
    }
    const offset = Number(url.searchParams.get('offset'));
    const limit = Number(url.searchParams.get('limit'));
    return Response.json(rows.slice(offset, offset + limit));
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
