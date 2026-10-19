import {expect, it} from 'vitest';
import {canRetryPlainHttp, ffmpegCertificateFailure, ffmpegInputArguments, ffmpegInputFailure} from './ffmpeg-input.js';

it.each(['https://radio.example/live', 'http://radio.example/redirect'])('verifies TLS and excludes network playlist demuxers for %s', target => {
  const args = ffmpegInputArguments(target);
  expect(args.slice(-2)).toEqual(['-tls_verify', '1']);
  const formats = args[args.indexOf('-format_whitelist') + 1]!.split(',');
  expect(formats).toEqual(expect.arrayContaining(['mp3', 'aac', 'ogg', 'flac', 'wav']));
  for (const format of ['hls', 'dash', 'imf', 'concat', 'image2']) expect(formats).not.toContain(format);
});
it.each(['/radio/local.wav', 'file:///radio/local.wav', 'C:\\Music\\local.wav'])('allows local media formats without network access or inapplicable input options (%s)', target => {
  expect(ffmpegInputArguments(target, {reconnect: true})).toEqual(['-protocol_whitelist', 'file,crypto,data']);
});
it('blocks both TLS protocols on a plain HTTP compatibility retry', () => {
  expect(ffmpegInputArguments('http://radio.example/live', {plainHttp: true})).toEqual(expect.arrayContaining(['-protocol_blacklist', 'https,tls']));
  expect(ffmpegInputArguments('https://radio.example/live', {plainHttp: true})).toEqual(expect.arrayContaining(['-tls_verify', '1']));
});
it('retries only an exact unused TLS-option diagnostic on original HTTP inputs', () => {
  const message = 'Option tls_verify not found.\n';
  expect(canRetryPlainHttp('http://radio.example/live', message)).toBe(true);
  expect(canRetryPlainHttp('http://radio.example/live', `nan M-A: 0.000 aq=0KB\r${message}`)).toBe(true);
  for (const url of ['https://radio.example/live', '/radio/local.wav']) expect(canRetryPlainHttp(url, message)).toBe(false);
  for (const diagnostic of ['Certificate verification failed', 'Connection reset', 'some Option tls_verify not found. suffix']) expect(canRetryPlainHttp('http://radio.example/live', diagnostic)).toBe(false);
});
it('reports restricted formats without exposing backend diagnostic contents', () => {
  expect(ffmpegInputFailure('Format not on whitelist; https://secret:password@radio.example')).toContain('select mpv');
  expect(ffmpegInputFailure('Format not on whitelist; https://secret:password@radio.example')).not.toContain('password');
  expect(ffmpegInputFailure('Connection reset')).toBeUndefined();
});

it.each(['certificate verify failed', 'Peer certificate failed verification', "The certificate's owner does not match hostname", 'Unable to verify peer certificate', 'Certificate verification failed.', 'Invalid certificate chain', 'SNI or certificate check failed', 'Creating security context failed (0x80090325)', 'Creating security context failed (0x80090327)', 'Creating security context failed (0x80090328)'])('recognizes a permanent TLS failure: %s', diagnostic => {
  expect(ffmpegCertificateFailure(`${diagnostic}: https://secret:password@radio.example`)).toContain('certificate could not be verified');
  expect(ffmpegCertificateFailure(`${diagnostic}: https://secret:password@radio.example`)).not.toContain('password');
});
it.each(['TLS handshake failed', 'I/O error', 'Creating security context failed', 'Connection reset by peer', 'Connection timed out'])('retains transient transport recovery: %s', diagnostic => {
  expect(ffmpegCertificateFailure(diagnostic)).toBeUndefined();
});
