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
import {homeItems, settingsItems, settingsSectionFor} from './screen-items.js';
import {screenTitle} from './screen-meta.js';
import {keyHelpSections, commandHelp} from './help-content.js';
import {settingLabel, settingValue} from './screens/SettingsScreen.js';
import {panelBorder, textDim, textMuted, themeAccent} from './theme.js';
import {panelBorderStyle, useDisplay} from './display-context.js';
import {toAsciiSafe} from './ascii.js';
import {buildVisualizer, visualizerHeight} from './visualizers/receiver-visualizers.js';
import {Logo} from './components/Logo.js';

type AdaptiveContentProps = {
  mode: 'compact' | 'micro';
  screen: Screen;
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
  library: LibraryState;
  diagnostics: PlaybackDiagnostics;
  backends: string[];
  updateCheck?: UpdateCheckState;
  favoriteKeys: Set<string>;
  stationTitle: string;
  filterLabel: string;
  pulse: number;
  sleepLabel: string;
};

type AdaptiveRow = {
  key: string;
  label: string;
  detail?: string;
  index?: number;
  heading?: boolean;
  separator?: string;
};

export function AdaptiveContent(props: AdaptiveContentProps): React.ReactElement {
  return <AdaptiveContentBody {...props} />;
}

function AdaptiveContentBody(props: AdaptiveContentProps): React.ReactElement {
  const {
    mode,
    screen,
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
    library,
    diagnostics,
    backends,
    updateCheck,
    favoriteKeys,
    stationTitle,
    pulse,
  } = props;
  const accent = themeAccent(theme);
  const {ascii} = useDisplay();
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
        pulse={pulse}
        width={width}
        height={height}
        ascii={ascii}
        theme={theme}
        receiverStyle={library.settings.receiverStyle}
      />
    );
  }

  if (screen === 'search') {
    const rows = adaptiveRows({
      screen,
      stations,
      countries,
      airPlayDevices,
      library,
      diagnostics,
      backends,
      updateCheck,
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
      stationTitle
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
        {bodyRows > 0 ? <Text color={airPlayCode ? accent : textMuted}>{truncate(prompt, width)}</Text> : null}
      </AdaptiveFrame>
    );
  }

  const rows = adaptiveRows({
    screen,
    stations,
    countries,
    airPlayDevices,
    library,
    diagnostics,
    backends,
    updateCheck,
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
    stationTitle
  });

  return (
    <AdaptiveFrame title={title} status={status} mode={mode} height={height} width={width} theme={theme}>
      {rows.length > 0 ? (
        <AdaptiveList rows={rows} selected={selected} pageSize={bodyRows} width={width} theme={theme} />
      ) : (
        <StaticRows rows={empty.slice(0, bodyRows)} width={width} theme={theme} />
      )}
    </AdaptiveFrame>
  );
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
  const titlePrefix = mode === 'micro' ? 'RC / ' : 'RADIOCLI  ';
  const titleText = truncate(`${titlePrefix}${title}${mode === 'micro' && status ? ` · ${status}` : ''}`, width);
  const ruleWidth = Math.max(0, width - displayWidth(titleText) - 1);
  const {bodyRows, gapRows} = adaptiveFrameMetrics(mode, height);

  return (
    <Box flexDirection="column" height={height} width={width} overflow="hidden">
      <Text color={accent} bold>
        {titleText}<Text color={textDim}>{ruleWidth ? ` ${(ascii ? '-' : '─').repeat(ruleWidth)}` : ''}</Text>
      </Text>
      {mode === 'compact' && height >= 4 ? <Text color={textMuted}>{truncate(status, width)}</Text> : null}
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
            <Text key={item.screen} color={active ? accent : undefined} bold={active}>
              {active ? '> ' : '  '}{absoluteIndex + 1} {truncate(`${item.label}${detail}`, Math.max(1, width - 4))}
            </Text>
          );
        })}
      </Box>
      {showSummary ? (
        <Text color={textMuted}>
          {truncate(`${library.recent.length} recent · ${library.favorites.length} favorites · ${library.imported.length} imported`, width)}
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
  theme
}: {
  rows: AdaptiveRow[];
  selected: number;
  pageSize: number;
  width: number;
  theme: ThemeName;
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
        return (
          <Text key={row.key} color={active ? accent : row.heading ? textMuted : undefined} bold={active || row.heading}>
            {prefix}{truncate(`${row.label}${detail}`, Math.max(0, width - 2))}
          </Text>
        );
      })}
    </Box>
  );
}

function StaticRows({rows, width, theme}: {rows: AdaptiveRow[]; width: number; theme: ThemeName}): React.ReactElement {
  const accent = themeAccent(theme);
  return (
    <Box flexDirection="column">
      {rows.map(row => (
        <Text key={row.key} color={row.heading ? textMuted : undefined} bold={row.heading}>
          {truncate(row.detail ? `${row.label} · ${row.detail}` : row.label, width)}
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
  pulse,
  width,
  height,
  ascii,
  theme,
  receiverStyle
}: {
  mode: 'compact' | 'micro';
  station: Station | null;
  playback: PlaybackState;
  metadata: IcyNowPlaying | null;
  pulse: number;
  width: number;
  height: number;
  ascii: boolean;
  theme: ThemeName;
  receiverStyle: LibraryState['settings']['receiverStyle'];
}): React.ReactElement {
  const accent = themeAccent(theme);
  const stationName = station?.name ?? 'No station tuned';
  const showMetadata = mode === 'compact' && height >= 9 && Boolean(metadata?.title);
  const headerRows = mode === 'compact' ? 2 : 1;
  const metadataRows = showMetadata ? 1 : 0;
  const gapRows = height >= 5 ? 1 : 0;
  const availableVisualRows = Math.max(1, height - headerRows - metadataRows - gapRows * 2);
  const visualHeight = visualizerHeight(receiverStyle, availableVisualRows, width);
  const visualRows = buildVisualizer(
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
      <Text color={accent} bold>{truncate(header, width)}</Text>
      {mode === 'compact' ? <Text color={textMuted}>{truncate(status, width)}</Text> : null}
      {gapRows ? <Box height={gapRows} flexShrink={0} /> : null}
      <Box flexDirection="column" height={availableVisualRows} overflow="hidden">
        {visualRows.map((row, index) => (
          <Text key={index} color={row.segments ? undefined : row.color}>
            {row.segments
              ? renderAdaptiveSegments(row.segments, ascii)
              : ascii
                ? toAsciiSafe(row.text)
                : row.text}
          </Text>
        ))}
      </Box>
      {showMetadata ? <Text color={accent}>{truncate(metadata?.title ?? '', width)}</Text> : null}
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
    const key = `${offset}-${segment.color}-${segment.backgroundColor ?? ''}`;
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
  ascii
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
}): React.ReactElement {
  const accent = themeAccent(theme);
  const {panel: panelBackground} = useDisplay();
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
          <Text color={editing || loading ? accent : textMuted}>{prefix}</Text>
          <Text color={query ? accent : textMuted}>{truncate(fieldText, Math.max(1, width - 5))}</Text>
        </Box>
      ) : (
        <Text color={query ? accent : textMuted}>{truncate(`[${prefix}${fieldText}]`, width)}</Text>
      )}
      {gapRows ? <Box height={gapRows} flexShrink={0} /> : null}
      <Box flexDirection="column" height={listRows} overflow="hidden" flexShrink={0}>
        {rows.length > 0 ? (
          <AdaptiveList rows={rows} selected={selected} pageSize={listRows} width={width} theme={theme} />
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
  stations: Station[];
  countries: Country[];
  airPlayDevices: AirPlayDevice[];
  library: LibraryState;
  diagnostics: PlaybackDiagnostics;
  backends: string[];
  updateCheck?: UpdateCheckState;
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
      detail: mode === 'compact' && width >= 52 ? item.detail : undefined
    }));
  }
  if (screen === 'settings') {
    const labels = settingsItems.map(item => settingLabel(item, updateCheck));
    const labelWidth = pairedColumnWidth(labels, width, mode);
    return settingsItems.map((item, index) => ({
      key: item,
      label: padDisplayEnd(truncate(settingLabel(item, updateCheck), labelWidth), labelWidth),
      detail: settingValue(item, library.settings, diagnostics, backends, airPlayDevices, updateCheck),
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
  return stations.map((station, index) => {
    const favorite = favoriteKeys.has(`${station.provider}:${station.id}`);
    const standardMetadata = `${stationLocation(station)} · ${stationTech(station)}`;
    const selectedMetadata = station.tags.length > 0 ? stationTags(station) : standardMetadata;
    return {
      key: `${station.provider}:${station.id}`,
      label: `${station.name}${favorite ? (ascii ? ' *' : ' ★') : ''}`,
      detail: width >= 42 ? (index === selected ? selectedMetadata : standardMetadata) : undefined,
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
}): AdaptiveRow[] {
  const {screen, searchQuery, editingSearch, countryFilter, loadingCountries, loadingStations, nearbyEnabled, stationTitle} = input;
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
    filterLabel,
    selected
  } = props;
  if (screen === 'home') {
    return `${library.favorites.length} favorites · ${library.recent.length} recent · ${library.imported.length} imported`;
  }
  if (screen === 'now-playing') {
    return `${playbackBackendLabel(playback.backend)} · ${playback.state} · vol ${playback.volume}`;
  }
  if (screen === 'settings') {
    return `${settingsSectionFor(settingsItems[selected])} · Enter changes the selected setting`;
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
