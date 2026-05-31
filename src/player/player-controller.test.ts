import {EventEmitter} from 'node:events';
import {spawn} from 'node:child_process';
import {existsSync, unlinkSync} from 'node:fs';
import {createServer, type Server} from 'node:net';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {commandExists} from './command.js';
import {discoverAirPlayDevices} from './airplay-discovery.js';
import {createMpvIpcPath, extractMpvTitle, isPlaybackOutputError, PlayerController} from './player-controller.js';
import type {AirPlayDevice, AppSettings, Station} from '../types.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn()
}));

vi.mock('./command.js', () => ({
  commandExists: vi.fn()
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

describe('createMpvIpcPath', () => {
  it('uses a Unix socket path on POSIX platforms', () => {
    expect(createMpvIpcPath('linux', 123, 456)).toMatch(/radiocli-123-456\.sock$/);
  });

  it('uses a Windows named pipe path on native Windows', () => {
    expect(createMpvIpcPath('win32', 123, 456)).toBe('\\\\.\\pipe\\radiocli-123-456');
  });
});

describe('PlayerController lifecycle', () => {
  it('throws before spawning when no playback backend is available', async () => {
    commandExistsMock.mockReturnValue(false);
    const controller = new PlayerController(() => settings());

    await expect(controller.play(station(), 'https://streams.example.com/live.mp3')).rejects.toThrow(
      'No playback backend found. Install mpv for playback'
    );
    expect(spawnMock).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({backend: 'none', state: 'stopped', ready: false});
  });

  it('explains when the preferred AirPlay backend is unavailable', async () => {
    commandExistsMock.mockImplementation(command => command === 'mpv');
    const controller = new PlayerController(() => settings({preferredBackend: 'airplay'}));

    await expect(controller.play(station(), 'https://streams.example.com/live.mp3')).rejects.toThrow(
      'AirPlay is not ready on this install. Run radiocli doctor.'
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('does not use AirPlay as the automatic fallback backend', async () => {
    const controller = new PlayerController(() => settings({preferredBackend: 'auto'}));
    setDetectedBackends(controller, ['airplay']);

    await expect(controller.play(station(), 'https://streams.example.com/live.mp3')).rejects.toThrow(
      'No playback backend found. Install mpv for playback'
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
    preferredBackend: 'auto',
    tuneTimeoutSeconds: 12,
    skipBrokenStreams: true,
    mediaKeys: {previous: [], playPause: [], next: []},
    ...overrides
  };
}

type FakeMpvIpc = {
  close: () => Promise<void>;
  paused: () => boolean;
  setPaused: (paused: boolean) => void;
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

function fakeMpvIpc(path: string): FakeMpvIpc {
  if (existsSync(path)) {
    unlinkSync(path);
  }

  let paused = false;
  const server = createServer(socket => {
    let buffer = '';
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
        if (command[0] === 'get_property' && command[1] === 'path') {
          data = 'https://streams.example.com/live.mp3';
        } else if (command[0] === 'get_property' && command[1] === 'pause') {
          data = paused;
        } else if (command[0] === 'get_property' && command[1] === 'metadata') {
          data = {};
        } else if (command[0] === 'get_property' && command[1] === 'time-pos') {
          data = 12;
        } else if (command[0] === 'cycle' && command[1] === 'pause') {
          paused = !paused;
        }

        socket.write(`${JSON.stringify({request_id: request.request_id, error: 'success', data})}\n`);
      }
    });
  });
  server.listen(path);

  return {
    close: () => closeServer(server, path),
    paused: () => paused,
    setPaused: next => {
      paused = next;
    }
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
