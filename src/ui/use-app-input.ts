import {useEffect} from 'react';
import {useInput} from 'ink';
import type {Dispatch, SetStateAction} from 'react';
import type {Country, Screen, Station, AppSettings} from '../types.js';
import type {PlayerController} from '../player/player-controller.js';
import {homeItems, settingsItemsForPage, settingsPageForRootItem, type SettingsPage} from './screen-items.js';
import {
  applyTextInput,
  favoriteTarget,
  isEditableInput,
  isPlainPrintableInput,
  mediaTransportActionForInput,
  searchEditingArrowAction,
  shouldHandleKeyboardEvent,
  shouldToggleNearbyLocationShortcut,
  type ExploreMoveDirection,
  type MediaTransportAction
} from './app-state.js';
import {parseTerminalMouseEvents, primaryMousePress, wheelScrollDelta} from './terminal-mouse.js';
import {completeCommand} from './help-content.js';
import {commitImmediateSelection} from './selection-state.js';

type CurrentRef<T> = {
  current: T;
};

type InputSource = {
  on(event: 'data', listener: (data: Buffer | string) => void): unknown;
  off(event: 'data', listener: (data: Buffer | string) => void): unknown;
};

type AppInputOptions = {
  adjustVolume: (delta: number) => void;
  airPlayCode: string;
  canEnterAirPlayCode: boolean;
  cancelPendingAutoSkip: () => void;
  beginLearningTransportKey: (action: MediaTransportAction) => void;
  capturingTransportAction: MediaTransportAction | null;
  commandMode: boolean;
  commandText: string;
  confirmCtrlCExit: () => void;
  copyStationUrl: (station: Station | null) => Promise<void>;
  openStationHomepage: (station: Station | null) => void;
  currentItemCount: (screen: Screen) => number;
  cycleDisplayColor: () => void;
  cycleAudioOutput: () => void;
  cycleReceiverStyle: () => void;
  cycleSleepTimer: () => void;
  editingCountryFilter: boolean;
  editingSearch: boolean;
  executeCommand: (rawCommand: string) => Promise<void>;
  filteredCountries: Country[];
  go: (screen: Screen) => void;
  lastRawTransportAtRef: CurrentRef<number>;
  lastSubmittedSearchRef: CurrentRef<string>;
  loadCountry: (country: Country) => Promise<void>;
  openAdjacentTab: (direction: 1 | -1) => void;
  openAirPlayCode: () => void;
  openAirPlaySettings: () => void;
  openSettingsPage: (page: SettingsPage) => void;
  closeSettingsPage: () => void;
  openScreen: (screen: Screen) => void;
  handleAlarmInput: (input: string, key: Record<string, unknown>) => boolean;
  openAlarmForStation: (station?: Station | null) => void;
  openActiveAlarms: () => void;
  playAdjacent: (direction: 1 | -1) => void;
  playStation: (station: Station) => Promise<void>;
  player: PlayerController;
  recallSearchHistory: (direction: 'older' | 'newer') => void;
  playingStation: Station | null;
  moveExploreCursor: (direction: ExploreMoveDirection, fast?: boolean) => void;
  moveExploreCursorToCell: (x: number, y: number) => void;
  refreshAirPlayTargets: () => void;
  refreshProviderHealth: () => void;
  resetLearnedTransportKeys: () => void;
  repairMcpIntegrations: () => Promise<void>;
  setAgentIntegrationEnabled: () => Promise<void>;
  runSearch: () => Promise<void>;
  saveLearnedTransportKey: (action: MediaTransportAction, input: string) => void;
  screen: Screen;
  settingsPage: SettingsPage;
  searchQuery: string;
  selectedRef: CurrentRef<number>;
  selectedStationForInput: () => Station | null;
  selectAirPlayDeviceAt: (index: number) => void;
  setCapturingTransportAction: Dispatch<SetStateAction<MediaTransportAction | null>>;
  setAirPlayCode: Dispatch<SetStateAction<string>>;
  setCommandMode: Dispatch<SetStateAction<boolean>>;
  setCommandText: Dispatch<SetStateAction<string>>;
  setCountryFilter: Dispatch<SetStateAction<string>>;
  setEditingCountryFilter: Dispatch<SetStateAction<boolean>>;
  setEditingSearch: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  setSelected: Dispatch<SetStateAction<number>>;
  setShowDiagnostics: Dispatch<SetStateAction<boolean>>;
  submitAirPlayCode: (code: string) => void;
  settingsRef: CurrentRef<AppSettings>;
  shutdown: () => void;
  stdin: InputSource;
  toggleFavorite: (station: Station | null) => void;
  toggleMute: () => void;
  togglePause: () => void;
  toggleSetting: (key: 'resumeOnLaunch' | 'transparentBackground' | 'asciiMode' | 'reduceMotion' | 'mouseSupport' | 'automaticUpdateChecks') => void;
  toggleAgentSetting: (key: 'openUiOnPlay' | 'focusNowPlaying') => void;
  toggleNearbyLocation: () => void;
  toggleDirectoryVoting: () => void;
  toggleRadioGarden: () => void;
  toggleSkipBrokenStreams: () => void;
  updateFromSettings: () => Promise<void>;
};

export function useAppInput({
  adjustVolume,
  airPlayCode,
  canEnterAirPlayCode,
  cancelPendingAutoSkip,
  beginLearningTransportKey,
  capturingTransportAction,
  commandMode,
  commandText,
  confirmCtrlCExit,
  copyStationUrl,
  openStationHomepage,
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
  handleAlarmInput,
  openAlarmForStation,
  openActiveAlarms,
  playAdjacent,
  playStation,
  player,
  playingStation,
  recallSearchHistory,
  moveExploreCursor,
  moveExploreCursorToCell,
  refreshAirPlayTargets,
  refreshProviderHealth,
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
  setAirPlayCode,
  setCommandMode,
  setCommandText,
  setCountryFilter,
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
}: AppInputOptions): void {
  const commitSelection = (next: number): void => {
    commitImmediateSelection(selectedRef, setSelected, next, currentItemCount(screen));
  };
  const moveSelection = (delta: number): void => {
    if (hasStationSelection(screen)) cancelPendingAutoSkip();
    commitSelection(selectedRef.current + delta);
  };

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

      const mouseEvents = parseTerminalMouseEvents(data);
      if (mouseEvents.length > 0) {
        const wheelDelta = wheelScrollDelta(mouseEvents);
        const click = primaryMousePress(mouseEvents);
        lastRawTransportAtRef.current = Date.now();
        if (wheelDelta !== 0 && shouldScrollSelectionWithWheel(screen, commandMode, editingCountryFilter)) {
          if (handleAlarmInput('', {scrollDelta: wheelDelta * 3})) return;
          moveSelection(wheelDelta * 3);
          return;
        }

        if (!commandMode && screen === 'explore' && click) {
          moveExploreCursorToCell(click.x, click.y);
        }
        return;
      }

      const action = mediaTransportActionForInput(rawInput, settingsRef.current.mediaKeys);
      if (
        isPlainPrintableInput(rawInput) &&
        (commandMode || (screen === 'search' && editingSearch) || ((screen === 'countries' || screen === 'map') && editingCountryFilter))
      ) {
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
        togglePause();
      }
    };

    stdin.on('data', onData);
    return () => {
      stdin.off('data', onData);
    };
  }, [
    cancelPendingAutoSkip,
    capturingTransportAction,
    commandMode,
    currentItemCount,
    editingCountryFilter,
    editingSearch,
    handleAlarmInput,
    lastRawTransportAtRef,
    playAdjacent,
    player,
    moveExploreCursorToCell,
    saveLearnedTransportKey,
    screen,
    selectedRef,
    setCapturingTransportAction,
    setMessage,
    setSelected,
    settingsRef,
    stdin,
    togglePause
  ]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      confirmCtrlCExit();
      return;
    }

    if (!shouldHandleKeyboardEvent(key.eventType)) {
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

      if (key.tab) {
        // Complete the command name only while still typing it (no args yet).
        setCommandText(value => (/\s/.test(value) ? value : completeCommand(value)));
        return;
      }

      if (isEditableInput(input, key)) {
        setCommandText(value => applyTextInput(value, input, key));
      }

      return;
    }

    if (handleAlarmInput(input, key)) {
      return;
    }

    // An active text field owns its keystrokes before app-wide shortcuts. In
    // particular, a normal "a" in a station query must not invoke the global
    // schedule-this-station shortcut and leave Search for the alarm editor.
    if (screen === 'search' && editingSearch) {
      if (key.return) {
        const inputStation = selectedStationForInput();
        if (searchQuery.trim() && searchQuery.trim() === lastSubmittedSearchRef.current && inputStation) {
          void playStation(inputStation);
        } else {
          void runSearch();
        }
        return;
      }

      if (key.escape) {
        setEditingSearch(false);
        return;
      }

      const arrowAction = searchEditingArrowAction(key, currentItemCount('search') > 0);
      if (arrowAction) {
        if (arrowAction === 'history-older') {
          recallSearchHistory('older');
        } else if (arrowAction === 'history-newer') {
          recallSearchHistory('newer');
        } else if (arrowAction === 'select-previous') {
          moveSelection(-1);
        } else {
          moveSelection(1);
        }
        return;
      }

      if (isEditableInput(input, key)) {
        setSearchQuery(value => applyTextInput(value, input, key));
        setEditingSearch(true);
        return;
      }
    }

    if (input === '!' || (input === 'A' && screen !== 'explore')) {
      openActiveAlarms();
      return;
    }

    if (input === 'a' && ['stations', 'search', 'nearby', 'library', 'now-playing'].includes(screen)) {
      openAlarmForStation(favoriteTarget(screen, selectedStationForInput(), playingStation));
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

    if ((screen === 'countries' || screen === 'map') && editingCountryFilter) {
      if (key.return || key.escape) {
        setEditingCountryFilter(false);
        commitSelection(0);
        return;
      }

      if (isEditableInput(input, key)) {
        setCountryFilter(value => applyTextInput(value, input, key));
      }

      return;
    }

    if (screen === 'airplay-code') {
      if (key.return) {
        submitAirPlayCode(airPlayCode);
        return;
      }

      if (key.escape) {
        setAirPlayCode('');
        go('airplay-settings');
        return;
      }

      if (isEditableInput(input, key)) {
        setAirPlayCode(value => applyTextInput(value, input, key).slice(0, 64));
      }

      return;
    }

    if (screen === 'explore') {
      const exploreMove = exploreMoveForInput(input);
      if (exploreMove) {
        moveExploreCursor(exploreMove.direction, exploreMove.fast);
        return;
      }
    }

    if (input === 'q') {
      shutdown();
      return;
    }

    if (input === '?') {
      go(screen === 'help' ? 'home' : 'help');
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
      cycleReceiverStyle();
      return;
    }

    if (input === 'o') {
      cycleAudioOutput();
      return;
    }

    if (input === 'a' && screen === 'settings') {
      openAirPlaySettings();
      return;
    }

    if (input === 'c' && screen === 'airplay-settings' && canEnterAirPlayCode) {
      openAirPlayCode();
      return;
    }

    if (input === 'g') {
      toggleRadioGarden();
      return;
    }

    if (shouldToggleNearbyLocationShortcut(input, screen)) {
      toggleNearbyLocation();
      return;
    }

    if (input === 'x') {
      toggleSkipBrokenStreams();
      return;
    }

    if (input === 'r' && screen === 'airplay-settings') {
      refreshAirPlayTargets();
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
      moveSelection(10);
      return;
    }

    if (input === '[') {
      moveSelection(-10);
      return;
    }

    if (screen === 'home' && /^[1-9]$/.test(input)) {
      const menuIndex = Number(input) - 1;
      commitSelection(menuIndex);
      const target = homeItems[menuIndex]?.screen;
      if (target) {
        openScreen(target);
      }
      return;
    }

    if ((input === 'b' || key.escape) && screen === 'airplay-settings') {
      go('settings');
      return;
    }

    if ((input === 'b' || key.escape) && screen === 'settings') {
      closeSettingsPage();
      return;
    }

    if (input === 'b' || key.escape) {
      if (screen === 'stations') {
        go('countries');
        return;
      }

      go('home');
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

    if (input === 'w' && screen === 'countries') {
      go('map');
      return;
    }

    if (input === 'w' && screen === 'map') {
      go('countries');
      return;
    }

    if (input === 'f') {
      toggleFavorite(favoriteTarget(screen, selectedStationForInput(), playingStation));
      return;
    }

    if (input === 'O') {
      openStationHomepage(favoriteTarget(screen, selectedStationForInput(), playingStation));
      return;
    }

    if (input === 'y') {
      void copyStationUrl(favoriteTarget(screen, selectedStationForInput(), playingStation));
      return;
    }

    if (input === ' ') {
      togglePause();
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
      moveSelection(1);
      return;
    }

    if (input === 'p') {
      moveSelection(-1);
      return;
    }

    if (key.downArrow) {
      moveSelection(1);
      return;
    }

    if (key.upArrow) {
      moveSelection(-1);
      return;
    }

    if (key.return) {
      if (screen === 'home') {
        const target = homeItems[selectedRef.current]?.screen;
        if (target) {
          openScreen(target);
        }
        return;
      }

      if (screen === 'countries') {
        const country = filteredCountries[selectedRef.current];
        if (country) {
          void loadCountry(country);
        }
        return;
      }

      if (screen === 'settings') {
        const item = settingsItemsForPage(settingsPage)[selectedRef.current];
        if (settingsPage === 'root') {
          const targetPage = settingsPageForRootItem(item);
          if (targetPage) {
            openSettingsPage(targetPage);
          }
          return;
        }
        if (item === 'Cycle display color') {
          cycleDisplayColor();
        } else if (item === 'Toggle Radio Garden experimental adapter') {
          toggleRadioGarden();
        } else if (item === 'Cycle receiver style') {
          cycleReceiverStyle();
        } else if (item === 'Toggle nearby location lookup') {
          toggleNearbyLocation();
        } else if (item === 'Share favorite votes with Radio Browser') {
          toggleDirectoryVoting();
        } else if (item === 'Audio output') {
          cycleAudioOutput();
        } else if (item === 'AirPlay receiver') {
          openAirPlaySettings();
        } else if (item === 'Volume up') {
          adjustVolume(5);
        } else if (item === 'Volume down') {
          adjustVolume(-5);
        } else if (item === 'Mute or unmute') {
          toggleMute();
        } else if (item === 'Toggle skip broken streams') {
          toggleSkipBrokenStreams();
        } else if (item === 'Resume last station on launch') {
          toggleSetting('resumeOnLaunch');
        } else if (item === 'Transparent background') {
          toggleSetting('transparentBackground');
        } else if (item === 'ASCII-safe display') {
          toggleSetting('asciiMode');
        } else if (item === 'Reduce motion') {
          toggleSetting('reduceMotion');
        } else if (item === 'Mouse and trackpad scrolling') {
          toggleSetting('mouseSupport');
        } else if (item === 'Automatically check for updates') {
          toggleSetting('automaticUpdateChecks');
        } else if (item === 'Allow local agent control') {
          void setAgentIntegrationEnabled();
        } else if (item === 'Install or repair MCP integrations') {
          void repairMcpIntegrations();
        } else if (item === 'Open TUI for agent playback') {
          toggleAgentSetting('openUiOnPlay');
        } else if (item === 'Show Now Playing for agent playback') {
          toggleAgentSetting('focusNowPlaying');
        } else if (item === 'Export preferences and library') {
          setCommandText('export ');
          setCommandMode(true);
        } else if (item === 'Import preferences and library') {
          setCommandText('import ');
          setCommandMode(true);
        } else if (item === 'Check for updates') {
          void updateFromSettings();
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

      if (screen === 'airplay-settings') {
        selectAirPlayDeviceAt(selectedRef.current);
        return;
      }

      if (screen === 'map') {
        const country = filteredCountries[selectedRef.current];
        if (country) {
          void loadCountry(country);
        }
        return;
      }

      const inputStation = selectedStationForInput();
      if (inputStation) {
        void playStation(inputStation);
      }
    }
  });
}

function shouldScrollSelectionWithWheel(screen: Screen, commandMode: boolean, editingCountryFilter: boolean): boolean {
  if (commandMode || editingCountryFilter) {
    return false;
  }

  return [
    'home', 'countries', 'map', 'stations', 'search', 'nearby', 'explore',
    'library', 'settings', 'help', 'airplay-settings', 'alarms', 'alarm-editor', 'alarm-picker', 'alarm-ringing'
  ].includes(screen);
}

function hasStationSelection(screen: Screen): boolean {
  return ['stations', 'search', 'nearby', 'explore', 'library'].includes(screen);
}

function exploreMoveForInput(input: string): {direction: ExploreMoveDirection; fast: boolean} | null {
  const normalized = input.toLowerCase();
  if (normalized === 'w') {
    return {direction: 'up', fast: input === 'W'};
  }

  if (normalized === 's') {
    return {direction: 'down', fast: input === 'S'};
  }

  if (normalized === 'a') {
    return {direction: 'left', fast: input === 'A'};
  }

  if (normalized === 'd') {
    return {direction: 'right', fast: input === 'D'};
  }

  return null;
}
