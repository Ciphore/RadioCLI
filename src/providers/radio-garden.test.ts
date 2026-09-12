import {afterEach, describe, expect, it, vi} from 'vitest';
import {RadioGardenProvider} from './radio-garden.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('RadioGardenProvider networking', () => {
  it('does not search or probe provider health when offline', async () => {
    vi.stubEnv('RADIOCLI_OFFLINE', '1');
    const fetch = vi.fn(async () => new Response('{"hits":[]}'));
    vi.stubGlobal('fetch', fetch);
    const provider = new RadioGardenProvider();
    await expect(provider.search('jazz')).rejects.toThrow(/offline/i);
    expect(await provider.health()).toMatch(/offline/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves supplied stream URLs when offline', async () => {
    vi.stubEnv('RADIOCLI_OFFLINE', '1');
    const fetch = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetch);
    const provider = new RadioGardenProvider();
    const station = {id: 'saved', provider: 'radio-garden' as const, name: 'Saved station', tags: [], streamUrl: 'https://stream.example/live.mp3'};
    expect(await provider.resolve(station)).toEqual({url: station.streamUrl, name: station.name});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('aborts a search whose response body stalls after headers', async () => {
    vi.useFakeTimers();
    let body!: ReadableStreamDefaultController<Uint8Array>;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream<Uint8Array>({start(controller) {body = controller;}}))));
    let error: Error | undefined;
    const searching = new RadioGardenProvider().search('jazz').catch(value => {error = value as Error;});
    try {
      await vi.advanceTimersByTimeAsync(9001);
      expect(error?.message).toMatch(/timed out/i);
    } finally {
      body.error(new Error('test cleanup'));
      await searching;
    }
  });

  it('cancels an unused edge-protection response body', async () => {
    const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({cancel}), {status: 403})));
    expect(await new RadioGardenProvider().health()).toBe('blocked by edge protection');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('retains ordinary search behavior in low-bandwidth mode', async () => {
    vi.stubEnv('RADIOCLI_LOW_BANDWIDTH', '1');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({hits: [{_source: {type: 'channel', title: 'Jazz FM', url: '/listen/jazz/one', subtitle: 'Japan'}}]}))));
    expect(await new RadioGardenProvider().search('jazz')).toMatchObject([{id: 'one', name: 'Jazz FM'}]);
  });
});
