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
    id: 'playback',
    label: 'Playback & audio',
    description: 'Output, volume, AirPlay, and startup behavior',
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
    id: 'appearance',
    label: 'Appearance',
    description: 'Colors, receiver style, motion, and terminal display',
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
    id: 'discovery',
    label: 'Discovery & providers',
    description: 'Location, station directories, privacy, and provider health',
    items: [
      'Toggle nearby location lookup',
      'Toggle Radio Garden experimental adapter',
      'Share favorite votes with Radio Browser',
      'Refresh provider health'
    ]
  },
  {
    id: 'data',
    label: 'Data & library',
    description: 'Back up or restore preferences and saved stations',
    items: [
      'Export preferences and library',
      'Import preferences and library'
    ]
  },
  {
    id: 'agent',
    label: 'Agent control & MCP',
    description: 'Local agent access and MCP playback behavior',
    items: [
      'Allow local agent control',
      'Install or repair MCP integrations',
      'Open TUI for agent playback',
      'Show Now Playing for agent playback'
    ]
  },
  {
    id: 'media-keys',
    label: 'Media keys',
    description: 'Teach RadioCLI your keyboard playback controls',
    items: [
      'Learn previous media key',
      'Learn play/pause media key',
      'Learn next media key',
      'Reset learned media keys'
    ]
  },
  {
    id: 'updates',
    label: 'Updates',
    description: 'Automatic launch checks, version status, and installation',
    items: [
      'Automatically check for updates',
      'Check for updates'
    ]
  }
] as const;

export type SettingsPage = 'root' | (typeof settingsGroups)[number]['id'];
export type SettingsItem = (typeof settingsGroups)[number]['items'][number];

export const settingsItems = settingsGroups.flatMap(group => group.items) as readonly SettingsItem[];

export const settingsRootItems = settingsGroups.map(group => group.label);

export function settingsGroup(page: SettingsPage) {
  return settingsGroups.find(group => group.id === page);
}

export function settingsItemsForPage(page: SettingsPage): readonly string[] {
  return page === 'root' ? settingsRootItems : settingsGroup(page)?.items ?? [];
}

export function settingsPageForRootItem(item: string | undefined): SettingsPage | undefined {
  return settingsGroups.find(group => group.label === item)?.id;
}
