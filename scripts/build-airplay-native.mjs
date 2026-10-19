import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);

/** Optional Linux optimization. The sender retains its upstream JS fallback. */
export function buildAirPlayNative({platform = process.platform, env = process.env, resolve = name => require.resolve(name), execute = spawnSync} = {}) {
  const omitted = Object.entries(env).find(([name]) => name.toLowerCase() === 'npm_config_omit')?.[1] ?? '';
  if (platform !== 'linux' || omitted.split(/[\s,]+/).includes('optional')) return 'skipped';
  let entry;
  try { entry = resolve('node-gyp/bin/node-gyp.js'); } catch { return 'unavailable'; }
  try {
    const result = execute(process.execPath, [entry, 'rebuild'], {
      cwd: fileURLToPath(new URL('../vendor/node-airtunes2/', import.meta.url)), env,
      shell: false, windowsHide: true, timeout: 120_000, stdio: 'ignore'
    });
    return result.status === 0 && !result.error ? 'built' : 'fallback';
  } catch { return 'fallback'; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) buildAirPlayNative();
