import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {parsePlaylistFile, writeM3u} from './playlist.js';

const roots: string[] = [];

describe('playlist import/export', () => {
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, {recursive: true, force: true});
    }
  });

  it('parses m3u and exports m3u', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-playlist-'));
    roots.push(root);
    const input = join(root, 'stations.m3u');
    const output = join(root, 'favorites.m3u');
    writeFileSync(input, '#EXTM3U\n#EXTINF:-1,Test FM\nhttps://example.com/live.mp3\n', 'utf8');

    const stations = parsePlaylistFile(input);
    expect(stations[0]?.name).toBe('Test FM');
    writeM3u(output, stations);
    expect(parsePlaylistFile(output)[0]?.streamUrl).toBe('https://example.com/live.mp3');
  });

  it('parses pls', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-playlist-'));
    roots.push(root);
    const input = join(root, 'stations.pls');
    writeFileSync(input, '[playlist]\nFile1=https://example.com/aac\nTitle1=PLS FM\n', 'utf8');
    expect(parsePlaylistFile(input)[0]?.name).toBe('PLS FM');
  });

  it.each(['m3u', 'pls'])('imports native absolute and relative media paths from %s', format => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli playlist café ')); roots.push(root);
    const audio = join(root, 'my recording.mp3'); writeFileSync(audio, 'fixture');
    const input = join(root, `stations.${format}`);
    writeFileSync(input, format === 'm3u' ? `#EXTM3U\n${audio}\nmy recording.mp3\nftp://unsupported.test/audio\n` : `[playlist]\nFile1=${audio}\nFile2=my recording.mp3\nFile3=ftp://unsupported.test/audio\n`);
    expect(parsePlaylistFile(input).map(station => station.streamUrl)).toEqual([audio]);
  });

  it('imports XSPF titles and escaped stream parameters without duplicating streams', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli xspf café '));
    roots.push(root);
    const input = join(root, 'stations.xspf');
    writeFileSync(input, `<?xml version="1.0"?><playlist xmlns="http://xspf.org/ns/0/"><trackList>
      <track><title>Café &amp; 日本</title><location>https://example.com/live?a=1&amp;b=2</location></track>
      <track><title>Duplicate</title><location>https://example.com/live?a=1&amp;b=2</location></track>
      <track><location>ftp://example.com/unsupported</location></track>
    </trackList></playlist>`);
    const stations = parsePlaylistFile(input);
    expect(stations).toHaveLength(1);
    expect(stations[0]).toMatchObject({name: 'Café & 日本', streamUrl: 'https://example.com/live?a=1&b=2'});
    const output = join(root, 'round trip.m3u');
    writeM3u(output, stations);
    expect(parsePlaylistFile(output)).toEqual(stations);
  });

  it('dedupes streams and follows nested local playlists', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-playlist-'));
    roots.push(root);
    writeFileSync(join(root, 'nested.m3u'), '#EXTM3U\n#EXTINF:-1,Nested FM\nhttps://example.com/nested.mp3\n', 'utf8');
    const input = join(root, 'root.m3u');
    writeFileSync(
      input,
      '#EXTM3U\nnested.m3u\n#EXTINF:-1,Duplicate\nhttps://example.com/nested.mp3\nftp://unsupported.example.com/live\n',
      'utf8'
    );
    const stations = parsePlaylistFile(input);
    expect(stations).toHaveLength(1);
    expect(stations[0]?.name).toBe('Nested FM');
  });

  it('accepts XSPF CDATA and XML character references without double decoding', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-xspf-'));
    roots.push(root);
    const input = join(root, 'stations.xspf');
    writeFileSync(input, `<playlist><trackList>
      <track><title><![CDATA[Rock &amp; Roll]]></title><location><![CDATA[https://example.com/live?a=1&b=2]]></location></track>
      <track><title>Caf&#233; &#x65E5;&#x672C; &apos;FM&apos; &amp;lt;</title><location>https://example.com/other?a=1&#38;b=2</location></track>
    </trackList></playlist>`);
    expect(parsePlaylistFile(input).map(item => [item.name, item.streamUrl])).toEqual([
      ['Rock &amp; Roll', 'https://example.com/live?a=1&b=2'],
      ["Café 日本 'FM' &lt;", 'https://example.com/other?a=1&b=2']
    ]);
  });
});
