import {homedir} from 'node:os';
import {posix, win32} from 'node:path';

type PathInput = {platform?: string; home?: string; env?: NodeJS.ProcessEnv};

/** Path selectors form one launch identity, including selectors that are absent. */
export const pathEnvironmentKeys = [
  'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA',
  'RADIOCLI_HOME', 'RADIO_ATLAS_HOME',
  'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_RUNTIME_DIR'
] as const;

/**
 * Keep historical namespaces stable. In particular, macOS alarm-control/Guard
 * files and general agent/occurrence runtime files already use different roots.
 * Moving either would strand active authenticated sessions during an upgrade.
 */
export function platformPaths({platform = process.platform, home = homedir(), env = process.env}: PathInput = {}) {
  const path = platform === 'win32' ? win32 : posix;
  const dataRoot = platform === 'darwin' ? path.join(home, 'Library', 'Application Support')
    : platform === 'win32' ? env.APPDATA ?? path.join(home, 'AppData', 'Roaming')
    : env.XDG_DATA_HOME ?? path.join(home, '.local', 'share');
  const cacheRoot = platform === 'darwin' ? path.join(home, 'Library', 'Caches')
    : platform === 'win32' ? env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local')
    : env.XDG_CACHE_HOME ?? path.join(home, '.cache');
  const appName = platform === 'win32' ? 'RadioCLI' : 'radiocli';
  const legacyRoot = platform === 'darwin' ? path.join(home, 'Library', 'Application Support') : env.XDG_DATA_HOME ?? path.join(home, '.local', 'share');
  const legacyCacheRoot = platform === 'darwin' ? legacyRoot : env.XDG_CACHE_HOME ?? path.join(home, '.cache');
  const override = env.RADIOCLI_HOME || env.RADIO_ATLAS_HOME;
  const overrideName = env.RADIOCLI_HOME ? 'radiocli' : 'radio-atlas';
  const library = override ? path.join(override, `${overrideName}.json`) : path.join(dataRoot, appName, 'radiocli.json');
  const cache = override ? path.join(override, `${overrideName}-cache.json`) : path.join(cacheRoot, appName, 'radiocli-cache.json');
  const runtime = env.RADIOCLI_HOME ? path.join(env.RADIOCLI_HOME, 'runtime')
    : platform === 'win32' ? path.join(cacheRoot, appName, 'runtime')
    : path.join(env.XDG_RUNTIME_DIR ?? path.join(home, '.local', 'state'), 'radiocli');
  return {
    library,
    legacyLibrary: override ? library : path.join(legacyRoot, 'radio-atlas', 'radio-atlas.json'),
    cache,
    legacyCache: override ? cache : path.join(legacyCacheRoot, 'radio-atlas', 'radio-atlas-cache.json'),
    runtime,
    alarmRuntime: !env.RADIOCLI_HOME && platform === 'darwin' ? path.join(dataRoot, 'radiocli', 'runtime') : runtime
  };
}
