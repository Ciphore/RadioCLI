import {useEffect} from 'react';
import {useInput} from 'ink';
import type {Dispatch, SetStateAction} from 'react';
import type {Country, Screen, Station, AppSettings} from '../types.js';
import type {PlayerController} from '../player/player-controller.js';
import {homeItems, settingsItems} from './screen-items.js';
import {
  applyTextInput,
  clamp,
  favoriteTarget,
  isEditableInput,
  isPlainPrintableInput,
  mediaTransportActionForInput,
  type ExploreMoveDirection,
  type MediaTransportAction
} from './app-state.js';
import {parseSgrMouseEvents, primaryMousePress} from './terminal-mouse.js';

type CurrentRef<T> = {
  current: T;
};

type InputSource = {
  on(event: 'data', listener: (data: Buffer | string) => void): unknown;
  off(event: 'data', listener: (data: Buffer | string) => void): unknown;
};

type AppInputOptions = {
  adjustVolume: (delta: number) => void;
  beginLearningTransportKey: (action: MediaTransportAction) => void;
  capturingTransportAction: MediaTransportAction | null;
  commandMode: boolean;
  commandText: string;
  currentItemCount: (screen: Screen) => number;
  cycleDisplayColor: () => void;
  cyclePlaybackBackend: () => void;
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
  openScreen: (screen: Screen) => void;
  playAdjacent: (direction: 1 | -1) => void;
  playStation: (station: Station) => Promise<void>;
  player: PlayerController;
  playingStation: Station | null;
  moveExploreCursor: (direction: ExploreMoveDirection, fast?: boolean) => void;
  moveExploreCursorToCell: (x: number, y: number) => void;
  refreshProviderHealth: () => void;
  resetLearnedTransportKeys: () => void;
  runSearch: () => Promise<void>;
  saveLearnedTransportKey: (action: MediaTransportAction, input: string) => void;
  screen: Screen;
  searchQuery: string;
  selected: number;
  selectedStation: Station | null;
  setCapturingTransportAction: Dispatch<SetStateAction<MediaTransportAction | null>>;
  setCommandMode: Dispatch<SetStateAction<boolean>>;
  setCommandText: Dispatch<SetStateAction<string>>;
  setCountryFilter: Dispatch<SetStateAction<string>>;
  setEditingCountryFilter: Dispatch<SetStateAction<boolean>>;
  setEditingSearch: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  setSelected: Dispatch<SetStateAction<number>>;
  setShowDiagnostics: Dispatch<SetStateAction<boolean>>;
  settingsRef: CurrentRef<AppSettings>;
  shutdown: () => void;
  stdin: InputSource;
  toggleFavorite: (station: Station | null) => void;
  toggleMute: () => void;
  toggleNearbyLocation: () => void;
  toggleRadioGarden: () => void;
  toggleSkipBrokenStreams: () => void;
};

export function useAppInput({
  adjustVolume,
  beginLearningTransportKey,
  capturingTransportAction,
  commandMode,
  commandText,
  currentItemCount,
  cycleDisplayColor,
  cyclePlaybackBackend,
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
  openScreen,
  playAdjacent,
  playStation,
  player,
  playingStation,
  moveExploreCursor,
  moveExploreCursorToCell,
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
}: AppInputOptions): void {
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

      const mouseEvents = parseSgrMouseEvents(rawInput);
      if (mouseEvents.length > 0) {
        const click = primaryMousePress(mouseEvents);
        lastRawTransportAtRef.current = Date.now();
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
        void player.togglePause();
      }
    };

    stdin.on('data', onData);
    return () => {
      stdin.off('data', onData);
    };
  }, [
    capturingTransportAction,
    commandMode,
    editingCountryFilter,
    editingSearch,
    lastRawTransportAtRef,
    playAdjacent,
    player,
    moveExploreCursorToCell,
    saveLearnedTransportKey,
    screen,
    setCapturingTransportAction,
    setMessage,
    settingsRef,
    stdin
  ]);

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
        } else if (item === 'Cycle receiver style') {
          cycleReceiverStyle();
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
