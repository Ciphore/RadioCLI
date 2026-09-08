import {describe, expect, it} from 'vitest';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolveTerminalCapabilities} from './terminal.js';

describe('terminal capabilities', () => {
  it('preserves the existing Unicode and truecolor default when no constraint is known', () => {
    expect(resolveTerminalCapabilities({})).toEqual({
      unicode: true, colorLevel: 3, screenReader: false, reduceMotion: false, interactive: true
    });
  });

  it.each(['C', 'POSIX'])('uses ASCII decoration for the %s locale', locale => {
    expect(resolveTerminalCapabilities({LANG: locale}).unicode).toBe(false);
  });

  it.each(['C.UTF-8', 'en_US.UTF8', 'ja_JP.UTF-8'])('preserves Unicode for %s', locale => {
    expect(resolveTerminalCapabilities({LANG: locale}).unicode).toBe(true);
  });

  it('follows LC_ALL, LC_CTYPE, then LANG precedence and ignores empty locale variables', () => {
    expect(resolveTerminalCapabilities({LC_ALL: 'C', LC_CTYPE: 'ja_JP.UTF-8', LANG: 'en_US.UTF-8'}).unicode).toBe(false);
    expect(resolveTerminalCapabilities({LC_ALL: '', LC_CTYPE: 'C', LANG: 'ja_JP.UTF-8'}).unicode).toBe(false);
    expect(resolveTerminalCapabilities({LC_ALL: 'C.UTF-8', LC_CTYPE: 'POSIX'}).unicode).toBe(true);
  });

  it('allows explicit glyph overrides without using SSH as an ASCII signal', () => {
    expect(resolveTerminalCapabilities({RADIOCLI_ASCII: '1', LANG: 'en_US.UTF-8'}).unicode).toBe(false);
    expect(resolveTerminalCapabilities({RADIOCLI_UNICODE: '1', LC_ALL: 'C'}, {asciiMode: true}).unicode).toBe(true);
    expect(resolveTerminalCapabilities({RADIOCLI_ASCII: '0'}, {asciiMode: true}).unicode).toBe(true);
    expect(resolveTerminalCapabilities({RADIOCLI_UNICODE: '0'}).unicode).toBe(false);
    expect(resolveTerminalCapabilities({RADIOCLI_ASCII: '1', RADIOCLI_UNICODE: '1'}).unicode).toBe(false);
    expect(resolveTerminalCapabilities({SSH_TTY: '/dev/pts/2', SSH_CONNECTION: 'host 1 host 2', LANG: 'C.UTF-8'}).unicode).toBe(true);
  });

  it('does not treat malformed glyph overrides as enabling a mode', () => {
    expect(resolveTerminalCapabilities({RADIOCLI_ASCII: 'maybe', RADIOCLI_UNICODE: 'later'}, {asciiMode: true}).unicode).toBe(false);
  });

  it('makes dumb terminals ASCII, colorless and static even when color and Unicode are forced', () => {
    expect(resolveTerminalCapabilities({TERM: 'dumb', FORCE_COLOR: '3', RADIOCLI_UNICODE: '1'})).toMatchObject({
      unicode: false, colorLevel: 0, reduceMotion: true, interactive: false
    });
  });

  it('honors nonempty NO_COLOR over FORCE_COLOR and keeps an empty value inactive', () => {
    expect(resolveTerminalCapabilities({NO_COLOR: '0', FORCE_COLOR: '3'}).colorLevel).toBe(0);
    expect(resolveTerminalCapabilities({NO_COLOR: '', FORCE_COLOR: '3'}).colorLevel).toBe(3);
  });

  it.each([
    [{TERM: 'xterm'}, 1],
    [{TERM: 'screen-256color'}, 2],
    [{TERM: 'xterm-256color', COLORTERM: 'truecolor'}, 3],
    [{TERM: 'xterm', COLORTERM: '24bit'}, 3],
    [{FORCE_COLOR: '0'}, 0],
    [{FORCE_COLOR: '1'}, 1],
    [{FORCE_COLOR: '2'}, 2],
    [{FORCE_COLOR: '3'}, 3]
  ] as const)('selects the supported color level for %j', (env, colorLevel) => {
    expect(resolveTerminalCapabilities(env).colorLevel).toBe(colorLevel);
  });

  it.each([[1, 0], [4, 1], [8, 2], [24, 3]])('uses a detected %i-bit color depth', (colorDepth, colorLevel) => {
    expect(resolveTerminalCapabilities({}, {colorDepth}).colorLevel).toBe(colorLevel);
  });

  it('keeps piped output plain and static unless color is explicitly requested', () => {
    expect(resolveTerminalCapabilities({}, {isTTY: false})).toMatchObject({colorLevel: 0, interactive: false, reduceMotion: true});
    expect(resolveTerminalCapabilities({FORCE_COLOR: '2'}, {isTTY: false}).colorLevel).toBe(2);
  });

  it.each([{INK_SCREEN_READER: 'true'}, {RADIOCLI_SCREEN_READER: '1'}])('disables decoration animation in accessible mode %j', env => {
    expect(resolveTerminalCapabilities(env)).toMatchObject({screenReader: true, reduceMotion: true, colorLevel: 0});
  });

  it('accepts the actual Ink accessibility state and legacy animation overrides', () => {
    expect(resolveTerminalCapabilities({}, {screenReader: true})).toMatchObject({screenReader: true, reduceMotion: true});
    expect(resolveTerminalCapabilities({RADIOCLI_DISABLE_ANIMATION: '1'}).reduceMotion).toBe(true);
    expect(resolveTerminalCapabilities({RADIO_ATLAS_DISABLE_ANIMATION: '1'}).reduceMotion).toBe(true);
  });

  it('does not mutate the supplied environment', () => {
    const env = Object.freeze({NO_COLOR: '1', FORCE_COLOR: '3', RADIOCLI_ASCII: '1'});
    const capabilities = resolveTerminalCapabilities(env);
    expect(capabilities.colorLevel).toBe(0);
    expect(env).toEqual({NO_COLOR: '1', FORCE_COLOR: '3', RADIOCLI_ASCII: '1'});
  });
});

describe('terminal color startup', () => {
  it.each([
    {env: {NO_COLOR: '1', FORCE_COLOR: '3'}, expected: 0},
    {env: {TERM: 'dumb', FORCE_COLOR: '3'}, expected: 0},
    {env: {TERM: 'xterm'}, expected: 1},
    {env: {TERM: 'xterm-256color'}, expected: 2},
    {env: {TERM: 'xterm-256color', COLORTERM: 'truecolor'}, expected: 3},
    {env: {FORCE_COLOR: '1', COLORTERM: 'truecolor'}, expected: 1},
    {env: {FORCE_COLOR: '2', GITHUB_ACTIONS: 'true', CI: 'true'}, expected: 2}
  ])('configures real Ink before its color dependency loads for $env', ({env, expected}) => {
    const output = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', `
      import {configureTerminalRenderer} from './src/ui/terminal-renderer.ts';
      const terminal = await configureTerminalRenderer();
      const [{createElement}, {Box, Text, renderToString}, {resolveDisplayMode}] = await Promise.all([
        import('react'), import('ink'), import('./src/ui/display-context.ts')
      ]);
      const display = resolveDisplayMode({});
      const frame = renderToString(createElement(Box, {backgroundColor: display.app},
        createElement(Text, {color: '#74f28a', backgroundColor: display.panel}, '東京 / Café')));
      process.stdout.write(JSON.stringify({terminal, frame}));
    `], {
      cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', stdio: 'pipe',
      env: {...process.env, TERM: undefined, COLORTERM: undefined, FORCE_COLOR: undefined, NO_COLOR: undefined, INK_SCREEN_READER: undefined, RADIOCLI_SCREEN_READER: undefined, ...env}
    });
    const result = JSON.parse(output) as {terminal: {colorLevel: number}; frame: string};
    expect(result.terminal.colorLevel).toBe(expected);
    expect(result.frame).toContain('東京 / Café');
    if (expected === 0) expect(result.frame).not.toContain('\u001B[');
    else expect(result.frame).toContain('\u001B[');
    if (expected < 3) expect(result.frame).not.toMatch(/\u001B\[(?:38|48);2;/u);
    if (expected < 2) expect(result.frame).not.toMatch(/\u001B\[(?:38|48);5;/u);
    if (expected === 3) expect(result.frame).toMatch(/\u001B\[(?:38|48);2;/u);
  });
});
