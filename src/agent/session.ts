import {randomBytes} from 'node:crypto';
import {chmodSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {createServer, request} from 'node:http';
import {platformPaths} from '../platform/paths.js';
import {dirname, join} from 'node:path';
import type {AirPlayDevice, AppSettings, PlaybackState, Station} from '../types.js';
import {isLoopbackHost, listenLoopback, type LoopbackHost} from '../platform/loopback.js';

export type RadioSessionStatus = {
  owner: 'tui' | 'headless';
  playback: PlaybackState;
  station: Station | null;
  queue: Station[];
  output?: Pick<AppSettings, 'preferredBackend' | 'preferredAirPlayDevice'>;
};

export type RadioSessionCommand =
  | {type: 'status'}
  | {type: 'play'; station: Station; queue?: Station[]; openNowPlaying?: boolean; ifPlaying?: 'keep' | 'replace'}
  | {type: 'pause'}
  | {type: 'resume'}
  | {type: 'stop'}
  | {type: 'alarm-preempt'}
  | {type: 'next'}
  | {type: 'previous'}
  | {type: 'set-volume'; volume: number}
  | {type: 'set-muted'; muted: boolean}
  | {type: 'set-favorite'; favorite: boolean; station?: Station}
  | {type: 'airplay-list'}
  | {type: 'airplay-select'; deviceId: string}
  | {type: 'airplay-local'}
  | {type: 'airplay-passcode'; code: string}
  | {type: 'update-settings'; settings: Partial<Pick<AppSettings, 'theme' | 'receiverStyle' | 'agentControl'>>};

export type RadioSessionResult = {ok: boolean; message: string; status: RadioSessionStatus; data?: AirPlayDevice[]};
type Discovery = {version: 1; host: LoopbackHost; port: number; token: string; pid: number; createdAt: string};

export type RadioSessionClient = {
  call(command: RadioSessionCommand): Promise<RadioSessionResult>;
  status(): Promise<RadioSessionStatus>;
};

export async function startRadioSession(
  handle: (command: RadioSessionCommand) => Promise<RadioSessionResult>,
  filePath = radioSessionPath()
): Promise<{close(): Promise<void>}> {
  const ownerPath = `${filePath}.owner`;
  acquireOwner(ownerPath);
  const token = randomBytes(32).toString('hex');
  let serial = Promise.resolve();
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.statusCode = 401;
      res.end('{}');
      return;
    }
    if (req.method !== 'POST' || req.url !== '/command') {
      res.statusCode = 404;
      res.end('{}');
      return;
    }
    const work = serial.then(async () => {
      const body = await readBody(req);
      return handle(JSON.parse(body) as RadioSessionCommand);
    });
    serial = work.then(() => undefined, () => undefined);
    void work.then(result => res.end(JSON.stringify(result))).catch(error => {
      res.statusCode = 400;
      res.end(JSON.stringify({error: error instanceof Error ? error.message : 'Radio control failed.'}));
    });
  });
  try {
    const address = await listenLoopback(server);
    const discovery: Discovery = {
      version: 1,
      host: address.host,
      port: address.port,
      token,
      pid: process.pid,
      createdAt: new Date().toISOString()
    };
    writePrivateJson(filePath, discovery);
    return {
      async close() {
        await new Promise<void>(resolve => server.close(() => resolve()));
        removeIfOwned(filePath, discovery);
        removeOwner(ownerPath, process.pid);
      }
    };
  } catch (error) {
    removeOwner(ownerPath, process.pid);
    await new Promise<void>(resolve => server.close(() => resolve()));
    throw error;
  }
}

export async function connectRadioSession(filePath = radioSessionPath()): Promise<RadioSessionClient | null> {
  if (!existsSync(filePath)) return null;
  let discovery: Discovery;
  try {
    discovery = JSON.parse(readFileSync(filePath, 'utf8')) as Discovery;
    if (discovery.version !== 1 || !isLoopbackHost(discovery.host) || !Number.isInteger(discovery.port) || !discovery.token) {
      throw new Error('invalid');
    }
  } catch {
    rmSync(filePath, {force: true});
    return null;
  }
  const call = async (command: RadioSessionCommand): Promise<RadioSessionResult> => {
    const payload = JSON.stringify(command);
    return new Promise<RadioSessionResult>((resolve, reject) => {
      const req = request({
        host: discovery.host,
        // Local control tokens must never be forwarded by an environment proxy.
        agent: false,
        port: discovery.port,
        path: '/command',
        method: 'POST',
        headers: {
          authorization: `Bearer ${discovery.token}`,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload)
        }
      }, res => {
        let text = '';
        res.on('data', value => { text += String(value); });
        res.on('end', () => {
          if (res.statusCode && res.statusCode < 300) resolve(JSON.parse(text) as RadioSessionResult);
          else reject(new Error(parseError(text)));
        });
      });
      req.once('error', reject);
      req.setTimeout(15_000, () => req.destroy(new Error('RadioCLI control request timed out.')));
      req.end(payload);
    });
  };
  try {
    await call({type: 'status'});
    return {call, status: async () => (await call({type: 'status'})).status};
  } catch {
    if (!processAlive(discovery.pid) || discoveryAgeMs(filePath, discovery) > 60_000) {
      removeIfOwned(filePath, discovery);
      removeOwner(`${filePath}.owner`, discovery.pid);
    }
    return null;
  }
}

export async function ensureRadioSession(start: () => Promise<void>, timeoutMs = 15_000): Promise<RadioSessionClient> {
  const existing = await connectRadioSession();
  if (existing) return existing;
  const lockPath = `${radioSessionPath()}.launch`;
  let ownsLaunch = false;
  try {
    acquireOwner(lockPath);
    ownsLaunch = true;
    const appeared = await connectRadioSession();
    if (appeared) return appeared;
    await start();
    return await waitForSession(timeoutMs);
  } catch (error) {
    if (ownsLaunch || !(error instanceof Error) || !error.message.includes('already active')) throw error;
    return waitForSession(timeoutMs);
  } finally {
    if (ownsLaunch) removeOwner(lockPath, process.pid);
  }
}

function radioSessionPath(): string {
  return join(runtimeDirectory(), 'agent-session.json');
}

async function waitForSession(timeoutMs: number): Promise<RadioSessionClient> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const client = await connectRadioSession();
    if (client) return client;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('RadioCLI was launched but its control session did not become ready.');
}

function runtimeDirectory(): string {
  return platformPaths().runtime;
}

function acquireOwner(path: string): void {
  mkdirSync(dirname(path), {recursive: true, mode: 0o700});
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(path, 'wx', 0o600);
      writeFileSync(fd, `${process.pid}\n`);
      closeSync(fd);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const pid = Number(readFileSync(path, 'utf8').trim());
      if (processAlive(pid)) throw new Error('Another RadioCLI playback session is already active.');
      rmSync(path, {force: true});
    }
  }
  throw new Error('Could not claim the RadioCLI playback session.');
}

function removeOwner(path: string, pid: number): void {
  try {
    if (Number(readFileSync(path, 'utf8').trim()) === pid) rmSync(path, {force: true});
  } catch {}
}

function writePrivateJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), {recursive: true, mode: 0o700});
  const temp = `${path}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
  writeFileSync(temp, `${JSON.stringify(value)}\n`, {mode: 0o600});
  renameSync(temp, path);
  if (process.platform !== 'win32') chmodSync(path, 0o600);
}

function removeIfOwned(path: string, owner: Discovery): void {
  try {
    const current = JSON.parse(readFileSync(path, 'utf8')) as Partial<Discovery>;
    if (current.pid === owner.pid && current.token === owner.token && current.port === owner.port) rmSync(path, {force: true});
  } catch {}
}

function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

function discoveryAgeMs(path: string, discovery: Discovery): number {
  const created = Date.parse(discovery.createdAt);
  if (Number.isFinite(created)) return Math.max(0, Date.now() - created);
  try { return Math.max(0, Date.now() - statSync(path).mtimeMs); } catch { return 0; }
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', value => {
      body += String(value);
      if (body.length > 1_000_000) req.destroy(new Error('Request too large.'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function parseError(text: string): string {
  try {
    const parsed = JSON.parse(text) as {error?: unknown};
    return typeof parsed.error === 'string' ? parsed.error : 'RadioCLI control request failed.';
  } catch {
    return 'RadioCLI control request failed.';
  }
}
