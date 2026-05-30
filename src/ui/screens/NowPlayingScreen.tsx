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
import {ScreenHeader} from '../components/ScreenHeader.js';
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
  const visualHeight = visualizerHeight(receiverStyle, panelHeight - (showDiagnostics ? 14 : 9), innerWidth);
  const visualRows = buildVisualizer(receiverStyle, pulse, innerWidth, visualHeight, station, playback, theme);
  const stationName = station ? truncate(station.name, innerWidth) : 'No station tuned';
  const stationPlace = station
    ? truncate(stationLocation(station).toUpperCase(), innerWidth)
    : 'Choose a station from Library, Explore, Search, Countries, or Nearby.';
  const infoFallback = diagnostics.availableBackends.length > 0
    ? 'Playback backend ready. Choose a station to start tuning.'
    : 'No playback backend found. Run radiocli doctor for setup help.';
  // One compact meta line: stream tech, tags, and the sleep timer only when set.
  const sleepSuffix = sleepLabel !== 'Sleep off' ? ` · ${sleepLabel}` : '';
  const infoLine = station
    ? truncate(`${stationTech(station)} · ${stationTags(station)}${sleepSuffix}`, innerWidth)
    : infoFallback;
  const metadataLine = metadata?.title
    ? truncate(metadata.title, Math.max(8, innerWidth - 12))
    : 'Waiting for ICY track metadata';
  const dialLabel = receiverDialLabel(station);

  return (
    <Box flexDirection="column">
      <ScreenHeader
        title="Now playing"
        width={panelWidth}
        theme={theme}
      />
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
            {dialLabel}
          </Text>
          <Text color={accent}>RADIOCLI</Text>
          <Text color={accent}>{playback.state.toUpperCase()}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color={accent} bold>{stationName}</Text>
        </Box>
        <Text color="gray">{truncate(stationPlace, innerWidth)}</Text>
        <Box flexDirection="column">
          {visualRows.map((row, index) => (
            <Text key={`${index}-${row.color}-${row.text}`} color={row.segments ? undefined : row.color}>
              {row.segments
                ? renderSegments(row.segments)
                : row.text}
            </Text>
          ))}
        </Box>
        <Box marginTop={1} justifyContent="space-between" width={innerWidth}>
          <Text color={metadata?.title ? accent : 'gray'}>{metadataLine}</Text>
          <Text color={favorite ? 'yellow' : 'gray'}>{favorite ? '★ Favorite' : '☆ Favorite'}</Text>
        </Box>
        <Text color="gray">{infoLine}</Text>
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

export function receiverDialLabel(station: Station | null): string {
  if (!station) {
    return 'FM ---';
  }

  const frequency = stationFrequency(station.name);
  if (frequency) {
    return frequency;
  }

  const codec = station.codec?.trim().toUpperCase();
  if (station.bitrate && codec) {
    return `FM ${String(station.bitrate).padStart(3, '0')}.${codec.slice(0, 1)}`;
  }

  if (station.bitrate) {
    return `FM ${String(station.bitrate).padStart(3, '0')}`;
  }

  if (codec) {
    return `FM ${codec}`;
  }

  return 'FM LIVE';
}

function stationFrequency(name: string): string | null {
  const frequencyMatch = name.match(/\b(?:(AM|FM)\s*)?(\d{2,4}(?:\.\d{1,2})?)(?:\s*(AM|FM))?\b/i);
  if (!frequencyMatch) {
    return null;
  }

  const value = Number(frequencyMatch[2]);
  if (!Number.isFinite(value)) {
    return null;
  }

  const explicitBand = (frequencyMatch[1] ?? frequencyMatch[3])?.toUpperCase();
  if (explicitBand === 'AM' || (!explicitBand && value >= 520 && value <= 1710)) {
    return `AM ${frequencyMatch[2]}`;
  }

  if (explicitBand === 'FM' || (!explicitBand && value >= 65 && value <= 120)) {
    return `FM ${frequencyMatch[2]}`;
  }

  return null;
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
