import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {connectRadioSession, startRadioSession, type RadioSessionCommand, type RadioSessionStatus} from './session.js';

const roots: string[] = [];
const idle: RadioSessionStatus = {
  owner: 'headless',
  station: null,
  queue: [],
  playback: {backend: 'none', state: 'idle', volume: 70, muted: false, ready: false}
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true});
});

describe('agent radio session', () => {
  it('authenticates requests and serializes simultaneous agent commands', async () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-agent-session-'));
    roots.push(root);
    const path = join(root, 'session.json');
    const order: string[] = [];
    const server = await startRadioSession(async (command: RadioSessionCommand) => {
      order.push(`start:${command.type}`);
      await new Promise(resolve => setTimeout(resolve, command.type === 'pause' ? 20 : 1));
      order.push(`end:${command.type}`);
      return {ok: true, message: command.type, status: idle};
    }, path);
    try {
      const client = await connectRadioSession(path);
      expect(client).not.toBeNull();
      await Promise.all([client!.call({type: 'pause'}), client!.call({type: 'stop'})]);
      expect(order).toEqual([
        'start:status', 'end:status',
        'start:pause', 'end:pause',
        'start:stop', 'end:stop'
      ]);
    } finally {
      await server.close();
    }
    expect(await connectRadioSession(path)).toBeNull();
  });

  it('allows only one playback owner for a discovery path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-agent-owner-'));
    roots.push(root);
    const path = join(root, 'session.json');
    const first = await startRadioSession(async () => ({ok: true, message: 'ok', status: idle}), path);
    try {
      await expect(startRadioSession(async () => ({ok: true, message: 'ok', status: idle}), path)).rejects.toThrow('already active');
    } finally {
      await first.close();
    }
  });
});
