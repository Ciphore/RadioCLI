import React from 'react';
import {Box, Text} from 'ink';
import type {Country, ThemeName} from '../../types.js';
import {themeAccent} from '../theme.js';
import {visibleWindow} from '../list-window.js';
import {Menu, Pointer} from '../components/Menu.js';

const mapRows = [
  '        . . . . .                  . . . . . . . . .       ',
  '    . . █ █ █ █ █ . .          . . █ █ █ █ █ █ █ █ . .     ',
  '  . █ █ █ █ █ █ █ █ .        . █ █ █ █ █ █ █ █ █ █ █ .     ',
  '  . █ █ █ █ █ █ █ .            . █ █ █ █ █ █ █ █ █ .       ',
  '    . █ █ █ █ .                  . █ █ █ █ █ █ .           ',
  '        . █ .        . . .          . █ █ .        . .      ',
  '                 . █ █ █ █ .          .        . █ █ █ .   ',
  '              . █ █ █ █ █ █ .              . █ █ █ █ █ .   ',
  '                . █ █ █ █ .                  . █ █ █ .     '
];

type MapScreenProps = {
  countries: Country[];
  selected: number;
  loading: boolean;
  filter: string;
  editingFilter: boolean;
  theme: ThemeName;
  pageSize: number;
  mode: 'compact' | 'full';
};

export function MapScreen({
  countries,
  selected,
  loading,
  filter,
  editingFilter,
  theme,
  pageSize,
  mode
}: MapScreenProps): React.ReactElement {
  const topCountries = [...countries].sort((a, b) => b.stationCount - a.stationCount).slice(0, mode === 'full' ? 12 : 6);
  const selectedCountry = countries[selected];
  const window = visibleWindow(countries, selected, pageSize);
  const rows = mode === 'full' ? mapRows : mapRows.filter((_, index) => index % 2 === 0);

  return (
    <Box flexDirection="column">
      <Text bold>World map</Text>
      <Text color={editingFilter ? themeAccent(theme) : 'gray'}>
        {editingFilter ? 'Type a country filter, Enter to apply, Esc to cancel' : 'Station density atlas · Enter opens selected country · / filters country list · b back'}
      </Text>
      <Text>
        Filter: <Text color={themeAccent(theme)}>{filter || 'all'}</Text>
      </Text>
      {loading ? <Text color="gray">Loading country density...</Text> : null}
      <Box marginY={1} flexDirection="column">
        {rows.map((row, index) => (
          <Text key={index} color={index % 2 === 0 ? themeAccent(theme) : 'gray'}>
            {mode === 'full' ? row : row.slice(0, 48)}
          </Text>
        ))}
      </Box>
      <Text color="gray">Highest station counts</Text>
      <Box flexDirection="column">
        {topCountries.map(country => (
          <Text key={country.code}>
            <Text color={themeAccent(theme)}>{country.code.padEnd(3)}</Text>
            <Text>{country.name.padEnd(34).slice(0, 34)}</Text>
            <Text color="gray"> {country.stationCount.toLocaleString()}</Text>
          </Text>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>
          Selected:{' '}
          <Text color={themeAccent(theme)}>
            {selectedCountry ? `${selectedCountry.name} · ${selectedCountry.stationCount.toLocaleString()} stations` : 'none'}
          </Text>
        </Text>
        <Menu
          items={window.items}
          selected={selected - window.start}
          render={(country, _index, active) => (
            <Box>
              <Pointer active={active} />
              <Text color={active ? themeAccent(theme) : undefined} bold={active}>
                {country.code}
              </Text>
              <Text color="gray"> · {country.name}</Text>
            </Box>
          )}
        />
      </Box>
    </Box>
  );
}
