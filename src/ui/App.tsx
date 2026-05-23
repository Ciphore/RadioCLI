import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, useApp, useInput, useStdout} from 'ink';
import {ProviderManager} from '../providers/provider-manager.js';
import {PlayerController} from '../player/player-controller.js';
import {JsonLibraryStore, stationKey} from '../storage/store.js';
import type {Country, IcyNowPlaying, LibraryState, LocationGuess, PlaybackState, Screen, Station} from '../types.js';
import {nextTheme, themeAccent} from './theme.js';
import {HomeScreen, homeItems} from './screens/HomeScreen.js';
import {CountriesScreen} from './screens/CountriesScreen.js';
import {StationScreen} from './screens/StationScreen.js';
import {SearchScreen} from './screens/SearchScreen.js';
import {NowPlayingScreen} from './screens/NowPlayingScreen.js';
import {SettingsScreen, settingsItems} from './screens/SettingsScreen.js';
import {MapScreen} from './screens/MapScreen.js';
import {computeTerminalLayout} from './layout.js';

type AppProps = {
  store?: JsonLibraryStore;
  providers?: ProviderManager;
};

type StationContext = {
  title: string;
  subtitle: string;
  stations: Station[];
};

type SearchFilters = {
  codec: string | null;
  language: string | null;
  minBitrate: number | null;
};

export function App({store: providedStore, providers: providedProviders}: AppProps): React.ReactElement {
  const {exit} = useApp();
  const {stdout} = useStdout();
  const store = useMemo(() => providedStore ?? new JsonLibraryStore(), [providedStore]);
  const providers = useMemo(() => providedProviders ?? new ProviderManager(), [providedProviders]);

  const [library, setLibrary] = useState<LibraryState>(() => store.snapshot());
  const settingsRef = useRef(library.settings);
  settingsRef.current = library.settings;

  const player = useMemo(() => new PlayerController(() => settingsRef.current), []);
  const [playback, setPlayback] = useState<PlaybackState>(() => player.getState());
  const [screen, setScreen] = useState<Screen>('home');
  const [selected, setSelected] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryFilter, setCountryFilter] = useState('');
  const [editingCountryFilter, setEditingCountryFilter] = useState(false);
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [stationContext, setStationContext] = useState<StationContext>({
    title: 'Explore world',
    subtitle: 'Popular stations from Radio Browser',
    stations: []
  });
  const [loadingStations, setLoadingStations] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingSearch, setEditingSearch] = useState(true);
  const [playingStation, setPlayingStation] = useState<Station | null>(null);
  const [nowPlaying, setNowPlaying] = useState<IcyNowPlaying | null>(null);
  const [location, setLocation] = useState<LocationGuess | null>(null);
  const [providerHealth, setProviderHealth] = useState<Record<string, string>>({});
  const [pulse, setPulse] = useState(0);
  const [commandMode, setCommandMode] = useState(false);
  const [commandText, setCommandText] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({codec: null, language: null, minBitrate: null});
  const [sleepUntil, setSleepUntil] = useState<number | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const displayStationsRef = useRef<Station[]>([]);
  const playStationRef = useRef<(station: Station) => void>(() => undefined);

  const theme = library.settings.theme;
  const favoriteKeys = useMemo(() => new Set(library.favorites.map(stationKey)), [library.favorites]);
  const diagnostics = player.diagnostics();
  const filterLabel = formatFilterLabel(filters);
  const filteredCountries = useMemo(() => {
    const normalized = countryFilter.toLowerCase().trim();
    if (!normalized) {
      return countries;
    }

    return countries.filter(country => `${country.name} ${country.code}`.toLowerCase().includes(normalized));
  }, [countries, countryFilter]);
  const displayStations = useMemo(() => applyStationFilters(stationContext.stations, filters), [filters, stationContext.stations]);
  displayStationsRef.current = displayStations;
  const sleepLabel = sleepUntil ? `Sleep ${formatTimeLeft(sleepUntil - Date.now())}` : 'Sleep off';
  const layout = computeTerminalLayout(stdout.columns ?? 100, stdout.rows ?? 30);

  useEffect(() => player.onChange(setPlayback), [player]);

  useEffect(() => player.onMetadata(setNowPlaying), [player]);

  useEffect(() => {
    if (screen !== 'now-playing' || process.env.RADIO_ATLAS_DISABLE_ANIMATION === '1') {
      return;
    }

    const timer = setInterval(() => setPulse(value => (value + 1) % 16), 160);
    return () => clearInterval(timer);
  }, [screen]);

  useEffect(() => {
    if ((screen === 'countries' || screen === 'map') && countries.length === 0 && !loadingCountries) {
      setLoadingCountries(true);
      providers
        .countries()
        .then(setCountries)
        .catch(error => setMessage(error instanceof Error ? error.message : 'Could not load countries.'))
        .finally(() => setLoadingCountries(false));
    }
  }, [countries.length, loadingCountries, providers, screen]);

  useEffect(() => {
    setSelected(value => clamp(value, currentItemCount(screen) - 1));
  }, [displayStations.length, filteredCountries.length, screen]);

  useEffect(() => {
    if (!sleepUntil) {
      return;
    }

    const delayMs = sleepUntil - Date.now();
    if (delayMs <= 0) {
      void player.stop();
      setSleepUntil(null);
      return;
    }

    const timer = setTimeout(() => {
      void player.stop();
      setSleepUntil(null);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [player, sleepUntil]);

  useEffect(() => {
    if (player.detectedBackends().length === 0) {
      setMessage('No playback backend found. Install mpv or ffplay before tuning stations.');
    }
  }, [player]);

  const refreshProviderHealth = useCallback(() => {
    providers.health(settingsRef.current).then(setProviderHealth).catch(() => setProviderHealth({}));
  }, [providers]);

  useEffect(() => {
    refreshProviderHealth();
  }, [refreshProviderHealth]);

  const go = useCallback((next: Screen) => {
    setScreen(next);
    setSelected(0);
    setMessage(null);
  }, []);

  const shutdown = useCallback(() => {
    player.stop().finally(exit);
  }, [exit, player]);

  const showStationContext = useCallback(
    (context: StationContext) => {
      setStationContext(context);
      go('stations');
    },
    [go]
  );

  const loadPopular = useCallback(async () => {
    setLoadingStations(true);
    setMessage(null);
    go('explore');
    try {
      const stations = await providers.popular(90);
      setStationContext({
        title: 'Explore world',
        subtitle: 'Popular live stations from Radio Browser',
        stations
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load world stations.');
    } finally {
      setLoadingStations(false);
    }
  }, [go, providers]);

  const loadCountry = useCallback(
    async (country: Country) => {
      setLoadingStations(true);
      setMessage(null);
      try {
        const stations = await providers.byCountry(country.code, 120);
        showStationContext({
          title: country.name,
          subtitle: `${country.code} · ${country.stationCount.toLocaleString()} listed stations`,
          stations
        });
      } catch (error) {
        setMessage(error instanceof Error ? error.message : `Could not load ${country.name}.`);
      } finally {
        setLoadingStations(false);
      }
    },
    [providers, showStationContext]
  );

  const runSearch = useCallback(
    async (query = searchQuery) => {
      if (!query.trim()) {
        setMessage('Enter a station, genre, language, or place.');
        return;
      }

      setLoadingStations(true);
      setMessage(null);
      try {
        const stations = await providers.search(query, settingsRef.current, {
          limit: 90,
          codec: filters.codec ?? undefined,
          language: filters.language ?? undefined,
          minBitrate: filters.minBitrate ?? undefined
        });
        setStationContext({
          title: `Search: ${query}`,
          subtitle: 'Matches across enabled public station directories',
          stations
        });
        setSelected(0);
        setEditingSearch(false);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Search failed.');
      } finally {
        setLoadingStations(false);
      }
    },
    [filters, providers, searchQuery]
  );

  const loadNearby = useCallback(async () => {
    setLoadingStations(true);
    setMessage(null);
    go('nearby');
    try {
      if (!settingsRef.current.enableNearbyLocation) {
        setStationContext({
          title: 'Nearby',
          subtitle: 'IP-based location is off. Enable it in Settings or use :location on.',
          stations: []
        });
        return;
      }

      const detected = location ?? (await providers.detectLocation());
      setLocation(detected);
      if (!detected) {
        setStationContext({
          title: 'Nearby',
          subtitle: 'Location detection was unavailable',
          stations: []
        });
        return;
      }

      const stations = await providers.nearby(detected, 90);
      setStationContext({
        title: 'Nearby',
        subtitle: `${[detected.city, detected.region, detected.country].filter(Boolean).join(', ')} · ${detected.source}`,
        stations
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load nearby stations.');
    } finally {
      setLoadingStations(false);
    }
  }, [go, location, providers]);

  const playStation = useCallback(
    async (station: Station) => {
      setMessage(`Tuning ${station.name}...`);
      setNowPlaying(null);

      try {
        const resolved = await providers.resolve(station);
        await player.play(station, resolved.url);
        setPlayingStation(station);
        setLibrary(store.addRecent(station));
        setScreen('now-playing');
        setMessage(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not tune station.';
        const currentList = displayStationsRef.current;
        const currentIndex = currentList.findIndex(item => stationKey(item) === stationKey(station));
        const nextStation = currentIndex >= 0 ? currentList[currentIndex + 1] : undefined;
        if (settingsRef.current.skipBrokenStreams && nextStation) {
          setMessage(`${message} Skipping to ${nextStation.name}.`);
          setSelected(currentIndex + 1);
          setTimeout(() => playStationRef.current(nextStation), 250);
          return;
        }

        setMessage(message);
      }
    },
    [player, providers, store]
  );
  playStationRef.current = playStation;

  const toggleFavorite = useCallback(
    (station: Station | null) => {
      if (!station) {
        return;
      }

      setLibrary(store.toggleFavorite(station));
    },
    [store]
  );

  const setVolume = useCallback(
    (volume: number) => {
      const clamped = clampVolume(volume);
      setLibrary(store.updateSettings({volume: clamped}));
      void player.setVolume(clamped);
    },
    [player, store]
  );

  const adjustVolume = useCallback(
    (delta: number) => {
      setVolume((player.getState().volume || library.settings.volume) + delta);
    },
    [library.settings.volume, player, setVolume]
  );

  const toggleMute = useCallback(() => {
    void player.toggleMute();
  }, [player]);

  const cycleSleepTimer = useCallback(() => {
    const options = [null, 15, 30, 60] as const;
    const currentMinutes = sleepUntil ? Math.round((sleepUntil - Date.now()) / 60000) : null;
    const currentIndex = options.findIndex(option => option === currentMinutes);
    const next = options[(currentIndex + 1 + options.length) % options.length] ?? options[1];
    setSleepUntil(next ? Date.now() + next * 60_000 : null);
  }, [sleepUntil]);

  const loadImported = useCallback(() => {
    showStationContext({
      title: 'Favorites and imports',
      subtitle: `${library.favorites.length} favorites · ${library.imported.length} imported streams`,
      stations: [...library.favorites, ...library.imported]
    });
  }, [library.favorites, library.imported, showStationContext]);

  const executeCommand = useCallback(
    async (rawCommand: string) => {
      const trimmed = rawCommand.trim();
      if (!trimmed) {
        return;
      }

      const [name = '', ...rest] = trimmed.split(/\s+/);
      const value = rest.join(' ');

      if (name === 'search' || name === 's') {
        setSearchQuery(value);
        go('search');
        await runSearch(value);
        return;
      }

      if (name === 'country' || name === 'c') {
        const match = countries.find(country =>
          `${country.code} ${country.name}`.toLowerCase().includes(value.toLowerCase())
        );
        if (!match) {
          setMessage(`Country not found: ${value}`);
          return;
        }

        await loadCountry(match);
        return;
      }

      if (name === 'codec') {
        setFilters(current => ({...current, codec: value && value !== 'any' ? value.toUpperCase() : null}));
        return;
      }

      if (name === 'language' || name === 'lang') {
        setFilters(current => ({...current, language: value && value !== 'any' ? value : null}));
        return;
      }

      if (name === 'bitrate') {
        const bitrate = Number(value);
        setFilters(current => ({...current, minBitrate: Number.isFinite(bitrate) && bitrate > 0 ? bitrate : null}));
        return;
      }

      if (name === 'clear') {
        setFilters({codec: null, language: null, minBitrate: null});
        setMessage('Filters cleared.');
        return;
      }

      if (name === 'vol' || name === 'volume') {
        const volume = Number(value);
        if (Number.isFinite(volume)) {
          setVolume(volume);
        }
        return;
      }

      if (name === 'mute') {
        toggleMute();
        return;
      }

      if (name === 'location') {
        const enabled = value === 'on' || value === 'true' || value === '1';
        setLibrary(store.updateSettings({enableNearbyLocation: enabled}));
        setMessage(`Nearby location lookup ${enabled ? 'enabled' : 'disabled'}.`);
        return;
      }

      if (name === 'timeout') {
        const seconds = Number(value);
        if (Number.isFinite(seconds)) {
          setLibrary(store.updateSettings({tuneTimeoutSeconds: Math.min(45, Math.max(3, seconds))}));
        }
        return;
      }

      if (name === 'skip') {
        const enabled = value !== 'off' && value !== 'false' && value !== '0';
        setLibrary(store.updateSettings({skipBrokenStreams: enabled}));
        return;
      }

      if (name === 'sleep') {
        const minutes = Number(value);
        setSleepUntil(Number.isFinite(minutes) && minutes > 0 ? Date.now() + minutes * 60_000 : null);
        return;
      }

      if (name === 'map') {
        go('map');
        return;
      }

      if (name === 'recent') {
        showStationContext({
          title: 'Recent',
          subtitle: 'Stations played on this machine',
          stations: library.recent.map(item => item.station)
        });
        return;
      }

      if (name === 'favorites' || name === 'imports') {
        loadImported();
        return;
      }

      if (name === 'settings') {
        go('settings');
        return;
      }

      if (name === 'stop') {
        await player.stop();
        return;
      }

      setMessage(`Unknown command: ${name}`);
    },
    [
      countries,
      go,
      library.recent,
      loadCountry,
      loadImported,
      player,
      runSearch,
      setVolume,
      showStationContext,
      store,
      toggleMute
    ]
  );

  const playAdjacent = useCallback(
    (direction: 1 | -1) => {
      if (!playingStation || displayStations.length === 0) {
        return;
      }

      const currentKey = stationKey(playingStation);
      const currentIndex = displayStations.findIndex(station => stationKey(station) === currentKey);
      const nextIndex =
        currentIndex === -1
          ? 0
          : (currentIndex + direction + displayStations.length) % displayStations.length;
      setSelected(nextIndex);
      const nextStation = displayStations[nextIndex];
      if (nextStation) {
        void playStation(nextStation);
      }
    },
    [displayStations, playStation, playingStation]
  );

  const selectedStation = displayStations[selected] ?? null;

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      shutdown();
      return;
    }

    if (commandMode) {
      if (key.return) {
        void executeCommand(commandText);
        setCommandText('');
        setCommandMode(false);
        return;
      }

      if (key.escape) {
        setCommandText('');
        setCommandMode(false);
        return;
      }

      if (key.backspace || key.delete) {
        setCommandText(value => value.slice(0, -1));
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        setCommandText(value => `${value}${input}`);
      }

      return;
    }

    if (screen === 'search' && editingSearch) {
      if (key.return) {
        void runSearch();
        return;
      }

      if (key.escape) {
        setEditingSearch(false);
        return;
      }

      if (key.backspace || key.delete) {
        setSearchQuery(value => value.slice(0, -1));
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        setSearchQuery(value => `${value}${input}`);
      }

      return;
    }

    if (screen === 'countries' && editingCountryFilter) {
      if (key.return || key.escape) {
        setEditingCountryFilter(false);
        setSelected(0);
        return;
      }

      if (key.backspace || key.delete) {
        setCountryFilter(value => value.slice(0, -1));
        return;
      }

      if (input && !key.ctrl && !key.meta) {
        setCountryFilter(value => `${value}${input}`);
      }

      return;
    }

    if (input === 'q') {
      shutdown();
      return;
    }

    if (input.startsWith(':')) {
      const seed = input.slice(1).replace(/[\r\n]+$/g, '');
      if (/[\r\n]/.test(input)) {
        void executeCommand(seed);
      } else {
        setCommandMode(true);
        setCommandText(seed);
      }
      return;
    }

    if (input === '+' || input === '=') {
      adjustVolume(5);
      return;
    }

    if (input === '-') {
      adjustVolume(-5);
      return;
    }

    if (input === 'm') {
      toggleMute();
      return;
    }

    if (input === 's' && screen === 'now-playing') {
      cycleSleepTimer();
      return;
    }

    if (input === 'd' && screen === 'now-playing') {
      setShowDiagnostics(value => !value);
      return;
    }

    if (input === ']') {
      setSelected(value => clamp(value + 10, currentItemCount(screen) - 1));
      return;
    }

    if (input === '[') {
      setSelected(value => clamp(value - 10, currentItemCount(screen) - 1));
      return;
    }

    if (screen === 'home' && /^[1-9]$/.test(input)) {
      const menuIndex = Number(input) - 1;
      setSelected(menuIndex);
      const target = homeItems[menuIndex]?.screen;
      if (target === 'explore') {
        void loadPopular();
      } else if (target === 'nearby') {
        void loadNearby();
      } else if (target === 'search') {
        go('search');
        setEditingSearch(true);
      } else if (target === 'recent') {
        showStationContext({
          title: 'Recent',
          subtitle: 'Stations played on this machine',
          stations: library.recent.map(item => item.station)
        });
      } else if (target === 'favorites') {
        loadImported();
      } else if (target) {
        go(target);
      }
      return;
    }

    if (input === 'b' || key.escape) {
      go(screen === 'home' ? 'home' : 'home');
      return;
    }

    if (input === '/') {
      if (screen === 'search') {
        setEditingSearch(true);
      }
      if (screen === 'countries') {
        setEditingCountryFilter(true);
      }
      return;
    }

    if (input === 'f') {
      toggleFavorite(screen === 'now-playing' ? playingStation : selectedStation);
      return;
    }

    if (input === ' ') {
      void player.togglePause();
      return;
    }

    if ((input === 'n' || key.rightArrow) && screen === 'now-playing') {
      playAdjacent(1);
      return;
    }

    if ((input === 'p' || key.leftArrow) && screen === 'now-playing') {
      playAdjacent(-1);
      return;
    }

    if (input === 'n') {
      setSelected(value => clamp(value + 1, currentItemCount(screen) - 1));
      return;
    }

    if (input === 'p') {
      setSelected(value => clamp(value - 1, currentItemCount(screen) - 1));
      return;
    }

    if (key.downArrow) {
      setSelected(value => clamp(value + 1, currentItemCount(screen) - 1));
      return;
    }

    if (key.upArrow) {
      setSelected(value => clamp(value - 1, currentItemCount(screen) - 1));
      return;
    }

    if (key.return) {
      if (screen === 'home') {
        const target = homeItems[selected]?.screen;
        if (target === 'explore') {
          void loadPopular();
        } else if (target === 'nearby') {
          void loadNearby();
        } else if (target === 'search') {
          go('search');
          setEditingSearch(true);
        } else if (target === 'recent') {
          showStationContext({
            title: 'Recent',
            subtitle: 'Stations played on this machine',
            stations: library.recent.map(item => item.station)
          });
        } else if (target === 'favorites') {
          loadImported();
        } else if (target) {
          go(target);
        }
        return;
      }

      if (screen === 'countries') {
        const country = filteredCountries[selected];
        if (country) {
          void loadCountry(country);
        }
        return;
      }

      if (screen === 'settings') {
        const item = settingsItems[selected];
        if (item === 'Cycle display color') {
          setLibrary(store.updateSettings({theme: nextTheme(library.settings.theme)}));
        } else if (item === 'Toggle Radio Garden experimental adapter') {
          setLibrary(store.updateSettings({enableRadioGarden: !library.settings.enableRadioGarden}));
          setTimeout(refreshProviderHealth, 0);
        } else if (item === 'Toggle nearby location lookup') {
          setLibrary(store.updateSettings({enableNearbyLocation: !library.settings.enableNearbyLocation}));
        } else if (item === 'Cycle playback backend') {
          const next = library.settings.preferredBackend === 'auto' ? 'mpv' : library.settings.preferredBackend === 'mpv' ? 'ffplay' : 'auto';
          setLibrary(store.updateSettings({preferredBackend: next}));
        } else if (item === 'Volume up') {
          adjustVolume(5);
        } else if (item === 'Volume down') {
          adjustVolume(-5);
        } else if (item === 'Mute or unmute') {
          toggleMute();
        } else if (item === 'Toggle skip broken streams') {
          setLibrary(store.updateSettings({skipBrokenStreams: !library.settings.skipBrokenStreams}));
        } else if (item === 'Refresh provider health') {
          refreshProviderHealth();
        }
        return;
      }

      if (screen === 'map') {
        const country = filteredCountries[selected];
        if (country) {
          void loadCountry(country);
        }
        return;
      }

      if (selectedStation) {
        void playStation(selectedStation);
      }
    }
  });

  function currentItemCount(currentScreen: Screen): number {
    if (currentScreen === 'home') {
      return homeItems.length;
    }

    if (currentScreen === 'countries' || currentScreen === 'map') {
      return filteredCountries.length;
    }

    if (currentScreen === 'settings') {
      return settingsItems.length;
    }

    if (currentScreen === 'now-playing') {
      return 1;
    }

    return displayStations.length;
  }

  const content = (() => {
    if (layout.compact) {
      return (
        <Box flexDirection="column">
          <Text bold>Radio Atlas</Text>
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
        />
      );
    }

    if (screen === 'map') {
      return (
        <MapScreen
          countries={filteredCountries}
          selected={selected}
          loading={loadingCountries}
          theme={theme}
          pageSize={layout.mapCountryRows}
          mode={layout.mapMode}
        />
      );
    }

    if (screen === 'search') {
      return (
        <SearchScreen
          query={searchQuery}
          editing={editingSearch}
          loading={loadingStations}
          stations={stationContext.title.startsWith('Search:') ? displayStations : []}
          selected={selected}
          theme={theme}
          favorites={favoriteKeys}
          experimentalOn={library.settings.enableRadioGarden}
          filterLabel={filterLabel}
          pageSize={layout.stationRows}
        />
      );
    }

    if (screen === 'nearby' || screen === 'explore' || screen === 'stations') {
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
          favorite={store.isFavorite(playingStation)}
          pulse={pulse}
          diagnostics={diagnostics}
          sleepLabel={sleepLabel}
          showDiagnostics={showDiagnostics}
          stationTime={stationApproximateTime(playingStation)}
          width={layout.receiverWidth}
        />
      );
    }

    if (screen === 'settings') {
      return (
        <SettingsScreen
          selected={selected}
          settings={library.settings}
          storePath={store.filePath}
          playback={playback}
          backends={player.detectedBackends()}
          providerHealth={providerHealth}
          theme={theme}
          diagnostics={diagnostics}
        />
      );
    }

    return <Text>Unknown screen.</Text>;
  })();

  return (
    <Box flexDirection="column" paddingX={1} minHeight={layout.rows}>
      <Box flexGrow={1} flexDirection="column">
        {content}
        {message ? (
          <Box marginTop={1}>
            <Text color={themeAccent(theme)}>{message}</Text>
          </Box>
        ) : null}
      </Box>
      <Box flexDirection="column">
        {commandMode ? (
          <Text color={themeAccent(theme)}>COMMAND :{commandText}</Text>
        ) : (
          <Text color="gray">: command · [/] page · +/- volume · m mute</Text>
        )}
      </Box>
    </Box>
  );
}

function clamp(value: number, max: number): number {
  return Math.min(Math.max(value, 0), Math.max(max, 0));
}

function clampVolume(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function applyStationFilters(stations: Station[], filters: SearchFilters): Station[] {
  return stations.filter(station => {
    if (filters.codec && station.codec && station.codec.toLowerCase() !== filters.codec.toLowerCase()) {
      return false;
    }

    if (filters.language && station.language && !station.language.toLowerCase().includes(filters.language.toLowerCase())) {
      return false;
    }

    if (filters.minBitrate && (station.bitrate ?? 0) < filters.minBitrate) {
      return false;
    }

    return true;
  });
}

function formatFilterLabel(filters: SearchFilters): string {
  const parts = [
    filters.codec ? `codec ${filters.codec}` : undefined,
    filters.language ? `language ${filters.language}` : undefined,
    filters.minBitrate ? `min ${filters.minBitrate} kbps` : undefined
  ].filter(Boolean);

  return parts.join(' · ') || 'none';
}

function formatTimeLeft(ms: number): string {
  if (ms <= 0) {
    return 'now';
  }

  const minutes = Math.ceil(ms / 60_000);
  return `${minutes}m`;
}

function stationApproximateTime(station: Station | null): string {
  if (!station || typeof station.longitude !== 'number') {
    return 'unknown';
  }

  const offsetHours = Math.round(station.longitude / 15);
  const date = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  const sign = offsetHours >= 0 ? '+' : '';
  return `${date.toISOString().slice(11, 16)} UTC${sign}${offsetHours}`;
}
