import type {IcyNowPlaying, PlaybackState, Station} from '../types.js';
import type {PlaybackQueue} from './app-state.js';
import {truncate} from './format.js';

type PlaybackFooterInput = {
  station: Station | null;
  playback: PlaybackState;
  metadata: IcyNowPlaying | null;
  queue: PlaybackQueue | null;
  favorite: boolean;
  sleepLabel: string;
  width: number;
};

const visiblePlaybackStates = new Set<PlaybackState['state']>(['playing', 'paused']);

export function shouldShowPlaybackFooter(station: Station | null, playback: PlaybackState): boolean {
  return Boolean(station && visiblePlaybackStates.has(playback.state));
}

export function playbackFooterText({
  station,
  playback,
  metadata,
  sleepLabel,
  width
}: PlaybackFooterInput): string | null {
  if (!station || !shouldShowPlaybackFooter(station, playback)) {
    return null;
  }

  const details = [
    statePrefix(playback.state),
    station.name,
    trackLabel(metadata, station),
    playback.muted ? 'muted' : `vol ${playback.volume}`,
    sleepLabel !== 'Sleep off' ? sleepLabel : undefined
  ].filter(Boolean);

  return truncate(details.join(' · '), Math.max(1, width));
}

function statePrefix(state: PlaybackState['state']): string | undefined {
  if (state === 'paused') {
    return 'Paused';
  }

  return undefined;
}

function trackLabel(metadata: IcyNowPlaying | null, station: Station): string | undefined {
  const title = metadata?.title?.trim();
  if (!title || title.toLowerCase() === station.name.toLowerCase()) {
    return undefined;
  }

  return title;
}
