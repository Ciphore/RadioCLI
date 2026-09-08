import {spawn, type ChildProcess} from 'node:child_process';
import {createServer, type Socket} from 'node:net';
import {randomBytes} from 'node:crypto';
import {listenLoopback} from '../platform/loopback.js';
import {identifyPlatform, nativeAdapters} from '../platform/runtime.js';
import {detectGraphicalTerminal, launchTerminalCommand, type TerminalOptions, type TerminalResolver} from '../platform/terminals.js';

export type AlarmTerminalLaunchResult = {opened: boolean; requested?: boolean; terminal: string; message: string};
type LaunchOptions = TerminalOptions & {
  nodePath: string;
  cliPath: string;
  hasLiveTui?: () => boolean;
  timeoutMs?: number;
};
type PermissionOptions = TerminalOptions & {permissionTimeoutMs?: number};
type ProbeOptions = PermissionOptions & {nodePath?: string; timeoutMs?: number};

export function detectAlarmTerminal(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env, resolve?: TerminalResolver): string {
  return detectGraphicalTerminal(platform, env, resolve);
}

export async function openAlarmControls(options: LaunchOptions): Promise<AlarmTerminalLaunchResult> {
  if (options.hasLiveTui?.()) return {opened: false, terminal: 'existing-tui', message: 'An existing RadioCLI TUI will show the ringing controls.'};
  const terminal = await launchTerminalCommand({...options, args: [options.cliPath], title: 'RadioCLI Alarm'});
  if (!options.hasLiveTui) return {opened: false, requested: true, terminal, message: 'Requested RadioCLI alarm controls; TUI startup is unverified.'};
  const deadline = Date.now() + (options.timeoutMs ?? 8_000);
  while (true) {
    if (options.hasLiveTui()) return {opened: true, requested: true, terminal, message: 'RadioCLI alarm controls are ready in the saved terminal.'};
    const remaining = deadline - Date.now();
    if (remaining <= 0) return {opened: false, requested: true, terminal, message: 'Requested RadioCLI alarm controls, but the TUI did not become ready before verification timed out. It may still be starting.'};
    await new Promise(resolve => setTimeout(resolve, Math.min(50, remaining)));
  }
}

/** Ask for macOS Automation access while the user is configuring the alarm. */
export async function prepareAlarmTerminalAccess(options: PermissionOptions = {}): Promise<void> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  if (nativeAdapters(identifyPlatform({platform, env})).terminal !== 'macos') return;
  const terminal = detectAlarmTerminal(platform, env, options.resolve);
  const application = terminal === 'darwin:apple-terminal' ? 'Terminal' : terminal === 'darwin:iterm' ? 'iTerm' : undefined;
  if (!application) return;
  const launch = options.spawn ?? spawnAttached;
  const child = launch('/usr/bin/osascript', ['-e', `tell application "${application}" to count windows`]);
  const code = await completed(child, options.permissionTimeoutMs ?? 60_000);
  if (code !== 0) throw new Error(`macOS did not grant RadioCLI permission to control ${application}. Audio can still play, but automatic ringing controls cannot open. Enable Node under System Settings > Privacy & Security > Automation, then press Repair.`);
}

/**
 * Opens the saved terminal with a short-lived authenticated loopback probe. The
 * terminal exits immediately after proving that a native background job can
 * expose the ringing TUI on this desktop session.
 */
export async function verifyAlarmTerminalLaunch(options: ProbeOptions = {}): Promise<string> {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  await prepareAlarmTerminalAccess(options);
  const terminal = detectAlarmTerminal(platform, env, options.resolve);
  if (terminal.endsWith(':unsupported')) throw new Error('No supported graphical terminal was found for automatic alarm controls.');
  const token = randomBytes(24).toString('base64url');
  const server = createServer();
  const address = await listenLoopback(server);
  const script = "const n=require('node:net');const s=n.connect(Number(process.argv[1]),process.argv[3],()=>s.end(process.argv[2]));s.on('error',()=>process.exit(2));";
  const nodePath = options.nodePath ?? process.execPath;
  const args = ['-e', script, String(address.port), token, address.host];
  const sockets = new Set<Socket>();
  const received = new Promise<void>((resolve, reject) => {
    server.on('connection', socket => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
      let value = '';
      socket.setEncoding('utf8');
      socket.on('data', chunk => {
        value += chunk;
        if (value.length > token.length) {
          socket.destroy();
          reject(new Error('The terminal verification response was not authentic.'));
        }
      });
      socket.on('end', () => value === token ? resolve() : reject(new Error('The terminal verification response was not authentic.')));
      socket.on('error', reject);
    });
  });
  // A callback can fail while the launcher is still reporting its own result.
  // Keep the rejection observed until it is awaited below.
  void received.catch(() => undefined);
  try {
    await launchTerminalCommand({...options, nodePath, args, title: 'RadioCLI Alarm Verification', closeOnExit: true});
    await withTimeout(received, options.timeoutMs ?? 8_000, 'The terminal opened but did not connect back to RadioCLI.');
    return terminal;
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

function spawnAttached(command: string, args: readonly string[]): ChildProcess {
  return spawn(command, [...args], {stdio: 'ignore', windowsHide: true});
}

function completed(child: ChildProcess, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (work: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      work();
    };
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(() => reject(new Error('Timed out waiting for the macOS Automation permission response.')));
    }, timeoutMs);
    child.once('error', error => finish(() => reject(error)));
    child.once('close', code => finish(() => resolve(code ?? 1)));
  });
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
