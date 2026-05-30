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
  ThemeName
} from '../types.js';
import {themeAccent} from './theme.js';
import {HomeScreen} from './screens/HomeScreen.js';
import {CountriesScreen} from './screens/CountriesScreen.js';
import {MapScreen} from './screens/MapScreen.js';
import {SearchScreen} from './screens/SearchScreen.js';
import {ExploreScreen} from './screens/ExploreScreen.js';
import {StationScreen} from './screens/StationScreen.js';
import {NowPlayingScreen} from './screens/NowPlayingScreen.js';
import {StatsScreen} from './screens/StatsScreen.js';
import {SettingsScreen} from './screens/SettingsScreen.js';
import type {ExploreCursor, StationContext} from './app-state.js';
import type {TerminalLayout} from './layout.js';

type AppContentProps = {
  airPlayDevices: AirPlayDevice[];
  backends: string[];
  countryFilter: string;
  diagnostics: PlaybackDiagnostics;
  displayStations: Station[];
  editingCountryFilter: boolean;
  editingSearch: boolean;
  exploreCursor: ExploreCursor;
  favoriteKeys: Set<string>;
  filterLabel: string;
  filteredCountries: Country[];
  frameWidth: number;
  layout: TerminalLayout;
  library: LibraryState;
  loadingCountries: boolean;
  loadingStations: boolean;
  nowPlaying: IcyNowPlaying | null;
  playback: PlaybackState;
  playingStation: Station | null;
  providerHealth: Record<string, string>;
  pulse: number;
  searchQuery: string;
  screen: Screen;
  selected: number;
  showDiagnostics: boolean;
  sleepLabel: string;
  stationContext: StationContext;
  stationFavorite: boolean;
  stationTime: string;
  storePath: string;
  theme: ThemeName;
};

export function AppContent({
  airPlayDevices,
  backends,
  countryFilter,
  diagnostics,
  displayStations,
  editingCountryFilter,
  editingSearch,
  exploreCursor,
  favoriteKeys,
  filterLabel,
  filteredCountries,
  frameWidth,
  layout,
  library,
  loadingCountries,
  loadingStations,
  nowPlaying,
  playback,
  playingStation,
  providerHealth,
  pulse,
  searchQuery,
  screen,
  selected,
  showDiagnostics,
  sleepLabel,
  stationContext,
  stationFavorite,
  stationTime,
  storePath,
  theme
}: AppContentProps): React.ReactElement {
  if (layout.compact) {
    return (
      <Box flexDirection="column">
        <Text bold>RadioCLI</Text>
        <Text color={themeAccent(theme)}>Terminal too small: {layout.columns}x{layout.rows}</Text>
        <Text color="gray">Resize to at least 64x18 for the full receiver UI.</Text>
        <Text color="gray">Playback: {playback.state} · {playback.backend}</Text>
        <Text color="gray">q quit · Ctrl+C always exits</Text>
      </Box>
    );
  }

  if (screen === 'home') {
    return <HomeScreen selected={selected} theme={theme} library={library} playback={playback} />;
  }

  if (screen === 'countries') {
    return (
      <CountriesScreen
        countries={filteredCountries}
        selected={selected}
        loading={loadingCountries}
        filter={countryFilter}
        editingFilter={editingCountryFilter}
        theme={theme}
        pageSize={layout.countryRows}
        width={frameWidth}
      />
    );
  }

  if (screen === 'map') {
    return (
      <MapScreen
        countries={filteredCountries}
        selected={selected}
        loading={loadingCountries}
        filter={countryFilter}
        editingFilter={editingCountryFilter}
        theme={theme}
        pageSize={layout.mapCountryRows}
        mode={layout.mapMode}
        width={frameWidth}
      />
    );
  }

  if (screen === 'search') {
    return (
      <SearchScreen
        query={searchQuery}
        editing={editingSearch}
        loading={loadingStations}
        stations={displayStations}
        selected={selected}
        theme={theme}
        favorites={favoriteKeys}
        experimentalOn={library.settings.enableRadioGarden}
        filterLabel={filterLabel}
        pageSize={layout.stationRows}
        width={frameWidth}
      />
    );
  }

  if (screen === 'explore') {
    return (
      <ExploreScreen
        title={stationContext.title}
        subtitle={stationContext.subtitle}
        stations={displayStations}
        selected={selected}
        loading={loadingStations}
        theme={theme}
        favorites={favoriteKeys}
        filterLabel={filterLabel}
        cursor={exploreCursor}
        pageSize={layout.stationRows}
        width={frameWidth}
        height={layout.contentRows}
      />
    );
  }

  if (screen === 'nearby' || screen === 'stations' || screen === 'library') {
    return (
      <StationScreen
        title={stationContext.title}
        subtitle={stationContext.subtitle}
        stations={displayStations}
        selected={selected}
        loading={loadingStations}
        theme={theme}
        favorites={favoriteKeys}
        filterLabel={filterLabel}
        pageSize={layout.stationRows}
        width={frameWidth}
      />
    );
  }

  if (screen === 'now-playing') {
    return (
      <NowPlayingScreen
        station={playingStation}
        playback={playback}
        metadata={nowPlaying}
        theme={theme}
        favorite={stationFavorite}
        pulse={pulse}
        diagnostics={diagnostics}
        sleepLabel={sleepLabel}
        showDiagnostics={showDiagnostics}
        stationTime={stationTime}
        receiverStyle={library.settings.receiverStyle}
        width={layout.receiverWidth}
        height={layout.receiverRows}
      />
    );
  }

  if (screen === 'stats') {
    return <StatsScreen library={library} theme={theme} width={frameWidth} height={layout.contentRows} />;
  }

  if (screen === 'settings') {
    return (
      <SettingsScreen
        selected={selected}
        settings={library.settings}
        storePath={storePath}
        playback={playback}
        backends={backends}
        airPlayDevices={airPlayDevices}
        providerHealth={providerHealth}
        theme={theme}
        diagnostics={diagnostics}
        width={frameWidth}
      />
    );
  }

  return <Text>Unknown screen.</Text>;
}
