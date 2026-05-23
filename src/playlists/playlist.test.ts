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
    const root = mkdtempSync(join(tmpdir(), 'radio-atlas-playlist-'));
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
    const root = mkdtempSync(join(tmpdir(), 'radio-atlas-playlist-'));
    roots.push(root);
    const input = join(root, 'stations.pls');
    writeFileSync(input, '[playlist]\nFile1=https://example.com/aac\nTitle1=PLS FM\n', 'utf8');
    expect(parsePlaylistFile(input)[0]?.name).toBe('PLS FM');
  });

  it('dedupes streams and follows nested local playlists', () => {
    const root = mkdtempSync(join(tmpdir(), 'radio-atlas-playlist-'));
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
});
