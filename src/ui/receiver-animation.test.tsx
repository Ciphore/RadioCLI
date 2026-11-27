import React, {act} from 'react';
import {Box, Text} from 'ink';
import {cleanup, render} from 'ink-testing-library';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {ListeningSession, PlaybackState, ReceiverStyle, Screen, Station} from '../types.js';
import {ReceiverAnimationProvider, useReceiverPulse} from './receiver-animation.js';
import {DisplayContext, resolveDisplayMode} from './display-context.js';
import {useReceiverFrame} from './receiver-frame.js';

const playing: PlaybackState = {
  backend: 'mpv',
  state: 'playing',
  volume: 70,
  muted: false,
  ready: true
};

function Pulse(): React.ReactElement {
  return <Text>{useReceiverPulse()}</Text>;
}

function renderReceiver(element: React.ReactElement): ReturnType<typeof render> {
  let view!: ReturnType<typeof render>;
  act(() => { view = render(element); });
  return view;
}

describe('ReceiverAnimationProvider', () => {
  beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
  afterEach(() => {
    act(() => cleanup());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('updates only pulse consumers instead of rerendering static application siblings', async () => {
    vi.useFakeTimers();
    let staticRenders = 0;
    let receiverRenders = 0;

    function StaticChrome(): React.ReactElement {
      staticRenders += 1;
      return <Text>chrome</Text>;
    }

    function Receiver(): React.ReactElement {
      receiverRenders += 1;
      return <Text>{useReceiverPulse()}</Text>;
    }

    const view = renderReceiver(
      <ReceiverAnimationProvider
        screen="now-playing"
        playback={playing}
        receiverStyle="pulse-grid"
        reduceMotion={false}
      >
        <Box><StaticChrome /><Receiver /></Box>
      </ReceiverAnimationProvider>
    );

    expect(staticRenders).toBe(1);
    expect(receiverRenders).toBe(1);
    // Flush React's scheduled work before inspecting the committed Ink frame.
    await act(async () => { await vi.advanceTimersByTimeAsync(240); });
    expect(staticRenders).toBe(1);
    expect(receiverRenders).toBeGreaterThan(1);
    expect(view.lastFrame()).toContain('3');
    act(() => view.unmount());
  });

  it('keeps the heartbeat clock advancing and resumes the current phase after a pause or tab switch', async () => {
    vi.useFakeTimers();
    const receiver = (screen: Screen, playback = playing) => (
      <ReceiverAnimationProvider screen={screen} playback={playback} receiverStyle="heartbeat" reduceMotion={false}>
        <Pulse />
      </ReceiverAnimationProvider>
    );
    const advance = async (ms: number): Promise<void> => {
      await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
    };
    const view = renderReceiver(receiver('now-playing'));
    try {
      await advance(20_000);
      expect(view.lastFrame()).toBe('250');
      act(() => view.rerender(receiver('home')));
      await advance(2_000);
      act(() => view.rerender(receiver('now-playing')));
      expect(view.lastFrame()).toBe('250');
      await advance(80);
      expect(view.lastFrame()).toBe('251');
      act(() => view.rerender(receiver('now-playing', {...playing, state: 'paused'})));
      await advance(2_000);
      expect(view.lastFrame()).toBe('251');
      act(() => view.rerender(receiver('now-playing')));
      await advance(80);
      expect(view.lastFrame()).toBe('252');
    } finally {
      act(() => view.unmount());
    }
  });

  it('preserves Ultra Code’s phase reset when Now Playing is reopened', async () => {
    vi.useFakeTimers();
    const receiver = (screen: Screen) => (
      <ReceiverAnimationProvider screen={screen} playback={playing} receiverStyle="ultracode" reduceMotion={false}>
        <Pulse />
      </ReceiverAnimationProvider>
    );
    const view = renderReceiver(receiver('now-playing'));
    try {
      await act(async () => { await vi.advanceTimersByTimeAsync(400); });
      expect(view.lastFrame()).toBe('5');
      act(() => view.rerender(receiver('home')));
      act(() => view.rerender(receiver('now-playing')));
      expect(view.lastFrame()).toBe('0');
    } finally {
      act(() => view.unmount());
    }
  });

  it('does not animate when reduce motion is enabled', async () => {
    vi.useFakeTimers();
    const view = renderReceiver(
      <ReceiverAnimationProvider
        screen="now-playing"
        playback={playing}
        receiverStyle="pulse-grid"
        reduceMotion
      >
        <Pulse />
      </ReceiverAnimationProvider>
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(view.frames).toHaveLength(1);
    expect(view.lastFrame()).toBe('0');
    act(() => view.unmount());
  });

  it('keeps the reduced-motion stopwatch readable, pauses it, and resets on a style change', async () => {
    vi.useFakeTimers();
    function Clock({style, playback}: {style: ReceiverStyle; playback: PlaybackState}): React.ReactElement {
      const {pulse, data} = useReceiverFrame(style, null, playback, null);
      return <Text>{pulse}/{Math.floor(data?.stopwatchSeconds ?? 0)}</Text>;
    }
    const reduced = resolveDisplayMode({reduceMotion: true}, {});
    const receiver = (style: ReceiverStyle, playback = playing) => (
      <DisplayContext.Provider value={reduced}>
        <ReceiverAnimationProvider screen="now-playing" playback={playback} receiverStyle={style} reduceMotion>
          <Clock style={style} playback={playback} />
        </ReceiverAnimationProvider>
      </DisplayContext.Provider>
    );
    const view = renderReceiver(receiver('segment-clock'));
    expect(view.lastFrame()).toBe('0/0');
    await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
    expect(view.lastFrame()).toBe('0/2');
    act(() => view.rerender(receiver('segment-clock', {...playing, state: 'paused'})));
    await act(async () => { await vi.advanceTimersByTimeAsync(2200); });
    expect(view.lastFrame()).toBe('0/2');
    act(() => view.rerender(receiver('pulse-grid')));
    act(() => view.rerender(receiver('segment-clock')));
    expect(view.lastFrame()).toBe('0/0');
    act(() => view.unmount());
  });

  it('adds the live listening session once and freezes at its recorded total when paused', async () => {
    vi.useFakeTimers();
    const start = new Date('2026-11-26T18:00:00Z');
    vi.setSystemTime(start.getTime() + 40_000);
    const station: Station = {
      id: 'waves', provider: 'radio-browser', name: 'Waves', country: 'United States', countryCode: 'US',
      tags: [], streamUrl: 'https://example.com/stream'
    };
    const active: ListeningSession = {
      id: 'active', station, startedAt: start.toISOString(), lastActiveAt: new Date(start.getTime() + 30_000).toISOString(),
      listenedSeconds: 30
    };
    const earlier: ListeningSession = {
      id: 'earlier', station, startedAt: '2026-11-26T17:00:00Z', endedAt: '2026-11-26T17:03:00Z', listenedSeconds: 180
    };
    function Odometer({playback, current}: {playback: PlaybackState; current: ListeningSession}): React.ReactElement {
      const {data} = useReceiverFrame('odometer', station, playback, null, [current, earlier]);
      return <Text>{data?.listeningSeconds}</Text>;
    }
    const view = renderReceiver(<Odometer playback={playing} current={active} />);
    expect(view.lastFrame()).toBe('220');
    const endedAt = new Date(start.getTime() + 41_000).toISOString();
    act(() => view.rerender(<Odometer playback={{...playing, state: 'paused'}} current={{...active, endedAt, lastActiveAt: endedAt, listenedSeconds: 41}} />));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(view.lastFrame()).toBe('221');
    act(() => view.unmount());
  });
});
