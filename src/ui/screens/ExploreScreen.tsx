import React from 'react';
import {Box, Text} from 'ink';
import type {Station, ThemeName} from '../../types.js';
import type {ExploreCursor} from '../app-state.js';
import {StationList} from '../components/StationList.js';
import {buildCosmoWorldMap, type CosmoMapCellKind, type CosmoMapRow} from '../cosmo-world-map.js';
import {panelBackground, panelBorder, themeAccent} from '../theme.js';

type ExploreScreenProps = {
  title: string;
  subtitle: string;
  stations: Station[];
  selected: number;
  loading: boolean;
  theme: ThemeName;
  favorites: Set<string>;
  filterLabel: string;
  cursor: ExploreCursor;
  pageSize: number;
  width: number;
  height: number;
};

export function ExploreScreen({
  title,
  subtitle,
  stations,
  selected,
  loading,
  theme,
  favorites,
  filterLabel,
  cursor,
  pageSize,
  width,
  height
}: ExploreScreenProps): React.ReactElement {
  const contentWidth = Math.max(52, width);
  const headerRows = 3;
  const bodyRows = Math.max(7, height - headerRows - 1);
  const split = contentWidth >= 104 && bodyRows >= 10;
  const listPanelWidth = split ? Math.max(50, Math.min(74, Math.floor(contentWidth * 0.35))) : contentWidth;
  const mapPanelWidth = split ? Math.max(48, contentWidth - listPanelWidth - 1) : contentWidth;
  const mapRows = split ? Math.max(8, bodyRows - 2) : Math.max(7, Math.min(14, Math.floor(bodyRows * 0.52)));
  const mapColumns = Math.max(40, mapPanelWidth - 2);
  const listRows = split ? bodyRows - 2 : Math.max(1, bodyRows - mapRows - 4);
  const listPageSize = Math.max(1, Math.min(pageSize, listRows - 3));
  const cursorMarker = React.useMemo(
    () => [{lat: cursor.latitude, lon: cursor.longitude, selected: true}],
    [cursor.latitude, cursor.longitude]
  );
  const map = React.useMemo(() => buildCosmoWorldMap(mapColumns, mapRows, cursorMarker), [mapColumns, mapRows, cursorMarker]);

  return (
    <Box flexDirection="column" height={height} width={contentWidth} overflow="hidden" flexShrink={0}>
      <Box height={headerRows} flexDirection="column" flexShrink={0}>
        <Text bold>{title}</Text>
        <Text color="gray">{subtitle}</Text>
        <Text color="gray">Filters: {filterLabel}</Text>
      </Box>
      <Box marginTop={1} height={bodyRows} width={contentWidth} flexDirection={split ? 'row' : 'column'} flexShrink={0}>
        <Box
          borderStyle="single"
          borderColor={panelBorder}
          borderBackgroundColor={panelBackground}
          backgroundColor={panelBackground}
          width={mapPanelWidth}
          height={split ? bodyRows : mapRows + 2}
          flexDirection="column"
        >
          {map.map((row, index) => (
            <CosmoMapLine key={`map-${index}`} row={row} theme={theme} />
          ))}
        </Box>
        <Box
          marginLeft={split ? 1 : 0}
          marginTop={split ? 0 : 1}
          borderStyle="single"
          borderColor={panelBorder}
          borderBackgroundColor={panelBackground}
          backgroundColor={panelBackground}
          width={listPanelWidth}
          height={split ? bodyRows : Math.max(5, listRows + 2)}
          flexDirection="column"
        >
          <Box justifyContent="space-between" width={Math.max(20, listPanelWidth - 2)}>
            <Text color={themeAccent(theme)} bold>
              Stations
            </Text>
            <Text color="gray">{stations.length.toLocaleString()}</Text>
          </Box>
          <Box height={1} flexShrink={0}>
            <Text color="gray">{loading ? 'Loading stations…' : ' '}</Text>
          </Box>
          {!loading ? (
            <StationList
              stations={stations}
              selected={selected}
              theme={theme}
              favorites={favorites}
              pageSize={listPageSize}
              width={Math.max(42, listPanelWidth - 2)}
            />
          ) : null}
        </Box>
      </Box>
    </Box>
  );
}

function CosmoMapLine({row, theme}: {row: CosmoMapRow; theme: ThemeName}): React.ReactElement {
  const chunks: Array<{kind: CosmoMapCellKind; text: string}> = [];
  for (const cell of row.cells) {
    const previous = chunks.at(-1);
    if (previous?.kind === cell.kind) {
      previous.text += cell.char;
    } else {
      chunks.push({kind: cell.kind, text: cell.char});
    }
  }

  let offset = 0;
  return (
    <Box>
      {chunks.map(chunk => {
        const key = `${offset}-${chunk.kind}`;
        offset += chunk.text.length;
        return (
          <Text key={key} color={cosmoMapColor(chunk.kind, theme)}>
            {chunk.text}
          </Text>
        );
      })}
    </Box>
  );
}

function cosmoMapColor(kind: CosmoMapCellKind, theme: ThemeName): string | undefined {
  if (kind === 'selected') {
    return themeAccent(theme);
  }

  if (kind === 'marker') {
    return '#7dd3fc';
  }

  if (kind === 'land') {
    return '#a0a0c0';
  }

  return undefined;
}
