import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {parse} from 'jsonc-parser';
import {cliInvocation, mcpIntegrationReport, mcpServerCommand, probeMcpServer, resolveCodexExecutable, updateOpenCodeConfig} from './mcp-install.js';

const roots: string[] = [];
const originalRadioCliHome = process.env.RADIOCLI_HOME;

afterEach(() => {
  if (originalRadioCliHome === undefined) delete process.env.RADIOCLI_HOME;
  else process.env.RADIOCLI_HOME = originalRadioCliHome;
  for (const root of roots.splice(0)) rmSync(root, {recursive: true, force: true});
});

describe('OpenCode MCP configuration', () => {
  it('detects the Codex host executable supplied by the desktop app', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-codex-host-'));
    roots.push(root);
    const executable = join(root, 'codex');
    writeFileSync(executable, '');
    expect(resolveCodexExecutable({CODEX_CLI_PATH: executable, PATH: ''}, 'darwin', root)).toBe(executable);
  });

  it('uses an upgrade-stable package-manager shim when one is available', () => {
    const runtime = {nodePath: '/opt/homebrew/Cellar/node/24/bin/node', cliPath: '/opt/homebrew/Cellar/radiocli/0.2.2/libexec/cli.js'};
    expect(mcpServerCommand(runtime, '/opt/homebrew/bin/radiocli')).toEqual([
      '/opt/homebrew/bin/radiocli', 'mcp', 'serve'
    ]);
  });

  it('falls back to the current Node runtime for source and portable executions', () => {
    expect(mcpServerCommand({nodePath: '/node', cliPath: '/radio/cli.js'}, null)).toEqual([
      '/node', '/radio/cli.js', 'mcp', 'serve'
    ]);
  });

  it('uses a shell-free Node command instead of an npm cmd shim on Windows', () => {
    const runtime = {nodePath: 'C:\\Program Files\\nodejs\\node.exe', cliPath: 'C:\\Users\\radio\\AppData\\Roaming\\npm\\node_modules\\@ciphore\\radiocli\\dist\\cli.js'};
    expect(mcpServerCommand(runtime, 'C:\\Users\\radio\\AppData\\Roaming\\npm\\radiocli.cmd', 'win32')).toEqual([
      runtime.nodePath, runtime.cliPath, 'mcp', 'serve'
    ]);
  });

  it('invokes Windows client-management cmd shims through ComSpec with escaped arguments', () => {
    expect(cliInvocation(
      'C:\\Users\\Radio User\\AppData\\Roaming\\npm\\codex.cmd',
      ['mcp', 'add', 'radiocli', '--', 'C:\\Radio & Music\\node.exe'],
      'win32',
      {ComSpec: 'C:\\Windows\\System32\\cmd.exe'}
    )).toEqual({
      program: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/v:off', '/c', '"C:\\Users\\Radio User\\AppData\\Roaming\\npm\\codex.cmd" "mcp" "add" "radiocli" "--" "C:\\Radio ^& Music\\node.exe"']
    });
  });

  it('verifies an MCP stdio initialize handshake before registration', async () => {
    const responder = `process.stdin.once('data',()=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:1,result:{protocolVersion:'2025-11-25',capabilities:{},serverInfo:{name:'radiocli',version:'test'}}})+'\\n'))`;
    await expect(probeMcpServer([process.execPath, '-e', responder], 1_000)).resolves.toEqual({
      ok: true,
      detail: 'stdio handshake succeeded'
    });
    await expect(probeMcpServer(['/definitely/missing/radiocli'], 1_000)).resolves.toMatchObject({ok: false});
  });

  it('reports stale and current portable registrations', async () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-mcp-status-'));
    roots.push(root);
    process.env.RADIOCLI_HOME = root;
    const path = join(root, 'mcp.json');
    const runtime = {nodePath: '/node', cliPath: '/radio/cli.js'};
    writeFileSync(path, '{"mcpServers":{"radiocli":{"command":"/old/node","args":["/old/cli.js","mcp","serve"]}}}\n');

    const stale = await mcpIntegrationReport(runtime) as {clients: {portable: {state: string}}; command: string[]};
    expect(stale.clients.portable.state).toBe('stale');

    writeFileSync(path, `${JSON.stringify({mcpServers: {radiocli: {command: stale.command[0], args: stale.command.slice(1)}}})}\n`);
    const current = await mcpIntegrationReport(runtime) as {clients: {portable: {state: string}}};
    expect(current.clients.portable.state).toBe('configured');
  }, 15_000);

  it('preserves JSONC comments and unrelated servers while adding and removing RadioCLI', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-opencode-'));
    roots.push(root);
    const path = join(root, 'opencode.jsonc');
    writeFileSync(path, '{\n  // Keep the user configuration.\n  "mcp": {"servers": {"other": {"type": "remote", "url": "https://example.test/mcp"}}},\n}\n');

    updateOpenCodeConfig(path, true, ['/node path/node', '/radio path/cli.js', 'mcp', 'serve']);
    const enabledText = readFileSync(path, 'utf8');
    const enabled = parse(enabledText) as {mcp: {servers: Record<string, unknown>}};
    expect(enabledText).toContain('Keep the user configuration');
    expect(enabled.mcp.servers.other).toBeDefined();
    expect(enabled.mcp.servers.radiocli).toEqual({
      type: 'local',
      command: ['/node path/node', '/radio path/cli.js', 'mcp', 'serve'],
      disabled: false
    });

    updateOpenCodeConfig(path, false, []);
    const disabled = parse(readFileSync(path, 'utf8')) as {mcp: {servers: Record<string, unknown>}};
    expect(disabled.mcp.servers.other).toBeDefined();
    expect(disabled.mcp.servers.radiocli).toBeUndefined();
  });

  it('refuses to rewrite an invalid existing configuration', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-opencode-invalid-'));
    roots.push(root);
    const path = join(root, 'opencode.jsonc');
    writeFileSync(path, '{invalid');
    expect(() => updateOpenCodeConfig(path, true, ['node'])).toThrow('Cannot safely update invalid OpenCode config');
  });

  it('updates legacy OpenCode MCP layouts without forcing a format migration', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-opencode-legacy-'));
    roots.push(root);
    const path = join(root, 'opencode.json');
    writeFileSync(path, '{"mcp":{"other":{"type":"local","command":["other"],"enabled":true}}}\n');
    updateOpenCodeConfig(path, true, ['node', 'radio.js']);
    const config = parse(readFileSync(path, 'utf8')) as {mcp: Record<string, unknown>};
    expect(config.mcp.other).toBeDefined();
    expect(config.mcp.radiocli).toEqual({type: 'local', command: ['node', 'radio.js'], enabled: true});
    expect(config.mcp.servers).toBeUndefined();
  });

  it('does not mistake unrelated OpenCode MCP options for legacy server entries', () => {
    const root = mkdtempSync(join(tmpdir(), 'radiocli-opencode-v2-'));
    roots.push(root);
    const path = join(root, 'opencode.json');
    writeFileSync(path, '{"mcp":{"timeout":15000}}\n');
    updateOpenCodeConfig(path, true, ['node', 'radio.js']);
    const config = parse(readFileSync(path, 'utf8')) as {mcp: {timeout: number; servers: Record<string, unknown>}};
    expect(config.mcp.timeout).toBe(15000);
    expect(config.mcp.servers.radiocli).toEqual({type: 'local', command: ['node', 'radio.js'], disabled: false});
  });
});
