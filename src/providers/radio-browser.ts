import {z} from 'zod';
import type {Country, LocationGuess, ResolvedStream, SearchOptions, Station} from '../types.js';
import {ProviderCache} from './cache.js';
import {userAgent} from '../version.js';
import {safeExternalHttpUrl, safeMediaTarget, sanitizeTerminalText} from '../safety.js';

const stationSchema = z.object({
  stationuuid: z.string(),
  name: z.string().default('Untitled station'),
  url_resolved: z.string().optional().nullable(),
  url: z.string().optional().nullable(),
  homepage: z.string().optional().nullable(),
  favicon: z.string().optional().nullable(),
  tags: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  countrycode: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  language: z.string().optional().nullable(),
  languagecodes: z.string().optional().nullable(),
  votes: z.number().optional().nullable(),
  codec: z.string().optional().nullable(),
  bitrate: z.number().optional().nullable(),
  hls: z.union([z.number(), z.boolean()]).optional().nullable(),
  lastcheckok: z.union([z.number(), z.boolean()]).optional().nullable(),
  clickcount: z.number().optional().nullable(),
  geo_lat: z.number().optional().nullable(),
  geo_long: z.number().optional().nullable()
});

const countrySchema = z.object({
  name: z.string(),
  iso_3166_1: z.string(),
  stationcount: z.number()
});

const clickResolveSchema = z.object({
  ok: z.boolean(),
  message: z.string().optional(),
  name: z.string().optional(),
  url: z.string().optional()
});

const locationSchema = z
  .object({
    city: z.string().optional(),
    region: z.string().optional(),
    country_name: z.string().optional(),
    country_code: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional()
  })
  .passthrough();

const geoAtlasLimit = 100_000;
const geoAtlasMaxAgeMs = 6 * 60 * 60 * 1000;
// The atlas is much larger than ordinary directory responses. A single shared
// 20-second deadline used to give each of four mirrors roughly five seconds to
// connect, download, and parse up to 100k rows. Use a size-aware per-attempt
// budget while retaining an overall bound and stale-cache fallback.
const geoAtlasAttemptTimeoutMs = 30_000;
const geoAtlasTotalTimeoutMs = 75_000;

class ProviderUnavailableError extends Error {
  constructor(message: string, cause?: Error) {
    super(message, cause ? {cause} : undefined);
    this.name = 'ProviderUnavailableError';
  }
}

export function isProviderUnavailableError(error: unknown): boolean {
  return error instanceof ProviderUnavailableError;
}

export class RadioBrowserProvider {
  readonly id = 'radio-browser' as const;
  readonly label = 'Radio Browser';
  private readonly baseUrls: string[];
  private activeBaseUrl: string;
  private geoAtlasPromise: Promise<Station[]> | null = null;
  private geoAtlasLoadedAt = 0;

  constructor(baseUrls = defaultRadioBrowserMirrors(), private readonly cache = new ProviderCache()) {
    this.baseUrls = baseUrls.map(url => url.replace(/\/$/, ''));
    this.activeBaseUrl = this.baseUrls[0] ?? 'https://all.api.radio-browser.info';
  }

  async health(): Promise<string> {
    const stats = await this.request<unknown>('/json/stats', {}, {timeoutMs: 5000});
    return stats ? 'online' : 'unknown';
  }

  async countries(limit = 240): Promise<Country[]> {
    const rows = await this.request<unknown[]>('/json/countries', {hidebroken: 'true'}, {maxAgeMs: 24 * 60 * 60 * 1000});
    return rows
      .flatMap(row => {
        const parsed = countrySchema.safeParse(row);
        return parsed.success ? [parsed.data] : [];
      })
      .map(row => ({
        name: row.name,
        code: row.iso_3166_1.toUpperCase(),
        stationCount: row.stationcount
      }))
      .filter(country => country.stationCount > 0)
      .sort((a, b) => b.stationCount - a.stationCount || a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  async popular(limit = 80): Promise<Station[]> {
    const rows = await this.request<unknown[]>(
      '/json/stations/search',
      {
        hidebroken: 'true',
        limit: String(limit),
        order: 'clickcount',
        reverse: 'true'
      },
      {maxAgeMs: 15 * 60 * 1000}
    );

    return this.normalizeStations(rows);
  }

  async byCountry(countryCode: string, limit = 100, offset = 0): Promise<Station[]> {
    const rows = await this.request<unknown[]>(
      '/json/stations/search',
      {
        countrycode: countryCode.toUpperCase(),
        hidebroken: 'true',
        limit: String(limit),
        offset: String(Math.max(0, offset)),
        order: 'clickcount',
        reverse: 'true'
      },
      {maxAgeMs: 30 * 60 * 1000}
    );

    return this.normalizeStations(rows);
  }

  async search(query: string, options: SearchOptions = {}): Promise<Station[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return this.popular(options.limit ?? 80);
    }

    const limit = options.limit ?? 60;
    const offset = Math.max(0, options.offset ?? 0);
    const baseParams = {
      hidebroken: 'true',
      // Build a stable merged result set before slicing the requested page;
      // using the merged count as four independent provider offsets skips data.
      limit: String(limit + offset),
      offset: '0',
      order: 'clickcount',
      reverse: 'true',
      ...(options.codec ? {codec: options.codec} : {}),
      ...(options.language ? {language: options.language} : {}),
      ...(options.countryCode ? {countrycode: options.countryCode.toUpperCase()} : {})
    };

    const primary = await Promise.allSettled([
      this.request<unknown[]>('/json/stations/search', {...baseParams, name: trimmed}, {maxAgeMs: 10 * 60 * 1000}),
      this.request<unknown[]>('/json/stations/search', {...baseParams, tag: trimmed}, {maxAgeMs: 10 * 60 * 1000})
    ]);

    let attempts = [...primary];
    let rows = fulfilledRows(primary);
    if (rows.length < Math.min(12, limit + offset)) {
      const secondary = await Promise.allSettled([
        this.request<unknown[]>('/json/stations/search', {...baseParams, country: trimmed}, {maxAgeMs: 10 * 60 * 1000}),
        this.request<unknown[]>('/json/stations/search', {...baseParams, language: trimmed}, {maxAgeMs: 10 * 60 * 1000})
      ]);
      attempts = [...attempts, ...secondary];
      rows.push(...fulfilledRows(secondary));
    }
    const tokens = trimmed.split(/\s+/).filter(token => token.length > 2).slice(0, 4);

    if (rows.length === 0 && tokens.length > 1) {
      const tokenResults = await Promise.allSettled(
        tokens.slice(0, 3).flatMap(token => [
          this.request<unknown[]>('/json/stations/search', {...baseParams, name: token, limit: '25'}, {maxAgeMs: 10 * 60 * 1000}),
          this.request<unknown[]>('/json/stations/search', {...baseParams, tag: token, limit: '25'}, {maxAgeMs: 10 * 60 * 1000})
        ])
      );
      attempts.push(...tokenResults);
      rows = fulfilledRows(tokenResults);
    }

    if (attempts.every(result => result.status === 'rejected')) {
      const firstError = attempts[0]?.status === 'rejected' ? attempts[0].reason : 'all search requests failed';
      const message = firstError instanceof Error ? firstError.message : String(firstError);
      throw new Error(`${this.label} search failed: ${message}`);
    }

    return filterStations(dedupeStations(this.normalizeStations(rows)), options)
      .sort((a, b) => scoreStation(b, trimmed, tokens) - scoreStation(a, trimmed, tokens))
      .slice(offset, offset + limit);
  }

  async nearby(location: LocationGuess, limit = 80): Promise<Station[]> {
    const stations = await this.geotaggedAtlas();
    return nearestStations(stations, location, limit);
  }

  async resolve(station: Station): Promise<ResolvedStream> {
    if (station.provider !== this.id) {
      const streamUrl = station.streamUrl ? safeMediaTarget(station.streamUrl) : null;
      if (!streamUrl) {
        throw new Error(`Station ${station.name} does not expose a stream URL.`);
      }

      return {url: streamUrl, name: station.name};
    }

    try {
      // Click URLs can rotate and the endpoint records directory engagement, so
      // do not reuse a day-old resolution from the general provider cache.
      const result = clickResolveSchema.parse(
        await this.request<unknown>(`/json/url/${encodeURIComponent(station.id)}`, {}, {timeoutMs: 6000})
      );
      const resolvedUrl = result.url ? safeMediaTarget(result.url) : null;
      if (result.ok && resolvedUrl) {
        return {url: resolvedUrl, name: sanitizeTerminalText(result.name) ?? station.name};
      }
    } catch {
      // A directory outage should not discard a validated URL already supplied
      // with the station row.
    }

    const fallbackUrl = station.streamUrl ? safeMediaTarget(station.streamUrl) : null;
    if (fallbackUrl) {
      return {url: fallbackUrl, name: station.name};
    }

    throw new Error(`Radio Browser could not resolve ${station.name}.`);
  }

  // Give back to the directory: an upvote on favorite helps surface good
  // stations for everyone. Radio Browser rate-limits votes per IP, so this is
  // best-effort and never blocks the favorite action.
  async vote(station: Station): Promise<boolean> {
    if (station.provider !== this.id) {
      return false;
    }

    try {
      const result = clickResolveSchema.parse(
        await this.request<unknown>(`/json/vote/${encodeURIComponent(station.id)}`, {}, {timeoutMs: 5000})
      );
      return result.ok;
    } catch {
      return false;
    }
  }

  async detectLocation(): Promise<LocationGuess | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('https://ipapi.co/json/', {
        signal: controller.signal,
        headers: {'User-Agent': userAgent()}
      });
      if (!response.ok) {
        return null;
      }

      const parsed = locationSchema.parse(await response.json());
      if (typeof parsed.latitude !== 'number' || typeof parsed.longitude !== 'number') {
        return null;
      }

      return {
        city: parsed.city,
        region: parsed.region,
        country: parsed.country_name,
        countryCode: parsed.country_code,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        source: 'ipapi.co'
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeStations(rows: unknown[]): Station[] {
    return rows
      .flatMap(row => {
        const parsed = stationSchema.safeParse(row);
        return parsed.success ? [parsed.data] : [];
      })
      .map(row => ({
        id: row.stationuuid,
        provider: this.id,
        name: cleanText(row.name) || 'Untitled station',
        country: cleanText(row.country ?? undefined),
        countryCode: cleanText(row.countrycode ?? undefined)?.toUpperCase(),
        state: cleanText(row.state ?? undefined),
        language: cleanText(row.language ?? undefined),
        languageCodes: splitCsv(row.languagecodes ?? undefined),
        tags: splitCsv(row.tags ?? undefined).slice(0, 8),
        codec: cleanText(row.codec ?? undefined),
        bitrate: row.bitrate ?? undefined,
        homepage: safeOptionalExternalUrl(row.homepage),
        favicon: safeOptionalExternalUrl(row.favicon),
        streamUrl: safeOptionalMediaTarget(row.url_resolved ?? row.url),
        votes: row.votes ?? undefined,
        clickCount: row.clickcount ?? undefined,
        latitude: row.geo_lat ?? undefined,
        longitude: row.geo_long ?? undefined,
        hls: row.hls === 1 || row.hls === true,
        lastCheckedOk: row.lastcheckok === 1 || row.lastcheckok === true
      }));
  }

  private async geotaggedAtlas(): Promise<Station[]> {
    const atlasExpired = this.geoAtlasLoadedAt > 0 && Date.now() - this.geoAtlasLoadedAt > geoAtlasMaxAgeMs;
    if (!this.geoAtlasPromise || atlasExpired) {
      this.geoAtlasPromise = this.loadGeotaggedAtlas()
        .then(stations => {
          this.geoAtlasLoadedAt = Date.now();
          return stations;
        })
        .catch(error => {
          this.geoAtlasPromise = null;
          throw error;
        });
    }

    return this.geoAtlasPromise;
  }

  private async loadGeotaggedAtlas(): Promise<Station[]> {
    const rows = await this.request<unknown[]>(
      '/json/stations/search',
      {
        hidebroken: 'true',
        has_geo_info: 'true',
        limit: String(geoAtlasLimit),
        order: 'name'
      },
      {
        maxAgeMs: geoAtlasMaxAgeMs,
        timeoutMs: geoAtlasTotalTimeoutMs,
        attemptTimeoutMs: geoAtlasAttemptTimeoutMs
      }
    );

    return dedupeStations(this.normalizeStations(rows)).filter(hasValidCoordinates);
  }

  private async request<T>(
    path: string,
    params: Record<string, string> = {},
    options: {maxAgeMs?: number; timeoutMs?: number; attemptTimeoutMs?: number} = {}
  ): Promise<T> {
    const cacheKey = buildCacheKey(path, params);
    if (options.maxAgeMs) {
      const cached = this.cache.get<T>(cacheKey, options.maxAgeMs);
      if (cached) {
        return cached;
      }
    }

    let lastError: Error | null = null;
    const mirrors = preferActiveMirror(this.baseUrls, this.activeBaseUrl);
    const totalTimeoutMs = options.timeoutMs ?? 9000;
    const deadline = Date.now() + totalTimeoutMs;
    for (let mirrorIndex = 0; mirrorIndex < mirrors.length; mirrorIndex += 1) {
      const baseUrl = mirrors[mirrorIndex]!;
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        break;
      }
      const url = new URL(`${baseUrl}${path}`);
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }

      try {
        const mirrorsLeft = mirrors.length - mirrorIndex;
        const fairShareTimeoutMs = Math.max(1, Math.floor(remainingMs / mirrorsLeft));
        const attemptTimeoutMs = Math.max(
          1,
          Math.min(remainingMs, options.attemptTimeoutMs ?? fairShareTimeoutMs)
        );
        const value = await fetchJsonWithTimeout<T>(url, attemptTimeoutMs);
        this.activeBaseUrl = baseUrl;
        if (options.maxAgeMs) {
          try {
            this.cache.set(cacheKey, value);
          } catch {
            // A read-only or full cache directory must not turn live data into
            // an apparent provider outage.
          }
        }
        return value;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    const stale = this.cache.getStale<T>(cacheKey);
    if (stale) {
      return stale;
    }

    throw new ProviderUnavailableError(
      `${this.label} unavailable: ${describeRequestError(lastError)}`,
      lastError ?? undefined
    );
  }
}

function describeRequestError(error: Error | null): string {
  if (!error) return 'request failed';
  const cause = error.cause;
  if (cause && typeof cause === 'object') {
    const code = 'code' in cause && typeof cause.code === 'string' ? cause.code : null;
    const message = 'message' in cause && typeof cause.message === 'string' ? cause.message : null;
    if (code && message) return `${error.message} (${code}: ${message})`;
    if (code) return `${error.message} (${code})`;
    if (message && message !== error.message) return `${error.message} (${message})`;
  }

  return error.message || 'request failed';
}

function defaultRadioBrowserMirrors(): string[] {
  return [
    'https://all.api.radio-browser.info',
    'https://de1.api.radio-browser.info',
    'https://nl1.api.radio-browser.info',
    'https://at1.api.radio-browser.info'
  ];
}

function preferActiveMirror(baseUrls: string[], active: string): string[] {
  return [active, ...baseUrls.filter(url => url !== active)];
}

function buildCacheKey(path: string, params: Record<string, string>): string {
  const pairs = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  return `${path}?${new URLSearchParams(pairs).toString()}`;
}

async function fetchJsonWithTimeout<T>(url: URL, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent(' (+https://radio-browser.info)'),
        Accept: 'application/json'
      }
    });
    if (!response.ok) {
      throw new Error(`Radio Browser request failed: ${response.status} ${response.statusText}`);
    }

    // Keep the abort timer alive while consuming the body as well as headers.
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export function dedupeStations(stations: Station[]): Station[] {
  const seen = new Set<string>();
  const deduped: Station[] = [];

  for (const station of stations) {
    const key = `${station.provider}:${station.id}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(station);
  }

  return deduped;
}

function splitCsv(value?: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map(part => cleanText(part))
    .filter((part): part is string => Boolean(part));
}

function cleanText(value?: string | null): string | undefined {
  return sanitizeTerminalText(value);
}

function safeOptionalExternalUrl(value?: string | null): string | undefined {
  const cleaned = cleanText(value);
  return cleaned ? safeExternalHttpUrl(cleaned) ?? undefined : undefined;
}

function safeOptionalMediaTarget(value?: string | null): string | undefined {
  const cleaned = cleanText(value);
  return cleaned ? safeMediaTarget(cleaned) ?? undefined : undefined;
}

function hasValidCoordinates(station: Station): station is Station & {latitude: number; longitude: number} {
  return (
    typeof station.latitude === 'number' &&
    Number.isFinite(station.latitude) &&
    Math.abs(station.latitude) <= 90 &&
    typeof station.longitude === 'number' &&
    Number.isFinite(station.longitude) &&
    Math.abs(station.longitude) <= 180
  );
}

function compareNearbyStations(a: Station, b: Station): number {
  const distanceDelta = (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
  if (Math.abs(distanceDelta) > 0.01) {
    return distanceDelta;
  }

  const qualityDelta = nearbyQualityScore(b) - nearbyQualityScore(a);
  if (qualityDelta !== 0) {
    return qualityDelta;
  }

  return a.name.localeCompare(b.name);
}

function nearestStations(stations: Station[], location: LocationGuess, limit: number): Station[] {
  const nearest: Station[] = [];
  const boundedLimit = Math.max(0, Math.floor(limit));
  if (boundedLimit === 0) return nearest;

  for (const station of stations) {
    if (!hasValidCoordinates(station)) continue;
    const candidate: Station = {
      ...station,
      distanceKm: haversineKm(location.latitude, location.longitude, station.latitude, station.longitude)
    };
    let low = 0;
    let high = nearest.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (compareNearbyStations(nearest[middle]!, candidate) <= 0) low = middle + 1;
      else high = middle;
    }
    if (low < boundedLimit) {
      nearest.splice(low, 0, candidate);
      if (nearest.length > boundedLimit) nearest.pop();
    }
  }
  return nearest;
}

function nearbyQualityScore(station: Station): number {
  return (
    (station.lastCheckedOk ? 100 : 0) +
    Math.log10((station.clickCount ?? 0) + 1) * 12 +
    Math.log10((station.votes ?? 0) + 1) * 6 +
    Math.min(station.bitrate ?? 0, 320) / 32
  );
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function fulfilledRows(results: PromiseSettledResult<unknown[]>[]): unknown[] {
  return results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
}

function scoreStation(station: Station, query: string, tokens: string[]): number {
  const searchable = [
    station.name,
    station.country,
    station.state,
    station.language,
    station.tags.join(' '),
    station.codec
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const loweredQuery = query.toLowerCase();
  const tokenScore = tokens.reduce((score, token) => score + (searchable.includes(token.toLowerCase()) ? 4 : 0), 0);
  const exactScore = searchable.includes(loweredQuery) ? 12 : 0;
  return exactScore + tokenScore + Math.log10((station.clickCount ?? 0) + 1);
}

function filterStations(stations: Station[], options: SearchOptions): Station[] {
  return stations.filter(station => {
    if (options.minBitrate && (station.bitrate ?? 0) < options.minBitrate) {
      return false;
    }

    if (options.codec && (!station.codec || station.codec.toLowerCase() !== options.codec.toLowerCase())) {
      return false;
    }

    if (
      options.language &&
      (!station.language || !station.language.toLowerCase().includes(options.language.toLowerCase()))
    ) {
      return false;
    }

    return true;
  });
}
