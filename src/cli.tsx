#!/usr/bin/env node
import {readFileSync, realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {appVersion} from './version.js';
import {completionCandidates, isListenerCommand, listenerCommands, listenerHelp} from './cli/arguments.js';
import {sanitizeTerminalText} from './safety.js';

const runtime = {nodePath: process.execPath, cliPath: fileURLToPath(import.meta.url)};

if (isDirectRun(process.argv[1], import.meta.url)) {
  const args = process.argv.slice(2);
  process.stdout.on('error', error => {
    if ((error as NodeJS.ErrnoException).code === 'EPIPE') process.exit(0);
    else throw error;
  });

  if (args[0] === 'agent-ui') {
    const encoded = args[1];
    if (!encoded) throw new Error('Missing RadioCLI agent startup request.');
    await renderTui(encoded);
  } else if (args[0] === 'agent-host') {
    const {runHeadlessAgentHost} = await import('./agent/headless-host.js');
    await runHeadlessAgentHost();
  } else if (args.length > 0) {
    await runCommand(args).catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message.split('\n').map(line => sanitizeTerminalText(line) ?? '').join('\n'));
      process.exitCode = error instanceof Error && error.name === 'AbortError' ? 130 : 1;
    });
  } else {
    await renderTui();
  }
}

async function renderTui(encodedCommand?: string): Promise<void> {
  const {renderTui: render} = await import('./cli/render-tui.js');
  await render(printHelp, encodedCommand);
}

export async function runCommand(args: string[]): Promise<void> {
  const [command, ...rest] = args;

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    if (command === 'help' && rest[0] && rest[0] !== '--all') { await runCommand([rest[0], '--help']); return; }
    printHelp(rest.includes('--all'));
    return;
  }

  if (command === 'version' || command === '--version' || command === '-v') {
    console.log(appVersion());
    return;
  }

  if (command === '_complete') {
    let presets: string[] = [];
    if (rest.length > 1 && ['play', 'favorite', 'unfavorite', 'preset'].includes(rest[0]!)) {
      try {
        // Completion is read-only, including when a library needs repair.
        const {defaultLibraryPath} = await import('./storage/store.js');
        const library = JSON.parse(readFileSync(defaultLibraryPath(), 'utf8')) as {presets?: {name?: unknown}[]};
        if (Array.isArray(library.presets)) presets = library.presets.flatMap(preset => typeof preset?.name === 'string' && /^[a-z0-9][a-z0-9_-]{0,39}$/.test(preset.name) ? [preset.name] : []);
      } catch { /* Completion must remain quiet when storage is unavailable. */ }
    }
    const candidates = completionCandidates(rest, presets);
    if (candidates.length) console.log(candidates.join('\n'));
    return;
  }

  const optionArgs = rest.includes('--') ? rest.slice(0, rest.indexOf('--')) : rest;
  const wantsHelp = optionArgs.includes('--help') || optionArgs.includes('-h');
  if (isListenerCommand(command)) {
    if (wantsHelp) console.log(listenerHelp(command));
    else {
      const {runListenerCommand} = await import('./cli/listener.js');
      await runListenerCommand(command, rest, runtime);
    }
    return;
  }
  if (command === 'agent' && wantsHelp) {
    const {agentCommandUsage} = await import('./agent/cli.js');
    console.log(`${agentCommandUsage()}\nJSON controls for local agents. Everyday listening is available directly: radiocli play, now, favorites.`);
    return;
  }
  const commandHelp = legacyCommandHelp()[command];
  if (wantsHelp && commandHelp) { console.log(commandHelp); return; }

  if (command === 'alarm') {
    const {runAlarmCommand} = await import('./alarms/cli.js');
    await runAlarmCommand(rest);
    return;
  }

  if (command === 'mcp') {
    const {runMcpCommand} = await import('./agent/cli.js');
    await runMcpCommand(rest, runtime);
    return;
  }

  if (command === 'agent') {
    const {runAgentCliCommand} = await import('./agent/cli.js');
    await runAgentCliCommand(rest, runtime);
    return;
  }

  if (command === 'setup') {
    if (rest.includes('--help') || rest.includes('-h')) {
      await printSetupHelp();
      return;
    }
    const {runSetup} = await import('./setup.js');
    await runSetup({args: rest});
    return;
  }

  if (command === 'media-controls') {
    if (rest.length > 1 || rest[0] !== undefined && !['auto', 'on', 'off'].includes(rest[0])) {
      throw new Error('Usage: radiocli media-controls [auto|on|off]');
    }
    const [{JsonLibraryStore}, {desktopMediaPolicy}] = await Promise.all([import('./storage/store.js'), import('./platform/desktop-media.js')]);
    const store = new JsonLibraryStore();
    if (rest[0]) store.updateSettings({desktopMediaControls: rest[0] as 'auto' | 'on' | 'off'});
    const policy = desktopMediaPolicy(store.snapshot().settings);
    console.log(`desktop_media_preference=${store.snapshot().settings.desktopMediaControls ?? 'auto'}`);
    console.log(`desktop_media_effective=${policy.preference} ${policy.enabled ? 'enabled' : 'disabled'}`);
    console.log(`desktop_media_note=${policy.reason}`);
    if (rest[0]) console.log('Restart active RadioCLI sessions to apply this preference. RADIOCLI_DESKTOP_MEDIA=off overrides the saved preference.');
    return;
  }

  if (!isKnownCommand(command)) {
    const suggestion = suggestCommand(command);
    throw new Error(`Unknown command: ${command}${suggestion ? `\nDid you mean radiocli ${suggestion}?` : ''}\nRun radiocli help.`);
  }

  if (command === 'doctor') {
    const {runDoctor} = await import('./cli/doctor.js');
    await runDoctor(rest);
    return;
  }

  if (command === 'update') {
    const unknown = rest.filter(arg => arg !== '--install');
    if (unknown.length > 0) throw new Error('Usage: radiocli update [--install]');
    const {checkForUpdate, installUpdate, updateCommandForInstall} = await import('./update-check.js');
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
    if (rest.includes('--install')) {
      const result = await installUpdate(updateCommand.command);
      if (!result.ok) throw new Error(`Update install failed. Run manually: ${result.command}${result.output ? `\n${result.output}` : ''}`);
      console.log('updated=yes');
      const [{JsonLibraryStore}, {defaultAgentControlSettings}] = await Promise.all([import('./storage/store.js'), import('./types.js')]);
      const agentControl = new JsonLibraryStore().snapshot().settings.agentControl ?? defaultAgentControlSettings;
      if (agentControl.enabled) {
        try {
          const {configureMcpIntegrations} = await import('./agent/mcp-install.js');
          const repaired = await configureMcpIntegrations(true, runtime);
          const failed = repaired.filter(item => item.status === 'failed');
          console.log(`mcp_repaired=${failed.length ? 'partial' : 'yes'}`);
          if (failed.length) console.log(`mcp_failures=${failed.map(item => `${item.client}: ${item.detail}`).join('; ')}`);
        } catch (error) {
          console.log(`mcp_repaired=failed ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      console.log('restart_required=yes');
    }
    return;
  }

  if (command === 'check') {
    const [{JsonLibraryStore}, {ProviderManager}, {PlayerController}, {playbackBackendStatusLines}] = await Promise.all([
      import('./storage/store.js'), import('./providers/provider-manager.js'), import('./player/player-controller.js'), import('./player/backend-install.js')
    ]);
    const store = new JsonLibraryStore();
    const providers = new ProviderManager();
    const player = new PlayerController(() => store.snapshot().settings);
    const backends = player.refreshDetectedBackends();
    const health = await providers.health(store.snapshot().settings);
    console.log(`store=${store.filePath}`);
    console.log(`backends=${backends.join(',') || 'none'}`);
    for (const line of playbackBackendStatusLines(backends)) console.log(line);
    for (const [provider, status] of Object.entries(health)) {
      console.log(`${provider}=${status}`);
    }
    return;
  }

  if (command === 'import') {
    const target = rest[0];
    if (!target) {
      throw new Error('Usage: radiocli import <stream-url|playlist.m3u|playlist.pls|playlist.xspf> [station name]');
    }

    const {JsonLibraryStore} = await import('./storage/store.js');
    const store = new JsonLibraryStore();
    if (/^https?:\/\//i.test(target)) {
      const {importStreamUrl} = await import('./streams/import-stream.js');
      const result = await importStreamUrl(target, rest.slice(1).join(' ') || undefined);
      store.addImported([result.station]);
      console.log(`imported=${result.station.name}`);
      if (result.warning) console.log(`warning=${result.warning}`);
      return;
    }

    const {parsePlaylistFile} = await import('./playlists/playlist.js');
    const stations = parsePlaylistFile(target);
    store.addImported(stations);
    console.log(`imported=${stations.length}`);
    return;
  }

  if (command === 'export') {
    const [{JsonLibraryStore}, {writeM3u}] = await Promise.all([import('./storage/store.js'), import('./playlists/playlist.js')]);
    const file = rest[0] ?? 'radiocli-favorites.m3u';
    const store = new JsonLibraryStore();
    const state = store.snapshot();
    writeM3u(file, [...state.favorites, ...state.imported]);
    console.log(`exported=${file}`);
    return;
  }

}

export function printHelp(all = false): void {
  console.log(`RadioCLI

Usage: radiocli [command]
  Run radiocli without a command to open the TUI.

Everyday listening:
  radiocli play [station] Start or continue listening; names and presets work
  radiocli pause          Pause; use play to continue
  radiocli next           Tune the next station in the current queue
  radiocli now            See the current station, track, and volume
  radiocli volume <0-100> Set listening volume
  radiocli favorite       Save the current station
  radiocli favorites      List saved stations; add --pick to choose one
  radiocli stop           Stop playback and close the background player
${all ? `
More listening controls:
  radiocli previous       Tune the previous station in the queue
  radiocli resume         Resume paused playback (play also works)
  radiocli mute | unmute  Mute or restore sound
  radiocli now --watch    Watch station and track changes
  radiocli status         Alias for now
  radiocli play --favorites | --recent | --popular
                         Choose a queue; add --random or --pick

Discovery and library:
  radiocli search <query> Search stations; --country, --limit, --pick
  radiocli countries      List top countries
  radiocli recent         List recently played stations
  radiocli unfavorite     Remove a favorite (current station by default)
  radiocli preset save <name>   Save a shortcut; play with play <name>
  radiocli preset remove <name> Remove a shortcut
  radiocli presets        List shortcuts; also: preset list
  radiocli stats          Show listening time and streaks
  radiocli import <target> Import a stream URL or local playlist
  radiocli export [file]  Export favorites/imports as .m3u
  radiocli alarm <command> Manage alarms and scheduled radio

Setup and integrations:
  radiocli setup          Install and verify native playback tools
  radiocli doctor [--json] Show local playback setup guidance
  radiocli check          Show provider/backend health
  radiocli version        Print the installed version
  radiocli update         Check for updates; --install to install
  radiocli media-controls [auto|on|off] Configure Linux desktop media controls
  radiocli mcp <command>  Install, inspect, or run the MCP integration
  radiocli agent <command> Scriptable radio controls for local agents
` : ''}
Examples:
  radiocli play jazz               Find a station and listen
  radiocli play                    Continue the current or last station
  radiocli play --favorites        Listen from your favorites

More help:
  radiocli help --all              Browse every command by category
  radiocli help play               Options and examples for one command
  radiocli completion <shell>      Print a Tab completion script
${all ? '\nListener commands support --json, --plain, --quiet, and --no-input.\nUse radiocli <command> --help for options and examples.\n' : ''}
`.trimEnd());
}

function legacyCommandHelp(): Record<string, string> { return {
  check: 'Usage: radiocli check\nShow local store paths, playback backends, and provider health.',
  doctor: 'Usage: radiocli doctor [--json] [--playback]\nCheck playback tools without changing settings. Add --playback to rehearse local WAV playback through null/dummy audio.',
  update: 'Usage: radiocli update [--install]\nCheck for updates. Add --install to install and repair enabled MCP entries.',
  import: 'Usage: radiocli import <stream-url|playlist.m3u|playlist.pls|playlist.xspf> [station name]\nExample: radiocli import https://example.com/live.mp3 "Example FM"',
  export: 'Usage: radiocli export [file]\nExport favorites and imports as M3U (default: radiocli-favorites.m3u).',
  'media-controls': 'Usage: radiocli media-controls [auto|on|off]\nInspect or configure Linux desktop media controls.',
  mcp: 'Usage: radiocli mcp <enable|install|repair|disable|status|config|serve>\nManage the optional local agent integration.'
}; }

function suggestCommand(input: string): string | undefined {
  const candidates = [...listenerCommands, ...Object.keys(legacyCommandHelp()), 'setup', 'alarm', 'agent', 'help', 'version'];
  const distance = (word: string): number => {
    let row = Array.from({length: word.length + 1}, (_, index) => index);
    for (let i = 1; i <= input.length; i += 1) {
      const next = [i];
      for (let j = 1; j <= word.length; j += 1) next[j] = Math.min(next[j - 1]! + 1, row[j]! + 1, row[j - 1]! + (input[i - 1] === word[j - 1] ? 0 : 1));
      row = next;
    }
    return row[word.length]!;
  };
  return candidates.map(word => ({word, distance: distance(word)})).filter(item => item.distance <= (input.length > 3 ? 2 : 1)).sort((a, b) => a.distance - b.distance)[0]?.word;
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
  return ['check', 'doctor', 'setup', 'update', 'countries', 'search', 'import', 'export', 'alarm', 'mcp', 'agent'].includes(command);
}

async function printSetupHelp(): Promise<void> {
  const {isAirPlayPlatformSupported} = await import('./player/airplay-policy.js');
  console.log(`RadioCLI Setup

Usage:
  radiocli setup                         Interactive guided setup
  radiocli setup --yes                   Install recommended defaults
  radiocli setup --all --yes             Install mpv, FFmpeg, and VLC
  radiocli setup --only mpv,ffmpeg       Select specific components
  radiocli setup --dry-run               Show commands without installing
  radiocli setup --mcp                   Enable and configure agent MCP clients
  radiocli setup --mcp --agent-ui        Open a terminal TUI for agent playback (default)
  radiocli setup --mcp --headless-agent  Opt out of external terminal windows
  radiocli setup --no-mcp                Disable and remove agent MCP entries
${process.platform === 'linux' && isAirPlayPlatformSupported() ? '  radiocli setup --airplay               Enable experimental Linux AirPlay and set up prerequisites\n  radiocli setup --no-airplay            Disable Linux AirPlay; keep shared services and packages\n' : ''}  radiocli setup --package-manager <pm>  Use brew, winget, scoop, choco,
                                         apt, dnf, pacman, apk, zypper,
                                         pkg (FreeBSD), pkg_add, pkgin,
                                         termux-pkg (Termux), or pkgman (Haiku)
`);
}
