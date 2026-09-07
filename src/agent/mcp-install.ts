import {spawn} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {applyEdits, modify, parse, type FormattingOptions} from 'jsonc-parser';
import type {Writable} from 'node:stream';
import {JsonLibraryStore} from '../storage/store.js';
import {defaultAgentControlSettings} from '../types.js';
import {resolveExecutable} from './launcher.js';
import type {AgentRuntime} from './service.js';

export type McpInstallResult = {client: string; status: 'configured' | 'removed' | 'not-found' | 'failed' | 'inherited'; detail: string};
type McpRegistrationState = 'configured' | 'stale' | 'missing' | 'not-found' | 'managed-by-client';
type McpClientState = {detected: boolean; state: McpRegistrationState; detail: string};
const formatting: FormattingOptions = {insertSpaces: true, tabSize: 2, eol: '\n'};

export async function configureMcpIntegrations(
  enabled: boolean,
  runtime: AgentRuntime,
  output: Writable | null = process.stdout
): Promise<McpInstallResult[]> {
  const store = new JsonLibraryStore();
  const current = store.snapshot().settings;
  if (!enabled) store.updateSettings({agentControl: {...(current.agentControl ?? defaultAgentControlSettings), enabled: false}});
  const results: McpInstallResult[] = [];
  const command = mcpServerCommand(runtime);
  if (enabled) {
    const probe = await probeMcpServer(command);
    results.push({client: 'RadioCLI MCP server', status: probe.ok ? 'configured' : 'failed', detail: probe.detail});
    if (!probe.ok) {
      output?.write('\nAgent integration could not be enabled\n');
      output?.write(`  RadioCLI MCP server: failed · ${probe.detail}\n`);
      return results;
    }
  }
  const codex = resolveCodexExecutable();

  if (codex) {
    results.push(await configureCliClient('Codex', codex, enabled
      ? ['mcp', 'add', 'radiocli', '--', ...command]
      : ['mcp', 'remove', 'radiocli'], ['mcp', 'remove', 'radiocli']));
  } else results.push(notFound('Codex'));

  const claude = resolveExecutable('claude');
  if (claude) {
    results.push(await configureCliClient('Claude Code', claude, enabled
      ? ['mcp', 'add', '--scope', 'user', 'radiocli', '--', ...command]
      : ['mcp', 'remove', '--scope', 'user', 'radiocli'], ['mcp', 'remove', '--scope', 'user', 'radiocli']));
  } else results.push(notFound('Claude Code'));

  const openCodePath = openCodeConfigPath();
  if (resolveExecutable('opencode') || existsSync(openCodePath)) {
    try {
      updateOpenCodeConfig(openCodePath, enabled, command);
      results.push({client: 'OpenCode', status: enabled ? 'configured' : 'removed', detail: openCodePath});
    } catch (error) {
      results.push({client: 'OpenCode', status: 'failed', detail: message(error)});
    }
  } else results.push(notFound('OpenCode'));

  configureJsonClient(results, 'Cursor', cursorDetected(), join(homedir(), '.cursor', 'mcp.json'), ['mcpServers', 'radiocli'], enabled, {
    command: command[0], args: command.slice(1)
  });
  configureJsonClient(results, 'Gemini CLI', Boolean(resolveExecutable('gemini')), join(homedir(), '.gemini', 'settings.json'), ['mcpServers', 'radiocli'], enabled, {
    command: command[0], args: command.slice(1)
  });
  configureJsonClient(results, 'VS Code / Copilot Agent Host', vsCodeDetected(), join(homedir(), '.copilot', 'mcp-config.json'), ['servers', 'radiocli'], enabled, {
    type: 'stdio', command: command[0], args: command.slice(1)
  });

  if (resolveExecutable('orca')) {
    results.push({client: 'Orca', status: 'inherited', detail: 'Orca exposes MCP integrations through its configured Codex/Claude agent runtimes.'});
  } else results.push(notFound('Orca'));

  const portablePath = writePortableConfig(command, enabled);
  results.push({client: 'Other MCP clients', status: enabled ? 'configured' : 'removed', detail: portablePath});
  if (enabled) {
    const latest = store.snapshot().settings;
    store.updateSettings({agentControl: {...(latest.agentControl ?? defaultAgentControlSettings), enabled: true}});
  }
  output?.write(`\nAgent integration ${enabled ? 'enabled' : 'disabled'}\n`);
  for (const result of results) output?.write(`  ${result.client}: ${result.status} · ${result.detail}\n`);
  if (enabled) {
    output?.write('\nIMPORTANT: Fully quit and reopen every running agent client before testing RadioCLI. New tasks opened before that restart will not have the RadioCLI tools and may incorrectly fall back to a browser.\n');
  }
  return results;
}

export function portableMcpConfig(runtime: AgentRuntime): Record<string, unknown> {
  const command = mcpServerCommand(runtime);
  return {mcpServers: {radiocli: {type: 'stdio', command: command[0], args: command.slice(1)}}};
}

export async function mcpIntegrationReport(runtime: AgentRuntime): Promise<Record<string, unknown>> {
  const settings = new JsonLibraryStore().snapshot().settings.agentControl ?? defaultAgentControlSettings;
  const command = mcpServerCommand(runtime);
  const shimLauncher = command.length === 3;
  const server = await probeMcpServer(command);
  const clients = await mcpClientStates(command);
  const needsRepair = Object.entries(clients)
    .filter(([, client]) => client.detected && (client.state === 'missing' || client.state === 'stale'))
    .map(([client]) => client);
  const launcherExists = Boolean(command[0] && existsSync(command[0]) && (shimLauncher || (command[1] && existsSync(command[1]))));
  return {
    enabled: settings.enabled,
    health: !settings.enabled ? 'disabled' : launcherExists && server.ok && needsRepair.length === 0 ? 'ready' : 'needs-repair',
    nextStep: !settings.enabled
      ? 'Enable Agent control & MCP in the TUI, or run radiocli mcp enable.'
      : !server.ok
        ? `The configured MCP server cannot start: ${server.detail} Run radiocli mcp repair after reinstalling or rebuilding RadioCLI.`
        : needsRepair.length > 0
        ? `Run radiocli mcp repair, then restart open agent clients. Needs repair: ${needsRepair.join(', ')}.`
        : 'RadioCLI is ready for local agents and Codex Voice.',
    command,
    server,
    launcher: {
      mode: shimLauncher ? 'radiocli-shim' : 'node-fallback',
      path: command[0],
      target: shimLauncher ? command[0] : command[1],
      exists: launcherExists,
      upgradeSafe: shimLauncher
    },
    clients,
    portableConfigPath: portableConfigPath()
  };
}

/** Prefer the package-manager-owned shim because it survives package/Cellar version changes. */
export function mcpServerCommand(
  runtime: AgentRuntime,
  radioCliPath?: string | null,
  platform: NodeJS.Platform = process.platform
): string[] {
  const candidate = radioCliPath === undefined ? matchingRadioCliShim(runtime, platform) : radioCliPath;
  const launcher = candidate && usableDirectLauncher(candidate, platform) ? candidate : undefined;
  return launcher
    ? [launcher, 'mcp', 'serve']
    : [runtime.nodePath, runtime.cliPath, 'mcp', 'serve'];
}

export function probeMcpServer(command: string[], timeoutMs = 5_000): Promise<{ok: boolean; detail: string}> {
  return new Promise(resolve => {
    const [program, ...args] = command;
    if (!program) {
      resolve({ok: false, detail: 'No MCP server command was resolved.'});
      return;
    }
    const child = spawn(program, args, {stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true});
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result: {ok: boolean; detail: string}) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ok: false, detail: `Handshake timed out after ${timeoutMs} ms.${stderr ? ` ${stderr.trim()}` : ''}`}), timeoutMs);
    timer.unref();
    child.stderr.on('data', value => { stderr += String(value); });
    child.stdout.on('data', value => {
      stdout += String(value);
      let newline = stdout.indexOf('\n');
      while (newline >= 0) {
        const line = stdout.slice(0, newline).trim();
        stdout = stdout.slice(newline + 1);
        if (line) {
          try {
            const response = JSON.parse(line) as {id?: unknown; result?: {serverInfo?: {name?: unknown}}; error?: {message?: unknown}};
            if (response.id === 1 && response.result?.serverInfo?.name === 'radiocli') {
              finish({ok: true, detail: 'stdio handshake succeeded'});
              return;
            }
            if (response.id === 1 && response.error) {
              finish({ok: false, detail: `Handshake rejected: ${String(response.error.message ?? 'unknown MCP error')}`});
              return;
            }
          } catch {
            // Keep reading: a client may emit a non-protocol diagnostic line before startup.
          }
        }
        newline = stdout.indexOf('\n');
      }
    });
    child.once('error', error => finish({ok: false, detail: error.message}));
    child.once('close', code => finish({ok: false, detail: `${stderr.trim() || stdout.trim() || `server exited with code ${code ?? 1}`}`}));
    child.stdin.end(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {protocolVersion: '2025-11-25', capabilities: {}, clientInfo: {name: 'radiocli-setup', version: '1.0.0'}}
    })}\n`);
  });
}

function matchingRadioCliShim(runtime: AgentRuntime, platform: NodeJS.Platform): string | undefined {
  const candidate = resolveExecutable('radiocli', process.env, platform);
  if (!candidate) return undefined;
  if (!usableDirectLauncher(candidate, platform)) return undefined;
  try {
    return realpathSync(candidate) === realpathSync(runtime.cliPath) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function usableDirectLauncher(path: string, platform: NodeJS.Platform): boolean {
  return platform !== 'win32' || !/\.(?:cmd|bat)$/i.test(path);
}

async function mcpClientStates(command: string[]): Promise<Record<string, McpClientState>> {
  const openCodePath = openCodeConfigPath();
  const cursorPath = join(homedir(), '.cursor', 'mcp.json');
  const geminiPath = join(homedir(), '.gemini', 'settings.json');
  const vscodePath = join(homedir(), '.copilot', 'mcp-config.json');
  return {
    codex: await codexClientState(resolveCodexExecutable(), command),
    claude: await claudeClientState(resolveExecutable('claude'), command),
    opencode: jsonClientState(Boolean(resolveExecutable('opencode') || existsSync(openCodePath)), openCodePath, [
      ['mcp', 'servers', 'radiocli'], ['mcp', 'radiocli']
    ], command),
    cursor: jsonClientState(cursorDetected(), cursorPath, [['mcpServers', 'radiocli']], command),
    gemini: jsonClientState(Boolean(resolveExecutable('gemini')), geminiPath, [['mcpServers', 'radiocli']], command),
    vscode: jsonClientState(vsCodeDetected(), vscodePath, [['servers', 'radiocli']], command),
    orca: {
      detected: Boolean(resolveExecutable('orca')),
      state: resolveExecutable('orca') ? 'managed-by-client' : 'not-found',
      detail: 'inherits MCP configuration from its Codex or Claude runtime'
    },
    portable: jsonClientState(true, portableConfigPath(), [['mcpServers', 'radiocli']], command)
  };
}

function managedClientState(detected: boolean): {detected: boolean; state: McpRegistrationState; detail: string} {
  return {detected, state: detected ? 'managed-by-client' : 'not-found', detail: detected ? 'inspect with the client MCP command' : 'client is not installed'};
}

export function resolveCodexExecutable(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home = homedir()
): string | undefined {
  const configured = env.CODEX_CLI_PATH;
  if (configured && existsSync(configured)) return configured;
  const pathExecutable = resolveExecutable('codex', env, platform);
  if (pathExecutable) return pathExecutable;
  const candidates = platform === 'darwin'
    ? [
        '/Applications/ChatGPT.app/Contents/Resources/codex',
        join(home, 'Applications', 'ChatGPT.app', 'Contents', 'Resources', 'codex')
      ]
    : platform === 'win32'
      ? [
          join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'Programs', 'ChatGPT', 'resources', 'codex.exe'),
          join(env.ProgramFiles ?? 'C:\\Program Files', 'ChatGPT', 'resources', 'codex.exe')
        ]
      : [];
  return candidates.find(candidate => existsSync(candidate));
}

function cursorDetected(): boolean {
  return Boolean(
    resolveExecutable('cursor') ||
    resolveExecutable('cursor-agent') ||
    existsSync(join(homedir(), '.cursor')) ||
    (process.platform === 'darwin' && existsSync('/Applications/Cursor.app')) ||
    (process.platform === 'win32' && existsSync(join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Programs', 'cursor', 'Cursor.exe')))
  );
}

function vsCodeDetected(): boolean {
  return Boolean(
    resolveExecutable('code') ||
    (process.platform === 'darwin' && existsSync('/Applications/Visual Studio Code.app')) ||
    (process.platform === 'win32' && existsSync(join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Programs', 'Microsoft VS Code', 'Code.exe')))
  );
}

async function codexClientState(executable: string | undefined, expected: string[]): Promise<McpClientState> {
  if (!executable) return managedClientState(false);
  const result = await run(executable, ['mcp', 'get', 'radiocli', '--json']);
  if (result.code !== 0) {
    const detail = `${result.stderr}\n${result.stdout}`.trim();
    return missingRegistration(detail)
      ? {detected: true, state: 'missing', detail: 'RadioCLI is not registered'}
      : {detected: true, state: 'stale', detail: detail || `Codex MCP inspection exited with code ${result.code}`};
  }
  try {
    const parsed = JSON.parse(result.stdout) as {enabled?: unknown; transport?: {type?: unknown; command?: unknown; args?: unknown}};
    const actual = parsed.transport?.type === 'stdio' && typeof parsed.transport.command === 'string' && Array.isArray(parsed.transport.args)
      ? [parsed.transport.command, ...parsed.transport.args.filter((value): value is string => typeof value === 'string')]
      : [];
    if (parsed.enabled === false) return {detected: true, state: 'stale', detail: 'RadioCLI is registered but disabled in Codex'};
    return arraysEqual(actual, expected)
      ? {detected: true, state: 'configured', detail: 'shared ChatGPT desktop, Codex CLI, and IDE configuration'}
      : {detected: true, state: 'stale', detail: `registered command: ${actual.join(' ') || 'unrecognized transport'}`};
  } catch {
    return {detected: true, state: 'stale', detail: 'Codex returned an invalid MCP status response'};
  }
}

async function claudeClientState(executable: string | undefined, expected: string[]): Promise<McpClientState> {
  if (!executable) return managedClientState(false);
  const result = await run(executable, ['mcp', 'get', 'radiocli']);
  const detail = `${result.stdout}\n${result.stderr}`.trim();
  if (result.code !== 0) {
    return missingRegistration(detail)
      ? {detected: true, state: 'missing', detail: 'RadioCLI is not registered'}
      : {detected: true, state: 'stale', detail: detail || `Claude MCP inspection exited with code ${result.code}`};
  }
  const commandMatches = expected.every(value => detail.includes(value));
  return commandMatches
    ? {detected: true, state: 'configured', detail: 'user-level MCP configuration'}
    : {detected: true, state: 'stale', detail: 'RadioCLI is registered with a different command'};
}

function jsonClientState(
  detected: boolean,
  path: string,
  candidates: string[][],
  expected: string[]
): {detected: boolean; state: McpRegistrationState; detail: string} {
  if (!detected && !existsSync(path)) return {detected: false, state: 'not-found', detail: path};
  if (!existsSync(path)) return {detected, state: 'missing', detail: path};
  try {
    const parsed = parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    const value = candidates.map(segments => valueAt(parsed, segments)).find(candidate => candidate !== undefined);
    if (value === undefined) return {detected, state: 'missing', detail: path};
    const actual = commandFromConfig(value);
    return {detected, state: arraysEqual(actual, expected) ? 'configured' : 'stale', detail: path};
  } catch {
    return {detected, state: 'stale', detail: `${path} (invalid configuration)`};
  }
}

function valueAt(value: unknown, segments: string[]): unknown {
  let current = value;
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function commandFromConfig(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  const object = value as {command?: unknown; args?: unknown};
  if (Array.isArray(object.command) && object.command.every(item => typeof item === 'string')) return object.command as string[];
  if (typeof object.command === 'string' && Array.isArray(object.args) && object.args.every(item => typeof item === 'string')) {
    return [object.command, ...(object.args as string[])];
  }
  return [];
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function missingRegistration(detail: string): boolean {
  return /not found|does not exist|not configured|no mcp server(?:s)?.*found|no mcp servers are configured/i.test(detail);
}

async function configureCliClient(client: string, program: string, args: string[], removeArgs: string[]): Promise<McpInstallResult> {
  try {
    let result = await run(program, args);
    if (result.code !== 0 && args.includes('add') && /already exists|already configured|duplicate/i.test(`${result.stderr}\n${result.stdout}`)) {
      const removed = await run(program, removeArgs);
      if (removed.code !== 0) throw new Error((removed.stderr || removed.stdout || `exit ${removed.code}`).trim());
      result = await run(program, args);
    }
    if (result.code !== 0) throw new Error((result.stderr || result.stdout || `exit ${result.code}`).trim());
    return {client, status: args.includes('add') ? 'configured' : 'removed', detail: 'user-level MCP configuration'};
  } catch (error) {
    if (!args.includes('add') && /not found|does not exist|No MCP server/i.test(message(error))) return {client, status: 'removed', detail: 'already absent'};
    return {client, status: 'failed', detail: message(error)};
  }
}

export function updateOpenCodeConfig(path: string, enabled: boolean, command: string[]): void {
  const source = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const parsed = source ? parse(source) as {mcp?: Record<string, unknown>} : {};
  const legacy = Boolean(parsed.mcp && !('servers' in parsed.mcp) && Object.values(parsed.mcp).some(isLegacyOpenCodeServer));
  const value = enabled
    ? legacy ? {type: 'local', command, enabled: true} : {type: 'local', command, disabled: false}
    : undefined;
  updateJsoncValue(path, legacy ? ['mcp', 'radiocli'] : ['mcp', 'servers', 'radiocli'], value, '{\n  "$schema": "https://opencode.ai/config.json"\n}\n', 'OpenCode');
}

function isLegacyOpenCodeServer(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as {type?: unknown; command?: unknown; url?: unknown};
  return (candidate.type === 'local' && Array.isArray(candidate.command)) || (candidate.type === 'remote' && typeof candidate.url === 'string');
}

function configureJsonClient(
  results: McpInstallResult[],
  client: string,
  detected: boolean,
  path: string,
  segments: string[],
  enabled: boolean,
  value: unknown
): void {
  if (!detected && !existsSync(path)) {
    results.push(notFound(client));
    return;
  }
  try {
    updateJsoncValue(path, segments, enabled ? value : undefined, '{}\n', client);
    results.push({client, status: enabled ? 'configured' : 'removed', detail: path});
  } catch (error) {
    results.push({client, status: 'failed', detail: message(error)});
  }
}

function updateJsoncValue(path: string, segments: string[], value: unknown, initial: string, client: string): void {
  mkdirSync(dirname(path), {recursive: true, mode: 0o700});
  const source = existsSync(path) ? readFileSync(path, 'utf8') : initial;
  const errors: import('jsonc-parser').ParseError[] = [];
  parse(source, errors, {allowTrailingComma: true, disallowComments: false});
  if (errors.length) throw new Error(`Cannot safely update invalid ${client} config: ${path}`);
  const updated = applyEdits(source, modify(source, segments, value, {formattingOptions: formatting}));
  writeFileSync(path, updated.endsWith('\n') ? updated : `${updated}\n`, {mode: 0o600});
}

function writePortableConfig(command: string[], enabled: boolean): string {
  const path = portableConfigPath();
  mkdirSync(dirname(path), {recursive: true, mode: 0o700});
  const config = enabled ? {mcpServers: {radiocli: {type: 'stdio', command: command[0], args: command.slice(1)}}} : {mcpServers: {}};
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, {mode: 0o600});
  return path;
}

function portableConfigPath(): string {
  if (process.env.RADIOCLI_HOME) return join(process.env.RADIOCLI_HOME, 'mcp.json');
  const base = process.platform === 'win32'
    ? process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
    : process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(base, 'radiocli', 'mcp.json');
}

function openCodeConfigPath(): string {
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  const directory = join(base, 'opencode');
  const jsonc = join(directory, 'opencode.jsonc');
  const json = join(directory, 'opencode.json');
  return existsSync(jsonc) ? jsonc : json;
}

function run(program: string, args: string[], timeoutMs = 15_000): Promise<{code: number; stdout: string; stderr: string}> {
  return new Promise((resolve, reject) => {
    const invocation = cliInvocation(program, args);
    const child = spawn(invocation.program, invocation.args, {stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true});
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (result: {code: number; stdout: string; stderr: string}) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({code: 1, stdout, stderr: `${stderr}${stderr ? '\n' : ''}Timed out after ${timeoutMs} ms.`});
    }, timeoutMs);
    timer.unref();
    child.stdout.on('data', value => { stdout += String(value); });
    child.stderr.on('data', value => { stderr += String(value); });
    child.once('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', code => finish({code: code ?? 1, stdout, stderr}));
  });
}

export function cliInvocation(
  program: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): {program: string; args: string[]} {
  if (platform !== 'win32' || !/\.(?:cmd|bat)$/i.test(program)) return {program, args};
  const command = [program, ...args].map(value => `"${escapeCmdArgument(value)}"`).join(' ');
  return {program: env.ComSpec || env.COMSPEC || 'cmd.exe', args: ['/d', '/s', '/v:off', '/c', command]};
}

function escapeCmdArgument(value: string): string {
  return value
    .replaceAll('%', '%%')
    .replaceAll('"', '""')
    .replaceAll('^', '^^')
    .replaceAll('&', '^&')
    .replaceAll('|', '^|')
    .replaceAll('<', '^<')
    .replaceAll('>', '^>');
}

function notFound(client: string): McpInstallResult { return {client, status: 'not-found', detail: 'client is not installed on this computer'}; }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
