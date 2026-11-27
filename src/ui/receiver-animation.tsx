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
  // Continuous receivers resume their last phase when Now Playing is visible again.
  const enteredUltraCode = receiverStyle === 'ultracode' &&
    screen === 'now-playing' && previousSnapshot?.screen !== 'now-playing';
  const changedStyle = previousSnapshot !== null && previousSnapshot.receiverStyle !== receiverStyle;
  const resetPending =
    enteredUltraCode ||
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
      (reduceMotion && receiverStyle !== 'segment-clock') ||
      process.env.RADIOCLI_DISABLE_ANIMATION === '1' ||
      process.env.RADIO_ATLAS_DISABLE_ANIMATION === '1'
    ) {
      return;
    }

    const intervalMs = receiverStyle === 'skyline' ? SKYLINE_RECEIVER_PULSE_MS : LIVE_RECEIVER_PULSE_MS;
    const tickMs = reduceMotion ? 1000 : intervalMs;
    const startedAt = performance.now();
    const startingPulse = pulseRef.current;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (): void => {
      const elapsed = performance.now() - startedAt;
      const completedTicks = Math.floor(elapsed / tickMs);
      const delay = Math.max(1, (completedTicks + 1) * tickMs - elapsed);
      timer = setTimeout(() => {
        const ticks = Math.max(1, Math.floor((performance.now() - startedAt) / tickMs));
        const nextFrame = Math.ceil(ticks * tickMs / intervalMs);
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
