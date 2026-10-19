import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {JsonLibraryStore} from '../dist/storage/store.js';
import {defaultAgentControlSettings} from '../dist/types.js';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const smokeHome = mkdtempSync(join(tmpdir(), 'radiocli-mcp-smoke-'));
const store = new JsonLibraryStore(join(smokeHome, 'radiocli.json'));
const station = {id: 'mcp-fixture', provider: 'playlist', name: 'Café 日本 FM', tags: [], streamUrl: 'https://example.invalid/live'};
store.addImported([station]);
store.toggleFavorite(station);
store.startListeningSession(station, new Date('2026-01-01T08:00:00Z'));
store.finishActiveListeningSession(new Date('2026-01-01T08:02:00Z'));
store.updateSettings({enableNearbyLocation: false});
const child = spawn(process.execPath, [join(root, 'dist', 'cli.js'), 'mcp', 'serve'], {
  cwd: root,
  env: {...process.env, RADIOCLI_HOME: smokeHome, RADIOCLI_OFFLINE: '1'},
  stdio: ['pipe', 'pipe', 'pipe'],
  windowsHide: true
});

const requiredTools = [
  'radio_status',
  'radio_update_status',
  'radio_search',
  'radio_browse',
  'radio_play',
  'radio_pause',
  'radio_resume',
  'radio_stop',
  'radio_next',
  'radio_previous',
  'radio_set_volume',
  'radio_set_muted',
  'radio_set_favorite',
  'radio_stats',
  'radio_get_appearance',
  'radio_set_appearance',
  'radio_set_agent_preferences',
  'radio_run_completion_preset',
  'radio_configure_completion_preset',
  'radio_alarm_list',
  'radio_alarm_status',
  'radio_alarm_create',
  'radio_alarm_update',
  'radio_alarm_set_enabled',
  'radio_alarm_remove',
  'radio_alarm_sync',
  'radio_alarm_control',
  'radio_airplay_list',
  'radio_airplay_select',
  'radio_airplay_use_local',
  'radio_airplay_submit_code'
];

const closed = once(child, 'close');
const pending = new Map();
let requestId = 2;
const call = (name, args = {}) => new Promise((resolve, reject) => {
  const id = ++requestId;
  pending.set(id, {resolve, reject});
  child.stdin.write(`${JSON.stringify({jsonrpc: '2.0', id, method: 'tools/call', params: {name, arguments: args}})}\n`);
});
const value = response => {
  assert.ok(!response.error && !response.result?.isError, JSON.stringify(response));
  return JSON.parse(response.result.content[0].text);
};
const errorText = response => {
  assert.ok(response.error || response.result?.isError, 'Invalid tool calls must fail.');
  return JSON.stringify(response);
};

async function exerciseTools() {
  assert.match(errorText(await call('radio_status')), /Agent control is disabled/);
  store.updateSettings({agentControl: {...defaultAgentControlSettings, enabled: true}});
  assert.equal(value(await call('radio_status')).connected, false);
  const favorites = value(await call('radio_browse', {kind: 'favorites'}));
  assert.equal(favorites[0].id, 'playlist:mcp-fixture');
  assert.equal(favorites[0].name, station.name);
  assert.match(errorText(await call('radio_browse', {kind: 'nearby'})), /disabled/);
  const stats = value(await call('radio_stats'));
  assert.equal(stats.totalSeconds, 120);
  assert.equal(stats.favoriteStation.name, station.name);
  assert.ok(value(await call('radio_get_appearance')).themes.includes('ruby'));
  value(await call('radio_set_appearance', {theme: 'ruby', receiver_style: 'mesh'}));
  assert.equal(value(await call('radio_get_appearance')).current.receiverStyle, 'mesh');
  assert.equal(new JsonLibraryStore(store.filePath).settings().theme, 'ruby');
  assert.match(errorText(await call('radio_set_appearance', {theme: 'invalid'})), /invalid|Invalid/);
  assert.match(errorText(await call('radio_set_volume', {volume: 101})), /100/);
  assert.deepEqual(value(await call('radio_alarm_list')), []);
  assert.match(errorText(await call('radio_alarm_remove', {alarm_id: 'absent', confirm: false})), /confirm=true/);
  assert.match(errorText(await call('radio_alarm_create', {station_id: 'playlist:mcp-fixture', schedule: {type: 'once', at: '2000-01-01T08:00:00Z'}})), /future/);
  assert.deepEqual(value(await call('radio_alarm_list')), []);
  assert.ok(value(await call('radio_stop')).ok);
  assert.ok(value(await call('radio_stop')).ok);
  value(await call('radio_set_favorite', {station_id: 'playlist:mcp-fixture', favorite: false}));
  assert.deepEqual(value(await call('radio_browse', {kind: 'favorites'})), []);
  assert.equal(new JsonLibraryStore(store.filePath).snapshot().favorites.length, 0);
  console.log(`MCP tool calls passed on ${process.platform}: ${requestId - 2} requests, persisted settings/favorites, privacy and validation.`);
}

try {
  await new Promise((resolve, reject) => {
  let stdout = '';
  let stderr = '';
  let settled = false;
  const finish = error => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    for (const request of pending.values()) request.reject(error ?? new Error('MCP smoke closed.'));
    pending.clear();
    child.kill();
    error ? reject(error) : resolve();
  };
  const timeout = setTimeout(() => finish(new Error(`MCP smoke timed out.${stderr ? ` ${stderr.trim()}` : ''}`)), 30_000);
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  child.stdin.on('error', error => finish(error));
  child.once('error', error => finish(error));
  child.once('close', code => {
    if (!settled) finish(new Error(stderr.trim() || `MCP server exited with code ${code ?? 1}.`));
  });
  child.stdout.on('data', chunk => {
    stdout += String(chunk);
    let newline = stdout.indexOf('\n');
    while (newline >= 0) {
      const line = stdout.slice(0, newline).trim();
      stdout = stdout.slice(newline + 1);
      if (line) {
        let response;
        try {
          response = JSON.parse(line);
        } catch (error) {
          finish(new Error(`MCP server wrote non-JSON stdout: ${error instanceof Error ? error.message : String(error)}`));
          return;
        }
        if (pending.has(response.id)) {
          pending.get(response.id).resolve(response);
          pending.delete(response.id);
        } else if (response.id === 1) {
          if (response.result?.serverInfo?.name !== 'radiocli') {
            finish(new Error('MCP initialize response did not identify RadioCLI.'));
            return;
          }
          child.stdin.write(`${JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'})}\n`);
          child.stdin.write(`${JSON.stringify({jsonrpc: '2.0', id: 2, method: 'tools/list', params: {}})}\n`);
        } else if (response.id === 2) {
          const tools = Array.isArray(response.result?.tools) ? response.result.tools : [];
          const names = new Set(tools.map(tool => tool.name));
          const missing = requiredTools.filter(name => !names.has(name));
          if (missing.length > 0) {
            finish(new Error(`MCP tools missing: ${missing.join(', ')}.`));
            return;
          }
          const remove = tools.find(tool => tool.name === 'radio_alarm_remove');
          const required = remove?.inputSchema?.required ?? [];
          if (!required.includes('alarm_id') || !required.includes('confirm')) {
            finish(new Error('radio_alarm_remove must require alarm_id and confirm.'));
            return;
          }
          console.log(`MCP smoke passed on ${process.platform}: ${tools.length} tools.`);
          void exerciseTools().then(() => finish(), finish);
          return;
        }
      }
      newline = stdout.indexOf('\n');
    }
  });

  child.stdin.write(`${JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {protocolVersion: '2025-11-25', capabilities: {}, clientInfo: {name: 'radiocli-smoke', version: '1.0.0'}}
  })}\n`);
  });
} finally {
  child.kill();
  await closed;
  rmSync(smokeHome, {recursive: true, force: true});
}
