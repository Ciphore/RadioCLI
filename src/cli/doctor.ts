import {defaultLibraryPath} from '../storage/store.js';
import {detectPlaybackBackends, playbackBackendStatusLines} from '../player/backend-install.js';
import {resolveCommand} from '../platform/executables.js';
import {diagnoseCommand, type CommandDiagnostic} from '../player/command-diagnostics.js';
import {readSettingsWithoutMigration} from '../storage/read-settings.js';
import {airPlaySenderHealth} from '../player/airplay-sender-health.js';
import {appVersion} from '../version.js';
import {identifyPlatform} from '../platform/runtime.js';
import {platformCapabilities} from '../platform/capabilities.js';
import {hasGraphicalSession} from '../platform/desktop.js';
import {detectPackageManager} from '../platform/packages.js';
import {storageReadiness} from '../platform/storage.js';
import {resolveTerminalCapabilities} from '../platform/terminal.js';
import {networkDiagnostic} from '../platform/network.js';
import {assessPlatformSupport} from '../platform/support.js';

export async function runDoctor(rest: string[]): Promise<void> {
  const saved = (() => { try { return readSettingsWithoutMigration(defaultLibraryPath()); } catch { return undefined; } })();
  const backends = detectPlaybackBackends({settings: {linuxAirPlayEnabled: saved?.linuxAirPlayEnabled === true}});
  const mpvDiagnostic = diagnoseCommand('mpv');
  const base = await doctorReport(backends, mpvDiagnostic);
  const playbackRehearsal = rest.includes('--playback') ? await (await import('../setup-playback.js')).verifyLocalPlayback(backends) : undefined;
  const report = {...base, ...(playbackRehearsal ? {playbackRehearsal} : {})};
  if (rest.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`backends=${backends.join(',') || 'none'}`);
  printMpvDiagnostic(report.mpv);
  for (const line of playbackBackendStatusLines(backends)) console.log(line);
  for (const [name, capability] of Object.entries(report.capabilities)) {
    console.log(`capability_${name}=${capability.status} ${capability.message}`);
  }
  console.log(`omarchy=${report.omarchy.kind} status=${report.omarchy.status} version=${report.omarchy.version ?? 'unknown'} source=${report.omarchy.source ?? 'none'}`);
  if (report.omarchy.session) console.log(`desktop_session=${report.omarchy.session.type} remote=${report.omarchy.session.remote ? 'yes' : 'no'}`);
  console.log(`omarchy_launcher=${report.omarchy.terminal.prerequisitesReady ? 'ready' : 'unavailable'} missing=${report.omarchy.terminal.missing.join(',') || 'none'}`);
  console.log(`desktop_media_preference=${report.desktopMedia.preference.value} source=${report.desktopMedia.preference.source} status=${report.desktopMedia.preference.status}`);
  console.log(`desktop_media_policy=${report.desktopMedia.policy.status} eligible=${report.desktopMedia.policy.eligible ? 'yes' : 'no'} ${report.desktopMedia.policy.message}`);
  console.log(`desktop_media_bus=${report.desktopMedia.sessionBus.status} ${report.desktopMedia.sessionBus.message}`);
  console.log(`desktop_media_owner=${report.desktopMedia.owner.status} ${report.desktopMedia.owner.message}`);
  console.log(`terminal_launcher=${report.terminalLauncher.selected ?? 'none'} prerequisites=${report.terminalLauncher.prerequisites} launch=${report.terminalLauncher.launch} ${report.terminalLauncher.message}`);
  console.log(`audio_session=${report.audio.status} backend=${report.audio.backend ?? 'none'} ${report.audio.message}`);
  if (playbackRehearsal) {
    for (const rehearsal of playbackRehearsal) console.log(`decoder_${rehearsal.backend}=${rehearsal.status} ${rehearsal.message}`);
    if (!playbackRehearsal.length) console.log('decoder=unverified No local playback backend is available for a rehearsal.');
    console.log('physical_output=unverified Null/dummy playback does not verify speakers, headphones, receivers, or a live network stream.');
  }
  console.log(`airplay_readiness=${report.airPlay.state !== 'enabled' ? report.airPlay.state : report.airPlay.ready ? 'ready' : 'unavailable'} discovery=${report.airPlay.discoveryService} sender=${report.airPlay.senderLoaded ? 'loaded' : 'unavailable'} ${report.airPlay.message}`);
  console.log(`network=${report.network.status} ${report.network.message}`);
  console.log(`support_tier=${report.support.tier} runtime=${report.support.runtime.status}`);
  console.log(`support_scope=${report.support.scope}`);
  console.log('support_note=Doctor checks this installation without running packed-install or audio acceptance tests; reference CI results are documented in the platform matrix.');
  for (const reason of report.support.reasons) console.log(`support_note=${reason}`);
}

async function doctorReport(backends: string[], mpvDiagnostic: CommandDiagnostic) {
  const commands = Object.fromEntries(
    ['mpv', 'ffplay', 'vlc', 'cvlc', 'ffmpeg', 'dns-sd'].map(command => [command, redactHome(resolveCommand(command))])
  );
  const airPlay = airPlaySenderHealth();
  const host = identifyPlatform();
  const {probeNativeIntegrations, probeDoctorScheduler} = await import('../platform/diagnostics.js');
  const native = await probeNativeIntegrations({host, libraryPath: defaultLibraryPath});
  const terminal = resolveTerminalCapabilities(process.env, {isTTY: Boolean(process.stdout.isTTY), colorDepth: process.stdout.getColorDepth?.()});
  const scheduler = await probeDoctorScheduler(host);
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
    screenReader: terminal.screenReader,
    airPlay: native.airPlay
  });
  return {
    radioCliVersion: appVersion(),
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    host: {id: host.id, arch: host.arch, armVersion: host.armVersion, endianness: host.endianness, release: host.release, libc: host.libc, isWsl: host.isWsl},
    support: {scope: 'current-installation' as const, ...assessPlatformSupport(host)},
    capabilities,
    terminal,
    omarchy: native.omarchy,
    desktopMedia: native.desktopMedia,
    terminalLauncher: native.terminalLauncher,
    audio: native.audio,
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
      warningPackages: airPlay.warningPackages,
      ...native.airPlay
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
  // Executable banners and spawn errors can include private build paths, URLs,
  // or environment values. Keep a bounded version token and actionable status.
  const version = diagnostic.version?.slice(0, 256).match(/^mpv\s+(v?\d+(?:\.\d+){1,3}(?:[a-z\d.+-]{0,80})?)(?:\s|$)/i)?.[1];
  const error = diagnostic.error === null ? null : diagnostic.discovery === 'missing' ? 'not found'
    : diagnostic.discovery === 'configured-path' ? 'The configured mpv executable could not be run. Check RADIOCLI_MPV_PATH.'
      : 'mpv could not be launched. Check the executable and its native runtime dependencies.';
  return {...diagnostic, path: redactHome(diagnostic.path), version: version ? `mpv ${version}` : null, error};
}

function redactHome(path: string | null): string | null {
  if (!path) return null;
  const home = process.env.HOME ?? process.env.USERPROFILE;
  return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}
