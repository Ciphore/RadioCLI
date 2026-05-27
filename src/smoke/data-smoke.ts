import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import type {AppSettings, Country, ResolvedStream, SearchOptions, Station} from '../types.js';

type DataSmokeProvider = {
  countries(limit?: number): Promise<Country[]>;
  search(query: string, settings: AppSettings, options?: SearchOptions): Promise<Station[]>;
  resolve(station: Station): Promise<ResolvedStream>;
};

type DataSmokeRuntime = {
  providers: DataSmokeProvider;
  settings: AppSettings;
};

export type DataSmokeSummary = {
  countries: number;
  firstCountry: string;
  firstCountryStationCount: number;
  searchResults: number;
  firstStation: string;
  resolvedUrl: string;
  smokeHome: string;
};

if (isDirectRun(process.argv[1], import.meta.url)) {
  await runDataSmokeCli().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export async function runDataSmokeCli(loadRuntime = loadDefaultRuntime): Promise<DataSmokeSummary> {
  return withIsolatedRadioCliHome(async smokeHome => {
    const summary = await runDataSmoke(await loadRuntime(), smokeHome);
    printSummary(summary);
    return summary;
  });
}

export async function runDataSmoke(runtime: DataSmokeRuntime, smokeHome: string): Promise<DataSmokeSummary> {
  const countries = await runtime.providers.countries(5);
  if (countries.length === 0) {
    throw new Error('No countries returned from Radio Browser.');
  }

  const search = await runtime.providers.search('tokyo jazz', runtime.settings, {limit: 10});
  if (search.length === 0) {
    throw new Error('No search results returned from Radio Browser.');
  }

  const resolved = await runtime.providers.resolve(search[0]!);
  if (!resolved.url.startsWith('http')) {
    throw new Error(`Resolved URL is not playable: ${resolved.url}`);
  }

  return {
    countries: countries.length,
    firstCountry: countries[0]!.name,
    firstCountryStationCount: countries[0]!.stationCount,
    searchResults: search.length,
    firstStation: search[0]!.name,
    resolvedUrl: resolved.url,
    smokeHome
  };
}

export async function withIsolatedRadioCliHome<T>(run: (smokeHome: string) => Promise<T>): Promise<T> {
  const previousRadioCliHome = process.env.RADIOCLI_HOME;
  const smokeHome = mkdtempSync(join(tmpdir(), 'radiocli-smoke-'));
  process.env.RADIOCLI_HOME = smokeHome;

  try {
    return await run(smokeHome);
  } finally {
    if (previousRadioCliHome === undefined) {
      delete process.env.RADIOCLI_HOME;
    } else {
      process.env.RADIOCLI_HOME = previousRadioCliHome;
    }

    rmSync(smokeHome, {recursive: true, force: true});
  }
}

async function loadDefaultRuntime(): Promise<DataSmokeRuntime> {
  const [{ProviderManager}, {JsonLibraryStore}] = await Promise.all([
    import('../providers/provider-manager.js'),
    import('../storage/store.js')
  ]);
  const store = new JsonLibraryStore();
  return {providers: new ProviderManager(), settings: store.snapshot().settings};
}

function printSummary(summary: DataSmokeSummary): void {
  console.log(`countries=${summary.countries}`);
  console.log(`first_country=${summary.firstCountry} ${summary.firstCountryStationCount}`);
  console.log(`search_results=${summary.searchResults}`);
  console.log(`first_station=${summary.firstStation}`);
  console.log(`resolved_url=${summary.resolvedUrl}`);
}

function isDirectRun(entryPath: string | undefined, moduleUrl: string): boolean {
  return entryPath ? pathToFileURL(resolve(entryPath)).href === moduleUrl : false;
}
