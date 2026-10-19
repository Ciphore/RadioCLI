import {EventEmitter} from 'node:events';
import {existsSync, readFileSync} from 'node:fs';
import {PassThrough} from 'node:stream';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {verifyLocalPlayback} from './setup-playback.js';

const {spawn} = vi.hoisted(() => ({spawn: vi.fn()}));
vi.mock('node:child_process', () => ({spawn}));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('local decoder rehearsal', () => {
  it('uses isolated WAV fixtures and backend-specific null/dummy outputs without changing the parent environment', async () => {
    const fixtures: string[] = [];
    const execute = vi.fn(async (command: string, args: string[], options: {env: NodeJS.ProcessEnv}) => {
      const fixture = args.at(-1)!;
      fixtures.push(fixture);
      expect(readFileSync(fixture).subarray(0, 4).toString()).toBe('RIFF');
      if (command.endsWith('mpv')) {
        expect(args).toContain('--no-config');
        expect(args).toContain('--ao=null');
        return {code: 0, output: 'RADIOCLI_DECODER_READY'};
      }
      if (command.endsWith('ffplay')) {
        expect(args).toContain('-autoexit');
        expect(options.env).toMatchObject({SDL_AUDIODRIVER: 'dummy', SDL_AUDIO_DRIVER: 'dummy'});
        return {code: 0, output: 'Audio: pcm_s16le, 44100 Hz'};
      }
      expect(args).toContain('--aout=dummy');
      expect(args).toContain('--ignore-config');
      return {code: 0, output: 'using audio output module "adummy"\nend of file'};
    });
    const env = {SDL_AUDIODRIVER: 'user-output'};
    const results = await verifyLocalPlayback(['mpv', 'ffplay', 'vlc', 'airplay', 'mpv'], {env, resolve: command => `/native tools/${command}`, execute});
    expect(results.map(item => item.status)).toEqual(['passed', 'passed', 'passed']);
    expect(results.every(item => item.physicalOutput === 'unverified')).toBe(true);
    expect(env.SDL_AUDIODRIVER).toBe('user-output');
    expect(fixtures.every(path => !existsSync(path))).toBe(true);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it.each([{code: 1, output: ''}, {code: 0, output: 'audio decoder error: failed'}, {code: null, output: '', failure: 'Timed out.'}])('does not confuse binary presence or clean process startup with working decoding: %j', async completed => {
    const [result] = await verifyLocalPlayback(['mpv'], {resolve: () => '/native/mpv', execute: async () => completed});
    expect(result?.status).toBe('failed');
  });

  it('keeps an unsupported evidence format and a foreign runtime explicitly unverified', async () => {
    expect((await verifyLocalPlayback(['vlc'], {resolve: () => '/native/vlc', execute: async () => ({code: 0, output: ''})}))[0]?.status).toBe('unverified');
    const foreign = process.platform === 'win32' ? 'linux' : 'win32';
    expect((await verifyLocalPlayback(['mpv'], {platform: foreign}))[0]?.status).toBe('unverified');
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each([
    {backend: 'mpv', output: '[osd/libass] Failed to load fontconfig fonts!\nRADIOCLI_DECODER_READY\nExiting... (End of file)'},
    {backend: 'vlc', output: '[native] main libvlc debug: configured with CFLAGS=-Werror=format-security\n[native] main audio output debug: using audio output module "adummy"\n[native] dbus interface error: Failed to connect to the D-Bus session daemon\n[native] main interface error: no suitable interface module\n[native] main libvlc error: interface "globalhotkeys,none" initialization failed\n[native] main input source debug: attachment of directory-extractor failed\n[native] main input debug: EOF reached'}
  ])('accepts completed $backend audio playback despite unavailable desktop services', async ({backend, output}) => {
    const [result] = await verifyLocalPlayback([backend], {resolve: () => `/native/${backend}`, execute: async () => ({code: 0, output})});
    expect(result).toMatchObject({status: 'passed', physicalOutput: 'unverified'});
  });

  it.each([
    {backend: 'mpv', output: 'RADIOCLI_DECODER_READY\n[ad/ffmpeg] Audio decoder error: failed'},
    {backend: 'ffplay', output: 'Audio: pcm_s16le, 44100 Hz\nSDL_OpenAudio: cannot open audio device'},
    {backend: 'vlc', output: 'using audio output module "adummy"\n[native] main decoder error: cannot decode audio\nEOF reached'}
  ])('rejects $backend audio failures even when startup evidence is present', async ({backend, output}) => {
    const [result] = await verifyLocalPlayback([backend], {resolve: () => `/native/${backend}`, execute: async () => ({code: 0, output})});
    expect(result?.status).toBe('failed');
  });

  it('forces termination after the playback deadline and cleans the fixture', async () => {
    let fixture = '';
    const child = Object.assign(new EventEmitter(), {stdout: new PassThrough(), stderr: new PassThrough(), unref: vi.fn(), kill: vi.fn((signal?: string) => {
      if (signal === 'SIGKILL') queueMicrotask(() => child.emit('close', null));
      return true;
    })});
    spawn.mockImplementation((_command, args) => { fixture = args.at(-1); return child; });
    const [result] = await verifyLocalPlayback(['mpv'], {resolve: () => '/native/mpv', timeoutMs: 250});
    expect(result).toMatchObject({status: 'failed', message: 'Local WAV playback exceeded its deadline.'});
    expect(child.kill.mock.calls).toEqual([[], ['SIGKILL']]);
    expect(existsSync(fixture)).toBe(false);
  });

  it('cancels the child and removes its fixture when the caller aborts', async () => {
    const controller = new AbortController();
    let fixture = '';
    const child = Object.assign(new EventEmitter(), {stdout: new PassThrough(), stderr: new PassThrough(), unref: vi.fn(), kill: vi.fn(() => {
      queueMicrotask(() => child.emit('close', null));
      return true;
    })});
    spawn.mockImplementation((_command, args) => { fixture = args.at(-1); queueMicrotask(() => controller.abort()); return child; });
    await expect(verifyLocalPlayback(['mpv'], {resolve: () => '/native/mpv', signal: controller.signal})).rejects.toMatchObject({name: 'AbortError'});
    expect(child.kill).toHaveBeenCalledOnce();
    expect(existsSync(fixture)).toBe(false);
  });
});
