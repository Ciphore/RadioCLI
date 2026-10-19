import {setImmediate as nextEventLoopTurn} from 'node:timers/promises';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {withExternalResponse} from './network.js';

beforeEach(() => {
  for (const key of ['HTTP_PROXY', 'http_proxy', 'HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy', 'RADIOCLI_OFFLINE']) vi.stubEnv(key, undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('bounded network bodies and asynchronous JSON', () => {
  it('rejects an oversized declared body before invoking the consumer and cancels it', async () => {
    const cancel = vi.fn();
    const consume = vi.fn(response => response.json());
    await expect(withExternalResponse('https://example.test', {
      timeoutMs: 1000, maxResponseBytes: 16,
      fetchImpl: async () => new Response(new ReadableStream({cancel}), {headers: {'content-length': '17'}})
    }, consume)).rejects.toThrow(/safety limit/);
    expect(consume).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('counts actual bytes for chunked bodies with missing or deceptive content length', async () => {
    for (const declared of [undefined, '1']) {
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({start(controller) { controller.enqueue(new TextEncoder().encode('東京')); }, cancel});
      await expect(withExternalResponse('https://example.test', {
        timeoutMs: 1000, maxResponseBytes: 5,
        fetchImpl: async () => new Response(body, {headers: declared ? {'content-length': declared} : {}})
      }, response => response.text())).rejects.toThrow(/5 byte safety limit/);
      expect(cancel).toHaveBeenCalledOnce();
    }
  });

  it('retains redirect metadata and makes large JSON parsing yield to input', async () => {
    const rows = Array.from({length: 4000}, (_, index) => ({index, title: '東京 · Rádio'.repeat(30)}));
    const response = Response.json(rows);
    Object.defineProperty(response, 'url', {value: 'https://example.test/redirected'});
    Object.defineProperty(response, 'redirected', {value: true});
    const events: string[] = [];
    const reading = withExternalResponse('https://example.test', {timeoutMs: 5000, fetchImpl: async () => response}, async bounded => {
      expect(bounded.url).toBe(response.url);
      expect(bounded.redirected).toBe(true);
      const parsed = await bounded.json();
      events.push('parsed');
      return parsed;
    });
    await nextEventLoopTurn();
    events.push('input');
    expect(await reading).toEqual(rows);
    expect(events).toEqual(['input', 'parsed']);
  });

  it('cancels a locked custom stream when its caller aborts', async () => {
    const controller = new AbortController();
    const reason = new Error('stop');
    const cancel = vi.fn();
    let reading!: () => void;
    const ready = new Promise<void>(resolve => { reading = resolve; });
    const body = new ReadableStream<Uint8Array>({pull() { reading(); return new Promise<void>(() => undefined); }, cancel});
    const request = withExternalResponse('https://example.test', {
      timeoutMs: 5000, init: {signal: controller.signal}, fetchImpl: async () => new Response(body)
    }, response => response.json());
    await ready;
    controller.abort(reason);
    await expect(request).rejects.toBe(reason);
    expect(cancel).toHaveBeenCalledOnce();
  });
});
