import React from 'react';
import {Text} from 'ink';
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
import {HomeScreen} from './screens/HomeScreen.js';
import {CountriesScreen} from './screens/CountriesScreen.js';
import {MapScreen} from './screens/MapScreen.js';
import {SearchScreen} from './screens/SearchScreen.js';
import {ExploreScreen} from './screens/ExploreScreen.js';
import {StationScreen} from './screens/StationScreen.js';
import {NowPlayingScreen} from './screens/NowPlayingScreen.js';
import {StatsScreen} from './screens/StatsScreen.js';
import {SettingsScreen} from './screens/SettingsScreen.js';
import {HelpScreen} from './screens/HelpScreen.js';
import {AirPlaySettingsScreen} from './screens/AirPlaySettingsScreen.js';
import {AirPlayCodeScreen} from './screens/AirPlayCodeScreen.js';
import {selectedAirPlayDevice} from './airplay-settings.js';
import type {ExploreCursor, StationContext} from './app-state.js';
import type {TerminalLayout} from './layout.js';
import {AdaptiveContent} from './AdaptiveContent.js';

type AppContentProps = {
  airPlayDevices: AirPlayDevice[];
  airPlayCode: string;
  appVersion: string;
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
  updateCheck?: UpdateCheckState;
};

export function AppContent({
  airPlayDevices,
  airPlayCode,
  appVersion,
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
  theme,
  updateCheck
}: AppContentProps): React.ReactElement {
  if (layout.compact) {
    return (
      <AdaptiveContent
        mode={layout.mode === 'micro' ? 'micro' : 'compact'}
        screen={screen}
        selected={selected}
        height={layout.contentRows}
        width={frameWidth}
        theme={theme}
        playback={playback}
        playingStation={playingStation}
        nowPlaying={nowPlaying}
        stations={displayStations}
        countries={filteredCountries}
        airPlayDevices={airPlayDevices}
        airPlayCode={airPlayCode}
        searchQuery={searchQuery}
        editingSearch={editingSearch}
        countryFilter={countryFilter}
        editingCountryFilter={editingCountryFilter}
        loadingCountries={loadingCountries}
        loadingStations={loadingStations}
        library={library}
        diagnostics={diagnostics}
        backends={backends}
        updateCheck={updateCheck}
        favoriteKeys={favoriteKeys}
        stationTitle={stationContext.title}
        filterLabel={filterLabel}
        pulse={pulse}
        sleepLabel={sleepLabel}
      />
    );
  }

  if (screen === 'home') {
    return <HomeScreen selected={selected} theme={theme} library={library} />;
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
        pageSize={Math.max(1, layout.contentRows - 8)}
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
        showDiagnostics={showDiagnostics}
        stationTime={stationTime}
        receiverStyle={library.settings.receiverStyle}
        trackHistory={library.trackHistory}
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
        appVersion={appVersion}
        updateCheck={updateCheck}
        storePath={storePath}
        playback={playback}
        backends={backends}
        airPlayDevices={airPlayDevices}
        providerHealth={providerHealth}
        theme={theme}
        diagnostics={diagnostics}
        width={frameWidth}
        height={layout.contentRows}
      />
    );
  }

  if (screen === 'airplay-settings') {
    return (
      <AirPlaySettingsScreen
        selected={selected}
        settings={library.settings}
        backends={backends}
        devices={airPlayDevices}
        theme={theme}
        width={frameWidth}
        height={layout.contentRows}
      />
    );
  }

  if (screen === 'airplay-code') {
    return (
      <AirPlayCodeScreen
        code={airPlayCode}
        playback={playback}
        selectedDevice={selectedAirPlayDevice(library.settings, airPlayDevices)}
        theme={theme}
        width={frameWidth}
      />
    );
  }

  if (screen === 'help') {
    return <HelpScreen theme={theme} width={frameWidth} height={layout.contentRows} selected={selected} />;
  }

  return <Text>Unknown screen.</Text>;
}
