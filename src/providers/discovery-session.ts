import {randomUUID} from 'node:crypto';
import type {DiscoveryPage} from '../types.js';

type CursorSession<State> = {
  id: string;
  fingerprint: string;
  state: State;
  nextPage: number;
  touchedAt: number;
  bytes: number;
  last?: {index: number; page: DiscoveryPage};
  pending?: {index: number; promise: Promise<DiscoveryPage>};
};

/** Cursor state is private, bounded, and committed only after a complete page.
 * One-page replay makes retries safe without retaining every returned station. */
export class DiscoverySessions<State> {
  private readonly sessions = new Map<string, CursorSession<State>>();

  constructor(
    private readonly sizeOf: (state: State) => number,
    private readonly options: {maxSessions?: number; maxBytes?: number; ttlMs?: number; now?: () => number} = {}
  ) {}

  async page(
    fingerprint: string,
    cursor: string | undefined,
    create: () => State,
    produce: (state: State) => Promise<DiscoveryPage>,
    signal?: AbortSignal
  ): Promise<DiscoveryPage> {
    signal?.throwIfAborted();
    const now = this.options.now?.() ?? Date.now();
    this.prune(now);
    let session: CursorSession<State>;
    let index = 0;
    if (cursor) {
      const match = /^([a-f0-9-]{36}):(\d+)$/.exec(cursor);
      const found = match ? this.sessions.get(match[1]!) : undefined;
      index = Number(match?.[2]);
      if (!found || !Number.isSafeInteger(index)) throw cursorError();
      if (found.fingerprint !== fingerprint) throw new Error('Discovery cursor does not match this query or its filters. Start the search again.');
      session = found;
    } else {
      this.makeRoom(1, 0);
      const state = create();
      session = {id: randomUUID(), fingerprint, state, nextPage: 0, touchedAt: now, bytes: this.sizeOf(state)};
      this.sessions.set(session.id, session);
    }
    session.touchedAt = now;
    if (session.last?.index === index) return structuredClone(session.last.page);
    if (session.pending?.index === index) return structuredClone(await abortable(session.pending.promise, signal));
    if (index !== session.nextPage || session.pending) throw cursorError();

    // Keep offsets and overflow intact if a request fails or its caller cancels.
    const draft = structuredClone(session.state);
    const work = (async () => {
      const page = await produce(draft);
      signal?.throwIfAborted();
      const bytes = this.sizeOf(draft) + JSON.stringify(page).length * 2;
      this.makeRoom(0, bytes - session.bytes, session.id);
      const result: DiscoveryPage = {
        ...page,
        nextCursor: page.exhausted ? undefined : `${session.id}:${index + 1}`
      };
      session.state = draft;
      session.bytes = bytes;
      session.nextPage = index + 1;
      session.last = {index, page: result};
      return result;
    })();
    session.pending = {index, promise: work};
    try {
      return structuredClone(await work);
    } catch (error) {
      if (session.nextPage === 0) this.sessions.delete(session.id);
      throw error;
    } finally {
      if (session.pending?.promise === work) session.pending = undefined;
    }
  }

  private prune(now: number): void {
    const ttl = this.options.ttlMs ?? 10 * 60_000;
    for (const [id, session] of this.sessions) {
      if (!session.pending && (now < session.touchedAt || now - session.touchedAt >= ttl)) this.sessions.delete(id);
    }
  }

  private makeRoom(additionalCount: number, additionalBytes: number, protectedId?: string): void {
    const maxSessions = this.options.maxSessions ?? 16;
    const maxBytes = this.options.maxBytes ?? 32 * 1024 * 1024;
    let bytes = [...this.sessions.values()].reduce((sum, entry) => sum + entry.bytes, 0) + additionalBytes;
    const candidates = [...this.sessions.values()]
      .filter(entry => entry.id !== protectedId && !entry.pending)
      .sort((left, right) => left.touchedAt - right.touchedAt);
    while (this.sessions.size + additionalCount > maxSessions || bytes > maxBytes) {
      const oldest = candidates.shift();
      if (!oldest) throw new Error('Discovery session capacity reached. Finish another search or start a narrower query.');
      this.sessions.delete(oldest.id);
      bytes -= oldest.bytes;
    }
  }
}

/** Abort the wait even when an injected provider or DNS resolver ignores signal. */
export function abortable<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  if (signal.aborted) {
    void work.catch(() => undefined);
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener('abort', aborted, {once: true});
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}

function cursorError(): Error {
  return new Error('Discovery cursor expired or is no longer available. Start the search again.');
}
