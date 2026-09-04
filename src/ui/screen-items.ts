export const homeItems = [
  {screen: 'now-playing', label: 'Playing', detail: 'Receiver display and controls'},
  {screen: 'library', label: 'Library', detail: 'Favorites, recent stations, imported streams'},
  {screen: 'explore', label: 'Explore', detail: 'Move a map cursor through geotagged stations'},
  {screen: 'search', label: 'Search', detail: 'Find stations by name, genre, language, place'},
  {screen: 'countries', label: 'Countries', detail: 'Browse by country list with a world-map toggle'},
  {screen: 'nearby', label: 'Nearby', detail: 'Approximate IP location for local stations'},
  {screen: 'stats', label: 'Stats', detail: 'Listening graph, stations, streaks, hours'},
  {screen: 'alarms', label: 'Alarms (beta)', detail: 'Wake to radio and schedule station playback'},
  {screen: 'settings', label: 'Settings', detail: 'Audio output, colors, providers'}
] as const;

export const settingsGroups = [
  {
    label: 'Playback',
    items: [
      'Audio output',
      'AirPlay receiver',
      'Volume up',
      'Volume down',
      'Mute or unmute',
      'Toggle skip broken streams',
      'Resume last station on launch'
    ]
  },
  {
    label: 'Display',
    items: [
      'Cycle display color',
      'Cycle receiver style',
      'Transparent background',
      'ASCII-safe display',
      'Reduce motion',
      'Mouse and trackpad scrolling'
    ]
  },
  {
    label: 'Discovery & privacy',
    items: [
      'Toggle nearby location lookup',
      'Toggle Radio Garden experimental adapter',
      'Share favorite votes with Radio Browser'
    ]
  },
  {
    label: 'Data',
    items: [
      'Export preferences and library',
      'Import preferences and library'
    ]
  },
  {
    label: 'Media keys',
    items: [
      'Learn previous media key',
      'Learn play/pause media key',
      'Learn next media key',
      'Reset learned media keys'
    ]
  },
  {
    label: 'Maintenance',
    items: [
      'Refresh provider health',
      'Check for updates'
    ]
  }
] as const;

export type SettingsItem = (typeof settingsGroups)[number]['items'][number];

export const settingsItems = settingsGroups.flatMap(group => group.items) as readonly SettingsItem[];

export function settingsSectionFor(item: string | undefined): string {
  return settingsGroups.find(group => group.items.some(candidate => candidate === item))?.label ?? 'Preferences';
}
