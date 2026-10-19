import {execFile, spawn} from 'node:child_process';
import {once} from 'node:events';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {createConnection} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {describe, expect, it} from 'vitest';
import {planMpvDesktopMedia} from './mpv-desktop-media.js';

const run = promisify(execFile);
const stockPlugin = '/usr/lib/mpv-mpris/mpris.so';

/** Linux CI supplies the real packaged plugin and an isolated session bus.
 * Null audio verifies coexistence and IPC, not audible desktop playback. */
describe.skipIf(process.platform !== 'linux' || !process.env.DBUS_SESSION_BUS_ADDRESS || !existsSync(stockPlugin))('native mpv media coexistence', () => {
  it('suppresses only the stock media plugin while preserving user scripts and configuration', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'radiocli-mpv-media-'));
    const marker = join(directory, 'marker');
    const env = {...process.env, MPV_HOME: directory};
    mkdirSync(join(directory, 'scripts'));
    symlinkSync(stockPlugin, join(directory, 'scripts', 'mpris.so'));
    writeFileSync(join(directory, 'mpv.conf'), 'volume=37\n');
    // Publish completion only after Lua has closed the file; open("w") alone
    // makes an empty marker visible to the waiting test in another process.
    writeFileSync(join(directory, 'scripts', "custom space,: ' 日本語.lua"), `local f = assert(io.open(${JSON.stringify(`${marker}.tmp`)}, "w")); f:write("preserved"); f:close(); assert(os.rename(${JSON.stringify(`${marker}.tmp`)}, ${JSON.stringify(marker)}))`);
    try {
      const before = await names();
      await withPlayer([], env, directory, async socket => {
        await until(() => existsSync(marker));
        expect(readFileSync(marker, 'utf8')).toBe('preserved');
        expect(await volume(socket)).toBe(37);
        await until(async () => (await names()).some(name => !before.includes(name)));
      });
      await until(async () => (await names()).every(name => before.includes(name)));
      rmSync(marker);
      const policy = planMpvDesktopMedia({env});
      expect(policy.status).toBe('compatible');
      expect(policy.args[0]).toBe('--load-scripts=no');
      await withPlayer(policy.args, env, directory, async socket => {
        await until(() => existsSync(marker));
        expect(readFileSync(marker, 'utf8')).toBe('preserved');
        expect(await volume(socket)).toBe(37);
        await delay(200);
        expect(await names()).toEqual(before);
      });
    } finally { rmSync(directory, {force: true, recursive: true}); }
  }, 15_000);
});

async function withPlayer(args: string[], env: NodeJS.ProcessEnv, directory: string, check: (socket: string) => Promise<void>): Promise<void> {
  const socket = join(directory, 'ipc');
  rmSync(socket, {force: true});
  const child = spawn('mpv', ['--idle=yes', '--ao=null', '--no-video', '--no-terminal', `--input-ipc-server=${socket}`, ...args], {env, stdio: 'ignore'});
  const closed = once(child, 'close');
  // Attach a rejection handler immediately, including failed executable starts.
  void closed.catch(() => undefined);
  try {
    await until(() => existsSync(socket));
    await check(socket);
  } finally {
    child.kill('SIGTERM');
    const force = setTimeout(() => child.kill('SIGKILL'), 1000);
    try { await closed; } finally { clearTimeout(force); }
  }
}

function volume(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    let buffer = '';
    socket.setTimeout(2000, () => socket.destroy(new Error('mpv IPC timed out.')));
    socket.on('error', reject);
    socket.on('connect', () => socket.write(`${JSON.stringify({command: ['get_property', 'volume'], request_id: 1})}\n`));
    socket.on('data', chunk => {
      buffer += chunk.toString();
      if (buffer.length > 64 * 1024) { socket.destroy(new Error('mpv IPC exceeded its response limit.')); return; }
      let boundary: number;
      while ((boundary = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 1);
        try {
          const message = JSON.parse(line) as {request_id?: number; data?: number; error?: string};
          if (message.request_id === 1) {
            socket.destroy();
            if (message.error !== 'success' || typeof message.data !== 'number') reject(new Error('mpv did not return its configured volume.'));
            else resolve(message.data);
          }
        } catch (error) { socket.destroy(); reject(error); }
      }
    });
  });
}

async function names(): Promise<string[]> {
  const result = await run('dbus-send', ['--session', '--print-reply', '--reply-timeout=2000', '--dest=org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus.ListNames'], {timeout: 3000, maxBuffer: 64 * 1024});
  return result.stdout.split('\n').filter(line => line.includes('org.mpris.MediaPlayer2.mpv')).sort();
}

async function until(predicate: () => boolean | Promise<boolean>): Promise<void> {
  const end = Date.now() + 4000;
  while (Date.now() < end) { if (await predicate()) return; await delay(20); }
  throw new Error('The native mpv condition did not become ready.');
}

function delay(milliseconds: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, milliseconds)); }
