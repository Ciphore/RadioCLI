import {setTimeout as delay} from 'node:timers/promises';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProviderManager} from '../providers/provider-manager.js';
import {PlayerController} from '../player/player-controller.js';
import {JsonLibraryStore} from '../storage/store.js';

const originalRadioCliHome = process.env.RADIOCLI_HOME;
const smokeHome = mkdtempSync(join(tmpdir(), 'radiocli-playback-'));
process.env.RADIOCLI_HOME = smokeHome;

try {
  const store = new JsonLibraryStore();
  store.updateSettings({volume: 0});
  const providers = new ProviderManager();
  const player = new PlayerController(() => store.snapshot().settings);
  const backends = player.refreshDetectedBackends();

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

  try {
    await player.play(station, resolved.url);
    await delay(4500);
  } finally {
    await player.stop();
  }
  console.log('playback_smoke=ok');
} finally {
  if (originalRadioCliHome === undefined) {
    delete process.env.RADIOCLI_HOME;
  } else {
    process.env.RADIOCLI_HOME = originalRadioCliHome;
  }

  rmSync(smokeHome, {force: true, recursive: true});
}
