import {describe, expect, it} from 'vitest';
import {IcyMetadataReader, parseStreamTitle} from './icy.js';

describe('ICY metadata parsing', () => {
  it('extracts StreamTitle values', () => {
    expect(parseStreamTitle("StreamTitle='Artist - Track';StreamUrl='';")).toBe('Artist - Track');
  });

  it('parses a metadata block after the audio interval', () => {
    const seen: string[] = [];
    const reader = new IcyMetadataReader(4, metadata => {
      if (metadata.title) {
        seen.push(metadata.title);
      }
    });
    const metadata = Buffer.from("StreamTitle='Live Set';");
    const blocks = Math.ceil(metadata.length / 16);
    const padded = Buffer.concat([metadata, Buffer.alloc(blocks * 16 - metadata.length)]);
    reader.feed(Buffer.concat([Buffer.from([1, 2, 3, 4]), Buffer.from([blocks]), padded]));
    expect(seen).toEqual(['Live Set']);
  });
});
