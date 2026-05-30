import React from 'react';
import {Box, Text} from 'ink';
import type {Country, ThemeName} from '../../types.js';
import {Menu, Pointer} from '../components/Menu.js';
import {ScreenHeader} from '../components/ScreenHeader.js';
import {themeAccent} from '../theme.js';
import {visibleWindow} from '../list-window.js';

type CountriesProps = {
  countries: Country[];
  selected: number;
  loading: boolean;
  filter: string;
  editingFilter: boolean;
  theme: ThemeName;
  pageSize: number;
  width: number;
};

export function CountriesScreen({
  countries,
  selected,
  loading,
  filter,
  editingFilter,
  theme,
  pageSize,
  width
}: CountriesProps): React.ReactElement {
  const window = visibleWindow(countries, selected, pageSize);

  return (
    <Box flexDirection="column">
      <ScreenHeader
        title="Countries"
        subtitle={editingFilter ? 'Filtering countries — type to narrow the list' : 'Browse the worldwide country directory'}
        width={width}
        theme={theme}
        right={`filter: ${filter || 'all'}`}
      />
      {loading ? <Text color="gray">Loading countries from Radio Browser…</Text> : null}
      {!loading ? (
        <Box marginTop={1} flexDirection="column">
          <Text color="gray">
            Showing {countries.length ? window.start + 1 : 0}-{window.end} of {countries.length}
          </Text>
          <Menu
            items={window.items}
            selected={selected - window.start}
            keyFor={country => country.code}
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
