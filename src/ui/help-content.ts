type HelpEntry = {
  keys: string;
  description: string;
};

export type HelpSection = {
  title: string;
  entries: HelpEntry[];
};

export const keyHelpSections: HelpSection[] = [
  {
    title: 'Navigation',
    entries: [
      {keys: '↑/↓ or n/p', description: 'Move selection'},
      {keys: '←/→ or Tab', description: 'Switch tabs'},
      {keys: '[ / ]', description: 'Page selection by 10'},
      {keys: '1-9, 0', description: 'Jump to home menu item'},
      {keys: 'Enter', description: 'Open / tune the selection'},
      {keys: 'b or Esc', description: 'Back to home'},
      {keys: ': ', description: 'Command palette'},
      {keys: '?', description: 'Toggle this help'},
      {keys: 'q or Ctrl+C', description: 'Quit'}
    ]
  },
  {
    title: 'Playback',
    entries: [
      {keys: 'space or F8', description: 'Pause / resume'},
      {keys: ', / . or F7/F9', description: 'Previous / next station'},
      {keys: '+ / -', description: 'Volume up / down'},
      {keys: 'm', description: 'Mute / unmute'},
      {keys: 'f', description: 'Favorite the station'},
      {keys: 'O', description: 'Open station homepage'},
      {keys: 'y', description: 'Copy stream URL'},
      {keys: 's', description: 'Sleep timer (Now Playing)'},
      {keys: 'd', description: 'Diagnostics + recent tracks (Now Playing)'}
    ]
  },
  {
    title: 'Display & discovery',
    entries: [
      {keys: 't', description: 'Cycle display color'},
      {keys: 'v', description: 'Cycle receiver style'},
      {keys: 'o', description: 'Cycle audio output'},
      {keys: '/', description: 'Edit search / country filter'},
      {keys: 'w', description: 'Toggle country list / world map'},
      {keys: 'WASD', description: 'Move the Explore map cursor'},
      {keys: 'r', description: 'Refresh provider health'}
    ]
  }
];

export type CommandHelp = {
  name: string;
  args?: string;
  description: string;
};

export const commandHelp: CommandHelp[] = [
  {name: 'search', args: '<query>', description: 'Search stations (alias :s)'},
  {name: 'country', args: '<name|code>', description: 'Open a country (alias :c)'},
  {name: 'codec', args: '<codec|any>', description: 'Filter by codec'},
  {name: 'language', args: '<lang|any>', description: 'Filter by language (alias :lang)'},
  {name: 'bitrate', args: '<kbps>', description: 'Minimum bitrate filter'},
  {name: 'clear', description: 'Clear search filters'},
  {name: 'volume', args: '<0-100>', description: 'Set volume (alias :vol)'},
  {name: 'mute', description: 'Toggle mute'},
  {name: 'sleep', args: '<minutes>', description: 'Set or clear the sleep timer'},
  {name: 'timeout', args: '<seconds>', description: 'Tune timeout (3-45)'},
  {name: 'skip', args: '<on|off>', description: 'Skip broken streams'},
  {name: 'location', args: '<on|off>', description: 'Nearby location lookup'},
  {name: 'doctor', description: 'Show playback backend status'},
  {name: 'resume', args: '<on|off>', description: 'Resume last station on launch'},
  {name: 'ascii', args: '<on|off>', description: 'ASCII-safe display'},
  {name: 'motion', args: '<on|off>', description: 'Reduce motion'},
  {name: 'background', args: '<on|off>', description: 'Transparent background'},
  {name: 'airplay', description: 'Open AirPlay settings'},
  {name: 'learn', args: '<previous|play|next>', description: 'Learn a media key'},
  {name: 'keys', args: '[reset]', description: 'Show or reset learned media keys'},
  {name: 'favorite', description: 'Favorite the current station (alias :fav)'},
  {name: 'library', description: 'Open the library'},
  {name: 'map', description: 'Open the world map'},
  {name: 'stats', description: 'Open listening stats'},
  {name: 'settings', description: 'Open settings'},
  {name: 'stop', description: 'Stop playback'},
  {name: 'help', description: 'Open this help'}
];

// Primary command names plus the aliases the executor accepts, used for
// command-mode tab completion.
export const commandNames: string[] = [
  's',
  'c',
  'lang',
  'vol',
  'fav',
  'recent',
  'favorites',
  'imports',
  'bind',
  'key',
  'airplay-code',
  'airplay-settings',
  ...commandHelp.map(entry => entry.name)
].sort((a, b) => a.localeCompare(b));

// Complete a partial command name to the longest shared prefix of its matches.
// Returns the original value when there is no match.
export function completeCommand(partial: string, names: string[] = commandNames): string {
  const lower = partial.toLowerCase();
  const matches = names.filter(name => name.startsWith(lower));
  if (matches.length === 0) {
    return partial;
  }

  if (matches.length === 1) {
    return matches[0]!;
  }

  return longestCommonPrefix(matches) || partial;
}

function longestCommonPrefix(values: string[]): string {
  if (values.length === 0) {
    return '';
  }

  let prefix = values[0]!;
  for (const value of values.slice(1)) {
    while (!value.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (!prefix) {
        return '';
      }
    }
  }

  return prefix;
}
