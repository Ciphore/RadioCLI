import {describe, expect, it} from 'vitest';
import {platformPaths} from './paths.js';

describe('portable paths and historical compatibility', () => {
  it('preserves macOS data/cache paths and the two existing runtime namespaces', () => {
    const paths = platformPaths({platform: 'darwin', home: '/Users/Listener', env: {}});
    expect(paths).toMatchObject({
      library: '/Users/Listener/Library/Application Support/radiocli/radiocli.json',
      legacyLibrary: '/Users/Listener/Library/Application Support/radio-atlas/radio-atlas.json',
      cache: '/Users/Listener/Library/Caches/radiocli/radiocli-cache.json',
      legacyCache: '/Users/Listener/Library/Application Support/radio-atlas/radio-atlas-cache.json',
      runtime: '/Users/Listener/.local/state/radiocli',
      alarmRuntime: '/Users/Listener/Library/Application Support/radiocli/runtime'
    });
  });

  it('uses Windows path semantics even in a mocked host test', () => {
    expect(platformPaths({platform: 'win32', home: 'C:\\Users\\Zoë', env: {APPDATA: 'D:\\Roaming Data', LOCALAPPDATA: 'D:\\Local Data'}})).toMatchObject({
      library: 'D:\\Roaming Data\\RadioCLI\\radiocli.json',
      cache: 'D:\\Local Data\\RadioCLI\\radiocli-cache.json',
      runtime: 'D:\\Local Data\\RadioCLI\\runtime',
      alarmRuntime: 'D:\\Local Data\\RadioCLI\\runtime'
    });
  });

  it.each(['linux', 'freebsd', 'openbsd', 'netbsd', 'android', 'haiku', 'sunos', 'aix'] as const)(
    'retains the existing XDG paths on %s', platform => {
      expect(platformPaths({platform, home: '/home/Zoë', env: {XDG_DATA_HOME: '/data space', XDG_CACHE_HOME: '/cache space', XDG_RUNTIME_DIR: '/runtime space'}})).toMatchObject({
        library: '/data space/radiocli/radiocli.json',
        cache: '/cache space/radiocli/radiocli-cache.json',
        runtime: '/runtime space/radiocli',
        alarmRuntime: '/runtime space/radiocli'
      });
    }
  );

  it('keeps explicit current and legacy home overrides in their original precedence', () => {
    expect(platformPaths({platform: 'linux', home: '/home/test', env: {RADIOCLI_HOME: '/radio 新', RADIO_ATLAS_HOME: '/old'}})).toMatchObject({
      library: '/radio 新/radiocli.json', cache: '/radio 新/radiocli-cache.json', runtime: '/radio 新/runtime', alarmRuntime: '/radio 新/runtime'
    });
    expect(platformPaths({platform: 'linux', home: '/home/test', env: {RADIO_ATLAS_HOME: '/old'}})).toMatchObject({
      library: '/old/radio-atlas.json', cache: '/old/radio-atlas-cache.json', runtime: '/home/test/.local/state/radiocli'
    });
  });
});
