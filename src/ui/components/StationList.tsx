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
};

export function StationList({stations, selected, theme, favorites, pageSize}: StationListProps): React.ReactElement {
  if (stations.length === 0) {
    return <Text color="gray">No stations found.</Text>;
  }

  const window = visibleWindow(stations, selected, pageSize);

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
                {truncate(station.name, 48)}
              </Text>
              <Text color="gray"> {favorites.has(`${station.provider}:${station.id}`) ? '★' : ' '}</Text>
            </Box>
            <Box marginLeft={4}>
              <Text color="gray">
                {truncate(stationLocation(station), 30)} · {truncate(stationTech(station), 32)}
              </Text>
            </Box>
            {active ? (
              <Box marginLeft={4}>
                <Text color="gray">
                  #{window.start + index + 1} · {truncate(stationTags(station), 70)}
                </Text>
              </Box>
            ) : null}
          </Box>
        )}
      />
    </Box>
  );
}
