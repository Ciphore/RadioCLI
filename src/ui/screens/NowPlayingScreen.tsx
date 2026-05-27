import React from 'react';
import {Box, Text} from 'ink';
import type {
  IcyNowPlaying,
  PlaybackDiagnostics,
  PlaybackState,
  ReceiverStyle,
  Station,
  ThemeName
} from '../../types.js';
import {stationLocation, stationTags, stationTech, truncate} from '../format.js';
import {panelBackground, themeAccent} from '../theme.js';
import {buildVisualizer, visualizerHeight} from '../visualizers/receiver-visualizers.js';

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
  receiverStyle: ReceiverStyle;
  width: number;
  height: number;
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
  receiverStyle,
  width,
  height
}: NowPlayingProps): React.ReactElement {
  const accent = themeAccent(theme);
  const panelWidth = Math.max(62, width);
  const panelHeight = Math.max(10, height);
  const innerWidth = Math.max(28, panelWidth - 6);
  const visualHeight = visualizerHeight(receiverStyle, panelHeight - (showDiagnostics ? 18 : 14));
  const visualRows = buildVisualizer(receiverStyle, pulse, innerWidth, visualHeight, station, playback, theme);
  const stationName = station ? truncate(station.name, innerWidth) : 'No station tuned';
  const stationPlace = station
    ? truncate(stationLocation(station).toUpperCase(), innerWidth)
    : 'Choose a station from Explore, Countries, Search, Nearby, Recent, or Favorites.';
  const tech = station
    ? truncate(stationTech(station), innerWidth)
    : diagnostics.availableBackends.length > 0
      ? 'Playback backend ready. Choose a station to start tuning.'
      : 'No playback backend found. Run radiocli doctor for setup help.';
  const tags = station ? truncate(stationTags(station), innerWidth) : 'No stream metadata yet.';
  const metadataLine = metadata?.title ? truncate(metadata.title, innerWidth) : 'Waiting for ICY track metadata';

  return (
    <Box flexDirection="column">
      <Text bold>Now playing</Text>
      <Box
        borderStyle="round"
        borderColor={accent}
        borderBackgroundColor={panelBackground}
        backgroundColor={panelBackground}
        flexDirection="column"
        paddingX={2}
        paddingY={1}
        width={panelWidth}
        height={panelHeight}
      >
        <Box justifyContent="space-between" width={innerWidth}>
          <Text color={accent} bold>
            FM {station?.bitrate ? String(station.bitrate).padStart(3, '0') : '---'}.
            {station?.codec ? station.codec.slice(0, 1).toUpperCase() : '0'}
          </Text>
          <Text color={accent}>RADIOCLI</Text>
          <Text color={accent}>{playback.state.toUpperCase()}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color={accent} bold>{stationName}</Text>
        </Box>
        <Text color="gray">{truncate(stationPlace, innerWidth)}</Text>
        <Box marginTop={1} flexDirection="column">
          {visualRows.map((row, index) => (
            <Text key={`${index}-${row.color}-${row.text}`} color={row.segments ? undefined : row.color}>
              {row.segments
                ? renderSegments(row.segments)
                : row.text}
            </Text>
          ))}
        </Box>
        <Text>{tech}</Text>
        <Text color="gray">{tags}</Text>
        <Box marginTop={1}>
          <Text color={metadata?.title ? accent : 'gray'}>{metadataLine}</Text>
        </Box>
        <Box marginTop={1} justifyContent="space-between" width={innerWidth}>
          <Text color="gray">
            Backend {playback.backend} · Vol {diagnostics.muted ? 'muted' : diagnostics.volume}
          </Text>
          <Text color={favorite ? 'yellow' : 'gray'}>{favorite ? '★ FAVORITE' : '☆ NOT FAVORITE'}</Text>
          <Text color="gray">{sleepLabel}</Text>
        </Box>
        {showDiagnostics ? (
          <Box marginTop={1} flexDirection="column">
            <Text color="gray">Diagnostics</Text>
            <Text color="gray">Stream: {diagnostics.streamUrl ? truncate(diagnostics.streamUrl, innerWidth - 8) : 'none'}</Text>
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

function renderSegments(segments: Array<{text: string; color: string}>): React.ReactNode {
  let offset = 0;
  return segments.map(segment => {
    const key = `${offset}-${segment.color}`;
    offset += segment.text.length;
    return (
      <Text key={key} color={segment.color}>
        {segment.text}
      </Text>
    );
  });
}
