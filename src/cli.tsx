#!/usr/bin/env node
import {realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ProviderManager} from './providers/provider-manager.js';
import {PlayerController} from './player/player-controller.js';
import {defaultLibraryPath, JsonLibraryStore} from './storage/store.js';
import {parsePlaylistFile, stationFromUrl, writeM3u} from './playlists/playlist.js';
import {detectPlaybackBackends, playbackBackendStatusLines} from './player/backend-install.js';
import {resolveCommand} from './player/command.js';
import {diagnoseCommand, type CommandDiagnostic} from './player/command-diagnostics.js';
import {airPlaySenderHealth} from './player/airplay-sender-health.js';
import {appVersion} from './version.js';
import {checkForUpdate, installUpdate, updateCommandForInstall} from './update-check.js';
import {runAlarmCommand} from './alarms/cli.js';
import {createSchedulerAdapter, type SchedulerCapabilities} from './alarms/scheduler.js';
import {runSetup} from './setup.js';
import {runAgentCliCommand, runMcpCommand} from './agent/cli.js';
import {decodeAgentCommand} from './agent/service.js';
import {runHeadlessAgentHost} from './agent/headless-host.js';
import {configureMcpIntegrations} from './agent/mcp-install.js';
import {defaultAgentControlSettings} from './types.js';
import {identifyPlatform} from './platform/runtime.js';
import {platformCapabilities} from './platform/capabilities.js';
import {hasGraphicalSession} from './platform/desktop.js';
import {detectPackageManager} from './platform/packages.js';
import {storageReadiness} from './platform/storage.js';
import {resolveTerminalCapabilities} from './platform/terminal.js';
import {networkDiagnostic} from './platform/network.js';
import {assessPlatformSupport} from './platform/support.js';

const runtime = {nodePath: process.execPath, cliPath: fileURLToPath(import.meta.url)};

if (isDirectRun(process.argv[1], import.meta.url)) {
  const args = process.argv.slice(2);

  if (args[0] === 'agent-ui') {
    const encoded = args[1];
    if (!encoded) throw new Error('Missing RadioCLI agent startup request.');
    await renderTui(encoded);
  } else if (args[0] === 'agent-host') {
    await runHeadlessAgentHost();
  } else if (args.length > 0) {
    await runCommand(args).catch(error => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
  } else {
    await renderTui();
  }
}

async function renderTui(encodedCommand?: string): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error('The interactive TUI needs terminal input. Use radiocli commands in a headless session, or connect with a terminal (for example, ssh -t).');
    printHelp();
    process.exitCode = 1;
    return;
  }
  const {configureTerminalRenderer} = await import('./ui/terminal-renderer.js');
  const terminal = await configureTerminalRenderer(process.env, {isTTY: process.stdout.isTTY, colorDepth: process.stdout.getColorDepth?.()});
  const [{render}, {App}] = await Promise.all([import('ink'), import('./ui/App.js')]);
  render(<App initialAgentCommand={encodedCommand ? decodeAgentCommand(encodedCommand) : undefined} />, {
    // App owns Ctrl+C so it can confirm before performing a clean shutdown.
    exitOnCtrlC: false,
    isScreenReaderEnabled: terminal.screenReader,
    interactive: terminal.interactive ? undefined : false,
    debug: !terminal.interactive,
    kittyKeyboard: {mode: terminal.interactive ? 'auto' : 'disabled', flags: ['disambiguateEscapeCodes', 'reportEventTypes', 'reportAllKeysAsEscapeCodes']}
  });
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

  if (command === 'alarm') {
    await runAlarmCommand(rest);
    return;
  }

  if (command === 'mcp') {
    await runMcpCommand(rest, runtime);
    return;
  }

  if (command === 'agent') {
    await runAgentCliCommand(rest, runtime);
    return;
  }

  if (command === 'setup') {
    if (rest.includes('--help') || rest.includes('-h')) {
      printSetupHelp();
      return;
    }
    await runSetup({args: rest});
    return;
  }

  if (!isKnownCommand(command)) {
    throw new Error(`Unknown command: ${command}\nRun radiocli help.`);
  }

  if (command === 'doctor') {
    const backends = detectPlaybackBackends();
    const mpvDiagnostic = diagnoseCommand('mpv');
    const report = await doctorReport(backends, mpvDiagnostic);
    if (rest.includes('--json')) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }
    console.log(`backends=${backends.join(',') || 'none'}`);
    printMpvDiagnostic(mpvDiagnostic);
    printPlaybackBackendStatus(backends);
    for (const [name, capability] of Object.entries(report.capabilities)) {
      console.log(`capability_${name}=${capability.status} ${capability.message}`);
    }
    console.log(`network=${report.network.status} ${report.network.message}`);
    console.log(`support_tier=${report.support.tier} runtime=${report.support.runtime.status}`);
    for (const reason of report.support.reasons) console.log(`support_note=${reason}`);
    return;
  }

  if (command === 'update') {
    const unknown = rest.filter(arg => arg !== '--install');
    if (unknown.length > 0) throw new Error('Usage: radiocli update [--install]');
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
      const agentControl = new JsonLibraryStore().snapshot().settings.agentControl ?? defaultAgentControlSettings;
      if (agentControl.enabled) {
        try {
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
  radiocli setup           Install and verify native playback tools
  radiocli mcp <command>   Install, inspect, or run the MCP integration
  radiocli agent <command> Scriptable radio controls for local agents
  radiocli update          Show update availability and install command
  radiocli update --install Install the latest release and repair enabled MCP entries
  radiocli countries       Print top countries
  radiocli search <query>  Search public stations
  radiocli import <file>   Import .m3u, .pls, or .xspf streams
  radiocli export [file]   Export favorites/imports as .m3u
  radiocli add-url <url> [name]
  radiocli alarm <command> Manage alarms and scheduled radio
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
  return ['check', 'doctor', 'setup', 'update', 'countries', 'search', 'import', 'export', 'add-url', 'alarm', 'mcp', 'agent'].includes(command);
}

function printSetupHelp(): void {
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
  radiocli setup --package-manager <pm>  Use brew, winget, scoop, choco,
                                         apt, dnf, pacman, apk, zypper,
                                         pkg (FreeBSD), pkg_add, pkgin,
                                         termux-pkg (Termux), or pkgman (Haiku)
`);
}

function printPlaybackBackendStatus(backends: string[]): void {
  for (const line of playbackBackendStatusLines(backends)) {
    console.log(line);
  }
}

async function doctorReport(backends: string[], mpvDiagnostic: CommandDiagnostic) {
  const commands = Object.fromEntries(
    ['mpv', 'ffplay', 'vlc', 'cvlc', 'ffmpeg', 'dns-sd'].map(command => [command, redactHome(resolveCommand(command))])
  );
  const airPlay = airPlaySenderHealth();
  const host = identifyPlatform();
  const terminal = resolveTerminalCapabilities(process.env, {isTTY: Boolean(process.stdout.isTTY), colorDepth: process.stdout.getColorDepth?.()});
  let scheduler: SchedulerCapabilities | undefined;
  try {
    const adapter = createSchedulerAdapter();
    scheduler = await adapter.probeCapabilities?.();
  } catch {
    scheduler = {supported: false, exactWake: false, catchUpAfterWake: false, message: 'The optional scheduler probe failed. Run radiocli alarm doctor for repair guidance.'};
  }
  const integrationCommands = [
    'launchctl', 'schtasks.exe', 'systemctl', 'caffeinate', 'systemd-inhibit',
    'powershell.exe', 'pwsh.exe', 'osascript', 'wpctl', 'pactl', 'amixer',
    'open', 'explorer', 'xdg-open', 'pbcopy', 'clip', 'wl-copy', 'xclip', 'xsel',
    'termux-open-url', 'termux-clipboard-set'
  ].filter(command => resolveCommand(command) !== null);
  const capabilities = platformCapabilities(host, {
    backends,
    commands: integrationCommands,
    graphicalSession: hasGraphicalSession(host),
    packageManager: detectPackageManager(process.platform, host.osRelease),
    storageWritable: libraryWritesAvailable(),
    scheduler,
    unicode: terminal.unicode,
    color: terminal.colorLevel > 0,
    screenReader: terminal.screenReader
  });
  return {
    radioCliVersion: appVersion(),
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    host: {id: host.id, arch: host.arch, armVersion: host.armVersion, endianness: host.endianness, release: host.release, libc: host.libc, isWsl: host.isWsl},
    support: assessPlatformSupport(host),
    capabilities,
    terminal,
    network: networkDiagnostic(),
    backends,
    commands,
    mpv: redactDiagnostic(mpvDiagnostic),
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

function libraryWritesAvailable(): boolean {
  try { return storageReadiness(defaultLibraryPath()).status === 'available'; }
  catch { return false; }
}

function printMpvDiagnostic(diagnostic: CommandDiagnostic): void {
  console.log(`mpv_path=${redactHome(diagnostic.path) ?? 'not-found'}`);
  console.log(`mpv_discovery=${diagnostic.discovery}`);
  console.log(`mpv_launch=${diagnostic.launchable ? 'ready' : 'failed'}`);
  if (diagnostic.version) console.log(`mpv_version=${diagnostic.version}`);
  if (diagnostic.error) console.log(`mpv_error=${diagnostic.error}`);
  if (diagnostic.launchable && diagnostic.discovery !== 'path') {
    console.log('mpv_hint=RadioCLI found mpv outside PATH and can use it directly; no PATH changes are required.');
  } else if (!diagnostic.path && process.platform === 'win32') {
    console.log('mpv_hint=Install with winget, then rerun Doctor; RadioCLI also checks the standard MPV Player install directory.');
  }
}

function redactDiagnostic(diagnostic: CommandDiagnostic): CommandDiagnostic {
  return {...diagnostic, path: redactHome(diagnostic.path)};
}

function redactHome(path: string | null): string | null {
  if (!path) return null;
  const home = process.env.HOME ?? process.env.USERPROFILE;
  return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}
