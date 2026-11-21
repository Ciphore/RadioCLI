import {spawnSync} from 'node:child_process';
import {accessSync, constants} from 'node:fs';
import {delimiter, join} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);

/** Optional Linux optimization. The sender retains its upstream JS fallback. */
export function buildAirPlayNative({platform = process.platform, env = process.env, resolve = name => require.resolve(name), execute = spawnSync, hasTool = name => onPath(name, env)} = {}) {
  const setting = name => Object.entries(env).find(([key]) => key.toLowerCase() === name)?.[1] ?? '';
  if (platform !== 'linux' || setting('npm_config_omit').split(/[\s,]+/).includes('optional') || setting('radiocli_skip_native_build') === '1') return 'skipped';
  let entry;
  try { entry = resolve('node-gyp/bin/node-gyp.js'); } catch { return 'unavailable'; }
  if (setting('npm_config_offline') === 'true' || !hasTool('make') || !['c++', 'g++', 'clang++'].some(hasTool)) return 'fallback';
  try {
    const result = execute(process.execPath, [entry, 'rebuild'], {
      cwd: fileURLToPath(new URL('../vendor/node-airtunes2/', import.meta.url)), env,
      shell: false, windowsHide: true, timeout: 120_000, stdio: 'ignore'
    });
    return result.status === 0 && !result.error ? 'built' : 'fallback';
  } catch { return 'fallback'; }
}

function onPath(name, env) {
  return (env.PATH ?? '').split(delimiter).filter(Boolean).some(directory => {
    try { accessSync(join(directory, name), constants.X_OK); return true; } catch { return false; }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) buildAirPlayNative();
