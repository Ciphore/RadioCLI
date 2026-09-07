import type {Server} from 'node:net';

export type LoopbackHost = '127.0.0.1' | '::1';

export function isLoopbackHost(value: unknown): value is LoopbackHost {
  return value === '127.0.0.1' || value === '::1';
}

/** Bind only literal loopback addresses, including hosts without an IPv4 stack. */
export async function listenLoopback(server: Server): Promise<{host: LoopbackHost; port: number}> {
  try {
    return await listen(server, '127.0.0.1');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EAFNOSUPPORT' && code !== 'EPROTONOSUPPORT' && code !== 'EADDRNOTAVAIL') throw error;
    return listen(server, '::1');
  }
}

function listen(server: Server, host: LoopbackHost): Promise<{host: LoopbackHost; port: number}> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      server.removeListener('error', failed);
      server.removeListener('listening', ready);
    };
    const failed = (error: Error) => {
      cleanup();
      reject(error);
    };
    const ready = () => {
      cleanup();
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to create a local control endpoint.'));
        return;
      }
      resolve({host, port: address.port});
    };
    server.once('error', failed);
    server.once('listening', ready);
    try {
      server.listen(0, host);
    } catch (error) {
      failed(error as Error);
    }
  });
}
