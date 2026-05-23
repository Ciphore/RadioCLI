import type {IcyNowPlaying} from '../types.js';

export type IcyMetadataHandler = (metadata: IcyNowPlaying) => void;

export class IcyMetadataReader {
  private audioBytesUntilMetadata: number;
  private metadataLength: number | null = null;
  private metadataBuffer: number[] = [];

  constructor(
    private readonly metadataInterval: number,
    private readonly onMetadata: IcyMetadataHandler
  ) {
    this.audioBytesUntilMetadata = metadataInterval;
  }

  feed(chunk: Uint8Array): void {
    let offset = 0;

    while (offset < chunk.length) {
      if (this.audioBytesUntilMetadata > 0) {
        const skip = Math.min(this.audioBytesUntilMetadata, chunk.length - offset);
        this.audioBytesUntilMetadata -= skip;
        offset += skip;
        continue;
      }

      if (this.metadataLength === null) {
        this.metadataLength = chunk[offset]! * 16;
        offset += 1;
        if (this.metadataLength === 0) {
          this.resetCycle();
        }
        continue;
      }

      const take = Math.min(this.metadataLength - this.metadataBuffer.length, chunk.length - offset);
      this.metadataBuffer.push(...chunk.slice(offset, offset + take));
      offset += take;

      if (this.metadataBuffer.length === this.metadataLength) {
        const raw = Buffer.from(this.metadataBuffer).toString('utf8').replace(/\0+$/g, '').trim();
        const title = parseStreamTitle(raw);
        if (raw || title) {
          this.onMetadata({title, raw, updatedAt: new Date().toISOString()});
        }

        this.resetCycle();
      }
    }
  }

  private resetCycle(): void {
    this.audioBytesUntilMetadata = this.metadataInterval;
    this.metadataLength = null;
    this.metadataBuffer = [];
  }
}

export function parseStreamTitle(raw: string): string | undefined {
  const match = /StreamTitle='([^']*)'/.exec(raw) ?? /StreamTitle="([^"]*)"/.exec(raw);
  const title = match?.[1]?.replace(/\s+/g, ' ').trim();
  return title || undefined;
}

export async function watchIcyMetadata(url: string, onMetadata: IcyMetadataHandler, signal: AbortSignal): Promise<void> {
  const response = await fetch(url, {
    signal,
    headers: {
      'Icy-MetaData': '1',
      'User-Agent': 'radio-atlas/0.1',
      Accept: '*/*'
    }
  });

  if (!response.ok || !response.body) {
    return;
  }

  const interval = Number(response.headers.get('icy-metaint'));
  if (!Number.isFinite(interval) || interval <= 0) {
    return;
  }

  const reader = new IcyMetadataReader(interval, onMetadata);
  const stream = response.body.getReader();

  while (!signal.aborted) {
    const {done, value} = await stream.read();
    if (done || !value) {
      break;
    }

    reader.feed(value);
  }
}
