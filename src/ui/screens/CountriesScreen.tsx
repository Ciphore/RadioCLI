import React from 'react';
import {Box, Text} from 'ink';
import type {Country, ThemeName} from '../../types.js';
import {Menu, Pointer} from '../components/Menu.js';
import {themeAccent} from '../theme.js';
import {visibleWindow} from '../list-window.js';

type CountriesProps = {
  countries: Country[];
  selected: number;
  loading: boolean;
  filter: string;
  editingFilter: boolean;
  theme: ThemeName;
};

export function CountriesScreen({
  countries,
  selected,
  loading,
  filter,
  editingFilter,
  theme
}: CountriesProps): React.ReactElement {
  const window = visibleWindow(countries, selected, 18);

  return (
    <Box flexDirection="column">
      <Text bold>Countries</Text>
      <Text color="gray">
        {editingFilter ? 'Type a country filter, Enter to apply, Esc to cancel' : '/ filter · Enter opens stations · b back'}
      </Text>
      <Text>
        Filter: <Text color={themeAccent(theme)}>{filter || 'all'}</Text>
      </Text>
      {loading ? <Text color="gray">Loading countries from Radio Browser...</Text> : null}
      {!loading ? (
        <Box flexDirection="column">
          <Text color="gray">
            Showing {countries.length ? window.start + 1 : 0}-{window.end} of {countries.length}
          </Text>
          <Menu
            items={window.items}
            selected={selected - window.start}
            render={(country, _index, active) => (
              <Box>
                <Pointer active={active} />
                <Text color={active ? themeAccent(theme) : undefined} bold={active}>
                  {country.name}
                </Text>
                <Text color="gray"> · {country.code} · {country.stationCount.toLocaleString()} stations</Text>
              </Box>
            )}
          />
        </Box>
      ) : null}
    </Box>
  );
}
