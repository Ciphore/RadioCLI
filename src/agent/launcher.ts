import {spawn} from 'node:child_process';
import {launchTerminalCommand, type TerminalOptions} from '../platform/terminals.js';
import {waitForLaunch} from '../platform/launch-command.js';

/** The agent service verifies the authenticated session after this request. */
export async function launchRadioTui(nodePath: string, cliPath: string, encodedCommand: string, options: TerminalOptions = {}): Promise<void> {
  await launchTerminalCommand({...options, nodePath, args: [cliPath, 'agent-ui', encodedCommand], title: 'RadioCLI'});
}

export async function launchHeadlessHost(nodePath: string, cliPath: string): Promise<void> {
  await waitForLaunch(spawn(nodePath, [cliPath, 'agent-host'], {detached: true, stdio: 'ignore', windowsHide: false}));
}
