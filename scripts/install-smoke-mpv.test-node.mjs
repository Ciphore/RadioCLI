import assert from 'node:assert/strict';
import {test} from 'node:test';

async function helpers() {
  const module = await import('./install-smoke-mpv.mjs').catch(() => ({}));
  assert.equal(typeof module.selectMpvAsset, 'function', 'CI must select a pinned native mpv asset before downloading');
  return module;
}

test('Windows ARM selects an aarch64 build and rejects unsupported architectures', async () => {
  const {selectMpvAsset} = await helpers();
  assert.match(selectMpvAsset('win32', 'arm64').name, /aarch64/);
  assert.match(selectMpvAsset('win32', 'x64').name, /x86_64/);
  assert.throws(() => selectMpvAsset('win32', 'ia32'), /No pinned native mpv/);
  assert.throws(() => selectMpvAsset('unknown', 'arm64'), /No pinned native mpv/);
});

test('a Windows x64 executable cannot satisfy ARM64 playback evidence', async () => {
  const {verifyNativeBinary} = await helpers();
  const binary = Buffer.alloc(128);
  binary.write('MZ');
  binary.writeUInt32LE(64, 0x3c);
  binary.write('PE\0\0', 64);
  binary.writeUInt16LE(0x8664, 68);
  assert.throws(() => verifyNativeBinary(binary, 'win32', 'arm64'), /architecture/);
  binary.writeUInt16LE(0xaa64, 68);
  assert.deepEqual(verifyNativeBinary(binary, 'win32', 'arm64').architectures, ['arm64']);
});

test('Mach-O inspection verifies CPU and records its declared minimum macOS', async () => {
  const {verifyNativeBinary} = await helpers();
  const binary = Buffer.alloc(56);
  binary.writeUInt32LE(0xfeedfacf, 0);
  binary.writeUInt32LE(0x01000007, 4);
  binary.writeUInt32LE(1, 16);
  binary.writeUInt32LE(24, 20);
  binary.writeUInt32LE(0x32, 32);
  binary.writeUInt32LE(24, 36);
  binary.writeUInt32LE(1, 40);
  binary.writeUInt32LE(0x000d0500, 44);
  assert.deepEqual(verifyNativeBinary(binary, 'darwin', 'x64'), {architectures: ['x64'], minimumMacos: '13.5.0'});
  assert.throws(() => verifyNativeBinary(binary, 'darwin', 'arm64'), /architecture/);
});

test('archive paths cannot leave the isolated extraction directory', async () => {
  const {validateArchivePaths} = await helpers();
  validateArchivePaths(['mpv.exe', 'mpv.app/Contents/MacOS/mpv']);
  for (const path of ['../mpv.exe', '/tmp/mpv', 'C:\\mpv.exe', 'a/../../mpv', 'a\\..\\mpv']) {
    assert.throws(() => validateArchivePaths([path]), /Unsafe archive path/);
  }
});

test('unknown binary formats fail before executing downloaded code', async () => {
  const {verifyNativeBinary} = await helpers();
  assert.throws(() => verifyNativeBinary(Buffer.from('#!/bin/sh'), 'win32', 'arm64'), /PE|format|header/);
  assert.throws(() => verifyNativeBinary(Buffer.alloc(64), 'darwin', 'x64'), /Mach-O|format|header/);
});
