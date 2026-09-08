import {execFileSync, spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdirSync, mkdtempSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import {launchEnvironment, nodeLaunchCommand, waitForLaunch} from './launch-command.js';

const pathsModule = new URL('./paths.ts', import.meta.url).href;
const tsxModule = import.meta.resolve('tsx');
function probeArgs(platform: string, absolute = false): string[] {
  return ['--import', tsxModule, '--input-type=module', '-e', `
    import {platformPaths} from ${JSON.stringify(pathsModule)};
    import {posix,win32} from 'node:path';
    const paths=platformPaths({platform: ${JSON.stringify(platform)}});
    const path=${platform === 'win32' ? 'win32' : 'posix'};
    process.stdout.write(JSON.stringify(${absolute ? 'Object.fromEntries(Object.entries(paths).map(([key,value])=>[key,path.resolve(value)]))' : 'paths'}));
  `];
}
function run(command: readonly string[], env: NodeJS.ProcessEnv, cwd?: string) {
  return JSON.parse(execFileSync(command[0]!, command.slice(1), {env, cwd, encoding: 'utf8'}));
}

it('waits for an actual stubborn bootstrap to terminate before reporting its timeout', async () => {
  vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
  const child = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000);process.send('ready');"], {stdio: ['ignore', 'ignore', 'ignore', 'ipc']});
  let closed = false;
  child.once('close', () => { closed = true; });
  const result = waitForLaunch(child, {waitForExit: true}).catch(error => error as Error);
  try {
    await once(child, 'message');
    await vi.advanceTimersByTimeAsync(10_250);
    expect(await result).toMatchObject({message: 'Launch bootstrap did not complete.'});
    expect(closed).toBe(true);
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
  } finally {
    vi.useRealTimers();
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'close');
      child.kill('SIGKILL');
      await exited;
    }
  }
});

describe('launch path identity', () => {
  const literal = "Radio Data ' \" $() ; & %PATH%! 单播";
  function compareWorkingDirectories(platform: string, env: NodeJS.ProcessEnv) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'radiocli-launch-cwd-')));
    try {
      const parentCwd = join(root, 'parent workspace');const childCwd = join(root, 'unrelated session');
      mkdirSync(parentCwd);mkdirSync(childCwd);
      const args = probeArgs(platform, true);
      const parent = run([process.execPath, ...args], env, parentCwd);
      const snapshot = launchEnvironment(env, {platform, cwd: parentCwd});
      const child = run(nodeLaunchCommand(process.execPath, args, snapshot), {}, childCwd);
      expect(child).toEqual(parent);
    } finally { rmSync(root, {recursive: true, force: true}); }
  }

  it.skipIf(process.platform === 'win32').each([
    {HOME: './listener', RADIOCLI_HOME: `./${literal}`},
    {HOME: './listener', RADIO_ATLAS_HOME: `./${literal}`, XDG_RUNTIME_DIR: './run'},
    {HOME: './listener', XDG_DATA_HOME: `../${literal}`, XDG_CACHE_HOME: './cache', XDG_RUNTIME_DIR: './run'},
    {HOME: './listener', RADIOCLI_HOME: '', RADIO_ATLAS_HOME: `./${literal}`},
    {HOME: './listener', RADIOCLI_HOME: '', RADIO_ATLAS_HOME: '', XDG_DATA_HOME: '', XDG_CACHE_HOME: '', XDG_RUNTIME_DIR: ''},
    {HOME: ''}
  ])('keeps POSIX storage identity across different working directories: %j', env => compareWorkingDirectories('linux', env));

  it.skipIf(process.platform !== 'win32').each([
    {RADIOCLI_HOME: '.\\Radio Data', USERPROFILE: '.\\listener'},
    {RADIO_ATLAS_HOME: '.\\Radio Data', USERPROFILE: '.\\listener', LOCALAPPDATA: '.\\local'},
    {USERPROFILE: '.\\listener', APPDATA: '.\\roaming', LOCALAPPDATA: '.\\local'},
    {RADIOCLI_HOME: '', RADIO_ATLAS_HOME: '.\\Radio Data', USERPROFILE: '.\\listener'},
    {APPDATA: '', LOCALAPPDATA: '', XDG_DATA_HOME: '', XDG_CACHE_HOME: ''}
  ])('keeps native Windows storage identity across different working directories: %j', env => compareWorkingDirectories('win32', env));

  it.each([
    ['linux', {HOME: `/home/${literal}`, RADIO_ATLAS_HOME: `/legacy/${literal}`, XDG_RUNTIME_DIR: `/run/${literal}`}],
    ['linux', {HOME: `/home/${literal}`, XDG_DATA_HOME: `/data/${literal}`, XDG_CACHE_HOME: `/cache/${literal}`, XDG_RUNTIME_DIR: `/run/${literal}`}],
    ['freebsd', {HOME: `/home/${literal}`, XDG_DATA_HOME: `/data/${literal}`, XDG_CACHE_HOME: `/cache/${literal}`}],
    ['darwin', {HOME: `/Users/${literal}`, XDG_RUNTIME_DIR: `/run/${literal}`}],
    ['win32', {USERPROFILE: `C:\\Users\\${literal}`, APPDATA: `D:\\Roaming\\${literal}`, LOCALAPPDATA: `D:\\Local\\${literal}`}],
    ['linux', {HOME: `/home/${literal}`, RADIOCLI_HOME: `/current/${literal}`, RADIO_ATLAS_HOME: `/legacy/${literal}`}]
  ] as const)('preserves %s parent library, cache, and runtime in a clean child with %j', (platform, env) => {
    const args = probeArgs(platform);
    const parent = run([process.execPath, ...args], env);
    // Both processes receive only the fixture environment. In particular,
    // neither can recover a dropped selector from the test runner's env.
    const child = run(nodeLaunchCommand(process.execPath, args, launchEnvironment(env, {platform})), {});
    expect(child).toEqual(parent);
    if ('RADIO_ATLAS_HOME' in env && !('RADIOCLI_HOME' in env)) {
      expect(child.library).toBe(`${env.RADIO_ATLAS_HOME}/radio-atlas.json`);
      expect(child.cache).toBe(`${env.RADIO_ATLAS_HOME}/radio-atlas-cache.json`);
    }
  });

  it.each([
    {},
    {HOME: '/home/saved'},
    {HOME: '/home/saved', RADIO_ATLAS_HOME: '/saved legacy'},
    {HOME: '/home/saved', RADIOCLI_HOME: '', XDG_DATA_HOME: '', XDG_CACHE_HOME: '', XDG_RUNTIME_DIR: ''}
  ])('preserves absent and empty selectors despite inherited launcher contamination: %j', env => {
    const args = probeArgs('linux', true);
    const expected = run([process.execPath, ...args], env);
    const inherited = {
      HOME: '/home/unrelated', USERPROFILE: 'C:\\Unrelated', APPDATA: '/unrelated/roaming', LOCALAPPDATA: '/unrelated/local',
      RADIOCLI_HOME: '/unrelated/current', RADIO_ATLAS_HOME: '/unrelated/legacy',
      XDG_DATA_HOME: '/unrelated/data', XDG_CACHE_HOME: '/unrelated/cache', XDG_RUNTIME_DIR: '/unrelated/runtime'
    };
    expect(run(nodeLaunchCommand(process.execPath, args, launchEnvironment(env, {platform: 'linux'})), inherited)).toEqual(expected);
  });

  it('persists only approved application, path, and optional desktop settings', () => {
    const env = {RADIO_ATLAS_HOME: '/legacy', XDG_RUNTIME_DIR: '/run/user/1000', RADIOCLI_OFFLINE: '1', DISPLAY: ':0', API_TOKEN: 'secret', NODE_OPTIONS: '--require unsafe.cjs', PATH: '/shell/tools'};
    expect(launchEnvironment(env, {platform: 'linux'})).toEqual({RADIO_ATLAS_HOME: '/legacy', XDG_RUNTIME_DIR: '/run/user/1000', RADIOCLI_OFFLINE: '1'});
    expect(launchEnvironment(env, {platform: 'linux', includeDesktop: true, terminal: 'linux:/bin/kitty'})).toEqual({RADIO_ATLAS_HOME: '/legacy', XDG_RUNTIME_DIR: '/run/user/1000', RADIOCLI_OFFLINE: '1', DISPLAY: ':0', RADIOCLI_ALARM_TERMINAL: 'linux:/bin/kitty'});
  });

  it('resolves Windows relative, drive-relative, and rooted selectors against the launch directory', () => {
    expect(launchEnvironment({RADIOCLI_HOME: 'Radio Data', RADIO_ATLAS_HOME: 'C:legacy', APPDATA: '\\roaming', LOCALAPPDATA: '', USERPROFILE: '.\\listener'}, {platform: 'win32', cwd: 'C:\\Project Workspace'})).toEqual({
      RADIOCLI_HOME: 'C:\\Project Workspace\\Radio Data', RADIO_ATLAS_HOME: 'C:\\Project Workspace\\legacy', APPDATA: 'C:\\roaming', LOCALAPPDATA: 'C:\\Project Workspace', USERPROFILE: 'C:\\Project Workspace\\listener'
    });
  });

  it('preserves empty fallback overrides and the invalid empty Windows user profile', () => {
    expect(launchEnvironment({RADIOCLI_HOME: '', RADIO_ATLAS_HOME: '', USERPROFILE: ''}, {platform: 'win32', cwd: 'C:\\Project'})).toEqual({RADIOCLI_HOME: '', RADIO_ATLAS_HOME: '', USERPROFILE: ''});
  });

  it('validates the captured directory before it becomes a persisted path selector', () => {
    expect(() => launchEnvironment({XDG_DATA_HOME: 'data'}, {platform: 'linux', cwd: '/parent\nworkspace'})).toThrow(/control characters/);
  });

  it.skipIf(process.platform !== 'win32')('clears inherited Windows path selectors regardless of environment-key casing', () => {
    const args = probeArgs('win32');
    const inherited = {UserProfile: 'C:\\Unrelated', AppData: 'C:\\Unrelated\\Roaming', LocalAppData: 'C:\\Unrelated\\Local', radiocli_home: 'C:\\Unrelated\\RadioCLI'};
    expect(run(nodeLaunchCommand(process.execPath, args, launchEnvironment({})), inherited)).toEqual(run([process.execPath, ...args], {}));
  });

  it('applies Windows case-insensitive identity cleanup at the bootstrap boundary', () => {
    const args = ['-e', "process.stdout.write(JSON.stringify(Object.keys(process.env).filter(key=>/^(appdata|radiocli_home)$/i.test(key))))"];
    const command = nodeLaunchCommand(process.execPath, args, {});
    // Inject only the native platform boundary; the generated bootstrap runs
    // unchanged and launches a real child with the resulting environment.
    const probe = `const [program,payload]=JSON.parse(process.argv[1]);require('node:vm').runInNewContext(program,{Buffer,require,console,process:{...process,platform:'win32',argv:[process.execPath,payload],env:{AppData:'C:\\\\Unrelated',radiocli_home:'C:\\\\Other'}}});`;
    expect(run([process.execPath, '-e', probe, JSON.stringify(command.slice(2))], {})).toEqual([]);
  });

  it.each([0, 7])('returns the actual application exit status %s through the bootstrap', code => {
    const command = nodeLaunchCommand(process.execPath, ['-e', `process.exit(${code})`], {});
    expect(spawnSync(command[0]!, command.slice(1), {env: {}}).status).toBe(code);
  });

  it.skipIf(process.platform === 'win32')('reports application signal termination as a launch failure', () => {
    const command = nodeLaunchCommand(process.execPath, ['-e', "process.kill(process.pid,'SIGTERM')"], {});
    expect(spawnSync(command[0]!, command.slice(1), {env: {}}).status).toBe(1);
  });

  it.each(['RADIO_ATLAS_HOME', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'XDG_DATA_HOME', 'XDG_CACHE_HOME', 'XDG_RUNTIME_DIR'])('rejects control characters in the persisted %s selector', key => {
    expect(() => launchEnvironment({[key]: 'bad\nvalue'})).toThrow(/control characters/);
  });
});
