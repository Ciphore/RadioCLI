import {describe, expect, it} from 'vitest';
import {mpvIpcPath} from './ipc.js';

describe('native mpv IPC endpoints', () => {
  it('uses the Windows pipe namespace and does not interpret the temp directory', () => {
    expect(mpvIpcPath({platform: 'win32', pid: 42, timestamp: 123, directory: 'D:\\Long temp 日本'})).toBe('\\\\.\\pipe\\radiocli-42-123');
  });
  it.each(['linux', 'darwin', 'freebsd', 'openbsd', 'netbsd', 'android', 'haiku', 'sunos', 'aix'])(
    'keeps %s on a Unix socket with spaces and non-ASCII preserved', platform => {
      expect(mpvIpcPath({platform, pid: 42, timestamp: 123, directory: '/tmp/日本 space'})).toBe('/tmp/日本 space/radiocli-42-123.sock');
    }
  );
  it('checks the portable socket limit in bytes, before a player is launched', () => {
    expect(() => mpvIpcPath({platform: 'freebsd', directory: `/tmp/${'é'.repeat(42)}`, pid: 42, timestamp: 123})).toThrow(/socket.*shorter.*TMPDIR/i);
    expect(() => mpvIpcPath({platform: 'linux', directory: `/tmp/${'a'.repeat(150)}`})).toThrow(/socket/i);
  });
});
