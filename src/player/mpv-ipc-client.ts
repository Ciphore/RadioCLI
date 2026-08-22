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
  private nextRequestId = 1;
  private closed = false;

  constructor(
    private readonly path: string,
    private readonly timeoutMs = 1000
  ) {}

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
    this.rejectPending(reason);
    this.socket?.destroy();
    this.connectingSocket?.destroy();
    this.socket = null;
    this.connectingSocket = null;
    this.connecting = null;
    this.buffer = '';
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
        socket.on('data', chunk => this.consume(chunk.toString('utf8')));
        socket.on('error', error => this.dropSocket(socket, error));
        socket.on('close', () => this.dropSocket(socket, new Error('mpv IPC connection closed.')));
        resolve(socket);
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
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
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

      if (typeof response.request_id !== 'number' || !this.pending.has(response.request_id)) {
        continue;
      }
      if (response.error && response.error !== 'success') {
        this.settleRequest(response.request_id, pending => pending.reject(new Error(`mpv IPC failed: ${response.error}`)));
      } else {
        this.settleRequest(response.request_id, pending => pending.resolve(response.data));
      }
    }
  }

  private dropSocket(socket: Socket, error: Error): void {
    if (this.socket !== socket) {
      return;
    }

    this.socket = null;
    this.buffer = '';
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
