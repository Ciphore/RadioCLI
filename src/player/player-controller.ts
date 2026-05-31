import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {existsSync, unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Socket} from 'node:net';
import type {AirPlayDevice, AppSettings, IcyNowPlaying, PlaybackDiagnostics, PlaybackState, Station} from '../types.js';
import {detectPlaybackBackends, ffplayLimitedControlsMessage, playbackBackendInstallHint} from './backend-install.js';
import {discoverAirPlayDevices} from './airplay-discovery.js';
import {airPlaySenderHealth} from './airplay-sender-health.js';
import {encodeWorkerStart, parseWorkerMessage, serializeWorkerMessage, type AirPlayWorkerCommand, type AirPlayWorkerEvent} from './airplay-worker-protocol.js';

export type PlayerEvent = (state: PlaybackState) => void;
export type MetadataEvent = (metadata: IcyNowPlaying) => void;
export type PlaybackControlResult = {
  ok: boolean;
  message?: string;
};

const minAirPlayTuneTimeoutSeconds = 30;

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
  private backend: 'mpv' | 'ffplay' | 'airplay' | null = null;
  private ipcPath: string | null = null;
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
  private nextMpvRequestId = 1;
  private currentMpvMediaTitle: string | null = null;

  constructor(private readonly getSettings: () => AppSettings) {}

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
    this.availableBackends = detectPlaybackBackends();
    return this.detectedBackends();
  }

  async play(station: Station, url: string): Promise<void> {
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
      await this.waitForReady(backend);
    } else if (backend === 'ffplay') {
      this.playWithFfplay(url);
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
      await this.sendMpv({command: ['cycle', 'pause']}).catch(() => undefined);
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

  async setVolume(volume: number): Promise<PlaybackControlResult> {
    const clamped = clampVolume(volume);
    const unsupported = this.unsupportedFfplayControl();
    if (unsupported) {
      return unsupported;
    }

    if (this.backend === 'mpv') {
      await this.sendMpv({command: ['set_property', 'volume', clamped]}).catch(() => undefined);
    } else if (this.backend === 'airplay') {
      this.sendAirPlayCommand({type: 'setVolume', volume: clamped});
    }

    this.setState({...this.state, volume: clamped});
    return {ok: true};
  }

  async adjustVolume(delta: number): Promise<PlaybackControlResult> {
    return this.setVolume(this.state.volume + delta);
  }

  async toggleMute(): Promise<PlaybackControlResult> {
    const muted = !this.state.muted;
    const unsupported = this.unsupportedFfplayControl();
    if (unsupported) {
      return unsupported;
    }

    if (this.backend === 'mpv') {
      await this.sendMpv({command: ['set_property', 'mute', muted]}).catch(() => undefined);
    } else if (this.backend === 'airplay') {
      this.sendAirPlayCommand({type: 'setMuted', muted});
    }

    this.setState({...this.state, muted});
    return {ok: true};
  }

  async stop(): Promise<void> {
    this.stopMpvPolling();
    this.rejectPendingAirPlayReady(new Error('AirPlay playback stopped.'));
    this.rejectPendingAirPlayRetune(new Error('AirPlay playback stopped.'));
    if (this.backend === 'mpv') {
      await this.sendMpv({command: ['quit']}).catch(() => undefined);
    } else if (this.backend === 'airplay') {
      this.sendAirPlayCommand({type: 'stop'});
      this.currentAirPlayDevice = null;
      this.currentAirPlayDeviceId = null;
      this.pendingAirPlayPasscode = null;
      this.airPlaySessionEstablished = false;
    }

    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');
    }

    this.process = null;
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
    this.availableAirPlayDevices = await discoverAirPlayDevices();
    return [...this.availableAirPlayDevices];
  }

  detectedAirPlayDevices(): AirPlayDevice[] {
    return [...this.availableAirPlayDevices];
  }

  private selectBackend(): 'mpv' | 'ffplay' | 'airplay' | null {
    const preferred = this.getSettings().preferredBackend;
    const backends = this.availableBackends ?? this.refreshDetectedBackends();
    if (preferred === 'mpv') {
      return backends.includes('mpv') ? 'mpv' : null;
    }

    if (preferred === 'ffplay') {
      return backends.includes('ffplay') ? 'ffplay' : null;
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

    return null;
  }

  private playbackUnavailableMessage(): string {
    const preferred = this.getSettings().preferredBackend;
    if (preferred === 'airplay') {
      return `AirPlay is not ready on this install. Run radiocli doctor. ${airPlaySenderHealth().message}`;
    }

    if (preferred === 'mpv' || preferred === 'ffplay') {
      return `Preferred playback backend ${preferred} is unavailable. ${playbackBackendInstallHint()}`;
    }

    return `No playback backend found. ${playbackBackendInstallHint()}`;
  }

  private playWithMpv(url: string, initialTitle: string): void {
    this.ipcPath = createMpvIpcPath();
    this.currentMpvMediaTitle = cleanMediaTitle(initialTitle) ?? 'RadioCLI';
    this.process = spawn(
      'mpv',
      [
        '--no-video',
        '--really-quiet',
        '--force-window=no',
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
    this.process = spawn('ffplay', ['-nodisp', '-hide_banner', '-loglevel', 'error', '-volume', String(this.getSettings().volume), '-autoexit', url], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
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

    return null;
  }

  private wireProcess(): void {
    const child = this.process;
    if (!child) {
      return;
    }

    child.on('error', error => {
      this.setState({
        ...this.state,
        backend: this.backend ?? 'none',
        state: 'error',
        message: error.message,
        ready: false
      });
    });

    child.on('exit', code => {
      if (this.process === child) {
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
    if (!this.ipcPath) {
      return Promise.resolve(null);
    }

    return new Promise((resolve, reject) => {
      const socket = new Socket();
      let buffer = '';
      let settled = false;
      const requestId = this.nextMpvRequestId;
      this.nextMpvRequestId = this.nextMpvRequestId >= Number.MAX_SAFE_INTEGER ? 1 : this.nextMpvRequestId + 1;
      const requestPayload = attachMpvRequestId(payload, requestId);
      const settle = (callback: () => void): void => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(timeout);
        socket.end();
        callback();
      };
      const timeout = setTimeout(() => {
        socket.destroy();
        settle(() => reject(new Error('mpv IPC timed out.')));
      }, 1000);
      socket.once('error', error => {
        settle(() => reject(error));
      });
      socket.on('data', chunk => {
        buffer += chunk.toString('utf8');
        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf('\n');
          if (!line.trim()) {
            continue;
          }

          try {
            const parsed = JSON.parse(line) as {request_id?: number; error?: string; data?: T};
            if (parsed.request_id !== requestId) {
              continue;
            }

            if (parsed.error && parsed.error !== 'success') {
              settle(() => reject(new Error(`mpv IPC failed: ${parsed.error}`)));
            } else {
              settle(() => resolve(parsed.data ?? null));
            }
          } catch {
            settle(() => resolve(null));
          }
        }
      });
      socket.connect(this.ipcPath!, () => {
        socket.write(`${JSON.stringify(requestPayload)}\n`, error => {
          if (error) {
            settle(() => reject(error));
          }
        });
      });
    });
  }

  private async waitForReady(backend: 'mpv' | 'ffplay'): Promise<void> {
    const timeoutMs = this.getSettings().tuneTimeoutSeconds * 1000;
    const started = Date.now();

    while (Date.now() - started < timeoutMs) {
      if (!this.process) {
        throw new Error('Player exited before the stream became ready.');
      }

      if (backend === 'ffplay') {
        await waitForStartupWindow(() => this.process, Math.min(500, timeoutMs));
        return;
      }

      if (this.ipcPath) {
        try {
          await this.queryMpv({command: ['get_property', 'path']});
          return;
        } catch {
          // The IPC socket can exist briefly before accepting commands.
        }
      }

      await delay(150);
    }

    await this.stop();
    throw new Error(`Timed out while opening stream after ${this.getSettings().tuneTimeoutSeconds}s.`);
  }

  private startMpvMetadataPolling(): void {
    this.stopMpvPolling();
    this.metadataTimer = setInterval(() => {
      void this.pollMpvMetadata();
    }, 2500);
    this.playbackStateTimer = setInterval(() => {
      void this.syncMpvPlaybackState();
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

    const paused = await this.queryMpv<boolean>({command: ['get_property', 'pause']}).catch(() => null);
    if (typeof paused !== 'boolean') {
      return false;
    }

    const state = paused ? 'paused' : 'playing';
    if (this.state.state !== state) {
      this.setState({...this.state, state});
    }

    return true;
  }

  private emitMetadata(metadata: IcyNowPlaying): void {
    for (const listener of this.metadataListeners) {
      listener(metadata);
    }
  }

  private cleanupIpc(): void {
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

export function createMpvIpcPath(
  platform: NodeJS.Platform = process.platform,
  pid = process.pid,
  timestamp = Date.now()
): string {
  if (platform === 'win32') {
    return `\\\\.\\pipe\\radiocli-${pid}-${timestamp}`;
  }

  return join(tmpdir(), `radiocli-${pid}-${timestamp}.sock`);
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

function attachMpvRequestId(payload: unknown, requestId: number): unknown {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {...payload, request_id: requestId};
  }

  return {command: payload, request_id: requestId};
}

async function waitForStartupWindow(getProcess: () => ChildProcessWithoutNullStreams | null, ms: number): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if (!getProcess()) {
      throw new Error('Player exited before the stream became ready.');
    }

    await delay(Math.min(100, ms - (Date.now() - started)));
  }
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
  const cleaned = value?.replace(/\s+/g, ' ').trim().replace(/^"+|"+$/g, '').trim();
  return cleaned || undefined;
}

function stripIcyStreamTitleWrapper(value: string): string | undefined {
  const wrapped = value.match(/^StreamTitle=['"]?([^'";]+)['"]?;?$/i);
  const title = wrapped?.[1] ?? value;
  return title.replace(/\s+/g, ' ').trim() || undefined;
}
