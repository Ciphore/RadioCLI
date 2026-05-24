import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, useApp, useInput, useWindowSize} from 'ink';
import {ProviderManager} from '../providers/provider-manager.js';
import {PlayerController} from '../player/player-controller.js';
import {JsonLibraryStore, stationKey} from '../storage/store.js';
import type {Country, IcyNowPlaying, LibraryState, LocationGuess, PlaybackState, Screen, Station} from '../types.js';
import {appBackground, nextReceiverStyle, nextTheme, panelBackground, themeAccent} from './theme.js';
import {HomeScreen, homeItems} from './screens/HomeScreen.js';
import {CountriesScreen} from './screens/CountriesScreen.js';
import {StationScreen} from './screens/StationScreen.js';
import {SearchScreen} from './screens/SearchScreen.js';
import {NowPlayingScreen} from './screens/NowPlayingScreen.js';
import {SettingsScreen, settingsItems} from './screens/SettingsScreen.js';
import {MapScreen} from './screens/MapScreen.js';
import {StatsScreen} from './screens/StatsScreen.js';
import {TopTabs, type TopTab} from './components/TopTabs.js';
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

type StationContextKey = 'explore' | 'stations' | 'search' | 'nearby' | 'recent' | 'favorites';

type SearchFilters = {
  codec: string | null;
  language: string | null;
  minBitrate: number | null;
};

type NavigationOptions = {
  resetSelection?: boolean;
  clearMessage?: boolean;
};

type PlayStationOptions = {
  openNowPlaying?: boolean;
};

const initialStationContexts: Record<StationContextKey, StationContext> = {
  explore: {
    title: 'Explore world',
    subtitle: 'Popular stations from Radio Browser',
    stations: []
  },
  stations: {
    title: 'Country stations',
    subtitle: 'Pick a country to load stations',
    stations: []
  },
  search: {
    title: 'Search',
    subtitle: 'Matches across enabled public station directories',
    stations: []
  },
  nearby: {
    title: 'Nearby',
    subtitle: 'Opt-in approximate location for local stations',
    stations: []
  },
  recent: {
    title: 'Recent',
    subtitle: 'Stations played on this machine',
    stations: []
  },
  favorites: {
    title: 'Favorites and imports',
    subtitle: 'Saved and imported streams',
    stations: []
  }
};

const topTabs: TopTab[] = [
  {screen: 'home', label: 'Overview'},
  {screen: 'explore', label: 'Explore'},
  {screen: 'countries', label: 'Countries'},
  {screen: 'search', label: 'Search'},
  {screen: 'nearby', label: 'Nearby'},
  {screen: 'now-playing', label: 'Now Playing'},
  {screen: 'stats', label: 'Stats'},
  {screen: 'recent', label: 'Recent'},
  {screen: 'favorites', label: 'Favorites'},
  {screen: 'settings', label: 'Settings'}
];

export function App({store: providedStore, providers: providedProviders}: AppProps): React.ReactElement {
  const {exit} = useApp();
  const {columns, rows} = useWindowSize();
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
  const [stationContexts, setStationContexts] = useState<Record<StationContextKey, StationContext>>(initialStationContexts);
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
  const playStationRef = useRef<(station: Station, options?: PlayStationOptions) => void>(() => undefined);
  const screenRef = useRef<Screen>(screen);
  const selectedRef = useRef(selected);
  const selectedByScreenRef = useRef<Partial<Record<Screen, number>>>({});
  const stationContextsRef = useRef(stationContexts);
  const lastStationContextKeyRef = useRef<StationContextKey>('explore');
  const lastExploreScreenRef = useRef<Screen>('explore');

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

  screenRef.current = screen;
  selectedRef.current = selected;
  stationContextsRef.current = stationContexts;

  const renderedStationContextKey = stationContextKeyForScreen(screen);
  const activeStationContextKey = renderedStationContextKey ?? lastStationContextKeyRef.current;
  const stationContext = stationContexts[activeStationContextKey];
  const stationCounts = useMemo<Record<StationContextKey, number>>(
    () => ({
      explore: applyStationFilters(stationContexts.explore.stations, filters).length,
      stations: applyStationFilters(stationContexts.stations.stations, filters).length,
      search: applyStationFilters(stationContexts.search.stations, filters).length,
      nearby: applyStationFilters(stationContexts.nearby.stations, filters).length,
      recent: applyStationFilters(stationContexts.recent.stations, filters).length,
      favorites: applyStationFilters(stationContexts.favorites.stations, filters).length
    }),
    [filters, stationContexts]
  );
  const itemCountsRef = useRef<Record<Screen, number>>({
    home: homeItems.length,
    explore: 0,
    countries: 0,
    stations: 0,
    search: 0,
    nearby: 0,
    map: 0,
    'now-playing': 1,
    stats: 1,
    recent: 0,
    favorites: 0,
    settings: settingsItems.length
  });
  itemCountsRef.current = {
    home: homeItems.length,
    explore: stationCounts.explore,
    countries: filteredCountries.length,
    stations: stationCounts.stations,
    search: stationCounts.search,
    nearby: stationCounts.nearby,
    map: filteredCountries.length,
    'now-playing': 1,
    stats: 1,
    recent: stationCounts.recent,
    favorites: stationCounts.favorites,
    settings: settingsItems.length
  };

  const displayStations = useMemo(() => applyStationFilters(stationContext.stations, filters), [filters, stationContext.stations]);
  displayStationsRef.current = displayStations;
  const sleepLabel = sleepUntil ? `Sleep ${formatTimeLeft(sleepUntil - Date.now())}` : 'Sleep off';
  const layout = computeTerminalLayout(columns, rows);
  const frameWidth = Math.max(40, layout.columns - 2);

  useEffect(() => player.onChange(setPlayback), [player]);

  useEffect(() => player.onMetadata(setNowPlaying), [player]);

  useEffect(() => {
    selectedByScreenRef.current[screen] = selected;
    if (renderedStationContextKey) {
      lastStationContextKeyRef.current = renderedStationContextKey;
    }

    if (screen === 'explore' || screen === 'stations') {
      lastExploreScreenRef.current = screen;
    }
  }, [renderedStationContextKey, screen, selected]);

  useEffect(() => {
    if (screen !== 'now-playing' || process.env.RADIO_ATLAS_DISABLE_ANIMATION === '1') {
      return;
    }

    const fastStyles = new Set(['sdr', 'blocks', 'leds', 'stars', 'snow', 'equalizer', 'waterfall', 'oscilloscope', 'radar', 'neon', 'matrix', 'hologram']);
    const intervalMs = fastStyles.has(library.settings.receiverStyle) ? 50 : 130;
    const timer = setInterval(() => setPulse(value => (value + 1) % 240), intervalMs);
    return () => clearInterval(timer);
  }, [library.settings.receiverStyle, screen]);

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
      setLibrary(store.finishActiveListeningSession());
      void player.stop();
      setSleepUntil(null);
      return;
    }

    const timer = setTimeout(() => {
      setLibrary(store.finishActiveListeningSession());
      void player.stop();
      setSleepUntil(null);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [player, sleepUntil, store]);

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

  const setStationContextFor = useCallback((key: StationContextKey, context: StationContext) => {
    setStationContexts(current => ({...current, [key]: context}));
  }, []);

  const go = useCallback((next: Screen, options: NavigationOptions = {}) => {
    selectedByScreenRef.current[screenRef.current] = selectedRef.current;
    const remembered = selectedByScreenRef.current[next] ?? 0;
    const nextSelection = options.resetSelection ? 0 : remembered;

    setScreen(next);
    setSelected(clamp(nextSelection, (itemCountsRef.current[next] ?? 0) - 1));
    if (options.clearMessage !== false) {
      setMessage(null);
    }
  }, []);

  const shutdown = useCallback(() => {
    store.finishActiveListeningSession();
    player.stop().finally(exit);
  }, [exit, player, store]);

  const showStationContext = useCallback(
    (context: StationContext, next: Screen = 'stations', options: NavigationOptions = {}) => {
      setStationContextFor(stationContextKeyForScreen(next) ?? 'stations', context);
      go(next, {resetSelection: options.resetSelection ?? true, clearMessage: options.clearMessage});
    },
    [go, setStationContextFor]
  );

  const loadPopular = useCallback(async () => {
    setLoadingStations(true);
    setMessage(null);
    go('explore', {resetSelection: true});
    try {
      const stations = await providers.popular(90);
      setStationContextFor('explore', {
        title: 'Explore world',
        subtitle: 'Popular live stations from Radio Browser',
        stations
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load world stations.');
    } finally {
      setLoadingStations(false);
    }
  }, [go, providers, setStationContextFor]);

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
        }, 'stations');
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
        setStationContextFor('search', {
          title: `Search: ${query}`,
          subtitle: 'Matches across enabled public station directories',
          stations
        });
        selectedByScreenRef.current.search = 0;
        setSelected(0);
        setEditingSearch(false);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Search failed.');
      } finally {
        setLoadingStations(false);
      }
    },
    [filters, providers, searchQuery, setStationContextFor]
  );

  const loadNearby = useCallback(async () => {
    setLoadingStations(true);
    setMessage(null);
    go('nearby', {resetSelection: stationContextsRef.current.nearby.stations.length === 0});
    try {
      if (!settingsRef.current.enableNearbyLocation) {
        setStationContextFor('nearby', {
          title: 'Nearby',
          subtitle: 'IP-based location is off. Enable it in Settings or use :location on.',
          stations: []
        });
        return;
      }

      const detected = location ?? (await providers.detectLocation());
      setLocation(detected);
      if (!detected) {
        setStationContextFor('nearby', {
          title: 'Nearby',
          subtitle: 'Location detection was unavailable',
          stations: []
        });
        return;
      }

      const stations = await providers.nearby(detected, 90);
      setStationContextFor('nearby', {
        title: 'Nearby',
        subtitle: `${[detected.city, detected.region, detected.country].filter(Boolean).join(', ')} · ${detected.source}`,
        stations
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load nearby stations.');
    } finally {
      setLoadingStations(false);
    }
  }, [go, location, providers, setStationContextFor]);

  const playStation = useCallback(
    async (station: Station, options: PlayStationOptions = {}) => {
      setMessage(`Tuning ${station.name}...`);
      setNowPlaying(null);

      try {
        const resolved = await providers.resolve(station);
        await player.play(station, resolved.url);
        setPlayingStation(station);
        store.startListeningSession(station);
        setLibrary(store.addRecent(station));
        if (options.openNowPlaying) {
          go('now-playing');
        }

        setMessage(`Playing: ${station.name}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not tune station.';
        const currentList = displayStationsRef.current;
        const currentIndex = currentList.findIndex(item => stationKey(item) === stationKey(station));
        const nextStation = currentIndex >= 0 ? currentList[currentIndex + 1] : undefined;
        if (settingsRef.current.skipBrokenStreams && nextStation) {
          setMessage(`${message} Skipping to ${nextStation.name}.`);
          setSelected(currentIndex + 1);
          setTimeout(() => playStationRef.current(nextStation, options), 250);
          return;
        }

        setMessage(message);
      }
    },
    [go, player, providers, store]
  );
  playStationRef.current = playStation;

  const toggleFavorite = useCallback(
    (station: Station | null) => {
      if (!station) {
        setMessage('Select or play a station before pressing f.');
        return;
      }

      const wasFavorite = store.isFavorite(station);
      setLibrary(store.toggleFavorite(station));
      setMessage(`${wasFavorite ? 'Removed from' : 'Added to'} favorites: ${station.name}`);
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
    }, 'favorites', {resetSelection: false});
  }, [library.favorites, library.imported, showStationContext]);

  const selectedStation = displayStations[selected] ?? null;

  const openScreen = useCallback(
    (target: Screen) => {
      if (target === 'explore') {
        const previousExploreScreen = lastExploreScreenRef.current;
        if (previousExploreScreen === 'stations' && stationContextsRef.current.stations.stations.length > 0) {
          go('stations');
        } else if (stationContextsRef.current.explore.stations.length > 0) {
          go('explore');
        } else {
          void loadPopular();
        }
      } else if (target === 'nearby') {
        if (stationContextsRef.current.nearby.stations.length > 0) {
          go('nearby');
        } else {
          void loadNearby();
        }
      } else if (target === 'search') {
        go('search');
        setEditingSearch(true);
      } else if (target === 'recent') {
        showStationContext({
          title: 'Recent',
          subtitle: 'Stations played on this machine',
          stations: library.recent.map(item => item.station)
        }, 'recent', {resetSelection: false});
      } else if (target === 'favorites') {
        loadImported();
      } else {
        go(target);
      }
    },
    [go, library.recent, loadImported, loadNearby, loadPopular, showStationContext]
  );

  const openAdjacentTab = useCallback(
    (direction: 1 | -1) => {
      const active = activeTabForScreen(screen);
      const currentIndex = topTabs.findIndex(tab => tab.screen === active);
      const nextIndex = (currentIndex + direction + topTabs.length) % topTabs.length;
      const next = topTabs[nextIndex];
      if (next) {
        openScreen(next.screen);
      }
    },
    [openScreen, screen]
  );

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

      if (name === 'stats') {
        go('stats');
        return;
      }

      if (name === 'recent') {
        showStationContext({
          title: 'Recent',
          subtitle: 'Stations played on this machine',
          stations: library.recent.map(item => item.station)
        }, 'recent', {resetSelection: false});
        return;
      }

      if (name === 'favorites' || name === 'imports') {
        loadImported();
        return;
      }

      if (name === 'favorite' || name === 'fav') {
        toggleFavorite(favoriteTarget(screen, selectedStation, playingStation));
        return;
      }

      if (name === 'settings') {
        go('settings');
        return;
      }

      if (name === 'stop') {
        setLibrary(store.finishActiveListeningSession());
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
      playingStation,
      runSearch,
      screen,
      selectedStation,
      setVolume,
      showStationContext,
      store,
      toggleFavorite,
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

      if (isEditableInput(input, key)) {
        setCommandText(value => applyTextInput(value, input, key));
      }

      return;
    }

    if (key.tab) {
      openAdjacentTab(key.shift ? -1 : 1);
      return;
    }

    if (key.rightArrow) {
      openAdjacentTab(1);
      return;
    }

    if (key.leftArrow) {
      openAdjacentTab(-1);
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

      if (isEditableInput(input, key)) {
        setSearchQuery(value => applyTextInput(value, input, key));
      }

      return;
    }

    if (screen === 'countries' && editingCountryFilter) {
      if (key.return || key.escape) {
        setEditingCountryFilter(false);
        setSelected(0);
        return;
      }

      if (isEditableInput(input, key)) {
        setCountryFilter(value => applyTextInput(value, input, key));
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

    if (screen === 'home' && (/^[1-9]$/.test(input) || input === '0')) {
      const menuIndex = input === '0' ? 9 : Number(input) - 1;
      setSelected(menuIndex);
      const target = homeItems[menuIndex]?.screen;
      if (target) {
        openScreen(target);
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
      toggleFavorite(favoriteTarget(screen, selectedStation, playingStation));
      return;
    }

    if (input === ' ') {
      void player.togglePause();
      return;
    }

    if (input === 'n' && screen === 'now-playing') {
      playAdjacent(1);
      return;
    }

    if (input === 'p' && screen === 'now-playing') {
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
        if (target) {
          openScreen(target);
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
        } else if (item === 'Cycle spectrum style') {
          setLibrary(store.updateSettings({receiverStyle: nextReceiverStyle(library.settings.receiverStyle)}));
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
    return itemCountsRef.current[currentScreen] ?? 0;
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
          stations={displayStations}
          selected={selected}
          theme={theme}
          favorites={favoriteKeys}
          experimentalOn={library.settings.enableRadioGarden}
          filterLabel={filterLabel}
          pageSize={layout.stationRows}
        />
      );
    }

    if (screen === 'nearby' || screen === 'explore' || screen === 'stations' || screen === 'recent' || screen === 'favorites') {
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
          receiverStyle={library.settings.receiverStyle}
          width={layout.receiverWidth}
          height={layout.receiverRows}
        />
      );
    }

    if (screen === 'stats') {
      return <StatsScreen library={library} playback={playback} theme={theme} width={frameWidth} height={layout.contentRows} />;
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
          width={frameWidth}
        />
      );
    }

    return <Text>Unknown screen.</Text>;
  })();

  const hasTopTabs = !layout.compact;

  return (
    <Box flexDirection="column" paddingX={1} height={layout.rows} width={layout.columns} overflow="hidden" backgroundColor={appBackground}>
      {hasTopTabs ? (
        <Box height={3} marginBottom={1} flexShrink={0} backgroundColor={appBackground}>
          <TopTabs
            tabs={topTabs}
            active={activeTabForScreen(screen)}
            theme={theme}
            width={frameWidth}
            rightLabel={`${playback.backend || 'no backend'} · ${playback.state}`}
          />
        </Box>
      ) : null}
      <Box height={layout.contentRows} width={frameWidth} flexDirection="column" overflowY="hidden" flexShrink={0} backgroundColor={appBackground}>
        {content}
        {message ? (
          <Box marginTop={1}>
            <Text color={themeAccent(theme)}>{message}</Text>
          </Box>
        ) : null}
      </Box>
      <Box height={layout.footerRows} width={frameWidth} flexDirection="column" flexShrink={0} backgroundColor={panelBackground}>
        {commandMode ? (
          <Text color={themeAccent(theme)}>COMMAND :{commandText}</Text>
        ) : (
          <Text color="gray">←/→ tabs · : command · f favorite · [/] page · +/- volume · m mute</Text>
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

function favoriteTarget(screen: Screen, selectedStation: Station | null, playingStation: Station | null): Station | null {
  if (screen === 'now-playing') {
    return playingStation;
  }

  if (screen === 'explore' || screen === 'stations' || screen === 'search' || screen === 'nearby' || screen === 'recent' || screen === 'favorites') {
    return selectedStation;
  }

  return playingStation;
}

function activeTabForScreen(screen: Screen): Screen {
  return screen === 'stations' ? 'explore' : screen;
}

function stationContextKeyForScreen(screen: Screen): StationContextKey | null {
  if (
    screen === 'explore' ||
    screen === 'stations' ||
    screen === 'search' ||
    screen === 'nearby' ||
    screen === 'recent' ||
    screen === 'favorites'
  ) {
    return screen;
  }

  return null;
}

function isEditableInput(input: string, key: {backspace?: boolean; delete?: boolean; ctrl?: boolean; meta?: boolean}): boolean {
  return Boolean(key.backspace || key.delete || input);
}

function applyTextInput(
  value: string,
  input: string,
  key: {backspace?: boolean; delete?: boolean; ctrl?: boolean; meta?: boolean}
): string {
  if (key.backspace || key.delete || (key.ctrl && input === 'h')) {
    return value.slice(0, -1);
  }

  if (key.ctrl || key.meta) {
    return value;
  }

  let next = value;
  for (const character of input) {
    if (character === '\u007f' || character === '\b') {
      next = next.slice(0, -1);
    } else if (character >= ' ') {
      next += character;
    }
  }

  return next;
}
