import type {Screen} from '../types.js';

export type PrimaryScreen =
  | 'home'
  | 'now-playing'
  | 'library'
  | 'explore'
  | 'search'
  | 'countries'
  | 'nearby'
  | 'stats'
  | 'settings';

export type ScreenMetadata = {
  tabLabel: string;
  title: string;
  description: string;
};

export const primaryScreens: readonly PrimaryScreen[] = [
  'home',
  'now-playing',
  'library',
  'explore',
  'search',
  'countries',
  'nearby',
  'stats',
  'settings'
];

export const screenMetadata: Record<PrimaryScreen, ScreenMetadata> = {
  home: {tabLabel: 'Overview', title: 'Overview', description: 'Your listening at a glance'},
  'now-playing': {tabLabel: 'Playing', title: 'Now playing', description: 'Receiver and playback controls'},
  library: {tabLabel: 'Library', title: 'Library', description: 'Favorites, recents, and imported streams'},
  explore: {tabLabel: 'Explore', title: 'Explore', description: 'Discover stations on the world map'},
  search: {tabLabel: 'Search', title: 'Search', description: 'Find stations, genres, languages, or places'},
  countries: {tabLabel: 'Countries', title: 'Countries', description: 'Browse stations by country'},
  nearby: {tabLabel: 'Nearby', title: 'Nearby', description: 'Find stations near your approximate location'},
  stats: {tabLabel: 'Stats', title: 'Listening stats', description: 'History, streaks, stations, and time'},
  settings: {tabLabel: 'Settings', title: 'Settings', description: 'Playback, display, privacy, and data'}
};

const secondaryTitles: Partial<Record<Screen, string>> = {
  stations: 'Stations',
  map: 'World map',
  'airplay-settings': 'AirPlay',
  'airplay-code': 'AirPlay code',
  help: 'Help'
};

export function screenTitle(screen: Screen): string {
  if (screen in screenMetadata) {
    return screenMetadata[screen as PrimaryScreen].title;
  }
  return secondaryTitles[screen] ?? 'RadioCLI';
}
