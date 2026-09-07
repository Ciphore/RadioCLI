import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import type {ChildProcess} from 'node:child_process';
import {describe, expect, it, vi} from 'vitest';
import {clipboardCommands, copyToClipboard, openExternal, openExternalCommand} from './system-actions.js';

vi.mock('node:child_process', () => ({spawn: vi.fn(() => { throw new Error('Desktop tests must inject their launcher.'); })}));

describe('system actions', () => {
  it('opens URLs with the platform default handler', () => {
    expect(openExternalCommand('darwin')).toEqual({command: 'open', args: []});
    expect(openExternalCommand('win32')).toEqual({command: 'explorer', args: []});
    expect(openExternalCommand('linux')).toEqual({command: 'xdg-open', args: []});
  });

  it('lists platform clipboard tools in priority order', () => {
    expect(clipboardCommands('darwin').map(entry => entry.command)).toEqual(['pbcopy']);
    expect(clipboardCommands('win32').map(entry => entry.command)).toEqual(['clip']);
    expect(clipboardCommands('linux').map(entry => entry.command)).toEqual(['wl-copy', 'xclip', 'xsel']);
  });

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
    expect(hung.kills).toHaveBeenCalledOnce();
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
