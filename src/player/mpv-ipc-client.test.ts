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
  it('delivers observed events without consuming replies and restores subscriptions on reconnect', async () => {
    const path = testIpcPath(); const sockets = new Set<Socket>(); const observations: unknown[][] = [];
    const server = createServer(socket => {
      sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => undefined);
      let buffer = '';
      socket.on('data', chunk => {
        buffer += String(chunk);
        while (buffer.includes('\n')) {
          const newline = buffer.indexOf('\n'); const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          const request = JSON.parse(line) as {request_id: number; command: unknown[]};
          if (request.command[0] === 'disconnect') { socket.destroy(); return; }
          if (request.command[0] === 'observe_property') {
            observations.push(request.command);
            socket.write(`null\n[]\n${JSON.stringify({event: 'property-change', id: 1, name: 'pause', data: true})}\n`);
          }
          socket.write(`${JSON.stringify({request_id: request.request_id, error: 'success', data: 'ack'})}\n`);
        }
      });
    });
    await listen(server, path); const client = new MpvIpcClient(path, 500);
    cleanupTasks.push(() => closeTestIpc(client, server, sockets, path));
    const events: unknown[] = []; client.onEvent(() => { throw new Error('consumer failed'); }); client.onEvent(event => events.push(event));
    await client.observe(1, 'pause');
    expect(events).toEqual([{event: 'property-change', id: 1, name: 'pause', data: true}]);
    // A server-side close does not establish that the client has received EOF.
    await expect(client.query({command: ['disconnect']})).rejects.toThrow('mpv IPC connection closed.');
    await waitUntil(() => sockets.size === 0);
    await expect(client.query({command: ['get_property', 'path']})).resolves.toBe('ack');
    await waitUntil(() => observations.length === 2 && events.length === 2);
    expect(observations).toEqual([['observe_property', 1, 'pause'], ['observe_property', 1, 'pause']]);
  });

  it('bounds an unterminated IPC message and rejects pending work before reconnecting', async () => {
    const path = testIpcPath(); const sockets = new Set<Socket>(); let connections = 0;
    const server = createServer(socket => {
      const first = ++connections === 1;
      sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => undefined);
      socket.once('data', request => {
        if (first) { socket.write('x'.repeat(4 * 1024 * 1024 + 1)); return; }
        const {request_id} = JSON.parse(String(request)) as {request_id: number};
        socket.write(`${JSON.stringify({request_id, error: 'success', data: 'reconnected'})}\n`);
      });
    });
    await listen(server, path); const client = new MpvIpcClient(path, 5000);
    cleanupTasks.push(() => closeTestIpc(client, server, sockets, path));
    await expect(client.query({command: ['get_property', 'path']})).rejects.toThrow('4 MiB');
    await expect(client.query({command: ['get_property', 'path']})).resolves.toBe('reconnected');
  }, 10_000);

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
          if (request.command[0] === 'disconnect') { socket.destroy(); return; }
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

    await expect(client.query({command: ['disconnect']})).rejects.toThrow('mpv IPC connection closed.');
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
