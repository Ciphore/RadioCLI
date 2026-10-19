import {RadioBrowserProvider} from './radio-browser.js';
import {RadioGardenProvider} from './radio-garden.js';
import {abortable, DiscoverySessions} from './discovery-session.js';
import type {AppSettings, Country, DiscoveryPage, DiscoveryPageOptions, DiscoverySourceStatus, LocationGuess, ResolvedStream, SearchOptions, Station} from '../types.js';

type FederatedSearch = {
  browserCursor?: string;
  browserExhausted: boolean;
  browser: Station[];
  browserSources: DiscoverySourceStatus[];
  gardenLoaded: boolean;
  garden: Station[];
  gardenSource: DiscoverySourceStatus;
  seen: Set<string>;
  primaryTurn: boolean;
};

export class ProviderManager {
  private readonly discovery = new DiscoverySessions<FederatedSearch>(state =>
    JSON.stringify([state.browser, state.garden, state.browserSources, state.gardenSource, [...state.seen]]).length * 2 + state.seen.size * 128
  );
  constructor(
    private readonly radioBrowser = new RadioBrowserProvider(),
    private readonly radioGarden = new RadioGardenProvider()
  ) {}

  countries(limit?: number): Promise<Country[]> {
    return this.radioBrowser.countries(limit);
  }

  popular(limit?: number): Promise<Station[]> {
    return this.radioBrowser.popular(limit);
  }

  byCountry(countryCode: string, limit?: number, offset?: number): Promise<Station[]> {
    return this.radioBrowser.byCountry(countryCode, limit, offset);
  }

  byCountryPage(countryCode: string, options: Pick<DiscoveryPageOptions, 'limit' | 'cursor' | 'signal'> = {}): Promise<DiscoveryPage> {
    return this.radioBrowser.byCountryPage(countryCode, options);
  }

  byId(provider: Station['provider'], id: string): Promise<Station | null> {
    if (provider !== 'radio-browser') return Promise.resolve(null);
    return this.radioBrowser.byId(id);
  }

  nearby(location: LocationGuess, limit?: number, options: {signal?: AbortSignal} = {}): Promise<Station[]> {
    return this.radioBrowser.nearby(location, limit, options);
  }

  detectLocation(options: {signal?: AbortSignal} = {}): Promise<LocationGuess | null> {
    return this.radioBrowser.detectLocation(options);
  }

  async search(query: string, settings: AppSettings, options: SearchOptions = {}): Promise<Station[]> {
    const includeGarden = settings.enableRadioGarden || options.includeExperimental;
    if (!includeGarden) {
      return this.radioBrowser.search(query, options);
    }

    // Legacy array callers may still pass a displayed offset. Traverse the
    // merged cursor so those offsets cannot skip Browser rows after Garden.
    // Interactive clients keep nextCursor and avoid this repeated traversal.
    let skip = Math.max(0, options.offset ?? 0);
    const limit = options.limit ?? 80;
    const items: Station[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.searchPage(query, settings, {...options, limit, cursor});
      const start = Math.min(skip, page.items.length);
      skip -= start;
      items.push(...page.items.slice(start, start + limit - items.length));
      cursor = page.nextCursor;
    } while (items.length < limit && cursor);
    return items;
  }

  searchPage(query: string, settings: AppSettings, options: DiscoveryPageOptions = {}): Promise<DiscoveryPage> {
    const includeGarden = settings.enableRadioGarden || options.includeExperimental;
    if (!includeGarden) return this.radioBrowser.searchPage(query, options);
    const limit = options.limit ?? 80;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('Discovery page size must be between 1 and 1000.');
    const fingerprint = JSON.stringify([query.trim(), options.codec, options.language, options.countryCode?.toUpperCase(), options.minBitrate, limit]);
    return this.discovery.page(fingerprint, options.cursor, () => ({
      browserExhausted: false, browser: [], browserSources: [],
      gardenLoaded: false, garden: [],
      gardenSource: {provider: 'radio-garden', source: 'search-snapshot', consumed: 0, exhausted: false, status: 'available'},
      seen: new Set(), primaryTurn: true
    }), state => this.federatedPage(state, query, limit, options), options.signal);
  }

  private async federatedPage(state: FederatedSearch, query: string, limit: number, options: DiscoveryPageOptions): Promise<DiscoveryPage> {
    const fetchBrowser = !state.browserExhausted && state.browser.length < limit;
    const fetchGarden = !state.gardenLoaded;
    const [browserResult, gardenResult] = await Promise.allSettled([
      fetchBrowser ? abortable(this.radioBrowser.searchPage(query, {...options, limit, cursor: state.browserCursor}), options.signal) : Promise.resolve(null),
      // Garden currently exposes one finite search response, without a known
      // offset contract. Retain all returned hits and page that snapshot.
      fetchGarden ? abortable(this.radioGarden.search(query, {...options, limit: Number.MAX_SAFE_INTEGER}), options.signal) : Promise.resolve(null)
    ]);
    options.signal?.throwIfAborted();
    if (browserResult.status === 'fulfilled' && browserResult.value) {
      const page = browserResult.value;
      state.browserCursor = page.nextCursor;
      state.browserExhausted = page.exhausted;
      state.browserSources = page.sources;
      state.browser.push(...page.items);
    } else if (browserResult.status === 'rejected') {
      state.browserSources = state.browserSources.length
        ? state.browserSources.map(source => source.exhausted ? source : {...source, status: 'unavailable', message: errorText(browserResult.reason)})
        : [{provider: 'radio-browser', source: 'search', consumed: 0, exhausted: false, status: 'unavailable', message: errorText(browserResult.reason)}];
    }
    if (gardenResult.status === 'fulfilled' && gardenResult.value) {
      state.gardenLoaded = true;
      state.gardenSource = {...state.gardenSource, status: 'available', message: undefined, consumed: gardenResult.value.length, exhausted: true};
      state.garden = gardenResult.value.filter(station => matchesFilters(station, options));
    } else if (gardenResult.status === 'rejected') {
      state.gardenSource = {...state.gardenSource, status: 'unavailable', message: errorText(gardenResult.reason)};
    }

    const items: Station[] = [];
    while (items.length < limit && (state.browser.length || state.garden.length)) {
      const primary = state.primaryTurn ? state.browser : state.garden;
      const secondary = state.primaryTurn ? state.garden : state.browser;
      const station = primary.shift() ?? secondary.shift();
      state.primaryTurn = !state.primaryTurn;
      if (!station) break;
      const key = `${station.provider}:${station.id}`;
      if (state.seen.has(key)) continue;
      state.seen.add(key);
      items.push(station);
    }
    if (!items.length) {
      if (browserResult.status === 'rejected') throw browserResult.reason;
      if (gardenResult.status === 'rejected') throw gardenResult.reason;
    }
    return {
      items,
      exhausted: state.browserExhausted && state.gardenLoaded && state.browser.length === 0 && state.garden.length === 0,
      sources: [...state.browserSources, state.gardenSource]
    };
  }

  async resolve(station: Station, options: {signal?: AbortSignal} = {}): Promise<ResolvedStream> {
    options.signal?.throwIfAborted();
    if (station.provider === 'radio-garden') {
      return abortable(this.radioGarden.resolve(station, options), options.signal);
    }

    return abortable(this.radioBrowser.resolve(station, options), options.signal);
  }

  vote(station: Station): Promise<boolean> {
    return this.radioBrowser.vote(station);
  }

  async health(settings: AppSettings): Promise<Record<string, string>> {
    const radioBrowser = await this.radioBrowser.health().catch(error =>
      error instanceof Error ? error.message : 'unavailable'
    );
    const radioGarden = settings.enableRadioGarden
      ? await this.radioGarden.health()
      : 'off; enable in settings';

    return {
      'Radio Browser': radioBrowser,
      'Radio Garden': radioGarden
    };
  }
}

function matchesFilters(station: Station, options: SearchOptions): boolean {
  return !(options.minBitrate && (station.bitrate ?? 0) < options.minBitrate)
    && !(options.codec && station.codec?.toLowerCase() !== options.codec.toLowerCase())
    && !(options.language && !station.language?.toLowerCase().includes(options.language.toLowerCase()))
    && !(options.countryCode && station.countryCode?.toUpperCase() !== options.countryCode.toUpperCase());
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
