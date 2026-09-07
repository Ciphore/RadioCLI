import {spawn, type SpawnOptions} from 'node:child_process';
import {existsSync, readFileSync, realpathSync} from 'node:fs';
import {createInterface} from 'node:readline/promises';
import type {Readable, Writable} from 'node:stream';
import {clearCommandCache, commandExists} from './player/command.js';
import {detectPlaybackBackends, playbackBackendStatusLines} from './player/backend-install.js';
import {configureMcpIntegrations} from './agent/mcp-install.js';
import {JsonLibraryStore} from './storage/store.js';
import {defaultAgentControlSettings} from './types.js';

export type SetupComponent = 'mpv' | 'ffmpeg' | 'vlc';
export type SetupPackageManager = 'brew' | 'winget' | 'scoop' | 'choco' | 'apt' | 'dnf' | 'pacman' | 'apk' | 'zypper';

type SetupCommand = {
  component: SetupComponent | null;
  label: string;
  program: string;
  args: string[];
  display: string;
};

export type SetupPlan = {
  platform: NodeJS.Platform;
  platformLabel: string;
  packageManager: SetupPackageManager | null;
  installed: Record<SetupComponent, boolean>;
  selected: SetupComponent[];
  commands: SetupCommand[];
};

type SetupOptions = {
  platform?: NodeJS.Platform;
  osRelease?: string;
  args?: string[];
  input?: Readable;
  output?: Writable;
  hasCommand?: (command: string) => boolean;
  runCommand?: (command: SetupCommand, output: Writable) => Promise<void>;
};

type ParsedSetupArgs = {
  all: boolean;
  dryRun: boolean;
  yes: boolean;
  only: SetupComponent[] | null;
  packageManager: SetupPackageManager | null;
  mcp: boolean | null;
  agentUi: boolean | null;
};

const components: SetupComponent[] = ['mpv', 'ffmpeg', 'vlc'];
const packageManagers: SetupPackageManager[] = ['brew', 'winget', 'scoop', 'choco', 'apt', 'dnf', 'pacman', 'apk', 'zypper'];

export async function runSetup(options: SetupOptions = {}): Promise<void> {
  const platform = options.platform ?? process.platform;
  const osRelease = options.osRelease ?? readLinuxOsRelease(platform);
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const hasCommand = options.hasCommand ?? commandExists;
  const parsed = parseSetupArgs(options.args ?? []);
  const installed = detectInstalledComponents(hasCommand);
  const packageManager = parsed.packageManager ?? detectPackageManager(platform, osRelease, hasCommand);

  writeHeader(output);
  output.write(`System  ${platformLabel(platform, osRelease)} · Node ${process.version}\n`);
  output.write(`Manager ${packageManager ?? 'not detected'}\n\n`);

  let selected = parsed.only ?? defaultComponents(platform, parsed.all);
  if (!parsed.yes && !parsed.only && isInteractive(input, output)) {
    selected = await promptForComponents({platform, installed, input, output});
  }
  let mcp = parsed.mcp;
  if (mcp === null && !parsed.yes && isInteractive(input, output)) {
    mcp = await promptYesNo(input, output, '  Agent control via MCP (detected coding agents)', true);
  }
  let agentUi = parsed.agentUi;
  if (mcp === true && agentUi === null && !parsed.yes && isInteractive(input, output)) {
    const note = platform === 'darwin'
      ? ' (macOS will ask the agent app to control Terminal on first use)'
      : ' (opens a separate terminal window)';
    agentUi = await promptYesNo(input, output, `  Open the RadioCLI TUI for agent playback${note}`, true);
  }

  const plan = createSetupPlan({platform, osRelease, packageManager, installed, selected});
  printPlan(plan, output);

  const missing = plan.selected.filter(component => !plan.installed[component]);

  if (missing.length === 0) {
    output.write(plan.selected.length === 0 ? '\nNo components selected.\n' : '\nEverything selected is already installed.\n');
    await finishMcpSetup(mcp, agentUi, parsed.dryRun, output);
    printVerification(output);
    return;
  }

  if (!plan.packageManager) {
    if (parsed.dryRun) {
      output.write('\nDry run complete. Install the missing components manually; no system packages were changed.\n');
      await finishMcpSetup(mcp, agentUi, true, output);
      return;
    }
    throw new Error('No supported system package manager was found. Install mpv manually, then run radiocli doctor.');
  }

  if (parsed.dryRun) {
    output.write('\nDry run complete. No system packages were changed.\n');
    await finishMcpSetup(mcp, agentUi, true, output);
    return;
  }

  if (parsed.packageManager && !hasCommand(parsed.packageManager)) {
    throw new Error(`Requested package manager is not available: ${parsed.packageManager}.`);
  }

  if (!parsed.yes && isInteractive(input, output)) {
    const confirmed = await promptYesNo(input, output, '\nInstall these components?', true);
    if (!confirmed) {
      output.write('Setup cancelled. No system packages were changed.\n');
      return;
    }
  } else if (!parsed.yes) {
    throw new Error('Setup needs an interactive terminal. Use --yes to approve the displayed commands or --dry-run to inspect them.');
  }

  if (plan.commands.some(command => command.program === 'sudo')) {
    output.write('\nRadioCLI needs administrator approval for the system package manager.\n');
    await runVisibleCommand('sudo', ['-v']);
  }

  const execute = options.runCommand ?? runInstallCommand;
  output.write('\nInstalling\n');
  for (const command of plan.commands) {
    await execute(command, output);
  }

  clearCommandCache();
  output.write('\nSetup complete.\n');
  await finishMcpSetup(mcp, agentUi, false, output);
  printVerification(output);
}

export function createSetupPlan({
  platform,
  osRelease = '',
  packageManager,
  installed,
  selected
}: {
  platform: NodeJS.Platform;
  osRelease?: string;
  packageManager: SetupPackageManager | null;
  installed: Record<SetupComponent, boolean>;
  selected: SetupComponent[];
}): SetupPlan {
  const uniqueSelected = components.filter(component => selected.includes(component));
  const missing = uniqueSelected.filter(component => !installed[component]);
  const commands = packageManager ? missing.map(component => packageInstallCommand(packageManager, component)) : [];
  if (packageManager === 'scoop' && missing.some(component => component === 'mpv' || component === 'vlc')) {
    commands.unshift({
      component: null,
      label: 'Scoop extras bucket',
      program: 'scoop',
      args: ['bucket', 'add', 'extras'],
      display: 'scoop bucket add extras'
    });
  }

  return {
    platform,
    platformLabel: platformLabel(platform, osRelease),
    packageManager,
    installed,
    selected: uniqueSelected,
    commands
  };
}

export function detectPackageManager(
  platform: NodeJS.Platform,
  osRelease: string,
  hasCommand: (command: string) => boolean = commandExists
): SetupPackageManager | null {
  if (platform === 'darwin') return hasCommand('brew') ? 'brew' : null;
  if (platform === 'win32') return firstAvailable(['winget', 'scoop', 'choco'], hasCommand);
  if (platform !== 'linux') return null;

  const ids = linuxReleaseIds(osRelease);
  const preferred: SetupPackageManager[] = hasAny(ids, ['debian', 'ubuntu', 'linuxmint', 'pop'])
    ? ['apt']
    : hasAny(ids, ['fedora', 'rhel', 'centos'])
      ? ['dnf']
      : hasAny(ids, ['arch', 'manjaro'])
        ? ['pacman']
        : hasAny(ids, ['alpine'])
          ? ['apk']
          : hasAny(ids, ['opensuse', 'suse'])
            ? ['zypper']
            : ['apt', 'dnf', 'pacman', 'apk', 'zypper'];
  return firstAvailable(preferred, hasCommand);
}

export function parseSetupArgs(args: string[]): ParsedSetupArgs {
  let all = false;
  let dryRun = false;
  let yes = false;
  let only: SetupComponent[] | null = null;
  let packageManager: SetupPackageManager | null = null;
  let mcp: boolean | null = null;
  let agentUi: boolean | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === '--all') all = true;
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--yes' || arg === '-y') yes = true;
    else if (arg === '--mcp') {
      if (mcp === false) throw new Error('Use either --mcp or --no-mcp, not both.');
      mcp = true;
    } else if (arg === '--no-mcp') {
      if (mcp === true) throw new Error('Use either --mcp or --no-mcp, not both.');
      mcp = false;
    } else if (arg === '--agent-ui') {
      if (agentUi === false) throw new Error('Use either --agent-ui or --headless-agent, not both.');
      agentUi = true;
    } else if (arg === '--headless-agent') {
      if (agentUi === true) throw new Error('Use either --agent-ui or --headless-agent, not both.');
      agentUi = false;
    }
    else if (arg === '--only') only = parseComponents(args[++index]);
    else if (arg.startsWith('--only=')) only = parseComponents(arg.slice('--only='.length));
    else if (arg === '--package-manager') packageManager = parsePackageManager(args[++index]);
    else if (arg.startsWith('--package-manager=')) packageManager = parsePackageManager(arg.slice('--package-manager='.length));
    else throw new Error(`Unknown setup option: ${arg}\nRun radiocli setup --help.`);
  }

  if (all && only) throw new Error('Use either --all or --only, not both.');
  if (agentUi !== null && mcp !== true) throw new Error('--agent-ui and --headless-agent require --mcp.');
  return {all, dryRun, yes, only, packageManager, mcp, agentUi};
}

async function finishMcpSetup(enabled: boolean | null, agentUi: boolean | null, dryRun: boolean, output: Writable): Promise<void> {
  if (enabled === null) return;
  if (dryRun) {
    output.write(`\nAgent integration: would be ${enabled ? 'enabled and installed for detected MCP clients' : 'disabled and removed from detected MCP clients'}.\n`);
    return;
  }
  const entry = process.argv[1];
  if (!entry) throw new Error('Could not locate the RadioCLI executable for MCP setup.');
  const results = await configureMcpIntegrations(enabled, {nodePath: process.execPath, cliPath: realpathSync(entry)}, output);
  const failed = results.filter(result => result.status === 'failed');
  if (failed.length > 0) {
    throw new Error(`Playback setup finished, but ${failed.length} agent integration${failed.length === 1 ? '' : 's'} failed: ${failed.map(result => result.client).join(', ')}. Run radiocli mcp status for details.`);
  }
  if (enabled) {
    const store = new JsonLibraryStore();
    const current = store.snapshot().settings.agentControl ?? defaultAgentControlSettings;
    const openUiOnPlay = agentUi ?? current.openUiOnPlay;
    if (openUiOnPlay !== current.openUiOnPlay) {
      store.updateSettings({agentControl: {...current, openUiOnPlay}});
    }
    output.write(openUiOnPlay
      ? '\nAgent playback: terminal TUI enabled (default). The host OS may request app-control permission on first use.\n'
      : '\nAgent playback: headless; no separate terminal window or app-control permission is needed.\n');
  }
}

function parseComponents(value: string | undefined): SetupComponent[] {
  const values = value?.split(',').map(item => item.trim().toLowerCase()).filter(Boolean) ?? [];
  if (values.length === 0 || values.some(value => !components.includes(value as SetupComponent))) {
    throw new Error('--only accepts a comma-separated list of: mpv, ffmpeg, vlc.');
  }
  return components.filter(component => values.includes(component));
}

function parsePackageManager(value: string | undefined): SetupPackageManager {
  if (!value || !packageManagers.includes(value as SetupPackageManager)) {
    throw new Error(`--package-manager accepts: ${packageManagers.join(', ')}.`);
  }
  return value as SetupPackageManager;
}

function packageInstallCommand(manager: SetupPackageManager, component: SetupComponent): SetupCommand {
  const packages: Record<SetupPackageManager, Record<SetupComponent, string>> = {
    brew: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    winget: {mpv: 'shinchiro.mpv', ffmpeg: 'Gyan.FFmpeg', vlc: 'VideoLAN.VLC'},
    scoop: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    choco: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    apt: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    dnf: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    pacman: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    apk: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'},
    zypper: {mpv: 'mpv', ffmpeg: 'ffmpeg', vlc: 'vlc'}
  };
  const packageName = packages[manager][component];
  let program: string = manager;
  let args: string[];

  if (manager === 'brew') args = ['install', component === 'vlc' ? '--cask' : packageName, ...(component === 'vlc' ? [packageName] : [])];
  else if (manager === 'winget') args = ['install', '--id', packageName, '-e', '--accept-package-agreements', '--accept-source-agreements'];
  else if (manager === 'scoop') args = ['install', packageName];
  else if (manager === 'choco') args = ['install', packageName, '-y'];
  else if (manager === 'apt') {
    program = 'sudo';
    args = ['apt-get', 'install', '-y', packageName];
  } else if (manager === 'dnf') {
    program = 'sudo';
    args = ['dnf', 'install', '-y', packageName];
  } else if (manager === 'pacman') {
    program = 'sudo';
    args = ['pacman', '-S', '--needed', '--noconfirm', packageName];
  } else if (manager === 'apk') {
    program = 'sudo';
    args = ['apk', 'add', packageName];
  } else {
    program = 'sudo';
    args = ['zypper', '--non-interactive', 'install', packageName];
  }

  return {component, label: componentLabel(component), program, args, display: [program, ...args].join(' ')};
}

function defaultComponents(platform: NodeJS.Platform, all: boolean): SetupComponent[] {
  if (all) return [...components];
  return platform === 'darwin' ? ['mpv', 'ffmpeg'] : ['mpv'];
}

function detectInstalledComponents(hasCommand: (command: string) => boolean): Record<SetupComponent, boolean> {
  return {
    mpv: hasCommand('mpv'),
    ffmpeg: hasCommand('ffmpeg') && hasCommand('ffplay'),
    vlc: hasCommand('vlc') || hasCommand('cvlc')
  };
}

async function promptForComponents({
  platform,
  installed,
  input,
  output
}: {
  platform: NodeJS.Platform;
  installed: Record<SetupComponent, boolean>;
  input: Readable;
  output: Writable;
}): Promise<SetupComponent[]> {
  output.write('Choose components (installed items will be skipped):\n');
  const selected: SetupComponent[] = [];
  if (await promptYesNo(input, output, `  mpv      Full playback controls${installed.mpv ? ' · installed' : ''}`, true)) selected.push('mpv');
  if (await promptYesNo(input, output, `  FFmpeg   ${platform === 'darwin' ? 'AirPlay + ' : ''}ffplay fallback${installed.ffmpeg ? ' · installed' : ''}`, platform === 'darwin')) selected.push('ffmpeg');
  if (await promptYesNo(input, output, `  VLC      Additional playback fallback${installed.vlc ? ' · installed' : ''}`, false)) selected.push('vlc');
  return selected;
}

async function promptYesNo(input: Readable, output: Writable, question: string, defaultValue: boolean): Promise<boolean> {
  const reader = createInterface({input, output, terminal: true});
  try {
    const answer = (await reader.question(`${question} ${defaultValue ? '(Y/n)' : '(y/N)'} `)).trim().toLowerCase();
    if (!answer) return defaultValue;
    return answer === 'y' || answer === 'yes';
  } finally {
    reader.close();
  }
}

function printPlan(plan: SetupPlan, output: Writable): void {
  output.write('\nInstallation plan\n');
  for (const component of plan.selected) {
    if (plan.installed[component]) output.write(`  ${successMark(output)} ${componentLabel(component)} already installed\n`);
    else {
      const command = plan.commands.find(candidate => candidate.component === component);
      output.write(`  ${pendingMark(output)} ${componentLabel(component)}${command ? ` · ${command.display}` : ' · manual installation required'}\n`);
    }
  }
  if (plan.selected.length === 0) output.write('  No components selected\n');
}

async function runInstallCommand(command: SetupCommand, output: Writable): Promise<void> {
  const interactive = Boolean((output as NodeJS.WriteStream).isTTY);
  const startedAt = Date.now();
  let timer: NodeJS.Timeout | undefined;
  let frame = 0;
  let stderr = '';
  let stdout = '';

  if (interactive) {
    timer = setInterval(() => {
      output.write(`\r${progressFrame(command.label, frame++, Date.now() - startedAt, output)}`);
    }, 90);
  } else {
    output.write(`  installing ${command.label}...\n`);
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command.program, command.args, {stdio: ['inherit', 'pipe', 'pipe']} satisfies SpawnOptions);
      child.stdout?.on('data', chunk => { stdout = tail(`${stdout}${String(chunk)}`); });
      child.stderr?.on('data', chunk => { stderr = tail(`${stderr}${String(chunk)}`); });
      child.once('error', reject);
      child.once('close', code => code === 0 ? resolve() : reject(new Error(`${command.display} exited with code ${code}.${formatCommandDetail(stderr || stdout)}`)));
    });
    if (timer) clearInterval(timer);
    if (interactive) output.write(`\r${clearLine()}  ${successMark(output)} ${command.label} ready ${formatElapsed(Date.now() - startedAt)}\n`);
    else output.write(`  ready ${command.label} ${formatElapsed(Date.now() - startedAt)}\n`);
  } catch (error) {
    if (timer) clearInterval(timer);
    if (interactive) output.write(`\r${clearLine()}  ${failureMark(output)} ${command.label} failed ${formatElapsed(Date.now() - startedAt)}\n`);
    throw error;
  }
}

function progressFrame(label: string, frame: number, elapsedMs: number, output: Writable): string {
  const width = 18;
  const segment = 5;
  const travel = width - segment;
  const cycle = travel * 2;
  const offset = frame % cycle;
  const start = offset <= travel ? offset : cycle - offset;
  const bar = Array.from({length: width}, (_, index) => index >= start && index < start + segment ? '█' : '░').join('');
  return `  ${accent(output, '◒')} ${accent(output, `[${bar}]`)} Installing ${label} ${formatElapsed(elapsedMs)}`;
}

function printVerification(output: Writable): void {
  clearCommandCache();
  const backends = detectPlaybackBackends();
  output.write('\nVerification\n');
  output.write(`  Playback backends: ${backends.join(', ') || 'none'}\n`);
  for (const line of playbackBackendStatusLines(backends).slice(0, 3)) output.write(`  ${line}\n`);
  output.write('\nRun radiocli to start listening.\n');
}

function writeHeader(output: Writable): void {
  output.write(`${accent(output, 'RADIOCLI')}  SETUP RECEIVER\n`);
  output.write(`${accent(output, '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}\n`);
}

function platformLabel(platform: NodeJS.Platform, osRelease: string): string {
  if (platform === 'darwin') return `${process.arch === 'arm64' ? 'macOS Apple Silicon' : 'macOS'}`;
  if (platform === 'win32') return 'Windows';
  if (platform === 'linux') return osReleaseValue(osRelease, 'PRETTY_NAME') || 'Linux';
  return platform;
}

function componentLabel(component: SetupComponent): string {
  if (component === 'ffmpeg') return 'FFmpeg / ffplay';
  if (component === 'vlc') return 'VLC fallback';
  return 'mpv';
}

function isInteractive(input: Readable, output: Writable): boolean {
  return Boolean((input as NodeJS.ReadStream).isTTY && (output as NodeJS.WriteStream).isTTY);
}

function accent(output: Writable, value: string): string {
  return colorsEnabled(output) ? `\u001b[38;2;116;242;138m${value}\u001b[0m` : value;
}

function successMark(output: Writable): string {
  return accent(output, '✓');
}

function pendingMark(output: Writable): string {
  return accent(output, '◆');
}

function failureMark(output: Writable): string {
  return colorsEnabled(output) ? '\u001b[38;2;255;95;135m✗\u001b[0m' : '✗';
}

function colorsEnabled(output: Writable): boolean {
  return Boolean((output as NodeJS.WriteStream).isTTY) && !process.env.NO_COLOR;
}

function clearLine(): string {
  return '\u001b[2K';
}

function formatElapsed(elapsedMs: number): string {
  return `${Math.max(0, Math.floor(elapsedMs / 1000))}s`;
}

function tail(value: string, length = 4000): string {
  return value.length > length ? value.slice(-length) : value;
}

function formatCommandDetail(value: string): string {
  const detail = value.trim().split('\n').slice(-3).join(' ').trim();
  return detail ? ` ${detail}` : '';
}

async function runVisibleCommand(program: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(program, args, {stdio: 'inherit'});
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`${program} ${args.join(' ')} exited with code ${code}.`)));
  });
}

function firstAvailable<T extends string>(values: T[], hasCommand: (command: string) => boolean): T | null {
  return values.find(hasCommand) ?? null;
}

function readLinuxOsRelease(platform: NodeJS.Platform): string {
  if (platform !== 'linux' || !existsSync('/etc/os-release')) return '';
  try {
    return readFileSync('/etc/os-release', 'utf8');
  } catch {
    return '';
  }
}

function linuxReleaseIds(osRelease: string): Set<string> {
  const ids = new Set<string>();
  for (const line of osRelease.split('\n')) {
    const match = /^(ID|ID_LIKE)=(.*)$/.exec(line);
    if (!match) continue;
    for (const value of match[2]!.replaceAll('"', '').split(/\s+/)) if (value.trim()) ids.add(value.trim().toLowerCase());
  }
  return ids;
}

function osReleaseValue(osRelease: string, key: string): string {
  const line = osRelease.split('\n').find(candidate => candidate.startsWith(`${key}=`));
  return line?.slice(key.length + 1).replace(/^"|"$/g, '') ?? '';
}

function hasAny(values: Set<string>, candidates: string[]): boolean {
  return candidates.some(candidate => values.has(candidate));
}
