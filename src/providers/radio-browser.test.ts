import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ProviderCache} from './cache.js';
import {RadioBrowserProvider} from './radio-browser.js';

const roots: string[] = [];

describe('RadioBrowserProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();

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
});

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

function cacheFileForTest(): string {
  const root = mkdtempSync(join(tmpdir(), 'radiocli-provider-'));
  roots.push(root);
  return join(root, 'cache.json');
}
