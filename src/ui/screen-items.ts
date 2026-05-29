export const homeItems = [
  {screen: 'now-playing', label: 'Playing', detail: 'Receiver display and controls'},
  {screen: 'library', label: 'Library', detail: 'Favorites, recent stations, imported streams'},
  {screen: 'explore', label: 'Explore', detail: 'Move a map cursor through geotagged stations'},
  {screen: 'search', label: 'Search', detail: 'Find stations by name, genre, language, place'},
  {screen: 'countries', label: 'Countries', detail: 'Browse by country list with a world-map toggle'},
  {screen: 'nearby', label: 'Nearby', detail: 'Opt-in approximate location for local stations'},
  {screen: 'stats', label: 'Stats', detail: 'Listening graph, stations, streaks, hours'},
  {screen: 'settings', label: 'Settings', detail: 'Playback backend, colors, providers'}
] as const;

export const settingsItems = [
  'Cycle display color',
  'Cycle spectrum style',
  'Toggle Radio Garden experimental adapter',
  'Toggle nearby location lookup',
  'Cycle playback backend',
  'Volume up',
  'Volume down',
  'Mute or unmute',
  'Toggle skip broken streams',
  'Refresh provider health',
  'Learn previous media key',
  'Learn play/pause media key',
  'Learn next media key',
  'Reset learned media keys'
] as const;
