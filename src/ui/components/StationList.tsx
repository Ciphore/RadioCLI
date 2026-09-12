import React from 'react';
import {Box, Text} from 'ink';
import type {Station, ThemeName} from '../../types.js';
import {stationLocation, stationTags, stationTech, truncate} from '../format.js';
import {textMuted, themeAccent} from '../theme.js';
import {Menu, Pointer} from './Menu.js';
import {visibleWindow} from '../list-window.js';
import {useDisplay} from '../display-context.js';
import {AdaptiveMarquee} from './AdaptiveMarquee.js';
import {toAsciiSafe} from '../ascii.js';

type StationListProps = {
  stations: Station[];
  selected: number;
  theme: ThemeName;
  favorites: Set<string>;
  pageSize: number;
  width: number;
  emptyTitle?: string;
  emptyHint?: string;
  showCount?: boolean;
};

export function StationList({
  stations,
  selected,
  theme,
  favorites,
  pageSize,
  width,
  emptyTitle = 'No stations found.',
  emptyHint = 'Try another view or clear active filters.',
  showCount = true
}: StationListProps): React.ReactElement {
  const {reduceMotion, ascii} = useDisplay();
  const a = (value: string): string => ascii ? toAsciiSafe(value) : value;
  if (stations.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color={textMuted}>{a(emptyTitle)}</Text>
        <Text color={textMuted}>{a(emptyHint)}</Text>
      </Box>
    );
  }

  const window = visibleWindow(stations, selected, pageSize);
  const rowWidth = Math.max(42, width - 4);
  const nameWidth = Math.min(48, Math.max(18, Math.floor(rowWidth * 0.42)));
  const metaWidth = Math.max(12, rowWidth - nameWidth - 6);

  return (
    <Box flexDirection="column">
      {showCount ? (
        <Text color={textMuted}>
          {window.start + 1}-{window.end} of {stations.length}
        </Text>
      ) : null}
      <Menu
        items={window.items}
        selected={selected - window.start}
        keyFor={station => `${station.provider}:${station.id}`}
        render={(station, _index, active) => {
          const favorite = favorites.has(`${station.provider}:${station.id}`);
          if (width < 42) {
            const compactNameWidth = Math.max(1, width - 2 - (favorite ? 2 : 0));
            return (
              <Box>
                <Pointer active={active} />
                <Text color={active ? themeAccent(theme) : undefined} bold={active}>
                  <AdaptiveMarquee
                    text={station.name}
                    width={compactNameWidth}
                    active={active}
                    reduceMotion={reduceMotion}
                  />
                </Text>
                {favorite ? <Text color="yellow" aria-label="Favorite">{a(' ★')}</Text> : null}
              </Box>
            );
          }
          const stationNameWidth = favorite ? Math.max(1, nameWidth - 2) : nameWidth;
          const titleWidth = nameWidth + 2;
          const standardMetadata = `${stationLocation(station)} · ${stationTech(station)}`;
          const selectedMetadata = station.tags.length > 0 ? stationTags(station) : standardMetadata;

          return (
            <Box>
              <Pointer active={active} />
              <Box width={titleWidth}>
                <Box width={stationNameWidth}>
                  <Text color={active ? themeAccent(theme) : undefined} bold={active}>
                    <AdaptiveMarquee text={station.name} width={stationNameWidth} active={active} reduceMotion={reduceMotion} />
                  </Text>
                </Box>
                {favorite ? <Text color="yellow" aria-label="Favorite">{a(' ★')}</Text> : null}
              </Box>
              <Text color={active ? themeAccent(theme) : textMuted}>
                {a(truncate(active ? selectedMetadata : standardMetadata, metaWidth))}
              </Text>
            </Box>
          );
        }}
      />
    </Box>
  );
}
