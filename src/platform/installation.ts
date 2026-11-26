import {existsSync, realpathSync} from 'node:fs';

/** Homebrew's opt link survives Cellar cleanup. Use it only when it resolves
 * to this installation, including custom Homebrew prefixes and Linuxbrew. */
export function stableInstallationPath(path: string): string {
  const match = /^(.*)\/Cellar\/([^/]+)\/[^/]+\/(.+)$/.exec(path);
  if (!match) return path;
  const stable = `${match[1]}/opt/${match[2]}/${match[3]}`;
  try { if (realpathSync(stable) === realpathSync(path)) return stable; } catch { /* An unlinked keg has no stable alias. */ }
  return path;
}

export function installationExists(runtime: {nodePath: string; cliPath: string}): boolean {
  return existsSync(runtime.nodePath) && existsSync(runtime.cliPath);
}
