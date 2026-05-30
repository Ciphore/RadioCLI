import React from 'react';
import {Box, Text} from 'ink';
import type {Country, ThemeName} from '../../types.js';
import {mapLand, mapWater, themeAccent, themeContributionColors} from '../theme.js';
import {visibleWindow} from '../list-window.js';
import {Menu, Pointer} from '../components/Menu.js';
import {ScreenHeader} from '../components/ScreenHeader.js';
import {truncate} from '../format.js';
import {buildWorldMap, type MapCellKind, type MapRow} from '../world-map.js';

type MapScreenProps = {
  countries: Country[];
  selected: number;
  loading: boolean;
  filter: string;
  editingFilter: boolean;
  theme: ThemeName;
  pageSize: number;
  mode: 'compact' | 'full';
  width: number;
};

export function MapScreen({
  countries,
  selected,
  loading,
  filter,
  editingFilter,
  theme,
  pageSize,
  mode,
  width
}: MapScreenProps): React.ReactElement {
  const contentWidth = Math.max(52, width - 2);
  const topCountries = Array.from(countries).sort((a, b) => b.stationCount - a.stationCount).slice(0, mode === 'full' ? 10 : 6);
  const selectedCountry = countries[selected];
  const window = visibleWindow(countries, selected, pageSize);
  const graph = buildWorldMap(countries, selectedCountry, mode, contentWidth);
  const topWidth = mode === 'full' ? 50 : contentWidth;
  const listWidth = Math.max(28, Math.min(contentWidth - topWidth - 4, 56));

  return (
    <Box flexDirection="column">
      <ScreenHeader
        title="World map"
        subtitle={editingFilter ? 'Filtering country list — type to narrow' : 'Station density by country'}
        width={contentWidth}
        theme={theme}
        right={`filter: ${filter || 'all'}`}
      />
      {loading ? <Text color="gray">Loading country density…</Text> : null}
      <Box marginTop={1} flexDirection="column">
        {graph.rows.map(row => (
          <MapLine key={row.cells.map(cell => cell.char).join('')} row={row} theme={theme} />
        ))}
      </Box>
      <Text color="gray">
        {graph.plotted} plotted · {graph.unplotted} unplaced · labels show highest station counts
      </Text>
      <Box marginTop={1} flexDirection={mode === 'full' ? 'row' : 'column'}>
        <Box width={topWidth} flexDirection="column">
          <Text color="gray">Highest station counts</Text>
          {topCountries.map(country => (
            <Text key={country.code}>
              <Text color={themeAccent(theme)}>{country.code.padEnd(3)}</Text>
              <Text>{truncate(country.name, 30).padEnd(31)}</Text>
              <Text color="gray">{country.stationCount.toLocaleString().padStart(7)}</Text>
            </Text>
          ))}
        </Box>
        <Box marginLeft={mode === 'full' ? 3 : 0} marginTop={mode === 'full' ? 0 : 1} width={listWidth} flexDirection="column">
          <Text>
            Selected:{' '}
            <Text color={themeAccent(theme)}>
              {selectedCountry ? `${selectedCountry.name} · ${selectedCountry.stationCount.toLocaleString()}` : 'none'}
            </Text>
          </Text>
          <Menu
            items={window.items}
            selected={selected - window.start}
            keyFor={country => country.code}
            render={(country, _index, active) => (
              <Box>
                <Pointer active={active} />
                <Text color={active ? themeAccent(theme) : undefined} bold={active}>
                  {country.code}
                </Text>
                <Text color="gray"> · {truncate(country.name, Math.max(8, listWidth - 8))}</Text>
              </Box>
            )}
          />
        </Box>
      </Box>
    </Box>
  );
}

function MapLine({row, theme}: {row: MapRow; theme: ThemeName}): React.ReactElement {
  const chunks: Array<{kind: MapCellKind; text: string}> = [];
  for (const cell of row.cells) {
    const previous = chunks[chunks.length - 1];
    if (previous && previous.kind === cell.kind) {
      previous.text += cell.char;
    } else {
      chunks.push({kind: cell.kind, text: cell.char});
    }
  }
  const keyedChunks: Array<{key: string; kind: MapCellKind; text: string}> = [];
  let offset = 0;
  for (const chunk of chunks) {
    keyedChunks.push({key: `${offset}-${chunk.kind}`, ...chunk});
    offset += chunk.text.length;
  }

  return (
    <Box>
      {keyedChunks.map(chunk => (
        <Text key={chunk.key} color={mapColor(chunk.kind, theme)}>
          {chunk.text}
        </Text>
      ))}
    </Box>
  );
}

function mapColor(kind: MapCellKind, theme: ThemeName): string {
  const colors = themeContributionColors(theme);
  if (kind === 'selected') {
    return themeAccent(theme);
  }

  if (kind === 'level4') {
    return colors[4] ?? themeAccent(theme);
  }

  if (kind === 'level3') {
    return colors[3] ?? themeAccent(theme);
  }

  if (kind === 'level2') {
    return colors[2] ?? themeAccent(theme);
  }

  if (kind === 'level1') {
    return colors[1] ?? 'gray';
  }

  if (kind === 'land') {
    return mapLand;
  }

  return mapWater;
}
