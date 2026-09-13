import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolveTerminalCapabilities, type TerminalCapabilities, type TerminalEvidence} from '../platform/terminal.js';

/**
 * Ink uses Chalk's shared instance for both text and panel fills. FORCE_COLOR
 * is a minimum in Chalk, so setting it cannot cap a Windows/CI/truecolor host
 * at 16 or 256 colors. Set the instance's level before the first Ink render.
 * Resolve from Ink itself so nested dependency installations work as well.
 */
export async function configureTerminalRenderer(env: NodeJS.ProcessEnv = process.env, evidence: TerminalEvidence = {}): Promise<TerminalCapabilities> {
  const terminal = resolveTerminalCapabilities(env, evidence);
  const inkRequire = createRequire(import.meta.resolve('ink'));
  const {default: chalk} = await import(pathToFileURL(inkRequire.resolve('chalk')).href) as {default: {level: number}};
  chalk.level = terminal.colorLevel;
  return terminal;
}
