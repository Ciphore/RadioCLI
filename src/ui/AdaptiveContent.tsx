import React from 'react';
import {Box, Text} from 'ink';
import type {
  AirPlayDevice,
  Country,
  IcyNowPlaying,
  LibraryState,
  PlaybackDiagnostics,
  PlaybackState,
  Screen,
  Station,
  ThemeName,
  UpdateCheckState
} from '../types.js';
import {computeListeningStats} from '../activity/stats.js';
import {playbackBackendLabel} from '../player/backend-install.js';
import {visibleWindow} from './list-window.js';
import {displayWidth, padDisplayEnd, stationLocation, stationTags, stationTech, truncate} from './format.js';
import {homeItems, settingsGroup, settingsGroups, settingsItemsForPage, type SettingsPage} from './screen-items.js';
import {screenTitle} from './screen-meta.js';
import {keyHelpSections, commandHelp} from './help-content.js';
import {settingLabel, settingValue} from './screens/SettingsScreen.js';
import {exploreMapLand, mapMarker, panelBorder, textDim, textMuted, themeAccent} from './theme.js';
import {panelBorderStyle, useDisplay} from './display-context.js';
import {toAsciiSafe} from './ascii.js';
import {buildVisualizer, visualizerHeight} from './visualizers/receiver-visualizers.js';
import {Logo} from './components/Logo.js';
import {useReceiverPulse} from './receiver-animation.js';
import type {ExploreCursor} from './app-state.js';
import {formatExploreCursor} from './app-state.js';
import {buildCosmoWorldMap, type CosmoMapCellKind, type CosmoMapRow} from './cosmo-world-map.js';
import {adaptiveExploreFrameMetrics, computeAdaptiveExploreLayout} from './adaptive-explore-layout.js';
import {AdaptiveMarquee} from './components/AdaptiveMarquee.js';

type AdaptiveContentProps = {
  mode: 'compact' | 'micro';
  screen: Screen;
  settingsPage?: SettingsPage;
  selected: number;
  height: number;
  width: number;
  theme: ThemeName;
  playback: PlaybackState;
  playingStation: Station | null;
  nowPlaying: IcyNowPlaying | null;
  stations: Station[];
  countries: Country[];
  airPlayDevices: AirPlayDevice[];
  airPlayCode: string;
  searchQuery: string;
  editingSearch: boolean;
  countryFilter: string;
  editingCountryFilter: boolean;
  loadingCountries: boolean;
  loadingStations: boolean;
  exploreCursor: ExploreCursor;
  library: LibraryState;
  diagnostics: PlaybackDiagnostics;
  backends: string[];
  updateCheck?: UpdateCheckState;
  appVersion?: string;
  favoriteKeys: Set<string>;
  stationTitle: string;
  stationError?: string;
  filterLabel: string;
  sleepLabel: string;
};

type AdaptiveRow = {
  key: string;
  label: string;
  detail?: string;
  index?: number;
  heading?: boolean;
  separator?: string;
  marquee?: boolean;
  favoriteGlyph?: string;
};

export function AdaptiveContent(props: AdaptiveContentProps): React.ReactElement {
  return <AdaptiveContentBody {...props} />;
}

function AdaptiveContentBody(props: AdaptiveContentProps): React.ReactElement {
  const {
    mode,
    screen,
    settingsPage = 'root',
    selected,
    height,
    width,
    theme,
    playback,
    playingStation,
    nowPlaying,
    stations,
    countries,
    airPlayDevices,
    airPlayCode,
    searchQuery,
    editingSearch,
    countryFilter,
    loadingCountries,
    loadingStations,
    exploreCursor,
    library,
    diagnostics,
    backends,
    updateCheck,
    appVersion,
    favoriteKeys,
    stationTitle,
  } = props;
  const accent = themeAccent(theme);
  const {ascii, reduceMotion} = useDisplay();
  const {bodyRows} = adaptiveFrameMetrics(mode, height);
  const title = screenTitle(screen);
  const status = adaptiveStatus(props);

  if (screen === 'home') {
    return (
      <AdaptiveHome
        mode={mode}
        selected={selected}
        height={height}
        width={width}
        theme={theme}
        library={library}
      />
    );
  }

  if (screen === 'now-playing') {
    return (
      <AdaptiveNowPlaying
        mode={mode}
        station={playingStation}
        playback={playback}
        metadata={nowPlaying}
        width={width}
        height={height}
        ascii={ascii}
        theme={theme}
        receiverStyle={library.settings.receiverStyle}
        reduceMotion={reduceMotion}
      />
    );
  }

  if (screen === 'explore') {
    return (
      <AdaptiveExplore
        mode={mode}
        width={width}
        height={height}
        theme={theme}
        stations={stations}
        selected={selected}
        favorites={favoriteKeys}
        cursor={exploreCursor}
        loading={loadingStations}
        error={props.stationError}
        ascii={ascii}
        reduceMotion={reduceMotion}
      />
    );
  }

  if (screen === 'search') {
    const rows = adaptiveRows({
      screen,
      settingsPage,
      stations,
      countries,
      airPlayDevices,
      library,
      diagnostics,
      backends,
      updateCheck,
      appVersion,
      favoriteKeys,
      selected,
      width,
      mode,
      ascii
    });
    const empty = adaptiveEmptyState({
      screen,
      searchQuery,
      editingSearch,
      countryFilter,
      loadingCountries,
      loadingStations,
      nearbyEnabled: library.settings.enableNearbyLocation,
      stationTitle,
      stationError: props.stationError
    });
    return (
      <AdaptiveSearch
        mode={mode}
        query={searchQuery}
        editing={editingSearch}
        loading={loadingStations}
        rows={rows}
        empty={empty}
        selected={selected}
        height={height}
        width={width}
        theme={theme}
        ascii={ascii}
        reduceMotion={reduceMotion}
      />
    );
  }

  if (screen === 'stats') {
    const stats = computeListeningStats(library.activity.sessions);
    const activityWidth = Math.max(4, Math.min(28, width - 2));
    const recentDays = stats.days.slice(-activityWidth);
    const activity = recentDays.map(day => day.seconds > 0 ? (ascii ? '#' : '■') : (ascii ? '.' : '·')).join('');
    const rows: AdaptiveRow[] = [
      {key: 'time', label: 'Listening', detail: formatHours(stats.totalSeconds / 3600)},
      {key: 'favorite', label: 'Favorite', detail: stats.favoriteStation?.name ?? 'None yet'},
      {key: 'sessions', label: 'Sessions', detail: stats.sessions.toLocaleString()},
      {key: 'stations', label: 'Stations (2+ min)', detail: stats.listenedStationCount.toLocaleString()},
      {key: 'streak', label: 'Streak', detail: `${stats.currentStreak} current · ${stats.longestStreak} best`},
      {key: 'activity', label: activity, detail: `${stats.activeDays} active days`}
    ];
    return (
      <AdaptiveFrame title={title} status={status} mode={mode} height={height} width={width} theme={theme}>
        <StaticRows rows={rows.slice(0, bodyRows)} width={width} theme={theme} />
      </AdaptiveFrame>
    );
  }

  if (screen === 'airplay-code') {
    const prompt = airPlayCode ? `Code: ${airPlayCode}` : 'Type the code shown by the receiver.';
    return (
      <AdaptiveFrame title={title} status={status} mode={mode} height={height} width={width} theme={theme}>
        {bodyRows > 0 ? <Text color={airPlayCode ? accent : textMuted}>{ascii ? toAsciiSafe(truncate(prompt, width)) : truncate(prompt, width)}</Text> : null}
      </AdaptiveFrame>
    );
  }

  const rows = adaptiveRows({
    screen,
    settingsPage,
    stations,
    countries,
    airPlayDevices,
    library,
    diagnostics,
    backends,
    updateCheck,
    appVersion,
    favoriteKeys,
    selected,
    width,
    mode,
    ascii
  });
  const empty = adaptiveEmptyState({
    screen,
    searchQuery,
    editingSearch,
    countryFilter,
    loadingCountries,
    loadingStations,
    nearbyEnabled: library.settings.enableNearbyLocation,
    stationTitle,
    stationError: props.stationError
  });

  return (
    <AdaptiveFrame title={title} status={status} mode={mode} height={height} width={width} theme={theme}>
      {rows.length > 0 ? (
        <AdaptiveList
          rows={rows}
          selected={selected}
          pageSize={bodyRows}
          width={width}
          theme={theme}
          reduceMotion={reduceMotion}
        />
      ) : (
        <StaticRows rows={empty.slice(0, bodyRows)} width={width} theme={theme} />
      )}
    </AdaptiveFrame>
  );
}

function AdaptiveExplore({
  mode,
  width,
  height,
  theme,
  stations,
  selected,
  favorites,
  cursor,
  loading,
  error,
  ascii,
  reduceMotion
}: {
  mode: 'compact' | 'micro';
  width: number;
  height: number;
  theme: ThemeName;
  stations: Station[];
  selected: number;
  favorites: Set<string>;
  cursor: ExploreCursor;
  loading: boolean;
  error?: string;
  ascii: boolean;
  reduceMotion: boolean;
}): React.ReactElement {
  const accent = themeAccent(theme);
  const {headerRows, headerGap, bodyRows} = adaptiveExploreFrameMetrics(mode, height);
  const a = (value: string): string => ascii ? toAsciiSafe(value) : value;
  const layout = computeAdaptiveExploreLayout(mode, width, Math.max(1, bodyRows));
  const marker = React.useMemo(
    () => [{lat: cursor.latitude, lon: cursor.longitude, selected: true}],
    [cursor.latitude, cursor.longitude]
  );
  const map = React.useMemo(
    () => buildCosmoWorldMap(layout.mapColumns, layout.mapRows, marker),
    [layout.mapColumns, layout.mapRows, marker]
  );
  const coordinate = formatExploreCursor(cursor);
  const status = `${coordinate} · ${loading ? 'loading' : `${stations.length.toLocaleString()} stations`}`;
  const title = mode === 'micro' ? `RC / Explore · ${coordinate}` : 'RADIOCLI  Explore';
  const stationRows = stationAdaptiveRows(stations, favorites, selected, layout.listWidth, ascii);
  const emptyRows: AdaptiveRow[] = loading
    ? [{key: 'loading', label: 'Loading stations…'}]
    : error
      ? [{key: 'error', label: error}]
      : [{key: 'empty', label: 'No stations near this point.'}];
  const list = (
    <AdaptiveList
      rows={stationRows.length > 0 ? stationRows : emptyRows}
      selected={stationRows.length > 0 ? selected : 0}
      pageSize={layout.listRows}
      width={layout.listWidth}
      theme={theme}
      reduceMotion={reduceMotion}
    />
  );

  return (
    <Box flexDirection="column" height={height} width={width} overflow="hidden">
      <Text color={accent} bold aria-label={title}>{a(truncate(title, width))}</Text>
      {headerRows > 1 ? <Text color={textMuted} aria-label={status}>{a(truncate(status, width))}</Text> : null}
      {headerGap ? <Box height={headerGap} flexShrink={0} /> : null}
      {bodyRows > 0 ? layout.split ? (
        <Box flexDirection="row" height={bodyRows} width={width} overflow="hidden">
          <AdaptiveCosmoMap
            rows={map}
            width={layout.mapAreaWidth}
            height={layout.mapRows}
            offsetX={layout.mapOffsetX}
            theme={theme}
            ascii={ascii}
          />
          {layout.gap ? <Box width={layout.gap} flexShrink={0} /> : null}
          <Box flexDirection="column" width={layout.listWidth} height={layout.listRows} overflow="hidden">
            {list}
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" height={bodyRows} width={width} overflow="hidden">
          <AdaptiveCosmoMap
            rows={map}
            width={layout.mapAreaWidth}
            height={layout.mapRows}
            offsetX={layout.mapOffsetX}
            theme={theme}
            ascii={ascii}
          />
          {layout.gap ? <Box height={layout.gap} flexShrink={0} /> : null}
          <Box flexDirection="column" height={layout.listRows} width={layout.listWidth} overflow="hidden">
            {list}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}

function AdaptiveCosmoMap({
  rows,
  width,
  height,
  offsetX,
  theme,
  ascii
}: {
  rows: CosmoMapRow[];
  width: number;
  height: number;
  offsetX: number;
  theme: ThemeName;
  ascii: boolean;
}): React.ReactElement {
  return (
    <Box flexDirection="column" width={width} height={height} overflow="hidden" flexShrink={0} aria-hidden>
      {rows.map((row, rowIndex) => {
        const chunks: Array<{kind: CosmoMapCellKind; text: string}> = [];
        for (const cell of row.cells) {
          const previous = chunks.at(-1);
          if (previous?.kind === cell.kind) previous.text += cell.char;
          else chunks.push({kind: cell.kind, text: cell.char});
        }
        let cellOffset = 0;
        return (
          <Box key={rowIndex} marginLeft={offsetX}>
            {chunks.map(chunk => {
              const key = `${cellOffset}-${chunk.kind}`;
              cellOffset += chunk.text.length;
              return (
                <Text key={key} color={adaptiveMapColor(chunk.kind, theme)}>
                  {ascii ? toAsciiSafe(chunk.text) : chunk.text}
                </Text>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
}

function adaptiveMapColor(kind: CosmoMapCellKind, theme: ThemeName): string | undefined {
  if (kind === 'selected') return themeAccent(theme);
  if (kind === 'marker') return mapMarker;
  if (kind === 'land') return exploreMapLand;
  return undefined;
}

function AdaptiveFrame({
  title,
  status,
  mode,
  height,
  width,
  theme,
  children
}: {
  title: string;
  status: string;
  mode: 'compact' | 'micro';
  height: number;
  width: number;
  theme: ThemeName;
  children: React.ReactNode;
}): React.ReactElement {
  const accent = themeAccent(theme);
  const {ascii} = useDisplay();
  const a = (value: string): string => ascii ? toAsciiSafe(value) : value;
  const titlePrefix = mode === 'micro' ? 'RC / ' : 'RADIOCLI  ';
  const titleText = truncate(`${titlePrefix}${title}${mode === 'micro' && status ? ` · ${status}` : ''}`, width);
  const ruleWidth = Math.max(0, width - displayWidth(titleText) - 1);
  const {bodyRows, gapRows} = adaptiveFrameMetrics(mode, height);

  return (
    <Box flexDirection="column" height={height} width={width} overflow="hidden">
      <Text color={accent} bold aria-label={`${titlePrefix}${title}${status ? `. ${status}` : ''}`}>
        {a(titleText)}<Text color={textDim} aria-hidden>{ruleWidth ? ` ${(ascii ? '-' : '─').repeat(ruleWidth)}` : ''}</Text>
      </Text>
      {mode === 'compact' && height >= 4 ? <Text color={textMuted} aria-label={status}>{a(truncate(status, width))}</Text> : null}
      {gapRows ? <Box height={gapRows} flexShrink={0} /> : null}
      <Box flexDirection="column" height={bodyRows} overflow="hidden" flexShrink={0}>
        {children}
      </Box>
      {gapRows ? <Box height={gapRows} flexShrink={0} /> : null}
    </Box>
  );
}

function adaptiveFrameMetrics(mode: 'compact' | 'micro', height: number): {bodyRows: number; gapRows: number} {
  const headerRows = mode === 'compact' && height >= 4 ? 2 : 1;
  const gapRows = height >= 5 ? 1 : 0;
  return {
    bodyRows: Math.max(0, height - headerRows - gapRows * 2),
    gapRows
  };
}

function AdaptiveHome({
  mode,
  selected,
  height,
  width,
  theme,
  library
}: {
  mode: 'compact' | 'micro';
  selected: number;
  height: number;
  width: number;
  theme: ThemeName;
  library: LibraryState;
}): React.ReactElement {
  const gapRows = height >= 5 ? 1 : 0;
  const {ascii} = useDisplay();
  const a = (value: string): string => ascii ? toAsciiSafe(value) : value;
  const showSummary = mode === 'compact' && height >= 10;
  const menuRows = Math.max(1, height - 1 - gapRows * 2 - (showSummary ? 1 : 0));
  const selectedIndex = Math.min(Math.max(selected, 0), homeItems.length - 1);
  const window = visibleWindow(homeItems, selectedIndex, menuRows);
  const accent = themeAccent(theme);

  return (
    <Box flexDirection="column" height={height} width={width} overflow="hidden">
      <Logo compact width={width} />
      {gapRows ? <Box height={gapRows} flexShrink={0} /> : null}
      <Box flexDirection="column" height={menuRows} overflow="hidden" flexShrink={0}>
        {window.items.map((item, offset) => {
          const absoluteIndex = window.start + offset;
          const active = absoluteIndex === selectedIndex;
          const detail = mode === 'compact' && width >= 52 ? ` · ${item.detail}` : '';
          return (
            <Text key={item.screen} color={active ? accent : undefined} bold={active} aria-label={`${active ? 'Selected: ' : ''}${absoluteIndex + 1}. ${item.label}. ${item.detail}`}>
              {active ? '> ' : '  '}{absoluteIndex + 1} {a(truncate(`${item.label}${detail}`, Math.max(1, width - 4)))}
            </Text>
          );
        })}
      </Box>
      {showSummary ? (
        <Text color={textMuted}>
          {a(truncate(`${library.recent.length} recent · ${library.favorites.length} favorites · ${library.imported.length} imported`, width))}
        </Text>
      ) : null}
      {gapRows ? <Box height={gapRows} flexShrink={0} /> : null}
    </Box>
  );
}

function AdaptiveList({
  rows,
  selected,
  pageSize,
  width,
  theme,
  reduceMotion
}: {
  rows: AdaptiveRow[];
  selected: number;
  pageSize: number;
  width: number;
  theme: ThemeName;
  reduceMotion: boolean;
}): React.ReactElement {
  const selectedIndex = Math.min(Math.max(selected, 0), Math.max(0, rows.length - 1));
  const window = visibleWindow(rows, selectedIndex, Math.max(1, pageSize));
  const accent = themeAccent(theme);

  return (
    <Box flexDirection="column">
      {window.items.map((row, offset) => {
        const absoluteIndex = window.start + offset;
        const active = absoluteIndex === selectedIndex && !row.heading;
        const prefix = row.heading ? '  ' : active ? '> ' : '  ';
        const detail = row.detail ? `${row.separator ?? ' · '}${row.detail}` : '';
        const text = `${row.label}${detail}`;
        const favoriteWidth = row.favoriteGlyph ? 2 : 0;
        return (
          <Text key={row.key} color={active ? accent : row.heading ? textMuted : undefined} bold={active || row.heading} aria-label={`${active ? 'Selected: ' : ''}${text}${row.favoriteGlyph ? '. Favorite' : ''}`}>
            {prefix}<AdaptiveMarquee
              text={text}
              width={Math.max(0, width - 2 - favoriteWidth)}
              active={active && Boolean(row.marquee)}
              reduceMotion={reduceMotion}
            />{row.favoriteGlyph ? <Text color="yellow"> {row.favoriteGlyph}</Text> : null}
          </Text>
        );
      })}
    </Box>
  );
}

function StaticRows({rows, width, theme}: {rows: AdaptiveRow[]; width: number; theme: ThemeName}): React.ReactElement {
  const accent = themeAccent(theme);
  const {ascii} = useDisplay();
  return (
    <Box flexDirection="column">
      {rows.map(row => (
        <Text key={row.key} color={row.heading ? textMuted : undefined} bold={row.heading} aria-label={row.detail ? `${row.label}: ${row.detail}` : row.label}>
          {ascii ? toAsciiSafe(truncate(row.detail ? `${row.label} · ${row.detail}` : row.label, width)) : truncate(row.detail ? `${row.label} · ${row.detail}` : row.label, width)}
          {row.key === 'activity' ? <Text color={accent} /> : null}
        </Text>
      ))}
    </Box>
  );
}

function AdaptiveNowPlaying({
  mode,
  station,
  playback,
  metadata,
  width,
  height,
  ascii,
  theme,
  receiverStyle,
  reduceMotion
}: {
  mode: 'compact' | 'micro';
  station: Station | null;
  playback: PlaybackState;
  metadata: IcyNowPlaying | null;
  width: number;
  height: number;
  ascii: boolean;
  theme: ThemeName;
  receiverStyle: LibraryState['settings']['receiverStyle'];
  reduceMotion: boolean;
}): React.ReactElement {
  const pulse = useReceiverPulse();
  const {screenReader} = useDisplay();
  const accent = themeAccent(theme);
  const stationName = station?.name ?? 'No station tuned';
  const showMetadata = Boolean(metadata?.title) && (screenReader || mode === 'compact' && height >= 9);
  const headerRows = mode === 'compact' ? 2 : 1;
  const metadataRows = showMetadata ? 1 : 0;
  const gapRows = height >= 5 ? 1 : 0;
  const availableVisualRows = Math.max(1, height - headerRows - metadataRows - gapRows * 2);
  const visualHeight = visualizerHeight(receiverStyle, availableVisualRows, width);
  const visualRows = screenReader ? [] : buildVisualizer(
    receiverStyle,
    pulse,
    width,
    visualHeight,
    station,
    playback,
    theme,
    mode === 'micro' ? 'micro' : 'standard'
  );
  const header = mode === 'micro'
    ? `${stationName} · ${playback.state}`
    : 'RADIOCLI  Now playing';
  const status = `${stationName}  ${playback.state}${playback.muted ? ' · muted' : ` · vol ${playback.volume}`}`;

  return (
    <Box flexDirection="column" height={height} width={width} overflow="hidden">
      <Text color={accent} bold aria-label={mode === 'micro' ? `Now playing. Station: ${stationName}. Playback: ${playback.state}, ${playback.muted ? 'muted' : `volume ${playback.volume}`}` : undefined}>
        {mode === 'micro'
          ? <AdaptiveMarquee text={header} width={width} active reduceMotion={reduceMotion} />
          : truncate(header, width)}
      </Text>
      {mode === 'compact' ? <Text color={textMuted} aria-label={`Station: ${stationName}. Playback: ${playback.state}, ${playback.muted ? 'muted' : `volume ${playback.volume}`}`}>{ascii ? toAsciiSafe(truncate(status, width)) : truncate(status, width)}</Text> : null}
      {gapRows ? <Box height={gapRows} flexShrink={0} /> : null}
      {!screenReader ? <Box flexDirection="column" height={availableVisualRows} overflow="hidden" aria-hidden>
        {visualRows.map((row, index) => (
          <Text key={index} color={row.segments ? undefined : row.color}>
            {row.segments
              ? renderAdaptiveSegments(row.segments, ascii)
              : ascii
                ? toAsciiSafe(row.text)
                : row.text}
          </Text>
        ))}
      </Box> : null}
      {showMetadata ? (
        <Text color={accent} aria-label={`Track: ${metadata?.title ?? ''}`}>
          <AdaptiveMarquee text={metadata?.title ?? ''} width={width} active reduceMotion={reduceMotion} />
        </Text>
      ) : null}
      {gapRows ? <Box height={gapRows} flexShrink={0} /> : null}
    </Box>
  );
}

function renderAdaptiveSegments(
  segments: Array<{text: string; color: string; backgroundColor?: string; bold?: boolean}>,
  ascii: boolean
): React.ReactNode {
  let offset = 0;
  return segments.map(segment => {
    const key = offset;
    offset += segment.text.length;
    return (
      <Text key={key} color={segment.color} backgroundColor={segment.backgroundColor} bold={segment.bold}>
        {ascii ? toAsciiSafe(segment.text) : segment.text}
      </Text>
    );
  });
}

function AdaptiveSearch({
  mode,
  query,
  editing,
  loading,
  rows,
  empty,
  selected,
  height,
  width,
  theme,
  ascii,
  reduceMotion
}: {
  mode: 'compact' | 'micro';
  query: string;
  editing: boolean;
  loading: boolean;
  rows: AdaptiveRow[];
  empty: AdaptiveRow[];
  selected: number;
  height: number;
  width: number;
  theme: ThemeName;
  ascii: boolean;
  reduceMotion: boolean;
}): React.ReactElement {
  const accent = themeAccent(theme);
  const {panel: panelBackground} = useDisplay();
  const a = (value: string): string => ascii ? toAsciiSafe(value) : value;
  const fieldText = query || 'station, genre, or place';
  const prefix = loading ? (ascii ? '* ' : '⣾ ') : editing ? '› ' : '/ ';
  const fieldRows = height >= 4 ? 3 : 1;
  const gapRows = height >= 6 ? 1 : 0;
  const listRows = Math.max(0, height - 1 - fieldRows - gapRows * 2);
  return (
    <Box flexDirection="column" height={height} width={width} overflow="hidden">
      <Text color={accent} bold>{mode === 'micro' ? 'SEARCH' : 'RADIOCLI  Search'}</Text>
      {fieldRows === 3 ? (
        <Box
          borderStyle={panelBorderStyle(ascii, 'single')}
          borderColor={editing || loading ? accent : panelBorder}
          borderBackgroundColor={panelBackground}
          backgroundColor={panelBackground}
          width={width}
          height={3}
          flexShrink={0}
        >
          <Text color={editing || loading ? accent : textMuted}>{a(prefix)}</Text>
          <Text color={query ? accent : textMuted}>{a(truncate(fieldText, Math.max(1, width - 5)))}</Text>
        </Box>
      ) : (
        <Text color={query ? accent : textMuted}>{a(truncate(`[${prefix}${fieldText}]`, width))}</Text>
      )}
      {gapRows ? <Box height={gapRows} flexShrink={0} /> : null}
      <Box flexDirection="column" height={listRows} overflow="hidden" flexShrink={0}>
        {rows.length > 0 ? (
          <AdaptiveList
            rows={rows}
            selected={selected}
            pageSize={listRows}
            width={width}
            theme={theme}
            reduceMotion={reduceMotion}
          />
        ) : (
          <StaticRows rows={empty.slice(0, listRows)} width={width} theme={theme} />
        )}
      </Box>
      {gapRows ? <Box height={gapRows} flexShrink={0} /> : null}
    </Box>
  );
}

function adaptiveRows(input: {
  screen: Screen;
  settingsPage: SettingsPage;
  stations: Station[];
  countries: Country[];
  airPlayDevices: AirPlayDevice[];
  library: LibraryState;
  diagnostics: PlaybackDiagnostics;
  backends: string[];
  updateCheck?: UpdateCheckState;
  appVersion?: string;
  favoriteKeys: Set<string>;
  selected: number;
  width: number;
  mode: 'compact' | 'micro';
  ascii: boolean;
}): AdaptiveRow[] {
  const {screen, stations, countries, airPlayDevices, library, diagnostics, backends, updateCheck, favoriteKeys, selected, width, mode, ascii} = input;
  if (screen === 'home') {
    return homeItems.map(item => ({
      key: item.screen,
      label: item.label,
      detail: mode === 'compact' && width >= 52 ? item.detail : undefined,
      separator: '   '
    }));
  }
  if (screen === 'settings') {
    const pageItems = settingsItemsForPage(input.settingsPage);
    const labels = pageItems.map(item => settingLabel(item, updateCheck, input.appVersion));
    const labelWidth = pairedColumnWidth(labels, width, mode);
    return pageItems.map((item, index) => ({
      key: item,
      label: padDisplayEnd(truncate(settingLabel(item, updateCheck, input.appVersion), labelWidth), labelWidth),
      detail: input.settingsPage === 'root'
        ? adaptiveSettingsRootValue(item)
        : settingValue(item, library.settings, diagnostics, backends, airPlayDevices, updateCheck, input.appVersion),
      separator: '   ',
      index
    }));
  }
  if (screen === 'countries' || screen === 'map') {
    const labels = countries.map(country => `${country.name} (${country.code})`);
    const labelWidth = pairedColumnWidth(labels, width, mode);
    return countries.map((country, index) => ({
      key: country.code,
      label: padDisplayEnd(truncate(`${country.name} (${country.code})`, labelWidth), labelWidth),
      detail: country.stationCount.toLocaleString(),
      separator: '  ',
      marquee: true,
      index
    }));
  }
  if (screen === 'airplay-settings') {
    return airPlayDevices.map((device, index) => ({key: device.id, label: device.name, detail: device.host, index}));
  }
  if (screen === 'help') {
    const rows: AdaptiveRow[] = [];
    let index = 0;
    for (const section of keyHelpSections) {
      rows.push({key: `section-${section.title}`, label: section.title, heading: true});
      for (const entry of section.entries) {
        rows.push({key: `help-${index}`, label: entry.keys, detail: entry.description, index});
        index += 1;
      }
    }
    rows.push({key: 'section-commands', label: 'Commands', heading: true});
    for (const command of commandHelp) {
      rows.push({key: `command-${command.name}`, label: `:${command.name}${command.args ? ` ${command.args}` : ''}`, detail: command.description, index});
      index += 1;
    }
    return rows;
  }
  return stationAdaptiveRows(stations, favoriteKeys, selected, width, ascii);
}

function adaptiveSettingsRootValue(item: string): string | undefined {
  const group = settingsGroups.find(candidate => candidate.label === item);
  return group ? `${group.items.length} settings ›` : undefined;
}

function stationAdaptiveRows(
  stations: Station[],
  favoriteKeys: Set<string>,
  selected: number,
  width: number,
  ascii: boolean
): AdaptiveRow[] {
  return stations.map((station, index) => {
    const favorite = favoriteKeys.has(`${station.provider}:${station.id}`);
    const standardMetadata = `${stationLocation(station)} · ${stationTech(station)}`;
    const selectedMetadata = station.tags.length > 0 ? stationTags(station) : standardMetadata;
    return {
      key: `${station.provider}:${station.id}`,
      label: station.name,
      detail: index === selected ? selectedMetadata : width >= 42 ? standardMetadata : undefined,
      marquee: true,
      favoriteGlyph: favorite ? (ascii ? '*' : '★') : undefined,
      index
    };
  });
}

function pairedColumnWidth(labels: string[], width: number, mode: 'compact' | 'micro'): number {
  const longest = Math.max(8, ...labels.map(displayWidth));
  const available = Math.max(8, width - 4);
  const cap = Math.max(8, Math.floor(available * (mode === 'micro' ? 0.5 : 0.52)));
  return Math.min(longest, cap);
}

function adaptiveEmptyState(input: {
  screen: Screen;
  searchQuery: string;
  editingSearch: boolean;
  countryFilter: string;
  loadingCountries: boolean;
  loadingStations: boolean;
  nearbyEnabled: boolean;
  stationTitle: string;
  stationError?: string;
}): AdaptiveRow[] {
  const {screen, searchQuery, editingSearch, countryFilter, loadingCountries, loadingStations, nearbyEnabled, stationTitle, stationError} = input;
  if ((screen === 'countries' || screen === 'map') && loadingCountries) {
    return [{key: 'loading', label: 'Loading countries…'}];
  }
  if ((screen === 'countries' || screen === 'map') && countryFilter) {
    return [{key: 'empty', label: `No countries match “${countryFilter}”.`}, {key: 'hint', label: 'Press / to edit the filter.'}];
  }
  if (screen === 'search' && loadingStations) {
    return [{key: 'loading', label: 'Searching station directories…'}];
  }
  if (screen === 'search' && !searchQuery) {
    return [
      {key: 'empty', label: editingSearch ? 'Type a station, genre, or place.' : 'Press / to start a search.'},
      {key: 'hint', label: 'Enter searches · Ctrl+↑ recalls history'}
    ];
  }
  if (screen === 'search') {
    return [{key: 'empty', label: `No matches for “${searchQuery}”.`}, {key: 'hint', label: 'Try fewer words or clear filters.'}];
  }
  if (screen === 'nearby' && !nearbyEnabled) {
    return [{key: 'empty', label: 'Nearby lookup is off.'}, {key: 'hint', label: 'Press l to enable it.'}];
  }
  if (screen === 'library') {
    return [{key: 'empty', label: 'Your library is empty.'}, {key: 'hint', label: 'Press f on a station to save it.'}];
  }
  if (loadingStations) {
    return [{key: 'loading', label: 'Loading stations…'}];
  }
  if (stationError) {
    return [{key: 'error', label: stationError}, {key: 'hint', label: 'Try again later or reopen this view.'}];
  }
  if (screen === 'airplay-settings') {
    return [{key: 'empty', label: 'No AirPlay receivers found.'}, {key: 'hint', label: 'Press r to scan again.'}];
  }
  return [{key: 'empty', label: `No stations in ${stationTitle.toLowerCase()}.`}, {key: 'hint', label: 'Try another view or clear filters.'}];
}

function adaptiveStatus(props: AdaptiveContentProps): string {
  const {
    screen,
    playback,
    playingStation,
    stations,
    countries,
    searchQuery,
    editingSearch,
    countryFilter,
    editingCountryFilter,
    library,
    filterLabel
  } = props;
  if (screen === 'home') {
    return `${library.favorites.length} favorites · ${library.recent.length} recent · ${library.imported.length} imported`;
  }
  if (screen === 'now-playing') {
    return `${playbackBackendLabel(playback.backend)} · ${playback.state} · vol ${playback.volume}`;
  }
  if (screen === 'settings') {
    const group = settingsGroup(props.settingsPage ?? 'root');
    return group
      ? `${group.label} · Enter changes setting · b categories`
      : 'Choose a category · Updates are available here';
  }
  if (screen === 'search') {
    const query = searchQuery || (editingSearch ? 'type to search' : 'press / to search');
    if (props.mode === 'micro') return query;
    return `${editingSearch ? 'Editing' : 'Query'}: ${query}${filterLabel !== 'none' ? ` · ${filterLabel}` : ''}`;
  }
  if (screen === 'countries' || screen === 'map') {
    return `${countries.length.toLocaleString()} countries${countryFilter ? ` · ${editingCountryFilter ? 'editing ' : ''}filter “${countryFilter}”` : ''}`;
  }
  if (screen === 'stats') {
    return 'Stored locally on this machine';
  }
  if (screen === 'help') {
    return 'Scroll for keys and commands';
  }
  if (screen === 'airplay-code') {
    return playingStation ? playingStation.name : 'Receiver authentication';
  }
  if (screen === 'airplay-settings') {
    return `${props.airPlayDevices.length} receivers · ${playbackBackendLabel(playback.backend)}`;
  }
  return `${stations.length.toLocaleString()} stations${playingStation ? ` · playing ${playingStation.name}` : ''}`;
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
}
