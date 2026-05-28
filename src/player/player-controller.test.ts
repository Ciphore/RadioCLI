import {EventEmitter} from 'node:events';
import {spawn} from 'node:child_process';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {commandExists} from './command.js';
import {extractMpvTitle, PlayerController} from './player-controller.js';
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
    receiverStyle: 'spectrum',
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
