import type {SrvRecord} from 'node:dns';
import {resolveSrv} from 'node:dns/promises';
import {randomUUID} from 'node:crypto';
import {setImmediate as yieldToEventLoop} from 'node:timers/promises';
import {z} from 'zod';
import type {Country, DiscoveryPage, DiscoveryPageOptions, DiscoverySourceStatus, LocationGuess, ResolvedStream, SearchOptions, Station} from '../types.js';
import {ProviderCache} from './cache.js';
import {abortable, DiscoverySessions} from './discovery-session.js';
import {userAgent} from '../version.js';
import {safeExternalHttpUrl, safeMediaTarget, sanitizeTerminalText} from '../safety.js';
import {
  allowsDirectDnsFallback,
  fetchHttpsWithSystemResolver,
  networkPolicy,
  withExternalResponse
} from '../platform/network.js';

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
const geoAtlasMaxBytes = 32 * 1024 * 1024;
const geoAtlasMaxAgeMs = 6 * 60 * 60 * 1000;
// The atlas is much larger than ordinary directory responses. Give each live,
// discovered server enough time to connect, download, and parse up to 100k rows
// while retaining an overall bound and stale-cache fallback.
const geoAtlasAttemptTimeoutMs = 30_000;
const geoAtlasTotalTimeoutMs = 75_000;
const mirrorDiscoveryTimeoutMs = 750;
const radioBrowserService = '_api._tcp.radio-browser.info';
const radioBrowserApiSuffix = '.api.radio-browser.info';
const nameResolutionErrorCodes = new Set(['EAI_AGAIN', 'ENOTFOUND', 'ESERVFAIL', 'ETIMEOUT', 'EREFUSED']);
const maxDiscoveryRoundsPerPage = 4;

type SearchSource = DiscoverySourceStatus & {params: Record<string, string>};
type BrowserDiscoveryState = {
  query: string;
  tokens: string[];
  filters: Pick<SearchOptions, 'codec' | 'language' | 'countryCode' | 'minBitrate'>;
  sources: SearchSource[];
  buffer: Station[];
  seen: Set<string>;
  initialized: boolean;
  country: boolean;
  bytes: number;
};
type RequestOptions = {maxAgeMs?: number; timeoutMs?: number; attemptTimeoutMs?: number; cacheOnly?: boolean; signal?: AbortSignal};
type PendingRequest = {controller: AbortController; subscribers: number; promise: Promise<unknown>};

type RadioBrowserRuntime = {
  resolveSrv?: (hostname: string) => Promise<SrvRecord[]>;
  fetchWithSystemResolver?: typeof fetchHttpsWithSystemResolver;
  allowsDirectDnsFallback?: (url: URL) => boolean;
};

const defaultRuntime: RadioBrowserRuntime = {};

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
  private readonly discoverMirrors: boolean;
  private activeBaseUrl: string;
  private geoAtlas: Station[] | null = null;
  private geoAtlasLoad: {promise: Promise<Station[]>; controller: AbortController; subscribers: number; settled: boolean} | null = null;
  private geoAtlasLoadedAt = 0;
  private mirrorDiscoveryPromise: Promise<string[]> | null = null;
  private readonly discovery = new DiscoverySessions<BrowserDiscoveryState>(state => state.bytes + state.seen.size * 128 + 1024);
  private readonly pendingRequests = new Map<string, PendingRequest>();

  constructor(
    baseUrls: string[] | undefined = undefined,
    private readonly cache = new ProviderCache(),
    private readonly runtime: RadioBrowserRuntime = defaultRuntime
  ) {
    this.discoverMirrors = baseUrls === undefined;
    this.baseUrls = (baseUrls ?? defaultRadioBrowserMirrors()).map(url => url.replace(/\/$/, ''));
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

  async popular(limit = 80, options: {signal?: AbortSignal} = {}): Promise<Station[]> {
    const rows = await this.request<unknown[]>(
      '/json/stations/search',
      {
        hidebroken: 'true',
        limit: String(limit),
        order: 'clickcount',
        reverse: 'true'
      },
      {maxAgeMs: 15 * 60 * 1000, signal: options.signal}
    );

    return this.normalizeStations(rows);
  }

  async byCountry(countryCode: string, limit = 100, offset = 0, options: {signal?: AbortSignal} = {}): Promise<Station[]> {
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
      {maxAgeMs: 30 * 60 * 1000, signal: options.signal}
    );

    return this.normalizeStations(rows);
  }

  byCountryPage(countryCode: string, options: Pick<DiscoveryPageOptions, 'limit' | 'cursor' | 'signal'> = {}): Promise<DiscoveryPage> {
    const limit = pageLimit(options.limit, 100);
    const country = countryCode.trim().toUpperCase();
    return this.discovery.page(JSON.stringify(['country', country, limit]), options.cursor, () => ({
      query: country, tokens: [], filters: {}, sources: [discoverySource('country', {countrycode: country})],
      buffer: [], seen: new Set(), initialized: true, country: true, bytes: 0
    }), state => this.discoveryPage(state, limit, options.signal), options.signal);
  }

  searchPage(query: string, options: DiscoveryPageOptions = {}): Promise<DiscoveryPage> {
    const trimmed = query.trim();
    const limit = pageLimit(options.limit, trimmed ? 60 : 80);
    const filters = searchFilters(options);
    return this.discovery.page(JSON.stringify(['search', trimmed, filters, limit]), options.cursor, () => ({
      query: trimmed, tokens: trimmed.split(/\s+/).filter(token => token.length > 2).slice(0, 4), filters,
      sources: trimmed ? [discoverySource('name', {name: trimmed}), discoverySource('tag', {tag: trimmed})] : [discoverySource('popular', {})],
      buffer: [], seen: new Set(), initialized: !trimmed, country: false, bytes: 0
    }), state => this.discoveryPage(state, limit, options.signal), options.signal);
  }

  private async discoveryPage(state: BrowserDiscoveryState, limit: number, signal?: AbortSignal): Promise<DiscoveryPage> {
    signal?.throwIfAborted();
    let successfulRequests = 0;
    let requestError: unknown;
    const load = async (sources: SearchSource[]): Promise<number> => {
      const results = await Promise.allSettled(sources.map(source => this.request<unknown[]>(
        '/json/stations/search', {
          hidebroken: 'true', limit: String(limit), offset: String(source.consumed), order: 'clickcount', reverse: 'true',
          ...searchFilterParams(state.filters), ...source.params
        }, {maxAgeMs: state.country ? 30 * 60 * 1000 : 10 * 60 * 1000, signal}
      )));
      signal?.throwIfAborted();
      let rawCount = 0;
      for (const [index, result] of results.entries()) {
        const source = sources[index]!;
        if (result.status === 'rejected' || !Array.isArray(result.value)) {
          requestError = result.status === 'rejected' ? result.reason : new Error('Radio Browser returned an invalid station list.');
          source.status = 'unavailable';
          source.message = requestError instanceof Error ? requestError.message : String(requestError);
          continue;
        }
        successfulRequests += 1;
        const rows = result.value;
        source.status = 'available';
        source.message = undefined;
        source.consumed += rows.length;
        source.exhausted = rows.length < limit;
        rawCount += rows.length;
        for (const station of this.normalizeStations(rows)) {
          const key = `${station.provider}:${station.id}`;
          if (state.seen.has(key)) continue;
          state.seen.add(key);
          state.bytes += key.length * 2;
          if (filterStations([station], state.filters).length === 0) continue;
          state.buffer.push(station);
          state.bytes += JSON.stringify(station).length * 2;
        }
      }
      return rawCount;
    };

    for (let round = 0; state.buffer.length < limit && round < maxDiscoveryRoundsPerPage; round += 1) {
      const pending = state.sources.filter(source => !source.exhausted);
      if (!pending.length) break;
      let rawCount = await load(pending);
      if (!state.initialized) {
        // Preserve the first-page broadening policy and relevance score. Each
        // activated source subsequently keeps its own raw offset.
        if (rawCount < Math.min(12, limit)) {
          const secondary = [discoverySource('country', {country: state.query}), discoverySource('language', {language: state.query})];
          state.sources.push(...secondary);
          rawCount += await load(secondary);
        }
        if (rawCount === 0 && state.tokens.length > 1) {
          const tokenSources = state.tokens.slice(0, 3).flatMap((token, index) => [
            discoverySource(`token-${index}-name`, {name: token}), discoverySource(`token-${index}-tag`, {tag: token})
          ]);
          state.sources.push(...tokenSources);
          await load(tokenSources);
        }
        state.initialized = true;
      }
      if (!state.country) state.buffer.sort((left, right) => scoreStation(right, state.query, state.tokens) - scoreStation(left, state.query, state.tokens));
      // Failures remain retryable on the next cursor; do not spend four full
      // network deadlines retrying an unavailable source in a single call.
      if (state.sources.some(source => source.status === 'unavailable')) break;
    }
    if (!state.buffer.length && !successfulRequests && requestError) throw requestError;
    const items = state.buffer.splice(0, limit);
    state.bytes -= items.reduce((sum, station) => sum + JSON.stringify(station).length * 2, 0);
    return {
      items,
      exhausted: state.buffer.length === 0 && state.sources.every(source => source.exhausted),
      sources: state.sources.map(({params: _params, ...source}) => source)
    };
  }

  async byId(id: string): Promise<Station | null> {
    const rows = await this.request<unknown[]>(`/json/stations/byuuid/${encodeURIComponent(id)}`, {}, {maxAgeMs: 10 * 60 * 1000});
    return this.normalizeStations(rows)[0] ?? null;
  }

  async search(query: string, options: SearchOptions = {}): Promise<Station[]> {
    options.signal?.throwIfAborted();
    const trimmed = query.trim();
    if (!trimmed) {
      return this.popular(options.limit ?? 80, {signal: options.signal});
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
      ...(options.countryCode ? {countrycode: options.countryCode.toUpperCase()} : {}),
      ...(options.minBitrate ? {bitrateMin: String(options.minBitrate)} : {})
    };

    const primary = await Promise.allSettled([
      this.request<unknown[]>('/json/stations/search', {...baseParams, name: trimmed}, {maxAgeMs: 10 * 60 * 1000, signal: options.signal}),
      this.request<unknown[]>('/json/stations/search', {...baseParams, tag: trimmed}, {maxAgeMs: 10 * 60 * 1000, signal: options.signal})
    ]);
    options.signal?.throwIfAborted();

    let attempts = [...primary];
    let rows = fulfilledRows(primary);
    if (rows.length < Math.min(12, limit + offset)) {
      const secondary = await Promise.allSettled([
        this.request<unknown[]>('/json/stations/search', {...baseParams, country: trimmed}, {maxAgeMs: 10 * 60 * 1000, signal: options.signal}),
        this.request<unknown[]>('/json/stations/search', {...baseParams, language: trimmed}, {maxAgeMs: 10 * 60 * 1000, signal: options.signal})
      ]);
      options.signal?.throwIfAborted();
      attempts = [...attempts, ...secondary];
      rows.push(...fulfilledRows(secondary));
    }
    const tokens = trimmed.split(/\s+/).filter(token => token.length > 2).slice(0, 4);

    if (rows.length === 0 && tokens.length > 1) {
      const tokenResults = await Promise.allSettled(
        tokens.slice(0, 3).flatMap(token => [
          this.request<unknown[]>('/json/stations/search', {...baseParams, name: token, limit: '25'}, {maxAgeMs: 10 * 60 * 1000, signal: options.signal}),
          this.request<unknown[]>('/json/stations/search', {...baseParams, tag: token, limit: '25'}, {maxAgeMs: 10 * 60 * 1000, signal: options.signal})
        ])
      );
      options.signal?.throwIfAborted();
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

  async nearby(location: LocationGuess, limit = 80, options: {signal?: AbortSignal} = {}): Promise<Station[]> {
    options.signal?.throwIfAborted();
    const stations = await this.geotaggedAtlas(options.signal);
    return nearestStations(stations, location, limit, options.signal);
  }

  async resolve(station: Station, options: {signal?: AbortSignal} = {}): Promise<ResolvedStream> {
    options.signal?.throwIfAborted();
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
        await this.request<unknown>(`/json/url/${encodeURIComponent(station.id)}`, {}, {timeoutMs: 6000, signal: options.signal})
      );
      const resolvedUrl = result.url ? safeMediaTarget(result.url) : null;
      if (result.ok && resolvedUrl) {
        return {url: resolvedUrl, name: sanitizeTerminalText(result.name) ?? station.name};
      }
    } catch {
      options.signal?.throwIfAborted();
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

  async detectLocation(options: {signal?: AbortSignal} = {}): Promise<LocationGuess | null> {
    options.signal?.throwIfAborted();
    try {
      return await withExternalResponse('https://ipapi.co/json/', {
        timeoutMs: 5000,
        init: {headers: {'User-Agent': userAgent()}, signal: options.signal}
      }, async response => {
        if (!response.ok) return null;
        const parsed = locationSchema.parse(await response.json());
        if (typeof parsed.latitude !== 'number' || typeof parsed.longitude !== 'number') return null;
        return {
          city: parsed.city,
          region: parsed.region,
          country: parsed.country_name,
          countryCode: parsed.country_code,
          latitude: parsed.latitude,
          longitude: parsed.longitude,
          source: 'ipapi.co'
        };
      });
    } catch {
      options.signal?.throwIfAborted();
      return null;
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

  private async geotaggedAtlas(signal?: AbortSignal): Promise<Station[]> {
    signal?.throwIfAborted();
    const atlasExpired = this.geoAtlasLoadedAt > 0 && Date.now() - this.geoAtlasLoadedAt > geoAtlasMaxAgeMs;
    if (this.geoAtlas && !atlasExpired) return this.geoAtlas;
    let load = this.geoAtlasLoad;
    if (!load) {
      const controller = new AbortController();
      load = {controller, subscribers: 0, settled: false, promise: Promise.resolve([])};
      const created = load;
      this.geoAtlasLoad = created;
      created.promise = this.loadGeotaggedAtlas(controller.signal).then(stations => {
          controller.signal.throwIfAborted();
          this.geoAtlas = stations;
          this.geoAtlasLoadedAt = Date.now();
          return stations;
        })
        .finally(() => {
          created.settled = true;
          if (this.geoAtlasLoad === created) this.geoAtlasLoad = null;
        });
    }
    load.subscribers += 1;
    try { return await abortable(load.promise, signal); }
    finally {
      load.subscribers -= 1;
      if (load.subscribers === 0 && !load.settled) {
        if (this.geoAtlasLoad === load) this.geoAtlasLoad = null;
        load.controller.abort();
      }
    }
  }

  private async loadGeotaggedAtlas(signal?: AbortSignal): Promise<Station[]> {
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
        attemptTimeoutMs: geoAtlasAttemptTimeoutMs,
        cacheOnly: networkPolicy().lowBandwidth,
        signal
      }
    );
    signal?.throwIfAborted();
    if (!Array.isArray(rows) || rows.length > geoAtlasLimit) throw new Error('Radio Browser atlas exceeded the supported row limit or returned an invalid response.');

    // Normalize the full atlas in bounded chunks so keyboard and playback
    // events can run between batches. Preserve the original row/dedup order.
    const stations: Station[] = [];
    const seen = new Set<string>();
    let retainedBytes = 0;
    const chunkSize = 250;
    for (let offset = 0; offset < rows.length; offset += chunkSize) {
      signal?.throwIfAborted();
      for (const station of this.normalizeStations(rows.slice(offset, offset + chunkSize))) {
        const key = `${station.provider}:${station.id}`;
        // Dedupe before validating coordinates, matching ordinary normalization.
        if (seen.has(key)) continue;
        seen.add(key);
        if (hasValidCoordinates(station)) {
          retainedBytes += JSON.stringify(station).length * 2 + 128;
          if (retainedBytes > geoAtlasMaxBytes) throw new Error('Radio Browser atlas exceeded the local memory budget. Use country or search discovery.');
          stations.push(station);
        }
      }
      if (offset + chunkSize < rows.length) await yieldToEventLoop();
    }
    return stations;
  }

  private async request<T>(
    path: string,
    params: Record<string, string> = {},
    options: RequestOptions = {}
  ): Promise<T> {
    options.signal?.throwIfAborted();
    // Cacheable reads share work, but click/vote endpoints keep their effects.
    // Cancellation belongs to each subscriber, never to cache identity.
    const key = JSON.stringify([buildCacheKey(path, params), options.maxAgeMs, options.timeoutMs, options.attemptTimeoutMs, options.cacheOnly,
      options.maxAgeMs ? undefined : randomUUID()]);
    let pending = this.pendingRequests.get(key);
    if (!pending) {
      if (this.pendingRequests.size >= 64) throw new ProviderUnavailableError('Radio Browser is busy. Retry after the current directory requests finish.');
      const controller = new AbortController();
      const operation: PendingRequest = {controller, subscribers: 0, promise: Promise.resolve(undefined)};
      operation.promise = this.performRequest<T>(path, params, {...options, signal: controller.signal}).finally(() => {
        if (this.pendingRequests.get(key) === operation) this.pendingRequests.delete(key);
      });
      pending = operation;
      this.pendingRequests.set(key, pending);
    }
    pending.subscribers += 1;
    try { return await abortable(pending.promise as Promise<T>, options.signal); }
    finally {
      pending.subscribers -= 1;
      if (pending.subscribers === 0 && this.pendingRequests.get(key) === pending) {
        this.pendingRequests.delete(key);
        pending.controller.abort(new DOMException('Directory request has no active callers.', 'AbortError'));
      }
    }
  }

  private async performRequest<T>(
    path: string,
    params: Record<string, string>,
    options: RequestOptions
  ): Promise<T> {
    options.signal?.throwIfAborted();
    const cacheKey = buildCacheKey(path, params);
    if (options.maxAgeMs) {
      const cached = await abortable(this.cache.getAsync<T>(cacheKey, options.maxAgeMs), options.signal);
      options.signal?.throwIfAborted();
      if (cached) {
        return cached;
      }
    }

    const policy = networkPolicy();
    if (policy.offline || options.cacheOnly) {
      const stale = options.maxAgeMs ? await abortable(this.cache.getStaleAsync<T>(cacheKey), options.signal) : null;
      options.signal?.throwIfAborted();
      if (stale !== null) return stale;
      throw new ProviderUnavailableError(policy.offline
        ? `${this.label} is offline: no cached response is available.`
        : `${this.label} is in low-bandwidth mode: no cached atlas is available. Disable RADIOCLI_LOW_BANDWIDTH to download it.`);
    }

    let lastError: Error | null = null;
    const totalTimeoutMs = options.timeoutMs ?? 9000;
    const deadline = Date.now() + totalTimeoutMs;
    const mirrors = preferActiveMirror(this.baseUrls, this.activeBaseUrl);
    let discoveryAttempted = !this.discoverMirrors;
    for (let mirrorIndex = 0; mirrorIndex < mirrors.length; mirrorIndex += 1) {
      options.signal?.throwIfAborted();
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
        const mirrorsLeft = mirrors.length - mirrorIndex + (discoveryAttempted ? 0 : 1);
        const fairShareTimeoutMs = Math.max(1, Math.floor(remainingMs / mirrorsLeft));
        const attemptTimeoutMs = Math.max(
          1,
          Math.min(remainingMs, options.attemptTimeoutMs ?? fairShareTimeoutMs)
        );
        const value = await fetchJsonWithTimeout<T>(url, attemptTimeoutMs, this.runtime, options.signal);
        options.signal?.throwIfAborted();
        this.activeBaseUrl = baseUrl;
        if (options.maxAgeMs) {
          try {
            await abortable(this.cache.setAsync(cacheKey, value), options.signal);
          } catch {
            options.signal?.throwIfAborted();
            // A read-only or full cache directory must not turn live data into
            // an apparent provider outage.
          }
        }
        return value;
      } catch (error) {
        options.signal?.throwIfAborted();
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      if (!discoveryAttempted && mirrorIndex === mirrors.length - 1) {
        discoveryAttempted = true;
        const discoveryBudgetMs = Math.min(mirrorDiscoveryTimeoutMs, Math.max(1, deadline - Date.now()));
        const discovered = await abortable(this.loadDiscoveredMirrors(discoveryBudgetMs), options.signal);
        for (const baseUrl of discovered) {
          if (!mirrors.includes(baseUrl)) mirrors.push(baseUrl);
        }
      }
    }

    const stale = await abortable(this.cache.getStaleAsync<T>(cacheKey), options.signal);
    options.signal?.throwIfAborted();
    if (stale) {
      return stale;
    }

    throw new ProviderUnavailableError(
      `${this.label} unavailable: ${describeRequestError(lastError)}`,
      lastError ?? undefined
    );
  }

  private async loadDiscoveredMirrors(timeoutMs: number): Promise<string[]> {
    const discovery = this.mirrorDiscoveryPromise ?? settleWithin(discoverRadioBrowserMirrors(this.runtime), timeoutMs, []);
    this.mirrorDiscoveryPromise = discovery;
    const mirrors = await discovery;
    // Empty discovery commonly means a temporary DNS failure or timeout. Do
    // not poison this provider instance for the remainder of the process.
    if (mirrors.length === 0 && this.mirrorDiscoveryPromise === discovery) this.mirrorDiscoveryPromise = null;
    return mirrors;
  }
}

function describeRequestError(error: Error | null): string {
  if (!error) return 'request failed';
  const nestedCode = findErrorCode(error);
  if (nestedCode === 'EAI_AGAIN') return 'temporary DNS lookup failed (EAI_AGAIN)';
  if (nestedCode && nameResolutionErrorCodes.has(nestedCode)) return `DNS lookup failed (${nestedCode})`;
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
  return ['https://all.api.radio-browser.info'];
}

function preferActiveMirror(baseUrls: string[], active: string): string[] {
  return [active, ...baseUrls.filter(url => url !== active)];
}

function buildCacheKey(path: string, params: Record<string, string>): string {
  const pairs = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  return `${path}?${new URLSearchParams(pairs).toString()}`;
}

async function fetchJsonWithTimeout<T>(url: URL, timeoutMs: number, runtime: RadioBrowserRuntime, signal?: AbortSignal): Promise<T> {
  const startedAt = Date.now();
  const init = {
    signal,
    headers: {
      'User-Agent': userAgent(' (+https://radio-browser.info)'),
      Accept: 'application/json'
    }
  } satisfies RequestInit;
  const consume = async (response: Response): Promise<T> => {
    if (!response.ok) {
      throw new Error(`Radio Browser request failed: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  };

  try {
    return await withExternalResponse(url, {timeoutMs, init}, consume);
  } catch (error) {
    signal?.throwIfAborted();
    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (
      remainingMs <= 0 ||
      !isNameResolutionError(error) ||
      !isRadioBrowserApiHostname(url.hostname) ||
      !(runtime.allowsDirectDnsFallback ?? (target => allowsDirectDnsFallback(process.env, target)))(url)
    ) {
      throw error;
    }

    return withExternalResponse(url, {
      timeoutMs: remainingMs,
      init,
      fetchImpl: runtime.fetchWithSystemResolver ?? fetchHttpsWithSystemResolver
    }, consume);
  }
}

async function discoverRadioBrowserMirrors(runtime: RadioBrowserRuntime): Promise<string[]> {
  const records = await (runtime.resolveSrv ?? resolveSrv)(radioBrowserService);
  return dedupeUrls(
    records
      .filter(record => record.port === 443)
      .sort((a, b) => a.priority - b.priority || b.weight - a.weight || a.name.localeCompare(b.name))
      .flatMap(record => {
        const hostname = record.name.replace(/\.$/, '').toLowerCase();
        return isRadioBrowserApiHostname(hostname) ? [`https://${hostname}`] : [];
      })
  );
}

function isRadioBrowserApiHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === 'api.radio-browser.info' || normalized.endsWith(radioBrowserApiSuffix);
}

function isNameResolutionError(error: unknown): boolean {
  const code = findErrorCode(error);
  return code !== null && nameResolutionErrorCodes.has(code);
}

function findErrorCode(error: unknown): string | null {
  const seen = new Set<unknown>();
  const pending = [error];
  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    if (typeof value === 'object') {
      if ('code' in value && typeof value.code === 'string') return value.code;
      if ('cause' in value) pending.push(value.cause);
      if (value instanceof AggregateError) pending.push(...value.errors);
    }
  }
  return null;
}

function dedupeUrls(urls: string[]): string[] {
  return [...new Set(urls)];
}

function settleWithin<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  return new Promise(resolve => {
    const timeout = setTimeout(() => resolve(fallback), timeoutMs);
    promise.then(value => {
      clearTimeout(timeout);
      resolve(value);
    }, () => {
      clearTimeout(timeout);
      resolve(fallback);
    });
  });
}

function dedupeStations(stations: Station[]): Station[] {
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

async function nearestStations(stations: Station[], location: LocationGuess, limit: number, signal?: AbortSignal): Promise<Station[]> {
  const nearest: Station[] = [];
  const boundedLimit = Math.max(0, Math.floor(limit));
  if (boundedLimit === 0) return nearest;

  for (let index = 0; index < stations.length; index += 1) {
    if (index > 0 && index % 500 === 0) await yieldToEventLoop();
    if (index % 500 === 0) signal?.throwIfAborted();
    const station = stations[index]!;
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

function discoverySource(source: string, params: Record<string, string>): SearchSource {
  return {provider: 'radio-browser', source, consumed: 0, exhausted: false, status: 'available', params};
}

function pageLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > 1000) throw new Error('Discovery page size must be between 1 and 1000.');
  return value;
}

function searchFilters(options: SearchOptions): BrowserDiscoveryState['filters'] {
  return {codec: options.codec, language: options.language, countryCode: options.countryCode?.toUpperCase(), minBitrate: options.minBitrate};
}

function searchFilterParams(options: SearchOptions): Record<string, string> {
  return {
    ...(options.codec ? {codec: options.codec} : {}),
    ...(options.language ? {language: options.language} : {}),
    ...(options.countryCode ? {countrycode: options.countryCode.toUpperCase()} : {}),
    ...(options.minBitrate ? {bitrateMin: String(options.minBitrate)} : {})
  };
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
