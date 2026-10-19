import {afterEach, expect, it, vi} from 'vitest';
import {parsePlaylistFile} from './playlist.js';

const files = vi.hoisted(() => new Map<string, string>());
// Exercise actual Windows path semantics on every CI host as well as the
// native filesystem fixtures in playlist.test.ts on Windows runners.
vi.mock('node:path', async original => ({...await original<typeof import('node:path')>(), ...(await original<typeof import('node:path')>()).win32}));
vi.mock('node:fs', () => ({existsSync: (path: string) => files.has(path), readFileSync: (path: string) => files.get(path), writeFileSync: vi.fn()}));
afterEach(() => files.clear());

it.each(['m3u', 'pls'])('imports Windows drive, UNC, relative and file URL entries in %s', extension => {
  const targets = ['C:\\Music\\音楽.wav', '\\\\server\\radio\\live.mp3', 'relative.mp3', 'file:///C:/Music/local.wav'];
  const path = `C:\\Playlists\\radio.${extension}`;
  files.set(path, extension === 'm3u' ? targets.join('\r\n') : targets.map((target, index) => `File${index + 1}=${target}`).join('\r\n'));
  files.set(targets[0]!, ''); files.set(targets[1]!, ''); files.set('C:\\Playlists\\relative.mp3', '');
  expect(parsePlaylistFile(path).map(station => station.streamUrl)).toEqual([targets[0], targets[1], 'C:\\Playlists\\relative.mp3', targets[3]]);
});

it('resolves nested Windows playlists without treating drive letters as schemes', () => {
  files.set('C:\\Playlists\\radio.m3u', 'D:\\Other\\nested.pls');
  files.set('D:\\Other\\nested.pls', 'File1=D:\\Music\\recording.mp3');
  files.set('D:\\Music\\recording.mp3', '');
  expect(parsePlaylistFile('C:\\Playlists\\radio.m3u')[0]?.streamUrl).toBe('D:\\Music\\recording.mp3');
});
