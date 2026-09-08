import {spawn} from 'node:child_process';
import {resolveCommandDetails} from '../platform/executables.js';
import {launchTerminalCommand, waitForLaunch, type TerminalOptions} from '../platform/terminals.js';

/** The agent service verifies the authenticated session after this request. */
export async function launchRadioTui(nodePath: string, cliPath: string, encodedCommand: string, options: TerminalOptions = {}): Promise<void> {
  await launchTerminalCommand({...options, nodePath, args: [cliPath, 'agent-ui', encodedCommand], title: 'RadioCLI'});
}

export async function launchHeadlessHost(nodePath: string, cliPath: string): Promise<void> {
  await waitForLaunch(spawn(nodePath, [cliPath, 'agent-host'], {detached: true, stdio: 'ignore', windowsHide: false}));
}

export function resolveExecutable(
  input: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string | undefined {
  return resolveCommandDetails(input, {platform, env}).path ?? undefined;
}
