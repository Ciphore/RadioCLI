import React, {act} from 'react';
import {Box, Text} from 'ink';
import {cleanup, render} from 'ink-testing-library';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {PlaybackState} from '../types.js';
import {ReceiverAnimationProvider, useReceiverPulse} from './receiver-animation.js';

const playing: PlaybackState = {
  backend: 'mpv',
  state: 'playing',
  volume: 70,
  muted: false,
  ready: true
};

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

    const view = render(
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
    view.unmount();
  });

  it('does not animate when reduce motion is enabled', async () => {
    vi.useFakeTimers();
    const view = render(
      <ReceiverAnimationProvider
        screen="now-playing"
        playback={playing}
        receiverStyle="pulse-grid"
        reduceMotion
      >
        <Text>{'still'}</Text>
      </ReceiverAnimationProvider>
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(view.frames).toHaveLength(1);
    view.unmount();
  });
});
