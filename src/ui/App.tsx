import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, useApp, useInput, useStdin, useWindowSize} from 'ink';
import {ProviderManager} from '../providers/provider-manager.js';
import {PlayerController} from '../player/player-controller.js';
import {JsonLibraryStore, stationKey} from '../storage/store.js';
import type {AppSettings, Country, IcyNowPlaying, LibraryState, LocationGuess, PlaybackState, Screen, Station} from '../types.js';
import {appBackground, nextReceiverStyle, nextTheme, panelBackground, themeAccent} from './theme.js';
import {HomeScreen, homeItems} from './screens/HomeScreen.js';
import {CountriesScreen} from './screens/CountriesScreen.js';
import {StationScreen} from './screens/StationScreen.js';
import {SearchScreen} from './screens/SearchScreen.js';
import {NowPlayingScreen} from './screens/NowPlayingScreen.js';
import {SettingsScreen, settingsItems} from './screens/SettingsScreen.js';
import {MapScreen} from './screens/MapScreen.js';
import {StatsScreen} from './screens/StatsScreen.js';
import {TopTabs} from './components/TopTabs.js';
import {computeTerminalLayout} from './layout.js';
import {truncate} from './format.js';
import {playbackFooterText, shouldShowPlaybackFooter} from './playback-footer.js';
import {
  activeTabForScreen,
  addMediaKeyBinding,
  applyStationFilters,
  applyTextInput,
  clamp,
  clampVolume,
  favoriteTarget,
  formatFilterLabel,
  formatTimeLeft,
  initialStationContexts,
  isEditableInput,
  isPlainPrintableInput,
  mediaActionLabel,
  mediaTransportActionForInput,
  nextSleepTimerMinutes,
  normalizeMediaKeyBindings,
  parseMediaActionName,
  stationApproximateTime,
  stationContextKeyForScreen,
  topTabs,
  type MediaTransportAction,
  type NavigationOptions,
  type PlaybackQueue,
  type PlayStationOptions,
  type SearchFilters,
  type StationContext,
  type StationContextKey
} from './app-state.js';

type AppProps = {
  store?: JsonLibraryStore;
  providers?: ProviderManager;
};

const LIVE_RECEIVER_STYLES = new Set<AppSettings['receiverStyle']>([
  'sdr',
  'blocks',
  'leds',
  'stars',
  'equalizer',
  'waterfall',
  'oscilloscope',
  'radar',
  'neon',
  'matrix',
  'hologram',
  'cube'
]);
const LIVE_RECEIVER_PULSE_MS = 100;
const AMBIENT_RECEIVER_PULSE_MS = 180;

export function App({store: providedStore, providers: providedProviders}: AppProps): React.ReactElement {
  const {exit} = useApp();
  const {stdin} = useStdin();
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
  const [capturingTransportAction, setCapturingTransportAction] = useState<MediaTransportAction | null>(null);
  const displayStationsRef = useRef<Station[]>([]);
  const playbackQueueRef = useRef<PlaybackQueue | null>(null);
  const lastRawTransportAtRef = useRef(0);
  const playStationRef = useRef<(station: Station, options?: PlayStationOptions) => void>(() => undefined);
  const screenRef = useRef<Screen>(screen);
  const selectedRef = useRef(selected);
  const selectedByScreenRef = useRef<Partial<Record<Screen, number>>>({});
  const stationContextsRef = useRef(stationContexts);
  const lastStationContextKeyRef = useRef<StationContextKey>('explore');
  const lastExploreScreenRef = useRef<Screen>('explore');
  const lastSubmittedSearchRef = useRef('');

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
  const showPlaybackFooter = shouldShowPlaybackFooter(playingStation, playback);
  const layout = computeTerminalLayout(columns, rows, showPlaybackFooter ? 3 : 2);
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
    if (
      screen !== 'now-playing' ||
      process.env.RADIOCLI_DISABLE_ANIMATION === '1' ||
      process.env.RADIO_ATLAS_DISABLE_ANIMATION === '1'
    ) {
      return;
    }

    const intervalMs = LIVE_RECEIVER_STYLES.has(library.settings.receiverStyle) ? LIVE_RECEIVER_PULSE_MS : AMBIENT_RECEIVER_PULSE_MS;
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

  const stationMatches = useCallback((left: Station, right: Station) => stationKey(left) === stationKey(right), []);

  const queueContainsStation = useCallback(
    (queue: PlaybackQueue | null, station: Station) => Boolean(queue?.stations.some(item => stationMatches(item, station))),
    [stationMatches]
  );

  const updateSettings = useCallback(
    (settings: Partial<AppSettings>) => {
      const nextLibrary = store.updateSettings(settings);
      settingsRef.current = nextLibrary.settings;
      setLibrary(nextLibrary);
      return nextLibrary;
    },
    [store]
  );

  const updateMediaKeys = useCallback(
    (mediaKeys: AppSettings['mediaKeys']) => {
      updateSettings({mediaKeys: normalizeMediaKeyBindings(mediaKeys)});
    },
    [updateSettings]
  );

  const beginLearningTransportKey = useCallback((action: MediaTransportAction) => {
    setCapturingTransportAction(action);
    setMessage(`Press a key for ${mediaActionLabel(action)}. Esc cancels.`);
  }, []);

  const resetLearnedTransportKeys = useCallback(() => {
    updateMediaKeys({previous: [], playPause: [], next: []});
    setMessage('Learned media keys reset. Built-in fallbacks still work.');
  }, [updateMediaKeys]);

  const saveLearnedTransportKey = useCallback(
    (action: MediaTransportAction, input: string) => {
      const mediaKeys = addMediaKeyBinding(settingsRef.current.mediaKeys, action, input);
      updateMediaKeys(mediaKeys);
      setCapturingTransportAction(null);
      setMessage(`Learned ${mediaActionLabel(action)} key.`);
    },
    [updateMediaKeys]
  );

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
        lastSubmittedSearchRef.current = query.trim();
        setSelected(0);
        setEditingSearch(true);
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

  const queueFromCurrentList = useCallback(
    (station: Station): PlaybackQueue => {
      const sourceScreen = screenRef.current;
      const sourceContextKey = stationContextKeyForScreen(sourceScreen);
      const currentList = displayStationsRef.current;
      if (currentList.some(item => stationMatches(item, station))) {
        return {
          title: sourceContextKey ? stationContextsRef.current[sourceContextKey].title : 'Current station list',
          sourceScreen,
          sourceContextKey,
          stations: currentList
        };
      }

      if (queueContainsStation(playbackQueueRef.current, station)) {
        return playbackQueueRef.current!;
      }

      return {
        title: station.name,
        sourceScreen,
        sourceContextKey: null,
        stations: [station]
      };
    },
    [queueContainsStation, stationMatches]
  );

  const rememberQueueSelection = useCallback((queue: PlaybackQueue, index: number) => {
    if (queue.sourceContextKey) {
      selectedByScreenRef.current[queue.sourceScreen] = index;
    }

    if (screenRef.current === queue.sourceScreen) {
      setSelected(index);
    }
  }, []);

  const playStation = useCallback(
    async (station: Station, options: PlayStationOptions = {}) => {
      const queue = options.queue ?? queueFromCurrentList(station);
      setMessage(`Tuning ${station.name}...`);
      setNowPlaying(null);

      try {
        const resolved = await providers.resolve(station);
        await player.play(station, resolved.url);
        setPlayingStation(station);
        playbackQueueRef.current = queue;
        store.startListeningSession(station);
        setLibrary(store.addRecent(station));
        if (options.openNowPlaying) {
          go('now-playing');
        }

        setMessage(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not tune station.';
        const currentList = queue.stations;
        const currentIndex = currentList.findIndex(item => stationKey(item) === stationKey(station));
        const nextStation = currentIndex >= 0 ? currentList[currentIndex + 1] : undefined;
        if (settingsRef.current.skipBrokenStreams && nextStation) {
          setMessage(`${message} Skipping to ${nextStation.name}.`);
          rememberQueueSelection(queue, currentIndex + 1);
          setTimeout(() => playStationRef.current(nextStation, {...options, queue}), 250);
          return;
        }

        setMessage(message);
      }
    },
    [go, player, providers, queueFromCurrentList, rememberQueueSelection, store]
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
      updateSettings({volume: clamped});
      void player.setVolume(clamped);
    },
    [player, updateSettings]
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

  const cycleDisplayColor = useCallback(() => {
    const theme = nextTheme(settingsRef.current.theme);
    updateSettings({theme});
    setMessage(`Display color: ${theme}`);
  }, [updateSettings]);

  const cycleSpectrumStyle = useCallback(() => {
    const receiverStyle = nextReceiverStyle(settingsRef.current.receiverStyle);
    updateSettings({receiverStyle});
    setMessage(`Spectrum style: ${receiverStyle}`);
  }, [updateSettings]);

  const toggleRadioGarden = useCallback(() => {
    const enableRadioGarden = !settingsRef.current.enableRadioGarden;
    updateSettings({enableRadioGarden});
    setMessage(`Radio Garden ${enableRadioGarden ? 'enabled' : 'disabled'}.`);
    setTimeout(refreshProviderHealth, 0);
  }, [refreshProviderHealth, updateSettings]);

  const toggleNearbyLocation = useCallback(() => {
    const enableNearbyLocation = !settingsRef.current.enableNearbyLocation;
    updateSettings({enableNearbyLocation});
    setMessage(`Nearby location lookup ${enableNearbyLocation ? 'enabled' : 'disabled'}.`);
  }, [updateSettings]);

  const cyclePlaybackBackend = useCallback(() => {
    const current = settingsRef.current.preferredBackend;
    const preferredBackend = current === 'auto' ? 'mpv' : current === 'mpv' ? 'ffplay' : 'auto';
    updateSettings({preferredBackend});
    setMessage(`Playback backend: ${preferredBackend}`);
  }, [updateSettings]);

  const toggleSkipBrokenStreams = useCallback(() => {
    const skipBrokenStreams = !settingsRef.current.skipBrokenStreams;
    updateSettings({skipBrokenStreams});
    setMessage(`Skip broken streams ${skipBrokenStreams ? 'enabled' : 'disabled'}.`);
  }, [updateSettings]);

  const cycleSleepTimer = useCallback(() => {
    const currentMinutes = sleepUntil ? Math.round((sleepUntil - Date.now()) / 60000) : null;
    const next = nextSleepTimerMinutes(currentMinutes);
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
        if (!value.trim()) {
          setMessage('Usage: :country <name or code>');
          return;
        }

        const availableCountries = countries.length > 0 ? countries : await providers.countries();
        if (countries.length === 0) {
          setCountries(availableCountries);
        }

        const match = availableCountries.find(country =>
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
        updateSettings({enableNearbyLocation: enabled});
        setMessage(`Nearby location lookup ${enabled ? 'enabled' : 'disabled'}.`);
        return;
      }

      if (name === 'timeout') {
        const seconds = Number(value);
        if (Number.isFinite(seconds)) {
          updateSettings({tuneTimeoutSeconds: Math.min(45, Math.max(3, seconds))});
        }
        return;
      }

      if (name === 'skip') {
        const enabled = value !== 'off' && value !== 'false' && value !== '0';
        updateSettings({skipBrokenStreams: enabled});
        return;
      }

      if (name === 'learn' || name === 'bind' || name === 'key') {
        const action = parseMediaActionName(value);
        if (!action) {
          setMessage('Usage: :learn previous, :learn play, or :learn next');
          return;
        }

        beginLearningTransportKey(action);
        return;
      }

      if (name === 'keys') {
        if (value === 'reset' || value === 'clear') {
          resetLearnedTransportKeys();
          return;
        }

        const mediaKeys = normalizeMediaKeyBindings(settingsRef.current.mediaKeys);
        setMessage(`Learned keys: prev ${mediaKeys.previous.length}, play ${mediaKeys.playPause.length}, next ${mediaKeys.next.length}. Use :keys reset to clear.`);
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
      providers,
      player,
      playingStation,
      beginLearningTransportKey,
      resetLearnedTransportKeys,
      runSearch,
      screen,
      selectedStation,
      setVolume,
      showStationContext,
      store,
      toggleFavorite,
      toggleMute,
      updateSettings
    ]
  );

  const playAdjacent = useCallback(
    (direction: 1 | -1) => {
      if (!playingStation) {
        setMessage('Tune a station from a list before using previous/next.');
        return;
      }

      const queue = queueContainsStation(playbackQueueRef.current, playingStation)
        ? playbackQueueRef.current!
        : queueFromCurrentList(playingStation);
      if (queue.stations.length <= 1) {
        setMessage('No adjacent stations in the current source list.');
        return;
      }

      const currentKey = stationKey(playingStation);
      const currentIndex = queue.stations.findIndex(station => stationKey(station) === currentKey);
      const nextIndex =
        currentIndex === -1
          ? 0
          : (currentIndex + direction + queue.stations.length) % queue.stations.length;
      rememberQueueSelection(queue, nextIndex);
      const nextStation = queue.stations[nextIndex];
      if (nextStation) {
        void playStation(nextStation, {queue});
      }
    },
    [playStation, playingStation, queueContainsStation, queueFromCurrentList, rememberQueueSelection]
  );

  useEffect(() => {
    const onData = (data: Buffer | string) => {
      const rawInput = String(data);
      if (capturingTransportAction) {
        if (rawInput === '\u001B') {
          setCapturingTransportAction(null);
          setMessage('Media key learning canceled.');
          return;
        }

        if (rawInput === '\u0003' || rawInput.length === 0) {
          return;
        }

        saveLearnedTransportKey(capturingTransportAction, rawInput);
        return;
      }

      const action = mediaTransportActionForInput(rawInput, settingsRef.current.mediaKeys);
      if (isPlainPrintableInput(rawInput) && (commandMode || (screen === 'search' && editingSearch) || ((screen === 'countries' || screen === 'map') && editingCountryFilter))) {
        return;
      }

      if (action === 'previous') {
        lastRawTransportAtRef.current = Date.now();
        playAdjacent(-1);
      } else if (action === 'next') {
        lastRawTransportAtRef.current = Date.now();
        playAdjacent(1);
      } else if (action === 'playPause') {
        lastRawTransportAtRef.current = Date.now();
        void player.togglePause();
      }
    };

    stdin.on('data', onData);
    return () => {
      stdin.off('data', onData);
    };
  }, [capturingTransportAction, commandMode, editingCountryFilter, editingSearch, playAdjacent, player, saveLearnedTransportKey, screen, stdin]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      shutdown();
      return;
    }

    if (capturingTransportAction) {
      return;
    }

    if (Date.now() - lastRawTransportAtRef.current < 50) {
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

    if (key.shift && key.leftArrow) {
      playAdjacent(-1);
      return;
    }

    if (key.shift && key.rightArrow) {
      playAdjacent(1);
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
        if (searchQuery.trim() && searchQuery.trim() === lastSubmittedSearchRef.current && selectedStation) {
          void playStation(selectedStation);
        } else {
          void runSearch();
        }
        return;
      }

      if (key.escape) {
        setEditingSearch(false);
        return;
      }

      if (isEditableInput(input, key)) {
        setSearchQuery(value => applyTextInput(value, input, key));
        setEditingSearch(true);
        return;
      }
    }

    if ((screen === 'countries' || screen === 'map') && editingCountryFilter) {
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

    if (input === ',' || input === '<') {
      playAdjacent(-1);
      return;
    }

    if (input === '.' || input === '>') {
      playAdjacent(1);
      return;
    }

    if (input === 't') {
      cycleDisplayColor();
      return;
    }

    if (input === 'v') {
      cycleSpectrumStyle();
      return;
    }

    if (input === 'o') {
      cyclePlaybackBackend();
      return;
    }

    if (input === 'g') {
      toggleRadioGarden();
      return;
    }

    if (input === 'l') {
      toggleNearbyLocation();
      return;
    }

    if (input === 'x') {
      toggleSkipBrokenStreams();
      return;
    }

    if (input === 'r') {
      refreshProviderHealth();
      setMessage('Provider health refreshed.');
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
      if (screen === 'countries' || screen === 'map') {
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
          cycleDisplayColor();
        } else if (item === 'Toggle Radio Garden experimental adapter') {
          toggleRadioGarden();
        } else if (item === 'Cycle spectrum style') {
          cycleSpectrumStyle();
        } else if (item === 'Toggle nearby location lookup') {
          toggleNearbyLocation();
        } else if (item === 'Cycle playback backend') {
          cyclePlaybackBackend();
        } else if (item === 'Volume up') {
          adjustVolume(5);
        } else if (item === 'Volume down') {
          adjustVolume(-5);
        } else if (item === 'Mute or unmute') {
          toggleMute();
        } else if (item === 'Toggle skip broken streams') {
          toggleSkipBrokenStreams();
        } else if (item === 'Refresh provider health') {
          refreshProviderHealth();
          setMessage('Provider health refreshed.');
        } else if (item === 'Learn previous media key') {
          beginLearningTransportKey('previous');
        } else if (item === 'Learn play/pause media key') {
          beginLearningTransportKey('playPause');
        } else if (item === 'Learn next media key') {
          beginLearningTransportKey('next');
        } else if (item === 'Reset learned media keys') {
          resetLearnedTransportKeys();
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
  const globalFooter = '←/→ tabs · F7/F9 or ,/. station · F8 pause · t/v display · +/- volume · q quit';
  const playbackFooter = playbackFooterText({
    station: playingStation,
    playback,
    metadata: nowPlaying,
    queue: playbackQueueRef.current,
    favorite: store.isFavorite(playingStation),
    sleepLabel,
    width: frameWidth
  });
  const pageFooter = (() => {
    if (capturingTransportAction) {
      return `Learn ${mediaActionLabel(capturingTransportAction)} key: press key · Esc cancel`;
    }

    if (commandMode) {
      return `COMMAND :${commandText}`;
    }

    if (screen === 'home') {
      return '↑/↓ move · Enter open · 1-9/0 jump · : command';
    }

    if (screen === 'search' && editingSearch) {
      return 'Type query · Backspace edit · Enter search/tune · Esc finish';
    }

    if (screen === 'search') {
      return '/ edit query · ↑/↓ or n/p move · Enter tune · f favorite · b home';
    }

    if ((screen === 'countries' || screen === 'map') && editingCountryFilter) {
      return 'Type country filter · Enter/Esc apply';
    }

    if (screen === 'countries') {
      return '/ filter · ↑/↓ move · Enter open stations · b home';
    }

    if (screen === 'map') {
      return '/ filter · ↑/↓ move · Enter open country · b home';
    }

    if (screen === 'nearby' || screen === 'explore' || screen === 'stations' || screen === 'recent' || screen === 'favorites') {
      return '↑/↓ or n/p move · Enter tune · f favorite · [/] page · b home';
    }

    if (screen === 'now-playing') {
      return 'space/F8 pause · f favorite · m mute · s sleep · d diagnostics · b home';
    }

    if (screen === 'settings') {
      return 'Enter change selected · g Radio Garden · l location · x skip · o backend · r health · b home';
    }

    if (screen === 'stats') {
      return 'b home';
    }

    return ': command';
  })();

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
        {playbackFooter ? <Text color={themeAccent(theme)}>{playbackFooter}</Text> : null}
        <Text color={commandMode || capturingTransportAction ? themeAccent(theme) : 'gray'}>
          {truncate(pageFooter, frameWidth)}
        </Text>
        <Text color="gray">{truncate(globalFooter, frameWidth)}</Text>
      </Box>
    </Box>
  );
}
