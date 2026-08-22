#!/usr/bin/env node
import {realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ProviderManager} from './providers/provider-manager.js';
import {PlayerController} from './player/player-controller.js';
import {JsonLibraryStore} from './storage/store.js';
import {parsePlaylistFile, stationFromUrl, writeM3u} from './playlists/playlist.js';
import {detectPlaybackBackends, playbackBackendStatusLines} from './player/backend-install.js';
import {resolveCommand} from './player/command.js';
import {airPlaySenderHealth} from './player/airplay-sender-health.js';
import {appVersion} from './version.js';
import {checkForUpdate, updateCommandForInstall} from './update-check.js';

if (isDirectRun(process.argv[1], import.meta.url)) {
  const args = process.argv.slice(2);

  if (args.length > 0) {
    await runCommand(args).catch(error => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
  } else {
    const [{render}, {App}] = await Promise.all([import('ink'), import('./ui/App.js')]);
    render(<App />, {
      // App owns Ctrl+C so it can confirm before performing a clean shutdown.
      exitOnCtrlC: false,
      kittyKeyboard: {
        mode: 'auto',
        flags: ['disambiguateEscapeCodes', 'reportEventTypes', 'reportAllKeysAsEscapeCodes']
      }
    });
  }
}

export async function runCommand(args: string[]): Promise<void> {
  const [command, ...rest] = args;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'version' || command === '--version' || command === '-v') {
    console.log(appVersion());
    return;
  }

  if (!isKnownCommand(command)) {
    throw new Error(`Unknown command: ${command}\nRun radiocli help.`);
  }

  if (command === 'doctor') {
    const backends = detectPlaybackBackends();
    if (rest.includes('--json')) {
      console.log(JSON.stringify(doctorReport(backends), null, 2));
      return;
    }
    console.log(`backends=${backends.join(',') || 'none'}`);
    printPlaybackBackendStatus(backends);
    return;
  }

  if (command === 'update') {
    const updateCheck = await checkForUpdate();
    const updateCommand = updateCommandForInstall();
    if (updateCheck.error) {
      console.log(`update_check=failed ${updateCheck.error}`);
    } else {
      console.log(`installed=${appVersion()}`);
      console.log(`latest=${updateCheck.latestVersion ?? 'unknown'}`);
      console.log(`available=${updateCheck.updateAvailable ? 'yes' : 'no'}`);
    }
    console.log(`command=${updateCommand.command}`);
    return;
  }

  if (command === 'check') {
    const store = new JsonLibraryStore();
    const providers = new ProviderManager();
    const player = new PlayerController(() => store.snapshot().settings);
    const backends = player.refreshDetectedBackends();
    const health = await providers.health(store.snapshot().settings);
    console.log(`store=${store.filePath}`);
    console.log(`backends=${backends.join(',') || 'none'}`);
    printPlaybackBackendStatus(backends);
    for (const [provider, status] of Object.entries(health)) {
      console.log(`${provider}=${status}`);
    }
    return;
  }

  if (command === 'countries') {
    const providers = new ProviderManager();
    const countries = await providers.countries(30);
    for (const country of countries) {
      console.log(`${country.code}\t${country.stationCount}\t${country.name}`);
    }
    return;
  }

  if (command === 'search') {
    const query = rest.join(' ').trim();
    if (!query) {
      throw new Error('Usage: radiocli search <query>');
    }

    const store = new JsonLibraryStore();
    const providers = new ProviderManager();
    const stations = await providers.search(query, store.snapshot().settings, {limit: 20});
    for (const station of stations) {
      console.log(`${station.provider}:${station.id}\t${station.name}\t${station.country ?? ''}\t${station.codec ?? ''}\t${station.bitrate ?? ''}`);
    }
    return;
  }

  if (command === 'import') {
    const file = rest[0];
    if (!file) {
      throw new Error('Usage: radiocli import <playlist.m3u|playlist.pls|playlist.xspf>');
    }

    const stations = parsePlaylistFile(file);
    const store = new JsonLibraryStore();
    store.addImported(stations);
    console.log(`imported=${stations.length}`);
    return;
  }

  if (command === 'export') {
    const file = rest[0] ?? 'radiocli-favorites.m3u';
    const store = new JsonLibraryStore();
    const state = store.snapshot();
    writeM3u(file, [...state.favorites, ...state.imported]);
    console.log(`exported=${file}`);
    return;
  }

  if (command === 'add-url') {
    const url = rest[0];
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new Error('Usage: radiocli add-url <stream-url> [station name]');
    }

    const station = stationFromUrl(url, rest.slice(1).join(' ') || url);
    const store = new JsonLibraryStore();
    store.addImported([station]);
    console.log(`added=${station.name}`);
    return;
  }
}

export function printHelp(): void {
  console.log(`RadioCLI

Usage:
  radiocli                 Start the TUI
  radiocli version         Print the installed version
  radiocli check           Show provider/backend health
  radiocli doctor [--json] Show local playback setup guidance
  radiocli update          Show update availability and install command
  radiocli countries       Print top countries
  radiocli search <query>  Search public stations
  radiocli import <file>   Import .m3u, .pls, or .xspf streams
  radiocli export [file]   Export favorites/imports as .m3u
  radiocli add-url <url> [name]
`);
}

export function isDirectRun(entryPath: string | undefined, moduleUrl: string): boolean {
  if (!entryPath) {
    return false;
  }

  try {
    return realpathSync(resolve(entryPath)) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

function isKnownCommand(command: string): boolean {
  return ['check', 'doctor', 'update', 'countries', 'search', 'import', 'export', 'add-url'].includes(command);
}

function printPlaybackBackendStatus(backends: string[]): void {
  for (const line of playbackBackendStatusLines(backends)) {
    console.log(line);
  }
}

function doctorReport(backends: string[]): Record<string, unknown> {
  const commands = Object.fromEntries(
    ['mpv', 'ffplay', 'vlc', 'cvlc', 'ffmpeg', 'dns-sd'].map(command => [command, redactHome(resolveCommand(command))])
  );
  const airPlay = airPlaySenderHealth();
  return {
    radioCliVersion: appVersion(),
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    backends,
    commands,
    airPlay: {
      available: airPlay.available,
      safe: airPlay.safe,
      package: airPlay.packageName,
      version: airPlay.version ?? null,
      vulnerablePackages: airPlay.vulnerablePackages,
      warningPackages: airPlay.warningPackages
    },
    guidance: playbackBackendStatusLines(backends)
  };
}

function redactHome(path: string | null): string | null {
  if (!path) return null;
  const home = process.env.HOME ?? process.env.USERPROFILE;
  return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}
