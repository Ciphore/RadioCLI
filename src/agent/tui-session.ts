import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
import {join} from 'node:path';
import type {AirPlayDevice, AppSettings, IcyNowPlaying, PlaybackState, Station} from '../types.js';
import {PlayerController, type PlaybackControlResult} from '../player/player-controller.js';
import type {RadioEngine, RadioEngineState} from '../player/radio-engine.js';
import {launchHeadlessHost} from './launcher.js';
import {platformPaths} from '../platform/paths.js';
import {storageReadiness} from '../platform/storage.js';
import {listenLoopback} from '../platform/loopback.js';
import {ensureRadioSession, radioSessionMayBeActive, type RadioSessionClient, type RadioSessionCommand, type RadioSessionResult, type RadioSessionStatus} from './session.js';

export async function openTuiSession(): Promise<{session?: TuiSession; warning?: string}> {
  if (!radioSessionMayBeActive()) {
    if (process.env.RADIOCLI_TUI_PLAYBACK === 'inline') return {warning: 'Playback runs in this terminal. Crash recovery is disabled by RADIOCLI_TUI_PLAYBACK=inline.'};
    if (storageReadiness(join(platformPaths().runtime, 'agent-session.json')).status === 'unavailable') {
      return {warning: 'Playback recovery is unavailable: the runtime directory is not writable. Set RADIOCLI_HOME to a private writable directory.'};
    }
    const probe = createServer();
    try { await listenLoopback(probe); }
    catch { return {warning: 'Playback recovery is unavailable: this environment blocks local loopback control. Playback runs in this terminal.'}; }
    finally { await new Promise<void>(resolve => probe.close(() => resolve())); }
  }
  return {session: await TuiSession.connect()};
}

/** A terminal is a view of the existing playback owner. Its death must never
 * destroy the owner's IPC connection, queue, timers, or listening history. */
export class TuiSession {
  private readonly listeners = new Set<() => void>();
  private timer: NodeJS.Timeout | undefined;
  private revision = 0;
  private closing: Promise<void> | undefined;
  private closed = false;

  private constructor(private readonly client: RadioSessionClient, readonly clientId: string, public status: RadioSessionStatus) {}

  static async connect(): Promise<TuiSession> {
    const cli = fileURLToPath(new URL(import.meta.url.endsWith('.ts') ? '../cli.tsx' : '../cli.js', import.meta.url));
    const client = await ensureRadioSession(() => launchHeadlessHost(process.execPath, cli), 15_000, {source: 'cli'});
    const clientId = randomUUID();
    let result: RadioSessionResult;
    try { result = await client.call({type: 'tui-attach', pid: process.pid, clientId}); }
    catch (error) {
      if (error instanceof Error && /Invalid radio command|Unsupported radio command/i.test(error.message)) {
        throw new Error('The running player predates TUI recovery. Run radiocli stop, then reopen radiocli to use the updated player.');
      }
      throw error;
    }
    if (!result.ok) throw new Error(result.message);
    if (!result.status.tui) throw new Error('The playback host does not support terminal recovery. Stop the older session and reopen RadioCLI.');
    const session = new TuiSession(client, clientId, result.status);
    session.poll();
    return session;
  }

  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  async call(command: RadioSessionCommand): Promise<RadioSessionResult> {
    if (this.closed) throw new Error('RadioCLI terminal session is closed.');
    const result = await this.client.call(command);
    this.revision++;
    this.status = result.status;
    this.emit();
    return result;
  }

  report(error: unknown): void {
    this.status = {...this.status, persistenceWarning: error instanceof Error ? error.message : String(error)};
    this.emit();
  }

  disconnect(): void {
    clearTimeout(this.timer);
    this.closed = true;
    this.listeners.clear();
  }

  close(): Promise<void> {
    return this.closing ??= (async () => {
      clearTimeout(this.timer);
      try {
        const result = await this.call({type: 'tui-detach', clientId: this.clientId});
        if (!result.ok) throw new Error(result.message);
      } finally { this.disconnect(); }
    })();
  }

  private poll(): void {
    this.timer = setTimeout(() => {
      const revision = this.revision;
      void this.client.status().then(status => {
        if (!this.closed && revision === this.revision && JSON.stringify(status) !== JSON.stringify(this.status)) { this.status = status; this.emit(); }
      }).catch(() => {
        if (!this.closed && revision === this.revision) {
          this.status = {...this.status, playback: {...this.status.playback, state: 'error', ready: false,
            message: 'Playback host disconnected. Reopen RadioCLI to reconnect.'}};
          this.emit();
        }
      }).finally(() => { if (!this.closed && !this.closing) this.poll(); });
    }, 250);
    this.timer.unref();
  }

  private emit(): void { for (const listener of this.listeners) listener(); }
}

/** Keep synchronous presentation queries local, while every audio mutation
 * reaches the same owner used by CLI, agent, alarm, and desktop controls. */
export class TuiPlayer extends PlayerController {
  constructor(private readonly session: TuiSession, settings: () => AppSettings) { super(settings); }
  override getState(): PlaybackState { return {...this.session.status.playback}; }
  override onChange(listener: (state: PlaybackState) => void): () => void {
    listener(this.getState());
    return this.session.subscribe(() => listener(this.getState()));
  }
  override onMetadata(listener: (metadata: IcyNowPlaying) => void): () => void {
    let previous: string | undefined;
    return this.session.subscribe(() => {
      const metadata = this.session.status.nowPlaying;
      const key = JSON.stringify(metadata);
      if (metadata && key !== previous) { previous = key; listener(metadata); }
    });
  }
  override diagnostics() { return {...this.session.status.tui!.diagnostics}; }
  override desktopMediaCompatible(): boolean { return this.session.status.tui!.desktopMediaCompatible; }
  override detectedBackends(): string[] { return [...this.session.status.tui!.diagnostics.availableBackends]; }
  override refreshDetectedBackends(): string[] {
    void this.session.call({type: 'tui-refresh'}).catch(error => this.session.report(error));
    return this.detectedBackends();
  }
  override detectedAirPlayDevices(): AirPlayDevice[] { return [...this.session.status.tui!.devices]; }
  override airPlaySelectionRequired(): boolean { return this.session.status.tui!.selectionRequired; }
  override async refreshAirPlayDevices(): Promise<AirPlayDevice[]> {
    const result = await this.session.call({type: 'airplay-list'});
    if (!result.ok) throw new Error(result.message);
    return result.data ?? [];
  }
  override async selectAirPlayDevice(deviceId: string | null): Promise<boolean> { return (await this.session.call({type: 'tui-output', deviceId})).ok; }
  override async submitAirPlayPasscode(code: string): Promise<PlaybackControlResult> { return this.control({type: 'airplay-passcode', code}); }
  override async pause(): Promise<PlaybackControlResult> { return this.control({type: 'pause'}); }
  override async resume(): Promise<PlaybackControlResult> { return this.control({type: 'resume'}); }
  override async togglePause(): Promise<PlaybackControlResult> { return this.control({type: 'tui-toggle-pause'}); }
  override async setVolume(volume: number, options: {allowStopped?: boolean} = {}): Promise<PlaybackControlResult> {
    return this.control({type: 'set-volume', volume: Math.max(0, Math.min(100, Math.round(volume))), allowStopped: options.allowStopped});
  }
  override async adjustVolume(delta: number): Promise<PlaybackControlResult> { return this.control({type: 'tui-adjust-volume', delta}); }
  override async setMuted(muted: boolean, options: {allowStopped?: boolean} = {}): Promise<PlaybackControlResult> { return this.control({type: 'set-muted', muted, allowStopped: options.allowStopped}); }
  override async toggleMute(): Promise<PlaybackControlResult> { return this.control({type: 'tui-toggle-muted'}); }
  override async stop(): Promise<void> { await this.session.call({type: 'stop', retainSelection: true}); }
  override async play(): Promise<void> { throw new Error('Terminal playback must use the shared radio engine.'); }
  private async control(command: RadioSessionCommand): Promise<PlaybackControlResult> {
    const result = await this.session.call(command);
    return {ok: result.ok, message: result.message};
  }
}

export class TuiRadioEngine implements Pick<RadioEngine, 'snapshot' | 'onChange' | 'clearWarning' | 'cancel' | 'tune' | 'stop' | 'pause' | 'resume' | 'select' | 'close'> {
  constructor(private readonly session: TuiSession) {}
  snapshot(): RadioEngineState {
    const status = this.session.status;
    return {station: status.station, tuningStation: status.tui?.tuningStation ?? null, queue: [...status.queue],
      playback: {...status.playback}, nowPlaying: status.nowPlaying ?? null, warning: status.persistenceWarning, message: status.tui?.message};
  }
  onChange(listener: (state: RadioEngineState) => void): () => void { listener(this.snapshot()); return this.session.subscribe(() => listener(this.snapshot())); }
  clearWarning(): void { this.session.status.persistenceWarning = undefined; }
  cancel(): void { void this.session.call({type: 'tui-cancel'}).catch(error => this.session.report(error)); }
  async tune(station: Station, options: {queue?: Station[]; startPaused?: boolean; signal?: AbortSignal} = {}): Promise<Station> {
    options.signal?.throwIfAborted();
    const abort = () => this.cancel();
    options.signal?.addEventListener('abort', abort, {once: true});
    try {
      const result = await this.session.call({type: 'play', station, queue: options.queue, startPaused: options.startPaused});
      options.signal?.throwIfAborted();
      if (!result.ok || !result.status.station) throw new Error(result.message);
      return result.status.station;
    } finally { options.signal?.removeEventListener('abort', abort); }
  }
  async stop(options: {retainSelection?: boolean} = {}): Promise<void> { await this.session.call({type: 'stop', ...options}); }
  async pause(): Promise<PlaybackControlResult> { const result = await this.session.call({type: 'pause'}); return {ok: result.ok, message: result.message}; }
  async resume(): Promise<PlaybackControlResult> { const result = await this.session.call({type: 'resume'}); return {ok: result.ok, message: result.message}; }
  select(station: Station, queue: Station[]): void { void this.session.call({type: 'tui-select', station, queue}).catch(error => this.session.report(error)); }
  close(): Promise<void> { return this.session.close(); }
}
