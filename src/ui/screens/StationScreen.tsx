import React from 'react';
import {Box, Text} from 'ink';
import type {Station, ThemeName} from '../../types.js';
import {StationList} from '../components/StationList.js';
import {ScreenHeader} from '../components/ScreenHeader.js';
import {textMuted} from '../theme.js';

type StationScreenProps = {
  title: string;
  subtitle: string;
  stations: Station[];
  selected: number;
  loading: boolean;
  theme: ThemeName;
  favorites: Set<string>;
  filterLabel: string;
  pageSize: number;
  width: number;
};

export function StationScreen({
  title,
  subtitle,
  stations,
  selected,
  loading,
  theme,
  favorites,
  filterLabel,
  pageSize,
  width
}: StationScreenProps): React.ReactElement {
  const empty = stationEmptyState(title);
  return (
    <Box flexDirection="column">
      <ScreenHeader
        title={title}
        subtitle={subtitle}
        width={width}
        theme={theme}
        right={filterLabel === 'none' ? undefined : `filters: ${filterLabel}`}
      />
      <Box marginTop={1} flexDirection="column">
        {loading ? <Text color={textMuted}>Loading stations…</Text> : null}
        {!loading || stations.length > 0 ? (
          <StationList
            stations={stations}
            selected={selected}
            theme={theme}
            favorites={favorites}
            pageSize={pageSize}
            width={width}
            emptyTitle={empty.title}
            emptyHint={empty.hint}
          />
        ) : null}
      </Box>
    </Box>
  );
}

function stationEmptyState(title: string): {title: string; hint: string} {
  if (title.toLowerCase().includes('library')) {
    return {title: 'Your library is empty.', hint: 'Press f on any station to save it here.'};
  }
  if (title.toLowerCase().includes('nearby')) {
    return {title: 'No nearby stations found.', hint: 'Try again later or browse Countries.'};
  }
  if (title.toLowerCase().includes('country')) {
    return {title: 'No stations found for this country.', hint: 'Choose another country or clear active filters.'};
  }
  return {title: 'No stations found.', hint: 'Try another view or clear active filters.'};
}
