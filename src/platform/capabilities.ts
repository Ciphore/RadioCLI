import {browserCommands, clipboardCandidates} from './desktop.js';
import {nativeAdapters, type PlatformProfile} from './runtime.js';

export type Capability = {status: 'available' | 'unavailable' | 'unverified'; message: string; adapter?: string};
type CapabilityEvidence = {
  backends: readonly string[];
  commands: readonly string[];
  graphicalSession: boolean;
  packageManager?: string | null;
  storageWritable?: boolean;
  scheduler?: {supported: boolean; message: string; catchUpAfterWake?: boolean};
  unicode?: boolean;
  color?: boolean;
  screenReader?: boolean;
};

const available = (message: string, adapter?: string): Capability => ({status: 'available', message, ...(adapter ? {adapter} : {})});
const unavailable = (message: string): Capability => ({status: 'unavailable', message});
const unverified = (message: string, adapter?: string): Capability => ({status: 'unverified', message, ...(adapter ? {adapter} : {})});

/**
 * Availability is independent per feature. Tool discovery never substitutes for
 * desktop, scheduler, audio-device, permission, or upstream runtime verification.
 */
export function platformCapabilities(host: PlatformProfile, evidence: CapabilityEvidence) {
  const adapters = nativeAdapters(host);
  const commands = new Set(evidence.commands);
  const has = (name: string) => commands.has(name);
  const backend = ['mpv', 'ffplay', 'vlc', 'airplay'].find(name => evidence.backends.includes(name));
  const desktop = evidence.graphicalSession;
  const opener = browserCommands(host).find(item => has(item.command));
  const clipboard = clipboardCandidates(host).find(item => has(item.command));
  const schedulerTool = adapters.scheduler === 'launchd' ? 'launchctl'
    : adapters.scheduler === 'task-scheduler' ? 'schtasks.exe' : adapters.scheduler === 'systemd' ? 'systemctl' : null;
  const backgroundScheduling = evidence.scheduler
    ? evidence.scheduler.supported ? available(evidence.scheduler.message, adapters.scheduler ?? undefined) : unavailable(evidence.scheduler.message)
    : schedulerTool && has(schedulerTool) ? unverified('Native scheduler command found; verify the per-user session with radiocli alarm doctor.', adapters.scheduler ?? undefined)
      : unavailable(adapters.scheduler ? `The ${schedulerTool} scheduler command is unavailable.` : `Reliable background scheduling has no verified adapter on ${host.id}.`);
  const sleepTool = adapters.inhibitor === 'caffeinate' ? 'caffeinate' : adapters.inhibitor === 'logind' ? 'systemd-inhibit' : adapters.inhibitor === 'windows' ? 'powershell.exe' : null;
  const volumeTool = adapters.volume === 'macos' ? has('osascript') ? 'osascript' : null
    : adapters.volume === 'windows' ? ['powershell.exe', 'pwsh.exe'].find(has)
      : adapters.volume === 'unix-audio' ? ['wpctl', 'pactl', 'amixer'].find(has) : null;
  const storage = evidence.storageWritable === true ? available('The local data directory is writable; operations still verify each write.')
    : evidence.storageWritable === false ? unavailable('Local data is not writable. Set RADIOCLI_HOME to a private writable directory; existing readable data can still be inspected.')
      : unverified('Local JSON data uses the existing private user paths; writability is checked when used.');
  return {
    playback: backend ? available(`${backend} executable detected; stream and audio-device readiness are checked when tuning.`, backend) : unavailable('No playback backend detected. Run radiocli setup or configure a native player path.'),
    playbackControls: backend === 'mpv' ? available('mpv IPC provides pause, mute, volume, metadata, and media keys.', 'mpv')
      : unavailable(backend === 'airplay' ? 'AirPlay provides volume and mute; pause and media-key playback controls require local mpv.' : 'Pause, mute, volume, metadata, and media-key playback controls require mpv.'),
    packageInstallation: evidence.packageManager ? available('Explicit setup plans require confirmation or --yes; --dry-run never installs.', evidence.packageManager) : unavailable('No supported package manager detected; install playback prerequisites manually.'),
    storage,
    filePermissions: adapters.posixPermissions ? available('Private files use mode 0600 and private directories use mode 0700; the filesystem must enforce POSIX permissions.') : available('Private user directories inherit Windows ACLs; POSIX modes do not configure Windows ACLs.'),
    atomicWrites: evidence.storageWritable === false ? unavailable('Atomic replacement requires a writable destination directory.') : available('Temporary files are renamed within the destination directory; write failures are reported.'),
    externalUrl: desktop && opener ? available('A desktop URL handler is available; execution is checked when used.', opener.command) : unavailable('No usable desktop URL handler/session detected. Open the station homepage manually.'),
    clipboard: desktop && clipboard ? available('A clipboard command is available; execution is checked when used.', clipboard.command) : unavailable('No usable clipboard command/session detected. RadioCLI can display the text for manual copying.'),
    terminalReopening: desktop && adapters.terminal ? unverified('A supported installed terminal must be found and its launch verified.', adapters.terminal) : unavailable('No supported graphical terminal session. Use the current TUI or explicitly select headless agent playback.'),
    backgroundScheduling,
    catchUp: backgroundScheduling.status === 'available' && evidence.scheduler?.catchUpAfterWake ? available('The native scheduler can deliver a missed occurrence; RadioCLI still enforces the configured grace window.')
      : backgroundScheduling.status === 'unverified' ? unverified('Catch-up depends on an accessible native user scheduler and its session.') : unavailable('Catch-up delivery is not verified in this session.'),
    wakeRequests: adapters.scheduler === 'task-scheduler' ? unverified('Task Scheduler can request WakeToRun; hardware, login state, and power policy decide delivery.') : unavailable('No privileged or exact wake request is made on this platform. Catch-up and idle-sleep inhibition are separate capabilities.'),
    sleepInhibition: sleepTool && has(sleepTool) ? unverified('A sleep-inhibitor tool is installed; its lease must remain alive to provide protection.', sleepTool) : unavailable('No usable per-process sleep inhibitor. Normal playback remains available; sleep may interrupt it.'),
    systemVolume: volumeTool ? unverified('The system mixer must respond before alarm volume can be raised and restored.', volumeTool) : unavailable('System output volume cannot be adjusted. Set the device volume manually; player volume remains independent.'),
    unicode: evidence.unicode === false ? unavailable('ASCII decoration mode is selected; international station data is preserved.') : available('Unicode decoration is enabled; terminal font coverage determines glyph appearance.'),
    color: evidence.color === false ? unavailable('Color is disabled for the terminal or by user preference.') : available('Color is enabled at the terminal supported depth.'),
    screenReader: available(evidence.screenReader ? 'Screen-reader mode is enabled; decorative animation is disabled.' : 'Screen-reader mode is available through INK_SCREEN_READER=true.'),
    airPlay: adapters.airPlay && evidence.backends.includes('airplay') ? available('Experimental macOS output; receiver selection and worker readiness are still required.', 'airplay') : unavailable(adapters.airPlay ? 'Experimental AirPlay requires FFmpeg, Bonjour, and the safe optional sender.' : 'AirPlay output is available only on macOS.')
  };
}
