import React, {createContext, useContext, useEffect, useRef, useState} from 'react';
import type {AppSettings, PlaybackState, Screen} from '../types.js';
import {shouldAnimateReceiver, shouldResetReceiverPulse, type ReceiverPulseSnapshot} from './app-state.js';

const LIVE_RECEIVER_PULSE_MS = 80;
const SKYLINE_RECEIVER_PULSE_MS = 120;

const ReceiverPulseContext = createContext(0);

type ReceiverAnimationProviderProps = {
  children: React.ReactNode;
  screen: Screen;
  playback: PlaybackState;
  receiverStyle: AppSettings['receiverStyle'];
  reduceMotion: boolean;
};

/**
 * Own receiver animation below the application root so an animation frame only
 * invalidates the visualizer that consumes the pulse. Pulse values are derived
 * from elapsed time: a busy terminal may skip obsolete frames, but it never
 * slows the animation or queues a backlog of root renders.
 */
export function ReceiverAnimationProvider({
  children,
  screen,
  playback,
  receiverStyle,
  reduceMotion
}: ReceiverAnimationProviderProps): React.ReactElement {
  const [pulse, setPulse] = useState(0);
  const pulseRef = useRef(0);
  const snapshotRef = useRef<ReceiverPulseSnapshot | null>(null);

  pulseRef.current = pulse;

  const previousSnapshot = snapshotRef.current;
  const currentSnapshot: ReceiverPulseSnapshot = {
    screen,
    receiverStyle,
    playbackState: playback.state,
    playbackReady: playback.ready
  };
  const enteredNowPlaying = screen === 'now-playing' && previousSnapshot?.screen !== 'now-playing';
  const changedStyle = previousSnapshot !== null && previousSnapshot.receiverStyle !== receiverStyle;
  const resetPending =
    enteredNowPlaying ||
    changedStyle ||
    shouldResetReceiverPulse(previousSnapshot, currentSnapshot);

  useEffect(() => {
    if (resetPending) {
      pulseRef.current = 0;
      setPulse(0);
    }

    snapshotRef.current = currentSnapshot;
  }, [playback.ready, playback.state, receiverStyle, resetPending, screen]);

  useEffect(() => {
    if (
      !shouldAnimateReceiver(screen, playback) ||
      reduceMotion ||
      process.env.RADIOCLI_DISABLE_ANIMATION === '1' ||
      process.env.RADIO_ATLAS_DISABLE_ANIMATION === '1'
    ) {
      return;
    }

    const intervalMs = receiverStyle === 'skyline' ? SKYLINE_RECEIVER_PULSE_MS : LIVE_RECEIVER_PULSE_MS;
    const startedAt = performance.now();
    const startingPulse = pulseRef.current;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (): void => {
      const elapsed = performance.now() - startedAt;
      const completedFrames = Math.floor(elapsed / intervalMs);
      const delay = Math.max(1, (completedFrames + 1) * intervalMs - elapsed);
      timer = setTimeout(() => {
        const nextFrame = Math.max(1, Math.floor((performance.now() - startedAt) / intervalMs));
        setPulse(startingPulse + nextFrame);
        schedule();
      }, delay);
    };

    schedule();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [playback.ready, playback.state, receiverStyle, reduceMotion, screen]);

  return <ReceiverPulseContext.Provider value={resetPending ? 0 : pulse}>{children}</ReceiverPulseContext.Provider>;
}

export function useReceiverPulse(): number {
  return useContext(ReceiverPulseContext);
}
