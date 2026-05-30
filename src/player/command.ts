import {spawnSync} from 'node:child_process';

export function commandExists(command: string): boolean {
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(lookup, [command], {
    stdio: 'ignore'
  });

  return result.status === 0;
}
