import {spawn} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const smokeHome = mkdtempSync(join(tmpdir(), 'radiocli-mcp-smoke-'));
const child = spawn(process.execPath, [join(root, 'dist', 'cli.js'), 'mcp', 'serve'], {
  cwd: root,
  env: {...process.env, RADIOCLI_HOME: smokeHome},
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

try {
  await new Promise((resolve, reject) => {
  let stdout = '';
  let stderr = '';
  let settled = false;
  const finish = error => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    child.kill();
    error ? reject(error) : resolve();
  };
  const timeout = setTimeout(() => finish(new Error(`MCP smoke timed out.${stderr ? ` ${stderr.trim()}` : ''}`)), 5_000);
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
        if (response.id === 1) {
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
          finish();
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
  rmSync(smokeHome, {recursive: true, force: true});
}
