import {z} from 'zod';
import type {ResolvedStream, SearchOptions, Station} from '../types.js';
import {withExternalResponse} from '../platform/network.js';

const searchSchema = z
  .object({
    hits: z
      .array(
        z
          .object({
            _source: z
              .object({
                type: z.string().optional(),
                title: z.string().optional(),
                subtitle: z.string().optional(),
                url: z.string().optional()
              })
              .passthrough()
              .optional()
          })
          .passthrough()
      )
      .optional()
  })
  .passthrough();

export class RadioGardenProvider {
  readonly id = 'radio-garden' as const;
  readonly label = 'Radio Garden';
  private readonly baseUrl: string;

  constructor(baseUrl = 'https://radio.garden/api') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async health(): Promise<string> {
    try {
      return await withExternalResponse(`${this.baseUrl}/geo`, {
        timeoutMs: 5000,
        init: {headers: {'User-Agent': 'radiocli/0.1'}}
      }, response => {
        if (response.status === 403) return 'blocked by edge protection';
        return response.ok ? 'online' : `${response.status} ${response.statusText}`;
      });
    } catch (error) {
      return error instanceof Error ? error.message : 'unavailable';
    }
  }

  async search(query: string, options: SearchOptions = {}): Promise<Station[]> {
    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set('q', query);

    const parsed = await withExternalResponse(url, {
      timeoutMs: 9000,
      init: {headers: {'User-Agent': 'radiocli/0.1', Accept: 'application/json'}}
    }, async response => {
      if (!response.ok) throw new Error(`${this.label} search failed: ${response.status} ${response.statusText}`);
      return searchSchema.parse(await response.json());
    });
    return (parsed.hits ?? [])
      .map(hit => hit._source)
      .filter((source): source is NonNullable<typeof source> => source?.type === 'channel' && Boolean(source.url))
      .map(source => {
        const id = source.url!.split('/').filter(Boolean).pop() ?? source.url!;
        return {
          id,
          provider: this.id,
          name: source.title ?? id,
          country: source.subtitle,
          tags: ['radio garden'],
          streamUrl: `${this.baseUrl}/ara/content/listen/${encodeURIComponent(id)}/channel.mp3`
        } satisfies Station;
      })
      .slice(0, options.limit ?? 30);
  }

  async resolve(station: Station): Promise<ResolvedStream> {
    if (station.streamUrl) {
      return {url: station.streamUrl, name: station.name};
    }

    return {
      url: `${this.baseUrl}/ara/content/listen/${encodeURIComponent(station.id)}/channel.mp3`,
      name: station.name
    };
  }
}
