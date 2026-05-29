import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Box, Text, useApp, useStdin, useWindowSize} from 'ink';
import {ProviderManager} from '../providers/provider-manager.js';
import {PlayerController} from '../player/player-controller.js';
import {playbackBackendInstallHint} from '../player/backend-install.js';
import {JsonLibraryStore, stationKey} from '../storage/store.js';
import type {AppSettings, Country, IcyNowPlaying, LibraryState, LocationGuess, PlaybackState, Screen, Station} from '../types.js';
import {appBackground, nextReceiverStyle, nextTheme, panelBackground, themeAccent} from './theme.js';
import {homeItems, settingsItems} from './screen-items.js';
import {AppContent} from './AppContent.js';
import {TopTabs} from './components/TopTabs.js';
import {computeTerminalLayout} from './layout.js';
import {truncate} from './format.js';
import {playbackFooterText, shouldShowPlaybackFooter} from './playback-footer.js';
import {pageFooterText} from './page-footer.js';
import {useAppInput} from './use-app-input.js';
import {useCommandExecutor} from './use-command-executor.js';
import {
  activeTabForScreen,
  addMediaKeyBinding,
  applyStationFilters,
  clamp,
  clampVolume,
  defaultExploreCursor,
  formatExploreCursor,
  formatFilterLabel,
  formatTimeLeft,
  initialStationContexts,
  mediaActionLabel,
  moveExploreCursor as shiftExploreCursor,
  nextSleepTimerMinutes,
  normalizeMediaKeyBindings,
  shouldAnimateReceiver,
  stationApproximateTime,
  stationContextKeyForScreen,
  topTabs,
  type MediaTransportAction,
  type NavigationOptions,
  type PlaybackQueue,
  type PlayStationOptions,
  type SearchFilters,
  type StationContext,
  type StationContextKey,
  type ExploreCursor,
  type ExploreMoveDirection
} from './app-state.js';

type AppProps = {
  store?: JsonLibraryStore;
  providers?: ProviderManager;
};

const LIVE_RECEIVER_STYLES = new Set<AppSettings['receiverStyle']>([
  'spectrum',
  'oscilloscope',
  'waterfall',
  'cassette',
  'equalizer',
  'motion-bars',
  'motion-blob',
  'motion-area',
  'motion-dots',
  'motion-contour',
  'motion-braid',
  'blocks',
  'leds',
  'stars',
  'radar',
  'matrix',
  'hologram',
  'cube',
  'fire',
  'fireworks',
  'plasma',
  'radio-waves',
  'raindrops',
  'spinning-donut',
  'starfield'
]);
const LIVE_RECEIVER_PULSE_MS = 80;
const AMBIENT_RECEIVER_PULSE_MS = 140;

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
  const [availableBackends, setAvailableBackends] = useState<string[]>(() => player.detectedBackends());
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
  const [exploreCursor, setExploreCursor] = useState<ExploreCursor>(defaultExploreCursor);
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
  const lastSubmittedSearchRef = useRef('');
  const exploreCursorRef = useRef(exploreCursor);
  const exploreRequestRef = useRef(0);
  const exploreMoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const libraryStations = useMemo(() => buildLibraryStations(library), [library.favorites, library.imported, library.recent]);
  const activeStationContexts = useMemo<Record<StationContextKey, StationContext>>(
    () => ({
      ...stationContexts,
      library: {
        title: 'Library',
        subtitle: librarySubtitle(library),
        stations: libraryStations
      }
    }),
    [library, libraryStations, stationContexts]
  );

  screenRef.current = screen;
  selectedRef.current = selected;
  stationContextsRef.current = activeStationContexts;
  exploreCursorRef.current = exploreCursor;

  const renderedStationContextKey = stationContextKeyForScreen(screen);
  const activeStationContextKey = renderedStationContextKey ?? lastStationContextKeyRef.current;
  const stationContext = activeStationContexts[activeStationContextKey];
  const stationCounts = useMemo<Record<StationContextKey, number>>(
    () => ({
      explore: applyStationFilters(activeStationContexts.explore.stations, filters).length,
      stations: applyStationFilters(activeStationContexts.stations.stations, filters).length,
      search: applyStationFilters(activeStationContexts.search.stations, filters).length,
      nearby: applyStationFilters(activeStationContexts.nearby.stations, filters).length,
      library: applyStationFilters(activeStationContexts.library.stations, filters).length
    }),
    [activeStationContexts, filters]
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
    library: 0,
    stats: 1,
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
    library: stationCounts.library,
    stats: 1,
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

  }, [renderedStationContextKey, screen, selected]);

  useEffect(() => {
    if (
      !shouldAnimateReceiver(screen, playback) ||
      process.env.RADIOCLI_DISABLE_ANIMATION === '1' ||
      process.env.RADIO_ATLAS_DISABLE_ANIMATION === '1'
    ) {
      return;
    }

    const intervalMs = LIVE_RECEIVER_STYLES.has(library.settings.receiverStyle) ? LIVE_RECEIVER_PULSE_MS : AMBIENT_RECEIVER_PULSE_MS;
    const timer = setInterval(() => setPulse(value => (value + 1) % 240), intervalMs);
    return () => clearInterval(timer);
  }, [library.settings.receiverStyle, playback.ready, playback.state, screen]);

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

  useEffect(
    () => () => {
      if (exploreMoveTimerRef.current) {
        clearTimeout(exploreMoveTimerRef.current);
      }
    },
    []
  );

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
    const backends = player.refreshDetectedBackends();
    setAvailableBackends(backends);
    if (backends.length === 0) {
      setMessage(`No playback backend found. ${playbackBackendInstallHint()}`);
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

  const loadExploreAt = useCallback(async (cursor: ExploreCursor, options: NavigationOptions = {}) => {
    const requestId = exploreRequestRef.current + 1;
    exploreRequestRef.current = requestId;
    setLoadingStations(true);
    setMessage(null);
    if (screenRef.current !== 'explore') {
      go('explore', {resetSelection: options.resetSelection ?? true, clearMessage: options.clearMessage});
    }
    exploreCursorRef.current = cursor;
    setExploreCursor(cursor);
    const previousExploreStations = stationContextsRef.current.explore.stations;
    setStationContextFor('explore', {
      title: 'Explore world',
      subtitle: `Scanning all geotagged stations near ${formatExploreCursor(cursor)}`,
      stations: previousExploreStations
    });
    try {
      const stations = await providers.nearby(exploreCursorLocation(cursor), 90);
      if (requestId !== exploreRequestRef.current) {
        return;
      }
      setStationContextFor('explore', {
        title: 'Explore world',
        subtitle: formatExploreSubtitle(cursor, stations),
        stations
      });
      selectedByScreenRef.current.explore = 0;
      if (screenRef.current === 'explore') {
        setSelected(0);
      }
      if (stations.length === 0) {
        setMessage(`No geotagged stations found near ${formatExploreCursor(cursor)}.`);
      }
    } catch (error) {
      if (requestId !== exploreRequestRef.current) {
        return;
      }
      setMessage(error instanceof Error ? error.message : 'Could not load world stations.');
    } finally {
      if (requestId === exploreRequestRef.current) {
        setLoadingStations(false);
      }
    }
  }, [go, providers, setStationContextFor]);

  const loadExplore = useCallback(async () => {
    await loadExploreAt(exploreCursorRef.current, {resetSelection: true});
  }, [loadExploreAt]);

  const moveExploreMapCursor = useCallback(
    (direction: ExploreMoveDirection, fast = false) => {
      const next = shiftExploreCursor(exploreCursorRef.current, direction, fast);
      exploreCursorRef.current = next;
      setExploreCursor(next);
      setSelected(0);
      setLoadingStations(true);
      setStationContextFor('explore', {
        title: 'Explore world',
        subtitle: `Move cursor: ${formatExploreCursor(next)}`,
        stations: stationContextsRef.current.explore.stations
      });
      if (exploreMoveTimerRef.current) {
        clearTimeout(exploreMoveTimerRef.current);
      }
      exploreMoveTimerRef.current = setTimeout(() => {
        void loadExploreAt(next, {resetSelection: true, clearMessage: false});
      }, 220);
    },
    [loadExploreAt, setStationContextFor]
  );

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

  const openLibrary = useCallback(() => {
    go('library', {resetSelection: false});
  }, [go]);

  const selectedStation = displayStations[selected] ?? null;

  const openScreen = useCallback(
    (target: Screen) => {
      if (target === 'explore') {
        if (stationContextsRef.current.explore.stations.length > 0) {
          go('explore');
        } else {
          void loadExplore();
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
      } else if (target === 'library') {
        openLibrary();
      } else {
        go(target);
      }
    },
    [go, loadExplore, loadNearby, openLibrary]
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

  const executeCommand = useCommandExecutor({
    beginLearningTransportKey,
    countries,
    go,
    loadCountry,
    openLibrary,
    player,
    playingStation,
    providers,
    resetLearnedTransportKeys,
    runSearch,
    screen,
    selectedStation,
    setCountries,
    setFilters,
    setLibrary,
    setMessage,
    setSearchQuery,
    setSleepUntil,
    setVolume,
    settingsRef,
    store,
    toggleFavorite,
    toggleMute,
    updateSettings
  });

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

  useAppInput({
    adjustVolume,
    beginLearningTransportKey,
    capturingTransportAction,
    commandMode,
    commandText,
    currentItemCount,
    cycleDisplayColor,
    cyclePlaybackBackend,
    cycleSleepTimer,
    cycleSpectrumStyle,
    editingCountryFilter,
    editingSearch,
    executeCommand,
    filteredCountries,
    go,
    lastRawTransportAtRef,
    lastSubmittedSearchRef,
    loadCountry,
    openAdjacentTab,
    openScreen,
    playAdjacent,
    playStation,
    player,
    playingStation,
    moveExploreCursor: moveExploreMapCursor,
    refreshProviderHealth,
    resetLearnedTransportKeys,
    runSearch,
    saveLearnedTransportKey,
    screen,
    searchQuery,
    selected,
    selectedStation,
    setCapturingTransportAction,
    setCommandMode,
    setCommandText,
    setCountryFilter,
    setEditingCountryFilter,
    setEditingSearch,
    setMessage,
    setSearchQuery,
    setSelected,
    setShowDiagnostics,
    settingsRef,
    shutdown,
    stdin,
    toggleFavorite,
    toggleMute,
    toggleNearbyLocation,
    toggleRadioGarden,
    toggleSkipBrokenStreams
  });

  function currentItemCount(currentScreen: Screen): number {
    return itemCountsRef.current[currentScreen] ?? 0;
  }

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
  const pageFooter = pageFooterText({
    capturingTransportAction,
    commandMode,
    commandText,
    editingCountryFilter,
    editingSearch,
    screen
  });

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
        <AppContent
          backends={availableBackends}
          countryFilter={countryFilter}
          diagnostics={diagnostics}
          displayStations={displayStations}
          editingCountryFilter={editingCountryFilter}
          editingSearch={editingSearch}
          favoriteKeys={favoriteKeys}
          filterLabel={filterLabel}
          filteredCountries={filteredCountries}
          frameWidth={frameWidth}
          layout={layout}
          library={library}
          loadingCountries={loadingCountries}
          loadingStations={loadingStations}
          nowPlaying={nowPlaying}
          playback={playback}
          playingStation={playingStation}
          providerHealth={providerHealth}
          pulse={pulse}
          searchQuery={searchQuery}
          screen={screen}
          selected={selected}
          showDiagnostics={showDiagnostics}
          sleepLabel={sleepLabel}
          stationContext={stationContext}
          exploreCursor={exploreCursor}
          stationFavorite={store.isFavorite(playingStation)}
          stationTime={stationApproximateTime(playingStation)}
          storePath={store.filePath}
          theme={theme}
        />
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

function buildLibraryStations(library: LibraryState): Station[] {
  const stations: Station[] = [];
  const seen = new Set<string>();
  const addStation = (station: Station) => {
    const key = stationKey(station);
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    stations.push(station);
  };

  for (const station of library.favorites) {
    addStation(station);
  }

  for (const item of library.recent) {
    addStation(item.station);
  }

  for (const station of library.imported) {
    addStation(station);
  }

  return stations;
}

function exploreCursorLocation(cursor: ExploreCursor): LocationGuess {
  return {
    latitude: cursor.latitude,
    longitude: cursor.longitude,
    source: 'explore cursor'
  };
}

function formatExploreSubtitle(cursor: ExploreCursor, stations: Station[]): string {
  if (stations.length === 0) {
    return `No geotagged stations near ${formatExploreCursor(cursor)}`;
  }

  const farthest = stations.reduce((max, station) => Math.max(max, station.distanceKm ?? 0), 0);
  return `${stations.length} nearest to ${formatExploreCursor(cursor)} · within ${formatDistanceKm(farthest)}`;
}

function formatDistanceKm(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }

  if (distanceKm < 100) {
    return `${distanceKm.toFixed(1)} km`;
  }

  return `${Math.round(distanceKm).toLocaleString()} km`;
}

function librarySubtitle(library: LibraryState): string {
  return `${library.favorites.length} favorites · ${library.recent.length} recent · ${library.imported.length} imported · favorites first`;
}
