export const listenerCommands = ['play', 'pause', 'resume', 'stop', 'next', 'previous', 'volume', 'mute', 'unmute', 'now', 'status', 'search', 'countries', 'favorites', 'recent', 'favorite', 'unfavorite', 'preset', 'presets', 'stats', 'completion'] as const;

export type ListenerCommand = typeof listenerCommands[number];
export type CliFlags = {json: boolean; plain: boolean; quiet: boolean; noInput: boolean; noColor: boolean};
export type ParsedCommand = {command: ListenerCommand; words: string[]; flags: CliFlags; options: Map<string, string | true>};

const commonFlags = ['--json', '--plain', '--quiet', '-q', '--no-input', '--no-color'];
const filterFlags = ['--country', '--language', '--codec', '--min-bitrate', '--limit'];
const commandOptions: Partial<Record<ListenerCommand, string[]>> = {
  play: ['--favorites', '--recent', '--popular', '--pick', '--source', '--random', '--keep-playing', ...filterFlags],
  search: ['--pick', ...filterFlags],
  favorites: ['--pick', '--limit'], recent: ['--pick', '--limit'],
  countries: ['--limit'], now: ['--watch'], status: ['--watch']
};
const booleans = new Set([...commonFlags, '--favorites', '--recent', '--popular', '--pick', '--watch', '--random', '--keep-playing']);

export function isListenerCommand(value: string): value is ListenerCommand {
  return (listenerCommands as readonly string[]).includes(value);
}

export function parseListenerArgs(command: ListenerCommand, args: string[]): ParsedCommand {
  const options = new Map<string, string | true>();
  const words: string[] = [];
  const allowed = new Set([...commonFlags, ...commandOptions[command] ?? []]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === '--') { words.push(...args.slice(index + 1)); break; }
    if (!arg.startsWith('-')) { words.push(arg); continue; }
    const equal = arg.indexOf('=');
    const key = equal < 0 ? arg : arg.slice(0, equal);
    if (!allowed.has(key)) throw new Error(`Unknown option: ${key}\nRun radiocli ${command} --help.`);
    if (options.has(key)) throw new Error(`Option ${key} was supplied more than once.`);
    if (booleans.has(key)) {
      if (equal >= 0) throw new Error(`${key} does not take a value.`);
      options.set(key, true);
    } else {
      const value = equal >= 0 ? arg.slice(equal + 1) : args[++index];
      if (!value || value.startsWith('--')) throw new Error(`${key} requires a value. Run radiocli ${command} --help.`);
      options.set(key, value);
    }
  }
  const flags = {json: options.has('--json'), plain: options.has('--plain'), quiet: options.has('--quiet') || options.has('-q'), noInput: options.has('--no-input'), noColor: options.has('--no-color')};
  if (flags.json && flags.plain) throw new Error('Choose either --json or --plain.');
  if ((options.has('--pick') || options.has('--watch')) && (flags.json || flags.plain || flags.quiet || flags.noInput)) {
    throw new Error('--pick and --watch require interactive output. Omit --json, --plain, --quiet, and --no-input.');
  }
  const sources = ['--favorites', '--recent', '--popular', '--source'].filter(option => options.has(option));
  if (sources.length > 1) throw new Error('Choose one station queue: --favorites, --recent, --popular, or --source.');
  if (sources[0] && sources[0] !== '--source') options.set('--source', sources[0] === '--favorites' ? 'favorite' : sources[0].slice(2));
  if (options.get('--source') === 'favorites') options.set('--source', 'favorite');
  return {command, words, options, flags};
}

export function integerOption(value: string | true | undefined, fallback: number, label: string, minimum: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) < minimum || Number(value) > maximum) throw new Error(`${label} must be a whole number from ${minimum} through ${maximum}.`);
  return Number(value);
}

const help: Record<ListenerCommand, string> = {
  play: `play [station name|provider:id|preset] [options]
  Start background playback, or control the open TUI. With no station, continue
  the current station or play your most recent station when nothing is selected.
  Paused playback resumes; playing audio continues uninterrupted.
  Exact saved names and presets work offline.
  Ambiguous names open a numbered chooser only in an interactive terminal.

  --favorites              Play from your favorites
  --recent                 Play from your recently played stations
  --popular                Play from the directory's popular stations
  --random                 Pick randomly from the chosen queue or search
  --pick                   Choose a station by number
  --keep-playing           Keep an already playing or paused station
  --country CODE  --language NAME  --codec NAME  --min-bitrate KBPS
  --limit 1-100             Search result count (default 20)

  --source recent|favorites|popular|country also works; favorite is accepted
  for compatibility. Explicit queue or filter options select a station anew.

  Examples:
    radiocli play jazz
    radiocli pause
    radiocli play
    radiocli play "Groove Salad"
    radiocli play --favorites --random
    radiocli play --country JP
    radiocli play work`,
  search: `search <query> [options]
  Find stations. Terminal tables mark favorites with *; piped output is TSV.
  --pick                 Choose a result and start background playback
  --country CODE         Filter by two-letter country code
  --language NAME        Filter by language
  --codec NAME           Filter by audio codec
  --min-bitrate KBPS     Minimum bitrate (0-10000)
  --limit 1-100          Maximum results (default 20)

  Examples:
    radiocli search jazz --country US --pick
    radiocli search jazz --json
    radiocli search jazz --plain`,
  now: `now [--watch]
  Show station, track metadata, output, playback state, and volume.
  --watch updates a single terminal line. Ctrl+C exits the view; audio continues.

  Examples:
    radiocli now
    radiocli now --watch
    radiocli now --json`,
  status: `status [--watch]
  Alias for radiocli now. Use --json for the current playback snapshot.`,
  favorites: `favorites [--limit 1-100] [--pick]
  List favorite stations, or select one to play with --pick.
  Save the active station with radiocli favorite.`,
  recent: `recent [--limit 1-100] [--pick]
  List recently played stations, newest first. Use --pick to tune one again.`,
  favorite: `favorite [station name|provider:id|preset]
  Save a station to favorites. With no argument, save the active station.
  Example: radiocli favorite "Groove Salad"`,
  unfavorite: `unfavorite [station name|provider:id|preset]
  Remove a saved favorite. With no argument, use the active station.`,
  preset: `preset <save|list|remove> [name] [station name|provider:id|preset]
  save NAME [STATION] saves a shortcut; omit STATION to save the active station.
  Saving an existing name replaces its station. Names are case-insensitive,
  1-40 letters, numbers, hyphens, or underscores, starting with a letter/number.
  remove NAME removes only the shortcut. Presets are included in library backups.

  Examples:
    radiocli preset save work
    radiocli preset save jazz "Example FM"
    radiocli play work
    radiocli preset remove work`,
  presets: `presets
  List saved station shortcuts. Alias for radiocli preset list.`,
  countries: `countries [--limit 1-100]
  Show the most popular countries (default 30).
  Example: radiocli play --country JP`,
  volume: `volume <0-100>
  Set playback volume, or save it for the next session when playback is closed.
  Example: radiocli volume 40`,
  pause: `pause
  Pause the active station. Use radiocli play to continue.`,
  resume: `resume
  Resume paused playback. radiocli play also resumes, and can restart after stop.`,
  stop: `stop
  Stop ordinary playback and close its background player. Alarms are separate.`,
  next: `next
  Play the next station in the current search, favorites, or recent queue.`,
  previous: `previous
  Play the previous station in the current queue.`,
  mute: `mute
  Mute active playback. Use radiocli unmute to restore sound.`,
  unmute: `unmute
  Restore sound without changing the saved volume.`,
  stats: `stats
  Show listening time, sessions, streaks, and your most-listened station.
  Example: radiocli stats --json`,
  completion: `completion <bash|zsh|fish|powershell>
  Print a shell completion script. No shell configuration is changed.

  Bash:       source <(radiocli completion bash)
  Zsh:        source <(radiocli completion zsh)   # after compinit
  Fish:       radiocli completion fish | source
  PowerShell: radiocli completion powershell | Out-String | Invoke-Expression

  Add the matching line to your shell profile to enable it in future sessions.`
};

export function listenerHelp(command: ListenerCommand): string {
  return `RadioCLI · ${command}\n\nUsage: radiocli ${help[command]}\n\nOutput options:\n  --json        Structured JSON\n  --plain       Stable tab-separated text without decoration\n  --quiet, -q   Suppress successful output\n  --no-input    Never prompt; use an exact station ID for ambiguous matches\n  --no-color    Disable color\n  --help, -h    Show this help\n`;
}

export function completionCandidates(words: string[], presets: string[]): string[] {
  const current = words.at(-1) ?? '';
  const command = words[0] ?? '';
  const previous = words.at(-2);
  let candidates: string[];
  if (words.length <= 1) candidates = [...listenerCommands, 'help', 'version', 'check', 'doctor', 'setup', 'mcp', 'agent', 'media-controls', 'update', 'import', 'export', 'alarm'];
  else if (command === 'help') candidates = ['--all', ...listenerCommands, 'check', 'doctor', 'setup', 'mcp', 'agent', 'media-controls', 'update', 'import', 'export', 'alarm', 'version'];
  else if (command === '--help' || command === '-h') candidates = ['--all'];
  else if (previous === '--source') candidates = ['recent', 'favorites', 'favorite', 'popular', 'country'];
  else if (previous === '--country') candidates = ['US', 'GB', 'DE', 'FR', 'JP', 'CA', 'AU', 'BR', 'IN'];
  else if (previous === '--codec') candidates = ['MP3', 'AAC', 'OGG', 'FLAC'];
  else if (previous === '--language') candidates = ['english', 'spanish', 'french', 'german', 'japanese'];
  else if (previous === '--limit') candidates = ['10', '20', '50', '100'];
  else if (previous === '--min-bitrate') candidates = ['64', '128', '192', '320'];
  else if (command === 'completion') candidates = ['bash', 'zsh', 'fish', 'powershell'];
  else if (command === 'preset' && words.length === 2) candidates = ['save', 'list', 'remove'];
  else if (command === 'volume') candidates = ['0', '20', '40', '60', '80', '100'];
  else if (isListenerCommand(command)) candidates = [...commonFlags, '--help', ...commandOptions[command] ?? [], ...(['play', 'favorite', 'unfavorite', 'preset'].includes(command) ? presets : [])];
  else candidates = ['--help'];
  return [...new Set(candidates)].filter(candidate => candidate.startsWith(current));
}
