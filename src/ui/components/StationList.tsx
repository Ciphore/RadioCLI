import React from 'react';
import {Box, Text} from 'ink';
import type {Station, ThemeName} from '../../types.js';
import {displayWidth, stationLocation, stationTags, stationTech, truncate} from '../format.js';
import {textMuted, themeAccent} from '../theme.js';
import {Menu, Pointer} from './Menu.js';
import {visibleWindow} from '../list-window.js';

type StationListProps = {
  stations: Station[];
  selected: number;
  theme: ThemeName;
  favorites: Set<string>;
  pageSize: number;
  width: number;
  emptyTitle?: string;
  emptyHint?: string;
  showCount?: boolean;
};

export function StationList({
  stations,
  selected,
  theme,
  favorites,
  pageSize,
  width,
  emptyTitle = 'No stations found.',
  emptyHint = 'Try another view or clear active filters.',
  showCount = true
}: StationListProps): React.ReactElement {
  if (stations.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color={textMuted}>{emptyTitle}</Text>
        <Text color={textMuted}>{emptyHint}</Text>
      </Box>
    );
  }

  const window = visibleWindow(stations, selected, pageSize);
  const rowWidth = Math.max(42, width - 4);
  const nameWidth = Math.min(48, Math.max(18, Math.floor(rowWidth * 0.42)));
  const metaWidth = Math.max(12, rowWidth - nameWidth - 6);

  return (
    <Box flexDirection="column">
      {showCount ? (
        <Text color={textMuted}>
          {window.start + 1}-{window.end} of {stations.length}
        </Text>
      ) : null}
      <Menu
        items={window.items}
        selected={selected - window.start}
        keyFor={station => `${station.provider}:${station.id}`}
        render={(station, _index, active) => {
          const favorite = favorites.has(`${station.provider}:${station.id}`);
          const stationName = truncate(station.name, favorite ? Math.max(1, nameWidth - 2) : nameWidth);
          const titleWidth = nameWidth + 2;
          const titleUsed = displayWidth(stationName) + (favorite ? 2 : 0);
          const titlePadding = ' '.repeat(Math.max(1, titleWidth - titleUsed));
          const standardMetadata = `${stationLocation(station)} · ${stationTech(station)}`;
          const selectedMetadata = station.tags.length > 0 ? stationTags(station) : standardMetadata;

          return (
            <Box>
              <Pointer active={active} />
              <Text color={active ? themeAccent(theme) : undefined} bold={active}>
                {stationName}
              </Text>
              {favorite ? <Text color="yellow"> ★</Text> : null}
              <Text>{titlePadding}</Text>
              <Text color={active ? themeAccent(theme) : textMuted}>
                {truncate(active ? selectedMetadata : standardMetadata, metaWidth)}
              </Text>
            </Box>
          );
        }}
      />
    </Box>
  );
}
