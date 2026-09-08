import {existsSync, unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer, type Server, type Socket} from 'node:net';
import {afterEach, describe, expect, it} from 'vitest';
import {MpvIpcClient} from './mpv-ipc-client.js';

const cleanupTasks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanupTasks.splice(0).map(cleanup => cleanup()));
});

describe('MpvIpcClient', () => {
  it('preserves UTF-8 metadata across native socket packets', async () => {
    const path = testIpcPath();
    const sockets = new Set<Socket>();
    const server = createServer(socket => {
      sockets.add(socket);
      socket.on('error', () => undefined);
      socket.once('data', request => {
        const {request_id} = JSON.parse(String(request)) as {request_id: number};
        const response = Buffer.from(`${JSON.stringify({request_id, error: 'success', data: '日本 Café'})}\n`);
        const cut = response.indexOf(Buffer.from('日')) + 1;
        socket.write(response.subarray(0, cut));
        setTimeout(() => { if (!socket.destroyed) socket.write(response.subarray(cut)); }, 20);
      });
    });
    await listen(server, path);
    const client = new MpvIpcClient(path, 500);
    cleanupTasks.push(() => closeTestIpc(client, server, sockets, path));
    await expect(client.query({command: ['get_property', 'media-title']})).resolves.toBe('日本 Café');
  });

  it('multiplexes concurrent requests over one socket and reconnects after a drop', async () => {
    const path = testIpcPath();
    const sockets = new Set<Socket>();
    let connectionCount = 0;
    const server = createServer(socket => {
      connectionCount += 1;
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      socket.on('error', () => undefined);
      let buffer = '';
      socket.on('data', chunk => {
        buffer += chunk.toString('utf8');
        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf('\n');
          const request = JSON.parse(line) as {request_id: number; command: [string, string, number?]};
          const delayMs = request.command[2] ?? 0;
          setTimeout(() => {
            if (!socket.destroyed) {
              socket.write(`${JSON.stringify({request_id: request.request_id, error: 'success', data: request.command[1]})}\n`);
            }
          }, delayMs);
        }
      });
    });
    await listen(server, path);
    const client = new MpvIpcClient(path, 500);
    cleanupTasks.push(() => closeTestIpc(client, server, sockets, path));

    const slow = client.query<string>({command: ['echo', 'slow', 30]});
    const fast = client.query<string>({command: ['echo', 'fast', 0]});

    await expect(Promise.all([slow, fast])).resolves.toEqual(['slow', 'fast']);
    expect(connectionCount).toBe(1);

    for (const socket of sockets) {
      socket.destroy();
    }
    await waitUntil(() => sockets.size === 0);

    await expect(client.query<string>({command: ['echo', 'reconnected']})).resolves.toBe('reconnected');
    expect(connectionCount).toBe(2);
  });
});

function testIpcPath(): string {
  const id = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return process.platform === 'win32' ? `\\\\.\\pipe\\radiocli-test-${id}` : join(tmpdir(), `radiocli-test-${id}.sock`);
}

function listen(server: Server, path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(path, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

async function closeTestIpc(client: MpvIpcClient, server: Server, sockets: Set<Socket>, path: string): Promise<void> {
  client.close();
  for (const socket of sockets) {
    socket.destroy();
  }
  await new Promise<void>(resolve => server.close(() => resolve()));
  if (process.platform !== 'win32' && existsSync(path)) {
    unlinkSync(path);
  }
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < 500) {
    if (predicate()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Timed out waiting for IPC state.');
}
