import {createServer, type Server} from 'node:net';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {isLoopbackHost, listenLoopback} from './loopback.js';

const servers: Server[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

describe('private loopback listeners', () => {
  it('accepts only the two literal loopback addresses', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    for (const host of ['localhost', '0.0.0.0', '::', '127.0.0.2', '[::1]', '::ffff:127.0.0.1', 'example.com', undefined]) {
      expect(isLoopbackHost(host), String(host)).toBe(false);
    }
  });

  it('binds an ephemeral IPv4 loopback port without exposing a wildcard listener', async () => {
    const server = createServer();
    servers.push(server);
    const address = await listenLoopback(server);
    expect(address.host).toBe('127.0.0.1');
    expect(address.port).toBeGreaterThan(0);
    expect(server.address()).toMatchObject({address: '127.0.0.1', port: address.port});
    expect(server.listenerCount('error')).toBe(0);
    expect(server.listenerCount('listening')).toBe(0);
  });

  for (const code of ['EAFNOSUPPORT', 'EPROTONOSUPPORT', 'EADDRNOTAVAIL']) {
    it(`falls back to a real IPv6 loopback listener after ${code} on IPv4`, async context => {
      const server = createServer();
      servers.push(server);
      const listen = vi.spyOn(server, 'listen').mockImplementationOnce(() => {
        queueMicrotask(() => server.emit('error', Object.assign(new Error('IPv4 unavailable'), {code})));
        return server;
      });
      let address;
      try {
        address = await listenLoopback(server);
      } catch (error) {
        expect(listen).toHaveBeenCalledTimes(2);
        if (['EAFNOSUPPORT', 'EPROTONOSUPPORT', 'EADDRNOTAVAIL'].includes((error as NodeJS.ErrnoException).code ?? '')) {
          context.skip('The host does not provide IPv6 loopback.');
        }
        throw error;
      }
      expect(address).toMatchObject({host: '::1'});
      expect(server.address()).toMatchObject({address: '::1', port: address.port});
      expect(listen.mock.calls.map(call => call[1])).toEqual(['127.0.0.1', '::1']);
      expect(server.listenerCount('error')).toBe(0);
    });
  }

  it('does not hide permission errors by retrying another address family', async () => {
    const server = createServer();
    servers.push(server);
    const denied = Object.assign(new Error('permission denied'), {code: 'EACCES'});
    const listen = vi.spyOn(server, 'listen').mockImplementationOnce(() => {
      queueMicrotask(() => server.emit('error', denied));
      return server;
    });
    await expect(listenLoopback(server)).rejects.toBe(denied);
    expect(listen).toHaveBeenCalledOnce();
    expect(server.listenerCount('error')).toBe(0);
    expect(server.listenerCount('listening')).toBe(0);
  });
});
