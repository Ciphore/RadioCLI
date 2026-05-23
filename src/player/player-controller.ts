import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {existsSync, unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Socket} from 'node:net';
import type {AppSettings, IcyNowPlaying, PlaybackDiagnostics, PlaybackState, Station} from '../types.js';
import {commandExists} from './command.js';

export type PlayerEvent = (state: PlaybackState) => void;
export type MetadataEvent = (metadata: IcyNowPlaying) => void;

export class PlayerController {
  private process: ChildProcessWithoutNullStreams | null = null;
  private backend: 'mpv' | 'ffplay' | null = null;
  private ipcPath: string | null = null;
  private metadataTimer: NodeJS.Timeout | null = null;
  private state: PlaybackState = {backend: 'none', state: 'idle', volume: 70, muted: false, ready: false};
  private listeners = new Set<PlayerEvent>();
  private metadataListeners = new Set<MetadataEvent>();

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
    return ['mpv', 'ffplay'].filter(commandExists);
  }

  async play(station: Station, url: string): Promise<void> {
    await this.stop();
    const backend = this.selectBackend();
    if (!backend) {
      throw new Error('No playback backend found. Install mpv or ffplay.');
    }

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
    backend === 'mpv' ? this.playWithMpv(url) : this.playWithFfplay(url);
    await this.waitForReady(backend);
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

  async togglePause(): Promise<void> {
    if (!this.process || !this.backend) {
      return;
    }

    if (this.backend === 'mpv') {
      await this.sendMpv({command: ['cycle', 'pause']}).catch(() => undefined);
    } else {
      this.process.stdin.write('p');
    }

    this.setState({
      ...this.state,
      state: this.state.state === 'paused' ? 'playing' : 'paused'
    });
  }

  async setVolume(volume: number): Promise<void> {
    const clamped = clampVolume(volume);
    if (this.backend === 'mpv') {
      await this.sendMpv({command: ['set_property', 'volume', clamped]}).catch(() => undefined);
    } else if (this.backend === 'ffplay' && this.process) {
      const delta = clamped - this.state.volume;
      const key = delta > 0 ? '0' : '9';
      const steps = Math.min(10, Math.ceil(Math.abs(delta) / 5));
      for (let index = 0; index < steps; index += 1) {
        this.process.stdin.write(key);
      }
    }

    this.setState({...this.state, volume: clamped});
  }

  async adjustVolume(delta: number): Promise<void> {
    await this.setVolume(this.state.volume + delta);
  }

  async toggleMute(): Promise<void> {
    const muted = !this.state.muted;
    if (this.backend === 'mpv') {
      await this.sendMpv({command: ['set_property', 'mute', muted]}).catch(() => undefined);
    } else if (this.backend === 'ffplay' && this.process) {
      this.process.stdin.write('m');
    }

    this.setState({...this.state, muted});
  }

  async stop(): Promise<void> {
    this.stopMetadataPolling();
    if (this.backend === 'mpv') {
      await this.sendMpv({command: ['quit']}).catch(() => undefined);
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

  private selectBackend(): 'mpv' | 'ffplay' | null {
    const preferred = this.getSettings().preferredBackend;
    if (preferred === 'mpv') {
      return commandExists('mpv') ? 'mpv' : null;
    }

    if (preferred === 'ffplay') {
      return commandExists('ffplay') ? 'ffplay' : null;
    }

    if (commandExists('mpv')) {
      return 'mpv';
    }

    if (commandExists('ffplay')) {
      return 'ffplay';
    }

    return null;
  }

  private playWithMpv(url: string): void {
    this.ipcPath = join(tmpdir(), `radio-atlas-${process.pid}-${Date.now()}.sock`);
    this.process = spawn(
      'mpv',
      [
        '--no-video',
        '--really-quiet',
        '--force-window=no',
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
        this.process = null;
        this.stopMetadataPolling();
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

  private queryMpv<T = unknown>(payload: unknown): Promise<T | null> {
    if (!this.ipcPath) {
      return Promise.resolve(null);
    }

    return new Promise((resolve, reject) => {
      const socket = new Socket();
      let buffer = '';
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error('mpv IPC timed out.'));
      }, 1000);
      socket.once('error', error => {
        clearTimeout(timeout);
        reject(error);
      });
      socket.on('data', chunk => {
        buffer += chunk.toString('utf8');
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex === -1) {
          return;
        }

        const line = buffer.slice(0, newlineIndex);
        clearTimeout(timeout);
        socket.end();
        try {
          const parsed = JSON.parse(line) as {data?: T};
          resolve(parsed.data ?? null);
        } catch {
          resolve(null);
        }
      });
      socket.connect(this.ipcPath!, () => {
        socket.write(`${JSON.stringify(payload)}\n`, error => {
          if (error) {
            socket.end();
            reject(error);
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
        await delay(500);
        return;
      }

      if (this.ipcPath && existsSync(this.ipcPath)) {
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
    this.stopMetadataPolling();
    this.metadataTimer = setInterval(() => {
      void this.pollMpvMetadata();
    }, 2500);
    void this.pollMpvMetadata();
  }

  private stopMetadataPolling(): void {
    if (this.metadataTimer) {
      clearInterval(this.metadataTimer);
      this.metadataTimer = null;
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
      this.emitMetadata({title, raw: JSON.stringify(metadata), updatedAt: new Date().toISOString()});
    }
  }

  private emitMetadata(metadata: IcyNowPlaying): void {
    for (const listener of this.metadataListeners) {
      listener(metadata);
    }
  }

  private cleanupIpc(): void {
    if (this.ipcPath && existsSync(this.ipcPath)) {
      try {
        unlinkSync(this.ipcPath);
      } catch {
        // mpv may clean up the socket first.
      }
    }

    this.ipcPath = null;
  }

  private setState(state: PlaybackState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}

function clampVolume(volume: number): number {
  return Math.min(100, Math.max(0, Math.round(volume)));
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractMpvTitle(metadata: Record<string, string> | null): string | undefined {
  if (!metadata) {
    return undefined;
  }

  const title =
    metadata['icy-title'] ??
    metadata.StreamTitle ??
    metadata.title ??
    metadata.Title ??
    metadata['icy-name'] ??
    metadata.Name;
  return title?.replace(/\s+/g, ' ').trim() || undefined;
}
