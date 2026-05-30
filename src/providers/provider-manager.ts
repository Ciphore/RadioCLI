import {RadioBrowserProvider, dedupeStations} from './radio-browser.js';
import {RadioGardenProvider} from './radio-garden.js';
import type {AppSettings, Country, LocationGuess, ResolvedStream, SearchOptions, Station} from '../types.js';

export class ProviderManager {
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

  byCountry(countryCode: string, limit?: number): Promise<Station[]> {
    return this.radioBrowser.byCountry(countryCode, limit);
  }

  nearby(location: LocationGuess, limit?: number): Promise<Station[]> {
    return this.radioBrowser.nearby(location, limit);
  }

  detectLocation(): Promise<LocationGuess | null> {
    return this.radioBrowser.detectLocation();
  }

  async search(query: string, settings: AppSettings, options: SearchOptions = {}): Promise<Station[]> {
    const radioBrowser = await this.radioBrowser.search(query, options);
    if (!settings.enableRadioGarden && !options.includeExperimental) {
      return radioBrowser;
    }

    const experimental = await Promise.allSettled([this.radioGarden.search(query, options)]);
    const radioGarden = experimental.flatMap(result => (result.status === 'fulfilled' ? result.value : []));
    return dedupeStations([...radioBrowser, ...radioGarden]).slice(0, options.limit ?? 80);
  }

  async resolve(station: Station): Promise<ResolvedStream> {
    if (station.provider === 'radio-garden') {
      return this.radioGarden.resolve(station);
    }

    return this.radioBrowser.resolve(station);
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
