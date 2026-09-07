import {randomInt} from 'node:crypto';
import type {AgentControlSettings, AirPlayDevice, AppSettings, Station, ThemeName, ReceiverStyle} from '../types.js';
import {defaultAgentControlSettings, themeNames, receiverStyleNames} from '../types.js';
import {JsonLibraryStore, stationKey} from '../storage/store.js';
import {ProviderManager} from '../providers/provider-manager.js';
import {computeListeningStats} from '../activity/stats.js';
import {connectActiveAlarms, type ActiveAlarmStatus} from '../alarms/active-session.js';
import {connectRadioSession, ensureRadioSession, type RadioSessionCommand, type RadioSessionResult} from './session.js';
import {launchHeadlessHost, launchRadioTui} from './launcher.js';
import {PlayerController} from '../player/player-controller.js';
import {detectPlaybackBackends} from '../player/backend-install.js';
import {AgentAlarmService, type AgentAlarmCreate, type AgentAlarmUpdate} from './alarm-service.js';
import {appVersion} from '../version.js';
import {checkForUpdate, updateCommandForInstall} from '../update-check.js';

export type StationSource = 'recent' | 'favorite' | 'popular' | 'country';
export type AgentRuntime = {nodePath: string; cliPath: string};

export class AgentRadioService {
  private readonly stationCache = new Map<string, Station>();
  private readonly alarms: AgentAlarmService;

  constructor(
    private readonly runtime: AgentRuntime,
    private readonly store = new JsonLibraryStore(),
    private readonly providers = new ProviderManager()
  ) {
    this.alarms = new AgentAlarmService(
      this.store,
      id => this.resolveStationId(id),
      undefined,
      status => this.handoffAlarm(status)
    );
  }

  private settings(): AppSettings { return this.store.snapshot().settings; }

  appearance(): {themes: typeof themeNames; receiverStyles: typeof receiverStyleNames; current: AppSettings} {
    this.assertEnabled();
    return {themes: themeNames, receiverStyles: receiverStyleNames, current: this.settings()};
  }

  async status(): Promise<Record<string, unknown>> {
    this.assertEnabled();
    const client = await connectRadioSession();
    const state = this.store.snapshot();
    return {
      connected: Boolean(client),
      session: client ? await client.status() : null,
      agentControl: this.agentSettings(),
      favoriteCount: state.favorites.length,
      recentCount: state.recent.length,
      alarmActive: (await connectActiveAlarms()).length > 0,
      audioOutput: {
        preferredBackend: state.settings.preferredBackend,
        preferredAirPlayDevice: state.settings.preferredAirPlayDevice
      }
    };
  }

  async updateStatus(): Promise<Record<string, unknown>> {
    this.assertEnabled();
    const update = await checkForUpdate();
    const install = updateCommandForInstall();
    return {
      installedVersion: appVersion(),
      latestVersion: update.latestVersion ?? null,
      updateAvailable: update.updateAvailable,
      checkedAt: update.checkedAt,
      error: update.error ?? null,
      installMethod: install.method,
      command: install.command,
      note: 'RadioCLI does not install updates through MCP. Ask the user to approve the command or use Settings, then restart the MCP client.'
    };
  }

  async search(query: string, limit = 10, countryCode?: string): Promise<Station[]> {
    this.assertEnabled();
    const stations = await this.providers.search(query, this.store.snapshot().settings, {
      limit: clampLimit(limit),
      countryCode
    });
    this.remember(stations);
    return stations;
  }

  async browse(kind: 'favorites' | 'recent' | 'popular' | 'nearby' | 'countries' | 'track-history', limit = 20): Promise<unknown[]> {
    this.assertEnabled();
    const state = this.store.snapshot();
    const bounded = clampLimit(limit, 50);
    if (kind === 'favorites') return this.remember(state.favorites.slice(0, bounded));
    if (kind === 'recent') return this.remember(state.recent.slice(0, bounded).map(item => item.station));
    if (kind === 'track-history') return state.trackHistory.slice(0, bounded);
    if (kind === 'countries') return this.providers.countries(bounded);
    if (kind === 'popular') return this.remember(await this.providers.popular(bounded));
    if (!state.settings.enableNearbyLocation) throw new Error('Nearby location lookup is disabled in RadioCLI settings.');
    const location = await this.providers.detectLocation();
    if (!location) throw new Error('RadioCLI could not determine an approximate location.');
    return this.remember(await this.providers.nearby(location, bounded));
  }

  stats(): ReturnType<typeof computeListeningStats> {
    this.assertEnabled();
    return computeListeningStats(this.store.snapshot().activity.sessions);
  }

  async play(input: {
    stationId?: string;
    source?: StationSource;
    countryCode?: string;
    index?: number;
    random?: boolean;
    openUi?: boolean;
    ifPlaying?: 'keep' | 'replace';
  }): Promise<RadioSessionResult> {
    this.assertEnabled();
    if ((await connectActiveAlarms()).length > 0) throw new Error('An alarm is currently active. Dismiss or keep the alarm from its ringing controls before starting interactive playback.');
    const queue = await this.stationQueue(input.source ?? 'recent', input.countryCode);
    if (!input.stationId && queue.length === 0) throw new Error('No station is available for that request.');
    const station = input.stationId
      ? await this.findStation(input.stationId, queue)
      : queue[input.random ? randomInt(queue.length) : Math.max(0, input.index ?? 0)];
    if (!station) throw new Error(input.stationId ? `Unknown station ID: ${input.stationId}. Search or browse first.` : 'No station is available for that request.');
    const ordered = [station, ...queue.filter(item => stationKey(item) !== stationKey(station))];
    return this.send({
      type: 'play',
      station,
      queue: ordered,
      openNowPlaying: this.agentSettings().focusNowPlaying,
      ifPlaying: input.ifPlaying ?? 'replace'
    }, input.openUi);
  }

  async control(command: Exclude<RadioSessionCommand, {type: 'play'} | {type: 'status'}>, openUi?: boolean): Promise<RadioSessionResult> {
    this.assertEnabled();
    const client = await connectRadioSession();
    if (!client && command.type === 'set-volume') {
      const volume = Math.min(100, Math.max(0, command.volume));
      this.store.updateSettings({volume});
      return idleResult(`Saved volume ${volume}; no playback session is active.`);
    }
    if (!client && ['stop', 'pause', 'resume', 'next', 'previous', 'set-volume', 'set-muted'].includes(command.type)) {
      if (command.type === 'stop' || command.type === 'pause') return idleResult(command.type === 'stop' ? 'RadioCLI is already stopped.' : 'No playback session is active; pause is already satisfied.');
      throw new Error('No interactive RadioCLI playback session is active.');
    }
    return this.send(command, openUi);
  }

  async setFavorite(favorite: boolean, stationId?: string): Promise<RadioSessionResult | {ok: true; message: string; station: Station}> {
    this.assertEnabled();
    const client = await connectRadioSession();
    if (!stationId && client) return client.call({type: 'set-favorite', favorite});
    const station = stationId ? await this.findStation(stationId, this.savedStations()) : undefined;
    if (!station) throw new Error('No station was supplied and no active station is available.');
    const isFavorite = this.store.isFavorite(station);
    if (isFavorite !== favorite) this.store.toggleFavorite(station);
    if (favorite && !isFavorite && this.store.snapshot().settings.shareDirectoryVotes) void this.providers.vote(station);
    return {ok: true, message: `${favorite ? 'Favorited' : 'Removed favorite'}: ${station.name}`, station};
  }

  async updateAppearance(input: {theme?: ThemeName; receiverStyle?: ReceiverStyle}): Promise<unknown> {
    this.assertEnabled();
    if (input.theme && !themeNames.includes(input.theme)) throw new Error(`Unknown theme: ${input.theme}`);
    if (input.receiverStyle && !receiverStyleNames.includes(input.receiverStyle)) throw new Error(`Unknown receiver style: ${input.receiverStyle}`);
    const client = await connectRadioSession();
    if (client) return client.call({type: 'update-settings', settings: input});
    return this.store.updateSettings(input).settings;
  }

  async runCompletionPreset(): Promise<RadioSessionResult> {
    const preset = this.agentSettings().completionPreset;
    if (preset.action === 'play') return this.play({source: preset.source, countryCode: preset.countryCode, random: preset.source !== 'recent', openUi: preset.openUi, ifPlaying: preset.ifPlaying});
    return this.control({type: preset.action}, preset.openUi);
  }

  configureCompletionPreset(input: Partial<AgentControlSettings['completionPreset']>): AgentControlSettings {
    this.assertEnabled();
    const agentControl = this.agentSettings();
    const completionPreset = {...agentControl.completionPreset, ...input};
    if (completionPreset.source === 'country' && !completionPreset.countryCode) throw new Error('A two-letter countryCode is required for the country preset source.');
    if (completionPreset.countryCode) completionPreset.countryCode = completionPreset.countryCode.toUpperCase();
    return this.store.updateSettings({agentControl: {...agentControl, completionPreset}}).settings.agentControl!;
  }

  async updateAgentPreferences(input: {openUiOnPlay?: boolean; focusNowPlaying?: boolean}): Promise<unknown> {
    this.assertEnabled();
    const agentControl = {...this.agentSettings(), ...input};
    const client = await connectRadioSession();
    if (client) return client.call({type: 'update-settings', settings: {agentControl}});
    return this.store.updateSettings({agentControl}).settings.agentControl;
  }

  alarmList(): Promise<Record<string, unknown>[]> { this.assertEnabled(); return this.alarms.list(); }
  alarmStatus(): Promise<Record<string, unknown>> { this.assertEnabled(); return this.alarms.status(); }
  alarmCreate(input: AgentAlarmCreate): Promise<Record<string, unknown>> { this.assertEnabled(); return this.alarms.create(input); }
  alarmUpdate(id: string, input: AgentAlarmUpdate): Promise<Record<string, unknown>> { this.assertEnabled(); return this.alarms.update(id, input); }
  alarmSetEnabled(id: string, enabled: boolean): Promise<Record<string, unknown>> { this.assertEnabled(); return this.alarms.setEnabled(id, enabled); }
  alarmRemove(id: string, confirm: boolean): Promise<{ok: true; removed: string}> { this.assertEnabled(); return this.alarms.remove(id, confirm); }
  alarmSync(): Promise<unknown> { this.assertEnabled(); return this.alarms.sync(); }
  alarmControl(input: Parameters<AgentAlarmService['controlActive']>[0]): ReturnType<AgentAlarmService['controlActive']> { this.assertEnabled(); return this.alarms.controlActive(input); }

  async listAirPlayDevices(): Promise<AirPlayDevice[]> {
    this.assertEnabled();
    this.assertAirPlayPlatform();
    const client = await connectRadioSession();
    if (client) return (await client.call({type: 'airplay-list'})).data ?? [];
    const player = new PlayerController(() => this.store.snapshot().settings);
    const backends = player.refreshDetectedBackends();
    if (!backends.includes('airplay')) throw new Error('AirPlay is unavailable on this Mac. Run radiocli doctor to check ffmpeg, dns-sd, and the sender package.');
    return player.refreshAirPlayDevices();
  }

  async selectAirPlayDevice(deviceId: string, openUi?: boolean): Promise<RadioSessionResult> {
    this.assertEnabled();
    this.assertAirPlayPlatform();
    const devices = await this.listAirPlayDevices();
    const device = devices.find(item => item.id === deviceId);
    if (!device) throw new Error('Unknown AirPlay receiver ID. Refresh the receiver list and use an exact returned ID.');
    if (device.local) return this.useLocalOutput(openUi);
    this.store.updateSettings({preferredAirPlayDevice: device.id});
    return this.send({type: 'airplay-select', deviceId: device.id}, openUi);
  }

  async useLocalOutput(openUi?: boolean): Promise<RadioSessionResult> {
    this.assertEnabled();
    const client = await connectRadioSession();
    if (!client) {
      const backend = preferredLocalBackend(detectPlaybackBackends());
      if (!backend) throw new Error('No local playback backend is available. Run radiocli setup to install mpv.');
      this.store.updateSettings({preferredBackend: backend});
      return idleResult(`Audio output set to this device (${backend}).`);
    }
    return this.send({type: 'airplay-local'}, openUi);
  }

  async submitAirPlayPasscode(code: string): Promise<RadioSessionResult> {
    this.assertEnabled();
    this.assertAirPlayPlatform();
    const client = await connectRadioSession();
    if (!client) throw new Error('No active AirPlay session is waiting for a receiver code.');
    return client.call({type: 'airplay-passcode', code});
  }

  async resolveStationId(id: string): Promise<Station | undefined> {
    return this.findStation(id, this.savedStations());
  }

  private async handoffAlarm(status: ActiveAlarmStatus): Promise<void> {
    if (!status.station) throw new Error('This alarm session does not expose a station for interactive handoff.');
    const result = await this.send({
      type: 'play',
      station: status.station,
      queue: [status.station],
      openNowPlaying: true,
      ifPlaying: 'replace'
    }, undefined, true);
    if (!result.ok || result.status.playback.state !== 'playing' || !result.status.playback.ready) {
      throw new Error(result.message || 'Interactive playback did not become ready; the alarm is still playing.');
    }
  }

  private async send(command: RadioSessionCommand, openUi?: boolean, allowActiveAlarm = false): Promise<RadioSessionResult> {
    const settings = this.settings();
    const agentControl = settings.agentControl ?? defaultAgentControlSettings;
    if (!agentControl.enabled) throw new Error('Agent control is disabled. Run radiocli mcp enable or enable it in Settings.');
    let client = await connectRadioSession();
    if (!client) {
      if (!allowActiveAlarm && (await connectActiveAlarms()).length > 0) throw new Error('An alarm is currently active. Dismiss or keep the alarm from its ringing controls before starting interactive playback.');
      const shouldOpen = openUi ?? agentControl.openUiOnPlay;
      client = await ensureRadioSession(async () => {
        if (shouldOpen) await launchRadioTui(this.runtime.nodePath, this.runtime.cliPath, encodeAgentCommand({type: 'status'}));
        else await launchHeadlessHost(this.runtime.nodePath, this.runtime.cliPath);
      });
    }
    return client.call(command);
  }

  private async stationQueue(source: StationSource, countryCode?: string): Promise<Station[]> {
    const state = this.store.snapshot();
    let stations: Station[];
    if (source === 'recent') stations = state.recent.map(item => item.station);
    else if (source === 'favorite') stations = state.favorites;
    else if (source === 'popular') stations = await this.providers.popular(50);
    else {
      if (!countryCode || !/^[a-z]{2}$/i.test(countryCode)) throw new Error('countryCode must be a two-letter ISO country code.');
      stations = await this.providers.byCountry(countryCode.toUpperCase(), 100);
    }
    return this.remember(stations);
  }

  private savedStations(): Station[] {
    const state = this.store.snapshot();
    return [...state.favorites, ...state.recent.map(item => item.station), ...state.imported, ...this.stationCache.values()];
  }

  private async findStation(id: string, candidates: Station[]): Promise<Station | undefined> {
    const normalized = id.trim();
    const local = this.stationCache.get(normalized)
      ?? candidates.find(station => opaqueStationId(station) === normalized || station.id === normalized);
    if (local) return local;
    const separator = normalized.indexOf(':');
    const provider = separator > 0 ? normalized.slice(0, separator) : 'radio-browser';
    const providerId = separator > 0 ? normalized.slice(separator + 1) : normalized;
    if (!['radio-browser', 'radio-garden', 'playlist'].includes(provider)) return undefined;
    const station = await this.providers.byId(provider as Station['provider'], providerId);
    if (station) this.remember([station]);
    return station ?? undefined;
  }

  private remember(stations: Station[]): Station[] {
    for (const station of stations) this.stationCache.set(opaqueStationId(station), station);
    return stations;
  }

  private agentSettings(): AgentControlSettings {
    return this.settings().agentControl ?? defaultAgentControlSettings;
  }

  private assertEnabled(): void {
    if (!this.agentSettings().enabled) throw new Error('Agent control is disabled. Run radiocli mcp enable or enable it in Settings.');
  }

  private assertAirPlayPlatform(): void {
    if (process.platform !== 'darwin') throw new Error('AirPlay control is available only on macOS.');
  }
}

function opaqueStationId(station: Station): string { return `${station.provider}:${station.id}`; }
export function stationForAgent(station: Station): Record<string, unknown> {
  return {
    id: opaqueStationId(station),
    name: station.name,
    country: station.country,
    countryCode: station.countryCode,
    city: station.city,
    language: station.language,
    tags: station.tags.slice(0, 8),
    codec: station.codec,
    bitrate: station.bitrate,
    distanceKm: station.distanceKm
  };
}

function encodeAgentCommand(command: RadioSessionCommand): string { return Buffer.from(JSON.stringify(command)).toString('base64url'); }
export function decodeAgentCommand(value: string): RadioSessionCommand { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as RadioSessionCommand; }

function clampLimit(value: number, max = 30): number { return Math.min(max, Math.max(1, Math.round(value))); }
function idleResult(message: string): RadioSessionResult {
  return {ok: true, message, status: {owner: 'headless', station: null, queue: [], playback: {backend: 'none', state: 'idle', volume: 70, muted: false, ready: false}}};
}
function preferredLocalBackend(backends: string[]): 'mpv' | 'ffplay' | 'vlc' | null {
  return backends.includes('mpv') ? 'mpv' : backends.includes('ffplay') ? 'ffplay' : backends.includes('vlc') ? 'vlc' : null;
}
