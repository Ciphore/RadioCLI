import type {IcyNowPlaying, PlaybackState, Station} from '../types.js';
import type {PlaybackQueue} from './app-state.js';
import {truncate} from './format.js';

// Square braille spinner: a filled 2x4 dot cell that appears to rotate. Reads as
// a small spinning block in the terminal, which suits RadioCLI better than a
// thin circular spinner.
export const loadingSpinnerFrames = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'] as const;

export function loadingSpinnerFrame(frame: number): string {
  const count = loadingSpinnerFrames.length;
  // Guard against negative or fractional tick counters.
  const index = ((Math.trunc(frame) % count) + count) % count;
  return loadingSpinnerFrames[index] ?? loadingSpinnerFrames[0];
}

type PlaybackFooterInput = {
  station: Station | null;
  playback: PlaybackState;
  metadata: IcyNowPlaying | null;
  queue: PlaybackQueue | null;
  favorite: boolean;
  sleepLabel: string;
  width: number;
  // Monotonically increasing tick used to advance the loading spinner.
  spinnerFrame?: number;
};

const visiblePlaybackStates = new Set<PlaybackState['state']>(['loading', 'playing', 'paused']);

export function shouldShowPlaybackFooter(station: Station | null, playback: PlaybackState): boolean {
  // During loading the React-side station may not be set yet, but the player
  // already knows the station name, so fall back to that.
  return Boolean((station || playback.stationName) && visiblePlaybackStates.has(playback.state));
}

export function playbackFooterText({
  station,
  playback,
  metadata,
  sleepLabel,
  width,
  spinnerFrame
}: PlaybackFooterInput): string | null {
  const stationName = station?.name ?? playback.stationName;
  if (!stationName || !visiblePlaybackStates.has(playback.state)) {
    return null;
  }

  const loading = playback.state === 'loading';
  const nameLabel = loading
    ? `${loadingSpinnerFrame(spinnerFrame ?? 0)} ${stationName}`
    : stationName;

  const details = [
    statePrefix(playback.state),
    nameLabel,
    loading ? 'buffering…' : trackLabel(metadata, stationName),
    outputLabel(playback),
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

function outputLabel(playback: PlaybackState): string | undefined {
  if (playback.backend !== 'airplay') {
    return undefined;
  }

  return playback.airPlayDeviceName ? `AirPlay ${playback.airPlayDeviceName}` : 'AirPlay';
}

function trackLabel(metadata: IcyNowPlaying | null, stationName: string): string | undefined {
  const title = metadata?.title?.trim();
  if (!title || title.toLowerCase() === stationName.toLowerCase()) {
    return undefined;
  }

  return title;
}
