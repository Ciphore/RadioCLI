import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {existsSync, unlinkSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import type {AirPlayDevice, AppSettings, IcyNowPlaying, PlaybackDiagnostics, PlaybackState, Station} from '../types.js';
import {airPlayMacOSOnlyMessage, detectPlaybackBackends, ffplayLimitedControlsMessage, isAirPlayPlatformSupported, playbackBackendInstallHint, vlcLimitedControlsMessage} from './backend-install.js';
import {resolveCommand} from '../platform/executables.js';
import {discoverAirPlayDevices} from './airplay-discovery.js';
import {airPlaySenderHealth} from './airplay-sender-health.js';
import {encodeWorkerStart, parseWorkerMessage, serializeWorkerMessage, type AirPlayWorkerCommand, type AirPlayWorkerEvent} from './airplay-worker-protocol.js';
import {safeMediaTarget, sanitizeTerminalText} from '../safety.js';
import {MpvIpcClient} from './mpv-ipc-client.js';
import {mpvIpcPath} from '../platform/ipc.js';

export type PlayerEvent = (state: PlaybackState) => void;
export type MetadataEvent = (metadata: IcyNowPlaying) => void;
export type PlaybackControlResult = {
  ok: boolean;
  message?: string;
};

const minAirPlayTuneTimeoutSeconds = 30;
const maxPlayerDiagnosticCharacters = 4096;

type PlayerRuntime = {
  platform: NodeJS.Platform;
  arch: string;
  env: NodeJS.ProcessEnv;
};

type PlayerExit = {
  backend: 'mpv' | 'ffplay' | 'vlc' | 'airplay';
  code: number | null;
  signal: NodeJS.Signals | null;
  diagnostic: string;
  spawnError?: boolean;
};

export class PlaybackOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlaybackOutputError';
  }
}

export function isPlaybackOutputError(error: unknown): boolean {
  return error instanceof PlaybackOutputError;
}

export class PlayerController {
  private process: ChildProcessWithoutNullStreams | null = null;
  private backend: 'mpv' | 'ffplay' | 'vlc' | 'airplay' | null = null;
  private ipcPath: string | null = null;
  private mpvIpcClient: MpvIpcClient | null = null;
  private metadataTimer: NodeJS.Timeout | null = null;
  private playbackStateTimer: NodeJS.Timeout | null = null;
  private state: PlaybackState = {backend: 'none', state: 'idle', volume: 70, muted: false, ready: false};
  private listeners = new Set<PlayerEvent>();
  private metadataListeners = new Set<MetadataEvent>();
  private availableBackends: string[] | null = null;
  private availableAirPlayDevices: AirPlayDevice[] = [];
  private airPlayReadyResolver: ((result: 'ready' | 'password-required') => void) | null = null;
  private airPlayReadyRejecter: ((error: Error) => void) | null = null;
  private airPlayRetuneResolver: (() => void) | null = null;
  private airPlayRetuneRejecter: ((error: Error) => void) | null = null;
  private airPlayRetuning = false;
  private airPlaySessionEstablished = false;
  private airPlayPasscodes = new Map<string, string>();
  private currentAirPlayDevice: AirPlayDevice | null = null;
  private currentAirPlayDeviceId: string | null = null;
  private pendingAirPlayPasscode: string | null = null;
  private currentMpvMediaTitle: string | null = null;
  private metadataPollInFlight = false;
  private playbackStatePollInFlight = false;
  private mpvLiveRetuneInFlight = false;
  private pendingMpvVolume: number | null = null;
  private mpvVolumeFlush: Promise<PlaybackControlResult> | null = null;
  private confirmedMpvVolume = 70;
  private mpvSessionId = 0;
  private playbackSessionId = 0;
  private stopPromise: Promise<void> | null = null;
  private lastPlayerExit: PlayerExit | null = null;

  constructor(
    private readonly getSettings: () => AppSettings,
    private readonly runtime: PlayerRuntime = {platform: process.platform, arch: process.arch, env: process.env}
  ) {}

  onChange(listener: PlayerEvent): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  onMetadata(listener: MetadataEvent): () => void {
    this.metadataListeners.add(listener);
    return () => this.metadataListeners.delete(listener);
  }

  getState(): PlaybackState {
    return {...this.state};
  }

  diagnostics(): PlaybackDiagnostics {
    return {
      backend: this.state.backend,
      availableBackends: this.detectedBackends(),
      preferredBackend: this.getSettings().preferredBackend,
      active: Boolean(this.process),
      streamUrl: this.state.streamUrl,
      stationName: this.state.stationName,
      volume: this.state.volume,
      muted: this.state.muted,
      startedAt: this.state.startedAt,
      ready: this.state.ready
    };
  }

  detectedBackends(): string[] {
    return [...(this.availableBackends ?? [])];
  }

  refreshDetectedBackends(): string[] {
    this.availableBackends = detectPlaybackBackends({platform: this.runtime.platform});
    return this.detectedBackends();
  }

  async play(station: Station, url: string): Promise<void> {
    const target = safeMediaTarget(url);
    if (!target) {
      throw new Error(`Station ${station.name} returned an unsupported stream URL.`);
    }
    url = target;

    const backend = this.selectBackend();
    if (!backend) {
      await this.stop();
      throw new PlaybackOutputError(this.playbackUnavailableMessage());
    }

    if (backend === 'airplay') {
      const activeDevice = this.activeAirPlayDeviceForRetune();
      if (activeDevice) {
        await this.retuneAirPlay(url, station.name, activeDevice);
        return;
      }

      let device: AirPlayDevice;
      try {
        device = await this.resolveAirPlayDevice();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not resolve AirPlay receiver.';
        this.setState({...this.state, backend, state: 'error', message, ready: false});
        throw error;
      }

      if (this.canRetuneAirPlay(device)) {
        await this.retuneAirPlay(url, station.name, device);
        return;
      }

      await this.stop();
      this.backend = backend;
      this.currentAirPlayDevice = device;
      this.currentAirPlayDeviceId = device.id;
      this.setState({
        backend,
        state: 'loading',
        message: `Opening ${station.name}`,
        volume: this.getSettings().volume,
        muted: false,
        stationName: station.name,
        streamUrl: url,
        ready: false
      });
      this.setState({...this.state, airPlayDeviceName: device.name});
      const result = await this.playWithAirPlay(url, station.name, device);
      if (result === 'password-required') {
        if (this.pendingAirPlayPasscode) {
          return;
        }

        this.setState({
          ...this.state,
          backend,
          state: 'loading',
          message: 'AirPlay code required. Use :airplay-code 1234.',
          ready: false
        });
        return;
      }

      this.airPlaySessionEstablished = true;
      this.setState({
        backend,
        state: 'playing',
        message: station.name,
        volume: this.getSettings().volume,
        muted: false,
        stationName: station.name,
        airPlayDeviceName: device.name,
        streamUrl: url,
        startedAt: new Date().toISOString(),
        ready: true
      });
      return;
    }

    await this.stop();
    this.backend = backend;
    this.setState({
      backend,
      state: 'loading',
      message: `Opening ${station.name}`,
      volume: this.getSettings().volume,
      muted: false,
      stationName: station.name,
      streamUrl: url,
      ready: false
    });
    if (backend === 'mpv') {
      this.playWithMpv(url, station.name);
      try {
        await this.waitForReady(backend);
      } catch (error) {
        if (!this.shouldRetryMpvWithAlsa(error)) throw error;
        await this.stop();
        this.backend = backend;
        this.setState({
          backend,
          state: 'loading',
          message: `Opening ${station.name}`,
          volume: this.getSettings().volume,
          muted: false,
          stationName: station.name,
          streamUrl: url,
          ready: false
        });
        this.playWithMpv(url, station.name, 'alsa,');
        await this.waitForReady(backend);
      }
    } else if (backend === 'ffplay') {
      this.playWithFfplay(url);
      await this.waitForReady(backend);
    } else if (backend === 'vlc') {
      this.playWithVlc(url);
      await this.waitForReady(backend);
    }

    this.setState({
      backend,
      state: 'playing',
      message: station.name,
      volume: this.getSettings().volume,
      muted: false,
      stationName: station.name,
      streamUrl: url,
      startedAt: new Date().toISOString(),
      ready: true
    });
    if (backend === 'mpv') {
      this.startMpvMetadataPolling();
    }
  }

  async togglePause(): Promise<PlaybackControlResult> {
    if (!this.process || !this.backend || !this.state.ready) {
      return {ok: false};
    }

    const unsupported = this.unsupportedFfplayControl();
    if (unsupported) {
      return unsupported;
    }

    if (this.backend === 'mpv') {
      if (this.state.state === 'paused') {
        return this.resumeMpvAtLiveEdge();
      }
      try {
        await this.sendMpv({command: ['cycle', 'pause']});
      } catch {
        return {ok: false, message: 'mpv did not acknowledge the pause command.'};
      }
      const synced = await this.syncMpvPlaybackState();
      if (synced) {
        return {ok: true};
      }
    } else if (this.backend === 'airplay') {
      this.setState({...this.state, message: 'AirPlay pause is not supported. Use :stop to end playback.'});
      return {ok: false, message: 'AirPlay pause is not supported. Use :stop to end playback.'};
    }

    this.setState({
      ...this.state,
      state: this.state.state === 'paused' ? 'playing' : 'paused'
    });
    return {ok: true};
  }

  async pause(): Promise<PlaybackControlResult> {
    if (this.state.state === 'paused') return {ok: true};
    if (this.state.state !== 'playing') return {ok: false, message: 'RadioCLI is not currently playing.'};
    return this.togglePause();
  }

  async resume(): Promise<PlaybackControlResult> {
    if (this.state.state === 'playing') return {ok: true};
    if (this.state.state !== 'paused') return {ok: false, message: 'RadioCLI has no paused station to resume.'};
    return this.togglePause();
  }

  private async resumeMpvAtLiveEdge(): Promise<PlaybackControlResult> {
    if (this.mpvLiveRetuneInFlight) return {ok: true, message: 'Reconnecting at the live broadcast.'};
    const url = this.state.streamUrl ? safeMediaTarget(this.state.streamUrl) : null;
    if (!url) return {ok: false, message: 'The paused station no longer has a usable stream URL.'};
    this.mpvLiveRetuneInFlight = true;
    try {
      // Reloading the same URL discards mpv's delayed live buffer and opens a
      // fresh stream connection. This keeps radio pause/play semantics at the
      // live edge instead of behaving like time-shifted on-demand audio.
      await this.sendMpv({command: ['loadfile', url, 'replace']});
      await this.sendMpv({command: ['set_property', 'pause', false]});
    } catch {
      return {ok: false, message: 'mpv could not reconnect the paused station at the live edge.'};
    } finally {
      this.mpvLiveRetuneInFlight = false;
    }
    this.currentMpvMediaTitle = cleanMediaTitle(this.state.stationName ?? '') ?? 'RadioCLI';
    this.emitMetadata({updatedAt: new Date().toISOString()});
    this.setState({...this.state, state: 'playing', ready: true, startedAt: new Date().toISOString()});
    return {ok: true, message: 'Reconnected at the live broadcast.'};
  }

  setVolume(volume: number): Promise<PlaybackControlResult> {
    const clamped = clampVolume(volume);
    const unsupported = this.unsupportedFfplayControl();
    if (unsupported) {
      return Promise.resolve(unsupported);
    }

    if (this.backend === 'mpv') {
      return this.queueMpvVolume(clamped);
    } else if (this.backend === 'airplay') {
      if (!this.sendAirPlayCommand({type: 'setVolume', volume: clamped})) {
        return Promise.resolve({ok: false, message: 'The AirPlay worker is not available.'});
      }
    }

    this.setState({...this.state, volume: clamped});
    return Promise.resolve({ok: true});
  }

  adjustVolume(delta: number): Promise<PlaybackControlResult> {
    return this.setVolume(this.state.volume + delta);
  }

  async toggleMute(): Promise<PlaybackControlResult> {
    const muted = !this.state.muted;
    const unsupported = this.unsupportedFfplayControl();
    if (unsupported) {
      return unsupported;
    }

    if (this.backend === 'mpv') {
      try {
        await this.sendMpv({command: ['set_property', 'mute', muted]});
      } catch {
        return {ok: false, message: 'mpv did not acknowledge the mute change.'};
      }
    } else if (this.backend === 'airplay') {
      if (!this.sendAirPlayCommand({type: 'setMuted', muted})) {
        return {ok: false, message: 'The AirPlay worker is not available.'};
      }
    }

    this.setState({...this.state, muted});
    return {ok: true};
  }

  async setMuted(muted: boolean): Promise<PlaybackControlResult> {
    const unsupported = this.unsupportedFfplayControl();
    if (unsupported) return this.state.muted === muted ? {ok: true} : unsupported;

    // mpv can inherit mute=yes from its configuration, so the controller's
    // startup default is not authoritative. Explicit setters must always reach
    // the backend even when the requested value matches our local state.
    if (this.backend === 'mpv') {
      try {
        await this.sendMpv({command: ['set_property', 'mute', muted]});
      } catch {
        return {ok: false, message: 'mpv did not acknowledge the mute change.'};
      }
    } else if (this.backend === 'airplay') {
      if (!this.sendAirPlayCommand({type: 'setMuted', muted})) {
        return {ok: false, message: 'The AirPlay worker is not available.'};
      }
    } else if (this.state.muted === muted) {
      return {ok: true};
    }

    this.setState({...this.state, muted});
    return {ok: true};
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    const operation = this.performStop();
    this.stopPromise = operation.finally(() => {
      this.stopPromise = null;
    });
    return this.stopPromise;
  }

  private async performStop(): Promise<void> {
    const child = this.process;
    const startupInProgress = this.state.state === 'loading' && !this.state.ready;
    this.stopMpvPolling();
    this.rejectPendingAirPlayReady(new Error('AirPlay playback stopped.'));
    this.rejectPendingAirPlayRetune(new Error('AirPlay playback stopped.'));
    if (this.backend === 'mpv' && !startupInProgress) {
      await this.sendMpv({command: ['quit']}).catch(() => undefined);
    } else if (this.backend === 'airplay') {
      this.sendAirPlayCommand({type: 'stop'});
      this.currentAirPlayDevice = null;
      this.currentAirPlayDeviceId = null;
      this.pendingAirPlayPasscode = null;
      this.airPlaySessionEstablished = false;
    }

    if (child && child.exitCode == null && !child.killed) {
      child.kill('SIGTERM');
      if (!(await waitForChildExit(child, 1200)) && child.exitCode === null) {
        child.kill('SIGKILL');
        await waitForChildExit(child, 500);
      }
    }

    if (this.process === child) {
      this.process = null;
    }
    this.cleanupIpc();
    this.setState({
      ...this.state,
      backend: this.backend ?? 'none',
      state: 'stopped',
      ready: false
    });
  }

  submitAirPlayPasscode(code: string): PlaybackControlResult {
    if (this.backend !== 'airplay') {
      return {ok: false, message: 'No active AirPlay playback is waiting for a code.'};
    }

    const trimmed = code.trim();
    if (!trimmed || Buffer.byteLength(trimmed, 'utf8') > 64 || /[\u0000-\u001F\u007F-\u009F]/.test(trimmed)) {
      const message = 'AirPlay code must be 1-64 printable characters.';
      this.setState({...this.state, message});
      return {ok: false, message};
    }

    if (!this.sendAirPlayCommand({type: 'passcode', code: trimmed})) {
      return {ok: false, message: 'No active AirPlay playback is waiting for a code.'};
    }

    this.pendingAirPlayPasscode = trimmed;
    const message = 'AirPlay code sent.';
    this.setState({...this.state, message});
    return {ok: true, message};
  }

  async refreshAirPlayDevices(): Promise<AirPlayDevice[]> {
    this.availableAirPlayDevices = await discoverAirPlayDevices({platform: this.runtime.platform});
    return [...this.availableAirPlayDevices];
  }

  detectedAirPlayDevices(): AirPlayDevice[] {
    return [...this.availableAirPlayDevices];
  }

  private selectBackend(): 'mpv' | 'ffplay' | 'vlc' | 'airplay' | null {
    const preferred = this.getSettings().preferredBackend;
    const backends = this.availableBackends ?? this.refreshDetectedBackends();
    if (preferred === 'mpv') {
      return backends.includes('mpv') ? 'mpv' : null;
    }

    if (preferred === 'ffplay') {
      return backends.includes('ffplay') ? 'ffplay' : null;
    }

    if (preferred === 'vlc') {
      return backends.includes('vlc') ? 'vlc' : null;
    }

    if (preferred === 'airplay') {
      return backends.includes('airplay') ? 'airplay' : null;
    }

    if (backends.includes('mpv')) {
      return 'mpv';
    }

    if (backends.includes('ffplay')) {
      return 'ffplay';
    }

    if (backends.includes('vlc')) {
      return 'vlc';
    }

    return null;
  }

  private playbackUnavailableMessage(): string {
    const preferred = this.getSettings().preferredBackend;
    if (preferred === 'airplay') {
      if (!isAirPlayPlatformSupported(this.runtime.platform)) {
        return airPlayMacOSOnlyMessage;
      }
      return `AirPlay is not ready on this install. Run radiocli doctor. ${airPlaySenderHealth().message}`;
    }

    if (preferred === 'mpv' || preferred === 'ffplay') {
      return `Preferred playback backend ${preferred} is unavailable. ${playbackBackendInstallHint()}`;
    }

    return `No playback backend found. ${playbackBackendInstallHint()}`;
  }

  private playWithMpv(url: string, initialTitle: string, recoveredAudioOutput?: string): void {
    this.playbackSessionId += 1;
    this.ipcPath = mpvIpcPath();
    this.mpvIpcClient = new MpvIpcClient(this.ipcPath);
    this.mpvSessionId += 1;
    this.confirmedMpvVolume = clampVolume(this.getSettings().volume);
    this.pendingMpvVolume = null;
    this.currentMpvMediaTitle = cleanMediaTitle(initialTitle) ?? 'RadioCLI';
    this.process = spawn(
      resolveCommand('mpv') ?? 'mpv',
      [
        '--no-video',
        '--msg-level=all=warn',
        '--force-window=no',
        ...(recoveredAudioOutput || this.runtime.env.RADIOCLI_MPV_AUDIO_OUTPUT
          ? [`--ao=${recoveredAudioOutput ?? this.runtime.env.RADIOCLI_MPV_AUDIO_OUTPUT}`]
          : []),
        `--force-media-title=${this.currentMpvMediaTitle}`,
        `--volume=${this.getSettings().volume}`,
        `--input-ipc-server=${this.ipcPath}`,
        url
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );
    this.wireProcess();
  }

  private playWithFfplay(url: string): void {
    this.playbackSessionId += 1;
    this.process = spawn(resolveCommand('ffplay') ?? 'ffplay', ['-nodisp', '-hide_banner', '-loglevel', 'error', '-volume', String(this.getSettings().volume), '-autoexit', url], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.wireProcess();
  }

  private playWithVlc(url: string): void {
    this.playbackSessionId += 1;
    // VLC ships a `cvlc` shim for headless playback; fall back to the main `vlc`
    // binary (resolved from app bundles when off PATH) with a dummy interface.
    const binary = resolveCommand('cvlc') ?? resolveCommand('vlc') ?? 'cvlc';
    const gain = (clampVolume(this.getSettings().volume) / 100).toFixed(2);
    this.process = spawn(
      binary,
      ['--intf', 'dummy', '--no-video', '--quiet', '--play-and-exit', `--gain=${gain}`, url],
      {stdio: ['pipe', 'pipe', 'pipe']}
    );
    this.wireProcess();
  }

  private canRetuneAirPlay(device: AirPlayDevice): boolean {
    return Boolean(
      this.backend === 'airplay' &&
      this.process &&
      !this.process.killed &&
      this.airPlaySessionEstablished &&
      this.currentAirPlayDeviceId === device.id
    );
  }

  private activeAirPlayDeviceForRetune(): AirPlayDevice | null {
    const preferred = this.getSettings().preferredAirPlayDevice;
    if (!this.currentAirPlayDevice || this.currentAirPlayDevice.id !== preferred || !this.canRetuneAirPlay(this.currentAirPlayDevice)) {
      return null;
    }

    return this.currentAirPlayDevice;
  }

  private retuneAirPlay(url: string, stationName: string, device: AirPlayDevice): Promise<void> {
    this.rejectPendingAirPlayRetune(new Error('AirPlay retune superseded.'));
    this.airPlayRetuning = true;
    this.setState({
      ...this.state,
      backend: 'airplay',
      state: 'loading',
      message: `Opening ${stationName}`,
      stationName,
      airPlayDeviceName: device.name,
      streamUrl: url,
      ready: false
    });

    if (!this.sendAirPlayCommand({type: 'retune', streamUrl: url, stationName})) {
      this.airPlayRetuning = false;
      throw new PlaybackOutputError('AirPlay session is not available for retuning.');
    }

    return new Promise((resolve, reject) => {
      const timeoutSeconds = this.airPlayTuneTimeoutSeconds();
      const timeout = setTimeout(() => {
        this.airPlayRetuneResolver = null;
        this.airPlayRetuneRejecter = null;
        this.airPlayRetuning = false;
        const error = new PlaybackOutputError(`Timed out while switching AirPlay stream after ${timeoutSeconds}s. The receiver is still connected — pick another station or :stop.`);
        // Keep the worker (and the paired receiver) alive so the next switch stays instant.
        this.setState({...this.state, backend: 'airplay', state: 'error', ready: false, message: error.message});
        reject(error);
      }, timeoutSeconds * 1000);

      this.airPlayRetuneResolver = () => {
        clearTimeout(timeout);
        this.airPlayRetuneResolver = null;
        this.airPlayRetuneRejecter = null;
        this.airPlayRetuning = false;
        this.setState({
          ...this.state,
          backend: 'airplay',
          state: 'playing',
          message: stationName,
          stationName,
          airPlayDeviceName: device.name,
          streamUrl: url,
          startedAt: new Date().toISOString(),
          ready: true
        });
        resolve();
      };
      this.airPlayRetuneRejecter = error => {
        clearTimeout(timeout);
        this.airPlayRetuneResolver = null;
        this.airPlayRetuneRejecter = null;
        this.airPlayRetuning = false;
        reject(error);
      };
    });
  }

  private async resolveAirPlayDevice(): Promise<AirPlayDevice> {
    const preferred = this.getSettings().preferredAirPlayDevice;
    if (!preferred) {
      throw new PlaybackOutputError('Choose an AirPlay receiver in Settings before tuning with AirPlay.');
    }

    const devices = await this.refreshAirPlayDevices();
    const device = devices.find(candidate => candidate.id === preferred);
    if (!device) {
      throw new PlaybackOutputError('Selected AirPlay receiver was not found. Refresh AirPlay receivers in Settings.');
    }
    if (device.local) {
      throw new PlaybackOutputError(`${device.name} is this Mac. Use Audio output: This device instead of AirPlay.`);
    }

    return device;
  }

  private playWithAirPlay(url: string, stationName: string, device: AirPlayDevice): Promise<'ready' | 'password-required'> {
    const workerPath = airPlayWorkerPath();
    const workerArgs = airPlayWorkerArgs(workerPath, encodeWorkerStart({
      streamUrl: url,
      ffmpegPath: resolveCommand('ffmpeg') ?? 'ffmpeg',
      stationName,
      volume: this.getSettings().volume,
      muted: false,
      device
    }));
    this.process = spawn(process.execPath, workerArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    this.wireAirPlayProcess();
    this.wireProcess();
    const child = this.process;

    return new Promise((resolve, reject) => {
      const timeoutSeconds = this.airPlayTuneTimeoutSeconds();
      const timeout = setTimeout(() => {
        this.airPlayReadyResolver = null;
        this.airPlayReadyRejecter = null;
        const error = new PlaybackOutputError(`Timed out while opening AirPlay stream after ${timeoutSeconds}s.`);
        this.stopAirPlayProcess(child);
        this.setState({...this.state, backend: 'airplay', state: 'error', ready: false, message: error.message});
        reject(error);
      }, timeoutSeconds * 1000);
      this.airPlayReadyResolver = result => {
        clearTimeout(timeout);
        this.airPlayReadyResolver = null;
        this.airPlayReadyRejecter = null;
        resolve(result);
      };
      this.airPlayReadyRejecter = error => {
        clearTimeout(timeout);
        this.airPlayReadyResolver = null;
        this.airPlayReadyRejecter = null;
        reject(error);
      };
    });
  }

  private wireAirPlayProcess(): void {
    const child = this.process;
    if (!child) {
      return;
    }

    child.stderr.on('data', () => {
      // node-airtunes2 is noisy during pairing; drain stderr so the worker cannot block.
    });

    let buffer = '';
    child.stdout.on('data', chunk => {
      buffer += chunk.toString('utf8');
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf('\n');
        const event = parseWorkerMessage<AirPlayWorkerEvent>(line);
        if (event) {
          this.handleAirPlayEvent(event);
        }
      }
    });
  }

  private airPlayTuneTimeoutSeconds(): number {
    const configured = this.getSettings().tuneTimeoutSeconds;
    return configured < 3 ? configured : Math.max(configured, minAirPlayTuneTimeoutSeconds);
  }

  private cachedAirPlayPasscode(): string | null {
    return this.currentAirPlayDeviceId ? this.airPlayPasscodes.get(this.currentAirPlayDeviceId) ?? null : null;
  }

  private rememberPendingAirPlayPasscode(): void {
    if (this.currentAirPlayDeviceId && this.pendingAirPlayPasscode) {
      this.airPlayPasscodes.set(this.currentAirPlayDeviceId, this.pendingAirPlayPasscode);
      this.pendingAirPlayPasscode = null;
    }
  }

  private handleAirPlayEvent(event: AirPlayWorkerEvent): void {
    if (event.type === 'ready' || event.type === 'playing') {
      if (this.airPlayRetuning) {
        return;
      }

      this.airPlaySessionEstablished = true;
      this.rememberPendingAirPlayPasscode();
      this.airPlayReadyResolver?.('ready');
      if (this.backend === 'airplay') {
        this.setState({...this.state, backend: 'airplay', state: 'playing', ready: true, message: this.state.stationName});
      }
    } else if (event.type === 'retuned') {
      if (this.airPlayRetuneResolver) {
        this.airPlayRetuneResolver();
      } else if (this.backend === 'airplay' && this.currentAirPlayDevice && this.state.state !== 'playing') {
        // A retune that already timed out on our side eventually caught up; reflect live playback.
        this.airPlayRetuning = false;
        this.airPlaySessionEstablished = true;
        this.setState({
          ...this.state,
          backend: 'airplay',
          state: 'playing',
          ready: true,
          message: this.state.stationName,
          startedAt: new Date().toISOString()
        });
      }
    } else if (event.type === 'password-required') {
      const passcode = this.cachedAirPlayPasscode();
      if (passcode) {
        this.pendingAirPlayPasscode = passcode;
        this.sendAirPlayCommand({type: 'passcode', code: passcode});
        this.setState({...this.state, backend: 'airplay', state: 'loading', ready: false, message: 'AirPlay code sent.'});
        return;
      }

      this.airPlayReadyResolver?.('password-required');
      this.setState({...this.state, backend: 'airplay', state: 'loading', ready: false, message: 'AirPlay code required. Use :airplay-code 1234.'});
    } else if (event.type === 'error') {
      this.pendingAirPlayPasscode = null;
      const error = new PlaybackOutputError(event.message);
      this.airPlayReadyRejecter?.(error);
      this.rejectPendingAirPlayRetune(error);
      this.setState({...this.state, backend: 'airplay', state: 'error', ready: false, message: event.message});
    }
  }

  private unsupportedFfplayControl(): PlaybackControlResult | null {
    if (this.backend === 'ffplay' && this.process) {
      return {ok: false, message: ffplayLimitedControlsMessage};
    }

    if (this.backend === 'vlc' && this.process) {
      return {ok: false, message: vlcLimitedControlsMessage};
    }

    return null;
  }

  private wireProcess(): void {
    const child = this.process;
    const backend = this.backend;
    if (!child || !backend) {
      return;
    }

    this.lastPlayerExit = null;
    let diagnostic = '';
    child.stdout.on('data', chunk => {
      diagnostic = appendPlayerDiagnostic(diagnostic, String(chunk));
    });
    child.stderr.on('data', chunk => {
      diagnostic = appendPlayerDiagnostic(diagnostic, String(chunk));
    });

    // Local players can write diagnostics indefinitely. Drain both pipes so a
    // full OS pipe buffer can never stall playback.
    child.stdout.resume?.();
    child.stderr.resume?.();

    child.on('error', error => {
      diagnostic = appendPlayerDiagnostic(diagnostic, error.message);
      if (this.process !== child) return;
      this.lastPlayerExit = {backend, code: null, signal: null, diagnostic, spawnError: true};
      this.rejectPendingAirPlayReady(error);
      this.rejectPendingAirPlayRetune(error);
      if (backend === 'airplay') {
        this.currentAirPlayDevice = null;
        this.currentAirPlayDeviceId = null;
        this.pendingAirPlayPasscode = null;
        this.airPlaySessionEstablished = false;
      }
      this.process = null;
      this.stopMpvPolling();
      this.cleanupIpc();
      this.setState({
        ...this.state,
        backend,
        state: 'error',
        message: error.message,
        ready: false
      });
    });

    child.on('exit', (code, signal) => {
      if (this.process === child) {
        this.lastPlayerExit = {backend, code, signal, diagnostic};
        this.rejectPendingAirPlayRetune(new Error('AirPlay worker exited.'));
        if (this.backend === 'airplay') {
          this.currentAirPlayDevice = null;
          this.currentAirPlayDeviceId = null;
          this.pendingAirPlayPasscode = null;
          this.airPlaySessionEstablished = false;
        }

        this.process = null;
        this.stopMpvPolling();
        this.cleanupIpc();
        this.setState({
          ...this.state,
          backend: this.backend ?? 'none',
          state: code === 0 || code === null ? 'stopped' : 'error',
          message: code === 0 || code === null ? undefined : `player exited with code ${code}`,
          ready: false
        });
      }
    });
  }

  private sendMpv(payload: unknown): Promise<void> {
    return this.queryMpv(payload).then(() => undefined);
  }

  private queueMpvVolume(volume: number): Promise<PlaybackControlResult> {
    this.pendingMpvVolume = volume;
    this.setState({...this.state, volume});
    if (this.mpvVolumeFlush) {
      return this.mpvVolumeFlush;
    }

    const sessionId = this.mpvSessionId;
    let trackedFlush: Promise<PlaybackControlResult>;
    trackedFlush = this.flushMpvVolume(sessionId).finally(() => {
      if (this.mpvVolumeFlush === trackedFlush) {
        this.mpvVolumeFlush = null;
      }
    });
    this.mpvVolumeFlush = trackedFlush;
    return trackedFlush;
  }

  private async flushMpvVolume(sessionId: number): Promise<PlaybackControlResult> {
    let lastError: unknown = null;
    while (sessionId === this.mpvSessionId && this.backend === 'mpv' && this.pendingMpvVolume !== null) {
      const target = this.pendingMpvVolume;
      this.pendingMpvVolume = null;
      try {
        await this.sendMpv({command: ['set_property', 'volume', target]});
        if (sessionId !== this.mpvSessionId) {
          lastError = new Error('mpv playback session changed.');
          break;
        }
        this.confirmedMpvVolume = target;
        lastError = null;
      } catch (error) {
        lastError = error;
        if (sessionId !== this.mpvSessionId) {
          break;
        }
        if (this.pendingMpvVolume === null) {
          if (this.state.volume === target) {
            this.setState({...this.state, volume: this.confirmedMpvVolume});
          }
          break;
        }
      }
    }

    return lastError
      ? {ok: false, message: 'mpv did not acknowledge the volume change.'}
      : {ok: true};
  }

  private sendAirPlayCommand(command: AirPlayWorkerCommand): boolean {
    if (this.backend === 'airplay' && this.process && !this.process.killed) {
      try {
        this.process.stdin.write(serializeWorkerMessage(command));
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  private stopAirPlayProcess(child: ChildProcessWithoutNullStreams | null): void {
    if (!child) {
      return;
    }

    if (!child.killed) {
      try {
        child.stdin.write(serializeWorkerMessage({type: 'stop'}));
      } catch {
        // The worker may already be exiting.
      }

      child.kill('SIGTERM');
    }

    if (this.process === child) {
      this.process = null;
    }
  }

  private rejectPendingAirPlayReady(error: Error): void {
    const rejecter = this.airPlayReadyRejecter;
    this.airPlayReadyResolver = null;
    this.airPlayReadyRejecter = null;
    rejecter?.(error);
  }

  private rejectPendingAirPlayRetune(error: Error): void {
    const rejecter = this.airPlayRetuneRejecter;
    this.airPlayRetuneResolver = null;
    this.airPlayRetuneRejecter = null;
    this.airPlayRetuning = false;
    rejecter?.(error);
  }

  private queryMpv<T = unknown>(payload: unknown): Promise<T | null> {
    if (!this.mpvIpcClient) {
      return Promise.resolve(null);
    }
    return this.mpvIpcClient.query<T>(payload);
  }

  private async waitForReady(backend: 'mpv' | 'ffplay' | 'vlc'): Promise<void> {
    const timeoutMs = this.getSettings().tuneTimeoutSeconds * 1000;
    const started = Date.now();
    const child = this.process;
    const playbackSessionId = this.playbackSessionId;
    const mpvClient = this.mpvIpcClient;
    const wasSuperseded = () => this.playbackSessionId !== playbackSessionId;
    const isCurrent = () => !wasSuperseded() && this.process === child;

    while (Date.now() - started < timeoutMs) {
      if (wasSuperseded()) {
        throw new Error(`${backend} playback request was superseded.`);
      }
      if (!child || this.process !== child) {
        throw this.playerExitedBeforeReady(backend);
      }

      if (backend === 'ffplay' || backend === 'vlc') {
        await waitForStartupWindow(
          () => this.process === child ? child : null,
          Math.min(500, timeoutMs),
          () => this.playerExitedBeforeReady(backend)
        );
        if (wasSuperseded()) throw new Error(`${backend} playback request was superseded.`);
        if (!isCurrent()) throw this.playerExitedBeforeReady(backend);
        return;
      }

      if (mpvClient) {
        try {
          await mpvClient.query({command: ['get_property', 'path']});
          if (await this.hasMpvAudioStarted(mpvClient) && isCurrent()) {
            return;
          }
        } catch {
          // The IPC socket can exist briefly before accepting commands.
        }
      }

      await delay(150);
    }

    if (wasSuperseded()) {
      throw new Error(`${backend} playback request was superseded.`);
    }
    if (this.process !== child) throw this.playerExitedBeforeReady(backend);
    await this.stop();
    throw new Error(`Timed out while opening stream after ${this.getSettings().tuneTimeoutSeconds}s.`);
  }

  private shouldRetryMpvWithAlsa(error: unknown): boolean {
    return this.runtime.platform === 'linux' &&
      (this.runtime.arch === 'arm' || this.runtime.arch === 'arm64') &&
      !this.runtime.env.RADIOCLI_MPV_AUDIO_OUTPUT &&
      isAudioOutputInitializationFailure(this.lastPlayerExit?.diagnostic ?? '') &&
      isPlaybackOutputError(error);
  }

  private playerExitedBeforeReady(backend: 'mpv' | 'ffplay' | 'vlc'): Error {
    const exit = this.lastPlayerExit?.backend === backend ? this.lastPlayerExit : null;
    const reason = exit
      ? exit.signal ? `signal ${exit.signal}` : exit.code === null ? 'without an exit code' : `code ${exit.code}`
      : 'before its exit status was available';
    const diagnostic = concisePlayerDiagnostic(exit?.diagnostic ?? '');
    const message = `${backend} exited before the stream became ready (${reason})${diagnostic ? `: ${diagnostic}` : '.'}`;
    return isBackendInitializationFailure(backend, exit, diagnostic)
      ? new PlaybackOutputError(message)
      : new Error(message);
  }

  private async hasMpvAudioStarted(client: MpvIpcClient): Promise<boolean> {
    const [timePos, audioPts] = await Promise.all([
      client.query<number>({command: ['get_property', 'time-pos']}).catch(() => null),
      client.query<number>({command: ['get_property', 'audio-pts']}).catch(() => null)
    ]);

    return typeof timePos === 'number' || typeof audioPts === 'number';
  }

  private startMpvMetadataPolling(): void {
    this.stopMpvPolling();
    this.metadataTimer = setInterval(() => {
      if (!this.metadataPollInFlight) void this.pollMpvMetadata();
    }, 2500);
    this.playbackStateTimer = setInterval(() => {
      if (!this.playbackStatePollInFlight) void this.syncMpvPlaybackState();
    }, 500);
    void this.pollMpvMetadata();
    void this.syncMpvPlaybackState();
  }

  private stopMpvPolling(): void {
    if (this.metadataTimer) {
      clearInterval(this.metadataTimer);
      this.metadataTimer = null;
    }

    if (this.playbackStateTimer) {
      clearInterval(this.playbackStateTimer);
      this.playbackStateTimer = null;
    }
  }

  private async pollMpvMetadata(): Promise<void> {
    if (this.backend !== 'mpv' || !this.process) {
      return;
    }

    this.metadataPollInFlight = true;
    try {
      const metadata = await this.queryMpv<Record<string, string>>({command: ['get_property', 'metadata']}).catch(() => null);
      const elapsed = await this.queryMpv<number>({command: ['get_property', 'time-pos']}).catch(() => null);
      if (typeof elapsed === 'number') {
        this.setState({...this.state, elapsedSeconds: Math.floor(elapsed)});
      }

      const title = extractMpvTitle(metadata);
      if (title) {
        await this.setMpvMediaTitle(title);
        this.emitMetadata({title, raw: JSON.stringify(metadata), updatedAt: new Date().toISOString()});
      }
    } finally {
      this.metadataPollInFlight = false;
    }
  }

  private async setMpvMediaTitle(title: string): Promise<void> {
    const cleaned = cleanMediaTitle(title);
    if (!cleaned || cleaned === this.currentMpvMediaTitle) {
      return;
    }

    this.currentMpvMediaTitle = cleaned;
    await this.sendMpv({command: ['set_property', 'force-media-title', cleaned]}).catch(() => undefined);
  }

  private async syncMpvPlaybackState(): Promise<boolean> {
    if (this.backend !== 'mpv' || !this.process || !this.state.ready) {
      return false;
    }

    if (this.playbackStatePollInFlight) return false;
    this.playbackStatePollInFlight = true;
    try {
      const paused = await this.queryMpv<boolean>({command: ['get_property', 'pause']}).catch(() => null);
      if (typeof paused !== 'boolean') {
        return false;
      }

      if (!paused && this.state.state === 'paused' && !this.mpvLiveRetuneInFlight) {
        return (await this.resumeMpvAtLiveEdge()).ok;
      }

      const state = paused ? 'paused' : 'playing';
      if (this.state.state !== state) {
        this.setState({...this.state, state});
      }

      return true;
    } finally {
      this.playbackStatePollInFlight = false;
    }
  }

  private emitMetadata(metadata: IcyNowPlaying): void {
    for (const listener of this.metadataListeners) {
      try {
        listener(metadata);
      } catch {
        // UI/storage listeners must not terminate the player polling loop.
      }
    }
  }

  private cleanupIpc(): void {
    this.mpvSessionId += 1;
    this.mpvIpcClient?.close();
    this.mpvIpcClient = null;
    this.pendingMpvVolume = null;
    this.mpvVolumeFlush = null;
    if (this.ipcPath && !isWindowsNamedPipePath(this.ipcPath) && existsSync(this.ipcPath)) {
      try {
        unlinkSync(this.ipcPath);
      } catch {
        // mpv may clean up the socket first.
      }
    }

    this.ipcPath = null;
    this.currentMpvMediaTitle = null;
  }

  private setState(state: PlaybackState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}

function airPlayWorkerPath(): string {
  const currentPath = fileURLToPath(import.meta.url);
  const extension = currentPath.endsWith('.ts') || currentPath.endsWith('.tsx') ? '.ts' : '.js';
  return join(dirname(currentPath), `airplay-worker${extension}`);
}

function airPlayWorkerArgs(workerPath: string, encodedStart: string): string[] {
  if (workerPath.endsWith('.ts')) {
    return ['--import', 'tsx', workerPath, encodedStart];
  }

  return [workerPath, encodedStart];
}

function isWindowsNamedPipePath(path: string): boolean {
  return path.startsWith('\\\\.\\pipe\\');
}

function clampVolume(volume: number): number {
  return Math.min(100, Math.max(0, Math.round(volume)));
}

function waitForChildExit(child: ChildProcessWithoutNullStreams, timeoutMs: number): Promise<boolean> {
  if (child.exitCode === undefined) {
    return Promise.resolve(true);
  }
  if (child.exitCode !== null) {
    return Promise.resolve(true);
  }

  return new Promise(resolve => {
    const onExit = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    const timeout = setTimeout(() => {
      child.off('exit', onExit);
      resolve(false);
    }, timeoutMs);
    child.once('exit', onExit);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function extractMpvTitle(metadata: Record<string, string> | null): string | undefined {
  if (!metadata) {
    return undefined;
  }

  const candidates = [
    metadata['icy-title'],
    metadata.StreamTitle,
    metadata.title,
    metadata.Title,
    metadata['icy-name'],
    metadata.Name
  ];

  for (const candidate of candidates) {
    const title = cleanMetadataTitle(candidate);
    if (title) {
      return title;
    }
  }

  return undefined;
}

async function waitForStartupWindow(
  getProcess: () => ChildProcessWithoutNullStreams | null,
  ms: number,
  exitedError: () => Error = () => new Error('Player exited before the stream became ready.')
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if (!getProcess()) {
      throw exitedError();
    }

    await delay(Math.min(100, ms - (Date.now() - started)));
  }
}

function appendPlayerDiagnostic(current: string, chunk: string): string {
  const combined = current + chunk;
  return combined.length <= maxPlayerDiagnosticCharacters
    ? combined
    : combined.slice(-maxPlayerDiagnosticCharacters);
}

function concisePlayerDiagnostic(value: string): string {
  const lines = value
    .split(/\r?\n/)
    .map(line => sanitizeTerminalText(line.replace(/https?:\/\/\S+/gi, '[stream URL]')))
    .filter((line): line is string => Boolean(line))
    .slice(-3)
    .join(' · ')
    .slice(0, 700);
  return lines;
}

function isAudioOutputInitializationFailure(value: string): boolean {
  return /audio output initialization failed|could not open\/initialize audio device|failed to initialize audio driver/i.test(value);
}

function isBackendInitializationFailure(
  backend: 'mpv' | 'ffplay' | 'vlc',
  exit: PlayerExit | null,
  diagnostic: string
): boolean {
  if (isAudioOutputInitializationFailure(diagnostic)) return true;
  if (exit?.spawnError) return true;
  if (/unknown (?:command line )?option|error initializing|failed to (?:create|connect to) .*(?:socket|pipe)/i.test(diagnostic)) return true;
  // mpv reserves status 1 for player initialization and invalid options. A
  // stream that could not be played uses status 2 and remains skippable.
  return backend === 'mpv' && exit?.code === 1;
}

function cleanMetadataTitle(value: string | undefined): string | undefined {
  const normalized = cleanMediaTitle(value);
  if (!normalized) {
    return undefined;
  }

  const fields = parseMetadataFields(normalized);
  if (fields.size > 0) {
    const title = firstField(fields, ['title', 'streamtitle', 'text', 'song', 'track', 'name']);
    const artist = firstField(fields, ['artist', 'artists', 'performer', 'albumartist']) ?? leadingMetadataPrefix(normalized);
    const album = firstField(fields, ['album']);

    if (artist && title) {
      return `${artist} - ${title}`;
    }

    return title ?? artist ?? album;
  }

  return stripIcyStreamTitleWrapper(normalized);
}

function parseMetadataFields(value: string): Map<string, string> {
  const fields = new Map<string, string>();
  const normalized = value.replace(/=\s*""([^",;][^,;]*?)"/g, '="$1"');
  const pattern = /(?:^|[\s,;])([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^;,]*?)(?=\s+[A-Za-z][A-Za-z0-9_-]*\s*=|[;,]|$))/g;
  for (const match of normalized.matchAll(pattern)) {
    const key = normalizeMetadataKey(match[1] ?? '');
    const rawValue = match[2] ?? match[3] ?? match[4] ?? '';
    const cleanedValue = cleanMediaTitle(rawValue.replace(/\\"/g, '"').replace(/\\'/g, "'"));
    if (key && cleanedValue && !fields.has(key)) {
      fields.set(key, cleanedValue);
    }
  }

  return fields;
}

function firstField(fields: Map<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = fields.get(key);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function normalizeMetadataKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function leadingMetadataPrefix(value: string): string | undefined {
  const firstFieldIndex = value.search(/[A-Za-z][A-Za-z0-9_-]*\s*=/);
  if (firstFieldIndex <= 0) {
    return undefined;
  }

  return cleanMediaTitle(value.slice(0, firstFieldIndex).replace(/[-–—:;,]\s*$/, ''));
}

function cleanMediaTitle(value: string | undefined): string | undefined {
  const cleaned = sanitizeTerminalText(value)?.replace(/^"+|"+$/g, '').trim();
  return cleaned || undefined;
}

function stripIcyStreamTitleWrapper(value: string): string | undefined {
  const wrapped = value.match(/^StreamTitle=['"]?([^'";]+)['"]?;?$/i);
  const title = wrapped?.[1] ?? value;
  return title.replace(/\s+/g, ' ').trim() || undefined;
}
