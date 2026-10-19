import {Socket} from 'node:net';

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

type MpvResponse = {
  request_id?: number;
  error?: string;
  data?: unknown;
};
export type MpvEvent = {event: string; name?: string; id?: number; data?: unknown; reason?: string; error?: string};

/**
 * Multiplexes mpv JSON IPC requests over one reusable socket.
 *
 * mpv may also emit unsolicited event objects on this connection; responses
 * are therefore matched strictly by request_id. A dropped connection rejects
 * every in-flight request, while the next query reconnects lazily.
 */
export class MpvIpcClient {
  private socket: Socket | null = null;
  private connectingSocket: Socket | null = null;
  private connecting: Promise<Socket> | null = null;
  private pending = new Map<number, PendingRequest>();
  private buffer = '';
  private bufferBytes = 0;
  private bufferScanFrom = 0;
  private nextRequestId = 1;
  private closed = false;
  private connectedOnce = false;
  private readonly observers = new Map<number, string>();
  private readonly eventListeners = new Set<(event: MpvEvent) => void>();

  constructor(
    private readonly path: string,
    private readonly timeoutMs = 1000
  ) {}

  onEvent(listener: (event: MpvEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  async observe(id: number, property: string): Promise<void> {
    this.observers.set(id, property);
    await this.query({command: ['observe_property', id, property]});
  }

  async query<T = unknown>(payload: unknown): Promise<T | null> {
    if (this.closed) {
      throw new Error('mpv IPC client is closed.');
    }

    const socket = await this.connect();
    const requestId = this.allocateRequestId();
    const requestPayload = attachMpvRequestId(payload, requestId);
    const message = `${JSON.stringify(requestPayload)}\n`;

    return new Promise<T | null>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.settleRequest(requestId, pending => pending.reject(new Error('mpv IPC timed out.')));
      }, this.timeoutMs);
      this.pending.set(requestId, {
        resolve: value => resolve((value ?? null) as T | null),
        reject,
        timeout
      });

      try {
        socket.write(message, error => {
          if (error) {
            this.settleRequest(requestId, pending => pending.reject(error));
          }
        });
      } catch (error) {
        this.settleRequest(requestId, pending => pending.reject(error instanceof Error ? error : new Error('mpv IPC write failed.')));
      }
    });
  }

  close(reason = new Error('mpv IPC connection closed.')): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.eventListeners.clear();
    this.observers.clear();
    this.rejectPending(reason);
    this.socket?.destroy();
    this.connectingSocket?.destroy();
    this.socket = null;
    this.connectingSocket = null;
    this.connecting = null;
    this.buffer = '';
    this.bufferBytes = 0;
    this.bufferScanFrom = 0;
  }

  private connect(): Promise<Socket> {
    if (this.socket && !this.socket.destroyed) {
      return Promise.resolve(this.socket);
    }
    if (this.connecting) {
      return this.connecting;
    }

    const socket = new Socket();
    this.connectingSocket = socket;
    const connecting = new Promise<Socket>((resolve, reject) => {
      let settled = false;
      const connectionTimeout = setTimeout(() => failConnection(new Error('mpv IPC connection timed out.')), this.timeoutMs);
      const closeBeforeConnection = (): void => failConnection(new Error('mpv IPC connection closed before it was ready.'));
      const failConnection = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(connectionTimeout);
        socket.off('connect', finishConnection);
        socket.off('close', closeBeforeConnection);
        socket.destroy();
        reject(error);
      };
      const finishConnection = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(connectionTimeout);
        socket.off('error', failConnection);
        socket.off('close', closeBeforeConnection);
        if (this.closed) {
          socket.destroy();
          reject(new Error('mpv IPC client is closed.'));
          return;
        }

        this.socket = socket;
        this.connectingSocket = null;
        this.buffer = '';
        this.bufferBytes = 0;
        this.bufferScanFrom = 0;
        socket.setEncoding('utf8');
        socket.on('data', chunk => { if (this.socket === socket) this.consume(String(chunk)); });
        socket.on('error', error => this.dropSocket(socket, error));
        socket.on('close', () => this.dropSocket(socket, new Error('mpv IPC connection closed.')));
        resolve(socket);
        if (this.connectedOnce) {
          for (const [id, property] of this.observers) void this.query({command: ['observe_property', id, property]}).catch(() => undefined);
        }
        this.connectedOnce = true;
      };

      socket.once('error', failConnection);
      socket.once('close', closeBeforeConnection);
      socket.once('connect', finishConnection);
      socket.connect(this.path);
    });

    let trackedConnection: Promise<Socket>;
    trackedConnection = connecting.finally(() => {
      if (this.connecting === trackedConnection) {
        this.connecting = null;
      }
      if (this.connectingSocket === socket && !this.socket) {
        this.connectingSocket = null;
      }
    });
    this.connecting = trackedConnection;
    return trackedConnection;
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    this.bufferBytes += Buffer.byteLength(chunk);
    if (this.bufferBytes > 4 * 1024 * 1024) {
      const socket = this.socket;
      if (socket) {
        this.dropSocket(socket, new Error('mpv IPC message exceeds 4 MiB.'));
        socket.destroy();
      }
      return;
    }
    let newlineIndex = this.buffer.indexOf('\n', this.bufferScanFrom);
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      this.bufferBytes -= Buffer.byteLength(line) + 1;
      newlineIndex = this.buffer.indexOf('\n');
      if (!line.trim()) {
        continue;
      }

      let response: MpvResponse;
      try {
        response = JSON.parse(line) as MpvResponse;
      } catch {
        continue;
      }
      if (!response || typeof response !== 'object' || Array.isArray(response)) continue;

      if (typeof response.request_id !== 'number' || !this.pending.has(response.request_id)) {
        const event = response as MpvResponse & Partial<MpvEvent>;
        if (typeof event.event === 'string') {
          for (const listener of this.eventListeners) { try { listener(event as MpvEvent); } catch { /* Isolate event consumers. */ } }
        }
        continue;
      }
      if (response.error && response.error !== 'success') {
        this.settleRequest(response.request_id, pending => pending.reject(new Error(`mpv IPC failed: ${response.error}`)));
      } else {
        this.settleRequest(response.request_id, pending => pending.resolve(response.data));
      }
    }
    this.bufferScanFrom = this.buffer.length;
  }

  private dropSocket(socket: Socket, error: Error): void {
    if (this.socket !== socket) {
      return;
    }

    this.socket = null;
    this.buffer = '';
    this.bufferBytes = 0;
    this.bufferScanFrom = 0;
    this.rejectPending(error);
  }

  private rejectPending(error: Error): void {
    for (const requestId of [...this.pending.keys()]) {
      this.settleRequest(requestId, pending => pending.reject(error));
    }
  }

  private settleRequest(requestId: number, settle: (pending: PendingRequest) => void): void {
    const pending = this.pending.get(requestId);
    if (!pending) {
      return;
    }

    this.pending.delete(requestId);
    clearTimeout(pending.timeout);
    settle(pending);
  }

  private allocateRequestId(): number {
    while (this.pending.has(this.nextRequestId)) {
      this.nextRequestId = incrementRequestId(this.nextRequestId);
    }
    const requestId = this.nextRequestId;
    this.nextRequestId = incrementRequestId(this.nextRequestId);
    return requestId;
  }
}

function attachMpvRequestId(payload: unknown, requestId: number): unknown {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {...payload, request_id: requestId};
  }

  return {command: payload, request_id: requestId};
}

function incrementRequestId(requestId: number): number {
  return requestId >= Number.MAX_SAFE_INTEGER ? 1 : requestId + 1;
}
