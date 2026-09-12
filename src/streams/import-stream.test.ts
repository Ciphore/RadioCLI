import {describe, expect, it} from 'vitest';
import {importStreamUrl} from './import-stream.js';

describe('direct stream import', () => {
  it('discovers station details from portable HTTP and ICY headers', async () => {
    const fetchImpl = async () => new Response('', {
      status: 200,
      headers: {
        'content-type': 'audio/aac',
        'icy-name': 'Hits 106.1',
        'icy-description': 'KBKS-FM',
        'icy-url': 'https://example.com/station',
        'icy-audio-info': 'bitrate=48;samplerate=48000;channels=2'
      }
    });

    const result = await importStreamUrl('https://streams.example.com/zc4257', undefined, {fetchImpl});

    expect(result).toMatchObject({identified: true});
    expect(result.station).toMatchObject({
      provider: 'playlist',
      name: 'Hits 106.1',
      streamUrl: 'https://streams.example.com/zc4257',
      homepage: 'https://example.com/station',
      codec: 'AAC',
      bitrate: 48,
      tags: ['custom']
    });
  });

  it('lets an explicit name override published metadata', async () => {
    const fetchImpl = async () => new Response('', {headers: {'content-type': 'audio/mpeg', 'icy-name': 'Server name'}});
    const result = await importStreamUrl('https://example.com/live', 'My Station', {fetchImpl});
    expect(result.station.name).toBe('My Station');
    expect(result.station.codec).toBe('MP3');
  });

  it('saves a useful fallback when a metadata probe cannot connect', async () => {
    const fetchImpl = async () => { throw new Error('offline'); };
    const result = await importStreamUrl('https://radio.example/live-stream.mp3', undefined, {fetchImpl});
    expect(result.station.name).toBe('live stream');
    expect(result.station.streamUrl).toBe('https://radio.example/live-stream.mp3');
    expect(result.warning).toMatch(/Could not read stream metadata/);
  });

  it('rejects webpages and credential-bearing URLs', async () => {
    const fetchImpl = async () => new Response('<html></html>', {headers: {'content-type': 'text/html'}});
    await expect(importStreamUrl('https://example.com/station', undefined, {fetchImpl})).rejects.toThrow(/not a direct radio stream/i);
    await expect(importStreamUrl('https://user:secret@example.com/live', undefined, {fetchImpl})).rejects.toThrow(/credentials/i);
  });

  it('detects HLS without requiring native platform commands', async () => {
    const fetchImpl = async () => new Response('', {headers: {'content-type': 'application/vnd.apple.mpegurl'}});
    const result = await importStreamUrl('https://example.com/live.m3u8', undefined, {fetchImpl});
    expect(result.station).toMatchObject({codec: 'HLS', hls: true});
  });

  it('uses the canonical iHeart listing when the audio headers omit a name', async () => {
    const fetchImpl = async (input: string | URL) => String(input).includes('www.iheart.com')
      ? new Response('', {status: 301, headers: {location: '/live/jamn-107-5-4319/'}})
      : new Response('', {headers: {'content-type': 'audio/aac'}});
    const result = await importStreamUrl('https://stream.revma.ihrhls.com/zc4319', undefined, {fetchImpl});
    expect(result).toMatchObject({identified: true});
    expect(result.station).toMatchObject({
      name: "JAM'N 107.5",
      homepage: 'https://www.iheart.com/live/jamn-107-5-4319/',
      codec: 'AAC'
    });
  });
});
