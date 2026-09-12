import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {connectRadioSession, startRadioSession, type RadioSessionCommand, type RadioSessionStatus} from './session.js';

const roots: string[] = [];
const idle: RadioSessionStatus = {
  owner: 'headless',
  station: null,
  queue: [],
  playback: {backend: 'none', state: 'idle', volume: 70, muted: false, ready: false}
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true});
});

describe('agent radio session', () => {
  it('authenticates requests and serializes simultaneous agent commands', async () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-agent-session-'));
    roots.push(root);
    const path = join(root, 'session.json');
    const order: string[] = [];
    const server = await startRadioSession(async (command: RadioSessionCommand) => {
      order.push(`start:${command.type}`);
      await new Promise(resolve => setTimeout(resolve, command.type === 'pause' ? 20 : 1));
      order.push(`end:${command.type}`);
      return {ok: true, message: command.type, status: idle};
    }, path);
    try {
      const client = await connectRadioSession(path);
      expect(client).not.toBeNull();
      await Promise.all([client!.call({type: 'pause'}), client!.call({type: 'stop'})]);
      expect(order).toEqual([
        'start:status', 'end:status',
        'start:pause', 'end:pause',
        'start:stop', 'end:stop'
      ]);
    } finally {
      await server.close();
    }
    expect(await connectRadioSession(path)).toBeNull();
  });

  it('allows only one playback owner for a discovery path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-agent-owner-'));
    roots.push(root);
    const path = join(root, 'session.json');
    const first = await startRadioSession(async () => ({ok: true, message: 'ok', status: idle}), path);
    try {
      await expect(startRadioSession(async () => ({ok: true, message: 'ok', status: idle}), path)).rejects.toThrow('already active');
    } finally {
      await first.close();
    }
  });

  for (const host of ['127.0.0.1', '::1']) {
    it(`authenticates directly to a discovered ${host} endpoint`, async context => {
      const root = mkdtempSync(join(tmpdir(), 'radiocli-agent-family-'));
      roots.push(root);
      const path = join(root, 'session.json');
      let authenticatedRequests = 0;
      const server = createServer((request, response) => {
        if (request.headers.authorization === 'Bearer test-session-token') authenticatedRequests += 1;
        request.resume();
        response.end(JSON.stringify({ok: true, message: 'ok', status: idle}));
      });
      try {
        await new Promise<void>((resolve, reject) => {server.once('error', reject);server.listen(0, host, resolve);});
      } catch (error) {
        if (host === '::1' && ['EAFNOSUPPORT', 'EPROTONOSUPPORT', 'EADDRNOTAVAIL'].includes((error as NodeJS.ErrnoException).code ?? '')) {
          context.skip('The host does not provide IPv6 loopback.');
        }
        throw error;
      }
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('No listener address.');
        writeFileSync(path, JSON.stringify({version: 1, host, port: address.port, token: 'test-session-token', pid: process.pid, createdAt: new Date().toISOString()}));
        const client = await connectRadioSession(path);
        expect(client).not.toBeNull();
        expect(await client!.status()).toEqual(idle);
        expect(authenticatedRequests).toBe(2);
      } finally {
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
      }
    });
  }

  it('rejects a discovery hostname without contacting the advertised port', async () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-agent-host-'));
    roots.push(root);
    const path = join(root, 'session.json');
    let requests = 0;
    const server = createServer((_request, response) => {requests += 1;response.end('{}');});
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No listener address.');
      writeFileSync(path, JSON.stringify({version: 1, host: 'localhost', port: address.port, token: 'test-session-token', pid: process.pid, createdAt: new Date().toISOString()}));
      expect(await connectRadioSession(path)).toBeNull();
      expect(requests).toBe(0);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it.skipIf(!process.allowedNodeEnvironmentFlags.has('--use-env-proxy'))(
    'keeps radio and alarm control tokens away from environment proxies in a fresh Node process', async () => {
      const root = mkdtempSync(join(tmpdir(), 'radiocli-control-proxy-'));
      roots.push(root);
      let proxyRequests = 0;
      let proxySawAuthorization = false;
      const proxy = createServer((request, response) => {
        proxyRequests += 1;
        proxySawAuthorization ||= Boolean(request.headers.authorization);
        request.resume();
        response.writeHead(401);
        response.end('{}');
      });
      await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
      try {
        const address = proxy.address();
        if (!address || typeof address === 'string') throw new Error('No proxy address.');
        const env = {...process.env};
        for (const key of Object.keys(env)) if (/^(?:https?|all|no)_proxy$/i.test(key) || key === 'NODE_OPTIONS') delete env[key];
        env.NODE_USE_ENV_PROXY = '1';
        env.HTTP_PROXY = `http://127.0.0.1:${address.port}`;
        env.NO_PROXY = '';
        const source = `
          import {join} from 'node:path';
          import {startRadioSession, connectRadioSession} from ${JSON.stringify(new URL('./session.ts', import.meta.url).href)};
          import {startActiveAlarmSession, connectActiveAlarm} from ${JSON.stringify(new URL('../alarms/active-session.ts', import.meta.url).href)};
          const root = process.argv[1];
          const idle = ${JSON.stringify(idle)};
          const radioPath = join(root, 'radio.json');
          const alarmPath = join(root, 'alarm.json');
          const radio = await startRadioSession(async () => ({ok: true, message: 'ok', status: idle}), radioPath);
          const alarm = await startActiveAlarmSession({alarmId: 'test', scheduledAt: '2030-01-01T00:00:00Z', stationName: 'Local alarm', startedAt: '2030-01-01T00:00:00Z'}, {filePath: alarmPath, onDismiss() {}, onSnooze() {}, onKeepPlaying() {}});
          try {
            const radioClient = await connectRadioSession(radioPath);
            const alarmClient = await connectActiveAlarm(alarmPath);
            console.log(JSON.stringify({radio: Boolean(radioClient), alarm: Boolean(alarmClient)}));
          } finally {
            await alarm.close();
            await radio.close();
          }
        `;
        const output = await new Promise<string>((resolve, reject) => {
          const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source, root], {env, timeout: 8000});
          let stdout = '';
          let stderr = '';
          child.stdout.on('data', chunk => {stdout += String(chunk);});
          child.stderr.on('data', chunk => {stderr += String(chunk);});
          child.once('error', reject);
          child.once('close', code => code === 0 ? resolve(stdout) : reject(new Error(`Control probe exited ${code}: ${stderr}`)));
        });
        expect(proxyRequests).toBe(0);
        expect(proxySawAuthorization).toBe(false);
        expect(JSON.parse(output)).toEqual({radio: true, alarm: true});
      } finally {
        proxy.closeAllConnections();
        await new Promise<void>(resolve => proxy.close(() => resolve()));
      }
    }
  );
});
