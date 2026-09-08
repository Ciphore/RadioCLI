import React from 'react';
import {Box, Text} from 'ink';
import type {Station, ThemeName} from '../../types.js';
import type {ExploreCursor} from '../app-state.js';
import {formatExploreCursor} from '../app-state.js';
import {StationList} from '../components/StationList.js';
import {buildCosmoWorldMap, type CosmoMapCellKind, type CosmoMapRow} from '../cosmo-world-map.js';
import {computeExploreMapLayout} from '../explore-map-layout.js';
import {ScreenHeader} from '../components/ScreenHeader.js';
import {exploreMapLand, mapMarker, panelBorder, textMuted, themeAccent} from '../theme.js';
import {panelBorderStyle, useDisplay} from '../display-context.js';
import {toAsciiSafe} from '../ascii.js';
import {truncate} from '../format.js';

type ExploreScreenProps = {
  title: string;
  subtitle: string;
  stations: Station[];
  selected: number;
  loading: boolean;
  error?: string;
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
  error,
  theme,
  favorites,
  filterLabel,
  cursor,
  pageSize,
  width,
  height
}: ExploreScreenProps): React.ReactElement {
  const {panel: panelBackground, ascii} = useDisplay();
  const {contentWidth, headerRows, bodyRows, split, listPanelWidth, mapPanelWidth, mapRows, mapColumns, mapOffsetX, listRows, listPageSize} =
    computeExploreMapLayout(width, height, pageSize);
  const cursorMarker = React.useMemo(
    () => [{lat: cursor.latitude, lon: cursor.longitude, selected: true}],
    [cursor.latitude, cursor.longitude]
  );
  const map = React.useMemo(() => buildCosmoWorldMap(mapColumns, mapRows, cursorMarker), [mapColumns, mapRows, cursorMarker]);

  return (
    <Box flexDirection="column" height={height} width={contentWidth} overflow="hidden" flexShrink={0}>
      <Box height={headerRows} flexDirection="column" flexShrink={0}>
        <ScreenHeader
          title={title}
          subtitle={subtitle}
          width={contentWidth}
          theme={theme}
          right={filterLabel === 'none' ? undefined : `filters: ${filterLabel}`}
        />
      </Box>
      <Box marginTop={1} height={bodyRows} width={contentWidth} flexDirection={split ? 'row' : 'column'} flexShrink={0}>
        <Box
          borderStyle={panelBorderStyle(ascii, 'single')}
          borderColor={panelBorder}
          borderBackgroundColor={panelBackground}
          backgroundColor={panelBackground}
          width={mapPanelWidth}
          height={split ? bodyRows : mapRows + 2}
          flexDirection="column"
          aria-label={`World map cursor: ${formatExploreCursor(cursor)}`}
        >
          <Box marginLeft={mapOffsetX} flexDirection="column" flexShrink={0}>
            {map.map((row, index) => (
              <CosmoMapLine key={`map-${index}`} row={row} theme={theme} />
            ))}
          </Box>
        </Box>
        <Box
          marginLeft={split ? 1 : 0}
          marginTop={split ? 0 : 1}
          borderStyle={panelBorderStyle(ascii, 'single')}
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
            <Text color={textMuted}>{stations.length.toLocaleString()}</Text>
          </Box>
          <Box height={1} flexShrink={0}>
            <Text color={textMuted}>
              {loading
                ? (ascii ? toAsciiSafe('Loading stations…') : 'Loading stations…')
                : error
                  ? truncate(ascii ? toAsciiSafe(error) : error, Math.max(1, listPanelWidth - 2))
                  : ' '}
            </Text>
          </Box>
          {(!loading || stations.length > 0) && (stations.length > 0 || !error) ? <StationList
              stations={stations}
              selected={selected}
              theme={theme}
              favorites={favorites}
              pageSize={listPageSize}
              width={Math.max(1, listPanelWidth - 2)}
              showCount={false}
              emptyTitle="No stations near this point."
              emptyHint="Move the map cursor to explore another area."
            /> : null}
        </Box>
      </Box>
    </Box>
  );
}

function CosmoMapLine({row, theme}: {row: CosmoMapRow; theme: ThemeName}): React.ReactElement {
  const {ascii} = useDisplay();
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
            {ascii ? toAsciiSafe(chunk.text) : chunk.text}
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
    return mapMarker;
  }

  if (kind === 'land') {
    return exploreMapLand;
  }

  return undefined;
}
