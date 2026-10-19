import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {npmCommand, runCommand, smokeEnvironment} from './packed-smoke.mjs';
import {sha256, upgradeBaselines} from './release-evidence.mjs';

// Keep the old module in memory while npm replaces its files, just like a
// background client surviving an upgrade. Reopen its store on each read so
// even older releases without refresh() exercise their original schema.
const driver = `
const {JsonLibraryStore} = await import(process.argv[2]);
const file = process.argv[3];
function details(error) {
  return {message: error.message, code: error.code, syscall: error.syscall,
    cause: error.cause ? details(error.cause) : undefined};
}
process.on('message', ({id, method, args = []}) => {
  try {
    const store = new JsonLibraryStore(file);
    const result = method === 'snapshot' ? store.snapshot() : store[method](...args);
    process.send({id, result});
  } catch (error) { process.send({id, error: details(error)}); }
});
const timer = setInterval(() => {
  try { new JsonLibraryStore(file).snapshot(); }
  catch (error) { process.send({error: details(error)}); }
}, 100);
process.on('disconnect', () => { clearInterval(timer); process.exit(); });
process.send({id: 0, result: new JsonLibraryStore(file).snapshot()});
`;

function storeProcess(script, storeModule, file, env, label) {
  const child = spawn(process.execPath, [script, pathToFileURL(storeModule).href, file], {env, shell: false, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc']});
  const pending = new Map();
  let nextId = 1;
  let stderr = '';
  let terminalError;
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  const exited = new Promise(resolveExit => child.once('exit', resolveExit));
  const request = (id, method, args) => new Promise((resolveResult, reject) => {
    if (terminalError) { reject(terminalError); return; }
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Upgrade store request timed out: ${stderr}`)); }, 30_000);
    pending.set(id, {method: method ?? 'startup', resolve: value => { clearTimeout(timeout); resolveResult(value); }, reject: error => { clearTimeout(timeout); reject(error); }});
    if (method) child.send({id, method, args}, error => { if (error) pending.get(id)?.reject(error); });
  });
  child.on('message', message => {
    const waiting = pending.get(message.id);
    if (waiting) {
      pending.delete(message.id);
      message.error ? waiting.reject(new Error(`${label} ${waiting.method}: ${JSON.stringify(message.error)}`)) : waiting.resolve(message.result);
    } else if (message.error) {
      fail(new Error(`${label} background snapshot: ${JSON.stringify(message.error)}`));
    }
  });
  const fail = error => { terminalError = error; for (const item of pending.values()) item.reject(error); pending.clear(); };
  child.once('error', fail);
  child.once('close', code => fail(new Error(`Upgrade store process exited (${code}): ${stderr}`)));
  return {
    ready: request(0),
    call: (method, ...args) => request(nextId++, method, args),
    async close() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill();
      const force = setTimeout(() => child.kill('SIGKILL'), 1000);
      try { await exited; } finally { clearTimeout(force); child.stderr.destroy(); }
    }
  };
}

/** Install the published baseline, replace it in place with the candidate, and
 * use both generations against one private library. Never touches user data. */
export async function runUpgradeSmoke(tarball, {baseline, source = null, evidencePath} = {}) {
  assert.ok(upgradeBaselines.includes(baseline), 'Choose a pinned published upgrade baseline.');
  tarball = resolve(tarball);
  const temporary = mkdtempSync(join(tmpdir(), 'radiocli upgrade & 日本 '));
  const project = join(temporary, 'project');
  const home = join(temporary, 'state');
  mkdirSync(project); mkdirSync(home);
  const env = smokeEnvironment(home);
  const npm = npmCommand();
  const install = target => runCommand(npm.command, [...npm.args, 'install', '--no-audit', '--fund=false', '--omit=dev', '--omit=optional', '--ignore-scripts=false', target], {cwd: project, env, timeout: 300_000});
  const clients = [];
  try {
    writeFileSync(join(project, 'package.json'), '{"private":true,"type":"module"}\n');
    install(`@ciphore/radiocli@${baseline}`);
    const packageRoot = join(project, 'node_modules', '@ciphore', 'radiocli');
    const module = join(packageRoot, 'dist', 'storage', 'store.js');
    const script = join(temporary, 'store-driver.mjs');
    const file = join(home, 'radiocli.json');
    writeFileSync(script, driver);
    const old = storeProcess(script, module, file, env, `baseline ${baseline}`); clients.push(old);
    await old.ready;
    const station = {id: 'upgrade-fixture', provider: 'playlist', name: 'Retained 日本 station', tags: ['upgrade'], streamUrl: 'https://example.invalid/upgrade'};
    await old.call('toggleFavorite', station);
    await old.call('addRecent', station);
    await old.call('recordTrack', station, 'Retained track');
    await old.call('addSearch', 'Retained search');
    await old.call('addAlarm', {label: 'Retained alarm', enabled: false, station,
      schedule: {type: 'once', at: '2050-01-01T08:00:00Z'},
      playback: {volume: 37, fadeSeconds: 0, stopAfterMinutes: 30},
      reliability: {missedRunGraceMinutes: 5, wakeIfSupported: false, keepAwakeUntilAlarm: false}});
    await old.call('updateSettings', {receiverStyle: 'mesh', theme: 'amber', volume: 37});
    const before = await old.call('snapshot');
    install(tarball);
    const candidate = storeProcess(script, module, file, env, `candidate over ${baseline}`); clients.push(candidate);
    const upgraded = await candidate.ready;
    for (const key of ['favorites', 'recent', 'trackHistory', 'searchHistory', 'alarms']) assert.deepEqual(upgraded[key], before[key], `Upgrade lost ${key}.`);
    assert.equal(upgraded.settings.receiverStyle, 'mesh', 'Upgrade changed the saved legacy receiver.');
    assert.equal(upgraded.settings.theme, 'amber');
    const rendered = JSON.parse(runCommand(process.execPath, ['--input-type=module', '-e', `
      import {createHash} from 'node:crypto';
      const m = await import(process.argv[1]);
      const {buildVisualizer} = await import(process.argv[2]);
      const playback = {state:'playing', backend:'mpv', volume:70, muted:false, ready:true};
      const hashes = m.receiverStyleNames.map(style => createHash('sha256').update(JSON.stringify(buildVisualizer(style, 37, 100, 14, null, playback, 'green'))).digest('hex'));
      console.log(JSON.stringify({names:m.receiverStyleNames, defaultStyle:m.defaultReceiverStyle, hashes}));
    `, pathToFileURL(join(packageRoot, 'dist', 'ui', 'visualizers', 'receiver-style-registry.js')).href,
    pathToFileURL(join(packageRoot, 'dist', 'ui', 'visualizers', 'receiver-visualizers.js')).href], {cwd: project, env}).stdout);
    const registry = rendered.names;
    assert.equal(rendered.defaultStyle, 'ultracode');
    assert.equal(registry[0], 'ultracode');
    assert.equal(registry[8], 'gallop-fine');
    assert.equal(registry.length, 63);
    assert.deepEqual(registry.slice(-2), ['alpine', 'crossfade']);
    assert.equal(rendered.hashes.length, registry.length);
    for (const receiverStyle of registry) {
      await candidate.call('updateSettings', {receiverStyle});
      // Force both a legacy read and a legacy write, in addition to polling.
      assert.equal((await old.call('snapshot')).settings.receiverStyle, receiverStyle);
      await old.call('updateSettings', {volume: 41});
      const retained = await candidate.call('snapshot');
      assert.equal(retained.settings.receiverStyle, receiverStyle);
      assert.equal(retained.settings.volume, 41);
      for (const key of ['favorites', 'recent', 'trackHistory', 'searchHistory', 'alarms']) assert.deepEqual(retained[key], before[key], `Mixed-version writes lost ${key}.`);
    }
    await delay(1200);
    assert.equal((await candidate.call('snapshot')).settings.receiverStyle, 'crossfade');
    assert.equal(readdirSync(home).some(name => name.includes('.bad-')), false, 'An old process quarantined the shared library.');
    await candidate.call('updateSettings', {receiverStyle: 'ultracode'});
    assert.equal((await candidate.call('snapshot')).settings.receiverStyle, 'ultracode');
    writeFileSync(`${file}.receiver.json`, JSON.stringify({version: 1, receiverStyle: 'lighthouse', libraryReceiverStyle: 'ultracode'}));
    const migrated = await candidate.call('snapshot');
    assert.equal(migrated.settings.receiverStyle, 'ultracode', 'A retired preview selection did not migrate.');
    for (const key of ['favorites', 'recent', 'trackHistory', 'searchHistory', 'alarms']) assert.deepEqual(migrated[key], before[key], `Preview migration lost ${key}.`);
    await candidate.call('updateSettings', {volume: 42});
    const evidence = {schemaVersion: 1, checkedAt: new Date().toISOString(), source, baseline, tarballSha256: sha256(tarball),
      package: JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version,
      platform: process.platform, architecture: process.arch, node: process.version,
      checks: ['in-place-install', 'saved-library-preservation', 'legacy-style-preservation', 'canonical-style-order', 'all-supported-receivers', 'installed-renderers', 'retired-style-migration', 'old-process-live-reads-and-writes', 'background-polling', 'return-to-default'], result: 'passed'};
    if (evidencePath) { mkdirSync(dirname(evidencePath), {recursive: true}); writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`); }
    console.log(`upgrade_smoke=${JSON.stringify(evidence)}`);
    return evidence;
  } finally {
    await Promise.all(clients.map(client => client.close()));
    rmSync(temporary, {recursive: true, force: true});
  }
}
