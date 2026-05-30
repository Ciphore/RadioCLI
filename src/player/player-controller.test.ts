import {EventEmitter} from 'node:events';
import {spawn} from 'node:child_process';
import {existsSync, unlinkSync} from 'node:fs';
import {createServer, type Server} from 'node:net';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {commandExists} from './command.js';
import {createMpvIpcPath, extractMpvTitle, PlayerController} from './player-controller.js';
import type {AppSettings, Station} from '../types.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn()
}));

vi.mock('./command.js', () => ({
  commandExists: vi.fn()
}));

const spawnMock = vi.mocked(spawn);
const commandExistsMock = vi.mocked(commandExists);

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

  it('spawns ffplay, marks playback ready, forwards controls, and stops cleanly', async () => {
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

    await controller.togglePause();
    expect(child.stdin.write).toHaveBeenCalledWith('p');
    expect(controller.getState().state).toBe('paused');

    await controller.setVolume(50);
    expect(child.stdin.write).toHaveBeenCalledWith('0');
    expect(controller.getState().volume).toBe(50);

    await controller.toggleMute();
    expect(child.stdin.write).toHaveBeenCalledWith('m');
    expect(controller.getState().muted).toBe(true);

    await controller.stop();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(controller.getState()).toMatchObject({backend: 'ffplay', state: 'stopped', ready: false});
    unsubscribe();
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

function fakeChildProcess(): EventEmitter & {
  stdin: {write: ReturnType<typeof vi.fn>};
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
} {
  const child = new EventEmitter() as EventEmitter & {
    stdin: {write: ReturnType<typeof vi.fn>};
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdin = {write: vi.fn()};
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
