import React from 'react';
import {Box, Text} from 'ink';
import type {Station, ThemeName} from '../../types.js';
import {StationList} from '../components/StationList.js';
import {themeAccent} from '../theme.js';

type SearchScreenProps = {
  query: string;
  editing: boolean;
  loading: boolean;
  stations: Station[];
  selected: number;
  theme: ThemeName;
  favorites: Set<string>;
  experimentalOn: boolean;
  filterLabel: string;
  pageSize: number;
};

export function SearchScreen({
  query,
  editing,
  loading,
  stations,
  selected,
  theme,
  favorites,
  experimentalOn,
  filterLabel,
  pageSize
}: SearchScreenProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>Search stations</Text>
      <Text color={editing ? themeAccent(theme) : 'gray'}>
        {editing ? 'INPUT MODE · Type a query, Enter searches, Esc cancels' : '/ edit query · Enter play · f favorite · b back'}
      </Text>
      <Text>
        Query: <Text color={themeAccent(theme)}>{query || 'start typing'}</Text>
        <Text color="gray"> · Radio Browser{experimentalOn ? ' + Radio Garden experimental' : ''}</Text>
      </Text>
      <Text color="gray">Filters: {filterLabel}</Text>
      {loading ? <Text color="gray">Searching public station directories...</Text> : null}
      {!loading ? <StationList stations={stations} selected={selected} theme={theme} favorites={favorites} pageSize={pageSize} /> : null}
    </Box>
  );
}
