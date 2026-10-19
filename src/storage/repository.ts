import {Worker} from 'node:worker_threads';
import type {Alarm, AlarmCreateInput, AlarmRunRecord, AppSettings, LibraryState, Station, UpdateCheckState} from '../types.js';
import {JsonLibraryStore, stationKey, type LibraryImportResult} from './store.js';

const methods = ['snapshot', 'savePreset', 'removePreset', 'exportBackup', 'importBackup', 'updateSettings', 'updateCheckState',
  'addAlarm', 'updateAlarm', 'removeAlarm', 'toggleAlarm', 'recordAlarmOutcome', 'snoozeAlarm', 'clearAlarmSnooze',
  'addRecent', 'recordTrack', 'addSearch', 'startListeningSession', 'checkpointActiveListeningSession',
  'finishActiveListeningSession', 'toggleFavorite', 'addImported'] as const;
type Method = typeof methods[number];
type Request = {id: number; method: Method; args: unknown[]};
type Reply = {ready?: boolean; id?: number; result?: unknown; state?: LibraryState; error?: {message: string; name: string; code?: string}};
type Pending = {request: Request; resolve: (result: unknown) => void; reject: (error: Error) => void};

/** One ordered transactional writer, off the UI/audio event loop. Sync stores remain
 * usable for short-lived commands and injected adapters; success follows persistence. */
export class LibraryRepository {
  readonly filePath: string;
  private state: LibraryState;
  private readonly listeners = new Set<(state: LibraryState) => void>();
  private readonly errors = new Set<(error: Error) => void>();
  private readonly pending = new Map<number, Pending>();
  private worker: Worker | undefined;
  private nextId = 1;
  private inlineQueue: Promise<unknown> = Promise.resolve();
  private closed = false;
  private failure: Error | undefined;
  private closing: Promise<void> | undefined;
  private workerReady = false;
  private fallbackRefresh: NodeJS.Timeout | undefined;

  constructor(private readonly store: JsonLibraryStore, options: {worker?: boolean} = {}) {
    this.filePath = store.filePath;
    this.state = store.snapshot();
    if (options.worker === false) { this.startFallbackRefresh(); return; }
    const source = import.meta.url.endsWith('.ts');
    const storeUrl = new URL(source ? './store.ts' : './store.js', import.meta.url).href;
    try { this.worker = new Worker(repositoryWorker, {eval: true, workerData: {storeUrl, source, filePath: this.filePath, methods}, execArgv: []}); }
    catch { this.startFallbackRefresh(); return; /* Some restricted hosts disable threads; transactional storage still works. */ }
    this.worker.on('message', (reply: Reply) => this.receive(reply));
    this.worker.on('error', error => this.fail(error));
    this.worker.on('exit', code => { if (!this.closed) this.fail(new Error(`Library worker exited (${code}).`)); });
    this.worker.unref();
  }

  snapshot(): LibraryState { return structuredClone(this.state); }
  getSnapshot(): LibraryState { return this.state; }
  settings(): AppSettings { return structuredClone(this.state.settings); }
  listAlarms(): Alarm[] { return structuredClone(this.state.alarms); }
  getAlarm(id: string): Alarm | undefined { return structuredClone(this.state.alarms.find(alarm => alarm.id === id)); }
  isFavorite(station?: Station | null): boolean { return Boolean(station && this.state.favorites.some(item => stationKey(item) === stationKey(station))); }
  subscribe(listener: (state: LibraryState) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  onError(listener: (error: Error) => void): () => void { this.errors.add(listener); return () => this.errors.delete(listener); }
  readFresh(): Promise<LibraryState> { return this.call('snapshot'); }
  savePreset(name: string, station: Station): Promise<void> { return this.call('savePreset', name, station); }
  removePreset(name: string): Promise<void> { return this.call('removePreset', name); }
  exportBackup(path?: string): Promise<string> { return this.call('exportBackup', path); }
  importBackup(path: string): Promise<LibraryImportResult> { return this.call('importBackup', path); }
  updateSettings(settings: Partial<AppSettings>): Promise<LibraryState> { return this.call('updateSettings', settings); }
  updateCheckState(state: UpdateCheckState): Promise<LibraryState> { return this.call('updateCheckState', state); }
  addAlarm(input: AlarmCreateInput): Promise<Alarm> { return this.call('addAlarm', input); }
  updateAlarm(id: string, updates: Parameters<JsonLibraryStore['updateAlarm']>[1]): Promise<Alarm> { return this.call('updateAlarm', id, updates); }
  removeAlarm(id: string): Promise<boolean> { return this.call('removeAlarm', id); }
  toggleAlarm(id: string, enabled?: boolean): Promise<Alarm> { return this.call('toggleAlarm', id, enabled); }
  recordAlarmOutcome(id: string, outcome: AlarmRunRecord, options?: {clearNextOverride?: boolean}): Promise<Alarm> { return this.call('recordAlarmOutcome', id, outcome, options); }
  snoozeAlarm(id: string, until: Date): Promise<Alarm> { return this.call('snoozeAlarm', id, until); }
  clearAlarmSnooze(id: string): Promise<Alarm> { return this.call('clearAlarmSnooze', id); }
  addRecent(station: Station): Promise<LibraryState> { return this.call('addRecent', station); }
  recordTrack(station: Station, title: string): Promise<LibraryState> { return this.call('recordTrack', station, title); }
  addSearch(query: string): Promise<LibraryState> { return this.call('addSearch', query); }
  startListeningSession(station: Station, at = new Date()): Promise<LibraryState> { return this.call('startListeningSession', station, at); }
  checkpointActiveListeningSession(at = new Date()): Promise<LibraryState> { return this.call('checkpointActiveListeningSession', at); }
  finishActiveListeningSession(at = new Date()): Promise<LibraryState> { return this.call('finishActiveListeningSession', at); }
  toggleFavorite(station: Station): Promise<LibraryState> { return this.call('toggleFavorite', station); }
  addImported(stations: Station[]): Promise<LibraryState> { return this.call('addImported', stations); }

  async flush(): Promise<void> {
    // A barrier command follows every previously submitted semantic mutation.
    await this.readFresh();
  }
  close(): Promise<void> {
    return this.closing ??= (async () => {
      try { await this.flush(); }
      finally {
        this.closed = true;
        clearInterval(this.fallbackRefresh);
        await this.worker?.terminate();
        for (const pending of this.pending.values()) pending.reject(new Error('RadioCLI library repository is closed.'));
        this.pending.clear(); this.listeners.clear(); this.errors.clear();
      }
    })();
  }

  private call<T>(method: Method, ...args: unknown[]): Promise<T> {
    if (this.closed || this.closing) return Promise.reject(new Error('RadioCLI library repository is closed.'));
    return this.enqueue<T>(method, args);
  }
  private enqueue<T>(method: Method, args: unknown[]): Promise<T> {
    if (this.failure) return Promise.reject(this.failure);
    if (!this.worker) {
      const result = this.inlineQueue.catch(() => undefined).then(() => {
        const operation = this.store[method] as (...values: unknown[]) => unknown;
        const value = operation.apply(this.store, args);
        this.publish(this.store.cachedSnapshot());
        return value as T;
      });
      this.inlineQueue = result;
      return result;
    }
    const id = this.nextId++;
    this.worker.ref();
    return new Promise<T>((resolve, reject) => {
      const request = {id, method, args} satisfies Request;
      this.pending.set(id, {request, resolve: value => resolve(value as T), reject});
      try { if (this.workerReady) this.worker!.postMessage(request); }
      catch (error) { this.pending.delete(id); reject(error); if (!this.pending.size) this.worker!.unref(); }
    });
  }

  private receive(reply: Reply): void {
    if (reply.state) this.publish(reply.state);
    if (reply.ready) {
      this.workerReady = true;
      for (const {request} of this.pending.values()) this.worker!.postMessage(request);
      return;
    }
    if (reply.id === undefined) {
      if (reply.error) this.report(deserializeError(reply.error));
      return;
    }
    const pending = this.pending.get(reply.id);
    this.pending.delete(reply.id);
    if (reply.error) pending?.reject(deserializeError(reply.error));
    else pending?.resolve(reply.result);
    if (!this.pending.size) this.worker?.unref();
  }
  private publish(state: LibraryState): void {
    this.state = state;
    for (const listener of this.listeners) { try { listener(state); } catch { /* Consumers cannot invalidate a durable commit. */ } }
  }
  private report(error: Error): void { for (const listener of this.errors) { try { listener(error); } catch { /* Isolate observers. */ } } }
  private fail(error: Error): void {
    if (!this.workerReady && this.worker) {
      const worker = this.worker;
      this.worker = undefined;
      void worker.terminate();
      this.startFallbackRefresh();
      // No operation is sent before the ready handshake, so this fallback cannot
      // replay a possibly committed toggle or alarm mutation.
      const waiting = [...this.pending.values()];
      this.pending.clear();
      for (const pending of waiting) void this.enqueue(pending.request.method, pending.request.args).then(pending.resolve, pending.reject);
      this.report(new Error(`Library worker unavailable; using transactional storage: ${error.message}`));
      return;
    }
    if (!this.workerReady && !this.worker) return;
    this.failure = error;
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
    this.worker?.unref();
    this.report(error);
  }
  private startFallbackRefresh(): void {
    this.fallbackRefresh ??= setInterval(() => {
      if (this.closed || this.closing) return;
      const refresh = this.inlineQueue.catch(() => undefined).then(() => {
        if (this.store.refresh()) this.publish(this.store.cachedSnapshot());
      }).catch(error => this.report(error instanceof Error ? error : new Error(String(error))));
      this.inlineQueue = refresh;
    }, 1000);
    this.fallbackRefresh.unref();
  }
}

function deserializeError(value: NonNullable<Reply['error']>): Error {
  return Object.assign(new Error(value.message), {name: value.name, ...(value.code ? {code: value.code} : {})});
}

// Only enumerated semantic operations cross the worker boundary. No user data
// becomes executable code. Source mode uses the existing development runner;
// the packed build loads ordinary ESM and has no development dependency.
const repositoryWorker = `
const {parentPort, workerData} = require('node:worker_threads');
const {watch} = require('node:fs');
const {dirname} = require('node:path');
(async () => {
  const module = workerData.source
    ? await (await import('tsx/esm/api')).tsImport(workerData.storeUrl, {parentURL: workerData.storeUrl})
    : await import(workerData.storeUrl);
  const store = new module.JsonLibraryStore(workerData.filePath);
  const allowed = new Set(workerData.methods);
  const errorValue = error => ({message: error.message || 'Library operation failed.', name: error.name || 'Error', code: error.code});
  let queue = Promise.resolve();
  let watcher;
  const refresh = () => {
    try { if (store.refresh()) parentPort.postMessage({state: store.snapshot()}); }
    catch (error) { parentPort.postMessage({error: errorValue(error)}); }
  };
  try { watcher = watch(dirname(workerData.filePath), {persistent: false}, () => { queue = queue.catch(() => {}).then(refresh); }); }
  catch { /* Missing folders and platforms without watchers use the revision fallback. */ }
  const timer = setInterval(() => { queue = queue.catch(() => {}).then(refresh); }, 1000);
  timer.unref();
  parentPort.on('message', request => {
    queue = queue.catch(() => {}).then(async () => {
      try {
        if (!allowed.has(request.method)) throw new Error('Unknown library operation.');
        const result = await store[request.method](...request.args);
        const state = result && result.settings && result.activity ? result : store.cachedSnapshot();
        parentPort.postMessage({id: request.id, result, state});
      } catch (error) { parentPort.postMessage({id: request.id, error: errorValue(error)}); }
    });
  });
  parentPort.postMessage({ready: true, state: store.snapshot()});
})().catch(error => { throw error; });
`;
