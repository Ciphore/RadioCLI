import {tmpdir} from 'node:os';
import {posix} from 'node:path';
import {identifyPlatform, nativeAdapters} from './runtime.js';

type IpcOptions = {platform?: string; directory?: string; pid?: number; timestamp?: number};

export function mpvIpcPath({platform = process.platform, directory = tmpdir(), pid = process.pid, timestamp = Date.now()}: IpcOptions = {}): string {
  if (nativeAdapters(identifyPlatform({platform})).ipc === 'named-pipe') return `\\\\.\\pipe\\radiocli-${pid}-${timestamp}`;
  const path = posix.join(directory, `radiocli-${pid}-${timestamp}.sock`);
  // BSD/macOS sockaddr_un is smaller than Linux's. Count encoded bytes and
  // leave room for the terminator; JavaScript string length is not sufficient.
  if (Buffer.byteLength(path) > 100) {
    throw new Error('The mpv socket path is too long. Select a shorter private TMPDIR and restart RadioCLI.');
  }
  return path;
}
