import type {Screen} from '../types.js';
import {mediaActionLabel, type MediaTransportAction} from './app-state.js';
import {playbackBackendCapabilities} from '../player/backend-install.js';

type PageFooterInput = {
  capturingTransportAction: MediaTransportAction | null;
  commandMode: boolean;
  commandText: string;
  editingCountryFilter: boolean;
  editingSearch: boolean;
  canEnterAirPlayCode?: boolean;
  playbackBackend?: string;
  screen: Screen;
};

export function fullFooterRowCount(screen: Screen): 3 | 4 {
  return screen === 'now-playing' ? 3 : 4;
}

export function fullStatusFooterRows(
  screen: Screen,
  message: string | null,
  footerMessage: string | null,
  playbackStatus: string | null
): Array<{key: 'notice' | 'playback'; text: string}> {
  if (screen === 'now-playing') {
    return [{key: 'playback', text: footerMessage ?? message ?? ' '}];
  }

  return [
    {key: 'notice', text: message ?? ' '},
    {key: 'playback', text: footerMessage ?? playbackStatus ?? ' '}
  ];
}

export function pageFooterText({
  capturingTransportAction,
  commandMode,
  commandText,
  editingCountryFilter,
  editingSearch,
  canEnterAirPlayCode,
  playbackBackend,
  screen
}: PageFooterInput): string {
  if (capturingTransportAction) {
    return `Learn ${mediaActionLabel(capturingTransportAction)} key: press key · Esc cancel`;
  }

  if (commandMode) {
    return `COMMAND :${commandText}`;
  }

  if (screen === 'home') {
    return '↑/↓ move · Enter open · number jump · l location · : command';
  }

  if (screen === 'search' && editingSearch) {
    return 'Type query · ↑/↓ move results · Ctrl+↑/↓ history · Enter search/tune · Esc finish';
  }

  if (screen === 'search') {
    return '/ edit query · ↑/↓ or n/p move · Enter tune · f favorite · b Overview';
  }

  if ((screen === 'countries' || screen === 'map') && editingCountryFilter) {
    return 'Type country filter · Enter/Esc apply';
  }

  if (screen === 'countries') {
    return '/ filter · ↑/↓ move · Enter open stations · w map · b Overview';
  }

  if (screen === 'map') {
    return '/ filter · ↑/↓ move · Enter open country · w list · b Overview';
  }

  if (screen === 'explore') {
    return 'Click map · WASD fine move · Shift+WASD jump · ↑/↓ station · Enter tune · f favorite · b Overview';
  }

  if (screen === 'nearby') {
    return '↑/↓ or n/p move · Enter tune · f favorite · l location · [/] page · b Overview';
  }

  if (screen === 'stations' || screen === 'library') {
    return '↑/↓ or n/p move · Enter tune · f favorite · [/] page · b Overview';
  }

  if (screen === 'now-playing') {
    const capabilities = playbackBackendCapabilities(playbackBackend);
    if (playbackBackend === 'ffplay' || playbackBackend === 'vlc') {
      return `${capabilities.label}: install mpv for pause/mute/media keys · f favorite · s sleep · d diagnostics · b Overview`;
    }

    if (playbackBackend === 'airplay') {
      return 'AirPlay: +/- volume · m mute · f favorite · s sleep · d diagnostics · b Overview';
    }

    return 'space/F8 pause · f favorite · m mute · s sleep · d diagnostics · b Overview';
  }

  if (screen === 'settings') {
    return 'Enter change selected · g Radio Garden · l location · x skip · o output · a AirPlay · r health · b Overview';
  }

  if (screen === 'airplay-settings') {
    return canEnterAirPlayCode
      ? '↑/↓ choose · Enter select receiver · c code · r refresh · b settings'
      : '↑/↓ choose · Enter select receiver · r refresh · b settings';
  }

  if (screen === 'airplay-code') {
    return 'Type receiver code · Backspace edit · Enter submit · Esc AirPlay';
  }

  if (screen === 'stats') {
    return 'b Overview';
  }

  if (screen === 'help') {
    return '↑/↓ scroll · [/] page · ? or b close · : command';
  }

  return ': command';
}

export function microPlaybackControlsText(playbackBackend?: string): string {
  if (playbackBackend === 'airplay') {
    return '+/- volume · m mute · ,/. station';
  }

  if (playbackBackend === 'ffplay' || playbackBackend === 'vlc') {
    return ',/. station · mpv enables controls';
  }

  return 'space pause · +/- volume · ,/. station';
}
