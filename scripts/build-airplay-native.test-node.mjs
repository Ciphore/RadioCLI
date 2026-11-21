import assert from 'node:assert/strict';
import {test} from 'node:test';
import {basename, dirname, resolve} from 'node:path';
import {buildAirPlayNative} from './build-airplay-native.mjs';

test('portable installs skip native setup even with case-insensitive npm environment names', () => {
  for (const env of [{npm_config_omit: 'dev optional'}, {NPM_CONFIG_OMIT: 'optional'}, {npm_config_omit: 'dev,optional'}]) {
    assert.equal(buildAirPlayNative({platform: 'linux', env, resolve: () => { throw new Error('must not resolve'); }}), 'skipped');
  }
});

test('macOS keeps the upstream JS codec and unsupported native platforms do not build', () => {
  for (const platform of ['darwin', 'win32', 'freebsd', 'openbsd', 'netbsd']) {
    assert.equal(buildAirPlayNative({platform, execute: () => { throw new Error('must not run'); }}), 'skipped');
  }
});

test('missing tools and native build failures preserve installation and the JS fallback', () => {
  assert.equal(buildAirPlayNative({platform: 'linux', resolve: () => { throw new Error('missing'); }}), 'unavailable');
  for (const execute of [() => ({status: 1}), () => ({status: null, error: {code: 'ETIMEDOUT'}}), () => { throw new Error('compiler missing'); }]) {
    assert.equal(buildAirPlayNative({platform: 'linux', resolve: () => '/node-gyp.js', execute, hasTool: () => true}), 'fallback');
  }
});

test('a missing toolchain, an offline install, or an opt-out never starts a native build', () => {
  const execute = () => { throw new Error('must not run'); };
  const options = {platform: 'linux', resolve: () => '/node-gyp.js', execute};
  assert.equal(buildAirPlayNative({...options, env: {}, hasTool: name => name === 'make'}), 'fallback');
  assert.equal(buildAirPlayNative({...options, env: {}, hasTool: name => name === 'g++'}), 'fallback');
  assert.equal(buildAirPlayNative({...options, env: {npm_config_offline: 'true'}, hasTool: () => true}), 'fallback');
  assert.equal(buildAirPlayNative({...options, env: {RADIOCLI_SKIP_NATIVE_BUILD: '1'}, hasTool: () => true}), 'skipped');
});

test('Linux uses the active Node and argument array in the bundled source directory', () => {
  let calls = 0;
  assert.equal(buildAirPlayNative({platform: 'linux', env: {}, hasTool: () => true, resolve: () => '/path with spaces/node-gyp.js', execute: (program, args, options) => {
    calls += 1; assert.equal(program, process.execPath); assert.deepEqual(args, ['/path with spaces/node-gyp.js', 'rebuild']);
    assert.equal(options.shell, false); assert.equal(basename(resolve(options.cwd)), 'node-airtunes2'); assert.equal(basename(dirname(resolve(options.cwd))), 'vendor'); assert.equal(options.timeout, 120_000);
    return {status: 0};
  }}), 'built');
  assert.equal(calls, 1);
});
