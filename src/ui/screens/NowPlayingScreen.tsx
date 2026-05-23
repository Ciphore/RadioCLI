import React from 'react';
import {Box, Text} from 'ink';
import type {IcyNowPlaying, PlaybackDiagnostics, PlaybackState, Station, ThemeName} from '../../types.js';
import {stationLocation, stationTags, stationTech, truncate} from '../format.js';
import {themeAccent} from '../theme.js';

type NowPlayingProps = {
  station: Station | null;
  playback: PlaybackState;
  metadata: IcyNowPlaying | null;
  theme: ThemeName;
  favorite: boolean;
  pulse: number;
  diagnostics: PlaybackDiagnostics;
  sleepLabel: string;
  showDiagnostics: boolean;
  stationTime: string;
  width: number;
};

export function NowPlayingScreen({
  station,
  playback,
  metadata,
  theme,
  favorite,
  pulse,
  diagnostics,
  sleepLabel,
  showDiagnostics,
  stationTime,
  width
}: NowPlayingProps): React.ReactElement {
  const accent = themeAccent(theme);
  const bars = buildBars(pulse);

  return (
    <Box flexDirection="column">
      <Text bold>Now playing</Text>
      <Box borderStyle="round" borderColor={accent} flexDirection="column" paddingX={2} paddingY={1} width={width}>
        <Box justifyContent="space-between">
          <Text color={accent} bold>
            FM {station?.bitrate ? String(station.bitrate).padStart(3, '0') : '---'}.
            {station?.codec ? station.codec.slice(0, 1).toUpperCase() : '0'}
          </Text>
          <Text color={accent}>RADIO ATLAS</Text>
          <Text color={accent}>{playback.state.toUpperCase()}</Text>
        </Box>
        <Box marginTop={1}>
          <Text bold>{station ? truncate(station.name, 62) : 'No station tuned'}</Text>
        </Box>
        <Text color="gray">{station ? truncate(stationLocation(station).toUpperCase(), 68) : 'Choose a station from Explore, Countries, Search, Nearby, Recent, or Favorites.'}</Text>
        <Box marginTop={1}>
          <Text color={accent}>{bars}</Text>
        </Box>
        <Text>{station ? truncate(stationTech(station), 68) : 'Playback backend ready when mpv or ffplay is installed.'}</Text>
        <Text color="gray">{station ? truncate(stationTags(station), 68) : 'No stream metadata yet.'}</Text>
        <Box marginTop={1}>
          <Text color={metadata?.title ? accent : 'gray'}>
            {metadata?.title ? truncate(metadata.title, 68) : 'Waiting for ICY track metadata'}
          </Text>
        </Box>
        <Box marginTop={1} justifyContent="space-between">
          <Text color="gray">
            Backend {playback.backend} · Vol {diagnostics.muted ? 'muted' : diagnostics.volume}
          </Text>
          <Text color={favorite ? 'yellow' : 'gray'}>{favorite ? '★ FAVORITE' : '☆ NOT FAVORITE'}</Text>
          <Text color="gray">{sleepLabel}</Text>
        </Box>
        <Box>
          <Text color="gray">space pause · +/- volume · m mute · s sleep · n/p station · d diagnostics · b back</Text>
        </Box>
        {showDiagnostics ? (
          <Box marginTop={1} flexDirection="column">
            <Text color="gray">Diagnostics</Text>
            <Text color="gray">Stream: {diagnostics.streamUrl ? truncate(diagnostics.streamUrl, 62) : 'none'}</Text>
            <Text color="gray">Station time: {stationTime}</Text>
            <Text color="gray">
              Started: {diagnostics.startedAt ? new Date(diagnostics.startedAt).toLocaleTimeString() : 'not playing'} ·
              available {diagnostics.availableBackends.join(', ') || 'none'}
            </Text>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

function buildBars(pulse: number): string {
  const symbols = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  return Array.from({length: 42}, (_, index) => symbols[(index + pulse + Math.floor(index / 3)) % symbols.length]).join('');
}
