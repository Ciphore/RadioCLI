#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {arch, endianness, release, tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const script = fileURLToPath(import.meta.url);

/** npm.cmd is a shell program; execute npm's JS entry with the selected Node. */
export function npmCommand({execPath = process.execPath, platform = process.platform, env = process.env} = {}) {
  const candidates = [env.npm_execpath,
    join(dirname(execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    resolve(dirname(execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')];
  const path = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  for (const directory of path.split(platform === 'win32' ? ';' : ':').filter(Boolean)) {
    candidates.push(join(directory, 'npm'), join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  }
  for (const candidate of candidates) {
    if (!candidate || !existsSync(candidate)) continue;
    const entry = realpathSync(candidate);
    if (entry.endsWith('npm-cli.js')) return {command: execPath, args: [entry]};
  }
  throw new Error('Cannot locate npm-cli.js. Install npm alongside Node.js or run this script through npm.');
}

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd, env: options.env ?? process.env, encoding: 'utf8', shell: false,
    windowsHide: true, timeout: options.timeout ?? 120_000, maxBuffer: 16 * 1024 * 1024
  });
  if (result.error || result.status !== (options.expectedStatus ?? 0)) {
    throw new Error(`${command} failed: ${result.error?.message ?? `exited with ${result.status}`}\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  }
  return result;
}

export function smokeEnvironment(home) {
  const env = {...process.env, RADIOCLI_HOME: home, RADIOCLI_OFFLINE: '1', RADIOCLI_DISABLE_ANIMATION: '1', RADIOCLI_MPV_AUDIO_OUTPUT: 'null', NO_COLOR: '1'};
  for (const key of Object.keys(env)) {
    if (['node_path', 'node_options', 'npm_config_dry_run', 'npm_config_omit', 'npm_config_include', 'npm_config_ignore_scripts'].includes(key.toLowerCase())) delete env[key];
  }
  return env;
}

/** Imports only the installed tarball; never the checkout's dist or node_modules. */
export async function runPackedSmoke(tarball, {omitOptional = false, requireMpv = false, executionMethod = 'local process', evidencePath} = {}) {
  tarball = resolve(tarball);
  assert.ok(existsSync(tarball), `Packed tarball is missing: ${tarball}`);
  assert.ok(Number(process.versions.node.split('.')[0]) >= 22, 'Packed runtime checks require Node.js 22 or newer.');
  if (process.env.RADIOCLI_EXPECTED_ARCH) assert.equal(process.arch, process.env.RADIOCLI_EXPECTED_ARCH, 'The packed runtime must match the requested native runner architecture.');
  const temporary = mkdtempSync(join(tmpdir(), 'radiocli packed & # % 日本 '));
  const project = join(temporary, 'project');
  const home = join(temporary, 'state');
  mkdirSync(project);
  mkdirSync(home);
  const env = smokeEnvironment(home);
  const networkLog = join(temporary, 'unexpected-network.log');
  const guardPath = join(temporary, 'network-guard.mjs');
  // --import uses ESM URL resolution: drive letters and URL delimiters must
  // remain file-path data on Windows and on POSIX paths containing # or %.
  const guard = pathToFileURL(guardPath).href;
  writeFileSync(guardPath, `import {appendFileSync} from 'node:fs';\nglobalThis.fetch = () => { appendFileSync(process.env.RADIOCLI_SMOKE_NETWORK_LOG, 'fetch attempted\\n'); return Promise.reject(new Error('Packed smoke forbids live network requests.')); };\n`);
  env.RADIOCLI_SMOKE_NETWORK_LOG = networkLog;
  try {
    writeFileSync(join(project, 'package.json'), '{"private":true,"type":"module"}\n');
    const npm = npmCommand();
    console.log(`packed_install=${omitOptional ? 'omit-optional' : 'normal'} method=${executionMethod}`);
    runCommand(npm.command, [...npm.args, 'install', '--no-audit', '--fund=false', '--omit=dev', '--ignore-scripts=false',
      ...(omitOptional ? ['--omit=optional'] : ['--include=optional']), tarball], {cwd: project, env, timeout: 300_000});
    const packageRoot = join(project, 'node_modules', '@ciphore', 'radiocli');
    const metadata = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
    const cli = join(packageRoot, metadata.bin.radiocli);
    assert.ok(existsSync(cli), 'The installed package is missing its declared CLI entry.');
    if (omitOptional) assert.equal(existsSync(join(project, 'node_modules', 'node-airtunes2')), false, 'The portable install unexpectedly installed the optional native sender.');
    const runCli = (args, options = {}) => runCommand(process.execPath, ['--import', guard, cli, ...args], {cwd: project, env, timeout: 45_000, ...options});
    assert.match(runCli(['help']).stdout, /Usage:/);
    assert.equal(runCli(['version']).stdout.trim(), metadata.version);
    const doctor = JSON.parse(runCli(['doctor', '--json']).stdout);
    assert.equal(doctor.radioCliVersion, metadata.version);
    assert.equal(doctor.platform, process.platform);
    assert.equal(doctor.architecture, process.arch);
    assert.ok(doctor.capabilities && doctor.host, 'doctor must report host facts and capabilities.');

    // A missing offline cache must fail promptly; stale persisted data must work.
    // The preload makes accidental live-directory access an explicit failure.
    assert.match(runCli(['countries'], {expectedStatus: 1}).stderr, /offline|cached/i);
    seedProviderCache(home);
    assert.match(runCli(['countries']).stdout, /ZZ\t2\tSmoke Islands/);
    assert.match(runCli(['search', 'packed-smoke']).stdout, /Packed Smoke Radio/);
    assert.match(runCli(['search', 'uncached-fixture'], {expectedStatus: 1}).stderr, /offline|cached/i);
    const stationName = 'Émission 日本 & $(literal)';
    const stationUrl = 'https://example.invalid/packed-smoke?x=1&y=2';
    assert.match(runCli(['add-url', stationUrl, stationName]).stdout, /added=/);
    const playlist = join(project, 'input & 日本.m3u');
    const exported = join(project, 'output & 日本.m3u');
    writeFileSync(playlist, '#EXTM3U\n#EXTINF:-1,Imported Fixture\nhttps://example.invalid/imported\n');
    assert.match(runCli(['import', playlist]).stdout, /imported=1/);
    runCli(['export', exported]);
    const contents = readFileSync(exported, 'utf8');
    assert.ok(contents.includes(stationName) && contents.includes(stationUrl), 'The exported playlist lost the custom URL or Unicode name.');
    assert.match(contents, /Imported Fixture\nhttps:\/\/example\.invalid\/imported/);
    const libraryPath = join(home, 'radiocli.json');
    const library = JSON.parse(readFileSync(libraryPath, 'utf8'));
    assert.equal(library.imported.length, 2, 'Both CLI processes must persist to the isolated store.');
    library.settings.agentControl.enabled = true;
    library.settings.agentControl.openUiOnPlay = false;
    library.settings.automaticUpdateChecks = false;
    writeFileSync(libraryPath, `${JSON.stringify(library)}\n`);
    const mcpTools = await smokeMcp({cli, cwd: project, env, nodeArgs: ['--import', guard]});

    let binWrapper = 'pending';
    if (process.platform !== 'win32') {
      const wrapper = join(project, 'node_modules', '.bin', 'radiocli');
      assert.equal(runCommand(wrapper, ['version'], {cwd: project, env, timeout: 45_000}).stdout.trim(), metadata.version);
      binWrapper = 'posix npm link';
    } else if (process.env.CI) {
      // Fixed PowerShell code, with the generated path passed only through env.
      const wrapper = join(project, 'node_modules', '.bin', 'radiocli.ps1');
      assert.ok(existsSync(wrapper), 'npm did not create its PowerShell bin shim.');
      const result = runCommand('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '& $env:RADIOCLI_SMOKE_BIN version; exit $LASTEXITCODE'], {
        cwd: project, env: {...env, RADIOCLI_SMOKE_BIN: wrapper}, timeout: 45_000
      });
      assert.equal(result.stdout.trim(), metadata.version);
      binWrapper = 'PowerShell npm shim';
    }
    let playback = 'not exercised: mpv unavailable';
    if (doctor.backends.includes('mpv')) {
      const result = runCommand(process.execPath, ['--import', guard, script, '--exercise-playback', packageRoot, home], {cwd: project, env, timeout: 60_000});
      assert.match(result.stdout, /packed_playback=ok/);
      process.stdout.write(result.stdout);
      playback = 'mpv: local WAV, IPC readiness/volume/pause/resume/stop, ao=null; no audio hardware assertion';
    } else if (requireMpv) throw new Error('This job requires real mpv playback, but the installed CLI did not detect mpv.');
    assert.equal(existsSync(networkLog), false, 'A packed runtime fixture attempted a live network request.');
    const evidence = {
      executionMethod, platform: process.platform, architecture: arch(), endianness: endianness(), kernel: release(),
      node: process.version, npm: runCommand(npm.command, [...npm.args, '--version'], {cwd: project, env}).stdout.trim(),
      package: `${metadata.name}@${metadata.version}`, install: omitOptional ? 'omit-optional' : 'normal',
      tarballSha256: createHash('sha256').update(readFileSync(tarball)).digest('hex'),
      host: doctor.host, binWrapper, offlineCache: 'passed', mcpTools, playback,
      checks: ['help', 'version', 'doctor-json', 'offline-cache-hit-and-miss', 'add-url', 'import', 'export', 'MCP-stdio'], result: 'passed'
    };
    if (evidencePath) {
      mkdirSync(dirname(resolve(evidencePath)), {recursive: true});
      writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    }
    console.log(`packed_smoke=${JSON.stringify(evidence)}`);
    return evidence;
  } finally {
    rmSync(temporary, {recursive: true, force: true});
  }
}

function seedProviderCache(home) {
  const entries = {};
  const add = (path, params, value) => {
    const query = new URLSearchParams(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)));
    entries[`${path}?${query}`] = {createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000, value};
  };
  add('/json/countries', {hidebroken: 'true'}, [{name: 'Smoke Islands', iso_3166_1: 'ZZ', stationcount: 2}]);
  for (const field of ['name', 'tag', 'country', 'language']) {
    add('/json/stations/search', {hidebroken: 'true', limit: '20', offset: '0', order: 'clickcount', reverse: 'true', [field]: 'packed-smoke'}, [
      {stationuuid: 'packed-smoke-station', name: 'Packed Smoke Radio', url_resolved: 'https://example.invalid/cached', tags: 'packed-smoke'}
    ]);
  }
  writeFileSync(join(home, 'radiocli-cache.json'), `${JSON.stringify({version: 1, entries})}\n`);
}

export async function smokeMcp({cli, cwd, env, nodeArgs = []}) {
  const child = spawn(process.execPath, [...nodeArgs, cli, 'mcp', 'serve'], {cwd, env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
  const closed = new Promise(resolveClosed => child.once('close', resolveClosed));
  try {
    return await new Promise((resolveResult, reject) => {
      let output = '';
      let stderr = '';
      let settled = false;
      let toolCount = 0;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        error ? reject(error) : resolveResult(value);
      };
      const timeout = setTimeout(() => finish(new Error(`MCP smoke timed out. ${stderr}`)), 30_000);
      const send = message => child.stdin.write(`${JSON.stringify({jsonrpc: '2.0', ...message})}\n`);
      child.stderr.on('data', chunk => { stderr += String(chunk); });
      child.stdin.on('error', error => finish(error));
      child.once('error', error => finish(error));
      child.once('close', code => finish(new Error(`MCP server exited with ${code}. ${stderr}`)));
      child.stdout.on('data', chunk => {
        output += String(chunk);
        let newline;
        while ((newline = output.indexOf('\n')) >= 0 && !settled) {
          const line = output.slice(0, newline).trim();
          output = output.slice(newline + 1);
          if (!line) continue;
          try {
            const response = JSON.parse(line);
            assert.equal(response.error, undefined, 'MCP returned a protocol error.');
            if (response.id === 1) {
              assert.equal(response.result?.serverInfo?.name, 'radiocli');
              send({method: 'notifications/initialized'});
              send({id: 2, method: 'tools/list', params: {}});
            } else if (response.id === 2) {
              const tools = response.result?.tools ?? [];
              for (const name of ['radio_status', 'radio_search', 'radio_play', 'radio_stop', 'radio_alarm_list']) assert.ok(tools.some(tool => tool.name === name), `MCP tool missing: ${name}`);
              toolCount = tools.length;
              send({id: 3, method: 'tools/call', params: {name: 'radio_status', arguments: {}}});
            } else if (response.id === 3) {
              assert.notEqual(response.result?.isError, true, 'MCP radio_status failed.');
              const status = JSON.parse(response.result?.content?.find(item => item.type === 'text')?.text ?? 'null');
              assert.equal(status?.connected, false, 'An isolated MCP smoke must not find a user session.');
              finish(null, toolCount);
            }
          } catch (error) {
            finish(new Error(`${error instanceof SyntaxError ? 'MCP server wrote non-JSON stdout' : 'MCP smoke failed'}: ${error.message}`));
          }
        }
      });
      send({id: 1, method: 'initialize', params: {protocolVersion: '2025-11-25', capabilities: {}, clientInfo: {name: 'radiocli-packed-smoke', version: '1.0.0'}}});
    });
  } finally {
    child.stdin.destroy();
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      const force = setTimeout(() => child.kill('SIGKILL'), 1000);
      force.unref();
      await closed;
      clearTimeout(force);
    }
  }
}

async function exercisePlayback(packageRoot, home) {
  const {PlayerController} = await import(pathToFileURL(join(packageRoot, 'dist', 'player', 'player-controller.js')).href);
  const {JsonLibraryStore} = await import(pathToFileURL(join(packageRoot, 'dist', 'storage', 'store.js')).href);
  const {resolveCommand} = await import(pathToFileURL(join(packageRoot, 'dist', 'player', 'command.js')).href);
  const mpv = resolveCommand('mpv');
  assert.ok(mpv, 'mpv executable is required.');
  console.log(runCommand(mpv, ['--version']).stdout.split('\n')[0]);
  const store = new JsonLibraryStore();
  store.updateSettings({preferredBackend: 'mpv', volume: 0, automaticUpdateChecks: false});
  const player = new PlayerController(() => store.snapshot().settings);
  const wav = join(home, 'local silence.wav');
  writeFileSync(wav, silentWav());
  try {
    await player.play({id: 'packed-playback', provider: 'playlist', name: 'Packed playback', tags: ['smoke'], streamUrl: wav}, wav);
    await delay(750);
    assert.equal(player.getState().ready, true, 'mpv must acknowledge playback readiness over IPC.');
    assert.equal(player.getState().state, 'playing');
    assert.equal((await player.setVolume(31)).ok, true, 'mpv must acknowledge the volume command.');
    assert.equal(player.getState().volume, 31);
    assert.equal((await player.pause()).ok, true);
    assert.equal(player.getState().state, 'paused');
    assert.equal((await player.resume()).ok, true);
    assert.equal(player.getState().state, 'playing');
  } finally {
    await player.stop();
  }
  assert.equal(player.diagnostics().active, false, 'The playback child must stop.');
  assert.equal(player.getState().state, 'stopped');
  console.log('packed_playback=ok source=local-wav audio-output=null controls=IPC-volume-pause-resume-stop');
}

function silentWav() {
  const dataBytes = 10 * 44_100 * 2 * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(44_100, 24);
  buffer.writeUInt32LE(44_100 * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
}

async function main(args) {
  if (args[0] === '--exercise-playback') return exercisePlayback(args[1], args[2]);
  const options = {};
  let tarball;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--omit-optional') options.omitOptional = true;
    else if (arg === '--require-mpv') options.requireMpv = true;
    else if (arg === '--execution-method') options.executionMethod = args[++index];
    else if (arg === '--evidence') options.evidencePath = args[++index];
    else if (!arg.startsWith('-') && !tarball) tarball = arg;
    else throw new Error(`Unexpected packed-smoke argument: ${arg}`);
  }
  if (!tarball) throw new Error('Usage: node scripts/packed-smoke.mjs <package.tgz> [--omit-optional] [--require-mpv] [--execution-method <description>] [--evidence <file.json>]');
  await runPackedSmoke(tarball, options);
}

if (process.argv[1] && resolve(process.argv[1]) === script) {
  await main(process.argv.slice(2)).catch(error => { console.error(error.stack ?? error.message); process.exitCode = 1; });
}
