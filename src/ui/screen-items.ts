export const homeItems = [
  {screen: 'explore', label: 'Explore world', detail: 'Popular live stations across countries'},
  {screen: 'map', label: 'World map', detail: 'Station-density map by country'},
  {screen: 'countries', label: 'Countries', detail: 'Browse by country list'},
  {screen: 'search', label: 'Search stations', detail: 'Find stations by name, genre, language, place'},
  {screen: 'nearby', label: 'Nearby', detail: 'Opt-in approximate location for local stations'},
  {screen: 'now-playing', label: 'Now playing', detail: 'Receiver display and controls'},
  {screen: 'stats', label: 'Stats', detail: 'Listening graph, sessions, streaks, hours'},
  {screen: 'recent', label: 'Recent', detail: 'Stations played on this machine'},
  {screen: 'favorites', label: 'Favorites', detail: 'Saved and imported stations'},
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
