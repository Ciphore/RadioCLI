import React from 'react';
import {Box, Text} from 'ink';
import type {Station, ThemeName} from '../../types.js';
import {StationList} from '../components/StationList.js';

type StationScreenProps = {
  title: string;
  subtitle: string;
  stations: Station[];
  selected: number;
  loading: boolean;
  theme: ThemeName;
  favorites: Set<string>;
  filterLabel: string;
};

export function StationScreen({
  title,
  subtitle,
  stations,
  selected,
  loading,
  theme,
  favorites,
  filterLabel
}: StationScreenProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>{title}</Text>
      <Text color="gray">{subtitle}</Text>
      <Text color="gray">Filters: {filterLabel}</Text>
      {loading ? <Text color="gray">Loading stations...</Text> : null}
      {!loading ? <StationList stations={stations} selected={selected} theme={theme} favorites={favorites} /> : null}
      <Box marginTop={1}>
        <Text color="gray">Enter play · f favorite · n/p move · b back · q quit</Text>
      </Box>
    </Box>
  );
}
