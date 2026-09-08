import {fileURLToPath} from 'node:url';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {resolveTerminalCapabilities} from './platform/terminal.js';

const {render, configure} = vi.hoisted(() => ({render: vi.fn(), configure: vi.fn()}));
vi.mock('ink', () => ({render}));
vi.mock('./ui/App.js', () => ({App: () => null}));
vi.mock('./ui/terminal-renderer.js', () => ({configureTerminalRenderer: configure}));

const stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
const stdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY');
const originalArgv = process.argv;
const originalExitCode = process.exitCode;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv('TERM', 'xterm-256color');
  for (const key of ['NO_COLOR', 'FORCE_COLOR', 'RADIOCLI_SCREEN_READER', 'INK_SCREEN_READER']) vi.stubEnv(key, undefined);
  configure.mockImplementation(async (env, evidence) => resolveTerminalCapabilities(env, evidence));
  process.argv = [process.execPath, fileURLToPath(new URL('./cli.tsx', import.meta.url))];
});

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  if (stdinDescriptor) Object.defineProperty(process.stdin, 'isTTY', stdinDescriptor);
  else Reflect.deleteProperty(process.stdin, 'isTTY');
  if (stdoutDescriptor) Object.defineProperty(process.stdout, 'isTTY', stdoutDescriptor);
  else Reflect.deleteProperty(process.stdout, 'isTTY');
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('CLI terminal entry point', () => {
  it.each([true, undefined])('normalizes stdout.isTTY=%s before configuring Ink', async stdoutTty => {
    Object.defineProperty(process.stdin, 'isTTY', {configurable: true, value: true});
    Object.defineProperty(process.stdout, 'isTTY', {configurable: true, value: stdoutTty});
    await import('./cli.js');
    expect(configure).toHaveBeenCalledOnce();
    expect(configure.mock.calls[0]?.[1]).toMatchObject({isTTY: Boolean(stdoutTty)});
    expect(render).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      interactive: stdoutTty ? undefined : false,
      debug: !stdoutTty,
      kittyKeyboard: expect.objectContaining({mode: stdoutTty ? 'auto' : 'disabled'})
    }));
  });

  it('prints actionable help and exits before rendering when terminal input is absent', async () => {
    Object.defineProperty(process.stdin, 'isTTY', {configurable: true, value: undefined});
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await import('./cli.js');
    expect(error).toHaveBeenCalledWith(expect.stringContaining('interactive TUI needs terminal input'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
    expect(process.exitCode).toBe(1);
    expect(render).not.toHaveBeenCalled();
    expect(configure).not.toHaveBeenCalled();
  });
});
