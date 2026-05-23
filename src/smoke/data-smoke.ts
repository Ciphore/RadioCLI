import {ProviderManager} from '../providers/provider-manager.js';
import {JsonLibraryStore} from '../storage/store.js';

const providers = new ProviderManager();
const settings = new JsonLibraryStore().snapshot().settings;

const countries = await providers.countries(5);
if (countries.length === 0) {
  throw new Error('No countries returned from Radio Browser.');
}

const search = await providers.search('tokyo jazz', settings, {limit: 10});
if (search.length === 0) {
  throw new Error('No search results returned from Radio Browser.');
}

const resolved = await providers.resolve(search[0]!);
if (!resolved.url.startsWith('http')) {
  throw new Error(`Resolved URL is not playable: ${resolved.url}`);
}

console.log(`countries=${countries.length}`);
console.log(`first_country=${countries[0]!.name} ${countries[0]!.stationCount}`);
console.log(`search_results=${search.length}`);
console.log(`first_station=${search[0]!.name}`);
console.log(`resolved_url=${resolved.url}`);
