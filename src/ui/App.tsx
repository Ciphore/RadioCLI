import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {fileURLToPath} from 'node:url';
import {Box, Text, useApp, useIsScreenReaderEnabled, useStdin, useStdout, useWindowSize} from 'ink';
import {ProviderManager} from '../providers/provider-manager.js';
import {PlaybackOutputError, PlayerController, type PlaybackControlResult} from '../player/player-controller.js';
import {airPlayLocalDeviceLabel, playbackBackendInstallHint, playbackBackendLabel} from '../player/backend-install.js';
import {JsonLibraryStore, stationKey} from '../storage/store.js';
import {LibraryRepository} from '../storage/repository.js';
import {RadioEngine} from '../player/radio-engine.js';
import {TuiPlayer, TuiRadioEngine, type TuiSession} from '../agent/tui-session.js';
import {defaultAgentControlSettings, type AirPlayDevice, type AppSettings, type Country, type IcyNowPlaying, type LibraryState, type LocationGuess, type PlaybackState, type DiscoveryPage, type Screen, type Station} from '../types.js';
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
import {useCommandExecutor, type SettingsUpdate} from './use-command-executor.js';
import {isAirPlayCodePromptActive} from './screens/AirPlayCodeScreen.js';
import {isAirPlayBackendAvailable} from './airplay-settings.js';
import {networkPolicy} from '../platform/network.js';
import {audioOutputLabel, resolvedAudioOutput} from './audio-output.js';
import {copyToClipboard, openExternal} from './system-actions.js';
import {safeExternalHttpUrl, safeMediaTarget, sanitizeTerminalText} from '../safety.js';
import {appVersion} from '../version.js';
import {automaticUpdateChecksAllowed, checkForUpdate, installUpdate, shouldCheckForUpdate, updateAvailableForVersion, updateCommandForInstall} from '../update-check.js';
import {airPlayPolicy, airPlaySetupRequiredMessage} from '../player/airplay-policy.js';
import {helpItemCountForAirPlay} from './help-content.js';
import {EXIT_CONFIRMATION_MS, ctrlCExitDecision} from './exit-confirmation.js';
import {createAlarmTuiService, serializeAlarmTuiService, type AlarmTuiService} from './alarm-tui-service.js';
import {useAlarmTui} from './use-alarm-tui.js';
import {toAsciiSafe} from './ascii.js';
import {registerTuiPresence} from '../alarms/tui-presence.js';
import {configureMcpIntegrations, type McpInstallResult} from '../agent/mcp-install.js';
import {allowedRadioSessionSettings, resolveDesktopTransport, serializeRadioCommands, startRadioSession, type RadioSessionCommand, type RadioSessionResult, type RadioSessionStatus} from '../agent/session.js';
import {desktopMediaPolicy, startDesktopMediaControls} from '../platform/desktop-media.js';
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
  platform?: NodeJS.Platform;
  playbackSession?: TuiSession;
  playbackRecoveryWarning?: string;
};

const LOADING_SPINNER_MS = 120;
const TRANSIENT_NOTICE_MS = 4500;
const COUNTRY_STATIONS_PAGE_SIZE = 120;
const COUNTRY_STATIONS_LOAD_AHEAD = 12;
const SEARCH_RESULTS_PAGE_SIZE = 90;
const SEARCH_RESULTS_LOAD_AHEAD = 12;

type BooleanSetting = 'resumeOnLaunch' | 'transparentBackground' | 'asciiMode' | 'reduceMotion' | 'mouseSupport' | 'automaticUpdateChecks';

const settingToggleLabel: Record<BooleanSetting, string> = {
  resumeOnLaunch: 'Resume on launch',
  transparentBackground: 'Transparent background',
  asciiMode: 'ASCII-safe display',
  reduceMotion: 'Reduce motion',
  mouseSupport: 'Mouse and trackpad scrolling',
  automaticUpdateChecks: 'Automatic update checks'
};

export function App({store: providedStore, providers: providedProviders, alarmService: providedAlarmService, alarmPreview, initialAgentCommand, mcpConfigurator = configureMcpIntegrations, updateChecker = checkForUpdate, platform = process.platform, playbackSession, playbackRecoveryWarning}: AppProps): React.ReactElement {
  const {exit} = useApp();
  const {stdin} = useStdin();
  const {stdout} = useStdout();
  const {columns, rows} = useWindowSize();
  const screenReader = useIsScreenReaderEnabled();
  const store = useMemo(() => new LibraryRepository(providedStore ?? new JsonLibraryStore(), {worker: !providedStore}), [providedStore]);
  const providers = useMemo(() => providedProviders ?? new ProviderManager(), [providedProviders]);
  const alarmService = useMemo(() => providedAlarmService ? serializeAlarmTuiService(providedAlarmService) : createAlarmTuiService(), [providedAlarmService]);
  const installedVersion = useMemo(() => appVersion(), []);

  const [library, setLibrary] = useState<LibraryState>(() => localSessionLibrary(store.snapshot(), platform, playbackSession?.status.tui?.selectionRequired));
  const settingsRef = useRef(library.settings);
  const settingsQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  const player = useMemo(() => playbackSession ? new TuiPlayer(playbackSession, () => settingsRef.current)
    : new PlayerController(() => settingsRef.current, {platform, arch: process.arch, env: platform === process.platform ? process.env : {}}), [platform, playbackSession]);
  const [playback, setPlayback] = useState<PlaybackState>(() => player.getState());
  const [availableBackends, setAvailableBackends] = useState<string[]>(() => player.detectedBackends());
  const airPlay = airPlayPolicy(library.settings, {platform});
  const airPlaySupported = airPlay.enabled;
  const airPlayUnavailableMessage = airPlay.enabled ? (platform === 'linux' ? airPlaySetupRequiredMessage : 'AirPlay is not ready on this install. Run radiocli doctor.') : airPlay.message;
  const [availableAirPlayDevices, setAvailableAirPlayDevices] = useState<AirPlayDevice[]>(() => player.detectedAirPlayDevices());
  const [screen, setScreen] = useState<Screen>(playbackSession?.status.station ? 'now-playing' : 'home');
  const [selected, setSelected] = useState(0);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('root');
  const [message, setMessage] = useState<string | null>(null);
  const [persistenceWarning, setPersistenceWarning] = useState<string | null>(null);
  const [presenceWarning, setPresenceWarning] = useState<string | null>(playbackRecoveryWarning ?? null);
  const [footerMessage, setFooterMessage] = useState<string | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryFilter, setCountryFilter] = useState('');
  const [editingCountryFilter, setEditingCountryFilter] = useState(false);
  const [loadingCountries, setLoadingCountries] = useState(false);
  const [stationContexts, setStationContexts] = useState<Record<StationContextKey, StationContext>>(initialStationContexts);
  const [loadingStationContexts, setLoadingStationContexts] = useState<Partial<Record<StationContextKey, boolean>>>({});
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
  const [sleepUntil, setSleepUntilState] = useState<number | null>(playbackSession?.status.tui?.sleepUntil ?? null);
  const setSleepUntil = useCallback((until: number | null) => {
    if (playbackSession) void playbackSession.call({type: 'tui-sleep', until}).catch(error => setMessage(sanitizeTerminalText(error instanceof Error ? error.message : String(error)) ?? 'Could not update the sleep timer.'));
    else setSleepUntilState(until);
  }, [playbackSession]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [capturingTransportAction, setCapturingTransportAction] = useState<MediaTransportAction | null>(null);
  const reportActionError = useCallback((error: unknown) => {
    setMessage(sanitizeTerminalText(error instanceof Error ? error.message : String(error)) ?? 'Could not complete this action.');
  }, []);
  // Optional history cannot change the result of playback or navigation. Keep
  // its warning until an explicit save succeeds; a no-op checkpoint proves nothing.
  const persistLibrary = useCallback(async (write: () => LibraryState | Promise<LibraryState>): Promise<LibraryState | undefined> => {
    try {
      const nextLibrary = localSessionLibrary(await write(), platform, player.airPlaySelectionRequired());
      setLibrary(nextLibrary);
      return nextLibrary;
    } catch (error) {
      const detail = sanitizeTerminalText(error instanceof Error ? error.message : String(error));
      setPersistenceWarning(`Library not saved. Set RADIOCLI_HOME to a writable directory.${detail ? ` ${detail}` : ''}`);
      return undefined;
    }
  }, [platform, player]);
  const engine = useMemo(() => playbackSession ? new TuiRadioEngine(playbackSession) : new RadioEngine(player, providers, store, () => settingsRef.current, saved => {
    setLibrary(localSessionLibrary(saved, platform, player.airPlaySelectionRequired()));
  }), [player, providers, store, platform, playbackSession]);
  const announcedUpdateRef = useRef(false);
  const automaticUpdateCheckStartedRef = useRef(false);
  const installingUpdateRef = useRef(false);
  const configuringMcpRef = useRef(false);
  const displayStationsRef = useRef<Station[]>([]);
  const playbackQueueRef = useRef<PlaybackQueue | null>(playbackSession?.status.queue.length
    ? {title: 'Recovered station list', sourceScreen: 'now-playing', sourceContextKey: null, stations: playbackSession.status.queue} : null);
  const focusNowPlayingRef = useRef(playbackSession?.status.tui?.focusNowPlaying ?? 0);
  const lastRawTransportAtRef = useRef(0);
  const loadingStationContextsRef = useRef<Partial<Record<StationContextKey, boolean>>>({});
  const countryPageRequestRef = useRef<string | null>(null);
  const searchPageRequestRef = useRef<string | null>(null);
  const activeSearchRef = useRef<{query: string; fingerprint: string} | null>(null);
  const searchContextFingerprintRef = useRef<string | null>(null);
  const searchFingerprint = JSON.stringify([filters.codec, filters.language, filters.minBitrate, Boolean(library.settings.enableRadioGarden)]);
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
  const outputCancellationRef = useRef(0);
  const pendingOutputChangesRef = useRef(0);
  const searchRequestRef = useRef(0);
  const countryRequestRef = useRef(0);
  const nearbyRequestRef = useRef(0);
  const discoveryAbortRef = useRef<Partial<Record<StationContextKey, AbortController>>>({});
  const beginDiscovery = useCallback((key: StationContextKey) => {
    discoveryAbortRef.current[key]?.abort();
    const controller = new AbortController(); discoveryAbortRef.current[key] = controller; return controller.signal;
  }, []);
  const cancelPendingTune = useCallback(() => {
    tuneRequestRef.current += 1;
    outputCancellationRef.current += 1;
    engine.cancel();
  }, [engine]);
  const volumeRequestRef = useRef(0);
  const agentHandlerRef = useRef<(command: RadioSessionCommand, signal?: AbortSignal) => Promise<RadioSessionResult>>(async () => {
    throw new Error('RadioCLI is still starting.');
  });
  const dispatchOwnerCommand = useMemo(() => serializeRadioCommands((command, signal) => agentHandlerRef.current(command, signal), {responsive: true}), []);
  const desktopPolicy = useMemo(() => desktopMediaPolicy(library.settings, {platform}), [library.settings.desktopMediaControls, platform]);
  const desktopSuspendedRef = useRef(false);
  const desktopMediaRef = useRef<ReturnType<typeof startDesktopMediaControls> | null>(null);
  const activeAlarmRef = useRef(false);
  const [controlSessionReady, setControlSessionReady] = useState(Boolean(playbackSession));

  const showTransientMessage = useCallback((nextMessage: string) => {
    if (transientMessageTimerRef.current) {
      clearTimeout(transientMessageTimerRef.current);
    }

    setMessage(nextMessage);
    transientMessageTimerRef.current = setTimeout(() => {
      setMessage(currentMessage => currentMessage === nextMessage ? null : currentMessage);
      transientMessageTimerRef.current = null;
    }, TRANSIENT_NOTICE_MS);
  }, []);

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
  stationContextsRef.current = activeStationContexts;
  exploreCursorRef.current = exploreCursor;

  const renderedStationContextKey = stationContextKeyForScreen(screen);
  const loadingStations = renderedStationContextKey ? Boolean(loadingStationContexts[renderedStationContextKey]) : false;
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
    settings: settingsItemsForPage(settingsPage, airPlaySupported).length,
    help: helpItemCountForAirPlay(airPlaySupported)
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
    settings: settingsItemsForPage(settingsPage, airPlaySupported).length,
    help: helpItemCountForAirPlay(airPlaySupported)
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


  useEffect(() => {
    if (!stdin.isTTY) return;
    try {
      const unregister = registerTuiPresence();
      return () => {
        try {unregister();}
        catch {console.error('RadioCLI could not remove its alarm-control presence marker. Stale markers are checked on the next launch.');}
      };
    } catch {
      setPresenceWarning([playbackRecoveryWarning, 'Alarm controls cannot register this terminal in the runtime directory. Browsing and playback remain available.'].filter(Boolean).join(' '));
    }
  }, [stdin, playbackRecoveryWarning]);

  const playingStationRef = useRef<Station | null>(null);
  playingStationRef.current = playingStation;
  useEffect(() => engine.onChange(current => {
    setPlayback(current.playback);
    playingStationRef.current = current.station;
    setPlayingStation(current.station);
    setTuningStation(current.tuningStation);
    setNowPlaying(current.nowPlaying);
    if (playbackSession) {
      setSleepUntilState(playbackSession.status.tui?.sleepUntil ?? null);
      const previous = playbackQueueRef.current;
      playbackQueueRef.current = current.queue.length ? {...(previous ?? {title: 'Current station list', sourceScreen: 'now-playing', sourceContextKey: null}), stations: current.queue} : null;
      const focus = playbackSession.status.tui?.focusNowPlaying ?? 0;
      if (focus !== focusNowPlayingRef.current) {
        focusNowPlayingRef.current = focus;
        screenRef.current = 'now-playing';
        setScreen('now-playing');
      }
    }
    if (current.warning) setPersistenceWarning(current.warning.replace('Listening history was not saved', 'Library not saved'));
    if (current.message) setMessage(current.message);
  }), [engine, playbackSession]);
  useEffect(() => {
    const off = store.subscribe(saved => {
      const next = localSessionLibrary(saved, platform, player.airPlaySelectionRequired());
      settingsRef.current = next.settings;
      setLibrary(next);
    });
    const offError = store.onError(error => setPersistenceWarning(`Library could not refresh: ${error.message}`));
    return () => {
      off(); offError();
      // Normal shutdown closes the owner explicitly. An unexpected render
      // failure must release this view's storage without stopping its audio.
      void (playbackSession ? store.close() : engine.close().finally(() => store.close())).catch(() => undefined);
    };
  }, [store, engine, platform, player, playbackSession]);

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
      exploreRequestRef.current += 1;
      countryRequestRef.current += 1;
      searchRequestRef.current += 1;
      nearbyRequestRef.current += 1;
      for (const controller of Object.values(discoveryAbortRef.current)) controller.abort();
      countryPageRequestRef.current = null;
      searchPageRequestRef.current = null;
      if (exploreMoveTimerRef.current) {
        clearTimeout(exploreMoveTimerRef.current);
      }
      if (transientMessageTimerRef.current) {
        clearTimeout(transientMessageTimerRef.current);
      }
      if (transientFooterMessageTimerRef.current) {
        clearTimeout(transientFooterMessageTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    setSelected(value => clamp(value, currentItemCount(screen) - 1));
  }, [availableAirPlayDevices.length, displayStations.length, filteredCountries.length, screen]);

  useEffect(() => {
    if (playbackSession) return;
    if (!sleepUntil) {
      return;
    }

    const delayMs = sleepUntil - Date.now();
    if (delayMs <= 0) {
      cancelPendingTune();
      void engine.stop({retainSelection: true}).catch(reportActionError);
      setSleepUntil(null);
      return;
    }

    const timer = setTimeout(() => {
      cancelPendingTune();
      void engine.stop({retainSelection: true}).catch(reportActionError);
      setSleepUntil(null);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [cancelPendingTune, engine, reportActionError, sleepUntil, playbackSession, setSleepUntil]);

  useEffect(() => {
    const backends = player.refreshDetectedBackends();
    setAvailableBackends(backends);
    const network = networkPolicy();
    if (platform === 'darwin' && airPlaySupported && !network.offline && !network.lowBandwidth) {
      void player.refreshAirPlayDevices().then(setAvailableAirPlayDevices).catch(() => setAvailableAirPlayDevices([]));
    }
    if (backends.length === 0) {
      setMessage(`No playback backend found. ${playbackBackendInstallHint()}`);
    }
  }, [airPlaySupported, platform, player]);

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
    stationContextsRef.current = {...stationContextsRef.current, [key]: context};
    setStationContexts(current => ({...current, [key]: context}));
  }, []);

  const setStationLoading = useCallback((key: StationContextKey, loading: boolean) => {
    if (loadingStationContextsRef.current[key] === loading) return;
    loadingStationContextsRef.current[key] = loading;
    setLoadingStationContexts(current => ({...current, [key]: loading}));
  }, []);

  const stationMatches = useCallback((left: Station, right: Station) => stationKey(left) === stationKey(right), []);

  const queueContainsStation = useCallback(
    (queue: PlaybackQueue | null, station: Station) => Boolean(queue?.stations.some(item => stationMatches(item, station))),
    [stationMatches]
  );

  const updateSettings = useCallback((update: SettingsUpdate): Promise<LibraryState> => {
    // Evaluate relative inputs after the preceding save has acknowledged. React
    // may still be rendering that save, so the committed ref is authoritative.
    const operation = settingsQueueRef.current.then(async () => {
      const settings = typeof update === 'function' ? update(settingsRef.current) : update;
      const saved = await store.updateSettings(settings);
      if (settings.preferredBackend === 'airplay' && settings.preferredAirPlayDevice) {
        // Receiver consent belongs to this acknowledged selection. Publish its
        // ID to the player before applying the Linux session output overlay.
        settingsRef.current = saved.settings;
        await player.selectAirPlayDevice(settings.preferredAirPlayDevice);
      }
      if (settings.preferredBackend && settings.preferredBackend !== 'airplay') await player.selectAirPlayDevice(null);
      const nextLibrary = localSessionLibrary(saved, platform, player.airPlaySelectionRequired());
      if (settings.enableNearbyLocation === false) {
        nearbyRequestRef.current += 1;
        discoveryAbortRef.current.nearby?.abort();
        setStationLoading('nearby', false);
      }
      settingsRef.current = nextLibrary.settings;
      setLibrary(nextLibrary);
      setPersistenceWarning(null);
      engine.clearWarning();
      return nextLibrary;
    });
    settingsQueueRef.current = operation.then(() => undefined, () => undefined);
    // Keyboard callbacks can intentionally fire and forget; awaited callers still
    // receive the original rejection and never acknowledge an uncommitted save.
    void operation.catch(reportActionError);
    return operation;
  }, [engine, platform, player, reportActionError, setStationLoading, store]);

  useEffect(() => {
    if (!selectedAirPlayDevice?.local || settingsRef.current.preferredBackend !== 'airplay') {
      return;
    }

    const preferredBackend = preferredLocalPlaybackBackend(availableBackends);
    if (!preferredBackend) {
      setMessage(`${selectedAirPlayDevice.name} is ${airPlayLocalDeviceLabel(platform)}. Install mpv to use local playback instead of AirPlay.`);
      return;
    }

    let changed = false;
    void updateSettings(current => {
      if (current.preferredBackend !== 'airplay' || current.preferredAirPlayDevice !== selectedAirPlayDevice.id) return {};
      changed = true;
      return {preferredBackend};
    }).then(() => {
      if (changed) setMessage(`${selectedAirPlayDevice.name} is ${airPlayLocalDeviceLabel(platform)}. Audio output: ${audioOutputLabel(preferredBackend)}.`);
    }).catch(() => undefined);
  }, [availableBackends, platform, selectedAirPlayDevice, updateSettings]);

  const beginLearningTransportKey = useCallback((action: MediaTransportAction) => {
    setCapturingTransportAction(action);
    setMessage(`Press a key for ${mediaActionLabel(action)}. Esc cancels.`);
  }, []);

  const resetLearnedTransportKeys = useCallback(() => {
    void updateSettings({mediaKeys: {previous: [], playPause: [], next: []}})
      .then(() => setMessage('Learned media keys reset. Built-in fallbacks still work.'))
      .catch(() => undefined);
  }, [updateSettings]);

  const saveLearnedTransportKey = useCallback(
    (action: MediaTransportAction, input: string) => {
      setCapturingTransportAction(null);
      void updateSettings(current => ({mediaKeys: addMediaKeyBinding(current.mediaKeys, action, input)}))
        .then(() => setMessage(`Learned ${mediaActionLabel(action)} key.`))
        .catch(() => undefined);
    },
    [updateSettings]
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
      itemCountsRef.current.settings = settingsItemsForPage('root', airPlaySupported).length;
      selectedByScreenRef.current.settings = selectedBySettingsPageRef.current.root ?? 0;
    }
    selectedByScreenRef.current[screenRef.current] = selectedRef.current;
    const remembered = selectedByScreenRef.current[destination] ?? 0;
    const nextSelection = clamp(options.resetSelection ? 0 : remembered, (itemCountsRef.current[destination] ?? 0) - 1);

    // Input can arrive in one batch before React renders the next screen.
    screenRef.current = destination;
    selectedRef.current = nextSelection;
    setScreen(destination);
    setSelected(nextSelection);
    if (options.clearMessage !== false) {
      setMessage(null);
    }
  }, [airPlaySupported]);

  const openSettingsPage = useCallback((next: SettingsPage) => {
    selectedBySettingsPageRef.current[settingsPageRef.current] = selectedRef.current;
    settingsPageRef.current = next;
    setSettingsPage(next);
    const nextSelection = clamp(
      selectedBySettingsPageRef.current[next] ?? 0,
      settingsItemsForPage(next, airPlaySupported).length - 1
    );
    selectedRef.current = nextSelection;
    setSelected(nextSelection);
    setMessage(null);
  }, [airPlaySupported]);

  const closeSettingsPage = useCallback(() => {
    if (settingsPageRef.current === 'root') {
      go('home');
      return;
    }
    openSettingsPage('root');
  }, [go, openSettingsPage]);

  const openAirPlayCode = useCallback(() => {
    if (!airPlaySupported) {
      showTransientMessage(airPlayUnavailableMessage);
      return;
    }
    setAirPlayCode('');
    go('airplay-code', {resetSelection: true, clearMessage: false});
  }, [airPlaySupported, airPlayUnavailableMessage, go, showTransientMessage]);

  useEffect(() => {
    if (isAirPlayCodePromptActive(playback) && screenRef.current !== 'airplay-code') {
      openAirPlayCode();
    }
  }, [openAirPlayCode, playback.backend, playback.message]);

  const shutdown = useCallback(() => {
    tuneRequestRef.current += 1;
    desktopSuspendedRef.current = true;
    desktopMediaRef.current?.close();
    cancelPendingTune();
    void engine.close().finally(() => store.close()).catch(reportActionError).finally(exit);
  }, [cancelPendingTune, engine, exit, reportActionError, store]);

  useEffect(() => {
    const finishForSignal = () => {
      tuneRequestRef.current += 1;
      desktopSuspendedRef.current = true;
      desktopMediaRef.current?.close();
      cancelPendingTune();
      void engine.close().finally(() => store.close()).catch(reportActionError).finally(() => process.exit(0));
    };
    process.once('SIGTERM', finishForSignal);
    process.once('SIGHUP', finishForSignal);
    return () => {
      process.off('SIGTERM', finishForSignal);
      process.off('SIGHUP', finishForSignal);
    };
  }, [cancelPendingTune, engine, reportActionError, store]);

  const loadExploreAt = useCallback(async (cursor: ExploreCursor) => {
    const requestId = exploreRequestRef.current + 1;
    exploreRequestRef.current = requestId;
    const signal = beginDiscovery('explore');
    setStationLoading('explore', true);
    if (screenRef.current === 'explore') setMessage(null);
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
      const stations = await providers.nearby(exploreCursorLocation(cursor), 90, {signal});
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
      if (stations.length === 0 && screenRef.current === 'explore') {
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
      if (screenRef.current === 'explore') setMessage(loadError);
    } finally {
      if (requestId === exploreRequestRef.current) {
        setStationLoading('explore', false);
      }
    }
  }, [beginDiscovery, providers, setStationContextFor, setStationLoading]);

  const loadExplore = useCallback(async () => {
    await loadExploreAt(exploreCursorRef.current);
  }, [loadExploreAt]);

  const moveExploreMapCursor = useCallback(
    (direction: ExploreMoveDirection, fast = false) => {
      const next = shiftExploreCursor(exploreCursorRef.current, direction, fast);
      exploreRequestRef.current += 1;
      exploreCursorRef.current = next;
      setExploreCursor(next);
      setSelected(0);
      setStationLoading('explore', true);
      setStationContextFor('explore', {
        title: 'Explore world',
        subtitle: `Move cursor: ${formatExploreCursor(next)}`,
        stations: stationContextsRef.current.explore.stations
      });
      if (exploreMoveTimerRef.current) {
        clearTimeout(exploreMoveTimerRef.current);
      }
      exploreMoveTimerRef.current = setTimeout(() => {
        exploreMoveTimerRef.current = null;
        void loadExploreAt(next);
      }, 220);
    },
    [loadExploreAt, setStationContextFor, setStationLoading]
  );

  const moveExploreMapCursorToCell = useCallback(
    (x: number, y: number) => {
      const next = exploreCursorForMouseCell(x, y, frameWidth, layout);
      if (!next) {
        return;
      }

      if (exploreMoveTimerRef.current) {
        clearTimeout(exploreMoveTimerRef.current);
        exploreMoveTimerRef.current = null;
      }

      void loadExploreAt(next);
    },
    [frameWidth, layout, loadExploreAt]
  );

  const loadCountry = useCallback(
    async (country: Country, navigate = true) => {
      const previous = stationContextsRef.current.stations;
      if (previous.country?.code === country.code && loadingStationContextsRef.current.stations && !countryPageRequestRef.current) {
        if (navigate) go('stations');
        return;
      }
      const signal = beginDiscovery('stations');
      const requestId = countryRequestRef.current + 1;
      countryRequestRef.current = requestId;
      setStationLoading('stations', true);
      countryPageRequestRef.current = null;
      const retainedStations = previous.country?.code === country.code ? previous.stations : [];
      setStationContextFor('stations', {
        title: country.name,
        subtitle: formatCountryStationsSubtitle(country, retainedStations.length, false),
        stations: retainedStations,
        country
      });
      if (navigate) go('stations', {resetSelection: true});
      try {
        const page = typeof providers.byCountryPage === 'function'
          ? await providers.byCountryPage(country.code, {limit: COUNTRY_STATIONS_PAGE_SIZE, signal})
          : legacyDiscoveryPage(await providers.byCountry(country.code, COUNTRY_STATIONS_PAGE_SIZE, 0), COUNTRY_STATIONS_PAGE_SIZE);
        const stations = page.items;
        if (requestId !== countryRequestRef.current) return;
        setStationContextFor('stations', {
          title: country.name,
          subtitle: formatCountryStationsSubtitle(country, stations.length, !page.exhausted),
          stations,
          country,
          hasMore: !page.exhausted, nextCursor: page.nextCursor, sources: page.sources,
          error: discoverySourceWarning(page.sources)
        });
        selectedByScreenRef.current.stations = 0;
        if (screenRef.current === 'stations') setSelected(0);
      } catch (error) {
        if (requestId !== countryRequestRef.current) return;
        const loadError = error instanceof Error ? error.message : `Could not load ${country.name}.`;
        setStationContextFor('stations', {...stationContextsRef.current.stations, error: loadError});
        if (screenRef.current === 'stations') setMessage(loadError);
      } finally {
        if (requestId === countryRequestRef.current) setStationLoading('stations', false);
      }
    },
    [beginDiscovery, go, providers, setStationContextFor, setStationLoading]
  );

  const loadMoreCountryStations = useCallback(async () => {
    const context = stationContextsRef.current.stations;
    const country = context.country;
    if (!country || !context.hasMore || loadingStationContextsRef.current.stations) {
      return;
    }

    const offset = context.stations.length;
    const requestId = countryRequestRef.current;
    const requestKey = `${requestId}:${country.code}:${context.nextCursor ?? offset}`;
    if (countryPageRequestRef.current === requestKey) {
      return;
    }

    countryPageRequestRef.current = requestKey;
    setStationLoading('stations', true);
    try {
      const page = typeof providers.byCountryPage === 'function'
        ? await providers.byCountryPage(country.code, {limit: COUNTRY_STATIONS_PAGE_SIZE, cursor: context.nextCursor, signal: discoveryAbortRef.current.stations?.signal})
        : legacyDiscoveryPage(await providers.byCountry(country.code, COUNTRY_STATIONS_PAGE_SIZE, offset), COUNTRY_STATIONS_PAGE_SIZE);
      const latest = stationContextsRef.current.stations;
      if (requestId !== countryRequestRef.current || latest.country?.code !== country.code || latest.stations.length !== offset) {
        return;
      }

      const stations = appendUniqueStations(latest.stations, page.items);
      const hasMore = !page.exhausted;
      setStationContextFor('stations', {
        ...latest,
        subtitle: formatCountryStationsSubtitle(country, stations.length, hasMore),
        stations,
        hasMore, nextCursor: page.nextCursor, sources: page.sources,
        error: discoverySourceWarning(page.sources)
      });
    } catch (error) {
      if (requestId === countryRequestRef.current && screenRef.current === 'stations' && stationContextsRef.current.stations.country?.code === country.code) {
        setMessage(error instanceof Error ? error.message : `Could not load more ${country.name} stations.`);
      }
    } finally {
      if (countryPageRequestRef.current === requestKey) {
        countryPageRequestRef.current = null;
        setStationLoading('stations', false);
      }
    }
  }, [providers, setStationContextFor, setStationLoading]);

  useEffect(() => {
    if (
      screen === 'stations' &&
      stationContexts.stations.country &&
      stationContexts.stations.hasMore &&
      stationCounts.stations - selected <= COUNTRY_STATIONS_LOAD_AHEAD
    ) {
      void loadMoreCountryStations();
    }
  }, [
    loadMoreCountryStations,
    screen,
    selected,
    stationContexts.stations.country,
    stationContexts.stations.hasMore,
    stationCounts.stations,
    stationContexts.stations.nextCursor
  ]);

  const runSearch = useCallback(
    async (query = searchQuery) => {
      if (!query.trim()) {
        setMessage('Enter a station, genre, language, or place.');
        return;
      }

      const signal = beginDiscovery('search');
      const requestId = searchRequestRef.current + 1;
      searchRequestRef.current = requestId;
      activeSearchRef.current = {query: query.trim(), fingerprint: searchFingerprint};
      searchPageRequestRef.current = null;
      setStationLoading('search', true);
      if (screenRef.current === 'search') setMessage(null);
      try {
        const pageOptions = {
          limit: SEARCH_RESULTS_PAGE_SIZE,
          signal,
          codec: filters.codec ?? undefined,
          language: filters.language ?? undefined,
          minBitrate: filters.minBitrate ?? undefined
        };
        const page = typeof providers.searchPage === 'function'
          ? await providers.searchPage(query, settingsRef.current, pageOptions)
          : legacyDiscoveryPage(await providers.search(query, settingsRef.current, pageOptions), SEARCH_RESULTS_PAGE_SIZE);
        const stations = page.items;
        if (requestId !== searchRequestRef.current) return;
        searchContextFingerprintRef.current = searchFingerprint;
        setStationContextFor('search', {
          title: `Search: ${query}`,
          subtitle: formatSearchSubtitle(stations.length, !page.exhausted),
          stations,
          query: query.trim(),
          hasMore: !page.exhausted, nextCursor: page.nextCursor, sources: page.sources,
          error: discoverySourceWarning(page.sources)
        });
        selectedByScreenRef.current.search = 0;
        lastSubmittedSearchRef.current = query.trim();
        persistLibrary(() => store.addSearch(query));
        searchHistoryRef.current = {cursor: -1, draft: ''};
        if (screenRef.current === 'search') {
          setSelected(0);
          setEditingSearch(true);
        }
      } catch (error) {
        if (requestId !== searchRequestRef.current) return;
        if (screenRef.current === 'search') setMessage(error instanceof Error ? error.message : 'Search failed.');
      } finally {
        if (requestId === searchRequestRef.current) setStationLoading('search', false);
      }
    },
    [beginDiscovery, filters, persistLibrary, providers, searchFingerprint, searchQuery, setStationContextFor, setStationLoading, store]
  );

  useEffect(() => {
    const active = activeSearchRef.current;
    // A cursor belongs to the exact server filters and enabled directories.
    // Reissue the submitted query, including when a previous request is pending.
    if (active && active.fingerprint !== searchFingerprint) void runSearch(active.query);
  }, [runSearch, searchFingerprint]);

  const loadMoreSearchResults = useCallback(async () => {
    const context = stationContextsRef.current.search;
    const query = context.query;
    if (!query || !context.hasMore || loadingStationContextsRef.current.search || searchContextFingerprintRef.current !== searchFingerprint) {
      return;
    }

    const offset = context.stations.length;
    const requestId = searchRequestRef.current;
    const requestKey = `${requestId}:${query}:${context.nextCursor ?? offset}:${filters.codec ?? ''}:${filters.language ?? ''}:${filters.minBitrate ?? ''}`;
    if (searchPageRequestRef.current === requestKey) {
      return;
    }

    searchPageRequestRef.current = requestKey;
    setStationLoading('search', true);
    try {
      const pageOptions = {
        limit: SEARCH_RESULTS_PAGE_SIZE,
        cursor: context.nextCursor,
        signal: discoveryAbortRef.current.search?.signal,
        codec: filters.codec ?? undefined,
        language: filters.language ?? undefined,
        minBitrate: filters.minBitrate ?? undefined
      };
      const page = typeof providers.searchPage === 'function'
        ? await providers.searchPage(query, settingsRef.current, pageOptions)
        : legacyDiscoveryPage(await providers.search(query, settingsRef.current, {...pageOptions, offset}), SEARCH_RESULTS_PAGE_SIZE);
      const latest = stationContextsRef.current.search;
      if (requestId !== searchRequestRef.current || latest.query !== query || latest.stations.length !== offset) {
        return;
      }

      const stations = appendUniqueStations(latest.stations, page.items);
      const hasMore = !page.exhausted;
      setStationContextFor('search', {
        ...latest,
        subtitle: formatSearchSubtitle(stations.length, hasMore),
        stations,
        hasMore, nextCursor: page.nextCursor, sources: page.sources,
        error: discoverySourceWarning(page.sources)
      });
    } catch (error) {
      if (requestId === searchRequestRef.current && screenRef.current === 'search' && stationContextsRef.current.search.query === query) {
        setMessage(error instanceof Error ? error.message : 'Could not load more search results.');
      }
    } finally {
      if (searchPageRequestRef.current === requestKey) {
        searchPageRequestRef.current = null;
        setStationLoading('search', false);
      }
    }
  }, [filters, providers, searchFingerprint, setStationContextFor, setStationLoading]);

  useEffect(() => {
    if (
      screen === 'search' &&
      stationContexts.search.hasMore &&
      stationCounts.search - selected <= SEARCH_RESULTS_LOAD_AHEAD
    ) {
      void loadMoreSearchResults();
    }
  }, [
    loadMoreSearchResults,
    screen,
    selected,
    stationContexts.search.hasMore,
    stationCounts.search,
    stationContexts.search.nextCursor
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
    const signal = beginDiscovery('nearby');
    const requestId = nearbyRequestRef.current + 1;
    nearbyRequestRef.current = requestId;
    setStationLoading('nearby', true);
    if (screenRef.current === 'nearby') setMessage(null);
    setStationContextFor('nearby', {
      ...stationContextsRef.current.nearby,
      error: undefined
    });
    try {
      if (!settingsRef.current.enableNearbyLocation) {
        if (stationContextsRef.current.nearby.stations.length > 0) {
          if (screenRef.current === 'nearby') setMessage('Nearby location lookup is off. Showing the last nearby station list.');
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

      const detected = location ?? (await providers.detectLocation({signal}));
      if (requestId !== nearbyRequestRef.current) return;
      setLocation(detected);
      if (!detected) {
        if (stationContextsRef.current.nearby.stations.length > 0) {
          if (screenRef.current === 'nearby') setMessage('Location detection is unavailable. Showing the last nearby station list.');
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

      const stations = await providers.nearby(detected, 90, {signal});
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
      if (screenRef.current === 'nearby') setMessage(loadError);
    } finally {
      if (requestId === nearbyRequestRef.current) setStationLoading('nearby', false);
    }
  }, [beginDiscovery, location, providers, setStationContextFor, setStationLoading]);

  const queueFromCurrentList = useCallback(
    (station: Station): PlaybackQueue => {
      const sourceScreen = screenRef.current;
      const sourceContextKey = stationContextKeyForScreen(sourceScreen);
      const currentList = sourceContextKey
        ? applyStationFilters(stationContextsRef.current[sourceContextKey].stations, filters)
        : displayStationsRef.current;
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
    [filters, queueContainsStation, stationMatches]
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

  const playStation = useCallback(async (station: Station, options: PlayStationOptions & {outputChange?: boolean} = {}) => {
    if (options.signal?.aborted) return;
    if (!options.outputChange) outputCancellationRef.current += 1;
    const requestId = ++tuneRequestRef.current;
    const pendingSettings = settingsQueueRef.current;
    const queue = options.queue ?? queueFromCurrentList(station);
    try {
      await pendingSettings;
      if (requestId !== tuneRequestRef.current || options.signal?.aborted) return;
      desktopSuspendedRef.current = false;
      playbackQueueRef.current = queue;
      const tuned = await engine.tune(station, {queue: queue.stations, startPaused: options.startPaused, signal: options.signal});
      if (requestId !== tuneRequestRef.current) return;
      const index = queue.stations.findIndex(item => stationMatches(item, tuned));
      if (index >= 0 && !stationMatches(tuned, station)) rememberQueueSelection(queue, index);
      desktopMediaRef.current?.refresh();
      if (screenRef.current === 'library') {
        const nextLibraryStations = applyStationFilters(buildLibraryStations(store.getSnapshot()), filters);
        const nextIndex = nextLibraryStations.findIndex(item => stationMatches(item, tuned));
        if (nextIndex >= 0) { selectedByScreenRef.current.library = nextIndex; setSelected(nextIndex); }
      }
      if (options.openNowPlaying) go('now-playing');
      setMessage(null);
      return tuned;
    } catch (error) {
      if (requestId !== tuneRequestRef.current || options.signal?.aborted || (error as Error).name === 'AbortError') return;
      setMessage(error instanceof Error ? error.message : 'Could not tune station.');
    }
  }, [engine, filters, go, queueFromCurrentList, rememberQueueSelection, stationMatches, store]);

  // Resume the most recent station on launch when opted in, like a radio
  // powering back on to its last frequency. Runs once and never auto-navigates.
  const didResumeRef = useRef(false);
  useEffect(() => {
    if (didResumeRef.current) {
      return;
    }

    didResumeRef.current = true;
    if (playbackSession?.status.station || playbackSession?.status.tui?.tuningStation) return;
    if (!settingsRef.current.resumeOnLaunch) {
      return;
    }

    const last = store.snapshot().recent[0]?.station;
    if (last) {
      void playStation(last);
    }
  }, [playStation, store, playbackSession]);

  const cancelPendingAutoSkip = useCallback(() => {
    if (!engine.snapshot().message?.includes('Skipping to')) return;
    cancelPendingTune();
    setMessage('Auto-skip canceled. Choose a station and press Enter.');
  }, [cancelPendingTune, engine]);

  const showTransientFooterMessage = useCallback((nextMessage: string, durationMs = TRANSIENT_NOTICE_MS) => {
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
    (station: Station | null): Promise<void> => {
      const operation = (async () => {
      if (!station) {
        setMessage('Select or play a station before pressing f.');
        return;
      }

      const wasFavorite = store.isFavorite(station);
      setLibrary(localSessionLibrary(await store.toggleFavorite(station), platform, player.airPlaySelectionRequired()));
      setPersistenceWarning(null);
      engine.clearWarning();
      const favoriteMessage = `${wasFavorite ? 'Removed from' : 'Added to'} favorites: ${station.name}`;
      if (screenRef.current === 'library' || screenRef.current === 'search') {
        showTransientFooterMessage(favoriteMessage);
      } else {
        showTransientMessage(favoriteMessage);
      }
      if (!wasFavorite && settingsRef.current.shareDirectoryVotes) {
        // Best-effort upvote back to the directory; never blocks favoriting.
        void providers.vote(station).catch(reportActionError);
      }
      })();
      void operation.catch(reportActionError);
      return operation;
    },
    [engine, platform, player, providers, reportActionError, showTransientFooterMessage, showTransientMessage, store]
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
    async (code: string) => {
      try {
        const result = await player.submitAirPlayPasscode(code);
        if (result.ok) {
          setAirPlayCode('');
          setMessage(result.message ?? 'AirPlay code sent.');
          go('now-playing', {clearMessage: false});
          return;
        }
        showControlResult(result);
      } catch (error) {
        reportActionError(error);
      }
    },
    [go, player, showControlResult, reportActionError]
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

  const cycleDisplayColor = useCallback(() => {
    void updateSettings(current => ({theme: nextTheme(current.theme)}))
      .then(saved => showTransientMessage(`Display color: ${saved.settings.theme}`)).catch(() => undefined);
  }, [showTransientMessage, updateSettings]);

  const cycleReceiverStyle = useCallback(() => {
    void updateSettings(current => ({receiverStyle: nextReceiverStyle(current.receiverStyle)}))
      .then(saved => showTransientMessage(`Receiver style: ${saved.settings.receiverStyle}`)).catch(() => undefined);
  }, [showTransientMessage, updateSettings]);

  const toggleRadioGarden = useCallback(() => {
    void (async () => {
    const {settings: {enableRadioGarden}} = await updateSettings(current => ({enableRadioGarden: !current.enableRadioGarden}));
    setMessage(`Radio Garden ${enableRadioGarden ? 'enabled' : 'disabled'}.`);
    setTimeout(refreshProviderHealth, 0);
    })().catch(reportActionError);
  }, [refreshProviderHealth, reportActionError, updateSettings]);

  const toggleNearbyLocation = useCallback(() => {
    void (async () => {
    const {settings: {enableNearbyLocation}} = await updateSettings(current => ({enableNearbyLocation: !current.enableNearbyLocation}));
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
    })().catch(reportActionError);
  }, [loadNearby, reportActionError, setStationContextFor, updateSettings]);

  const toggleDirectoryVoting = useCallback(() => {
    void (async () => {
    const {settings: {shareDirectoryVotes}} = await updateSettings(current => ({shareDirectoryVotes: !current.shareDirectoryVotes}));
    setMessage(`Radio Browser favorite votes ${shareDirectoryVotes ? 'enabled' : 'disabled'}.`);
    })().catch(reportActionError);
  }, [reportActionError, updateSettings]);

  const refreshAirPlayTargets = useCallback(async (announce = true): Promise<AirPlayDevice[]> => {
    if (!airPlaySupported) {
      if (announce) showTransientMessage(airPlayUnavailableMessage);
      return [];
    }
    if (platform === 'linux' && !player.refreshDetectedBackends().includes('airplay')) {
      setMessage(airPlaySetupRequiredMessage);
      throw new PlaybackOutputError(airPlaySetupRequiredMessage);
    }
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
    } catch (error) {
      setAvailableAirPlayDevices([]);
      throw error instanceof Error ? error : new Error('AirPlay receiver refresh failed.');
    }
  }, [airPlaySupported, airPlayUnavailableMessage, platform, player, showTransientMessage]);

  const openAirPlaySettings = useCallback(() => {
    if (!airPlaySupported) {
      showTransientMessage(airPlayUnavailableMessage);
      return;
    }
    const preferredIndex = availableAirPlayDevices.findIndex(device => device.id === settingsRef.current.preferredAirPlayDevice);
    selectedByScreenRef.current['airplay-settings'] = Math.max(0, preferredIndex);
    go('airplay-settings', {resetSelection: false});
    void refreshAirPlayTargets(false).catch(reportActionError);
  }, [airPlaySupported, airPlayUnavailableMessage, availableAirPlayDevices, go, refreshAirPlayTargets, reportActionError, showTransientMessage]);

  const selectAirPlayDeviceAt = useCallback(
    (index: number) => {
      pendingOutputChangesRef.current += 1;
      void (async () => {
      const requestId = outputCancellationRef.current;
      const device = availableAirPlayDevices[index];
      if (!device) {
        setMessage('No AirPlay receiver selected.');
        return;
      }

      const preferredBackend = device.local
        ? preferredLocalPlaybackBackend(availableBackends)
        : isAirPlayBackendAvailable(availableBackends) ? 'airplay' : null;
      await updateSettings({preferredAirPlayDevice: device.id, ...(preferredBackend ? {preferredBackend} : {})});
      if (requestId !== outputCancellationRef.current) return;
      selectedByScreenRef.current['airplay-settings'] = index;
      if (device.local) {
        if (!preferredBackend) {
          setMessage(`${device.name} is ${airPlayLocalDeviceLabel(platform)}. Install mpv to use local playback instead of AirPlay.`);
          return;
        }

        if (playingStation && shouldRetuneForAudioOutput(playback.state)) {
          const queue = playbackQueueRef.current ?? queueFromCurrentList(playingStation);
          setMessage(`${device.name} is ${airPlayLocalDeviceLabel(platform)}. Switching audio to ${audioOutputLabel(preferredBackend)}...`);
          await playStation(playingStation, {queue, outputChange: true});
          return;
        }

        setMessage(`${device.name} is ${airPlayLocalDeviceLabel(platform)}. Audio output: ${audioOutputLabel(preferredBackend)}.`);
        return;
      }

      if (!preferredBackend) {
        setMessage(`AirPlay receiver: ${device.name}. AirPlay playback is unavailable; run radiocli doctor.`);
        return;
      }

      if (playingStation && shouldRetuneForAudioOutput(playback.state)) {
        const queue = playbackQueueRef.current ?? queueFromCurrentList(playingStation);
        setMessage(`Switching audio to AirPlay: ${device.name}...`);
        await playStation(playingStation, {queue, outputChange: true});
        return;
      }

      setMessage(`AirPlay receiver: ${device.name}. Audio output: AirPlay.`);
      })().catch(reportActionError).finally(() => {pendingOutputChangesRef.current -= 1;});
    },
    [availableAirPlayDevices, availableBackends, platform, playback.state, player, playStation, playingStation, queueFromCurrentList, reportActionError, updateSettings]
  );

  const cycleAudioOutput = useCallback(() => {
    const precedingOutputChange = pendingOutputChangesRef.current > 0;
    pendingOutputChangesRef.current += 1;
    void (async () => {
    const requestId = outputCancellationRef.current;
    let preferredBackend!: AppSettings['preferredBackend'];
    await updateSettings(current => {
      const currentPlayback = player.getState();
      const activeNeedsSelectedOutput = Boolean(
        !precedingOutputChange && playingStation &&
        shouldRetuneForAudioOutput(currentPlayback.state) &&
        audioOutputCanApply(current.preferredBackend, current) &&
        audioOutputNeedsActiveSwitch(current.preferredBackend, currentPlayback.backend, availableBackends)
      );
      preferredBackend = activeNeedsSelectedOutput
        ? current.preferredBackend
        : nextAvailablePlaybackBackend(current.preferredBackend, platform === 'linux' && airPlaySupported ? [...new Set([...availableBackends, 'airplay'])] : availableBackends);
      return {preferredBackend};
    });
    if (requestId !== outputCancellationRef.current) return;

    if (preferredBackend === 'airplay' && (!settingsRef.current.preferredAirPlayDevice || player.airPlaySelectionRequired())) {
      setMessage('Choose an AirPlay receiver first. Your current station will keep playing until you pick one.');
      openAirPlaySettings();
      return;
    }

    if (playingStation && shouldRetuneForAudioOutput(playback.state)) {
      const queue = playbackQueueRef.current ?? queueFromCurrentList(playingStation);
      setMessage(`Switching audio to ${audioOutputSwitchLabel(preferredBackend, availableBackends)}...`);
      await playStation(playingStation, {queue, outputChange: true});
      return;
    }

    setMessage(`Audio output: ${audioOutputSwitchLabel(preferredBackend, availableBackends)}.`);
    })().catch(reportActionError).finally(() => {pendingOutputChangesRef.current -= 1;});
  }, [airPlaySupported, availableBackends, openAirPlaySettings, platform, playback.state, player, playStation, playingStation, queueFromCurrentList, reportActionError, updateSettings]);

  const toggleSkipBrokenStreams = useCallback(() => {
    void updateSettings(current => ({skipBrokenStreams: !current.skipBrokenStreams}))
      .then(saved => setMessage(`Skip broken streams ${saved.settings.skipBrokenStreams ? 'enabled' : 'disabled'}.`))
      .catch(() => undefined);
  }, [updateSettings]);

  const toggleSetting = useCallback(
    (key: BooleanSetting) => {
      void updateSettings(current => ({[key]: key === 'mouseSupport' ? current.mouseSupport === false : !current[key]}))
        .then(saved => setMessage(`${settingToggleLabel[key]} ${saved.settings[key] ? 'on' : 'off'}.`))
        .catch(() => undefined);
    },
    [updateSettings]
  );

  const toggleAgentSetting = useCallback(
    (key: 'openUiOnPlay' | 'focusNowPlaying') => {
      void updateSettings(current => {
        const agentControl = current.agentControl ?? defaultAgentControlSettings;
        return {agentControl: {...agentControl, [key]: !agentControl[key]}};
      }).then(saved => setMessage(`Agent ${key === 'openUiOnPlay' ? 'TUI launch' : 'Now Playing focus'} ${saved.settings.agentControl?.[key] ? 'on' : 'off'}.`))
        .catch(() => undefined);
    },
    [updateSettings]
  );

  const setAgentIntegrationEnabled = useCallback(async () => {
    if (configuringMcpRef.current) {
      setMessage('Agent integration setup is already in progress.');
      return;
    }
    configuringMcpRef.current = true;
    await settingsQueueRef.current;
    const enabled = !(settingsRef.current.agentControl ?? defaultAgentControlSettings).enabled;
    setMessage(enabled ? 'Setting up agent and Codex Voice control...' : 'Disabling agent and voice control...');
    try {
      const results = await mcpConfigurator(enabled, mcpRuntime(), null);
      const failed = results.filter(item => item.status === 'failed');
      await updateSettings(current => ({agentControl: {...(current.agentControl ?? defaultAgentControlSettings), enabled}}));
      setMessage(integrationResultMessage(enabled, results, failed));
    } catch (error) {
      if (!enabled) {
        await updateSettings(current => ({agentControl: {...(current.agentControl ?? defaultAgentControlSettings), enabled: false}}));
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
      await updateSettings(current => ({agentControl: {...(current.agentControl ?? defaultAgentControlSettings), enabled: true}}));
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
  }, [sleepUntil, setSleepUntil]);

  const openLibrary = useCallback(() => {
    go('library', {resetSelection: false});
  }, [go]);

  const selectedStation = displayStations[selected] ?? null;
  const selectedStationForInput = useCallback(
    () => {
      const key = stationContextKeyForScreen(screenRef.current);
      const stations = key ? applyStationFilters(stationContextsRef.current[key].stations, filters) : displayStationsRef.current;
      return stations[selectedRef.current] ?? null;
    },
    [filters]
  );

  const alarmTui = useAlarmTui({
    service: alarmService,
    store,
    library,
    setLibrary,
    screen,
    screenRef,
    selected,
    selectedRef,
    setSelected,
    go,
    setMessage,
    playingStation,
    previewStation: alarmPreview ?? (async station => { await playStation(station); })
  });
  for (const alarmScreen of ['alarms', 'alarm-editor', 'alarm-picker', 'alarm-ringing'] as const) {
    itemCountsRef.current[alarmScreen] = alarmTui.itemCount(alarmScreen) ?? 0;
  }

  const openScreen = useCallback(
    (target: Screen) => {
      if (target === 'explore') {
        go('explore');
        if (stationContextsRef.current.explore.stations.length === 0 && !loadingStationContextsRef.current.explore) {
          void loadExplore();
        }
      } else if (target === 'nearby') {
        go('nearby');
        if (stationContextsRef.current.nearby.stations.length === 0 && !loadingStationContextsRef.current.nearby) {
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
      const active = activeTabForScreen(screenRef.current);
      const currentIndex = topTabs.findIndex(tab => tab.screen === active);
      const nextIndex = (currentIndex + direction + topTabs.length) % topTabs.length;
      const next = topTabs[nextIndex];
      if (next) {
        openScreen(next.screen);
      }
    },
    [openScreen]
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
          setMessage(`Update installed.${suffix} Quit and reopen RadioCLI; restart MCP clients to load updated tools.`);
        } catch {
          setMessage('Update installed. MCP repair failed; run radiocli mcp repair, then quit and reopen RadioCLI and restart MCP clients.');
        }
      } else {
        setMessage('Update installed. Quit and reopen RadioCLI to use the new version.');
      }
      return;
    }

    const detail = result.output ? ` ${result.output.split('\n').at(-1)}` : '';
    setMessage(`Update install failed. Run manually: ${result.command}.${detail}`);
  }, [installedVersion, library.updateCheck, mcpConfigurator, refreshUpdateCheck, store]);

  const executeCommand = useCommandExecutor({
    beginLearningTransportKey,
    cancelPendingTune,
    countries,
    go,
    loadCountry,
    openAirPlaySettings,
    openAirPlayCode,
    openLibrary,
    persistLibrary,
    player,
    playingStation,
    providers,
    resetLearnedTransportKeys,
    runSearch,
    screen,
    screenRef,
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

  agentHandlerRef.current = async (command: RadioSessionCommand, signal?: AbortSignal): Promise<RadioSessionResult> => {
    const sessionStatus = (): RadioSessionStatus => ({
      owner: 'tui',
      playback: player.getState(),
      station: playingStationRef.current,
      nowPlaying: engine.snapshot().nowPlaying,
      persistenceWarning: persistenceWarning ?? engine.snapshot().warning,
      queue: playbackQueueRef.current?.stations ?? [],
      output: {
        preferredBackend: settingsRef.current.preferredBackend,
        preferredAirPlayDevice: settingsRef.current.preferredAirPlayDevice
      }
    });
    const respond = (message: string, ok = true, data?: RadioSessionResult['data']): RadioSessionResult => ({ok, message, status: sessionStatus(), ...(data ? {data} : {})});
    if (command.type === 'desktop-transport') {
      const resolved = resolveDesktopTransport(command.action, sessionStatus());
      return resolved ? agentHandlerRef.current(resolved, signal) : respond('Playback state unchanged.');
    }
    if (['airplay-list', 'airplay-select', 'airplay-passcode'].includes(command.type) && !airPlaySupported) {
      return respond(airPlayUnavailableMessage, false, command.type === 'airplay-list' ? [] : undefined);
    }
    if (command.type === 'status') return respond(playingStationRef.current ? `${player.getState().state}: ${playingStationRef.current.name}` : 'RadioCLI is idle.');
    if (command.type === 'play') {
      if (command.ifPlaying === 'keep' && ['playing', 'paused', 'loading'].includes(player.getState().state)) {
        return respond(`Kept current station ${playingStationRef.current?.name ?? ''}.`);
      }
      const queue: PlaybackQueue = {title: 'Agent selection', sourceScreen: 'now-playing', sourceContextKey: null, stations: command.queue?.length ? command.queue : [command.station]};
      const tuned = await playStation(command.station, {queue, openNowPlaying: command.openNowPlaying, signal});
      const state = player.getState();
      const playingRequestedStation = tuned && playingStationRef.current
        && stationKey(playingStationRef.current) === stationKey(tuned)
        && state.state === 'playing'
        && state.ready;
      return playingRequestedStation
        ? respond(`Playing ${tuned.name}.`)
        : respond(state.state === 'error' ? state.message ?? `Could not play ${command.station.name}.` : `Could not play ${command.station.name}.`, false);
    }
    if (command.type === 'pause') { const control = await engine.pause(); return respond(control.message ?? 'Paused.', control.ok); }
    if (command.type === 'resume') {
      const station = playingStationRef.current;
      if (command.restartStopped && station && ['idle', 'stopped'].includes(player.getState().state)) {
        await playStation(station, {queue: playbackQueueRef.current ?? queueFromCurrentList(station), signal});
        return respond(`Playing ${station.name}.`, player.getState().ready && player.getState().state === 'playing');
      }
      const control = await engine.resume(); return respond(control.message ?? 'Resumed.', control.ok);
    }
    if (command.type === 'stop') {
      cancelPendingTune();
      await engine.stop({retainSelection: command.retainSelection});
      if (command.retainSelection) { setTuningStation(null); desktopMediaRef.current?.refresh(); return respond('Stopped playback.'); }
      playingStationRef.current = null;
      setPlayingStation(null);
      setTuningStation(null);
      playbackQueueRef.current = null;
      return respond('Stopped RadioCLI.');
    }
    if (command.type === 'alarm-preempt') {
      desktopSuspendedRef.current = true;
      desktopMediaRef.current?.refresh();
      cancelPendingTune();
      await engine.stop();
      playingStationRef.current = null;
      setPlayingStation(null);
      setTuningStation(null);
      playbackQueueRef.current = null;
      return respond('Interactive playback yielded to the alarm.');
    }
    if (command.type === 'set-volume') {
      const control = command.unmute
        ? await player.setVolume(clampVolume(command.volume), {allowStopped: true})
        : await player.setVolume(clampVolume(command.volume));
      if (control.ok) await updateSettings({volume: player.getState().volume});
      if (control.ok && command.unmute && command.volume > 0) {
        const unmuted = await player.setMuted(false, {allowStopped: true});
        if (!unmuted.ok) return respond(unmuted.message ?? 'The output could not be unmuted.', false);
      }
      return respond(control.message ?? `Volume ${player.getState().volume}.`, control.ok);
    }
    if (command.type === 'set-muted') { const control = await player.setMuted(command.muted); return respond(control.message ?? (command.muted ? 'Muted.' : 'Unmuted.'), control.ok); }
    if (command.type === 'set-favorite') {
      const station = command.station ?? playingStationRef.current;
      if (!station) return respond('No active station to favorite.', false);
      const current = store.isFavorite(station);
      if (current !== command.favorite) await toggleFavorite(station);
      return respond(`${command.favorite ? 'Favorited' : 'Removed favorite'}: ${station.name}.`);
    }
    if (command.type === 'airplay-list') {
      if (networkPolicy().offline) return respond('AirPlay discovery is disabled by RADIOCLI_OFFLINE=1.', false, []);
      let devices: AirPlayDevice[];
      try { devices = await refreshAirPlayTargets(false); } catch (error) {
        if (error instanceof PlaybackOutputError) return respond(error.message, false, []);
        throw error;
      }
      return respond(devices.length ? `${devices.length} AirPlay receiver(s) found.` : 'No AirPlay receivers found.', true, devices);
    }
    if (command.type === 'airplay-select') {
      if (networkPolicy().offline) return respond('AirPlay discovery is disabled by RADIOCLI_OFFLINE=1.', false);
      let devices: AirPlayDevice[];
      try { devices = await refreshAirPlayTargets(false); } catch (error) {
        if (error instanceof PlaybackOutputError) return respond(error.message, false, []);
        throw error;
      }
      signal?.throwIfAborted();
      const device = devices.find(item => item.id === command.deviceId);
      if (!device) return respond('AirPlay receiver not found. Refresh and use an exact receiver ID.', false, devices);
      if (device.local) {
        const backend = preferredLocalPlaybackBackend(availableBackends);
        if (!backend) return respond('No local playback backend is available. Run radiocli setup to install mpv.', false);
        await updateSettings({preferredAirPlayDevice: device.id, preferredBackend: backend});
        signal?.throwIfAborted();
        if (playingStationRef.current && shouldRetuneForAudioOutput(player.getState().state)) {
          await playStation(playingStationRef.current, {queue: playbackQueueRef.current ?? queueFromCurrentList(playingStationRef.current), signal});
        }
        return respond(`Audio output set to this device (${backend}).`);
      }
      if (!isAirPlayBackendAvailable(availableBackends)) return respond('AirPlay playback is unavailable; run radiocli doctor.', false);
      await updateSettings({preferredAirPlayDevice: device.id, preferredBackend: 'airplay'});
      signal?.throwIfAborted();
      if (playingStationRef.current && shouldRetuneForAudioOutput(player.getState().state)) {
        await playStation(playingStationRef.current, {queue: playbackQueueRef.current ?? queueFromCurrentList(playingStationRef.current), signal});
      }
      return respond(`Audio output set to AirPlay receiver ${device.name}.`);
    }
    if (command.type === 'airplay-local') {
      const backend = preferredLocalPlaybackBackend(availableBackends);
      if (!backend) return respond('No local playback backend is available. Run radiocli setup to install mpv.', false);
      await updateSettings({preferredBackend: backend});
      signal?.throwIfAborted();
      if (playingStationRef.current && shouldRetuneForAudioOutput(player.getState().state)) {
        await playStation(playingStationRef.current, {queue: playbackQueueRef.current ?? queueFromCurrentList(playingStationRef.current), signal});
      }
      return respond(`Audio output set to this device (${backend}).`);
    }
    if (command.type === 'airplay-passcode') {
      const control = await player.submitAirPlayPasscode(command.code);
      return respond(control.message ?? 'AirPlay code sent.', control.ok);
    }
    if (command.type === 'update-settings') {
      if (!allowedRadioSessionSettings(command.settings)) return respond('Session settings only accept appearance and agent control. Use radiocli setup --airplay to enable Linux AirPlay.', false);
      await updateSettings(command.settings);
      return respond('RadioCLI settings updated.');
    }
    if (command.type !== 'next' && command.type !== 'previous') throw new Error('Unsupported radio command.');
    signal?.throwIfAborted();
    const active = playingStationRef.current;
    const queue = playbackQueueRef.current;
    if (!active || !queue?.stations.length) return respond('No playback queue is available.', false);
    const currentIndex = queue.stations.findIndex(item => stationKey(item) === stationKey(active));
    const delta = command.type === 'next' ? 1 : -1;
    const next = queue.stations[(Math.max(0, currentIndex) + delta + queue.stations.length) % queue.stations.length];
    if (!next) return respond('No adjacent station is available.', false);
    if (command.preserveStop && ['idle', 'stopped'].includes(player.getState().state)) {
      engine.select(next, queue.stations);
      playingStationRef.current = next;
      setPlayingStation(next);
      setNowPlaying(null);
      desktopMediaRef.current?.refresh();
      return respond(`Selected ${next.name}.`);
    }
    const startPaused = command.preservePause && player.getState().state === 'paused';
    await playStation(next, {queue, startPaused, signal});
    const state = player.getState();
    const ok = playingStationRef.current && stationKey(playingStationRef.current) === stationKey(next) && state.ready && ['playing', 'paused'].includes(state.state);
    return respond(`${startPaused ? 'Selected' : 'Playing'} ${next.name}.`, Boolean(ok));
  };

  activeAlarmRef.current = alarmTui.activeAlarms.length > 0;
  useEffect(() => {
    if (playbackSession || !stdin.isTTY || !desktopPolicy.enabled || !controlSessionReady) return;
    const media = startDesktopMediaControls({
      player, identity: store.filePath, policy: desktopPolicy,
      status: () => ({owner: 'tui', playback: player.getState(), station: playingStationRef.current, queue: playbackQueueRef.current?.stations ?? []}),
      command: (command, permitted) => dispatchOwnerCommand(command, () => permitted?.() !== false && !desktopSuspendedRef.current && !activeAlarmRef.current),
      suspended: () => desktopSuspendedRef.current || activeAlarmRef.current
    });
    desktopMediaRef.current = media;
    return () => { media.close(); if (desktopMediaRef.current === media) desktopMediaRef.current = null; };
  }, [controlSessionReady, desktopPolicy, dispatchOwnerCommand, player, stdin, store, playbackSession]);
  useEffect(() => { desktopMediaRef.current?.refresh(); }, [alarmTui.activeAlarms.length]);

  useEffect(() => {
    if (!stdin.isTTY) return;
    if (playbackSession) {
      if (initialAgentCommand && (settingsRef.current.agentControl ?? defaultAgentControlSettings).enabled) {
        void playbackSession.call(initialAgentCommand).catch(reportActionError);
      }
      return;
    }
    let disposed = false;
    let close: (() => Promise<void>) | undefined;
    void startRadioSession(async (command, source) => {
      const permitted = async () => {
        if (source !== 'cli' && command.type !== 'status' && command.type !== 'alarm-preempt') await store.readFresh();
        if (disposed) throw new Error('RadioCLI control session is closed.');
        if (source !== 'cli' && !(settingsRef.current.agentControl ?? defaultAgentControlSettings).enabled && command.type !== 'status' && command.type !== 'alarm-preempt') {
          throw new Error('Agent controls are disabled.');
        }
        return true;
      };
      return dispatchOwnerCommand(command, permitted);
    }, undefined, {queue: 'owner'}).then(async session => {
      if (disposed) {
        await session.close();
        return;
      }
      close = session.close;
      setControlSessionReady(true);
      if (initialAgentCommand && (settingsRef.current.agentControl ?? defaultAgentControlSettings).enabled) await dispatchOwnerCommand(initialAgentCommand);
    }).catch(error => setMessage(error instanceof Error ? error.message : 'Agent controls could not start.'));
    return () => {
      disposed = true;
      setControlSessionReady(false);
      if (close) void close();
    };
  }, [dispatchOwnerCommand, initialAgentCommand, stdin, store, playbackSession, reportActionError]);

  useAppInput({
    adjustVolume,
    airPlayCode,
    canEnterAirPlayCode,
    airPlaySupported,
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
      void refreshAirPlayTargets().catch(reportActionError);
    },
    resetLearnedTransportKeys,
    repairMcpIntegrations,
    setAgentIntegrationEnabled,
    runSearch,
    saveLearnedTransportKey,
    screen,
    screenRef,
    settingsPageRef,
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
    airPlaySupported,
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
  const statusMessage = message ?? persistenceWarning ?? presenceWarning ?? (screen === 'search' ? stationContext.error ?? null : null);
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
  const fullLegendRows = useMemo(
    () => balancedFooterLegendRows(pageFooter, globalFooter, frameWidth, 2, versionReserve),
    [pageFooter, globalFooter, frameWidth, versionReserve]
  );
  const compactStatus = footerMessage ?? statusMessage ?? playbackFooter;
  const compactLegendRowCount = Math.max(1, layout.footerRows - (compactStatus ? 1 : 0));
  const compactLegendRows = useMemo(
    () => balancedFooterLegendRows(pageFooter, compactGlobalFooter, frameWidth, compactLegendRowCount, versionReserve),
    [pageFooter, compactGlobalFooter, frameWidth, compactLegendRowCount, versionReserve]
  );
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
          platform={platform}
          airPlayDevices={availableAirPlayDevices}
          airPlaySupported={airPlaySupported}
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

  for (const station of library.imported) {
    addStation(station);
  }

  for (const item of library.recent) {
    addStation(item.station);
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

function discoverySourceWarning(sources: DiscoveryPage['sources']): string | undefined {
  const unavailable = [...new Set(sources.filter(source => source.status === 'unavailable').map(source =>
    source.provider === 'radio-browser' ? 'Radio Browser' : source.provider === 'radio-garden' ? 'Radio Garden' : source.provider
  ))];
  return unavailable.length ? `Some sources are unavailable (${unavailable.join(', ')}). Showing available results.` : undefined;
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
  return `${library.favorites.length} favorites · ${library.imported.length} imported · ${library.recent.length} recent · new imports before recents`;
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

function localSessionLibrary(library: LibraryState, platform: NodeJS.Platform, selectionRequired = true): LibraryState {
  return platform === 'linux' && selectionRequired && library.settings.preferredBackend === 'airplay'
    ? {...library, settings: {...library.settings, preferredBackend: 'auto'}} : library;
}

function legacyDiscoveryPage(items: Station[], limit: number): DiscoveryPage {
  return {items, exhausted: items.length < limit, sources: []};
}
