import {useCallback, type Dispatch, type SetStateAction} from 'react';
import type {AppSettings, Country, LibraryState, Screen, Station} from '../types.js';
import type {ProviderManager} from '../providers/provider-manager.js';
import type {PlayerController} from '../player/player-controller.js';
import type {JsonLibraryStore} from '../storage/store.js';
import type {MediaTransportAction, SearchFilters, NavigationOptions} from './app-state.js';
import {favoriteTarget, normalizeMediaKeyBindings, parseMediaActionName} from './app-state.js';

type SettingsRef = {
  current: AppSettings;
};

type UseCommandExecutorOptions = {
  beginLearningTransportKey: (action: MediaTransportAction) => void;
  countries: Country[];
  go: (next: Screen, options?: NavigationOptions) => void;
  loadCountry: (country: Country) => Promise<void>;
  openLibrary: () => void;
  player: PlayerController;
  playingStation: Station | null;
  providers: ProviderManager;
  resetLearnedTransportKeys: () => void;
  runSearch: (query?: string) => Promise<void>;
  screen: Screen;
  selectedStation: Station | null;
  setCountries: Dispatch<SetStateAction<Country[]>>;
  setFilters: Dispatch<SetStateAction<SearchFilters>>;
  setLibrary: Dispatch<SetStateAction<LibraryState>>;
  setMessage: Dispatch<SetStateAction<string | null>>;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  setSleepUntil: Dispatch<SetStateAction<number | null>>;
  setVolume: (volume: number) => void;
  settingsRef: SettingsRef;
  store: JsonLibraryStore;
  toggleFavorite: (station: Station | null) => void;
  toggleMute: () => void;
  updateSettings: (settings: Partial<AppSettings>) => LibraryState;
};

export function useCommandExecutor({
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
}: UseCommandExecutorOptions): (rawCommand: string) => Promise<void> {
  return useCallback(
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

      if (name === 'airplay-code' || name === 'airplay-passcode') {
        if (!value.trim()) {
          setMessage('Usage: :airplay-code <code>');
          return;
        }

        player.submitAirPlayPasscode(value.trim());
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

      if (name === 'library' || name === 'recent' || name === 'favorites' || name === 'imports') {
        openLibrary();
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
    ]
  );
}
