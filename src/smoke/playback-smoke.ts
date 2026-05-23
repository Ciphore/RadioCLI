import {setTimeout as delay} from 'node:timers/promises';
import {ProviderManager} from '../providers/provider-manager.js';
import {PlayerController} from '../player/player-controller.js';
import {JsonLibraryStore} from '../storage/store.js';

const store = new JsonLibraryStore();
const providers = new ProviderManager();
const player = new PlayerController(() => store.snapshot().settings);
const backends = player.detectedBackends();

if (backends.length === 0) {
  throw new Error('No playback backend found. Install mpv or ffplay.');
}

const stations = await providers.search('Japan Hits asia DREAM radio', store.snapshot().settings, {limit: 5});
const station = stations[0];
if (!station) {
  throw new Error('Could not find a known playable station.');
}

const resolved = await providers.resolve(station);
console.log(`backend=${backends.join(',')}`);
console.log(`station=${station.name}`);
console.log(`url=${resolved.url}`);

await player.play(station, resolved.url);
await delay(4500);
await player.stop();
console.log('playback_smoke=ok');
