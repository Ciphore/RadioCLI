import type {AppSettings, IcyNowPlaying, LibraryState, PlaybackState, ResolvedStream, Station} from '../types.js';
import {stationKey} from '../storage/store.js';
import {PlayerController, PlaybackOutputError} from './player-controller.js';

type HistoryStore = {
  addRecent(station: Station): LibraryState | Promise<LibraryState>;
  recordTrack(station: Station, title: string): LibraryState | Promise<LibraryState>;
  startListeningSession(station: Station, at?: Date): LibraryState | Promise<LibraryState>;
  finishActiveListeningSession(at?: Date): LibraryState | Promise<LibraryState>;
  checkpointActiveListeningSession(at?: Date): LibraryState | Promise<LibraryState>;
};
export type RadioEngineState = {
  station: Station | null; tuningStation: Station | null; queue: Station[];
  playback: PlaybackState; nowPlaying: IcyNowPlaying | null; warning?: string; message?: string;
};
type TuneOptions = {queue?: Station[]; startPaused?: boolean; signal?: AbortSignal; skipBroken?: boolean; recoveryAttempt?: number};

/** Product playback rules shared by interactive and headless owners. Screen
 * navigation and native alarm ownership deliberately remain in their adapters. */
export class RadioEngine {
  private state: RadioEngineState;
  private readonly listeners = new Set<(state: RadioEngineState) => void>();
  private readonly unsubscribe: Array<() => void>;
  private generation = 0;
  private tuneAbort: AbortController | undefined;
  private candidate: {station: Station; url: string; generation: number} | undefined;
  private listeningKey: string | undefined;
  private lastTrack: string | undefined;
  private history: Promise<void> = Promise.resolve();
  private readonly checkpoint: NodeJS.Timeout;
  private closed = false;
  private recoveryTimer: NodeJS.Timeout | undefined;
  private recoveryAttempts = 0;
  private healthyPlaybackTimer: NodeJS.Timeout | undefined;
  private closing: Promise<void> | undefined;

  constructor(readonly player: PlayerController,
    private readonly providers: {resolve(station: Station, options?: {signal?: AbortSignal}): Promise<ResolvedStream>},
    private readonly store: HistoryStore,
    private readonly settings: () => AppSettings,
    private readonly onSaved?: (state: LibraryState) => void) {
    this.state = {station: null, tuningStation: null, queue: [], playback: player.getState(), nowPlaying: null};
    this.unsubscribe = [
      player.onChange(playback => this.onPlayback(playback)),
      player.onMetadata(metadata => this.onMetadata(metadata))
    ];
    this.checkpoint = setInterval(() => {
      if (this.listeningKey && this.state.playback.state === 'playing' && this.state.playback.ready && !this.state.playback.buffering) {
        const at = new Date(); this.persist(() => store.checkpointActiveListeningSession(at));
      }
    }, 30_000);
    this.checkpoint.unref();
  }

  snapshot(): RadioEngineState { return {...this.state, playback: {...this.state.playback}, queue: [...this.state.queue]}; }
  onChange(listener: (state: RadioEngineState) => void): () => void {
    this.listeners.add(listener); listener(this.snapshot()); return () => this.listeners.delete(listener);
  }
  clearWarning(): void { if (this.state.warning) { this.state.warning = undefined; this.emit(); } }
  cancel(): void {
    this.generation++;
    clearTimeout(this.recoveryTimer);
    this.recoveryTimer = undefined;
    clearTimeout(this.healthyPlaybackTimer);
    this.healthyPlaybackTimer = undefined;
    this.tuneAbort?.abort(new DOMException('Tuning canceled.', 'AbortError'));
    this.tuneAbort = undefined;
    if (this.candidate && this.state.playback.ready) this.candidate.generation = this.generation;
    this.state.tuningStation = null;
    this.state.message = undefined;
    this.emit();
  }

  async tune(station: Station, options: TuneOptions = {}): Promise<Station> {
    if (this.closed) throw new Error('RadioCLI playback engine is closed.');
    options.signal?.throwIfAborted();
    this.cancel();
    this.recoveryAttempts = options.recoveryAttempt ?? 0;
    const generation = this.generation;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(new DOMException('Tuning exceeded 90 seconds.', 'TimeoutError')), 90_000);
    deadline.unref();
    this.tuneAbort = controller;
    const abort = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', abort, {once: true});
    const queue = options.queue?.length ? options.queue : [station];
    let next = station;
    try {
      while (true) {
        controller.signal.throwIfAborted();
        this.state.tuningStation = next;
        this.state.nowPlaying = null;
        this.emit();
        try {
          // A ready receiver can keep its connection while resolving a new URL.
          // Pending startup and local processes are canceled before replacement.
          const playback = this.player.getState();
          if (!(playback.backend === 'airplay' && playback.ready && playback.state === 'playing')) await this.player.stop();
          controller.signal.throwIfAborted();
          const resolved = await this.providers.resolve(next, {signal: controller.signal});
          controller.signal.throwIfAborted();
          if (generation !== this.generation) throw new DOMException('Tuning canceled.', 'AbortError');
          this.candidate = {station: next, url: resolved.url, generation};
          this.lastTrack = undefined;
          await this.player.play(next, resolved.url, {startPaused: options.startPaused, signal: controller.signal});
          controller.signal.throwIfAborted();
          this.onPlayback(this.player.getState());
          this.state.station = next;
          this.state.queue = [...queue];
          this.state.tuningStation = null;
          this.state.message = undefined;
          const tuned = next;
          this.persist(() => this.store.addRecent(tuned));
          this.emit();
          await this.flushHistory();
          controller.signal.throwIfAborted();
          if (generation !== this.generation) throw new DOMException('Tuning canceled.', 'AbortError');
          return next;
        } catch (error) {
          if (controller.signal.aborted || generation !== this.generation) throw controller.signal.reason ?? error;
          const index = queue.findIndex(item => stationKey(item) === stationKey(next));
          const following = index >= 0 ? queue[index + 1] : undefined;
          if (!following || options.startPaused || options.skipBroken === false || !this.settings().skipBrokenStreams || error instanceof PlaybackOutputError) throw error;
          this.state.message = `${error instanceof Error ? error.message : 'Could not tune station.'} Skipping to ${following.name}.`;
          this.state.tuningStation = following;
          this.emit();
          await abortableDelay(1000, controller.signal);
          next = following;
        }
      }
    } finally {
      clearTimeout(deadline);
      options.signal?.removeEventListener('abort', abort);
      if (generation === this.generation) {
        this.tuneAbort = undefined;
        this.state.tuningStation = null;
        this.emit();
      }
    }
  }

  async stop(options: {retainSelection?: boolean} = {}): Promise<void> {
    this.cancel();
    this.candidate = undefined;
    this.finishListening();
    this.state.nowPlaying = null;
    if (!options.retainSelection) { this.state.station = null; this.state.queue = []; }
    await this.player.stop();
    this.onPlayback(this.player.getState());
    this.emit();
    await this.flushHistory();
  }
  async pause() { const result = await this.player.pause(); this.onPlayback(this.player.getState()); await this.flushHistory(); return result; }
  async resume() { const result = await this.player.resume(); this.onPlayback(this.player.getState()); await this.flushHistory(); return result; }
  select(station: Station, queue = this.state.queue): void { this.state.station = station; this.state.queue = [...queue]; this.emit(); }
  async flushHistory(): Promise<void> { await this.history; }
  close(): Promise<void> {
    return this.closing ??= (async () => {
      this.closed = true;
      clearInterval(this.checkpoint);
      try { await this.stop(); }
      finally { for (const unsubscribe of this.unsubscribe) unsubscribe(); this.listeners.clear(); }
    })();
  }

  private onPlayback(playback: PlaybackState): void {
    this.state.playback = playback;
    const active = this.candidate;
    const belongs = active && active.generation === this.generation && (!playback.streamUrl || playback.streamUrl === active.url);
    if (belongs && playback.ready && playback.state === 'playing' && !playback.buffering) {
      if (this.recoveryAttempts > 0 && !this.healthyPlaybackTimer) {
        const generation = this.generation;
        this.healthyPlaybackTimer = setTimeout(() => {
          this.healthyPlaybackTimer = undefined;
          if (generation === this.generation && !this.closed) this.recoveryAttempts = 0;
        }, 60_000);
        this.healthyPlaybackTimer.unref();
      }
      const key = stationKey(active.station);
      if (this.listeningKey !== key) {
        this.finishListening();
        this.listeningKey = key;
        const at = new Date(); this.persist(() => this.store.startListeningSession(active.station, at));
      }
    } else {
      clearTimeout(this.healthyPlaybackTimer); this.healthyPlaybackTimer = undefined;
      if (!playback.ready || playback.state !== 'playing' || playback.buffering) this.finishListening();
    }
    if (belongs && playback.state === 'error' && !this.state.tuningStation && !this.closed && this.player.recoverableFailure()) this.scheduleRecovery(active.station);
    this.emit();
  }
  private onMetadata(metadata: IcyNowPlaying): void {
    const active = this.candidate;
    if (!active || active.generation !== this.generation || this.state.playback.streamUrl && this.state.playback.streamUrl !== active.url) return;
    this.state.nowPlaying = metadata;
    const key = `${stationKey(active.station)}:${metadata.title}`;
    if (metadata.title && key !== this.lastTrack) {
      this.lastTrack = key;
      this.persist(() => this.store.recordTrack(active.station, metadata.title!));
    }
    this.emit();
  }
  private finishListening(): void {
    if (!this.listeningKey) return;
    this.listeningKey = undefined;
    const at = new Date(); this.persist(() => this.store.finishActiveListeningSession(at));
  }
  private scheduleRecovery(station: Station): void {
    if (this.recoveryTimer) return;
    if (this.recoveryAttempts >= 3) { this.state.message = 'Reconnection stopped after 3 attempts. Select the station to try again.'; return; }
    const attempt = ++this.recoveryAttempts;
    const generation = this.generation;
    this.state.message = `Stream connection interrupted. Reconnecting ${station.name} (${attempt}/3).`;
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = undefined;
      if (this.closed || generation !== this.generation) return;
      void this.tune(station, {queue: this.state.queue, recoveryAttempt: attempt, skipBroken: false}).catch(error => {
        if (this.closed || (error as Error).name === 'AbortError') return;
        if (this.player.recoverableFailure() && this.recoveryAttempts < 3) this.scheduleRecovery(station);
        else { this.state.message = `Could not reconnect ${station.name}: ${error instanceof Error ? error.message : String(error)}`; this.emit(); }
      });
    }, 1000 * 2 ** (attempt - 1));
    this.recoveryTimer.unref();
  }
  private persist(write: () => LibraryState | Promise<LibraryState>): void {
    this.history = this.history.then(async () => {
      try { const saved = await write(); this.onSaved?.(saved); }
      catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        this.state.warning = `Listening history was not saved${code ? ` (${code})` : ''}. Check storage permissions or set RADIOCLI_HOME to a private writable directory.`;
        this.emit();
      }
    });
  }
  private emit(): void { for (const listener of this.listeners) { try { listener(this.snapshot()); } catch { /* Isolate adapters. */ } } }
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const finish = () => { signal.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, ms);
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal.addEventListener('abort', abort, {once: true});
  });
}
