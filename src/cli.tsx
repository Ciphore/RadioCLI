#!/usr/bin/env node
import {render} from 'ink';
import {App} from './ui/App.js';
import {ProviderManager} from './providers/provider-manager.js';
import {PlayerController} from './player/player-controller.js';
import {JsonLibraryStore} from './storage/store.js';
import {parsePlaylistFile, stationFromUrl, writeM3u} from './playlists/playlist.js';

const args = process.argv.slice(2);

if (args.length > 0) {
  await runCommand(args).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
} else {
  render(<App />, {
    exitOnCtrlC: true,
    kittyKeyboard: {
      mode: 'auto',
      flags: ['disambiguateEscapeCodes', 'reportEventTypes', 'reportAllKeysAsEscapeCodes']
    }
  });
}

async function runCommand(args: string[]): Promise<void> {
  const [command, ...rest] = args;
  const store = new JsonLibraryStore();
  const providers = new ProviderManager();

  if (command === 'check') {
    const player = new PlayerController(() => store.snapshot().settings);
    const health = await providers.health(store.snapshot().settings);
    console.log(`store=${store.filePath}`);
    console.log(`backends=${player.detectedBackends().join(',') || 'none'}`);
    for (const [provider, status] of Object.entries(health)) {
      console.log(`${provider}=${status}`);
    }
    return;
  }

  if (command === 'countries') {
    const countries = await providers.countries(30);
    for (const country of countries) {
      console.log(`${country.code}\t${country.stationCount}\t${country.name}`);
    }
    return;
  }

  if (command === 'search') {
    const query = rest.join(' ').trim();
    if (!query) {
      throw new Error('Usage: radio-atlas search <query>');
    }

    const stations = await providers.search(query, store.snapshot().settings, {limit: 20});
    for (const station of stations) {
      console.log(`${station.provider}:${station.id}\t${station.name}\t${station.country ?? ''}\t${station.codec ?? ''}\t${station.bitrate ?? ''}`);
    }
    return;
  }

  if (command === 'import') {
    const file = rest[0];
    if (!file) {
      throw new Error('Usage: radio-atlas import <playlist.m3u|playlist.pls|playlist.xspf>');
    }

    const stations = parsePlaylistFile(file);
    store.addImported(stations);
    console.log(`imported=${stations.length}`);
    return;
  }

  if (command === 'export') {
    const file = rest[0] ?? 'radio-atlas-favorites.m3u';
    const state = store.snapshot();
    writeM3u(file, [...state.favorites, ...state.imported]);
    console.log(`exported=${file}`);
    return;
  }

  if (command === 'add-url') {
    const url = rest[0];
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new Error('Usage: radio-atlas add-url <stream-url> [station name]');
    }

    const station = stationFromUrl(url, rest.slice(1).join(' ') || url);
    store.addImported([station]);
    console.log(`added=${station.name}`);
    return;
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  throw new Error(`Unknown command: ${command ?? ''}\nRun radio-atlas help.`);
}

function printHelp(): void {
  console.log(`Radio Atlas

Usage:
  radio-atlas                 Start the TUI
  radio-atlas check           Show provider/backend health
  radio-atlas countries       Print top countries
  radio-atlas search <query>  Search public stations
  radio-atlas import <file>   Import .m3u, .pls, or .xspf streams
  radio-atlas export [file]   Export favorites/imports as .m3u
  radio-atlas add-url <url> [name]
`);
}
