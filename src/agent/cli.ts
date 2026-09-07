import type {AgentRuntime} from './service.js';
import {AgentRadioService, stationForAgent} from './service.js';
import {configureMcpIntegrations, mcpIntegrationReport, portableMcpConfig} from './mcp-install.js';
import {runMcpServer} from './mcp-server.js';

export async function runMcpCommand(args: string[], runtime: AgentRuntime): Promise<void> {
  const command = args[0] ?? 'status';
  if (command === 'serve') return runMcpServer(runtime);
  if (command === 'enable' || command === 'install' || command === 'repair') {
    assertMcpInstallSucceeded(await configureMcpIntegrations(true, runtime), 'configured');
    return;
  }
  if (command === 'disable' || command === 'remove') {
    assertMcpInstallSucceeded(await configureMcpIntegrations(false, runtime), 'removed');
    return;
  }
  if (command === 'config') {
    console.log(JSON.stringify(portableMcpConfig(runtime), null, 2));
    return;
  }
  if (command === 'status' || command === 'doctor') {
    console.log(JSON.stringify(await mcpIntegrationReport(runtime), null, 2));
    return;
  }
  throw new Error('Usage: radiocli mcp <enable|install|repair|disable|status|config|serve>');
}

export async function runAgentCliCommand(args: string[], runtime: AgentRuntime): Promise<void> {
  const service = new AgentRadioService(runtime);
  const [command = 'status', ...rest] = args;
  let value: unknown;
  if (command === 'status') value = await service.status();
  else if (command === 'search') value = (await service.search(requiredText(rest, 'Usage: radiocli agent search <query>'))).map(stationForAgent);
  else if (command === 'browse') {
    const kind = parseBrowseKind(rest[0]);
    if (rest.length > 2) throw new Error('Usage: radiocli agent browse [favorites|recent|popular|nearby|countries|track-history] [1-50]');
    const items = await service.browse(kind, rest[1] === undefined ? 20 : integerInRange(rest[1], 1, 50, 'Browse limit'));
    value = ['favorites', 'recent', 'popular', 'nearby'].includes(kind)
      ? (items as Parameters<typeof stationForAgent>[0][]).map(stationForAgent)
      : items;
  }
  else if (command === 'play') value = await service.play(parsePlayArgs(rest));
  else if (command === 'pause' || command === 'resume' || command === 'stop' || command === 'next' || command === 'previous') value = await service.control({type: command});
  else if (command === 'volume') {
    if (rest.length !== 1) throw new Error('Usage: radiocli agent volume <0-100>');
    value = await service.control({type: 'set-volume', volume: numberInRange(rest[0]!, 0, 100, 'Volume')});
  }
  else if (command === 'mute' || command === 'unmute') value = await service.control({type: 'set-muted', muted: command === 'mute'});
  else if (command === 'favorite' || command === 'unfavorite') value = await service.setFavorite(command === 'favorite', rest[0]);
  else if (command === 'stats') value = service.stats();
  else if (command === 'appearance') value = await parseAppearance(rest, service);
  else if (command === 'airplay') value = await runAirPlayCommand(rest, service);
  else if (command === 'preset') value = service.configureCompletionPreset(parsePreset(rest));
  else if (command === 'done') value = await service.runCompletionPreset();
  else throw new Error('Usage: radiocli agent <status|search|browse|play|pause|resume|stop|next|previous|volume|mute|unmute|favorite|unfavorite|stats|appearance|airplay|preset|done>');
  console.log(JSON.stringify(value, null, 2));
}

function parseBrowseKind(value: string | undefined): 'favorites' | 'recent' | 'popular' | 'nearby' | 'countries' | 'track-history' {
  const kind = value ?? 'recent';
  if (!['favorites', 'recent', 'popular', 'nearby', 'countries', 'track-history'].includes(kind)) throw new Error('Browse kind must be favorites, recent, popular, nearby, countries, or track-history.');
  return kind as ReturnType<typeof parseBrowseKind>;
}

function parsePlayArgs(args: string[]): {stationId?: string; source?: 'recent' | 'favorite' | 'popular' | 'country'; countryCode?: string; random?: boolean; openUi?: boolean; ifPlaying?: 'keep' | 'replace'} {
  const result: ReturnType<typeof parsePlayArgs> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === '--source') result.source = stationSource(required(args[++index], '--source requires recent, favorite, popular, or country.'));
    else if (arg === '--country') { result.source = 'country'; result.countryCode = countryCode(required(args[++index], '--country requires a two-letter code.')); }
    else if (arg === '--random') result.random = true;
    else if (arg === '--no-ui') result.openUi = false;
    else if (arg === '--keep-playing') result.ifPlaying = 'keep';
    else if (!result.stationId) result.stationId = arg;
    else throw new Error(`Unknown play option: ${arg}`);
  }
  return result;
}

function parseAppearance(args: string[], service: AgentRadioService): unknown {
  if (args.length === 0) return service.appearance();
  const input: Parameters<AgentRadioService['updateAppearance']>[0] = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === '--theme') input.theme = required(args[++index], '--theme requires a theme name.') as typeof input.theme;
    else if (arg === '--receiver-style') input.receiverStyle = required(args[++index], '--receiver-style requires a style name.') as typeof input.receiverStyle;
    else throw new Error(`Unknown appearance option: ${arg}`);
  }
  return service.updateAppearance(input);
}

function parsePreset(args: string[]): Parameters<AgentRadioService['configureCompletionPreset']>[0] {
  const input: Parameters<AgentRadioService['configureCompletionPreset']>[0] = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === '--action') input.action = presetAction(required(args[++index], '--action requires play, pause, resume, or stop.'));
    else if (arg === '--source') input.source = stationSource(required(args[++index], '--source requires recent, favorite, popular, or country.'));
    else if (arg === '--country') { input.source = 'country'; input.countryCode = countryCode(required(args[++index], '--country requires a two-letter code.')); }
    else if (arg === '--keep-playing') input.ifPlaying = 'keep';
    else if (arg === '--replace') input.ifPlaying = 'replace';
    else if (arg === '--open-ui') input.openUi = true;
    else if (arg === '--no-ui') input.openUi = false;
    else throw new Error(`Unknown preset option: ${arg}`);
  }
  return input;
}

async function runAirPlayCommand(args: string[], service: AgentRadioService): Promise<unknown> {
  const [action = 'list', ...rest] = args;
  if (action === 'list') return service.listAirPlayDevices();
  if (action === 'select') return service.selectAirPlayDevice(required(rest[0], 'Usage: radiocli agent airplay select <receiver-id>'), !rest.includes('--no-ui'));
  if (action === 'local') return service.useLocalOutput();
  if (action === 'code') return service.submitAirPlayPasscode(required(rest[0], 'Usage: radiocli agent airplay code <receiver-code>'));
  throw new Error('Usage: radiocli agent airplay <list|select|local|code>');
}

function required(value: string | undefined, error: string): string { if (!value) throw new Error(error); return value; }

function requiredText(values: string[], error: string): string {
  const value = values.join(' ').trim();
  if (!value) throw new Error(error);
  return value;
}

function numberInRange(value: string, minimum: number, maximum: number, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be a number from ${minimum} through ${maximum}.`);
  }
  return parsed;
}

function integerInRange(value: string, minimum: number, maximum: number, label: string): number {
  const parsed = numberInRange(value, minimum, maximum, label);
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be a whole number from ${minimum} through ${maximum}.`);
  return parsed;
}

function stationSource(value: string): 'recent' | 'favorite' | 'popular' | 'country' {
  if (!['recent', 'favorite', 'popular', 'country'].includes(value)) {
    throw new Error('Source must be recent, favorite, popular, or country.');
  }
  return value as ReturnType<typeof stationSource>;
}

function presetAction(value: string): 'play' | 'pause' | 'resume' | 'stop' {
  if (!['play', 'pause', 'resume', 'stop'].includes(value)) throw new Error('Action must be play, pause, resume, or stop.');
  return value as ReturnType<typeof presetAction>;
}

function countryCode(value: string): string {
  if (!/^[a-z]{2}$/i.test(value)) throw new Error('Country must be a two-letter ISO country code.');
  return value.toUpperCase();
}

function assertMcpInstallSucceeded(results: Awaited<ReturnType<typeof configureMcpIntegrations>>, action: string): void {
  const failed = results.filter(result => result.status === 'failed');
  if (failed.length === 0) return;
  throw new Error(`RadioCLI was ${action} where possible, but ${failed.length} integration${failed.length === 1 ? '' : 's'} failed: ${failed.map(result => `${result.client} (${result.detail})`).join('; ')}`);
}
