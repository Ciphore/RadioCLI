import {execFile, spawn, type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {existsSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {describe, expect, it} from 'vitest';
import {createSystemVolumeController} from './system-volume.js';

const execute = promisify(execFile);
type PipeWireObject = {id: number; type: string; props?: Record<string, unknown>; info?: {props?: Record<string, unknown>}};

/** Explicit CI opt-in: a private PipeWire/Pulse server and synthetic sinks.
 * No commands target the desktop's output or establish audible playback. */
describe.skipIf(process.platform !== 'linux' || process.env.RADIOCLI_NATIVE_PIPEWIRE_TEST !== '1')('native output-volume ownership', () => {
  it.each(['wpctl', 'pactl'] as const)('restores independent outputs and refuses replacement devices with %s', async backend => {
    await withAudio(async (directory, env) => {
      const command = async (name: string, args: string[]) => (await execute(name, args, {env, timeout: 3000, maxBuffer: 1024 * 1024})).stdout;
      const wp = (...args: Array<string | number>) => command('wpctl', args.map(String));
      for (const name of ['radiocli-speakers', 'radiocli-headphones']) {
        await command('pw-cli', ['create-node', 'adapter', `{ factory.name = support.null-audio-sink node.name = ${name} media.class = Audio/Sink object.linger = true audio.position = [ FL FR ] }`]);
      }
      let speakers = 0; let headphones = 0;
      await until(async () => {
        const objects = JSON.parse(await command('pw-dump', [])) as PipeWireObject[];
        speakers = objects.find(item => item.info?.props?.['node.name'] === 'radiocli-speakers')?.id ?? 0;
        headphones = objects.find(item => item.info?.props?.['node.name'] === 'radiocli-headphones')?.id ?? 0;
        return speakers > 0 && headphones > 0;
      });
      await wp('set-default', speakers);
      await wp('set-volume', speakers, '20%'); await wp('set-mute', speakers, '1');
      await wp('set-volume', headphones, '85%'); await wp('set-mute', headphones, '0');
      await until(async () => (await command('pactl', ['get-default-sink'])).trim() === 'radiocli-speakers');
      const run = async (name: string, args: string[]) => {
        try { return {code: 0, stdout: await command(name, args), stderr: ''}; }
        catch (error) { const failure = error as Error & {stdout?: string; stderr?: string}; return {code: 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? failure.message}; }
      };
      const controller = createSystemVolumeController('linux', run, name => name === backend ? `/usr/bin/${backend}` : null, {directory: join(directory, 'ownership')});
      const peerBackend = backend === 'wpctl' ? 'pactl' : 'wpctl';
      const peer = createSystemVolumeController('linux', run, name => name === peerBackend ? `/usr/bin/${peerBackend}` : null, {directory: join(directory, 'ownership')});
      const overlapFirst = await controller.acquireMinimum(60);
      const overlapSecond = await peer.acquireMinimum(80);
      await overlapFirst.release();
      expect((await wp('get-volume', speakers)).trim()).toBe('Volume: 0.80');
      await overlapSecond.release();
      expect((await wp('get-volume', speakers)).trim()).toBe('Volume: 0.20 [MUTED]');

      const first = await controller.acquireMinimum(70);
      expect((await wp('get-volume', speakers)).trim()).toBe('Volume: 0.70');
      await wp('set-default', headphones);
      await until(async () => (await command('pactl', ['get-default-sink'])).trim() === 'radiocli-headphones');
      const second = await controller.acquireMinimum(95);
      expect((await wp('get-volume', headphones)).trim()).toBe('Volume: 0.95');
      await first.release();
      expect((await wp('get-volume', speakers)).trim()).toBe('Volume: 0.20 [MUTED]');
      expect((await wp('get-volume', headphones)).trim()).toBe('Volume: 0.95');
      await second.release();
      expect((await wp('get-volume', headphones)).trim()).toBe('Volume: 0.85');
      expect((await wp('get-volume', speakers)).trim()).toBe('Volume: 0.20 [MUTED]');

      await wp('set-default', speakers);
      await until(async () => (await command('pactl', ['get-default-sink'])).trim() === 'radiocli-speakers');
      const disconnected = await controller.acquireMinimum(70);
      await command('pw-cli', ['destroy', String(speakers)]);
      await command('pw-cli', ['create-node', 'adapter', '{ factory.name = support.null-audio-sink node.name = radiocli-speakers media.class = Audio/Sink object.linger = true audio.position = [ FL FR ] }']);
      let replacement = 0;
      await until(async () => {
        const objects = JSON.parse(await command('pw-dump', [])) as PipeWireObject[];
        replacement = objects.find(item => item.info?.props?.['node.name'] === 'radiocli-speakers')?.id ?? 0;
        return replacement > 0;
      });
      await wp('set-volume', replacement, '37%'); await wp('set-mute', replacement, '0');
      await expect(disconnected.release()).rejects.toThrow();
      expect((await wp('get-volume', replacement)).trim()).toBe('Volume: 0.37');
      expect(existsSync(join(directory, 'ownership', 'state.json'))).toBe(true);
    });
  }, 30_000);
});

async function withAudio(check: (directory: string, env: NodeJS.ProcessEnv) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'radiocli-native-audio-'));
  const env = {...process.env, LC_ALL: 'C', XDG_RUNTIME_DIR: directory, XDG_STATE_HOME: directory, PIPEWIRE_RUNTIME_DIR: directory, PIPEWIRE_REMOTE: 'pipewire-0', PULSE_SERVER: `unix:${directory}/pulse/native`};
  const children: Array<{child: ChildProcess; closed: Promise<unknown>}> = [];
  const start = (name: string) => {
    const child = spawn(name, [], {env, stdio: 'ignore'});
    const closed = once(child, 'close'); void closed.catch(() => undefined);
    children.push({child, closed});
  };
  try {
    start('pipewire');
    await until(async () => existsSync(join(directory, 'pipewire-0')));
    start('wireplumber'); start('pipewire-pulse');
    await until(async () => {
      const output = await execute('pw-dump', [], {env, timeout: 1000, maxBuffer: 1024 * 1024});
      const objects = JSON.parse(output.stdout) as PipeWireObject[];
      return existsSync(join(directory, 'pulse', 'native')) && objects.some(item => item.type === 'PipeWire:Interface:Metadata' && item.props?.['metadata.name'] === 'default');
    });
    await check(directory, env);
  } finally {
    for (const {child, closed} of children.reverse()) {
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 1000);
      try { await closed; } catch { /* A failed spawn is reported by readiness. */ }
      finally { clearTimeout(force); }
    }
    rmSync(directory, {force: true, recursive: true});
  }
}

async function until(predicate: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try { if (await predicate()) return; } catch { /* Services are still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error('The private audio fixture did not become ready.');
}
