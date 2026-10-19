import {createHash, randomBytes, randomUUID} from 'node:crypto';
import {parseRadioCommand, parseRadioRequest} from './command-schema.js';
import {chmodSync, existsSync, mkdirSync, openSync, closeSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {createServer, request} from 'node:http';
import {platformPaths} from '../platform/paths.js';
import {dirname, join} from 'node:path';
import type {AirPlayDevice, AppSettings, IcyNowPlaying, PlaybackDiagnostics, PlaybackState, Station} from '../types.js';
import {isLoopbackHost, listenLoopback, type LoopbackHost} from '../platform/loopback.js';

export type RadioSessionStatus = {
  persistenceWarning?: string;
  owner: 'tui' | 'headless';
  playback: PlaybackState;
  station: Station | null;
  nowPlaying?: IcyNowPlaying | null;
  queue: Station[];
  output?: Pick<AppSettings, 'preferredBackend' | 'preferredAirPlayDevice'>;
  tui?: {
    tuningStation: Station | null;
    message?: string;
    focusNowPlaying?: number;
    sleepUntil?: number | null;
    diagnostics: PlaybackDiagnostics;
    devices: AirPlayDevice[];
    selectionRequired: boolean;
    desktopMediaCompatible: boolean;
  };
};

export type RadioSessionCommand =
  | {type: 'desktop-transport'; action: 'play' | 'pause' | 'toggle' | 'stop' | 'next' | 'previous'}
  | {type: 'status'}
  | {type: 'play'; station: Station; queue?: Station[]; openNowPlaying?: boolean; ifPlaying?: 'keep' | 'replace'; startPaused?: boolean}
  | {type: 'tui-attach'; pid: number; clientId: string}
  | {type: 'tui-detach'; clientId: string}
  | {type: 'tui-cancel'}
  | {type: 'tui-select'; station: Station; queue: Station[]}
  | {type: 'tui-output'; deviceId: string | null}
  | {type: 'tui-refresh'}
  | {type: 'tui-sleep'; until: number | null}
  | {type: 'tui-adjust-volume'; delta: number}
  | {type: 'tui-toggle-muted'}
  | {type: 'tui-toggle-pause'}
  | {type: 'pause'}
  | {type: 'resume'; restartStopped?: boolean}
  | {type: 'stop'; retainSelection?: boolean}
  | {type: 'alarm-preempt'}
  | {type: 'next'; preservePause?: boolean; preserveStop?: boolean}
  | {type: 'previous'; preservePause?: boolean; preserveStop?: boolean}
  | {type: 'set-volume'; volume: number; unmute?: boolean; allowStopped?: boolean}
  | {type: 'set-muted'; muted: boolean; allowStopped?: boolean}
  | {type: 'set-favorite'; favorite: boolean; station?: Station}
  | {type: 'airplay-list'}
  | {type: 'airplay-select'; deviceId: string}
  | {type: 'airplay-local'}
  | {type: 'airplay-passcode'; code: string}
  | {type: 'update-settings'; settings: Partial<Pick<AppSettings, 'theme' | 'receiverStyle' | 'agentControl'>>};

/** The wire protocol accepts appearance/MCP preferences, never experimental-output consent. */
export function allowedRadioSessionSettings(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => ['theme', 'receiverStyle', 'agentControl'].includes(key));
}

export type RadioSessionResult = {ok: boolean; message: string; status: RadioSessionStatus; data?: AirPlayDevice[]};

/** Resolve desktop intent at the owner queue boundary, after earlier commands
 * have completed. In particular, Play/PlayPause must not use a stale snapshot. */
export function resolveDesktopTransport(action: Extract<RadioSessionCommand, {type: 'desktop-transport'}>['action'], status: RadioSessionStatus): Exclude<RadioSessionCommand, {type: 'desktop-transport'}> | null {
  const {playback, station, queue} = status;
  const stopped = ['idle', 'stopped'].includes(playback.state);
  if (action === 'play') {
    if (playback.state === 'paused') return {type: 'resume'};
    return stopped && station ? {type: 'resume', restartStopped: true} : null;
  }
  if (action === 'pause') return playback.state === 'playing' && playback.backend === 'mpv' ? {type: 'pause'} : null;
  if (action === 'toggle') {
    if (!station || playback.backend !== 'mpv') throw new Error('This output cannot toggle pause.');
    return playback.state === 'playing' ? {type: 'pause'} : playback.state === 'paused' ? {type: 'resume'} : stopped ? {type: 'resume', restartStopped: true} : null;
  }
  // Even an idle backend can have an unresolved tune or delayed retry to cancel.
  if (action === 'stop') return {type: 'stop', retainSelection: true};
  return station && queue.length > 1 && (stopped || playback.state === 'playing' || playback.state === 'paused')
    ? {type: action, preservePause: true, preserveStop: true} : null;
}

/** Agent and desktop controls must use the same owner queue. A failed command
 * cannot strand the queue or allow a later command to overtake an active one. */
export function serializeRadioCommands(
  handle: (command: RadioSessionCommand, signal?: AbortSignal) => Promise<RadioSessionResult>,
  options: {responsive?: boolean; limit?: number} = {}
): (command: RadioSessionCommand, permitted?: () => boolean | Promise<boolean>) => Promise<RadioSessionResult> {
  let pending = Promise.resolve();
  let tuning = Promise.resolve();
  let admitted = 0;
  const tunes = new Set<AbortController>();
  return (input, permitted) => {
    let command: RadioSessionCommand;
    try { command = parseRadioCommand(input); } catch (error) { return Promise.reject(error); }
    const priority = command.type === 'stop' || command.type === 'alarm-preempt' || command.type === 'tui-cancel'
      || command.type === 'desktop-transport' && command.action === 'stop';
    const checkPermission = async () => { if (permitted && !await permitted()) throw new Error('Desktop media controls are suspended.'); };
    if (options.responsive && command.type === 'status') return Promise.resolve().then(async () => { await checkPermission(); return handle(command); });
    if (options.responsive && priority) {
      const interrupted = [...tunes];
      const priorPending = pending;
      const priorTuning = tuning;
      const work = checkPermission().then(() => {
        for (const controller of interrupted) controller.abort(new DOMException('Tuning canceled by Stop or alarm.', 'AbortError'));
        return handle(command);
      });
      pending = work.then(() => undefined, () => priorPending);
      tuning = work.then(() => undefined, () => priorTuning);
      return work;
    }
    if (admitted >= (options.limit ?? 128)) return Promise.reject(new Error('RadioCLI control queue is busy. Status and Stop remain available.'));
    admitted++;
    const replacesTune = ['play', 'airplay-select', 'airplay-local'].includes(command.type);
    const transport = replacesTune || ['pause', 'resume', 'next', 'previous', 'desktop-transport'].includes(command.type);
    const long = options.responsive && (['play', 'resume', 'next', 'previous', 'airplay-select', 'airplay-local'].includes(command.type) || command.type === 'desktop-transport' && ['play', 'next', 'previous'].includes(command.action));
    const replaced = options.responsive && replacesTune ? [...tunes] : [];
    const priorTuning = tuning;
    let executing = false;
    const controller = new AbortController();
    if (options.responsive && transport) tunes.add(controller);
    const fence = options.responsive && transport && !replacesTune ? Promise.all([pending, tuning]).then(() => undefined) : pending;
    const start = abortableControl(fence, controller.signal).then(async () => {
      await checkPermission(); controller.signal.throwIfAborted();
      for (const earlier of replaced) earlier.abort(new DOMException('Tuning canceled by a replacement.', 'AbortError'));
      executing = true;
      const result = handle(command, controller.signal);
      return {result};
    });
    const result = abortableControl(start.then(({result}) => result), controller.signal).finally(() => { admitted--; tunes.delete(controller); });
    // Tune completion is separate from command admission. A later tune replaces
    // an active one, while Stop and status bypass both queues entirely.
    pending = (long ? start : result).then(() => undefined, () => undefined);
    if (long) tuning = result.then(() => undefined, () => executing ? undefined : priorTuning);
    // Cancellation is an expected control outcome. Keep the rejection available
    // to the caller without leaking it while another transport action is awaited.
    void result.catch(() => undefined);
    return result;
  };
}

function abortableControl<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason); };
    signal.addEventListener('abort', abort, {once: true});
    void work.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
type Discovery = {version: 1; protocol?: 2; host: LoopbackHost; port: number; token: string; pid: number; createdAt: string};

export type RadioSessionClient = {
  call(command: RadioSessionCommand, requestId?: string): Promise<RadioSessionResult>;
  status(): Promise<RadioSessionStatus>;
};

type SessionClientOptions = {source?: 'agent' | 'cli'; signal?: AbortSignal};

/** Use queue: 'owner' only when handle submits directly to the owner's shared
 * serialized dispatcher. Other callers retain the session's own FIFO. */
export async function startRadioSession(
  handle: (command: RadioSessionCommand, source?: 'agent' | 'cli') => Promise<RadioSessionResult>,
  filePath = radioSessionPath(),
  options: {queue?: 'session' | 'owner'} = {}
): Promise<{close(): Promise<void>}> {
  const ownerPath = `${filePath}.owner`;
  acquireOwner(ownerPath);
  const token = randomBytes(32).toString('hex');
  let serial = Promise.resolve();
  const requests = new Map<string, {fingerprint: string; result: Promise<RadioSessionResult>; settledAt?: number}>();
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
    const accept = async () => {
      const body = await readBody(req);
      const {command, requestId} = parseRadioRequest(JSON.parse(body));
      const execute = () => handle(command, req.headers['x-radiocli-client'] === 'cli' ? 'cli' : 'agent');
      if (!requestId || command.type === 'status') return execute();
      const fingerprint = createHash('sha256').update(JSON.stringify(command)).digest('hex');
      const existing = requests.get(requestId);
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw new Error('This request ID was already used for a different command.');
        return existing.result;
      }
      for (const [id, entry] of requests) if (entry.settledAt && (Date.now() - entry.settledAt > 300_000 || requests.size >= 256)) requests.delete(id);
      if (requests.size >= 256) {
        // Stop/preemption are intrinsically idempotent and must remain available
        // even when ordinary requests occupy the entire bounded outcome cache.
        if (command.type === 'stop' || command.type === 'alarm-preempt' || command.type === 'desktop-transport' && command.action === 'stop') return execute();
        throw new Error('RadioCLI has too many active control requests.');
      }
      const entry: {fingerprint: string; result: Promise<RadioSessionResult>; settledAt?: number} = {fingerprint, result: Promise.resolve().then(execute)};
      requests.set(requestId, entry);
      void entry.result.then(() => { entry.settledAt = Date.now(); }, () => { entry.settledAt = Date.now(); });
      return entry.result;
    };
    // An owner shared with desktop controls already serializes accepted work.
    // Submit each authenticated, complete request directly to that queue so a
    // later desktop action cannot overtake an earlier HTTP request here.
    const work = options.queue === 'owner' ? accept() : serial.then(accept);
    if (options.queue !== 'owner') serial = work.then(() => undefined, () => undefined);
    void work.then(result => res.end(JSON.stringify(result))).catch(error => {
      res.statusCode = 400;
      res.end(JSON.stringify({error: error instanceof Error ? error.message : 'Radio control failed.'}));
    });
  });
  try {
    const address = await listenLoopback(server);
    const discovery: Discovery = {
      version: 1,
      protocol: 2,
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

export async function connectRadioSession(filePath = radioSessionPath(), options: SessionClientOptions = {}): Promise<RadioSessionClient | null> {
  options.signal?.throwIfAborted();
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
  const call = async (command: RadioSessionCommand, requestId = randomUUID()): Promise<RadioSessionResult> => {
    const validated = parseRadioCommand(command);
    const payload = JSON.stringify(discovery.protocol === 2 ? {version: 2, requestId, command: validated} : validated);
    return new Promise<RadioSessionResult>((resolve, reject) => {
      const req = request({
        host: discovery.host,
        // Local control tokens must never be forwarded by an environment proxy.
        agent: false,
        signal: options.signal,
        port: discovery.port,
        path: '/command',
        method: 'POST',
        headers: {
          authorization: `Bearer ${discovery.token}`,
          'x-radiocli-client': options.source ?? 'agent',
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload)
        }
      }, res => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', value => { text += String(value); if (Buffer.byteLength(text) > 8 * 1024 * 1024) res.destroy(new Error('RadioCLI response too large.')); });
        res.once('error', reject);
        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode < 300) {
              const parsed = JSON.parse(text) as RadioSessionResult;
              if (typeof parsed.ok !== 'boolean' || typeof parsed.message !== 'string' || !parsed.status?.playback || !Array.isArray(parsed.status.queue)) throw new Error('Invalid RadioCLI control response.');
              resolve(parsed);
            } else reject(new Error(parseError(text)));
          } catch (error) { reject(error); }
        });
      });
      req.once('error', reject);
      const timeout = command.type === 'status' ? 5000 : ['stop', 'alarm-preempt'].includes(command.type) ? 15_000 : 120_000;
      req.setTimeout(timeout, () => req.destroy(new Error(`RadioCLI control request timed out. Request ID: ${requestId}. Retry with the same ID to retrieve its outcome.`)));
      req.end(payload);
    });
  };
  try {
    await call({type: 'status'});
    options.signal?.throwIfAborted();
    return {call, status: async () => (await call({type: 'status'})).status};
  } catch {
    options.signal?.throwIfAborted();
    // A slow command does not prove that a playback host is dead. Retain both
    // ownership records while its PID is alive so a second host cannot start.
    if (!processAlive(discovery.pid)) {
      removeIfOwned(filePath, discovery);
      removeOwner(`${filePath}.owner`, discovery.pid);
    }
    return null;
  }
}

export async function ensureRadioSession(start: () => Promise<void>, timeoutMs = 15_000, options: SessionClientOptions = {}): Promise<RadioSessionClient> {
  options.signal?.throwIfAborted();
  const existing = await connectRadioSession(undefined, options);
  options.signal?.throwIfAborted();
  if (existing) return existing;
  const lockPath = `${radioSessionPath()}.launch`;
  let ownsLaunch = false;
  try {
    acquireOwner(lockPath);
    ownsLaunch = true;
    const appeared = await connectRadioSession(undefined, options);
    options.signal?.throwIfAborted();
    if (appeared) return appeared;
    await start();
    options.signal?.throwIfAborted();
    return await waitForSession(timeoutMs, options);
  } catch (error) {
    if (ownsLaunch || !(error instanceof Error) || !error.message.includes('already active')) throw error;
    return waitForSession(timeoutMs, options);
  } finally {
    if (ownsLaunch) removeOwner(lockPath, process.pid);
  }
}

function radioSessionPath(): string {
  return join(runtimeDirectory(), 'agent-session.json');
}

/** Optional terminal recovery may fall back to inline playback only when no
 * live or unknown owner could already be using this library's audio session. */
export function radioSessionMayBeActive(): boolean {
  for (const path of [`${radioSessionPath()}.owner`, `${radioSessionPath()}.launch`, radioSessionPath()]) {
    try {
      const text = readFileSync(path, 'utf8');
      const pid = path.endsWith('.json') ? (JSON.parse(text) as Discovery).pid : Number(text.trim());
      if (!Number.isSafeInteger(pid) || pid <= 0 || processAlive(pid)) return true;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return true; }
  }
  return false;
}

async function waitForSession(timeoutMs: number, options: SessionClientOptions): Promise<RadioSessionClient> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    options.signal?.throwIfAborted();
    const client = await connectRadioSession(undefined, options);
    options.signal?.throwIfAborted();
    if (client) return client;
    await controlPollDelay(options.signal);
  }
  throw new Error('RadioCLI was launched but its control session did not become ready.');
}

function controlPollDelay(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, 100);
    signal?.addEventListener('abort', abort, {once: true});
  });
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

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', value => {
      body += String(value);
      if (Buffer.byteLength(body) > 4 * 1024 * 1024) req.destroy(new Error('Request too large.'));
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
