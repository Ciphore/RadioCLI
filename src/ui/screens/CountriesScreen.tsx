import React from 'react';
import {Box, Text} from 'ink';
import type {Country, ThemeName} from '../../types.js';
import {Menu, Pointer} from '../components/Menu.js';
import {ScreenHeader} from '../components/ScreenHeader.js';
import {textMuted, themeAccent} from '../theme.js';
import {visibleWindow} from '../list-window.js';
import {truncate} from '../format.js';

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
  const rowWidth = Math.max(24, width - 2);

  return (
    <Box flexDirection="column">
      <ScreenHeader
        title="Countries"
        subtitle={editingFilter ? 'Filtering countries — type to narrow the list' : 'Browse the worldwide country directory'}
        width={width}
        theme={theme}
        right={`filter: ${filter || 'all'}`}
      />
      {loading ? <Text color={textMuted}>Loading countries from Radio Browser…</Text> : null}
      {!loading ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={textMuted}>
            Showing {countries.length ? window.start + 1 : 0}-{window.end} of {countries.length}
          </Text>
          <Menu
            items={window.items}
            selected={selected - window.start}
            keyFor={country => country.code}
            render={(country, _index, active) => {
              const meta = ` · ${country.code} · ${country.stationCount.toLocaleString()} stations`;
              const nameWidth = Math.max(4, rowWidth - 2 - meta.length);
              return (
                <Box height={1} width={rowWidth}>
                  <Pointer active={active} />
                  <Text color={active ? themeAccent(theme) : undefined} bold={active}>
                    {truncate(country.name, nameWidth)}
                  </Text>
                  <Text color={textMuted}>{truncate(meta, Math.max(0, rowWidth - 2 - nameWidth))}</Text>
                </Box>
              );
            }}
          />
        </Box>
      ) : null}
    </Box>
  );
}
