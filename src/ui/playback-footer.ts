import type {IcyNowPlaying, PlaybackState, Station} from '../types.js';
import type {PlaybackQueue} from './app-state.js';
import {stationLocation, stationTech, truncate} from './format.js';

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
  queue,
  favorite,
  sleepLabel,
  width
}: PlaybackFooterInput): string | null {
  if (!station || !shouldShowPlaybackFooter(station, playback)) {
    return null;
  }

  const details = [
    station.name,
    trackLabel(metadata, station),
    stationLocation(station),
    stationTech(station),
    playback.backend ? `${playback.backend} · ${playback.state}` : playback.state,
    playback.muted ? 'muted' : `vol ${playback.volume}`,
    favorite ? 'favorite' : undefined,
    queueLabel(queue, station),
    sleepLabel !== 'Sleep off' ? sleepLabel : undefined
  ].filter(Boolean);

  return truncate(`${stateLabel(playback.state)}: ${details.join(' · ')}`, Math.max(1, width));
}

function stateLabel(state: PlaybackState['state']): string {
  if (state === 'paused') {
    return 'Paused';
  }

  return 'Playing';
}

function trackLabel(metadata: IcyNowPlaying | null, station: Station): string | undefined {
  const title = metadata?.title?.trim();
  if (!title || title.toLowerCase() === station.name.toLowerCase()) {
    return undefined;
  }

  return `Now: ${title}`;
}

function queueLabel(queue: PlaybackQueue | null, station: Station): string | undefined {
  if (!queue || queue.stations.length <= 1) {
    return undefined;
  }

  const index = queue.stations.findIndex(item => item.provider === station.provider && item.id === station.id);
  if (index === -1) {
    return `${queue.title} queue`;
  }

  return `${queue.title} ${index + 1}/${queue.stations.length}`;
}
