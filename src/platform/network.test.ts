import {createServer, type Server} from 'node:http';
import {createServer as createHttpsServer} from 'node:https';
import {connect} from 'node:net';
import {spawn} from 'node:child_process';
import type {Duplex} from 'node:stream';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {networkDiagnostic, networkPolicy, withExternalResponse} from './network.js';

const servers: Server[] = [];
const sockets = new Set<Duplex>();
const nodeVersion = Object.getOwnPropertyDescriptor(process.versions, 'node')!;
const execArgv = [...process.execArgv];
const proxyVariables = ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy'];

beforeEach(() => {
  for (const key of [...proxyVariables, 'NODE_USE_ENV_PROXY', 'NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'RADIOCLI_OFFLINE', 'RADIOCLI_LOW_BANDWIDTH']) vi.stubEnv(key, undefined);
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  Object.defineProperty(process.versions, 'node', nodeVersion);
  process.execArgv.splice(0, process.execArgv.length, ...execArgv);
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  await Promise.all(servers.splice(0).map(server => {
    server.closeAllConnections();
    return new Promise<void>(resolve => server.close(() => resolve()));
  }));
});

describe('public network policy', () => {
  it('reports configuration separately from connectivity and redacts proxy credentials', () => {
    expect(networkDiagnostic()).toMatchObject({status: 'configured', offline: false});
    vi.stubEnv('HTTPS_PROXY', 'socks5://private-user:private-password@proxy.invalid:1080');
    expect(networkDiagnostic()).toMatchObject({status: 'unavailable'});
    expect(JSON.stringify(networkDiagnostic())).not.toMatch(/private-user|private-password|proxy.invalid/);
    vi.stubEnv('RADIOCLI_OFFLINE', '1');
    expect(networkDiagnostic()).toMatchObject({status: 'offline', offline: true});
  });

  it('keeps offline and low-bandwidth preferences independent and explicitly opt in', () => {
    expect(networkPolicy({})).toEqual({offline: false, lowBandwidth: false});
    expect(networkPolicy({RADIOCLI_OFFLINE: '1'})).toEqual({offline: true, lowBandwidth: false});
    expect(networkPolicy({RADIOCLI_LOW_BANDWIDTH: '1'})).toEqual({offline: false, lowBandwidth: true});
    expect(networkPolicy({RADIOCLI_OFFLINE: '0', RADIOCLI_LOW_BANDWIDTH: 'true'})).toEqual({offline: false, lowBandwidth: false});
  });

  it('does not invoke fetch in offline mode', async () => {
    vi.stubEnv('RADIOCLI_OFFLINE', '1');
    const fetchImpl = vi.fn(async () => new Response('{}'));
    await expect(withExternalResponse('https://example.com', {timeoutMs: 100, fetchImpl}, response => response.json())).rejects.toThrow(/offline/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  for (const variable of ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy']) {
    it(`rejects unsupported ${variable} without contacting the destination or exposing credentials`, async () => {
      let destinationRequests = 0;
      const server = createServer((_request, response) => {destinationRequests += 1;response.end('{}');});
      const url = await start(server);
      vi.stubEnv(variable, 'socks5://private-user:private-password@127.0.0.1:9');
      const error = await withExternalResponse(url, {timeoutMs: 100}, response => response.json()).then(() => null, value => value as Error);
      expect(error).toBeInstanceOf(Error);
      expect(error!.message).toMatch(/SOCKS|ALL_PROXY|all_proxy/);
      expect(error!.message).not.toMatch(/private-user|private-password|127\.0\.0\.1:9/);
      expect(error!.cause).toBeUndefined();
      expect(destinationRequests).toBe(0);
    });
  }

  it('explains that ALL_PROXY alone is not implemented even for HTTP proxy URLs', async () => {
    vi.stubEnv('ALL_PROXY', 'http://proxy.invalid:8080');
    const fetchImpl = vi.fn(async () => new Response('{}'));
    await expect(withExternalResponse('https://example.com', {timeoutMs: 100, fetchImpl}, response => response.json())).rejects.toThrow(/ALL_PROXY/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('redacts invalid proxy URLs and invalid percent-encoded credentials', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}'));
    for (const value of ['not-a-url-private-password', 'http://private-user:private-password%ZZ@proxy.invalid']) {
      vi.stubEnv('HTTPS_PROXY', value);
      const error = await withExternalResponse('https://example.com', {timeoutMs: 100, fetchImpl}, response => response.json()).then(() => null, value => value as Error);
      expect(error!.message).toMatch(/HTTPS_PROXY/);
      expect(error!.message).not.toMatch(/private-user|private-password|proxy\.invalid/);
      expect(error!.cause).toBeUndefined();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('requires native proxy opt-in instead of silently sending configured traffic directly', async () => {
    vi.stubEnv('HTTPS_PROXY', 'http://proxy.invalid:8080');
    const fetchImpl = vi.fn(async () => new Response('{}'));
    await expect(withExternalResponse('https://example.com', {timeoutMs: 100, fetchImpl}, response => response.json())).rejects.toThrow(/NODE_USE_ENV_PROXY=1/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('honors lowercase proxy precedence and the fetch HTTPS fallback to HTTP_PROXY', async () => {
    vi.stubEnv('NODE_USE_ENV_PROXY', '1');
    vi.stubEnv('HTTP_PROXY', 'socks5://ignored.invalid:1');
    vi.stubEnv('http_proxy', 'http://proxy.invalid:8080');
    vi.stubEnv('ALL_PROXY', 'socks5://also-ignored.invalid:1');
    const fetchImpl = vi.fn(async () => new Response('{"ok":true}'));
    await expect(withExternalResponse('https://example.com', {timeoutMs: 100, fetchImpl}, response => response.json())).resolves.toEqual({ok: true});
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('recognizes a launch flag but respects an explicit command-line override', async () => {
    vi.stubEnv('HTTPS_PROXY', 'http://proxy.invalid:8080');
    vi.stubEnv('NODE_OPTIONS', '--use-env-proxy');
    const fetchImpl = vi.fn(async () => new Response('{}'));
    await expect(withExternalResponse('https://example.com', {timeoutMs: 100, fetchImpl}, response => response.json())).resolves.toEqual({});
    process.execArgv.push('--no-use-env-proxy');
    await expect(withExternalResponse('https://example.com', {timeoutMs: 100, fetchImpl}, response => response.json())).rejects.toThrow(/NODE_USE_ENV_PROXY=1/);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('reports unsupported Node versions before attempting a configured proxy', async () => {
    vi.stubEnv('NODE_USE_ENV_PROXY', '1');
    vi.stubEnv('HTTPS_PROXY', 'http://proxy.invalid:8080');
    const fetchImpl = vi.fn(async () => new Response('{}'));
    for (const version of ['22.0.0', '22.20.0', '23.11.0']) {
      Object.defineProperty(process.versions, 'node', {...nodeVersion, value: version});
      await expect(withExternalResponse('https://example.com', {timeoutMs: 100, fetchImpl}, response => response.json())).rejects.toThrow(/22\.21|24/);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    for (const version of ['22.21.0', '24.0.0', '24.5.0']) {
      Object.defineProperty(process.versions, 'node', {...nodeVersion, value: version});
      await expect(withExternalResponse('https://example.com', {timeoutMs: 100, fetchImpl}, response => response.json())).resolves.toEqual({});
    }
  });
});

describe('external response lifetime', () => {
  it('keeps the deadline alive after real response headers while the body is stalled', async () => {
    const server = createServer((_request, response) => {response.writeHead(200, {'content-type': 'application/json'});response.flushHeaders();response.write('{');});
    const url = await start(server);
    let receivedHeaders = false;
    const started = Date.now();
    await expect(withExternalResponse(url, {timeoutMs: 1000}, response => {
      receivedHeaders = true;
      return response.json();
    })).rejects.toThrow(/timed out/i);
    expect(receivedHeaders).toBe(true);
    expect(Date.now() - started).toBeLessThan(4500);
  });

  it('cancels an unused body after a status-only callback', async () => {
    const cancel = vi.fn();
    const fetchImpl = async () => new Response(new ReadableStream({cancel}), {status: 503});
    await expect(withExternalResponse('https://example.com', {timeoutMs: 100, fetchImpl}, response => response.status)).resolves.toBe(503);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('cancels an unused body when the consumer rejects the response', async () => {
    const cancel = vi.fn();
    const fetchImpl = async () => new Response(new ReadableStream({cancel}), {status: 503});
    await expect(withExternalResponse('https://example.com', {timeoutMs: 100, fetchImpl}, () => {throw new Error('bad status');})).rejects.toThrow('bad status');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('bounds the callback even when a custom fetch implementation does not react to abort', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const fetchImpl = async () => new Response(new ReadableStream({cancel}));
    const outcome = withExternalResponse('https://example.com', {timeoutMs: 100, fetchImpl}, () => new Promise(() => {})).then(() => null, error => error as Error);
    await vi.advanceTimersByTimeAsync(100);
    expect((await outcome)?.message).toMatch(/timed out/i);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('preserves caller cancellation', async () => {
    const controller = new AbortController();
    const reason = new Error('caller cancelled');
    controller.abort(reason);
    const fetchImpl = vi.fn(async () => new Response('{}'));
    await expect(withExternalResponse('https://example.com', {timeoutMs: 100, fetchImpl, init: {signal: controller.signal}}, response => response.json())).rejects.toBe(reason);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('cancels a late response without invoking its consumer after the deadline', async () => {
    vi.useFakeTimers();
    let deliver!: (response: Response) => void;
    const fetchImpl = () => new Promise<Response>(resolve => {deliver = resolve;});
    const consume = vi.fn((response: Response) => response.status);
    const outcome = withExternalResponse('https://example.com', {timeoutMs: 100, fetchImpl}, consume).catch(error => error as Error);
    await vi.advanceTimersByTimeAsync(100);
    expect(await outcome).toMatchObject({message: expect.stringMatching(/timed out/i)});
    const cancel = vi.fn();
    deliver(new Response(new ReadableStream({cancel})));
    await vi.advanceTimersByTimeAsync(0);
    expect(consume).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('preserves TLS certificate verification against a real self-signed server', async () => {
    let requests = 0;
    const server = createHttpsServer({key: fixtureKey, cert: fixtureCertificate}, (_request, response) => {requests += 1;response.end('{}');});
    const url = (await start(server)).replace('http:', 'https:');
    await expect(withExternalResponse(url, {timeoutMs: 1000}, response => response.json())).rejects.toMatchObject({cause: {code: 'DEPTH_ZERO_SELF_SIGNED_CERT'}});
    expect(requests).toBe(0);
    expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();
  });

  it.skipIf(!process.allowedNodeEnvironmentFlags.has('--use-env-proxy'))('uses the native HTTP proxy in a fresh Node process', async () => {
    let originProxyAuthorization: string | undefined;
    const origin = createServer((request, response) => {originProxyAuthorization = request.headers['proxy-authorization'];response.end('{"route":"origin"}');});
    const destination = await start(origin);
    let proxyConnections = 0;
    let authenticatedProxy = false;
    const proxy = createServer();
    proxy.on('connect', (request, socket, head) => {
      proxyConnections += 1;
      authenticatedProxy = request.headers['proxy-authorization'] === `Basic ${Buffer.from('test-user:test-password').toString('base64')}`;
      sockets.add(socket);
      const upstream = connect(Number(new URL(destination).port), '127.0.0.1', () => {
        socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        upstream.pipe(socket);
        socket.pipe(upstream);
      });
      sockets.add(upstream);
      socket.on('error', () => upstream.destroy());
      upstream.on('error', () => socket.destroy());
    });
    const proxyUrl = new URL(await start(proxy));
    proxyUrl.username = 'test-user';
    proxyUrl.password = 'test-password';
    const env = {...process.env};
    for (const key of Object.keys(env)) if (/^(?:https?|all|no)_proxy$/i.test(key) || key === 'NODE_OPTIONS') delete env[key];
    env.NODE_USE_ENV_PROXY = '1';
    env.HTTP_PROXY = proxyUrl.href;
    env.NO_PROXY = '';
    const source = `import {withExternalResponse} from ${JSON.stringify(new URL('./network.ts', import.meta.url).href)};console.log(JSON.stringify(await withExternalResponse(${JSON.stringify(destination)}, {timeoutMs: 2000}, response => response.json())));`;
    const result = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {env, timeout: 5000});
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', chunk => {stdout += String(chunk);});
      child.stderr.on('data', chunk => {stderr += String(chunk);});
      child.once('error', reject);
      child.once('close', code => code === 0 ? resolve(stdout) : reject(new Error(`Proxy probe exited ${code}: ${stderr}`)));
    });
    expect(JSON.parse(result)).toEqual({route: 'origin'});
    expect(proxyConnections).toBe(1);
    expect(authenticatedProxy).toBe(true);
    expect(originProxyAuthorization).toBeUndefined();
  });
});

async function start(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve, reject) => {server.once('error', reject);server.listen(0, '127.0.0.1', resolve);});
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No listener address.');
  return `http://127.0.0.1:${address.port}`;
}

// Public test-only key and self-signed certificate; never used outside this listener.
const fixtureKey = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgdlaXqgyzfUEvYbyF
RQfTLHuSl6q9hS1Xei3+nXI+RaqhRANCAASEdb1PI+/xQa9NAqepSjOLpJTpWDyV
Bhw6kqUXtZJVSTPyFFo5z9DrziH6UnxATozGgJv27wWRJoboTqzHTHr+
-----END PRIVATE KEY-----`;
const fixtureCertificate = `-----BEGIN CERTIFICATE-----
MIIBfTCCASOgAwIBAgIUCUcRiI7iLHzUheIbTonNEDx6QO8wCgYIKoZIzj0EAwIw
FDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDkwNzIzMTYyNVoXDTM2MDkwNDIz
MTYyNVowFDESMBAGA1UEAwwJbG9jYWxob3N0MFkwEwYHKoZIzj0CAQYIKoZIzj0D
AQcDQgAEhHW9TyPv8UGvTQKnqUozi6SU6Vg8lQYcOpKlF7WSVUkz8hRaOc/Q684h
+lJ8QE6MxoCb9u8FkSaG6E6sx0x6/qNTMFEwHQYDVR0OBBYEFCWgV7aRyaZ6Tf19
5SYahE4kmBRlMB8GA1UdIwQYMBaAFCWgV7aRyaZ6Tf195SYahE4kmBRlMA8GA1Ud
EwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSAAwRQIhAIJO7DSRzV+s7lDMftcC7CwU
tZVZiikVcdL2DYCLTu1TAiBjJblbBFao0A6d/BrkpMbn6M/JdApiza4cxQW520VZ
vQ==
-----END CERTIFICATE-----`;
