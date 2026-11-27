import {useEffect, useMemo, useState} from 'react';
import {sessionSeconds} from '../activity/stats.js';
import {stationKey} from '../storage/store.js';
import type {IcyNowPlaying, ListeningSession, PlaybackState, ReceiverStyle, Station} from '../types.js';
import {useDisplay} from './display-context.js';
import {useReceiverPulse} from './receiver-animation.js';
import {seconds, type ReceiverData} from './visualizers/cell-canvas.js';

export function useReceiverFrame(
  style: ReceiverStyle,
  station: Station | null,
  playback: PlaybackState,
  metadata: IcyNowPlaying | null,
  sessions?: ListeningSession[]
): {pulse: number; data?: ReceiverData} {
  const pulse = useReceiverPulse();
  const {reduceMotion} = useDisplay();
  const [, refreshClock] = useState(0);
  const wallClock = style === 'golden-gate-live' || style === 'nixie-deck';
  useEffect(() => {
    const needsTick = (wallClock && (reduceMotion || playback.state === 'paused')) ||
      (reduceMotion && playback.state === 'playing' && (style === 'odometer' || style === 'minidisc'));
    if (!playback.ready || !needsTick) return;
    const id = setInterval(() => refreshClock(Date.now()), 1000);
    return () => clearInterval(id);
  }, [playback.ready, playback.state, reduceMotion, style, wallClock]);
  const odometer = style === 'odometer';
  const key = odometer && station ? stationKey(station) : undefined;
  const history = useMemo(() => {
    if (!odometer || !sessions) return undefined;
    const current = key
      ? sessions.find(session => !session.endedAt && session.owner === undefined && stationKey(session.station) === key)
      : undefined;
    return {
      current,
      recordedSeconds: sessions.reduce((total, session) => total + (session === current ? 0 : sessionSeconds(session)), 0)
    };
  }, [key, odometer, sessions]);

  switch (style) {
    case 'odometer': {
      const now = Date.now();
      const {current, recordedSeconds = 0} = history ?? {};
      const confirmed = current ? sessionSeconds(current, new Date(now)) : 0;
      const live = current && playback.ready && playback.state === 'playing' && !playback.buffering
        ? Math.floor((now - Date.parse(current.startedAt)) / 1000)
        : 0;
      return {pulse, data: {listeningSeconds: recordedSeconds + Math.max(confirmed, Number.isFinite(live) ? live : 0)}};
    }
    case 'golden-gate-live':
    case 'nixie-deck':
      return {pulse, data: {nowMs: Date.now()}};
    case 'segment-clock':
      return {pulse: reduceMotion ? 0 : pulse, data: {stopwatchSeconds: seconds(pulse)}};
    case 'minidisc': {
      const elapsed = (Date.now() - Date.parse(playback.startedAt ?? '')) / 1000;
      return {pulse, data: {
        streamSeconds: playback.elapsedSeconds ?? (playback.state === 'playing' && Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0),
        title: metadata?.title || station?.name,
        paused: playback.state === 'paused'
      }};
    }
    default:
      return {pulse};
  }
}
