import type {Screen} from '../types.js';
import {mediaActionLabel, type MediaTransportAction} from './app-state.js';

type PageFooterInput = {
  capturingTransportAction: MediaTransportAction | null;
  commandMode: boolean;
  commandText: string;
  editingCountryFilter: boolean;
  editingSearch: boolean;
  playbackBackend?: string;
  screen: Screen;
};

export function pageFooterText({
  capturingTransportAction,
  commandMode,
  commandText,
  editingCountryFilter,
  editingSearch,
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
    return '↑/↓ move · Enter open · number jump · : command';
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
    return '/ filter · ↑/↓ move · Enter open stations · w map · b home';
  }

  if (screen === 'map') {
    return '/ filter · ↑/↓ move · Enter open country · w list · b home';
  }

  if (screen === 'explore') {
    return 'Click map · WASD fine move · Shift+WASD jump · ↑/↓ station · Enter tune · f favorite · b home';
  }

  if (
    screen === 'nearby' ||
    screen === 'stations' ||
    screen === 'library'
  ) {
    return '↑/↓ or n/p move · Enter tune · f favorite · [/] page · b home';
  }

  if (screen === 'now-playing') {
    if (playbackBackend === 'ffplay') {
      return 'ffplay fallback: install mpv for pause/mute/media keys · f favorite · s sleep · d diagnostics · b home';
    }

    if (playbackBackend === 'airplay') {
      return 'AirPlay: +/- volume · m mute · f favorite · s sleep · d diagnostics · b home';
    }

    return 'space/F8 pause · f favorite · m mute · s sleep · d diagnostics · b home';
  }

  if (screen === 'settings') {
    return 'Enter change selected · g Radio Garden · l location · x skip · o backend · a AirPlay · r health · b home';
  }

  if (screen === 'stats') {
    return 'b home';
  }

  return ': command';
}
