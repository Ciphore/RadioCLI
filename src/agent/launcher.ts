import {spawn, type ChildProcess} from 'node:child_process';
import {existsSync} from 'node:fs';
import {basename, join} from 'node:path';
import {detectAlarmTerminal} from '../alarms/terminal-launcher.js';

const linuxTerminals = new Set(['alacritty', 'foot', 'ghostty', 'gnome-terminal', 'kitty', 'konsole', 'mate-terminal', 'qterminal', 'terminator', 'tilix', 'wezterm', 'xfce4-terminal', 'x-terminal-emulator']);

export async function launchRadioTui(nodePath: string, cliPath: string, encodedCommand: string): Promise<void> {
  const terminal = detectAlarmTerminal();
  const direct = environmentCommand(nodePath, cliPath, ['agent-ui', encodedCommand]);
  const command = `${direct.map(shellQuote).join(' ')}`;
  if (terminal === 'darwin:apple-terminal') await launched(spawnDetached('/usr/bin/osascript', appleTerminalScript(command)));
  else if (terminal === 'darwin:iterm') await launched(spawnDetached('/usr/bin/osascript', iTermScript(command)));
  else if (terminal === 'darwin:wezterm') await launched(spawnDetached('/usr/bin/open', ['-na', 'WezTerm', '--args', 'start', '--always-new-process', '--', ...direct]));
  else if (terminal === 'darwin:ghostty') await launched(spawnDetached('/usr/bin/open', ['-na', 'Ghostty', '--args', '-e', ...direct]));
  else if (terminal === 'darwin:kitty') await launched(spawnDetached('/usr/bin/open', ['-na', 'kitty', '--args', '--detach', ...direct]));
  else if (terminal === 'win32:windows-terminal') await launched(spawnDetached('wt.exe', ['-w', 'new', 'new-tab', '--title', 'RadioCLI', ...direct]));
  else if (terminal === 'win32:console') await launched(spawnDetached('cmd.exe', ['/d', '/c', 'start', 'RadioCLI', 'cmd.exe', '/k', windowsCommand(direct)]));
  else if (terminal.startsWith('linux:')) {
    const executable = terminal.slice('linux:'.length);
    if (!linuxTerminals.has(basename(executable))) throw new Error('Saved Linux terminal is not supported.');
    const name = basename(executable);
    const prefix = name === 'gnome-terminal' || name === 'mate-terminal' || name === 'xfce4-terminal'
      ? ['--']
      : name === 'wezterm' ? ['start', '--always-new-process', '--'] : ['-e'];
    await launched(spawnDetached(executable, [...prefix, ...direct]));
  } else {
    throw new Error('No supported graphical terminal was found. Set agentControl.openUiOnPlay to false or open radiocli manually.');
  }
}

export async function launchHeadlessHost(nodePath: string, cliPath: string): Promise<void> {
  await launched(spawnDetached(nodePath, [cliPath, 'agent-host']));
}

function environmentCommand(nodePath: string, cliPath: string, args: string[]): string[] {
  const command = [nodePath, cliPath, ...args];
  const radioCliHome = process.env.RADIOCLI_HOME;
  if (!radioCliHome) return command;
  if (process.platform === 'win32') {
    return ['cmd.exe', '/d', '/c', `set "RADIOCLI_HOME=${cmdEscape(radioCliHome)}" && ${windowsCommand(command)}`];
  }
  return ['/usr/bin/env', `RADIOCLI_HOME=${radioCliHome}`, ...command];
}

function shellQuote(value: string): string { return `'${value.replaceAll("'", `'\\''`)}'`; }
function windowsCommand(values: string[]): string { return values.map(value => `"${value.replaceAll('"', '""')}"`).join(' '); }
function cmdEscape(value: string): string { return value.replaceAll('%', '%%').replaceAll('"', '""').replaceAll('^', '^^').replaceAll('&', '^&').replaceAll('|', '^|').replaceAll('<', '^<').replaceAll('>', '^>'); }
function appleTerminalScript(command: string): string[] { return ['-e', 'on run argv', '-e', 'tell application "Terminal"', '-e', 'activate', '-e', 'do script (item 1 of argv)', '-e', 'end tell', '-e', 'end run', command]; }
function iTermScript(command: string): string[] { return ['-e', 'on run argv', '-e', 'tell application "iTerm"', '-e', 'activate', '-e', 'set w to (create window with default profile)', '-e', 'tell current session of w to write text (item 1 of argv)', '-e', 'end tell', '-e', 'end run', command]; }
function spawnDetached(command: string, args: readonly string[]): ChildProcess { return spawn(command, [...args], {detached: true, stdio: 'ignore', windowsHide: false}); }
function launched(child: ChildProcess): Promise<void> { return new Promise((resolve, reject) => { child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); }); }); }

export function resolveExecutable(
  input: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string | undefined {
  if ((input.includes('/') || input.includes('\\')) && existsSync(input)) return input;
  const suffixes = platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  const pathDelimiter = platform === 'win32' ? ';' : ':';
  for (const directory of (env.PATH ?? '').split(pathDelimiter)) {
    for (const suffix of suffixes) {
      const path = join(directory, `${input}${suffix}`);
      if (existsSync(path)) return path;
    }
  }
  return undefined;
}
