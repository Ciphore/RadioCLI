import {statSync} from 'node:fs';
import {packageInstallCommand, type SetupCommand, type SetupPackageManager} from '../platform/packages.js';
import type {AirPlayReadiness} from './airplay-readiness.js';

const airPlaySenderInstallGuidance = 'Reinstall RadioCLI with optional dependencies enabled (npm install -g @ciphore/radiocli --include=optional), then rerun radiocli doctor. Use the same installation method and prefix as the current install.';

export function hasSystemdSystemManager(): boolean {
  try { return process.platform === 'linux' && statSync('/run/systemd/system').isDirectory(); } catch { return false; }
}

/** Only apt and Arch have verified Avahi package recipes here. */
export function linuxAirPlaySetupPlan({manager, elevation, hasCommand, systemd, serviceReady, existingCommands}: {
  manager: SetupPackageManager | null;
  elevation: 'sudo' | 'doas' | null;
  hasCommand(command: string): boolean;
  systemd: boolean;
  serviceReady: boolean;
  existingCommands: readonly SetupCommand[];
}): {commands: SetupCommand[]; notes: string[]} {
  const commands: SetupCommand[] = [];
  const notes = ['Experimental Linux AirPlay is optional. Avahi supplies shared local-network discovery; enabling its system service affects the whole machine.'];
  if (!hasCommand('ffmpeg') && !existingCommands.some(command => command.component === 'ffmpeg')) {
    const command = manager ? packageInstallCommand(manager, 'ffmpeg', {elevation}) : null;
    if (command) commands.push({...command, component: null, label: 'AirPlay FFmpeg'});
    else notes.push('Install FFmpeg manually for AirPlay, then rerun radiocli setup --airplay.');
  }
  if (!hasCommand('avahi-browse') || !serviceReady && !hasCommand('avahi-daemon')) {
    const recipe = manager === 'apt' ? ['apt-get', 'install', '-y', 'avahi-daemon', 'avahi-utils']
      : manager === 'pacman' ? ['pacman', '-S', '--needed', '--noconfirm', 'avahi'] : null;
    if (recipe) commands.push(setupAction('Avahi discovery', recipe, elevation));
    else notes.push('Install Avahi daemon and avahi-browse with your distribution package manager; no verified automatic Avahi recipe is available for this manager.');
  }
  if (!serviceReady) {
    if (systemd && hasCommand('systemctl') && (hasCommand('avahi-daemon') || manager === 'apt' || manager === 'pacman')) {
      commands.push(setupAction('Enable and start shared Avahi service', ['systemctl', 'enable', '--now', 'avahi-daemon.service'], elevation));
    } else notes.push('Start the Avahi daemon with your system service manager, then rerun radiocli doctor. RadioCLI will not guess or change this service configuration.');
  }
  return {commands, notes};
}

export function airPlaySetupVerification(readiness: AirPlayReadiness): string[] {
  const ready = readiness.ready && readiness.discoveryService === 'ready';
  return [
    ready ? 'AirPlay: experimental prerequisites ready. Select a receiver to verify playback.' : `AirPlay: Setup required. ${readiness.message}`,
    ...(!readiness.senderLoaded ? [airPlaySenderInstallGuidance] : []),
    ...(readiness.discoveryService === 'unverified' ? ['Avahi service readiness is unverified. Install busctl or verify the running daemon with your system administrator; receiver discovery remains available explicitly.'] : [])
  ];
}

function setupAction(label: string, invocation: string[], elevation: 'sudo' | 'doas' | null): SetupCommand {
  const [program, ...args] = elevation ? [elevation, ...invocation] : invocation;
  return {component: null, label, program: program!, args, display: [program, ...args].join(' ')};
}
