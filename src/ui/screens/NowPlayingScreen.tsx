import React from 'react';
import {Box, Text} from 'ink';
import type {
  IcyNowPlaying,
  PlaybackDiagnostics,
  PlaybackState,
  ReceiverStyle,
  Station,
  ThemeName,
  TrackPlay
} from '../../types.js';
import {displayWidth, stationLocation, truncate} from '../format.js';
import {textMuted, themeAccent} from '../theme.js';
import {panelBorderStyle, useDisplay} from '../display-context.js';
import {toAsciiSafe} from '../ascii.js';
import {ScreenHeader} from '../components/ScreenHeader.js';
import {buildVisualizer, visualizerHeight} from '../visualizers/receiver-visualizers.js';
import {useReceiverPulse} from '../receiver-animation.js';

type NowPlayingProps = {
  station: Station | null;
  playback: PlaybackState;
  metadata: IcyNowPlaying | null;
  theme: ThemeName;
  favorite: boolean;
  diagnostics: PlaybackDiagnostics;
  showDiagnostics: boolean;
  stationTime: string;
  receiverStyle: ReceiverStyle;
  trackHistory: TrackPlay[];
  width: number;
  height: number;
};

// Terminal rows are roughly twice as tall as columns are wide. One vertical
// row and three horizontal columns produce a closer optical inset around the
// highest and lowest visible text than a mechanically equal cell count.
const receiverPaddingX = 3;
const receiverPaddingY = 1;

export function NowPlayingScreen({
  station,
  playback,
  metadata,
  theme,
  favorite,
  diagnostics,
  showDiagnostics,
  stationTime,
  receiverStyle,
  trackHistory,
  width,
  height
}: NowPlayingProps): React.ReactElement {
  const pulse = useReceiverPulse();
  const {panel: panelBackground, ascii, screenReader} = useDisplay();
  // In ASCII mode route every rendered string through the glyph mapper so no
  // braille, block, box-drawing, or punctuation (·, ★) leaks to the terminal.
  const a = (value: string): string => (ascii ? toAsciiSafe(value) : value);
  const stationTracks = recentTracksForStation(trackHistory, station, 3);
  const accent = themeAccent(theme);
  const panelWidth = Math.max(62, width);
  const panelHeight = Math.max(10, height);
  const innerWidth = Math.max(28, panelWidth - (receiverPaddingX * 2) - 2);
  // Station identity now lives in the receiver header. Its former name and
  // location rows become visualizer space, while a shared gutter keeps the
  // visualization equally separated from the header and track title.
  const visualizerGutterRows = 1;
  const visualHeight = visualizerHeight(
    receiverStyle,
    panelHeight - (showDiagnostics ? 10 : 5) - visualizerGutterRows,
    innerWidth
  );
  const visualRows = screenReader ? [] : buildVisualizer(receiverStyle, pulse, innerWidth, visualHeight, station, playback, theme);
  const receiverState = playback.state.toUpperCase();
  const identityWidth = Math.max(8, innerWidth - displayWidth(receiverState) - 2);
  const stationIdentity = receiverStationIdentity(station, identityWidth);
  const infoFallback = diagnostics.availableBackends.length > 0
    ? 'Playback backend ready. Choose a station to start tuning.'
    : 'No playback backend found. Run radiocli doctor for setup help.';
  const metadataLine = metadata?.title
    ? truncate(metadata.title, Math.max(8, innerWidth - 12))
    : station
      ? 'Waiting for ICY track metadata'
      : infoFallback;
  const renderRows = ascii ? visualRows.map(asciifyVisualRow) : visualRows;
  const favoriteText = favorite ? '★ Favorite' : '☆ Favorite';

  return (
    <Box flexDirection="column">
      <ScreenHeader
        title="Now playing"
        width={panelWidth}
        theme={theme}
      />
      <Box
        borderStyle={panelBorderStyle(ascii)}
        borderColor={accent}
        borderBackgroundColor={panelBackground}
        backgroundColor={panelBackground}
        flexDirection="column"
        paddingX={receiverPaddingX}
        paddingY={receiverPaddingY}
        width={panelWidth}
        height={panelHeight}
      >
        <Box justifyContent="space-between" width={innerWidth} flexShrink={0}>
          <Box width={identityWidth} overflow="hidden" aria-label={`Station: ${station?.name ?? 'No station tuned'}${station ? `, ${stationLocation(station)}` : ''}`}>
            <Text color={accent} bold>{a(stationIdentity.name)}</Text>
            {stationIdentity.location ? <Text color={textMuted}>{a(` · ${stationIdentity.location}`)}</Text> : null}
          </Box>
          <Text color={accent} aria-label={`Playback: ${playback.state}, ${playback.muted ? 'muted' : `volume ${playback.volume}`}`}>{receiverState}</Text>
        </Box>
        {!screenReader ? <Box marginTop={visualizerGutterRows} flexDirection="column" flexShrink={1} overflow="hidden" aria-hidden>
          {renderRows.map((row, index) => (
            <Text key={index} color={row.segments ? undefined : row.color}>
              {row.segments
                ? renderSegments(row.segments)
                : row.text}
            </Text>
          ))}
        </Box> : null}
        <Box marginTop={visualizerGutterRows} justifyContent="space-between" width={innerWidth} flexShrink={0}>
          <Text color={metadata?.title ? accent : textMuted} aria-label={metadata?.title ? `Track: ${metadata.title}` : undefined}>{a(metadataLine)}</Text>
          <Text color={favorite ? 'yellow' : textMuted} aria-label={favorite ? 'Favorite' : 'Not a favorite'}>{a(favoriteText)}</Text>
        </Box>
        {showDiagnostics ? (
          <Box marginTop={1} flexDirection="column">
            <Text color={textMuted}>Diagnostics</Text>
            <Text color={textMuted}>{a(`Stream: ${diagnostics.streamUrl ? truncate(diagnostics.streamUrl, innerWidth - 8) : 'none'}`)}</Text>
            <Text color={textMuted}>{a(`Station time: ${stationTime}`)}</Text>
            <Text color={textMuted}>
              {a(`Started: ${diagnostics.startedAt ? new Date(diagnostics.startedAt).toLocaleTimeString() : 'not playing'} · available ${diagnostics.availableBackends.join(', ') || 'none'}`)}
            </Text>
            {stationTracks.length > 0 ? (
              <Box flexDirection="column" marginTop={1}>
                <Text color={textMuted}>Recent tracks</Text>
                {stationTracks.map(track => (
                  <Text key={`${track.at}-${track.title}`} color={textMuted}>
                    {a(`· ${truncate(track.title, innerWidth - 2)}`)}
                  </Text>
                ))}
              </Box>
            ) : null}
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

type VisualSegment = {text: string; color: string; backgroundColor?: string; bold?: boolean};
type VisualRow = {text: string; color: string; segments?: VisualSegment[]};

function asciifyVisualRow(row: VisualRow): VisualRow {
  return {
    ...row,
    text: toAsciiSafe(row.text),
    segments: row.segments?.map(segment => ({...segment, text: toAsciiSafe(segment.text)}))
  };
}

export function recentTracksForStation(history: TrackPlay[], station: Station | null, limit: number): TrackPlay[] {
  if (!station) {
    return [];
  }

  const key = `${station.provider}:${station.id}`;
  return history.filter(track => track.stationKey === key).slice(0, limit);
}

export function receiverStationIdentity(
  station: Station | null,
  width: number
): {name: string; location: string} {
  if (!station) {
    return {name: truncate('No station tuned', width), location: ''};
  }

  const nameWidth = displayWidth(station.name);
  if (nameWidth >= width - 3) {
    return {name: truncate(station.name, width), location: ''};
  }

  const locationWidth = Math.max(0, width - nameWidth - 3);
  return {
    name: station.name,
    location: truncate(stationLocation(station).toUpperCase(), locationWidth)
  };
}

function renderSegments(segments: VisualSegment[]): React.ReactNode {
  let offset = 0;
  return segments.map(segment => {
    // Keep identity tied to geometry, not animated color. Color-bearing keys
    // forced React to unmount and recreate hundreds of Text nodes per frame.
    const key = offset;
    offset += segment.text.length;
    return (
      <Text key={key} color={segment.color} backgroundColor={segment.backgroundColor} bold={segment.bold}>
        {segment.text}
      </Text>
    );
  });
}
