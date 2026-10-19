import {randomInt} from 'node:crypto';
import {AgentRadioService, type AgentRuntime} from '../agent/service.js';
import {connectRadioSession, type RadioSessionResult, type RadioSessionStatus} from '../agent/session.js';
import {connectActiveAlarms} from '../alarms/active-session.js';
import {JsonLibraryStore, stationKey} from '../storage/store.js';
import {matchesStationId} from '../storage/station-identity.js';
import {ProviderManager} from '../providers/provider-manager.js';
import {computeListeningStats} from '../activity/stats.js';
import type {SearchOptions, Station} from '../types.js';
import {integerOption, parseListenerArgs, type ListenerCommand, type ParsedCommand} from './arguments.js';
import {CliOutput, clean} from './output.js';
import {pickStation, requireInteractive, watchNow} from './interactive.js';
import {completionScript} from './completion.js';

export async function runListenerCommand(command: ListenerCommand, args: string[], runtime: AgentRuntime): Promise<void> {
  const parsed = parseListenerArgs(command, args);
  const {words, flags, options} = parsed;
  if (command === 'completion') {
    if (words.length !== 1) throw new Error('Usage: radiocli completion <bash|zsh|fish|powershell>');
    const script = completionScript(words[0]!);
    if (!flags.quiet) console.log(flags.json ? JSON.stringify(script) : script);
    return;
  }
  if (options.has('--pick')) requireInteractive('--pick');
  if (options.has('--watch')) requireInteractive('--watch');
  const store = new JsonLibraryStore();
  const state = store.snapshot();
  const providers = new ProviderManager();
  const service = new AgentRadioService(runtime, store, providers, 'cli');
  const output = new CliOutput(flags, state.settings);
  const query = words.join(' ').trim();
  const filters = searchOptions(parsed);
  const noWords = () => { if (words.length) throw new Error(`Unexpected argument: ${clean(words[0])}\nRun radiocli ${command} --help.`); };
  const finish = (result: Pick<RadioSessionResult, 'ok' | 'message'> & Partial<Pick<RadioSessionResult, 'status'>>, background = false) => {
    if (!result.ok && (output.mode !== 'json' || flags.quiet)) throw new Error(result.message);
    output.result(result, background);
    if (!result.ok) process.exitCode = 1;
  };
  const select = async (stations: Station[], forcePick = options.has('--pick')): Promise<Station> => {
    if (!stations.length) throw new Error('No stations found. Try radiocli search with a broader query, or radiocli favorites.');
    if (stations.length === 1 && !forcePick) return stations[0]!;
    if (process.stdin.isTTY && process.stdout.isTTY && output.mode === 'human' && !flags.noInput && !flags.quiet) return pickStation(stations, output, state.favorites);
    const target = command === 'preset' ? 'preset save <name>' : command === 'search' ? 'play' : command;
    throw new Error(`Several stations match. Use an exact provider:id with radiocli ${target}:\n${stations.slice(0, 20).map(station => `  ${clean(stationKey(station))}  ${clean(station.name)}`).join('\n')}`);
  };
  const saved = uniqueStations([...state.favorites, ...state.imported, ...state.recent.map(item => item.station), ...(state.presets ?? []).map(preset => preset.station)]);
  const resolve = async (text: string): Promise<{station: Station; queue: Station[]}> => {
    if (/^https?:\/\//i.test(text)) throw new Error('Import a stream first with radiocli import <stream-url>, then play its saved name or ID.');
    const preset = (state.presets ?? []).find(item => item.name === normalize(text));
    const exactIds = saved.filter(station => matchesStationId(station, text));
    if (preset || exactIds.length) {
      const station = preset?.station ?? await select(exactIds);
      if (!matchesFilters(station, filters)) throw new Error('The selected saved station does not match those filters. Remove the filters or search for another station.');
      return {station, queue: [station]};
    }
    if (/^(radio-browser|radio-garden|playlist):/.test(text)) {
      const split = text.indexOf(':');
      const station = await providers.byId(text.slice(0, split) as Station['provider'], text.slice(split + 1));
      if (!station) throw new Error(`Station not found: ${clean(text)}. Use radiocli search to find a current ID, or import this station into your library.`);
      if (!matchesFilters(station, filters)) throw new Error('The station does not match those filters.');
      return {station, queue: [station]};
    }
    const matching = saved.filter(station => matchesFilters(station, filters));
    const exact = matching.filter(station => normalize(station.name) === normalize(text));
    const local = exact.length ? exact : matching.filter(station => normalize(text).split(/\s+/).every(word => normalize(station.name).includes(word)));
    const stations = local.length ? local : await providers.search(text, state.settings, filters);
    const remoteExact = stations.filter(station => normalize(station.name) === normalize(text));
    const candidates = remoteExact.length && !options.has('--pick') ? remoteExact : stations;
    const station = options.has('--random') && stations.length ? stations[randomInt(stations.length)]! : await select(candidates);
    return {station, queue: stations};
  };
  const currentStation = async (): Promise<Station> => {
    const station = (await readStatus())?.station;
    if (!station) throw new Error('No station is playing. Supply a station name, or start playback with radiocli play "station name".');
    return station;
  };

  if (command === 'now' || command === 'status') {
    noWords();
    if (options.has('--watch')) await watchNow(readStatus, output);
    else output.now(await readStatus());
    return;
  }
  if (command === 'play') {
    if (options.has('--random') && options.has('--pick')) throw new Error('Choose either --random or --pick.');
    if (query && options.has('--source')) throw new Error('Choose a station name or a station queue (--favorites, --recent, --popular, or --source).');
    const selectingStation = query || ['--source', '--random', '--pick', '--country', '--language', '--codec', '--min-bitrate', '--limit'].some(option => options.has(option));
    const active = selectingStation ? null : await readStatus();
    if (active?.station && ['paused', 'playing', 'loading'].includes(active.playback.state)) {
      if ((await connectActiveAlarms()).length) throw new Error('An alarm is currently active. Dismiss or keep the alarm from its ringing controls before starting interactive playback.');
      if (active.playback.state === 'paused' && !options.has('--keep-playing')) finish(await service.control({type: 'resume'}, false), true);
      else finish({ok: true, message: `Kept current station ${active.station.name} (${active.playback.state}).`, status: active}, true);
      return;
    }
    let selection: {station: Station; queue: Station[]};
    if (active?.station) selection = {station: active.station, queue: active.queue};
    else if (query) selection = await resolve(query);
    else {
      const source = options.get('--source') ?? (filters.countryCode ? 'country' : 'recent');
      if (!['recent', 'favorite', 'popular', 'country'].includes(String(source))) throw new Error('--source must be recent, favorites, popular, or country (favorite is also accepted).');
      if (source === 'country' && !filters.countryCode) throw new Error('Use --country with a two-letter code, for example radiocli play --country JP.');
      let queue = source === 'favorite' ? state.favorites : source === 'recent' ? state.recent.map(item => item.station) : source === 'country' ? await providers.byCountry(filters.countryCode!, 100) : await providers.popular(100);
      queue = queue.filter(station => matchesFilters(station, filters)).slice(0, filters.limit);
      if (!queue.length) throw new Error(`No ${source === 'favorite' ? 'favorite' : source} stations match. Start with radiocli play "station name".`);
      const station = options.has('--pick') ? await select(queue, true) : queue[options.has('--random') ? randomInt(queue.length) : 0]!;
      selection = {station, queue};
    }
    finish(await service.playStation(selection.station, selection.queue, {openUi: false, ifPlaying: options.has('--keep-playing') ? 'keep' : 'replace'}), true);
    return;
  }
  if (['pause', 'resume', 'stop', 'next', 'previous', 'mute', 'unmute', 'volume'].includes(command)) {
    if (command === 'volume') {
      if (words.length !== 1) throw new Error('Usage: radiocli volume <0-100>');
      finish(await service.control({type: 'set-volume', volume: integerOption(words[0], 70, 'Volume', 0, 100)}, false));
    } else {
      noWords();
      const control = command === 'mute' || command === 'unmute' ? {type: 'set-muted' as const, muted: command === 'mute'} : {type: command as 'pause' | 'resume' | 'stop' | 'next' | 'previous'};
      finish(await service.control(control, false));
    }
    return;
  }
  if (command === 'search' || command === 'favorites' || command === 'recent') {
    if (command === 'search' && !query) throw new Error('Usage: radiocli search <query> [--country CODE] [--pick]\nExample: radiocli search jazz --pick');
    if (command !== 'search') noWords();
    const stations = command === 'search' ? await providers.search(query, state.settings, filters) : (command === 'favorites' ? state.favorites : state.recent.map(item => item.station)).slice(0, filters.limit);
    if (options.has('--pick')) finish(await service.playStation(await select(stations, true), stations, {openUi: false}), true);
    else output.stations(stations, state.favorites, command === 'favorites' ? 'No favorites yet. Tune a station, then run radiocli favorite.' : command === 'recent' ? 'No recent stations yet. Start with radiocli play jazz.' : undefined);
    return;
  }
  if (command === 'countries') { noWords(); output.countries(await providers.countries(integerOption(options.get('--limit'), 30, '--limit', 1, 100))); return; }
  if (command === 'favorite' || command === 'unfavorite') {
    finish(await service.favoriteStation(query ? (await resolve(query)).station : await currentStation(), command === 'favorite'));
    return;
  }
  if (command === 'preset' || command === 'presets') {
    if (command === 'presets') noWords();
    const action = command === 'presets' ? 'list' : words[0] ?? 'list';
    if (action === 'list') {
      if (words.length > 1) throw new Error('Usage: radiocli preset list');
      output.presets(state.presets ?? []);
    } else if (action === 'save') {
      const name = words[1];
      if (!name) throw new Error('Usage: radiocli preset save <name> [station name|provider:id]');
      // Validate the shortcut before any directory request or selection prompt.
      if (!/^[a-z0-9][a-z0-9_-]{0,39}$/i.test(name)) throw new Error('Preset names must be 1-40 letters, numbers, hyphens, or underscores, starting with a letter or number.');
      const station = words.length > 2 ? (await resolve(words.slice(2).join(' '))).station : await currentStation();
      store.savePreset(name, station);
      finish({ok: true, message: `Saved preset ${name.toLowerCase()}: ${station.name}. Play it with radiocli play ${name.toLowerCase()}.`});
    } else if (action === 'remove') {
      if (words.length !== 2) throw new Error('Usage: radiocli preset remove <name>');
      store.removePreset(words[1]!);
      finish({ok: true, message: `Removed preset ${words[1]!.toLowerCase()}.`});
    } else throw new Error('Usage: radiocli preset <save|list|remove>. Run radiocli preset --help for examples.');
    return;
  }
  if (command === 'stats') { noWords(); output.stats(computeListeningStats(state.activity.sessions)); }
}

async function readStatus(signal?: AbortSignal): Promise<RadioSessionStatus | null> {
  const client = await connectRadioSession(undefined, {source: 'cli', signal});
  return client ? client.status() : null;
}

function searchOptions({options}: ParsedCommand): SearchOptions {
  const countryCode = options.get('--country');
  if (countryCode && (typeof countryCode !== 'string' || !/^[a-z]{2}$/i.test(countryCode))) throw new Error('--country requires a two-letter code, for example US, GB, or JP.');
  return {
    limit: integerOption(options.get('--limit'), 20, '--limit', 1, 100),
    countryCode: typeof countryCode === 'string' ? countryCode.toUpperCase() : undefined,
    language: options.get('--language') as string | undefined,
    codec: options.get('--codec') as string | undefined,
    minBitrate: options.has('--min-bitrate') ? integerOption(options.get('--min-bitrate'), 0, '--min-bitrate', 0, 10000) : undefined
  };
}

function matchesFilters(station: Station, options: SearchOptions): boolean {
  return (!options.countryCode || station.countryCode?.toUpperCase() === options.countryCode)
    && (!options.language || normalize(station.language ?? '').includes(normalize(options.language)))
    && (!options.codec || normalize(station.codec ?? '') === normalize(options.codec))
    && (options.minBitrate === undefined || (station.bitrate ?? 0) >= options.minBitrate);
}

function uniqueStations(stations: Station[]): Station[] { return [...new Map(stations.map(station => [stationKey(station), station])).values()]; }
function normalize(value: string): string { return value.normalize('NFKC').trim().toLowerCase(); }
