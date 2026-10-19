import {describe, expect, it} from 'vitest';
import type {DiscoveryPage} from '../types.js';
import {DiscoverySessions} from './discovery-session.js';

type State = {index: number};
const create = (): State => ({index: 0});
const produce = async (state: State): Promise<DiscoveryPage> => ({items: [{id: String(state.index++), provider: 'playlist', name: 'Station', tags: []}], exhausted: false, sources: []});

describe('bounded discovery sessions', () => {
  it('deduplicates overlapping calls for a cursor and protects stored replay data', async () => {
    const sessions = new DiscoverySessions<State>(() => 64);
    const first = await sessions.page('query', undefined, create, produce);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    const delayed = async (state: State) => { calls += 1; await gate; return produce(state); };
    const left = sessions.page('query', first.nextCursor, create, delayed);
    const right = sessions.page('query', first.nextCursor, create, delayed);
    release();
    const [a, b] = await Promise.all([left, right]);
    expect(calls).toBe(1);
    expect(a.items[0]?.id).toBe('1');
    a.items[0]!.name = 'Changed by caller';
    expect(b.items[0]?.name).toBe('Station');
    expect((await sessions.page('query', first.nextCursor, create, produce)).items[0]?.name).toBe('Station');
  });

  it('expires idle sessions and evicts the least recently used session by count', async () => {
    let now = 0;
    const sessions = new DiscoverySessions<State>(() => 64, {maxSessions: 2, ttlMs: 100, now: () => now});
    const first = await sessions.page('first', undefined, create, produce);
    now = 1;
    const second = await sessions.page('second', undefined, create, produce);
    now = 2;
    await sessions.page('third', undefined, create, produce);
    await expect(sessions.page('first', first.nextCursor, create, produce)).rejects.toThrow(/expired/);
    now = 101;
    await expect(sessions.page('second', second.nextCursor, create, produce)).rejects.toThrow(/expired/);
  });

  it('rejects over-budget state without committing its mutation', async () => {
    const sessions = new DiscoverySessions<State>(state => state.index > 1 ? 10_000 : 64, {maxBytes: 1000});
    const first = await sessions.page('query', undefined, create, produce);
    await expect(sessions.page('query', first.nextCursor, create, produce)).rejects.toThrow(/capacity/);
    const retried = await sessions.page('query', first.nextCursor, create, async state => ({items: [], exhausted: state.index === 1, sources: []}));
    expect(retried.exhausted).toBe(true);
  });
});
