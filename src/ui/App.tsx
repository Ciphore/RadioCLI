import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {fileURLToPath} from 'node:url';
import {Box, Text, useApp, useIsScreenReaderEnabled, useStdin, useStdout, useWindowSize} from 'ink';
import {ProviderManager} from '../providers/provider-manager.js';
import {PlayerController, type PlaybackControlResult} from '../player/player-controller.js';
import {playbackBackendInstallHint, playbackBackendLabel} from '../player/backend-install.js';
import {JsonLibraryStore, stationKey} from '../storage/store.js';
import {defaultAgentControlSettings, type AirPlayDevice, type AppSettings, type Country, type IcyNowPlaying, type LibraryState, type LocationGuess, type PlaybackState, type Screen, type Station} from '../types.js';
import {nextReceiverStyle, nextTheme, textDim, textMuted, themeAccent} from './theme.js';
import {DisplayContext, resolveDisplayMode} from './display-context.js';
import {homeItems, settingsItemsForPage, type SettingsPage} from './screen-items.js';
import {AppContent} from './AppContent.js';
import {TopTabs} from './components/TopTabs.js';
import {computeTerminalLayout, type TerminalLayout} from './layout.js';
import {truncate} from './format.js';
import {playbackFooterText, playbackStateForPendingStation} from './playback-footer.js';
import {balancedFooterLegendRows, fullFooterRowCount, fullStatusFooterRows, microPlaybackControlsText, microShortcutFooterText, pageFooterText} from './page-footer.js';
import {disableMouseReporting, enableMouseReporting, exploreCursorForMouseCell, shouldEnableMouseReporting} from './terminal-mouse.js';
import {useAppInput} from './use-app-input.js';
import {useCommandExecutor} from './use-command-executor.js';
import {isAirPlayCodePromptActive} from './screens/AirPlayCodeScreen.js';
import {isAirPlayBackendAvailable} from './airplay-settings.js';
import {networkPolicy} from '../platform/network.js';
import {audioOutputLabel, resolvedAudioOutput} from './audio-output.js';
import {copyToClipboard, openExternal} from './system-actions.js';
import {safeExternalHttpUrl, safeMediaTarget, sanitizeTerminalText} from '../safety.js';
import {appVersion} from '../version.js';
import {automaticUpdateChecksAllowed, checkForUpdate, installUpdate, shouldCheckForUpdate, updateAvailableForVersion, updateCommandForInstall} from '../update-check.js';
import {helpItemCount} from './help-content.js';
import {EXIT_CONFIRMATION_MS, ctrlCExitDecision} from './exit-confirmation.js';
import {createAlarmTuiService, serializeAlarmTuiService, type AlarmTuiService} from './alarm-tui-service.js';
import {useAlarmTui} from './use-alarm-tui.js';
import {toAsciiSafe} from './ascii.js';
import {registerTuiPresence} from '../alarms/tui-presence.js';
import {configureMcpIntegrations, type McpInstallResult} from '../agent/mcp-install.js';
import {startRadioSession, type RadioSessionCommand, type RadioSessionResult, type RadioSessionStatus} from '../agent/session.js';
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
  shouldSkipAfterTuneError,
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
import {ReceiverAnimationProvider} from './receiver-animation.js';
import {VersionIndicator, versionIndicatorWidth} from './components/VersionIndicator.js';

type AppProps = {
  store?: JsonLibraryStore;
  providers?: ProviderManager;
  alarmService?: AlarmTuiService;
  alarmPreview?: (station: Station) => Promise<void>;
  initialAgentCommand?: RadioSessionCommand;
  mcpConfigurator?: typeof configureMcpIntegrations;
  updateChecker?: typeof checkForUpdate;
};

const LOADING_SPINNER_MS = 120;
const VISUALIZER_MESSAGE_MS = 4500;
const LISTENING_HEARTBEAT_MS = 30_000;
const COUNTRY_STATIONS_PAGE_SIZE = 120;
const COUNTRY_STATIONS_LOAD_AHEAD = 12;
const SEARCH_RESULTS_PAGE_SIZE = 90;
const SEARCH_RESULTS_LOAD_AHEAD = 12;
const BROKEN_STREAM_AUTO_SKIP_DELAY_MS = 1000;

type BooleanSetting = 'resumeOnLaunch' | 'transparentBackground' | 'asciiMode' | 'reduceMotion' | 'mouseSupport' | 'automaticUpdateChecks';

const settingToggleLabel: Record<BooleanSetting, string> = {
  resumeOnLaunch: 'Resume on launch',
  transparentBackground: 'Transparent background',
  asciiMode: 'ASCII-safe display',
  reduceMotion: 'Reduce motion',
  mouseSupport: 'Mouse and trackpad scrolling',
  automaticUpdateChecks: 'Automatic update checks'
};

export function App({store: providedStore, providers: providedProviders, alarmService: providedAlarmService, alarmPreview, initialAgentCommand, mcpConfigurator = configureMcpIntegrations, updateChecker = checkForUpdate}: AppProps): React.ReactElement {
  const {exit} = useApp();
  const {stdin} = useStdin();
  const {stdout} = useStdout();
  const {columns, rows} = useWindowSize();
  const screenReader = useIsScreenReaderEnabled();
  const store = useMemo(() => providedStore ?? new JsonLibraryStore(), [providedStore]);
  const providers = useMemo(() => providedProviders ?? new ProviderManager(), [providedProviders]);
  const alarmService = useMemo(() => providedAlarmService ? serializeAlarmTuiService(providedAlarmService) : createAlarmTuiService(), [providedAlarmService]);
  const installedVersion = useMemo(() => appVersion(), []);

  const [library, setLibrary] = useState<LibraryState>(() => store.snapshot());
  const settingsRef = useRef(library.settings);
  settingsRef.current = library.settings;

  const player = useMemo(() => new PlayerController(() => settingsRef.current), []);
  const [playback, setPlayback] = useState<PlaybackState>(() => player.getState());
  const [availableBackends, setAvailableBackends] = useState<string[]>(() => player.detectedBackends());
  const [availableAirPlayDevices, setAvailableAirPlayDevices] = useState<AirPlayDevice[]>(() => player.detectedAirPlayDevices());
  const [screen, setScreen] = useState<Screen>('home');
  const [selected, setSelected] = useState(0);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('root');
  const [message, setMessage] = useState<string | null>(null);
  const [persistenceWarning, setPersistenceWarning] = useState<string | null>(null);
  const [presenceWarning, setPresenceWarning] = useState<string | null>(null);
  const [footerMessage, setFooterMessage] = useState<string | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryFilter, setCountryFilter] = useState('');
  const [editingCountryFilter, setEditingCountryFilter] = useState(false);
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [stationContexts, setStationContexts] = useState<Record<StationContextKey, StationContext>>(initialStationContexts);
  const [loadingStations, setLoadingStations] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingSearch, setEditingSearch] = useState(true);
  const [playingStation, setPlayingStation] = useState<Station | null>(null);
  const [tuningStation, setTuningStation] = useState<Station | null>(null);
  const [nowPlaying, setNowPlaying] = useState<IcyNowPlaying | null>(null);
  const [location, setLocation] = useState<LocationGuess | null>(null);
  const [exploreCursor, setExploreCursor] = useState<ExploreCursor>(defaultExploreCursor);
  const [providerHealth, setProviderHealth] = useState<Record<string, string>>({});
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const [commandMode, setCommandMode] = useState(false);
  const [commandText, setCommandText] = useState('');
  const [airPlayCode, setAirPlayCode] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({codec: null, language: null, minBitrate: null});
  const [sleepUntil, setSleepUntil] = useState<number | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [capturingTransportAction, setCapturingTransportAction] = useState<MediaTransportAction | null>(null);
  const reportActionError = useCallback((error: unknown) => {
    setMessage(sanitizeTerminalText(error instanceof Error ? error.message : String(error)) ?? 'Could not complete this action.');
  }, []);
  // Optional history cannot change the result of playback or navigation. Keep
  // its warning until an explicit save succeeds; a no-op checkpoint proves nothing.
  const persistLibrary = useCallback((write: () => LibraryState): LibraryState | undefined => {
    try {
      const nextLibrary = write();
      setLibrary(nextLibrary);
      return nextLibrary;
    } catch (error) {
      const detail = sanitizeTerminalText(error instanceof Error ? error.message : String(error));
      setPersistenceWarning(`Library not saved. Set RADIOCLI_HOME to a writable directory.${detail ? ` ${detail}` : ''}`);
      return undefined;
    }
  }, []);
  const announcedUpdateRef = useRef(false);
  const automaticUpdateCheckStartedRef = useRef(false);
  const installingUpdateRef = useRef(false);
  const configuringMcpRef = useRef(false);
  const displayStationsRef = useRef<Station[]>([]);
  const playbackQueueRef = useRef<PlaybackQueue | null>(null);
  const lastRawTransportAtRef = useRef(0);
  const loadingStationsRef = useRef(false);
  const countryPageRequestRef = useRef<string | null>(null);
  const searchPageRequestRef = useRef<string | null>(null);
  const playStationRef = useRef<(station: Station, options?: PlayStationOptions) => void>(() => undefined);
  const screenRef = useRef<Screen>(screen);
  const selectedRef = useRef(selected);
  const settingsPageRef = useRef<SettingsPage>(settingsPage);
  const selectedBySettingsPageRef = useRef<Partial<Record<SettingsPage, number>>>({});
  const selectedByScreenRef = useRef<Partial<Record<Screen, number>>>({});
  const stationContextsRef = useRef(stationContexts);
  const lastStationContextKeyRef = useRef<StationContextKey>('explore');
  const lastSubmittedSearchRef = useRef('');
  const searchHistoryRef = useRef<{cursor: number; draft: string}>({cursor: -1, draft: ''});
  const exploreCursorRef = useRef(exploreCursor);
  const exploreRequestRef = useRef(0);
  const exploreMoveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transientMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transientFooterMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitConfirmationUntilRef = useRef(0);
  const helpReturnScreenRef = useRef<Screen>('home');
  const countriesLoadAttemptedRef = useRef(false);
  const tuneRequestRef = useRef(0);
  const searchRequestRef = useRef(0);
  const countryRequestRef = useRef(0);
  const nearbyRequestRef = useRef(0);
  const skipBrokenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeRequestRef = useRef(0);
  const agentHandlerRef = useRef<(command: RadioSessionCommand) => Promise<RadioSessionResult>>(async () => {
    throw new Error('RadioCLI is still starting.');
  });

  const theme = library.settings.theme;
  const displayMode = useMemo(
    () => resolveDisplayMode(library.settings, process.env, {screenReader, isTTY: Boolean(stdout.isTTY), colorDepth: stdout.getColorDepth?.()}),
    [library.settings.transparentBackground, library.settings.asciiMode, library.settings.reduceMotion, screenReader, stdout]
  );
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
  settingsPageRef.current = settingsPage;
  loadingStationsRef.current = loadingStations;
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
    alarms: 0,
    'alarm-editor': 0,
    'alarm-picker': 0,
    'alarm-ringing': 0,
    'airplay-settings': 0,
    'airplay-code': 1,
    settings: settingsItemsForPage(settingsPage).length,
    help: helpItemCount
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
    alarms: library.alarms.length,
    'alarm-editor': 0,
    'alarm-picker': 0,
    'alarm-ringing': 0,
    'airplay-settings': availableAirPlayDevices.length,
    'airplay-code': 1,
    settings: settingsItemsForPage(settingsPage).length,
    help: helpItemCount
  };

  const displayStations = useMemo(() => applyStationFilters(stationContext.stations, filters), [filters, stationContext.stations]);
  displayStationsRef.current = displayStations;
  const sleepLabel = sleepUntil ? `Sleep ${formatTimeLeft(sleepUntil - Date.now())}` : 'Sleep off';
  const footerStation = tuningStation ?? playingStation;
  const footerPlayback = playbackStateForPendingStation(playback, tuningStation);
  // Now Playing already owns the station identity, so its transient notice can
  // reuse the playback-status row that other full-size screens need.
  const footerRows = fullFooterRowCount(screen);
  const selectedAirPlayDevice = useMemo(
    () => availableAirPlayDevices.find(device => device.id === library.settings.preferredAirPlayDevice),
    [availableAirPlayDevices, library.settings.preferredAirPlayDevice]
  );
  const canEnterAirPlayCode =
    isAirPlayCodePromptActive(playback) ||
    Boolean(isAirPlayBackendAvailable(availableBackends) && selectedAirPlayDevice?.requiresPassword && !selectedAirPlayDevice.local);
  const layout = computeTerminalLayout(columns, rows, footerRows);
  const frameWidth = layout.frameWidth;
  const mouseReportingActive =
    !displayMode.screenReader &&
    process.env.TERM?.toLowerCase() !== 'dumb' &&
    !commandMode &&
    !capturingTransportAction &&
    !editingCountryFilter &&
    shouldEnableMouseReporting(
      screen,
      itemCountsRef.current[screen] ?? 0,
      mouseVisibleRows(screen, layout),
      library.settings.mouseSupport !== false
    );

  useEffect(() => player.onChange(setPlayback), [player]);
  useEffect(() => {
    if (!stdin.isTTY) return;
    try {
      const unregister = registerTuiPresence();
      return () => {
        try {unregister();}
        catch {console.error('RadioCLI could not remove its alarm-control presence marker. Stale markers are checked on the next launch.');}
      };
    } catch {
      setPresenceWarning('Alarm controls cannot register this terminal in the runtime directory. Browsing and playback remain available.');
    }
  }, [stdin]);

  const playingStationRef = useRef<Station | null>(null);
  playingStationRef.current = playingStation;
  const activeListeningStationRef = useRef<string | null>(null);
  const lastRecordedTrackRef = useRef<string | null>(null);

  useEffect(() => {
    const station = playingStationRef.current;
    const isAudible = playback.state === 'playing' && playback.ready && station;
    if (isAudible) {
      const key = stationKey(station);
      if (activeListeningStationRef.current !== key) {
        activeListeningStationRef.current = key;
        persistLibrary(() => store.startListeningSession(station));
      }
      return;
    }

    if (activeListeningStationRef.current) {
      activeListeningStationRef.current = null;
      persistLibrary(() => store.finishActiveListeningSession());
    }
  }, [persistLibrary, playback.ready, playback.state, playingStation, store]);

  useEffect(() => {
    if (playback.state !== 'playing' || !playback.ready || !playingStation) {
      return;
    }
    const timer = setInterval(() => {
      persistLibrary(() => store.checkpointActiveListeningSession());
    }, LISTENING_HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [persistLibrary, playback.ready, playback.state, playingStation, store]);

  useEffect(
    () =>
      player.onMetadata(metadata => {
        setNowPlaying(metadata);
        const station = playingStationRef.current;
        if (station && metadata.title) {
          const trackKey = `${stationKey(station)}:${metadata.title}`;
          if (lastRecordedTrackRef.current === trackKey) return;
          lastRecordedTrackRef.current = trackKey;
          persistLibrary(() => store.recordTrack(station, metadata.title!));
        }
      }),
    [persistLibrary, player, store]
  );

  useEffect(() => {
    if (!stdout.isTTY || !mouseReportingActive) {
      return;
    }

    stdout.write(enableMouseReporting);
    return () => {
      stdout.write(disableMouseReporting);
    };
  }, [mouseReportingActive, stdout]);

  useEffect(() => {
    selectedByScreenRef.current[screen] = selected;
    if (renderedStationContextKey) {
      lastStationContextKeyRef.current = renderedStationContextKey;
    }

  }, [renderedStationContextKey, screen, selected]);

  useEffect(() => {
    if (
      footerPlayback.state !== 'loading' ||
      displayMode.reduceMotion ||
      process.env.RADIOCLI_DISABLE_ANIMATION === '1' ||
      process.env.RADIO_ATLAS_DISABLE_ANIMATION === '1'
    ) {
      setSpinnerFrame(0);
      return;
    }

    const timer = setInterval(() => setSpinnerFrame(value => (value + 1) % 1000), LOADING_SPINNER_MS);
    return () => clearInterval(timer);
  }, [footerPlayback.state, displayMode.reduceMotion]);

  useEffect(() => {
    if (
      (screen === 'countries' || screen === 'map') &&
      countries.length === 0 &&
      !loadingCountries &&
      !countriesLoadAttemptedRef.current
    ) {
      countriesLoadAttemptedRef.current = true;
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
      if (transientMessageTimerRef.current) {
        clearTimeout(transientMessageTimerRef.current);
      }
      if (transientFooterMessageTimerRef.current) {
        clearTimeout(transientFooterMessageTimerRef.current);
      }
      if (skipBrokenTimerRef.current) {
        clearTimeout(skipBrokenTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    setSelected(value => clamp(value, currentItemCount(screen) - 1));
  }, [availableAirPlayDevices.length, displayStations.length, filteredCountries.length, screen]);

  useEffect(() => {
    if (!sleepUntil) {
      return;
    }

    const delayMs = sleepUntil - Date.now();
    if (delayMs <= 0) {
      tuneRequestRef.current += 1;
      persistLibrary(() => store.finishActiveListeningSession());
      void player.stop().catch(reportActionError);
      setSleepUntil(null);
      return;
    }

    const timer = setTimeout(() => {
      tuneRequestRef.current += 1;
      persistLibrary(() => store.finishActiveListeningSession());
      void player.stop().catch(reportActionError);
      setSleepUntil(null);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [persistLibrary, player, reportActionError, sleepUntil, store]);

  useEffect(() => {
    const backends = player.refreshDetectedBackends();
    setAvailableBackends(backends);
    const network = networkPolicy();
    if (!network.offline && !network.lowBandwidth) {
      void player.refreshAirPlayDevices().then(setAvailableAirPlayDevices).catch(() => setAvailableAirPlayDevices([]));
    }
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

  const refreshUpdateCheck = useCallback(async () => {
    const updateCheck = await updateChecker({currentVersion: installedVersion});
    persistLibrary(() => store.updateCheckState(updateCheck));
    return updateCheck;
  }, [installedVersion, persistLibrary, store, updateChecker]);

  useEffect(() => {
    if (
      automaticUpdateCheckStartedRef.current ||
      !automaticUpdateChecksAllowed(library.settings.automaticUpdateChecks !== false)
    ) {
      return;
    }
    automaticUpdateCheckStartedRef.current = true;

    let cancelled = false;
    void refreshUpdateCheck().then(updateCheck => {
      if (cancelled) {
        return;
      }

      if (updateCheck.updateAvailable && updateCheck.latestVersion && !announcedUpdateRef.current) {
        announcedUpdateRef.current = true;
        setMessage(`Update available: v${updateCheck.latestVersion} · run :update`);
      }
    }).catch(error => {
      if (!cancelled) reportActionError(error);
    });

    return () => {
      cancelled = true;
    };
  }, [library.settings.automaticUpdateChecks, refreshUpdateCheck, reportActionError]);

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
      setPersistenceWarning(null);
      return nextLibrary;
    },
    [store]
  );

  useEffect(() => {
    if (!selectedAirPlayDevice?.local || settingsRef.current.preferredBackend !== 'airplay') {
      return;
    }

    const preferredBackend = preferredLocalPlaybackBackend(availableBackends);
    if (!preferredBackend) {
      setMessage(`${selectedAirPlayDevice.name} is this Mac. Install mpv to use local playback instead of AirPlay.`);
      return;
    }

    try {
      updateSettings({preferredBackend});
      setMessage(`${selectedAirPlayDevice.name} is this Mac. Audio output: ${audioOutputLabel(preferredBackend)}.`);
    } catch (error) {
      reportActionError(error);
    }
  }, [availableBackends, reportActionError, selectedAirPlayDevice, updateSettings]);

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
    if (next === 'help' && screenRef.current !== 'help') {
      helpReturnScreenRef.current = screenRef.current;
    }
    const destination = screenRef.current === 'help' && next === 'home'
      ? helpReturnScreenRef.current
      : next;
    if (
      destination === 'settings' &&
      screenRef.current !== 'settings' &&
      screenRef.current !== 'airplay-settings' &&
      screenRef.current !== 'airplay-code'
    ) {
      settingsPageRef.current = 'root';
      setSettingsPage('root');
      itemCountsRef.current.settings = settingsItemsForPage('root').length;
      selectedByScreenRef.current.settings = selectedBySettingsPageRef.current.root ?? 0;
    }
    selectedByScreenRef.current[screenRef.current] = selectedRef.current;
    const remembered = selectedByScreenRef.current[destination] ?? 0;
    const nextSelection = options.resetSelection ? 0 : remembered;

    setScreen(destination);
    setSelected(clamp(nextSelection, (itemCountsRef.current[destination] ?? 0) - 1));
    if (options.clearMessage !== false) {
      setMessage(null);
    }
  }, []);

  const openSettingsPage = useCallback((next: SettingsPage) => {
    selectedBySettingsPageRef.current[settingsPageRef.current] = selectedRef.current;
    settingsPageRef.current = next;
    setSettingsPage(next);
    const nextSelection = clamp(
      selectedBySettingsPageRef.current[next] ?? 0,
      settingsItemsForPage(next).length - 1
    );
    selectedRef.current = nextSelection;
    setSelected(nextSelection);
    setMessage(null);
  }, []);

  const closeSettingsPage = useCallback(() => {
    if (settingsPageRef.current === 'root') {
      go('home');
      return;
    }
    openSettingsPage('root');
  }, [go, openSettingsPage]);

  const openAirPlayCode = useCallback(() => {
    setAirPlayCode('');
    go('airplay-code', {resetSelection: true, clearMessage: false});
  }, [go]);

  useEffect(() => {
    if (isAirPlayCodePromptActive(playback) && screenRef.current !== 'airplay-code') {
      openAirPlayCode();
    }
  }, [openAirPlayCode, playback.backend, playback.message]);

  const shutdown = useCallback(() => {
    tuneRequestRef.current += 1;
    persistLibrary(() => store.finishActiveListeningSession());
    void player.stop().catch(reportActionError).finally(exit);
  }, [exit, persistLibrary, player, reportActionError, store]);

  useEffect(() => {
    const finishForSignal = () => {
      persistLibrary(() => store.finishActiveListeningSession());
      void player.stop().catch(reportActionError).finally(() => process.exit(0));
    };
    process.once('SIGTERM', finishForSignal);
    process.once('SIGHUP', finishForSignal);
    return () => {
      process.off('SIGTERM', finishForSignal);
      process.off('SIGHUP', finishForSignal);
    };
  }, [persistLibrary, player, reportActionError, store]);

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
      stations: previousExploreStations,
      error: undefined
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
      const loadError = discoveryLoadError('Could not load world stations.', error);
      setStationContextFor('explore', {
        ...stationContextsRef.current.explore,
        subtitle: `World station directory unavailable near ${formatExploreCursor(cursor)}`,
        error: loadError
      });
      setMessage(loadError);
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

  const moveExploreMapCursorToCell = useCallback(
    (x: number, y: number) => {
      const next = exploreCursorForMouseCell(x, y, frameWidth, layout);
      if (!next) {
        return;
      }

      if (exploreMoveTimerRef.current) {
        clearTimeout(exploreMoveTimerRef.current);
      }

      void loadExploreAt(next, {resetSelection: true, clearMessage: false});
    },
    [frameWidth, layout, loadExploreAt]
  );

  const loadCountry = useCallback(
    async (country: Country) => {
      const requestId = countryRequestRef.current + 1;
      countryRequestRef.current = requestId;
      setLoadingStations(true);
      setMessage(null);
      countryPageRequestRef.current = null;
      try {
        const stations = await providers.byCountry(country.code, COUNTRY_STATIONS_PAGE_SIZE, 0);
        if (requestId !== countryRequestRef.current) return;
        showStationContext({
          title: country.name,
          subtitle: formatCountryStationsSubtitle(country, stations.length, stations.length < country.stationCount),
          stations,
          country,
          hasMore: stations.length >= COUNTRY_STATIONS_PAGE_SIZE && stations.length < country.stationCount
        }, 'stations');
      } catch (error) {
        if (requestId !== countryRequestRef.current) return;
        setMessage(error instanceof Error ? error.message : `Could not load ${country.name}.`);
      } finally {
        if (requestId === countryRequestRef.current) setLoadingStations(false);
      }
    },
    [providers, showStationContext]
  );

  const loadMoreCountryStations = useCallback(async () => {
    const context = stationContextsRef.current.stations;
    const country = context.country;
    if (!country || !context.hasMore || loadingStationsRef.current) {
      return;
    }

    const offset = context.stations.length;
    const requestKey = `${country.code}:${offset}`;
    if (countryPageRequestRef.current === requestKey) {
      return;
    }

    countryPageRequestRef.current = requestKey;
    setLoadingStations(true);
    try {
      const page = await providers.byCountry(country.code, COUNTRY_STATIONS_PAGE_SIZE, offset);
      const latest = stationContextsRef.current.stations;
      if (latest.country?.code !== country.code || latest.stations.length !== offset) {
        return;
      }

      const stations = appendUniqueStations(latest.stations, page);
      const hasMore =
        page.length >= COUNTRY_STATIONS_PAGE_SIZE &&
        stations.length > latest.stations.length &&
        stations.length < country.stationCount;
      setStationContextFor('stations', {
        ...latest,
        subtitle: formatCountryStationsSubtitle(country, stations.length, hasMore),
        stations,
        hasMore
      });
    } catch (error) {
      if (stationContextsRef.current.stations.country?.code === country.code) {
        setMessage(error instanceof Error ? error.message : `Could not load more ${country.name} stations.`);
      }
    } finally {
      if (countryPageRequestRef.current === requestKey) {
        countryPageRequestRef.current = null;
        setLoadingStations(false);
      }
    }
  }, [providers, setStationContextFor]);

  useEffect(() => {
    if (
      screen === 'stations' &&
      stationContexts.stations.country &&
      stationContexts.stations.hasMore &&
      stationContexts.stations.stations.length - selected <= COUNTRY_STATIONS_LOAD_AHEAD
    ) {
      void loadMoreCountryStations();
    }
  }, [
    loadMoreCountryStations,
    screen,
    selected,
    stationContexts.stations.country,
    stationContexts.stations.hasMore,
    stationContexts.stations.stations.length
  ]);

  const runSearch = useCallback(
    async (query = searchQuery) => {
      if (!query.trim()) {
        setMessage('Enter a station, genre, language, or place.');
        return;
      }

      const requestId = searchRequestRef.current + 1;
      searchRequestRef.current = requestId;
      setLoadingStations(true);
      setMessage(null);
      try {
        const stations = await providers.search(query, settingsRef.current, {
          limit: SEARCH_RESULTS_PAGE_SIZE,
          offset: 0,
          codec: filters.codec ?? undefined,
          language: filters.language ?? undefined,
          minBitrate: filters.minBitrate ?? undefined
        });
        if (requestId !== searchRequestRef.current) return;
        setStationContextFor('search', {
          title: `Search: ${query}`,
          subtitle: formatSearchSubtitle(stations.length, stations.length >= SEARCH_RESULTS_PAGE_SIZE),
          stations,
          query: query.trim(),
          hasMore: stations.length >= SEARCH_RESULTS_PAGE_SIZE
        });
        selectedByScreenRef.current.search = 0;
        lastSubmittedSearchRef.current = query.trim();
        persistLibrary(() => store.addSearch(query));
        searchHistoryRef.current = {cursor: -1, draft: ''};
        setSelected(0);
        setEditingSearch(true);
      } catch (error) {
        if (requestId !== searchRequestRef.current) return;
        setMessage(error instanceof Error ? error.message : 'Search failed.');
      } finally {
        if (requestId === searchRequestRef.current) setLoadingStations(false);
      }
    },
    [filters, persistLibrary, providers, searchQuery, setStationContextFor, store]
  );

  const loadMoreSearchResults = useCallback(async () => {
    const context = stationContextsRef.current.search;
    const query = context.query;
    if (!query || !context.hasMore || loadingStationsRef.current) {
      return;
    }

    const offset = context.stations.length;
    const requestKey = `${query}:${offset}:${filters.codec ?? ''}:${filters.language ?? ''}:${filters.minBitrate ?? ''}`;
    if (searchPageRequestRef.current === requestKey) {
      return;
    }

    searchPageRequestRef.current = requestKey;
    setLoadingStations(true);
    try {
      const page = await providers.search(query, settingsRef.current, {
        limit: SEARCH_RESULTS_PAGE_SIZE,
        offset,
        codec: filters.codec ?? undefined,
        language: filters.language ?? undefined,
        minBitrate: filters.minBitrate ?? undefined
      });
      const latest = stationContextsRef.current.search;
      if (latest.query !== query || latest.stations.length !== offset) {
        return;
      }

      const stations = appendUniqueStations(latest.stations, page);
      const hasMore = page.length >= SEARCH_RESULTS_PAGE_SIZE && stations.length > latest.stations.length;
      setStationContextFor('search', {
        ...latest,
        subtitle: formatSearchSubtitle(stations.length, hasMore),
        stations,
        hasMore
      });
    } catch (error) {
      if (stationContextsRef.current.search.query === query) {
        setMessage(error instanceof Error ? error.message : 'Could not load more search results.');
      }
    } finally {
      if (searchPageRequestRef.current === requestKey) {
        searchPageRequestRef.current = null;
        setLoadingStations(false);
      }
    }
  }, [filters, providers, setStationContextFor]);

  useEffect(() => {
    if (
      screen === 'search' &&
      stationContexts.search.hasMore &&
      stationContexts.search.stations.length - selected <= SEARCH_RESULTS_LOAD_AHEAD
    ) {
      void loadMoreSearchResults();
    }
  }, [
    loadMoreSearchResults,
    screen,
    selected,
    stationContexts.search.hasMore,
    stationContexts.search.stations.length
  ]);

  const recallSearchHistory = useCallback(
    (direction: 'older' | 'newer') => {
      const history = store.snapshot().searchHistory;
      if (history.length === 0) {
        return;
      }

      const state = searchHistoryRef.current;
      if (direction === 'older') {
        if (state.cursor === -1) {
          state.draft = searchQuery;
        }

        state.cursor = Math.min(history.length - 1, state.cursor + 1);
        setSearchQuery(history[state.cursor] ?? '');
      } else if (state.cursor <= 0) {
        state.cursor = -1;
        setSearchQuery(state.draft);
      } else {
        state.cursor -= 1;
        setSearchQuery(history[state.cursor] ?? '');
      }
    },
    [searchQuery, store]
  );

  const loadNearby = useCallback(async () => {
    const requestId = nearbyRequestRef.current + 1;
    nearbyRequestRef.current = requestId;
    setLoadingStations(true);
    setMessage(null);
    setStationContextFor('nearby', {
      ...stationContextsRef.current.nearby,
      error: undefined
    });
    go('nearby', {resetSelection: stationContextsRef.current.nearby.stations.length === 0});
    try {
      if (!settingsRef.current.enableNearbyLocation) {
        if (stationContextsRef.current.nearby.stations.length > 0) {
          setMessage('Nearby location lookup is off. Showing the last nearby station list.');
          return;
        }

        setStationContextFor('nearby', {
          title: 'Nearby',
          subtitle: 'IP-based location is off. Enable it in Settings or use :location on.',
          stations: [],
          error: undefined
        });
        return;
      }

      const detected = location ?? (await providers.detectLocation());
      if (requestId !== nearbyRequestRef.current) return;
      setLocation(detected);
      if (!detected) {
        if (stationContextsRef.current.nearby.stations.length > 0) {
          setMessage('Location detection is unavailable. Showing the last nearby station list.');
          return;
        }

        setStationContextFor('nearby', {
          title: 'Nearby',
          subtitle: 'Location detection was unavailable',
          stations: [],
          error: 'Could not determine an approximate location.'
        });
        return;
      }

      const stations = await providers.nearby(detected, 90);
      if (requestId !== nearbyRequestRef.current) return;
      setStationContextFor('nearby', {
        title: 'Nearby',
        subtitle: `${[detected.city, detected.region, detected.country].filter(Boolean).join(', ')} · ${detected.source}`,
        stations
      });
    } catch (error) {
      if (requestId !== nearbyRequestRef.current) return;
      const loadError = discoveryLoadError('Could not load nearby stations.', error);
      setStationContextFor('nearby', {
        ...stationContextsRef.current.nearby,
        error: loadError
      });
      setMessage(loadError);
    } finally {
      if (requestId === nearbyRequestRef.current) setLoadingStations(false);
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
      selectedRef.current = index;
      setSelected(index);
    }
  }, []);

  const playStation = useCallback(
    async (station: Station, options: PlayStationOptions = {}) => {
      const requestId = tuneRequestRef.current + 1;
      tuneRequestRef.current = requestId;
      if (skipBrokenTimerRef.current) {
        clearTimeout(skipBrokenTimerRef.current);
        skipBrokenTimerRef.current = null;
      }
      const queue = options.queue ?? queueFromCurrentList(station);
      setTuningStation(station);
      setNowPlaying(null);

      try {
        // Cancel any in-flight backend startup before resolving the next tune.
        // This prevents a slower, older request from becoming audible after a
        // newer station was selected.
        await player.stop();
        if (requestId !== tuneRequestRef.current) return;
        const resolved = await providers.resolve(station);
        if (requestId !== tuneRequestRef.current) return;
        await player.play(station, resolved.url);
        if (requestId !== tuneRequestRef.current) return;
        playingStationRef.current = station;
        setPlayingStation(station);
        setTuningStation(null);
        playbackQueueRef.current = queue;
        const nextLibrary = persistLibrary(() => store.addRecent(station));
        if (nextLibrary && screenRef.current === 'library') {
          const nextLibraryStations = applyStationFilters(buildLibraryStations(nextLibrary), filters);
          const nextLibraryIndex = nextLibraryStations.findIndex(item => stationMatches(item, station));
          if (nextLibraryIndex >= 0) {
            selectedByScreenRef.current.library = nextLibraryIndex;
            setSelected(nextLibraryIndex);
          }
        }

        if (options.openNowPlaying) {
          go('now-playing');
        }

        setMessage(null);
      } catch (error) {
        if (requestId !== tuneRequestRef.current) return;
        const message = error instanceof Error ? error.message : 'Could not tune station.';
        const currentList = queue.stations;
        const currentIndex = currentList.findIndex(item => stationKey(item) === stationKey(station));
        const nextStation = currentIndex >= 0 ? currentList[currentIndex + 1] : undefined;
        if (shouldSkipAfterTuneError(error, settingsRef.current.skipBrokenStreams, nextStation)) {
          setMessage(`${message} Skipping to ${nextStation.name}.`);
          setTuningStation(nextStation);
          rememberQueueSelection(queue, currentIndex + 1);
          skipBrokenTimerRef.current = setTimeout(() => {
            skipBrokenTimerRef.current = null;
            playStationRef.current(nextStation, {...options, queue});
          }, BROKEN_STREAM_AUTO_SKIP_DELAY_MS);
          return;
        }

        setTuningStation(null);
        setMessage(message);
      }
    },
    [filters, go, persistLibrary, player, providers, queueFromCurrentList, rememberQueueSelection, stationMatches, store]
  );

  // Resume the most recent station on launch when opted in, like a radio
  // powering back on to its last frequency. Runs once and never auto-navigates.
  const didResumeRef = useRef(false);
  useEffect(() => {
    if (didResumeRef.current) {
      return;
    }

    didResumeRef.current = true;
    if (!settingsRef.current.resumeOnLaunch) {
      return;
    }

    const last = store.snapshot().recent[0]?.station;
    if (last) {
      void playStation(last);
    }
  }, [playStation, store]);
  playStationRef.current = playStation;

  const cancelPendingAutoSkip = useCallback(() => {
    if (!skipBrokenTimerRef.current) return;
    clearTimeout(skipBrokenTimerRef.current);
    skipBrokenTimerRef.current = null;
    setTuningStation(null);
    setMessage('Auto-skip canceled. Choose a station and press Enter.');
  }, []);

  const showTransientFooterMessage = useCallback((nextMessage: string, durationMs = VISUALIZER_MESSAGE_MS) => {
    if (transientFooterMessageTimerRef.current) {
      clearTimeout(transientFooterMessageTimerRef.current);
    }

    setFooterMessage(nextMessage);
    transientFooterMessageTimerRef.current = setTimeout(() => {
      setFooterMessage(currentMessage => currentMessage === nextMessage ? null : currentMessage);
      transientFooterMessageTimerRef.current = null;
    }, durationMs);
  }, []);

  const confirmCtrlCExit = useCallback(() => {
    const decision = ctrlCExitDecision(exitConfirmationUntilRef.current, Date.now());
    exitConfirmationUntilRef.current = decision.armedUntil;
    if (decision.shouldExit) {
      shutdown();
      return;
    }

    showTransientFooterMessage('Ctrl+C again to exit', EXIT_CONFIRMATION_MS);
  }, [showTransientFooterMessage, shutdown]);

  const toggleFavorite = useCallback(
    (station: Station | null) => {
      if (!station) {
        setMessage('Select or play a station before pressing f.');
        return;
      }

      const wasFavorite = store.isFavorite(station);
      setLibrary(store.toggleFavorite(station));
      setPersistenceWarning(null);
      const favoriteMessage = `${wasFavorite ? 'Removed from' : 'Added to'} favorites: ${station.name}`;
      if (screenRef.current === 'library') {
        showTransientFooterMessage(favoriteMessage);
      } else {
        setMessage(favoriteMessage);
      }
      if (!wasFavorite && settingsRef.current.shareDirectoryVotes) {
        // Best-effort upvote back to the directory; never blocks favoriting.
        void providers.vote(station).catch(reportActionError);
      }
    },
    [providers, reportActionError, showTransientFooterMessage, store]
  );

  const showControlResult = useCallback((result: PlaybackControlResult) => {
    if (!result.ok && result.message) {
      setMessage(result.message);
    }
  }, []);

  const openStationHomepage = useCallback(async (station: Station | null) => {
    if (!station?.homepage) {
      setMessage('This station has no homepage.');
      return;
    }

    const url = safeExternalHttpUrl(station.homepage);
    if (!url) {
      setMessage('This station has no valid HTTP(S) homepage.');
      return;
    }

    setMessage(
      await openExternal(url)
        ? `Opening homepage: ${station.name}`
        : `Could not open a browser in this session. Homepage: ${sanitizeTerminalText(url) ?? ''}`
    );
  }, []);

  const copyStationUrl = useCallback(
    async (station: Station | null) => {
      if (!station) {
        setMessage('Select or play a station first.');
        return;
      }

      let url = station.streamUrl;
      if (!url) {
        url = await providers.resolve(station).then(resolved => resolved.url).catch(() => undefined);
      }

      const safeUrl = url ? safeMediaTarget(url) : null;
      if (!safeUrl) {
        setMessage(`No safe stream URL available for ${station.name}.`);
        return;
      }

      const copied = await copyToClipboard(safeUrl);
      setMessage(copied ? `Copied stream URL: ${station.name}` : `Stream URL: ${sanitizeTerminalText(safeUrl) ?? ''}`);
    },
    [providers]
  );

  const submitAirPlayCode = useCallback(
    (code: string) => {
      const result = player.submitAirPlayPasscode(code);
      if (result.ok) {
        setAirPlayCode('');
        setMessage(result.message ?? 'AirPlay code sent.');
        go('now-playing', {clearMessage: false});
        return;
      }

      showControlResult(result);
    },
    [go, player, showControlResult]
  );

  const setVolume = useCallback(
    (volume: number) => {
      const clamped = clampVolume(volume);
      const requestId = volumeRequestRef.current + 1;
      volumeRequestRef.current = requestId;
      void player.setVolume(clamped).then(result => {
        if (result.ok && volumeRequestRef.current === requestId) {
          updateSettings({volume: player.getState().volume});
        }
        showControlResult(result);
      }).catch(reportActionError);
    },
    [player, reportActionError, showControlResult, updateSettings]
  );

  const adjustVolume = useCallback(
    (delta: number) => {
      const requestId = volumeRequestRef.current + 1;
      volumeRequestRef.current = requestId;
      void player.adjustVolume(delta).then(result => {
        if (result.ok && volumeRequestRef.current === requestId) {
          updateSettings({volume: player.getState().volume});
        }
        showControlResult(result);
      }).catch(reportActionError);
    },
    [player, reportActionError, showControlResult, updateSettings]
  );

  const toggleMute = useCallback(() => {
    void player.toggleMute().then(showControlResult).catch(reportActionError);
  }, [player, reportActionError, showControlResult]);

  const togglePause = useCallback(() => {
    void player.togglePause().then(showControlResult).catch(reportActionError);
  }, [player, reportActionError, showControlResult]);

  const showTransientMessage = useCallback((nextMessage: string) => {
    if (transientMessageTimerRef.current) {
      clearTimeout(transientMessageTimerRef.current);
    }

    setMessage(nextMessage);
    transientMessageTimerRef.current = setTimeout(() => {
      setMessage(currentMessage => currentMessage === nextMessage ? null : currentMessage);
      transientMessageTimerRef.current = null;
    }, VISUALIZER_MESSAGE_MS);
  }, []);

  const cycleDisplayColor = useCallback(() => {
    const theme = nextTheme(settingsRef.current.theme);
    updateSettings({theme});
    showTransientMessage(`Display color: ${theme}`);
  }, [showTransientMessage, updateSettings]);

  const cycleReceiverStyle = useCallback(() => {
    const receiverStyle = nextReceiverStyle(settingsRef.current.receiverStyle);
    updateSettings({receiverStyle});
    showTransientMessage(`Receiver style: ${receiverStyle}`);
  }, [showTransientMessage, updateSettings]);

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
    if (enableNearbyLocation && screenRef.current === 'nearby') {
      setTimeout(() => void loadNearby(), 0);
    } else if (!enableNearbyLocation && screenRef.current === 'nearby') {
      const current = stationContextsRef.current.nearby;
      setStationContextFor('nearby', {
        ...current,
        subtitle: 'Location lookup off · showing the last loaded results',
        error: undefined
      });
    }
  }, [loadNearby, setStationContextFor, updateSettings]);

  const toggleDirectoryVoting = useCallback(() => {
    const shareDirectoryVotes = !settingsRef.current.shareDirectoryVotes;
    updateSettings({shareDirectoryVotes});
    setMessage(`Radio Browser favorite votes ${shareDirectoryVotes ? 'enabled' : 'disabled'}.`);
  }, [updateSettings]);

  const refreshAirPlayTargets = useCallback(async (announce = true): Promise<AirPlayDevice[]> => {
    if (networkPolicy().offline) {
      setMessage('AirPlay discovery is disabled by RADIOCLI_OFFLINE=1.');
      return [];
    }
    try {
      const devices = await player.refreshAirPlayDevices();
      setAvailableAirPlayDevices(devices);
      const preferredIndex = devices.findIndex(device => device.id === settingsRef.current.preferredAirPlayDevice);
      if (preferredIndex >= 0) {
        selectedByScreenRef.current['airplay-settings'] = preferredIndex;
        if (screenRef.current === 'airplay-settings') {
          setSelected(clamp(preferredIndex, devices.length - 1));
        }
      }

      if (announce) {
        setMessage(devices.length > 0 ? `AirPlay receivers refreshed: ${devices.length} found.` : 'No AirPlay receivers found.');
      }

      return devices;
    } catch {
      setAvailableAirPlayDevices([]);
      if (announce) {
        setMessage('AirPlay receiver refresh failed.');
      }

      return [];
    }
  }, [player]);

  const openAirPlaySettings = useCallback(() => {
    const preferredIndex = availableAirPlayDevices.findIndex(device => device.id === settingsRef.current.preferredAirPlayDevice);
    selectedByScreenRef.current['airplay-settings'] = Math.max(0, preferredIndex);
    go('airplay-settings', {resetSelection: false});
    void refreshAirPlayTargets(false);
  }, [availableAirPlayDevices, go, refreshAirPlayTargets]);

  const selectAirPlayDeviceAt = useCallback(
    (index: number) => {
      const device = availableAirPlayDevices[index];
      if (!device) {
        setMessage('No AirPlay receiver selected.');
        return;
      }

      updateSettings({preferredAirPlayDevice: device.id});
      selectedByScreenRef.current['airplay-settings'] = index;
      if (device.local) {
        const preferredBackend = preferredLocalPlaybackBackend(availableBackends);
        if (!preferredBackend) {
          setMessage(`${device.name} is this Mac. Install mpv to use local playback instead of AirPlay.`);
          return;
        }

        updateSettings({preferredBackend});
        if (playingStation && shouldRetuneForAudioOutput(playback.state)) {
          const queue = playbackQueueRef.current ?? queueFromCurrentList(playingStation);
          setMessage(`${device.name} is this Mac. Switching audio to ${audioOutputLabel(preferredBackend)}...`);
          void playStation(playingStation, {queue});
          return;
        }

        setMessage(`${device.name} is this Mac. Audio output: ${audioOutputLabel(preferredBackend)}.`);
        return;
      }

      if (!isAirPlayBackendAvailable(availableBackends)) {
        setMessage(`AirPlay receiver: ${device.name}. AirPlay playback is unavailable; run radiocli doctor.`);
        return;
      }

      updateSettings({preferredBackend: 'airplay'});
      if (playingStation && shouldRetuneForAudioOutput(playback.state)) {
        const queue = playbackQueueRef.current ?? queueFromCurrentList(playingStation);
        setMessage(`Switching audio to AirPlay: ${device.name}...`);
        void playStation(playingStation, {queue});
        return;
      }

      setMessage(`AirPlay receiver: ${device.name}. Audio output: AirPlay.`);
    },
    [availableAirPlayDevices, availableBackends, playback.state, playStation, playingStation, queueFromCurrentList, updateSettings]
  );

  const cycleAudioOutput = useCallback(() => {
    const currentOutput = settingsRef.current.preferredBackend;
    const activeNeedsSelectedOutput = Boolean(
      playingStation &&
      shouldRetuneForAudioOutput(playback.state) &&
      audioOutputCanApply(currentOutput, settingsRef.current) &&
      audioOutputNeedsActiveSwitch(currentOutput, playback.backend, availableBackends)
    );
    const preferredBackend = activeNeedsSelectedOutput
      ? currentOutput
      : nextAvailablePlaybackBackend(currentOutput, availableBackends);

    updateSettings({preferredBackend});

    if (preferredBackend === 'airplay' && !settingsRef.current.preferredAirPlayDevice) {
      setMessage('Choose an AirPlay receiver first. Your current station will keep playing until you pick one.');
      openAirPlaySettings();
      return;
    }

    if (playingStation && shouldRetuneForAudioOutput(playback.state)) {
      const queue = playbackQueueRef.current ?? queueFromCurrentList(playingStation);
      setMessage(`Switching audio to ${audioOutputSwitchLabel(preferredBackend, availableBackends)}...`);
      void playStation(playingStation, {queue});
      return;
    }

    setMessage(`Audio output: ${audioOutputSwitchLabel(preferredBackend, availableBackends)}.`);
  }, [availableBackends, openAirPlaySettings, playback.backend, playback.state, playStation, playingStation, queueFromCurrentList, updateSettings]);

  const toggleSkipBrokenStreams = useCallback(() => {
    const skipBrokenStreams = !settingsRef.current.skipBrokenStreams;
    updateSettings({skipBrokenStreams});
    setMessage(`Skip broken streams ${skipBrokenStreams ? 'enabled' : 'disabled'}.`);
  }, [updateSettings]);

  const toggleSetting = useCallback(
    (key: BooleanSetting) => {
      const current = key === 'mouseSupport'
        ? settingsRef.current.mouseSupport !== false
        : Boolean(settingsRef.current[key]);
      const next = !current;
      updateSettings({[key]: next});
      setMessage(`${settingToggleLabel[key]} ${next ? 'on' : 'off'}.`);
    },
    [updateSettings]
  );

  const toggleAgentSetting = useCallback(
    (key: 'openUiOnPlay' | 'focusNowPlaying') => {
      const agentControl = settingsRef.current.agentControl ?? defaultAgentControlSettings;
      const next = !agentControl[key];
      updateSettings({agentControl: {...agentControl, [key]: next}});
      setMessage(`Agent ${key === 'openUiOnPlay' ? 'TUI launch' : 'Now Playing focus'} ${next ? 'on' : 'off'}.`);
    },
    [updateSettings]
  );

  const setAgentIntegrationEnabled = useCallback(async () => {
    if (configuringMcpRef.current) {
      setMessage('Agent integration setup is already in progress.');
      return;
    }
    configuringMcpRef.current = true;
    const enabled = !(settingsRef.current.agentControl ?? defaultAgentControlSettings).enabled;
    setMessage(enabled ? 'Setting up agent and Codex Voice control...' : 'Disabling agent and voice control...');
    try {
      const results = await mcpConfigurator(enabled, mcpRuntime(), null);
      const failed = results.filter(item => item.status === 'failed');
      const agentControl = settingsRef.current.agentControl ?? defaultAgentControlSettings;
      updateSettings({agentControl: {...agentControl, enabled}});
      setMessage(integrationResultMessage(enabled, results, failed));
    } catch (error) {
      if (!enabled) {
        const agentControl = settingsRef.current.agentControl ?? defaultAgentControlSettings;
        updateSettings({agentControl: {...agentControl, enabled: false}});
      }
      setMessage(`Agent integration ${enabled ? 'setup' : 'removal'} failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      configuringMcpRef.current = false;
    }
  }, [mcpConfigurator, updateSettings]);

  const repairMcpIntegrations = useCallback(async () => {
    if (configuringMcpRef.current) {
      setMessage('Agent integration setup is already in progress.');
      return;
    }
    configuringMcpRef.current = true;
    setMessage('Checking and repairing agent integrations...');
    try {
      const results = await mcpConfigurator(true, mcpRuntime(), null);
      const failed = results.filter(item => item.status === 'failed');
      const agentControl = settingsRef.current.agentControl ?? defaultAgentControlSettings;
      updateSettings({agentControl: {...agentControl, enabled: true}});
      setMessage(integrationResultMessage(true, results, failed));
    } catch (error) {
      setMessage(`MCP repair failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      configuringMcpRef.current = false;
    }
  }, [mcpConfigurator, updateSettings]);

  const cycleSleepTimer = useCallback(() => {
    const currentMinutes = sleepUntil ? Math.round((sleepUntil - Date.now()) / 60000) : null;
    const next = nextSleepTimerMinutes(currentMinutes);
    setSleepUntil(next ? Date.now() + next * 60_000 : null);
  }, [sleepUntil]);

  const openLibrary = useCallback(() => {
    go('library', {resetSelection: false});
  }, [go]);

  const selectedStation = displayStations[selected] ?? null;
  const selectedStationForInput = useCallback(
    () => displayStationsRef.current[selectedRef.current] ?? null,
    []
  );

  const alarmTui = useAlarmTui({
    service: alarmService,
    store,
    library,
    setLibrary,
    screen,
    selected,
    setSelected,
    go,
    setMessage,
    playingStation,
    previewStation: alarmPreview ?? (station => playStation(station))
  });
  for (const alarmScreen of ['alarms', 'alarm-editor', 'alarm-picker', 'alarm-ringing'] as const) {
    itemCountsRef.current[alarmScreen] = alarmTui.itemCount(alarmScreen) ?? 0;
  }

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
      } else if (target === 'airplay-settings') {
        openAirPlaySettings();
      } else {
        go(target);
      }
    },
    [go, loadExplore, loadNearby, openAirPlaySettings, openLibrary]
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

  const handleUpdateCommand = useCallback(async () => {
    const updateCheck = library.updateCheck;
    if (!updateCheck || shouldCheckForUpdate(updateCheck)) {
      setMessage('Checking for updates...');
      const latest = await refreshUpdateCheck();
      if (latest.error) {
        setMessage(`Update check failed: ${latest.error}`);
        return;
      }
    }

    const command = updateCommandForInstall();
    const copied = await copyToClipboard(command.command);
    const latestVersion = store.snapshot().updateCheck?.latestVersion ?? updateCheck?.latestVersion;
    const prefix = latestVersion ? `Latest v${latestVersion}. ` : '';
    const method = command.method === 'homebrew' ? 'Homebrew' : command.method === 'npm' ? 'npm' : 'your install method';
    setMessage(`${prefix}${copied ? 'Copied' : 'Run'} ${method} update: ${command.command}`);
  }, [library.updateCheck, refreshUpdateCheck, store]);

  const updateFromSettings = useCallback(async () => {
    if (installingUpdateRef.current) {
      setMessage('Update install already running.');
      return;
    }

    const currentUpdateCheck = store.snapshot().updateCheck ?? library.updateCheck;
    if (!updateAvailableForVersion(currentUpdateCheck, installedVersion)) {
      setMessage('Checking for updates...');
      const latest = await refreshUpdateCheck();
      if (latest.error) {
        setMessage(`Update check failed: ${latest.error}`);
        return;
      }

      if (latest.updateAvailable && latest.latestVersion) {
        setMessage(`Update available: v${latest.latestVersion}. Press Enter on Install update.`);
        return;
      }

      setMessage(`RadioCLI is up to date at v${installedVersion}.`);
      return;
    }

    const command = updateCommandForInstall();
    installingUpdateRef.current = true;
    setMessage(`Installing update with ${command.method === 'homebrew' ? 'Homebrew' : 'npm'}...`);
    const result = await installUpdate(command.command);
    installingUpdateRef.current = false;
    if (result.ok) {
      const agentControl = settingsRef.current.agentControl ?? defaultAgentControlSettings;
      if (agentControl.enabled) {
        try {
          const repaired = await mcpConfigurator(true, mcpRuntime(), null);
          const suffix = repaired.some(item => item.status === 'failed') ? ' Some MCP clients need manual repair.' : ' MCP integrations repaired.';
          setMessage(`Update installed.${suffix} Restart RadioCLI and open agent clients.`);
        } catch {
          setMessage('Update installed. MCP repair failed; run radiocli mcp repair, then restart RadioCLI and open agent clients.');
        }
      } else {
        setMessage('Update installed. Restart RadioCLI to use the new version.');
      }
      return;
    }

    const detail = result.output ? ` ${result.output.split('\n').at(-1)}` : '';
    setMessage(`Update install failed. Run manually: ${result.command}.${detail}`);
  }, [installedVersion, library.updateCheck, mcpConfigurator, refreshUpdateCheck, store]);

  const executeCommand = useCommandExecutor({
    beginLearningTransportKey,
    countries,
    go,
    loadCountry,
    openAirPlaySettings,
    openLibrary,
    persistLibrary,
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
    updateCommand: handleUpdateCommand,
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

  agentHandlerRef.current = async (command: RadioSessionCommand): Promise<RadioSessionResult> => {
    const sessionStatus = (): RadioSessionStatus => ({
      owner: 'tui',
      playback: player.getState(),
      station: playingStationRef.current,
      queue: playbackQueueRef.current?.stations ?? [],
      output: {
        preferredBackend: settingsRef.current.preferredBackend,
        preferredAirPlayDevice: settingsRef.current.preferredAirPlayDevice
      }
    });
    const respond = (message: string, ok = true, data?: RadioSessionResult['data']): RadioSessionResult => ({ok, message, status: sessionStatus(), ...(data ? {data} : {})});
    if (command.type === 'status') return respond(playingStationRef.current ? `${player.getState().state}: ${playingStationRef.current.name}` : 'RadioCLI is idle.');
    if (command.type === 'play') {
      if (command.ifPlaying === 'keep' && ['playing', 'paused', 'loading'].includes(player.getState().state)) {
        return respond(`Kept current station ${playingStationRef.current?.name ?? ''}.`);
      }
      const queue: PlaybackQueue = {title: 'Agent selection', sourceScreen: 'now-playing', sourceContextKey: null, stations: command.queue?.length ? command.queue : [command.station]};
      await playStation(command.station, {queue, openNowPlaying: command.openNowPlaying});
      const state = player.getState();
      const playingRequestedStation = playingStationRef.current
        && stationKey(playingStationRef.current) === stationKey(command.station)
        && state.state === 'playing'
        && state.ready;
      return playingRequestedStation
        ? respond(`Playing ${command.station.name}.`)
        : respond(state.state === 'error' ? state.message ?? `Could not play ${command.station.name}.` : `Could not play ${command.station.name}.`, false);
    }
    if (command.type === 'pause') { const control = await player.pause(); return respond(control.message ?? 'Paused.', control.ok); }
    if (command.type === 'resume') { const control = await player.resume(); return respond(control.message ?? 'Resumed.', control.ok); }
    if (command.type === 'stop') {
      tuneRequestRef.current += 1;
      persistLibrary(() => store.finishActiveListeningSession());
      await player.stop();
      playingStationRef.current = null;
      setPlayingStation(null);
      setTuningStation(null);
      playbackQueueRef.current = null;
      return respond('Stopped RadioCLI.');
    }
    if (command.type === 'alarm-preempt') {
      tuneRequestRef.current += 1;
      persistLibrary(() => store.finishActiveListeningSession());
      await player.stop();
      playingStationRef.current = null;
      setPlayingStation(null);
      setTuningStation(null);
      playbackQueueRef.current = null;
      return respond('Interactive playback yielded to the alarm.');
    }
    if (command.type === 'set-volume') {
      const control = await player.setVolume(clampVolume(command.volume));
      if (control.ok) updateSettings({volume: player.getState().volume});
      return respond(control.message ?? `Volume ${player.getState().volume}.`, control.ok);
    }
    if (command.type === 'set-muted') { const control = await player.setMuted(command.muted); return respond(control.message ?? (command.muted ? 'Muted.' : 'Unmuted.'), control.ok); }
    if (command.type === 'set-favorite') {
      const station = command.station ?? playingStationRef.current;
      if (!station) return respond('No active station to favorite.', false);
      const current = store.isFavorite(station);
      if (current !== command.favorite) toggleFavorite(station);
      return respond(`${command.favorite ? 'Favorited' : 'Removed favorite'}: ${station.name}.`);
    }
    if (command.type === 'airplay-list') {
      if (networkPolicy().offline) return respond('AirPlay discovery is disabled by RADIOCLI_OFFLINE=1.', false, []);
      const devices = await refreshAirPlayTargets(false);
      return respond(devices.length ? `${devices.length} AirPlay receiver(s) found.` : 'No AirPlay receivers found.', true, devices);
    }
    if (command.type === 'airplay-select') {
      if (networkPolicy().offline) return respond('AirPlay discovery is disabled by RADIOCLI_OFFLINE=1.', false);
      const devices = await refreshAirPlayTargets(false);
      const device = devices.find(item => item.id === command.deviceId);
      if (!device) return respond('AirPlay receiver not found. Refresh and use an exact receiver ID.', false, devices);
      if (device.local) {
        const backend = preferredLocalPlaybackBackend(availableBackends);
        if (!backend) return respond('No local playback backend is available. Run radiocli setup to install mpv.', false);
        updateSettings({preferredBackend: backend});
        if (playingStationRef.current && shouldRetuneForAudioOutput(player.getState().state)) {
          await playStation(playingStationRef.current, {queue: playbackQueueRef.current ?? queueFromCurrentList(playingStationRef.current)});
        }
        return respond(`Audio output set to this device (${backend}).`);
      }
      if (!isAirPlayBackendAvailable(availableBackends)) return respond('AirPlay playback is unavailable; run radiocli doctor.', false);
      updateSettings({preferredAirPlayDevice: device.id});
      updateSettings({preferredBackend: 'airplay'});
      if (playingStationRef.current && shouldRetuneForAudioOutput(player.getState().state)) {
        await playStation(playingStationRef.current, {queue: playbackQueueRef.current ?? queueFromCurrentList(playingStationRef.current)});
      }
      return respond(`Audio output set to AirPlay receiver ${device.name}.`);
    }
    if (command.type === 'airplay-local') {
      const backend = preferredLocalPlaybackBackend(availableBackends);
      if (!backend) return respond('No local playback backend is available. Run radiocli setup to install mpv.', false);
      updateSettings({preferredBackend: backend});
      if (playingStationRef.current && shouldRetuneForAudioOutput(player.getState().state)) {
        await playStation(playingStationRef.current, {queue: playbackQueueRef.current ?? queueFromCurrentList(playingStationRef.current)});
      }
      return respond(`Audio output set to this device (${backend}).`);
    }
    if (command.type === 'airplay-passcode') {
      const control = player.submitAirPlayPasscode(command.code);
      return respond(control.message ?? 'AirPlay code sent.', control.ok);
    }
    if (command.type === 'update-settings') {
      updateSettings(command.settings);
      return respond('RadioCLI settings updated.');
    }
    const active = playingStationRef.current;
    const queue = playbackQueueRef.current;
    if (!active || !queue?.stations.length) return respond('No playback queue is available.', false);
    const currentIndex = queue.stations.findIndex(item => stationKey(item) === stationKey(active));
    const delta = command.type === 'next' ? 1 : -1;
    const next = queue.stations[(Math.max(0, currentIndex) + delta + queue.stations.length) % queue.stations.length];
    if (!next) return respond('No adjacent station is available.', false);
    await playStation(next, {queue});
    return respond(`Playing ${next.name}.`);
  };

  useEffect(() => {
    if (!stdin.isTTY || !(settingsRef.current.agentControl ?? defaultAgentControlSettings).enabled) return;
    let disposed = false;
    let close: (() => Promise<void>) | undefined;
    void startRadioSession(command => agentHandlerRef.current(command)).then(async session => {
      if (disposed) {
        await session.close();
        return;
      }
      close = session.close;
      if (initialAgentCommand) await agentHandlerRef.current(initialAgentCommand);
    }).catch(error => setMessage(error instanceof Error ? error.message : 'Agent controls could not start.'));
    return () => {
      disposed = true;
      if (close) void close();
    };
  }, [initialAgentCommand, library.settings.agentControl?.enabled, stdin]);

  useAppInput({
    adjustVolume,
    airPlayCode,
    canEnterAirPlayCode,
    cancelPendingAutoSkip,
    copyStationUrl,
    openStationHomepage,
    beginLearningTransportKey,
    capturingTransportAction,
    commandMode,
    commandText,
    confirmCtrlCExit,
    currentItemCount,
    cycleDisplayColor,
    cycleAudioOutput,
    cycleReceiverStyle,
    cycleSleepTimer,
    editingCountryFilter,
    editingSearch,
    executeCommand,
    filteredCountries,
    go,
    lastRawTransportAtRef,
    lastSubmittedSearchRef,
    loadCountry,
    openAdjacentTab,
    openAirPlayCode,
    openAirPlaySettings,
    openSettingsPage,
    closeSettingsPage,
    openScreen,
    handleAlarmInput: alarmTui.handleInput,
    openAlarmForStation: alarmTui.openForStation,
    openActiveAlarms: alarmTui.openActive,
    playAdjacent,
    playStation,
    player,
    playingStation,
    recallSearchHistory,
    moveExploreCursor: moveExploreMapCursor,
    moveExploreCursorToCell: moveExploreMapCursorToCell,
    refreshProviderHealth,
    refreshAirPlayTargets: () => {
      void refreshAirPlayTargets();
    },
    resetLearnedTransportKeys,
    repairMcpIntegrations,
    setAgentIntegrationEnabled,
    runSearch,
    saveLearnedTransportKey,
    screen,
    settingsPage,
    searchQuery,
    selectedRef,
    selectedStationForInput,
    selectAirPlayDeviceAt,
    setCapturingTransportAction,
    setCommandMode,
    setCommandText,
    setCountryFilter,
    setAirPlayCode,
    setEditingCountryFilter,
    setEditingSearch,
    setMessage,
    setSearchQuery,
    setSelected,
    setShowDiagnostics,
    submitAirPlayCode,
    settingsRef,
    shutdown,
    stdin,
    toggleFavorite,
    toggleMute,
    togglePause,
    toggleSetting,
    toggleAgentSetting,
    toggleNearbyLocation,
    toggleDirectoryVoting,
    toggleRadioGarden,
    toggleSkipBrokenStreams,
    updateFromSettings
  });

  function currentItemCount(currentScreen: Screen): number {
    return itemCountsRef.current[currentScreen] ?? 0;
  }

  const hasTopTabs = layout.mode === 'full';
  const globalFooter = '←/→ tabs · F7/F9 or ,/. station · t/v display · ? help · q quit';
  const playbackFooter = screen === 'now-playing' ? null : playbackFooterText({
    station: footerStation,
    playback: footerPlayback,
    metadata: nowPlaying,
    queue: playbackQueueRef.current,
    favorite: store.isFavorite(footerStation),
    sleepLabel,
    width: frameWidth,
    spinnerFrame
  });
  const basePageFooter = pageFooterText({
    canEnterAirPlayCode,
    capturingTransportAction,
    commandMode,
    commandText,
    editingCountryFilter,
    editingSearch,
    playbackBackend: playback.backend,
    screen,
    settingsPage
  });
  const pageFooter = alarmTui.activeAlarms.length > 0 && screen !== 'alarm-ringing'
    ? `ALARM PLAYING · ! controls · ${basePageFooter}`
    : basePageFooter;
  const pageFooterOwnsCompactRow = Boolean(
    commandMode ||
    capturingTransportAction ||
    editingCountryFilter ||
    (screen === 'search' && editingSearch) ||
    screen === 'airplay-code'
  );
  const hasActiveMicroPlayback = Boolean(
    footerStation && (footerPlayback.state === 'playing' || footerPlayback.state === 'paused')
  );
  const statusMessage = message ?? persistenceWarning ?? presenceWarning;
  const microFooter = footerMessage ?? statusMessage ?? (
    pageFooterOwnsCompactRow
      ? pageFooter
      : footerPlayback.state === 'loading' && playbackFooter
        ? playbackFooter
        : hasActiveMicroPlayback
          ? microPlaybackControlsText(playback.backend)
          : pageFooter
  );
  const compactGlobalFooter = '←/→ tabs · ? help · q quit';
  const versionReserve = versionIndicatorWidth(installedVersion, library.updateCheck) + 2;
  const fullStatusRows = fullStatusFooterRows(screen, statusMessage, footerMessage, playbackFooter);
  const fullLegendRows = balancedFooterLegendRows(pageFooter, globalFooter, frameWidth, 2, versionReserve);
  const compactStatus = footerMessage ?? statusMessage ?? playbackFooter;
  const compactLegendRowCount = Math.max(1, layout.footerRows - (compactStatus ? 1 : 0));
  const compactLegendRows = balancedFooterLegendRows(pageFooter, compactGlobalFooter, frameWidth, compactLegendRowCount, versionReserve);
  const microLegendWidth = Math.max(1,frameWidth-versionReserve);
  const microLegend = commandMode || capturingTransportAction || footerMessage || statusMessage
    ? microFooter
    : microShortcutFooterText(microFooter, microLegendWidth);
  const footerText = (value: string): string => displayMode.ascii ? toAsciiSafe(value) : value;

  return (
    <ReceiverAnimationProvider
      screen={screen}
      playback={playback}
      receiverStyle={library.settings.receiverStyle}
      reduceMotion={displayMode.reduceMotion}
    >
    <DisplayContext.Provider value={displayMode}>
    <Box
      flexDirection="column"
      paddingX={layout.horizontalPadding}
      height={layout.rows}
      width={layout.columns}
      overflow="hidden"
      backgroundColor={displayMode.app}
    >
      {hasTopTabs ? (
        <Box height={3} flexShrink={0} backgroundColor={displayMode.app}>
          <TopTabs
            tabs={topTabs}
            active={activeTabForScreen(screen)}
            theme={theme}
            width={frameWidth}
            backendLabel={playbackBackendLabel(playback.backend)}
          />
        </Box>
      ) : null}
      <Box height={layout.contentRows} width={frameWidth} flexDirection="column" overflowY="hidden" flexShrink={0} backgroundColor={displayMode.app}>
        <AppContent
          airPlayDevices={availableAirPlayDevices}
          airPlayCode={airPlayCode}
          appVersion={installedVersion}
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
          playback={footerPlayback}
          playingStation={footerStation}
          providerHealth={providerHealth}
          searchQuery={searchQuery}
          screen={screen}
          settingsPage={settingsPage}
          selected={selected}
          showDiagnostics={showDiagnostics}
          sleepLabel={sleepLabel}
          stationContext={stationContext}
          exploreCursor={exploreCursor}
          stationFavorite={store.isFavorite(footerStation)}
          stationTime={stationApproximateTime(footerStation)}
          storePath={store.filePath}
          theme={theme}
          updateCheck={library.updateCheck}
          alarmTui={alarmTui}
        />
      </Box>
      <Box height={layout.footerRows} width={frameWidth} flexDirection="column" flexShrink={0} backgroundColor={displayMode.app}>
        {layout.mode === 'full' ? (
          <>
            {fullStatusRows.map(statusRow => (
              <Text key={statusRow.key} color={themeAccent(theme)}>{footerText(truncate(statusRow.text, frameWidth))}</Text>
            ))}
            <Text color={commandMode || capturingTransportAction ? themeAccent(theme) : textMuted}>{footerText(fullLegendRows[0] ?? ' ')}</Text>
            <Box><Text color={textDim}>{footerText(fullLegendRows[1] ?? ' ')}</Text><Box flexGrow={1}/><VersionIndicator currentVersion={installedVersion} updateCheck={library.updateCheck} theme={theme}/></Box>
          </>
        ) : (
          <>
            {layout.mode === 'micro' ? <Box><Text color={commandMode || capturingTransportAction || footerMessage || statusMessage ? themeAccent(theme) : textMuted}>
              {footerText(truncate(microLegend, microLegendWidth))}
            </Text><Box flexGrow={1}/><VersionIndicator currentVersion={installedVersion} updateCheck={library.updateCheck} theme={theme}/></Box> : <>
              {compactStatus ? <Text color={footerMessage || statusMessage ? themeAccent(theme) : textMuted}>{footerText(truncate(compactStatus, frameWidth))}</Text> : null}
              {compactLegendRows.map((row, index) => index===compactLegendRows.length-1?<Box key={`legend-${index}`}><Text color={textDim}>{footerText(row)}</Text><Box flexGrow={1}/><VersionIndicator currentVersion={installedVersion} updateCheck={library.updateCheck} theme={theme}/></Box>:<Text key={`legend-${index}`} color={index === 0 ? textMuted : textDim}>{footerText(row)}</Text>)}
            </>}
          </>
        )}
      </Box>
    </Box>
    </DisplayContext.Provider>
    </ReceiverAnimationProvider>
  );
}

function mcpRuntime() {
  return {nodePath: process.execPath, cliPath: fileURLToPath(new URL('../cli.js', import.meta.url))};
}

function integrationResultMessage(enabled: boolean, results: McpInstallResult[], failed: McpInstallResult[]): string {
  if (failed.length > 0) {
    return `${enabled ? 'Agent control enabled' : 'Agent control disabled'}, but ${failed.map(item => item.client).join(', ')} need attention. Run radiocli mcp status for details.`;
  }
  const configured = results.filter(item => item.status === (enabled ? 'configured' : 'removed')).map(item => item.client);
  if (!enabled) return 'Agent and voice control disabled; detected MCP registrations were removed.';
  return `Agent and voice control ready${configured.length ? ` for ${configured.join(', ')}` : ''}. Restart open Codex or agent clients, then ask them to control RadioCLI.`;
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

function appendUniqueStations(current: Station[], page: Station[]): Station[] {
  const stations = [...current];
  const seen = new Set(current.map(stationKey));
  for (const station of page) {
    const key = stationKey(station);
    if (!seen.has(key)) {
      seen.add(key);
      stations.push(station);
    }
  }

  return stations;
}

function formatCountryStationsSubtitle(country: Country, loaded: number, hasMore: boolean): string {
  const total = country.stationCount.toLocaleString();
  const loadedLabel = loaded.toLocaleString();
  return hasMore
    ? `${country.code} · ${loadedLabel} of ${total} listed stations loaded`
    : `${country.code} · ${loadedLabel} of ${total} listed stations`;
}

function formatSearchSubtitle(loaded: number, hasMore: boolean): string {
  const count = loaded.toLocaleString();
  return hasMore
    ? `Matches across enabled public station directories · ${count}+ loaded`
    : `Matches across enabled public station directories · ${count} loaded`;
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

function discoveryLoadError(fallback: string, error: unknown): string {
  const detail = error instanceof Error ? error.message.trim() : '';
  if (!detail || detail === fallback || fallback.includes(detail)) {
    return fallback;
  }

  return `${fallback} ${detail}`;
}

function nextAvailablePlaybackBackend(
  current: AppSettings['preferredBackend'],
  backends: string[]
): AppSettings['preferredBackend'] {
  const options: AppSettings['preferredBackend'][] = ['auto'];
  for (const backend of ['mpv', 'ffplay', 'vlc', 'airplay'] as const) {
    if (backends.includes(backend)) {
      options.push(backend);
    }
  }

  const index = options.indexOf(current);
  return options[(index + 1) % options.length] ?? 'auto';
}

function shouldRetuneForAudioOutput(state: PlaybackState['state']): boolean {
  return state === 'loading' || state === 'playing' || state === 'paused';
}

function audioOutputNeedsActiveSwitch(
  selectedOutput: AppSettings['preferredBackend'],
  activeBackend: string,
  backends: string[]
): boolean {
  const resolved = resolvedAudioOutput(selectedOutput, backends);
  return Boolean(resolved && activeBackend !== 'none' && activeBackend !== resolved);
}

function audioOutputCanApply(output: AppSettings['preferredBackend'], settings: AppSettings): boolean {
  return output !== 'airplay' || Boolean(settings.preferredAirPlayDevice);
}

function preferredLocalPlaybackBackend(backends: string[]): 'mpv' | 'ffplay' | 'vlc' | null {
  if (backends.includes('mpv')) {
    return 'mpv';
  }

  if (backends.includes('ffplay')) {
    return 'ffplay';
  }

  if (backends.includes('vlc')) {
    return 'vlc';
  }

  return null;
}

function audioOutputSwitchLabel(output: AppSettings['preferredBackend'], backends: string[]): string {
  const resolved = resolvedAudioOutput(output, backends);
  if (output === 'auto' && resolved) {
    return `${audioOutputLabel(resolved)} (automatic)`;
  }

  return audioOutputLabel(output);
}

function librarySubtitle(library: LibraryState): string {
  return `${library.favorites.length} favorites · ${library.recent.length} recent · ${library.imported.length} imported · favorites first`;
}

function mouseVisibleRows(screen: Screen, layout: TerminalLayout): number {
  if (screen === 'help') return Math.max(3, layout.contentRows - 4);
  if (screen === 'alarms' || screen === 'alarm-editor') return Math.max(1, layout.contentRows - 7);
  if (screen === 'alarm-picker') return Math.max(1, layout.contentRows - 5);
  if (screen === 'alarm-ringing') return Math.max(1, layout.contentRows - 7);
  if (layout.compact) return Math.max(1, layout.contentRows - 3);

  if (screen === 'countries') return layout.countryRows;
  if (screen === 'map') return layout.mapCountryRows;
  if (screen === 'search') return Math.max(1, layout.contentRows - 8);
  if (screen === 'settings') return Math.max(5, layout.contentRows - 10);
  if (screen === 'airplay-settings') return Math.max(1, layout.contentRows - 9);
  if (['stations', 'nearby', 'explore', 'library'].includes(screen)) return layout.stationRows;
  return layout.contentRows;
}
