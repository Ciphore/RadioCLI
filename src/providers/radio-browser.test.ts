import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ProviderCache} from './cache.js';
import {RadioBrowserProvider} from './radio-browser.js';

const roots: string[] = [];

describe('RadioBrowserProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();

    for (const root of roots.splice(0)) {
      rmSync(root, {recursive: true, force: true});
    }
  });

  it('normalizes, dedupes, filters, and scores search results deterministically', async () => {
    const fetch = mockFetch(url => {
      const searchBy = ['name', 'tag', 'country', 'language'].find(key => url.searchParams.has(key));
      expect(url.searchParams.get('codec')).toBe('MP3');
      expect(url.searchParams.get('language')).toBe('English');
      expect(url.searchParams.get('hidebroken')).toBe('true');

      if (searchBy === 'name') {
        return jsonResponse([
          {
            stationuuid: 'tokyo-jazz',
            name: '  Tokyo   Jazz FM  ',
            url_resolved: ' https://stream.example.com/resolved.mp3 ',
            url: 'https://stream.example.com/raw.mp3',
            homepage: ' https://station.example.com ',
            favicon: ' https://station.example.com/icon.png ',
            tags: 'jazz, tokyo, city, late night, piano, live, public, fm, extra',
            country: ' Japan ',
            countrycode: 'jp',
            state: ' Tokyo ',
            language: 'English, Japanese',
            languagecodes: 'en, ja',
            votes: 42,
            codec: 'MP3',
            bitrate: 192,
            hls: 1,
            lastcheckok: true,
            clickcount: 25,
            geo_lat: 35.6762,
            geo_long: 139.6503
          },
          {
            stationuuid: 'low-bitrate',
            name: 'Tokyo Jazz Low',
            tags: 'jazz,tokyo',
            country: 'Japan',
            countrycode: 'JP',
            language: 'English',
            codec: 'MP3',
            bitrate: 64,
            clickcount: 100
          }
        ]);
      }

      if (searchBy === 'tag') {
        return jsonResponse([
          {
            stationuuid: 'tokyo-jazz',
            name: 'Duplicate Tokyo Jazz',
            tags: 'jazz',
            country: 'Japan',
            countrycode: 'JP',
            language: 'English',
            codec: 'MP3',
            bitrate: 192,
            clickcount: 9000
          },
          {
            stationuuid: 'popular-jazz',
            name: 'Popular Beats',
            tags: 'jazz',
            country: 'United States',
            countrycode: 'US',
            language: 'English',
            codec: 'MP3',
            bitrate: 256,
            clickcount: 1_000_000
          }
        ]);
      }

      return jsonResponse([]);
    });

    const provider = new RadioBrowserProvider(['https://primary.example'], cacheForTest());
    const results = await provider.search('Tokyo Jazz', {limit: 5, codec: 'MP3', language: 'English', minBitrate: 128});

    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls.every(([input]) => new URL(String(input)).searchParams.get('offset') === '0')).toBe(true);
    expect(results.map(station => station.id)).toEqual(['tokyo-jazz', 'popular-jazz']);
    expect(results[0]).toMatchObject({
      provider: 'radio-browser',
      name: 'Tokyo Jazz FM',
      country: 'Japan',
      countryCode: 'JP',
      state: 'Tokyo',
      language: 'English, Japanese',
      languageCodes: ['en', 'ja'],
      codec: 'MP3',
      bitrate: 192,
      streamUrl: 'https://stream.example.com/resolved.mp3',
      homepage: 'https://station.example.com',
      hls: true,
      lastCheckedOk: true,
      latitude: 35.6762,
      longitude: 139.6503
    });
    expect(results[0]?.tags).toEqual(['jazz', 'tokyo', 'city', 'late night', 'piano', 'live', 'public', 'fm']);
  });

  it('builds a stable merged search page before applying the requested offset', async () => {
    const rows = Array.from({length: 12}, (_, index) => ({
      stationuuid: `station-${index}`,
      name: `Jazz Station ${index}`,
      url: `https://stream.example.com/${index}.mp3`,
      clickcount: 12 - index
    }));
    const fetch = mockFetch(url => {
      expect(url.searchParams.get('offset')).toBe('0');
      expect(url.searchParams.get('limit')).toBe('12');
      return jsonResponse(rows);
    });

    const provider = new RadioBrowserProvider(['https://primary.example'], cacheForTest());
    const results = await provider.search('Jazz', {limit: 2, offset: 10});

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(results.map(station => station.id)).toEqual(['station-10', 'station-11']);
  });

  it('bounds broad multi-word searches to ten directory requests', async () => {
    const fetch = mockFetch(() => jsonResponse([]));
    const provider = new RadioBrowserProvider(['https://primary.example'], cacheForTest());

    await provider.search('late night public jazz radio', {limit: 20});

    expect(fetch).toHaveBeenCalledTimes(10);
  });

  it('falls back across mirrors and reuses fresh cached responses', async () => {
    const fetch = mockFetch(url => {
      if (url.origin === 'https://primary.example') {
        return jsonResponse({message: 'unavailable'}, {status: 503, statusText: 'Service Unavailable'});
      }

      return jsonResponse([
        {name: 'Japan', iso_3166_1: 'jp', stationcount: 500},
        {name: 'Empty', iso_3166_1: 'zz', stationcount: 0}
      ]);
    });

    const provider = new RadioBrowserProvider(['https://primary.example', 'https://secondary.example'], cacheForTest());
    const countries = await provider.countries(10);

    expect(countries).toEqual([{name: 'Japan', code: 'JP', stationCount: 500}]);
    expect(fetch.mock.calls.map(([input]) => String(input))).toEqual([
      'https://primary.example/json/countries?hidebroken=true',
      'https://secondary.example/json/countries?hidebroken=true'
    ]);

    fetch.mockClear();
    await expect(provider.countries(10)).resolves.toEqual(countries);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns stale cached data when every mirror is offline', async () => {
    const cacheFile = cacheFileForTest();
    writeFileSync(
      cacheFile,
      JSON.stringify({
        version: 1,
        entries: {
          '/json/stations/search?hidebroken=true&limit=1&order=clickcount&reverse=true': {
            createdAt: Date.now() - 60 * 60 * 1000,
            value: [
              {
                stationuuid: 'cached-fm',
                name: 'Cached FM',
                tags: 'offline',
                url: 'https://cached.example.com/live.mp3',
                clickcount: 2
              }
            ]
          }
        }
      }),
      'utf8'
    );
    const fetch = mockFetch(() => {
      throw new Error('network offline');
    });

    const provider = new RadioBrowserProvider(['https://primary.example', 'https://secondary.example'], new ProviderCache(cacheFile));
    const stations = await provider.popular(1);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(stations).toHaveLength(1);
    expect(stations[0]).toMatchObject({
      id: 'cached-fm',
      name: 'Cached FM',
      streamUrl: 'https://cached.example.com/live.mp3'
    });
  });

  it('uses stale cached startup results immediately in explicit offline mode', async () => {
    vi.stubEnv('RADIOCLI_OFFLINE', '1');
    const cache = cachedEntry('/json/stations/search?hidebroken=true&limit=1&order=clickcount&reverse=true', [
      {stationuuid: 'offline-fm', name: 'Offline FM', url: 'https://stream.example/live.mp3'}
    ], Date.now() - 60 * 60 * 1000);
    const fetch = mockFetch(() => {throw new Error('Network must not be attempted.');});
    const provider = new RadioBrowserProvider(['https://primary.example', 'https://secondary.example'], cache);
    expect(await provider.popular(1)).toMatchObject([{id: 'offline-fm', streamUrl: 'https://stream.example/live.mp3'}]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports an offline cache miss without trying a mirror', async () => {
    vi.stubEnv('RADIOCLI_OFFLINE', '1');
    const fetch = mockFetch(() => jsonResponse([]));
    const provider = new RadioBrowserProvider(['https://primary.example'], cacheForTest());
    await expect(provider.popular(1)).rejects.toThrow(/offline.*cache|cache.*offline/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not vote, locate, or resolve externally when offline and retains a supplied stream URL', async () => {
    vi.stubEnv('RADIOCLI_OFFLINE', '1');
    const fetch = mockFetch(() => {throw new Error('Network must not be attempted.');});
    const provider = new RadioBrowserProvider(['https://primary.example'], cacheForTest());
    const station = {...radioBrowserStation('saved'), streamUrl: 'https://stream.example/live.mp3'};
    expect(await provider.vote(station)).toBe(false);
    expect(await provider.detectLocation()).toBeNull();
    expect(await provider.resolve(station)).toEqual({url: station.streamUrl, name: station.name});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('avoids an uncached atlas in low-bandwidth mode while ordinary directory requests still work', async () => {
    vi.stubEnv('RADIOCLI_LOW_BANDWIDTH', '1');
    const fetch = mockFetch(() => jsonResponse([{stationuuid: 'small-list', name: 'Small list'}]));
    const provider = new RadioBrowserProvider(['https://primary.example'], cacheForTest());
    await expect(provider.nearby({latitude: 48.8, longitude: 2.3, source: 'test'})).rejects.toThrow(/low.bandwidth.*cache|cache.*low.bandwidth/i);
    expect(fetch).not.toHaveBeenCalled();
    expect(await provider.popular(1)).toMatchObject([{id: 'small-list'}]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(await provider.search('small', {limit: 1})).toMatchObject([{id: 'small-list'}]);
  });

  it('uses a bounded stale atlas in low-bandwidth mode without refreshing it', async () => {
    vi.stubEnv('RADIOCLI_LOW_BANDWIDTH', '1');
    const cache = cachedEntry('/json/stations/search?has_geo_info=true&hidebroken=true&limit=100000&order=name', [
      {stationuuid: 'cached-nearby', name: 'Cached nearby', geo_lat: 48.8, geo_long: 2.3}
    ], Date.now() - 7 * 60 * 60 * 1000);
    const fetch = mockFetch(() => jsonResponse([]));
    const provider = new RadioBrowserProvider(['https://primary.example'], cache);
    expect(await provider.nearby({latitude: 48.8, longitude: 2.3, source: 'test'}, 1)).toMatchObject([{id: 'cached-nearby'}]);
    expect(fetch).not.toHaveBeenCalled();
  });

  for (const host of ['127.0.0.1', '::1']) {
    it(`uses native fetch to read a real ${host} directory endpoint`, async context => {
      let requests = 0;
      const server = createServer((_request, response) => {requests += 1;response.end(JSON.stringify([{name: 'Japan', iso_3166_1: 'jp', stationcount: 1}]));});
      try {
        await new Promise<void>((resolve, reject) => {server.once('error', reject);server.listen(0, host, resolve);});
      } catch (error) {
        if (host === '::1' && ['EAFNOSUPPORT', 'EPROTONOSUPPORT', 'EADDRNOTAVAIL'].includes((error as NodeJS.ErrnoException).code ?? '')) context.skip('The host does not provide IPv6 loopback.');
        throw error;
      }
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('No listener address.');
        const provider = new RadioBrowserProvider([`http://${host === '::1' ? '[::1]' : host}:${address.port}`], cacheForTest());
        expect(await provider.countries()).toEqual([{name: 'Japan', code: 'JP', stationCount: 1}]);
        expect(requests).toBe(1);
      } finally {
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
    });
  }

  it('loads country stations with limit and offset pagination', async () => {
    const fetch = mockFetch(url => {
      expect(url.pathname).toBe('/json/stations/search');
      expect(url.searchParams.get('countrycode')).toBe('US');
      expect(url.searchParams.get('hidebroken')).toBe('true');
      expect(url.searchParams.get('limit')).toBe('120');
      expect(url.searchParams.get('offset')).toBe('240');
      expect(url.searchParams.get('order')).toBe('clickcount');
      expect(url.searchParams.get('reverse')).toBe('true');

      return jsonResponse([
        {
          stationuuid: 'third-page-fm',
          name: 'Third Page FM',
          country: 'United States',
          countrycode: 'US',
          clickcount: 10
        }
      ]);
    });

    const provider = new RadioBrowserProvider(['https://primary.example'], cacheForTest());
    const stations = await provider.byCountry('us', 120, 240);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(stations.map(station => station.id)).toEqual(['third-page-fm']);
  });

  it('ranks nearby stations from the full geotagged atlas instead of a popular subset', async () => {
    const fetch = mockFetch(url => {
      expect(url.pathname).toBe('/json/stations/search');
      expect(url.searchParams.get('hidebroken')).toBe('true');
      expect(url.searchParams.get('has_geo_info')).toBe('true');
      expect(url.searchParams.get('limit')).toBe('100000');
      expect(url.searchParams.get('order')).toBe('name');

      return jsonResponse([
        {
          stationuuid: 'tokyo-popular',
          name: 'Tokyo Popular',
          country: 'Japan',
          clickcount: 1_000_000,
          geo_lat: 35.6762,
          geo_long: 139.6503
        },
        {
          stationuuid: 'paris-local',
          name: 'Paris Local',
          country: 'France',
          clickcount: 0,
          geo_lat: 48.8566,
          geo_long: 2.3522
        },
        {
          stationuuid: 'paris-nearby',
          name: 'Paris Nearby',
          country: 'France',
          clickcount: 2,
          geo_lat: 48.86,
          geo_long: 2.35
        },
        {
          stationuuid: 'missing-geo',
          name: 'Missing Geo',
          country: 'France',
          clickcount: 999
        }
      ]);
    });

    const provider = new RadioBrowserProvider(['https://primary.example'], cacheForTest());
    const parisStations = await provider.nearby({latitude: 48.8566, longitude: 2.3522, source: 'test'}, 2);

    expect(parisStations.map(station => station.id)).toEqual(['paris-local', 'paris-nearby']);
    expect(parisStations[0]?.distanceKm).toBeCloseTo(0);
    expect(fetch).toHaveBeenCalledTimes(1);

    const tokyoStations = await provider.nearby({latitude: 35.6762, longitude: 139.6503, source: 'test'}, 1);
    expect(tokyoStations.map(station => station.id)).toEqual(['tokyo-popular']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('gives large atlas downloads a size-aware timeout before trying another mirror', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('atlas attempt aborted')), {once: true});
      })
    );
    vi.stubGlobal('fetch', fetch);
    const provider = new RadioBrowserProvider(
      ['https://primary.example', 'https://secondary.example'],
      cacheForTest()
    );

    const request = provider
      .nearby({latitude: 48.8566, longitude: 2.3522, source: 'test'}, 2)
      .then(() => null, error => error as Error);
    await vi.advanceTimersByTimeAsync(5_001);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(request).resolves.toMatchObject({message: expect.stringMatching(/Radio Browser unavailable/)});
    vi.useRealTimers();
  });

  it('upvotes Radio Browser stations and ignores non-Radio-Browser stations', async () => {
    const fetch = mockFetch(url => {
      expect(url.pathname).toBe('/json/vote/tokyo-jazz');
      return jsonResponse({ok: true, message: 'voted'});
    });

    const provider = new RadioBrowserProvider(['https://primary.example'], cacheForTest());

    await expect(provider.vote(radioBrowserStation('tokyo-jazz'))).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);

    await expect(provider.vote({...radioBrowserStation('imported'), provider: 'playlist'})).resolves.toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('sends a User-Agent that carries the package version', async () => {
    let sentUserAgent: string | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        sentUserAgent = new Headers(init?.headers).get('User-Agent') ?? undefined;
        return jsonResponse({ok: true});
      })
    );

    const provider = new RadioBrowserProvider(['https://primary.example'], cacheForTest());
    await provider.vote(radioBrowserStation('tokyo-jazz'));

    expect(sentUserAgent).toMatch(/^radiocli\/\d+\.\d+\.\d+/);
  });
});

function radioBrowserStation(id: string): import('../types.js').Station {
  return {id, provider: 'radio-browser', name: id, tags: []};
}

function mockFetch(handler: (url: URL) => Response | Promise<Response>): ReturnType<typeof vi.fn> {
  const fetch = vi.fn((input: RequestInfo | URL) => handler(new URL(String(input))));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers: {'content-type': 'application/json'}
  });
}

function cacheForTest(): ProviderCache {
  return new ProviderCache(cacheFileForTest());
}

function cachedEntry(key: string, value: unknown, createdAt: number): ProviderCache {
  const file = cacheFileForTest();
  writeFileSync(file, JSON.stringify({version: 1, entries: {[key]: {createdAt, value}}}));
  return new ProviderCache(file);
}

function cacheFileForTest(): string {
  const root = mkdtempSync(join(tmpdir(), 'radiocli-provider-'));
  roots.push(root);
  return join(root, 'cache.json');
}
