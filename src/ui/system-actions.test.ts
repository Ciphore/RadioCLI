import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {once} from 'node:events';
import type {ChildProcess} from 'node:child_process';
import {describe, expect, it, vi} from 'vitest';
import {copyToClipboard, openExternal} from './system-actions.js';

vi.mock('node:child_process', () => ({spawn: vi.fn(() => { throw new Error('Desktop tests must inject their launcher.'); })}));

describe('system actions', () => {
  it('does not report an asynchronous browser launch failure as success', async () => {
    const launch = fakeLauncher('error');
    await expect(openExternal('https://example.test/?x=1&y=2', 'win32', {spawn: launch, env: {}, resolve: name => name})).resolves.toBe(false);
  });

  it('passes a validated URL as one literal argument and waits for completion', async () => {
    const launch = fakeLauncher(0);
    const url = 'https://example.test/?x=1&y=%22';
    await expect(openExternal(url, 'win32', {spawn: launch, env: {}, resolve: name => name})).resolves.toBe(true);
    expect(launch.mock.calls[0]?.slice(0, 2)).toEqual(['explorer', [url]]);
    await expect(openExternal('file:///etc/passwd', 'win32', {spawn: launch, env: {}, resolve: name => name})).resolves.toBe(false);
    expect(launch).toHaveBeenCalledOnce();
  });

  it('falls through to another clipboard tool after a nonzero exit', async () => {
    const launch = fakeLauncher(1, 0);
    const text = 'Zoë 日本 & $(literal)';
    await expect(copyToClipboard(text, 'linux', {spawn: launch, env: {DISPLAY: ':0'}, resolve: name => name})).resolves.toBe(true);
    expect(launch.mock.calls.map(call => call[0])).toEqual(['wl-copy', 'xclip']);
    expect(launch.inputs).toEqual([text, text]);
  });

  it('reports missing tools and headless sessions without launching', async () => {
    const launch = fakeLauncher(0);
    await expect(copyToClipboard('text', 'linux', {spawn: launch, env: {}, resolve: name => name})).resolves.toBe(false);
    await expect(openExternal('https://example.test', 'darwin', {spawn: launch, env: {SSH_CONNECTION: 'test'}, resolve: name => name})).resolves.toBe(false);
    await expect(copyToClipboard('text', 'darwin', {spawn: launch, env: {}, resolve: () => null})).resolves.toBe(false);
    expect(launch).not.toHaveBeenCalled();
  });

  it('handles clipboard stdin failure and bounds a hung helper', async () => {
    const broken = fakeLauncher('pipe-error');
    await expect(copyToClipboard('text', 'darwin', {spawn: broken, env: {}, resolve: name => name})).resolves.toBe(false);
    const hung = fakeLauncher('hang');
    await expect(copyToClipboard('text', 'darwin', {spawn: hung, env: {}, resolve: name => name, timeoutMs: 10})).resolves.toBe(false);
    expect(hung.kills.mock.calls).toEqual([['SIGTERM'], ['SIGKILL']]);
  });

  it('terminates an actual helper that ignores graceful shutdown before reporting timeout', async () => {
    const {spawn} = await vi.importActual<typeof import('node:child_process')>('node:child_process');
    let child: ChildProcess | undefined;
    let closed = false;
    try {
      child = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});process.stdin.resume();setInterval(()=>{},1000);process.send('ready');"], {stdio: ['pipe', 'ignore', 'ignore', 'ipc']});
      await once(child, 'message');
      child.once('close', () => { closed = true; });
      const result = await copyToClipboard('literal text', 'darwin', {
        env: {}, resolve: () => process.execPath, timeoutMs: 50,
        spawn: () => child!
      });
      expect(result).toBe(false);
      expect(closed).toBe(true);
      expect(child!.exitCode !== null || child!.signalCode !== null).toBe(true);
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) {
        const closed = once(child, 'close');
        child.kill('SIGKILL');
        await closed;
      }
    }
  });

  it('accepts a long-lived browser opener without terminating its application', async () => {
    const {spawn} = await vi.importActual<typeof import('node:child_process')>('node:child_process');
    let child: ChildProcess | undefined;
    try {
      const result = await openExternal('https://example.test/?x=1&y=%22', 'linux', {
        env: {DISPLAY: ':0'}, resolve: () => process.execPath, timeoutMs: 500,
        spawn: (_command, _args, options) => {
          child = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000);"], options);
          return child;
        }
      });
      expect(result).toBe(true);
      expect(child!.exitCode).toBeNull();
      expect(child!.signalCode).toBeNull();
    } finally {
      if (child && child.exitCode === null && child.signalCode === null) {
        const closed = once(child, 'close');
        child.kill('SIGKILL');
        await closed;
      }
    }
  });
});

function fakeLauncher(...results: Array<number | 'error' | 'pipe-error' | 'hang'>) {
  const inputs: string[] = [];
  const kills = vi.fn();
  const launch = vi.fn((_command: string, _args: readonly string[], _options?: unknown) => {
    const child = new EventEmitter() as ChildProcess;
    child.stdin = new PassThrough();
    child.kill = kills;
    child.unref = vi.fn();
    const index = inputs.push('') - 1;
    child.stdin.on('data', chunk => { inputs[index] += String(chunk); });
    const result = results.shift() ?? 1;
    queueMicrotask(() => {
      if (result === 'error') child.emit('error', new Error('Command unavailable'));
      else if (result === 'pipe-error') child.stdin?.emit('error', new Error('EPIPE'));
      else if (result !== 'hang') child.emit('close', result);
    });
    return child;
  });
  return Object.assign(launch, {inputs, kills});
}
