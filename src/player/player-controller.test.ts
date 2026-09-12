import {EventEmitter} from 'node:events';
import {spawn} from 'node:child_process';
import {existsSync, unlinkSync} from 'node:fs';
import {createServer, type Server} from 'node:net';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {commandExists} from '../platform/executables.js';
import {discoverAirPlayDevices} from './airplay-discovery.js';
import {extractMpvTitle, isPlaybackOutputError, PlayerController} from './player-controller.js';
import type {AirPlayDevice, AppSettings, Station} from '../types.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn()
}));

vi.mock('../platform/executables.js', () => ({
  commandExists: vi.fn(),
  resolveCommand: vi.fn()
}));

vi.mock('./airplay-discovery.js', () => ({
  discoverAirPlayDevices: vi.fn()
}));

const spawnMock = vi.mocked(spawn);
const commandExistsMock = vi.mocked(commandExists);
const discoverAirPlayDevicesMock = vi.mocked(discoverAirPlayDevices);

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('extractMpvTitle', () => {
  it('formats keyed radio metadata as artist and title values', () => {
    const title = extractMpvTitle({
      'icy-title': 'title="All The Stars",artist="Kendrick Lamar / SZA",url="song_spot=F" MediaBaseId="0" itunesTrackId="0"'
    });

    expect(title).toBe('Kendrick Lamar / SZA - All The Stars');
  });

  it('cleans doubled-quote keyed radio metadata before display', () => {
    const title = extractMpvTitle({
      'icy-title': 'title=""CALL OUT MY NAME",artist="THE WEEKND",url="" MediaBaseId="0"'
    });

    expect(title).toBe('THE WEEKND - CALL OUT MY NAME');
  });

  it('extracts artist prefixes and text fields from space-separated radio metadata', () => {
    const title = extractMpvTitle({
      'icy-title': 'Taylor Swift – text="Opalite" song_spot="M" MediaBaseId="3165854" itunesTrackId="0"'
    });

    expect(title).toBe('Taylor Swift - Opalite');
  });

  it('keeps ordinary stream titles unchanged', () => {
    expect(extractMpvTitle({'icy-title': 'Kendrick Lamar / SZA - All The Stars'})).toBe('Kendrick Lamar / SZA - All The Stars');
  });

  it('strips standard StreamTitle wrappers', () => {
    expect(extractMpvTitle({StreamTitle: "StreamTitle='Artist - Song';"})).toBe('Artist - Song');
  });
});

describe('PlayerController lifecycle', () => {
  it('throws before spawning when no playback backend is available', async () => {
    commandExistsMock.mockReturnValue(false);
    const controller = new PlayerController(() => settings());

    await expect(controller.play(station(), 'https://streams.example.com/live.mp3')).rejects.toThrow(
      'No playback backend found. Run radiocli setup to install mpv for playback'
    );
    expect(spawnMock).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({backend: 'none', state: 'stopped', ready: false});
  });

  it('explains when the preferred AirPlay backend is unavailable', async () => {
    commandExistsMock.mockImplementation(command => command === 'mpv');
    const controller = new PlayerController(
      () => settings({preferredBackend: 'airplay'}),
      {platform: 'darwin', arch: 'arm64', env: {}}
    );

    await expect(controller.play(station(), 'https://streams.example.com/live.mp3')).rejects.toThrow(
      'AirPlay is not ready on this install. Run radiocli doctor.'
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it.each(['win32', 'linux', 'freebsd', 'openbsd', 'netbsd', 'android', 'haiku', 'sunos', 'aix'] as const)(
    'explains that AirPlay is macOS-only on %s',
    async platform => {
      const controller = new PlayerController(
        () => settings({preferredBackend: 'airplay'}),
        {platform, arch: 'x64', env: {}}
      );

      await expect(controller.play(station(), 'https://streams.example.com/live.mp3')).rejects.toThrow(
        'AirPlay output is available only on macOS and is not supported on this operating system.'
      );
      expect(spawnMock).not.toHaveBeenCalled();
    }
  );

  it('does not use AirPlay as the automatic fallback backend', async () => {
    const controller = new PlayerController(() => settings({preferredBackend: 'auto'}));
    setDetectedBackends(controller, ['airplay']);

    await expect(controller.play(station(), 'https://streams.example.com/live.mp3')).rejects.toThrow(
      'No playback backend found. Run radiocli setup to install mpv for playback'
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('spawns ffplay, marks playback ready, reports limited controls, and stops cleanly', async () => {
    vi.useFakeTimers();
    commandExistsMock.mockImplementation(command => command === 'ffplay');
    const child = fakeChildProcess();
    spawnMock.mockReturnValue(child as never);
    const controller = new PlayerController(() => settings({preferredBackend: 'ffplay', volume: 35, tuneTimeoutSeconds: 3}));
    const states: string[] = [];
    const unsubscribe = controller.onChange(state => {
      states.push(state.state);
    });

    const playing = controller.play(station(), 'https://streams.example.com/live.mp3');
    await vi.advanceTimersByTimeAsync(500);
    await playing;

    expect(spawnMock).toHaveBeenCalledWith(
      'ffplay',
      ['-nodisp', '-hide_banner', '-loglevel', 'error', '-volume', '35', '-autoexit', 'https://streams.example.com/live.mp3'],
      {stdio: ['pipe', 'pipe', 'pipe']}
    );
    expect(controller.getState()).toMatchObject({
      backend: 'ffplay',
      state: 'playing',
      volume: 35,
      muted: false,
      stationName: 'Test FM',
      streamUrl: 'https://streams.example.com/live.mp3',
      ready: true
    });
    expect(states).toEqual(['idle', 'stopped', 'loading', 'playing']);

    await expect(controller.togglePause()).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining('ffplay fallback has limited controls')
    });
    expect(controller.getState().state).toBe('playing');

    await expect(controller.setVolume(50)).resolves.toMatchObject({ok: false});
    expect(controller.getState().volume).toBe(35);

    await expect(controller.toggleMute()).resolves.toMatchObject({ok: false});
    expect(controller.getState().muted).toBe(false);
    expect(child.stdin.write).not.toHaveBeenCalled();

    await controller.stop();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(controller.getState()).toMatchObject({backend: 'ffplay', state: 'stopped', ready: false});
    unsubscribe();
  });

  it('spawns VLC headless when it is the only available backend', async () => {
    vi.useFakeTimers();
    commandExistsMock.mockImplementation(command => command === 'cvlc' || command === 'vlc');
    const child = fakeChildProcess();
    spawnMock.mockReturnValue(child as never);
    const controller = new PlayerController(() => settings({preferredBackend: 'auto', volume: 80, tuneTimeoutSeconds: 3}));

    const playing = controller.play(station(), 'https://streams.example.com/live.mp3');
    await vi.advanceTimersByTimeAsync(500);
    await playing;

    expect(spawnMock).toHaveBeenCalledWith(
      'cvlc',
      ['--intf', 'dummy', '--no-video', '--quiet', '--play-and-exit', '--gain=0.80', 'https://streams.example.com/live.mp3'],
      {stdio: ['pipe', 'pipe', 'pipe']}
    );
    expect(controller.getState()).toMatchObject({backend: 'vlc', state: 'playing', ready: true});

    await expect(controller.togglePause()).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining('VLC fallback has limited controls')
    });

    await controller.stop();
    expect(controller.getState()).toMatchObject({backend: 'vlc', state: 'stopped', ready: false});
  });

  it('coalesces concurrent stop requests while a replacement station is selected', async () => {
    vi.useFakeTimers();
    commandExistsMock.mockImplementation(command => command === 'ffplay');
    const child = fakeChildProcess();
    spawnMock.mockReturnValue(child as never);
    const controller = new PlayerController(() => settings({preferredBackend: 'ffplay', tuneTimeoutSeconds: 3}));
    const playing = controller.play(station(), 'https://streams.example.com/live.mp3');
    await vi.advanceTimersByTimeAsync(500);
    await playing;

    const firstStop = controller.stop();
    const secondStop = controller.stop();
    await Promise.all([firstStop, secondStop]);

    expect(firstStop).toBe(secondStop);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({state: 'stopped', ready: false});
  });

  it('starts the AirPlay worker and forwards passcodes', async () => {
    commandExistsMock.mockImplementation(command => ['ffmpeg', 'dns-sd'].includes(command));
    discoverAirPlayDevicesMock.mockResolvedValue([airPlayDevice()]);
    const child = fakeChildProcess();
    spawnMock.mockReturnValue(child as never);
    const controller = new PlayerController(() => settings({preferredBackend: 'airplay', preferredAirPlayDevice: '5CAAFD0046D4@Office'}));
    setDetectedBackends(controller, ['airplay']);

    const playing = controller.play(station(), 'https://streams.example.com/live.mp3');
    await waitUntil(() => spawnMock.mock.calls.length === 1);
    child.stdout.emit('data', '{"type":"ready"}\n');
    await playing;

    expect(spawnMock.mock.calls[0]?.[0]).toBe(process.execPath);
    expect(spawnMock.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([expect.stringContaining('airplay-worker')]));
    expect(controller.getState()).toMatchObject({backend: 'airplay', state: 'playing', ready: true, airPlayDeviceName: 'Office'});

    expect(controller.submitAirPlayPasscode('1234')).toMatchObject({ok: true, message: 'AirPlay code sent.'});
    expect(child.stdin.write).toHaveBeenCalledWith('{"type":"passcode","code":"1234"}\n');
  });

  it('retunes an active AirPlay session without spawning a new worker', async () => {
    commandExistsMock.mockImplementation(command => ['ffmpeg', 'dns-sd'].includes(command));
    discoverAirPlayDevicesMock.mockResolvedValue([airPlayDevice()]);
    const child = fakeChildProcess();
    spawnMock.mockReturnValue(child as never);
    const controller = new PlayerController(() => settings({preferredBackend: 'airplay', preferredAirPlayDevice: '5CAAFD0046D4@Office'}));
    setDetectedBackends(controller, ['airplay']);

    const playing = controller.play(station(), 'https://streams.example.com/live.mp3');
    await waitUntil(() => spawnMock.mock.calls.length === 1);
    child.stdout.emit('data', '{"type":"ready"}\n');
    await playing;

    const retuned = controller.play(station({id: 'next-fm', name: 'Next FM'}), 'https://streams.example.com/next.mp3');

    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(discoverAirPlayDevicesMock).toHaveBeenCalledTimes(1);
    expect(child.stdin.write).toHaveBeenCalledWith('{"type":"retune","streamUrl":"https://streams.example.com/next.mp3","stationName":"Next FM"}\n');
    expect(controller.getState()).toMatchObject({
      backend: 'airplay',
      state: 'loading',
      ready: false,
      stationName: 'Next FM',
      streamUrl: 'https://streams.example.com/next.mp3',
      airPlayDeviceName: 'Office'
    });

    child.stdout.emit('data', '{"type":"playing"}\n');
    expect(controller.getState()).toMatchObject({
      backend: 'airplay',
      state: 'loading',
      ready: false,
      stationName: 'Next FM',
      streamUrl: 'https://streams.example.com/next.mp3',
      airPlayDeviceName: 'Office'
    });

    child.stdout.emit('data', '{"type":"retuned"}\n');
    await retuned;
    expect(controller.getState()).toMatchObject({
      backend: 'airplay',
      state: 'playing',
      ready: true,
      stationName: 'Next FM',
      streamUrl: 'https://streams.example.com/next.mp3',
      airPlayDeviceName: 'Office'
    });
  });

  it('reuses a successful AirPlay passcode for later sessions in memory', async () => {
    commandExistsMock.mockImplementation(command => ['ffmpeg', 'dns-sd'].includes(command));
    discoverAirPlayDevicesMock.mockResolvedValue([airPlayDevice()]);
    const firstChild = fakeChildProcess();
    const secondChild = fakeChildProcess();
    spawnMock.mockReturnValueOnce(firstChild as never).mockReturnValueOnce(secondChild as never);
    const controller = new PlayerController(() => settings({preferredBackend: 'airplay', preferredAirPlayDevice: '5CAAFD0046D4@Office'}));
    setDetectedBackends(controller, ['airplay']);

    const firstPlay = controller.play(station(), 'https://streams.example.com/live.mp3');
    await waitUntil(() => spawnMock.mock.calls.length === 1);
    firstChild.stdout.emit('data', '{"type":"password-required"}\n');
    await firstPlay;
    expect(controller.submitAirPlayPasscode('1234')).toMatchObject({ok: true});
    firstChild.stdout.emit('data', '{"type":"ready"}\n');
    await waitUntil(() => controller.getState().state === 'playing');
    await controller.stop();

    const secondPlay = controller.play(station(), 'https://streams.example.com/live.mp3');
    await waitUntil(() => spawnMock.mock.calls.length === 2);
    secondChild.stdout.emit('data', '{"type":"password-required"}\n');

    expect(secondChild.stdin.write).toHaveBeenCalledWith('{"type":"passcode","code":"1234"}\n');
    expect(controller.getState()).toMatchObject({backend: 'airplay', state: 'loading', message: 'AirPlay code sent.'});

    secondChild.stdout.emit('data', '{"type":"ready"}\n');
    await secondPlay;
    expect(controller.getState()).toMatchObject({backend: 'airplay', state: 'playing', ready: true});
  });

  it('reports when an AirPlay passcode is submitted without active AirPlay playback', () => {
    const controller = new PlayerController(() => settings());

    expect(controller.submitAirPlayPasscode('1234')).toMatchObject({
      ok: false,
      message: 'No active AirPlay playback is waiting for a code.'
    });
  });

  it('requires an explicit AirPlay receiver before spawning the worker', async () => {
    commandExistsMock.mockImplementation(command => ['ffmpeg', 'dns-sd'].includes(command));
    discoverAirPlayDevicesMock.mockResolvedValue([airPlayDevice()]);
    const controller = new PlayerController(() => settings({preferredBackend: 'airplay'}));
    setDetectedBackends(controller, ['airplay']);

    await controller.play(station(), 'https://streams.example.com/live.mp3').then(
      () => {
        throw new Error('Expected AirPlay receiver selection to fail.');
      },
      error => {
        expect(isPlaybackOutputError(error)).toBe(true);
        expect(error).toMatchObject({message: 'Choose an AirPlay receiver in Settings before tuning with AirPlay.'});
      }
    );
    expect(spawnMock).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({backend: 'airplay', state: 'error', ready: false});
  });

  it('fails clearly when the saved AirPlay receiver is not visible', async () => {
    commandExistsMock.mockImplementation(command => ['ffmpeg', 'dns-sd'].includes(command));
    discoverAirPlayDevicesMock.mockResolvedValue([airPlayDevice()]);
    const controller = new PlayerController(() => settings({preferredBackend: 'airplay', preferredAirPlayDevice: 'missing'}));
    setDetectedBackends(controller, ['airplay']);

    await controller.play(station(), 'https://streams.example.com/live.mp3').then(
      () => {
        throw new Error('Expected missing AirPlay receiver to fail.');
      },
      error => {
        expect(isPlaybackOutputError(error)).toBe(true);
        expect(error).toMatchObject({message: 'Selected AirPlay receiver was not found. Refresh AirPlay receivers in Settings.'});
      }
    );
    expect(spawnMock).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({backend: 'airplay', state: 'error', ready: false});
  });

  it('does not try to AirPlay to the same Mac', async () => {
    commandExistsMock.mockImplementation(command => ['ffmpeg', 'dns-sd'].includes(command));
    discoverAirPlayDevicesMock.mockResolvedValue([airPlayDevice({local: true, name: 'Neal’s MacBook Pro'})]);
    const controller = new PlayerController(() => settings({preferredBackend: 'airplay', preferredAirPlayDevice: '5CAAFD0046D4@Office'}));
    setDetectedBackends(controller, ['airplay']);

    await expect(controller.play(station(), 'https://streams.example.com/live.mp3')).rejects.toThrow(
      'Neal’s MacBook Pro is this Mac. Use Audio output: This device instead of AirPlay.'
    );
    expect(spawnMock).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({backend: 'airplay', state: 'error', ready: false});
  });

  it('does not pretend AirPlay playback can pause', async () => {
    commandExistsMock.mockImplementation(command => ['ffmpeg', 'dns-sd'].includes(command));
    discoverAirPlayDevicesMock.mockResolvedValue([airPlayDevice()]);
    const child = fakeChildProcess();
    spawnMock.mockReturnValue(child as never);
    const controller = new PlayerController(() => settings({preferredBackend: 'airplay', preferredAirPlayDevice: '5CAAFD0046D4@Office'}));
    setDetectedBackends(controller, ['airplay']);

    const playing = controller.play(station(), 'https://streams.example.com/live.mp3');
    await waitUntil(() => spawnMock.mock.calls.length === 1);
    child.stdout.emit('data', '{"type":"ready"}\n');
    await playing;

    await expect(controller.togglePause()).resolves.toMatchObject({
      ok: false,
      message: 'AirPlay pause is not supported. Use :stop to end playback.'
    });

    expect(child.stdin.write).not.toHaveBeenCalledWith('p');
    expect(controller.getState()).toMatchObject({
      backend: 'airplay',
      state: 'playing',
      ready: true,
      message: 'AirPlay pause is not supported. Use :stop to end playback.'
    });
  });

  it('kills the AirPlay worker if startup times out', async () => {
    commandExistsMock.mockImplementation(command => ['ffmpeg', 'dns-sd'].includes(command));
    discoverAirPlayDevicesMock.mockResolvedValue([airPlayDevice()]);
    const child = fakeChildProcess();
    spawnMock.mockReturnValue(child as never);
    const controller = new PlayerController(() => settings({preferredBackend: 'airplay', preferredAirPlayDevice: '5CAAFD0046D4@Office', tuneTimeoutSeconds: 0.01}));
    setDetectedBackends(controller, ['airplay']);

    const playing = controller.play(station(), 'https://streams.example.com/live.mp3');

    await expect(playing).rejects.toThrow('Timed out while opening AirPlay stream');
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(child.stdin.write).toHaveBeenCalledWith('{"type":"stop"}\n');
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(controller.getState()).toMatchObject({backend: 'airplay', state: 'error', ready: false});
  });

  it('reconciles mpv pause toggles against the backend state', async () => {
    commandExistsMock.mockImplementation(command => command === 'mpv');
    const child = fakeChildProcess();
    const mpv = {current: null as FakeMpvIpc | null};
    spawnMock.mockImplementation((_command, args) => {
      const ipcPath = mpvIpcPath(args);
      mpv.current = fakeMpvIpc(ipcPath);
      return child as never;
    });
    const controller = new PlayerController(() => settings({preferredBackend: 'mpv'}));

    await controller.play(station(), 'https://streams.example.com/live.mp3');
    const mpvServer = expectFakeMpv(mpv.current);
    expect(controller.getState().state).toBe('playing');

    mpvServer.setPaused(true);
    expect(controller.getState().state).toBe('playing');

    await controller.togglePause();

    expect(mpvServer.paused()).toBe(false);
    expect(controller.getState().state).toBe('playing');

    await controller.stop();
    await mpvServer.close();
  });

  it('reloads a paused radio stream so resume returns to the live edge', async () => {
    commandExistsMock.mockImplementation(command => command === 'mpv');
    const child = fakeChildProcess();
    const mpv = {current: null as FakeMpvIpc | null};
    spawnMock.mockImplementation((_command, args) => {
      mpv.current = fakeMpvIpc(mpvIpcPath(args));
      return child as never;
    });
    const controller = new PlayerController(() => settings({preferredBackend: 'mpv'}));
    const url = 'https://streams.example.com/live.mp3';

    await controller.play(station(), url);
    const mpvServer = expectFakeMpv(mpv.current);
    await expect(controller.pause()).resolves.toMatchObject({ok: true});
    expect(controller.getState().state).toBe('paused');
    expect(mpvServer.paused()).toBe(true);

    await expect(controller.resume()).resolves.toMatchObject({
      ok: true,
      message: 'Reconnected at the live broadcast.'
    });
    expect(mpvServer.loadedUrls()).toEqual([url]);
    expect(mpvServer.paused()).toBe(false);
    expect(controller.getState()).toMatchObject({state: 'playing', ready: true, streamUrl: url});

    await controller.stop();
    await mpvServer.close();
  });

  it('updates volume immediately and coalesces rapid mpv changes on one IPC connection', async () => {
    commandExistsMock.mockImplementation(command => command === 'mpv');
    const child = fakeChildProcess();
    const mpv = {current: null as FakeMpvIpc | null};
    spawnMock.mockImplementation((_command, args) => {
      const ipcPath = mpvIpcPath(args);
      mpv.current = fakeMpvIpc(ipcPath, {volumeResponseDelayMs: 40});
      return child as never;
    });
    const controller = new PlayerController(() => settings({preferredBackend: 'mpv', volume: 70}));

    await controller.play(station(), 'https://streams.example.com/live.mp3');
    const mpvServer = expectFakeMpv(mpv.current);
    const first = controller.adjustVolume(5);
    const second = controller.adjustVolume(5);
    const third = controller.adjustVolume(5);

    expect(controller.getState().volume).toBe(85);
    await expect(Promise.all([first, second, third])).resolves.toEqual([
      {ok: true},
      {ok: true},
      {ok: true}
    ]);
    expect(mpvServer.volume()).toBe(85);
    expect(mpvServer.volumeCommands()).toEqual([75, 85]);
    expect(mpvServer.connectionCount()).toBe(1);

    await controller.stop();
    await mpvServer.close();
  });

  it('rolls back an optimistic mpv volume change when the backend rejects it', async () => {
    commandExistsMock.mockImplementation(command => command === 'mpv');
    const child = fakeChildProcess();
    const mpv = {current: null as FakeMpvIpc | null};
    spawnMock.mockImplementation((_command, args) => {
      const ipcPath = mpvIpcPath(args);
      mpv.current = fakeMpvIpc(ipcPath, {volumeError: 'property unavailable'});
      return child as never;
    });
    const controller = new PlayerController(() => settings({preferredBackend: 'mpv', volume: 70}));

    await controller.play(station(), 'https://streams.example.com/live.mp3');
    const mpvServer = expectFakeMpv(mpv.current);
    const changing = controller.adjustVolume(5);

    expect(controller.getState().volume).toBe(75);
    await expect(changing).resolves.toEqual({ok: false, message: 'mpv did not acknowledge the volume change.'});
    expect(controller.getState().volume).toBe(70);
    expect(mpvServer.volume()).toBe(70);

    await controller.stop();
    await mpvServer.close();
  });

  it('keeps mpv in loading until audio playback has started', async () => {
    commandExistsMock.mockImplementation(command => command === 'mpv');
    const child = fakeChildProcess();
    const mpv = {current: null as FakeMpvIpc | null};
    spawnMock.mockImplementation((_command, args) => {
      const ipcPath = mpvIpcPath(args);
      mpv.current = fakeMpvIpc(ipcPath, {audioStarted: false});
      return child as never;
    });
    const controller = new PlayerController(() => settings({preferredBackend: 'mpv', tuneTimeoutSeconds: 3}));

    const playing = controller.play(station(), 'https://streams.example.com/live.mp3');
    await waitUntil(() => mpv.current !== null);
    const mpvServer = expectFakeMpv(mpv.current);
    await waitUntil(() => controller.getState().state === 'loading');
    expect(controller.getState()).toMatchObject({backend: 'mpv', state: 'loading', ready: false});

    mpvServer.setAudioStarted(true);
    await playing;

    expect(controller.getState()).toMatchObject({backend: 'mpv', state: 'playing', ready: true});

    await controller.stop();
    await mpvServer.close();
  });

  it('recovers an ARM Linux mpv audio initialization failure by trying ALSA first', async () => {
    commandExistsMock.mockImplementation(command => command === 'mpv');
    const failedChild = fakeChildProcess();
    const recoveredChild = fakeChildProcess();
    const mpv = {current: null as FakeMpvIpc | null};
    spawnMock
      .mockReturnValueOnce(failedChild as never)
      .mockImplementationOnce((_command, args) => {
        mpv.current = fakeMpvIpc(mpvIpcPath(args));
        return recoveredChild as never;
      });
    const controller = new PlayerController(
      () => settings({preferredBackend: 'mpv'}),
      {platform: 'linux', arch: 'arm64', env: {}}
    );

    const playing = controller.play(station(), 'https://streams.example.com/live.mp3');
    await waitUntil(() => spawnMock.mock.calls.length === 1);
    // mpv writes ordinary log output, including audio failures, to stdout.
    failedChild.stdout.emit('data', '[ao] Failed to initialize audio driver pipewire\nCould not open/initialize audio device -> no sound.\n');
    failedChild.emit('exit', 2, null);
    await playing;

    expect(spawnMock).toHaveBeenCalledTimes(2);
    expect(spawnMock.mock.calls[0]?.[1]).not.toContain('--ao=alsa,');
    expect(spawnMock.mock.calls[1]?.[1]).toContain('--ao=alsa,');
    expect(controller.getState()).toMatchObject({backend: 'mpv', state: 'playing', ready: true});

    await controller.stop();
    await expectFakeMpv(mpv.current).close();
  });

  it.each([
    ['macOS', {platform: 'darwin' as const, arch: 'arm64', env: {}}],
    ['Windows', {platform: 'win32' as const, arch: 'arm64', env: {}}],
    ['Linux x64', {platform: 'linux' as const, arch: 'x64', env: {}}],
    ['explicit ARM Linux output', {platform: 'linux' as const, arch: 'arm64', env: {RADIOCLI_MPV_AUDIO_OUTPUT: 'pipewire'}}]
  ])('does not override mpv audio selection on %s', async (_label, runtime) => {
    commandExistsMock.mockImplementation(command => command === 'mpv');
    const child = fakeChildProcess();
    spawnMock.mockReturnValue(child as never);
    const controller = new PlayerController(() => settings({preferredBackend: 'mpv'}), runtime);

    const playing = controller.play(station(), 'https://streams.example.com/live.mp3');
    await waitUntil(() => spawnMock.mock.calls.length === 1);
    child.stderr.emit('data', '[ao] Failed to initialize audio driver pipewire\nCould not open/initialize audio device -> no sound.\n');
    child.emit('exit', 2, null);

    await expect(playing).rejects.toMatchObject({
      name: 'PlaybackOutputError',
      message: expect.stringContaining('Could not open/initialize audio device')
    });
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('does not let a superseded readiness deadline stop the replacement mpv session', async () => {
    commandExistsMock.mockImplementation(command => command === 'mpv');
    const children = [fakeChildProcess(), fakeChildProcess()];
    const servers: FakeMpvIpc[] = [];
    spawnMock.mockImplementation((_command, args) => {
      const server = fakeMpvIpc(mpvIpcPath(args), {audioStarted: servers.length > 0});
      servers.push(server);
      return children[servers.length - 1] as never;
    });
    const controller = new PlayerController(() => settings({preferredBackend: 'mpv', tuneTimeoutSeconds: 1}));

    const obsolete = controller.play(station({name: 'Old'}), 'https://streams.example.com/old.mp3').then(() => null, error => error as Error);
    await waitUntil(() => servers.length === 1);
    const replacement = controller.play(station({name: 'New'}), 'https://streams.example.com/new.mp3');
    await waitUntil(() => children[0]!.kill.mock.calls.length > 0);
    children[0]!.emit('exit', 0, null);
    await replacement;
    expect((await obsolete)?.message).toMatch(/superseded|exited/i);
    await new Promise(resolve => setTimeout(resolve, 1100));

    expect(children[1]!.kill).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({state: 'playing', stationName: 'New', ready: true});
    const stopping = controller.stop();
    await waitUntil(() => children[1]!.kill.mock.calls.length > 0);
    children[1]!.emit('exit', 0, null);
    await stopping;
    await Promise.all(servers.map(server => server.close()));
  });

  it('sends an explicit unmute to mpv even when local startup state is already unmuted', async () => {
    commandExistsMock.mockImplementation(command => command === 'mpv');
    const child = fakeChildProcess();
    let mpv: FakeMpvIpc | null = null;
    spawnMock.mockImplementation((_command, args) => {
      mpv = fakeMpvIpc(mpvIpcPath(args), {muted: true});
      return child as never;
    });
    const controller = new PlayerController(() => settings({preferredBackend: 'mpv'}));

    await controller.play(station(), 'https://streams.example.com/live.mp3');
    const server = expectFakeMpv(mpv);
    expect(controller.getState().muted).toBe(false);
    expect(server.muted()).toBe(true);
    await expect(controller.setMuted(false)).resolves.toEqual({ok: true});
    expect(server.muted()).toBe(false);

    await controller.stop();
    await server.close();
  });

  it('keeps a station-specific mpv failure eligible for auto-skip without exposing its URL', async () => {
    commandExistsMock.mockImplementation(command => command === 'mpv');
    const child = fakeChildProcess();
    spawnMock.mockReturnValue(child as never);
    const controller = new PlayerController(
      () => settings({preferredBackend: 'mpv'}),
      {platform: 'linux', arch: 'arm64', env: {}}
    );

    const playing = controller.play(station(), 'https://streams.example.com/live.mp3');
    await waitUntil(() => spawnMock.mock.calls.length === 1);
    child.stderr.emit('data', 'Failed to open https://listener:secret@streams.example.com/private?token=secret\n');
    child.emit('exit', 2, null);
    const error = await playing.then(() => null, (reason: unknown) => reason);

    expect(error).toBeInstanceOf(Error);
    expect(isPlaybackOutputError(error)).toBe(false);
    expect((error as Error).message).toContain('[stream URL]');
    expect((error as Error).message).not.toContain('secret');
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it('reports an OS-level player launch failure immediately as a non-skippable output error', async () => {
    commandExistsMock.mockImplementation(command => command === 'mpv');
    const child = fakeChildProcess();
    spawnMock.mockReturnValue(child as never);
    const controller = new PlayerController(() => settings({preferredBackend: 'mpv', tuneTimeoutSeconds: 30}));

    const playing = controller.play(station(), 'https://streams.example.com/live.mp3');
    await waitUntil(() => spawnMock.mock.calls.length === 1);
    child.emit('error', new Error('spawn mpv EACCES'));

    await expect(playing).rejects.toMatchObject({
      name: 'PlaybackOutputError',
      message: expect.stringContaining('spawn mpv EACCES')
    });
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({backend: 'mpv', state: 'error', ready: false});
  });

  it('syncs external mpv pause changes from macOS media controls', async () => {
    commandExistsMock.mockImplementation(command => command === 'mpv');
    const child = fakeChildProcess();
    const mpv = {current: null as FakeMpvIpc | null};
    spawnMock.mockImplementation((_command, args) => {
      const ipcPath = mpvIpcPath(args);
      mpv.current = fakeMpvIpc(ipcPath);
      return child as never;
    });
    const controller = new PlayerController(() => settings({preferredBackend: 'mpv'}));

    await controller.play(station(), 'https://streams.example.com/live.mp3');
    const mpvServer = expectFakeMpv(mpv.current);
    expect(controller.getState().state).toBe('playing');

    mpvServer.setPaused(true);
    await waitUntil(() => controller.getState().state === 'paused');
    expect(controller.getState()).toMatchObject({state: 'paused', ready: true});

    mpvServer.setPaused(false);
    await waitUntil(() => controller.getState().state === 'playing');
    expect(controller.getState()).toMatchObject({state: 'playing', ready: true});
    expect(mpvServer.loadedUrls()).toEqual(['https://streams.example.com/live.mp3']);

    await controller.stop();
    await mpvServer.close();
  });

  it('moves to an error state when the active player exits nonzero', async () => {
    vi.useFakeTimers();
    commandExistsMock.mockImplementation(command => command === 'ffplay');
    const child = fakeChildProcess();
    spawnMock.mockReturnValue(child as never);
    const controller = new PlayerController(() => settings({preferredBackend: 'ffplay'}));

    const playing = controller.play(station(), 'https://streams.example.com/live.mp3');
    await vi.advanceTimersByTimeAsync(500);
    await playing;
    child.emit('exit', 7);

    expect(controller.getState()).toMatchObject({
      backend: 'ffplay',
      state: 'error',
      message: 'player exited with code 7',
      ready: false
    });
  });
});

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    theme: 'green',
    receiverStyle: 'pulse-grid',
    receiverStyleVersion: 2,
    volume: 70,
    enableRadioGarden: false,
    enableNearbyLocation: false,
    shareDirectoryVotes: true,
    preferredBackend: 'auto',
    tuneTimeoutSeconds: 12,
    skipBrokenStreams: true,
    mediaKeys: {previous: [], playPause: [], next: []},
    ...overrides
  };
}

type FakeMpvIpc = {
  close: () => Promise<void>;
  connectionCount: () => number;
  paused: () => boolean;
  setPaused: (paused: boolean) => void;
  setAudioStarted: (started: boolean) => void;
  loadedUrls: () => string[];
  volume: () => number;
  muted: () => boolean;
  volumeCommands: () => number[];
};

function expectFakeMpv(mpv: FakeMpvIpc | null): FakeMpvIpc {
  if (!mpv) {
    throw new Error('Fake mpv IPC server was not created.');
  }

  return mpv;
}

function station(overrides: Partial<Station> = {}): Station {
  return {
    id: 'test-fm',
    provider: 'radio-browser',
    name: 'Test FM',
    tags: ['test'],
    ...overrides
  };
}

function airPlayDevice(overrides: Partial<AirPlayDevice> = {}): AirPlayDevice {
  return {
    id: '5CAAFD0046D4@Office',
    name: 'Office',
    host: 'Sonos-5CAAFD0046D4.local',
    port: 7000,
    txt: ['cn=0,1', 'sf=0x4'],
    requiresPassword: false,
    airplay2: true,
    ...overrides
  };
}

function setDetectedBackends(controller: PlayerController, backends: string[]): void {
  (controller as unknown as {availableBackends: string[]}).availableBackends = backends;
}

function fakeChildProcess(): EventEmitter & {
  stdin: {write: ReturnType<typeof vi.fn>};
  stdout: EventEmitter;
  stderr: EventEmitter;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
} {
  const child = new EventEmitter() as EventEmitter & {
    stdin: {write: ReturnType<typeof vi.fn>};
    stdout: EventEmitter;
    stderr: EventEmitter;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdin = {write: vi.fn()};
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = vi.fn(() => {
    child.killed = true;
    return true;
  });
  return child;
}

function mpvIpcPath(args: unknown): string {
  if (!Array.isArray(args)) {
    throw new Error('mpv spawn args missing');
  }

  const ipcArg = args.find(arg => typeof arg === 'string' && arg.startsWith('--input-ipc-server='));
  if (typeof ipcArg !== 'string') {
    throw new Error('mpv IPC arg missing');
  }

  return ipcArg.slice('--input-ipc-server='.length);
}

function fakeMpvIpc(
  path: string,
  options: {audioStarted?: boolean; volumeError?: string; volumeResponseDelayMs?: number; muted?: boolean} = {}
): FakeMpvIpc {
  if (existsSync(path)) {
    unlinkSync(path);
  }

  let paused = false;
  let audioStarted = options.audioStarted ?? true;
  let volume = 70;
  let muted = options.muted ?? false;
  let connectionCount = 0;
  const volumeCommands: number[] = [];
  const loadedUrls: string[] = [];
  const server = createServer(socket => {
    connectionCount += 1;
    let buffer = '';
    socket.on('error', () => undefined);
    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf('\n');
        if (!line.trim()) {
          continue;
        }

        const request = JSON.parse(line) as {request_id?: number; command?: unknown[]};
        const command = request.command ?? [];
        let data: unknown = null;
        let error = 'success';
        let responseDelayMs = 0;
        if (command[0] === 'get_property' && command[1] === 'path') {
          data = 'https://streams.example.com/live.mp3';
        } else if (command[0] === 'get_property' && command[1] === 'pause') {
          data = paused;
        } else if (command[0] === 'get_property' && command[1] === 'metadata') {
          data = {};
        } else if (command[0] === 'get_property' && command[1] === 'time-pos') {
          data = audioStarted ? 12 : null;
        } else if (command[0] === 'get_property' && command[1] === 'audio-pts') {
          data = audioStarted ? 12 : null;
        } else if (command[0] === 'cycle' && command[1] === 'pause') {
          paused = !paused;
        } else if (command[0] === 'loadfile' && typeof command[1] === 'string') {
          loadedUrls.push(command[1]);
        } else if (command[0] === 'set_property' && command[1] === 'pause') {
          paused = Boolean(command[2]);
        } else if (command[0] === 'set_property' && command[1] === 'volume') {
          const nextVolume = Number(command[2]);
          volumeCommands.push(nextVolume);
          responseDelayMs = options.volumeResponseDelayMs ?? 0;
          if (options.volumeError) {
            error = options.volumeError;
          } else {
            volume = nextVolume;
          }
        } else if (command[0] === 'set_property' && command[1] === 'mute') {
          muted = Boolean(command[2]);
        }

        const respond = (): void => {
          if (!socket.destroyed) {
            socket.write(`${JSON.stringify({request_id: request.request_id, error, data})}\n`, () => undefined);
          }
        };
        if (responseDelayMs > 0) {
          setTimeout(respond, responseDelayMs);
        } else {
          respond();
        }
      }
    });
  });
  server.listen(path);

  return {
    close: () => closeServer(server, path),
    connectionCount: () => connectionCount,
    paused: () => paused,
    setPaused: next => {
      paused = next;
    },
    setAudioStarted: next => {
      audioStarted = next;
    },
    loadedUrls: () => [...loadedUrls],
    volume: () => volume,
    muted: () => muted,
    volumeCommands: () => [...volumeCommands]
  };
}

function closeServer(server: Server, path: string): Promise<void> {
  return new Promise(resolve => {
    server.close(() => {
      if (existsSync(path)) {
        unlinkSync(path);
      }

      resolve();
    });
  });
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 1800) {
    if (predicate()) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, 25));
  }

  throw new Error('Timed out waiting for condition.');
}
