import React from 'react';
import {Box, Text} from 'ink';
import type {Station, ThemeName} from '../../types.js';
import {stationLocation, stationTags, stationTech, truncate} from '../format.js';
import {themeAccent} from '../theme.js';
import {Menu, Pointer} from './Menu.js';
import {visibleWindow} from '../list-window.js';

type StationListProps = {
  stations: Station[];
  selected: number;
  theme: ThemeName;
  favorites: Set<string>;
  pageSize: number;
  width: number;
};

export function StationList({stations, selected, theme, favorites, pageSize, width}: StationListProps): React.ReactElement {
  if (stations.length === 0) {
    return <Text color="gray">No stations found.</Text>;
  }

  const window = visibleWindow(stations, selected, pageSize);
  const rowWidth = Math.max(42, width - 4);
  const nameWidth = Math.min(48, Math.max(18, Math.floor(rowWidth * 0.42)));
  const metaWidth = Math.max(12, rowWidth - nameWidth - 6);

  return (
    <Box flexDirection="column">
      <Text color="gray">
        Showing {window.start + 1}-{window.end} of {stations.length}
      </Text>
      <Menu
        items={window.items}
        selected={selected - window.start}
        render={(station, index, active) => (
          <Box flexDirection="column">
            <Box>
              <Pointer active={active} />
              <Text color={active ? themeAccent(theme) : undefined} bold={active}>
                {truncate(station.name, nameWidth).padEnd(nameWidth)}
              </Text>
              <Text color="gray"> {favorites.has(`${station.provider}:${station.id}`) ? '★' : ' '} </Text>
              <Text color="gray">
                {truncate(`${stationLocation(station)} · ${stationTech(station)}`, metaWidth)}
              </Text>
            </Box>
            {active ? (
              <Box marginLeft={4}>
                <Text color="gray">
                  #{window.start + index + 1} · {truncate(stationTags(station), rowWidth - 8)}
                </Text>
              </Box>
            ) : null}
          </Box>
        )}
      />
    </Box>
  );
}
