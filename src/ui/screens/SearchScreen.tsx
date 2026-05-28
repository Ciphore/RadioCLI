import React from 'react';
import {Box, Text} from 'ink';
import type {Station, ThemeName} from '../../types.js';
import {StationList} from '../components/StationList.js';
import {panelBackground, panelBorder, themeAccent} from '../theme.js';
import {truncate} from '../format.js';

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
  width: number;
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
  pageSize,
  width
}: SearchScreenProps): React.ReactElement {
  const contentWidth = Math.max(40, width);
  const inputWidth = Math.max(34, Math.min(contentWidth, 96));
  const inputTextWidth = Math.max(8, inputWidth - 8);

  return (
    <Box flexDirection="column">
      <Text bold>Search stations</Text>
      <Box
        borderStyle="single"
        borderColor={editing ? themeAccent(theme) : panelBorder}
        borderBackgroundColor={panelBackground}
        backgroundColor={panelBackground}
        width={inputWidth}
        height={3}
        marginBottom={1}
        flexShrink={0}
      >
        <Text color="gray">Search </Text>
        <Text color={query ? themeAccent(theme) : 'gray'}>{truncate(query || 'start typing', inputTextWidth)}</Text>
      </Box>
      <Text color="gray">
        Radio Browser{experimentalOn ? ' + Radio Garden experimental' : ''} · Filters: {filterLabel}
      </Text>
      {loading ? <Text color="gray">Searching public station directories…</Text> : null}
      {!loading ? <StationList stations={stations} selected={selected} theme={theme} favorites={favorites} pageSize={pageSize} width={width} /> : null}
    </Box>
  );
}
