import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {describe, expect, it} from 'vitest';
import {patchAirTunesRtspSource} from './airplay-sender-patch.js';

const require = createRequire(import.meta.url);
const rtspSourcePath = optionalAirTunesRtspPath();

// The runtime compatibility patch locates its insertion points by exact string match against
// node-airtunes2's own source. If a dependency bump drifts that source, the patches silently
// no-op and the AirPlay 2 buffering/auth/empty-setup fixes regress with no other signal. The
// dependency is pinned to an exact version; this guard fails loudly if that source ever changes.
const requiredMarkers = [
  '    headers = response.headers',
  '  if (this.status != OPTIONS && this.status != OPTIONS2 && this.mode == 0) {',
  "      this.eventPort = sa1_bplist[0]['eventPort']",
  'I assume that all responses have empty bodies.'
];

const describeIfSenderInstalled = rtspSourcePath ? describe : describe.skip;

describeIfSenderInstalled('AirPlay sender source compatibility', () => {
  it('still contains every marker the runtime patch depends on', () => {
    const source = readAirTunesRtspSource();
    for (const marker of requiredMarkers) {
      expect(source.includes(marker), `node-airtunes2 source drifted; missing marker: ${marker}`).toBe(true);
    }
  });

  it('fully patches the installed source (all fixes applied, no silent no-op)', () => {
    const source = readAirTunesRtspSource();
    const patched = patchAirTunesRtspSource(source);
    expect(patched).toContain('this.status === SETUP_AP2_1 && response.code === 401');
    expect(patched).toContain('headers = response.headers || {}');
    expect(patched).toContain('Buffer.concat([blob, Buffer.from(data)])');
    expect(patched).toContain("this.eventPort = sa1_bplist[0]['eventPort'] || this.eventPort || this.socket.remotePort || 7000");
    expect(patched).not.toContain('I assume that all responses have empty bodies.');
  });
});

function optionalAirTunesRtspPath(): string | null {
  try {
    return require.resolve('node-airtunes2/lib/rtsp.js');
  } catch {
    return null;
  }
}

function readAirTunesRtspSource(): string {
  if (!rtspSourcePath) {
    throw new Error('node-airtunes2 is not installed.');
  }

  return readFileSync(rtspSourcePath, 'utf8');
}
