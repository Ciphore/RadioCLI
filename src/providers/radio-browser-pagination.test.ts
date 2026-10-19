import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {DiscoveryPage, Station} from '../types.js';
import {ProviderCache} from './cache.js';
import {RadioBrowserProvider} from './radio-browser.js';

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true});
});

describe('Radio Browser discovery cursors', () => {
  it('cancels location lookup and an abandoned atlas request without returning a fallback result', async () => {
    for (const operation of ['location', 'nearby'] as const) {
      const controller = new AbortController();
      let start!: (signal: AbortSignal) => void;
      const started = new Promise<AbortSignal>(resolve => { start = resolve; });
      vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
        start(init.signal);
        init.signal.addEventListener('abort', () => reject(init.signal.reason), {once: true});
      })));
      const browser = provider();
      const pending = operation === 'location' ? browser.detectLocation({signal: controller.signal})
        : browser.nearby({latitude: 48, longitude: 2, source: 'test'}, 10, {signal: controller.signal});
      const assertion = expect(pending).rejects.toMatchObject({name: 'AbortError'});
      const signal = await started;
      controller.abort();
      await assertion;
      expect(signal.aborted).toBe(true);
    }
  });

  it('keeps a shared atlas request alive for the remaining nearby caller', async () => {
    let respond!: (response: Response) => void;
    let start!: () => void;
    const started = new Promise<void>(resolve => { start = resolve; });
    let requestSignal: AbortSignal | undefined;
    const fetch = vi.fn((_url, init) => new Promise<Response>(resolve => {
      requestSignal = init.signal; respond = resolve; start();
    }));
    vi.stubGlobal('fetch', fetch);
    const browser = provider();
    const controller = new AbortController();
    const location = {latitude: 48, longitude: 2, source: 'test'};
    const first = browser.nearby(location, 1, {signal: controller.signal});
    const assertion = expect(first).rejects.toMatchObject({name: 'AbortError'});
    const second = browser.nearby(location, 1);
    await started;
    controller.abort();
    await assertion;
    expect(requestSignal?.aborted).toBe(false);
    respond(new Response(JSON.stringify([{...row(1), geo_lat: 48, geo_long: 2}])));
    expect(await second).toMatchObject([{id: 's1'}]);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('rejects an oversized atlas instead of silently truncating nearby coverage', async () => {
    serve(() => new Response(JSON.stringify(Array.from({length: 100_001}, () => null))));
    await expect(provider().nearby({latitude: 48, longitude: 2, source: 'test'})).rejects.toThrow('row limit');
  });

  it('applies minimum bitrate before the directory limit in both APIs', async () => {
    const rows = Array.from({length: 180}, (_, index) => row(index, {bitrate: index < 90 ? 32 : 128}));
    const fetch = serve(url => {
      expect(url.searchParams.get('bitrateMin')).toBe('128');
      return slice(rows.filter(item => item.bitrate >= Number(url.searchParams.get('bitrateMin'))), url);
    });
    const browser = provider();
    expect((await browser.search('Jazz', {limit: 90, minBitrate: 128})).map(item => item.id)).toEqual(rows.slice(90).map(item => item.stationuuid));
    const first = await browser.searchPage('Jazz', {limit: 90, minBitrate: 128});
    expect(first.items).toHaveLength(90);
    expect(first.exhausted).toBe(false);
    const final = await browser.searchPage('Jazz', {limit: 90, minBitrate: 128, cursor: first.nextCursor});
    expect(final).toMatchObject({items: [], exhausted: true});
    expect(final.nextCursor).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('consumes each name/tag source independently and retains ranked overflow', async () => {
    const all = Array.from({length: 30}, (_, index) => row(index));
    const offsets: Record<string, number[]> = {name: [], tag: []};
    serve(url => {
      const source = url.searchParams.has('name') ? 'name' : 'tag';
      offsets[source]!.push(Number(url.searchParams.get('offset')));
      return slice(source === 'name' ? all.slice(0, 18) : all.slice(12), url);
    });
    const browser = provider();
    const pages = await drain(cursor => browser.searchPage('Jazz', {limit: 5, cursor}));
    const ids = pages.flatMap(page => page.items.map(item => item.id));
    expect(ids).toHaveLength(30);
    expect(new Set(ids)).toEqual(new Set(all.map(item => item.stationuuid)));
    expect(pages[0]?.items.map(item => item.id)).toEqual(all.slice(0, 5).map(item => item.stationuuid));
    expect(offsets).toEqual({name: [0, 5, 10, 15], tag: [0, 5, 10, 15]});
    expect(pages.at(-1)?.sources).toEqual([
      {provider: 'radio-browser', source: 'name', consumed: 18, exhausted: true, status: 'available', message: undefined},
      {provider: 'radio-browser', source: 'tag', consumed: 18, exhausted: true, status: 'available', message: undefined}
    ]);
  });

  it('advances country offsets by raw rows when normalization and deduplication remove entries', async () => {
    const rows: unknown[] = [row(0), null, row(0), {bad: true}, row(1), row(2), row(3), row(3), row(4), row(5)];
    const offsets: number[] = [];
    serve(url => {
      expect(url.searchParams.get('countrycode')).toBe('US');
      offsets.push(Number(url.searchParams.get('offset')));
      return slice(rows, url);
    });
    const browser = provider();
    const pages = await drain(cursor => browser.byCountryPage('us', {limit: 3, cursor}));
    expect(pages.flatMap(page => page.items.map(item => item.id))).toEqual(['s0', 's1', 's2', 's3', 's4', 's5']);
    expect(offsets).toEqual([0, 3, 6, 9]);
    expect(pages.at(-1)?.sources[0]).toMatchObject({consumed: 10, exhausted: true});
  });

  it('returns a continuation after a bounded scan of invalid rows', async () => {
    const rows = [...Array.from({length: 12}, () => ({bad: true})), row(99)];
    serve(url => slice(rows, url));
    const browser = provider();
    const first = await browser.byCountryPage('US', {limit: 3});
    expect(first).toMatchObject({items: [], exhausted: false, nextCursor: expect.any(String)});
    expect(first.sources[0]?.consumed).toBe(12);
    const second = await browser.byCountryPage('US', {limit: 3, cursor: first.nextCursor});
    expect(second.items.map(item => item.id)).toEqual(['s99']);
    expect(second.exhausted).toBe(true);
  });

  it('keeps unavailable sources retryable while returning useful partial results', async () => {
    let failTag = true;
    serve(url => {
      if (url.searchParams.has('tag')) {
        if (failTag) throw new Error('directory offline');
        return slice([row(20), row(21)], url);
      }
      return slice([row(0), row(1), row(2)], url);
    });
    const browser = provider();
    const first = await browser.searchPage('Jazz', {limit: 2});
    expect(first.items.map(item => item.id)).toEqual(['s0', 's1']);
    expect(first.sources.find(source => source.source === 'tag')).toMatchObject({consumed: 0, exhausted: false, status: 'unavailable'});
    failTag = false;
    const remaining = await drain(cursor => browser.searchPage('Jazz', {limit: 2, cursor}), first.nextCursor);
    expect(remaining.flatMap(page => page.items.map(item => item.id))).toEqual(['s2', 's20', 's21']);
    expect(remaining.at(-1)?.sources.every(source => source.status === 'available')).toBe(true);
  });

  it('rejects filter changes against an existing cursor', async () => {
    serve(url => slice(Array.from({length: 5}, (_, index) => row(index)), url));
    const browser = provider();
    const first = await browser.searchPage('Jazz', {limit: 2});
    await expect(browser.searchPage('Jazz', {limit: 2, minBitrate: 128, cursor: first.nextCursor})).rejects.toThrow(/does not match/);
  });

  it('aborts a resolve without converting cancellation into fallback playback', async () => {
    const controller = new AbortController();
    const reason = new DOMException('User stopped playback', 'AbortError');
    let observedSignal: AbortSignal | null | undefined;
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    vi.stubGlobal('fetch', vi.fn((_url: unknown, init?: RequestInit) => {
      observedSignal = init?.signal;
      started();
      return new Promise<Response>(() => undefined);
    }));
    const resolving = provider().resolve({id: 'one', name: 'One', provider: 'radio-browser', tags: [], streamUrl: 'https://saved.example/live'}, {signal: controller.signal});
    await ready;
    controller.abort(reason);
    await expect(resolving).rejects.toBe(reason);
    expect(observedSignal?.aborted).toBe(true);
  });

  it('coalesces matching reads without letting one cancelled caller abort another', async () => {
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    let release!: (response: Response) => void;
    let sharedSignal: AbortSignal | null | undefined;
    const fetch = vi.fn((_url: unknown, init?: RequestInit) => {
      sharedSignal = init?.signal;
      started();
      return new Promise<Response>(resolve => { release = resolve; });
    });
    vi.stubGlobal('fetch', fetch);
    const browser = provider();
    const controller = new AbortController();
    const first = browser.byCountryPage('US', {limit: 3, signal: controller.signal});
    await ready;
    const second = browser.byCountryPage('US', {limit: 3});
    controller.abort();
    await expect(first).rejects.toMatchObject({name: 'AbortError'});
    expect(sharedSignal?.aborted).toBe(false);
    release(Response.json([row(1)]));
    expect((await second).items.map(item => item.id)).toEqual(['s1']);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('rolls back source progress when a later page is aborted and safely replays retries', async () => {
    const rows = Array.from({length: 6}, (_, index) => row(index));
    let delayPage = false;
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const fetch = serve(url => {
      if (delayPage && url.searchParams.get('offset') === '2') {
        started();
        return new Promise<Response>(() => undefined);
      }
      return slice(rows, url);
    });
    const browser = provider();
    const first = await browser.byCountryPage('US', {limit: 2});
    delayPage = true;
    const controller = new AbortController();
    const pending = browser.byCountryPage('US', {limit: 2, cursor: first.nextCursor, signal: controller.signal});
    await ready;
    controller.abort();
    await expect(pending).rejects.toMatchObject({name: 'AbortError'});
    delayPage = false;
    const second = await browser.byCountryPage('US', {limit: 2, cursor: first.nextCursor});
    expect(second.items.map(item => item.id)).toEqual(['s2', 's3']);
    const callCount = fetch.mock.calls.length;
    const replay = await browser.byCountryPage('US', {limit: 2, cursor: first.nextCursor});
    expect(replay).toEqual(second);
    expect(fetch).toHaveBeenCalledTimes(callCount);
  });
});

function provider(): RadioBrowserProvider {
  const root = mkdtempSync(join(tmpdir(), 'radiocli-cursors-'));
  roots.push(root);
  return new RadioBrowserProvider(['https://directory.example'], new ProviderCache(join(root, 'cache.json')));
}

function row(index: number, values: {bitrate?: number} = {}) {
  return {stationuuid: `s${index}`, name: `Jazz ${index}`, clickcount: 1000 - index, bitrate: 192, ...values};
}

function slice(rows: unknown[], url: URL): Response {
  const offset = Number(url.searchParams.get('offset'));
  const limit = Number(url.searchParams.get('limit'));
  return Response.json(rows.slice(offset, offset + limit));
}

function serve(handler: (url: URL) => Response | Promise<Response>) {
  const fetch = vi.fn((input: string | URL) => handler(new URL(String(input))));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

async function drain(load: (cursor?: string) => Promise<DiscoveryPage>, initial?: string): Promise<DiscoveryPage[]> {
  const pages: DiscoveryPage[] = [];
  let cursor = initial;
  do {
    const page = await load(cursor);
    pages.push(page);
    if (page.exhausted) break;
    expect(page.nextCursor).toBeTypeOf('string');
    cursor = page.nextCursor;
    if (pages.length > 30) throw new Error('Pagination did not terminate.');
  } while (cursor);
  const items: Station[] = pages.flatMap(page => page.items);
  expect(new Set(items.map(station => `${station.provider}:${station.id}`)).size).toBe(items.length);
  return pages;
}
