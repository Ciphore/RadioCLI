import * as childProcess from 'node:child_process';
import {describe, expect, it, vi} from 'vitest';
import * as commands from '../platform/executables.js';
import {discoverAirPlayDevices, parseAvahiBrowseOutput, parseRaopBrowseOutput, parseRaopLookupOutput} from './airplay-discovery.js';

vi.mock('node:child_process', () => ({spawn: vi.fn(() => {throw new Error('discovery must remain offline');})}));

describe('AirPlay RAOP discovery parsing', () => {
  it('does not spawn multicast discovery in offline mode even when dns-sd exists', async () => {
    vi.stubEnv('RADIOCLI_OFFLINE', '1');
    const command = vi.spyOn(commands, 'resolveCommandDetails').mockReturnValue({path: '/usr/bin/dns-sd', discovery: 'path'});
    const spawn = vi.mocked(childProcess.spawn);
    try {
      expect(await discoverAirPlayDevices({platform: 'darwin'})).toEqual([]);
      expect(spawn).not.toHaveBeenCalled();
      expect(command).not.toHaveBeenCalled();
    } finally {spawn.mockClear(); command.mockRestore(); vi.unstubAllEnvs();}
  });

  it('extracts RAOP instance names from dns-sd browse output', () => {
    expect(
      parseRaopBrowseOutput(`
Browsing for _raop._tcp.local
Timestamp     A/R    Flags  if Domain               Service Type         Instance Name
23:31:35.326  Add        3  15 local.               _raop._tcp.          C869CD3DF60C@Living Room
23:31:35.326  Add        3  17 local.               _raop._tcp.          5CAAFD0046D4@Office
23:31:35.326  Add        3  15 local.               _airplay._tcp.       Living Room
23:31:35.326  Add        3  15 local.               _raop._tcp.          C869CD3DF60C@Living Room
`)
    ).toEqual(['C869CD3DF60C@Living Room', '5CAAFD0046D4@Office']);
  });

  it('strips terminal controls from discovered receiver names', () => {
    expect(
      parseRaopBrowseOutput(`
23:31:35.326  Add        3  15 local.               _raop._tcp.          BAD\\027[31m@Kitchen\\010Speaker
`)
    ).toEqual(['BAD@Kitchen Speaker']);
  });

  it('extracts reachable host, port, name, and flags from dns-sd lookup output', () => {
    expect(
      parseRaopLookupOutput(
        'C869CD3DF60C@Living Room',
        `
Lookup C869CD3DF60C@Living Room._raop._tcp.local
23:34:20.710  C869CD3DF60C@Living\\032Room._raop._tcp.local. can be reached at Living-Room.local.:7000 (interface 15)
 cn=0,1,2,3 da=true et=0,3,5 ft=0x5A7FDFD5,0x3C155FDE sf=0x18644 md=0,1,2 am=AppleTV5,3 pk=b1a6148b714cd5cf1b20fd1bd7bb9bdf81376e5d4e92318a9088e7db95c1b74f tp=UDP vn=65537 vs=425.1 ov=13.4.8 vv=2
`
      )
    ).toEqual({
      id: 'C869CD3DF60C@Living Room',
      name: 'Living Room',
      host: 'Living-Room.local',
      port: 7000,
      txt: [
        'cn=0,1,2,3',
        'da=true',
        'et=0,3,5',
        'ft=0x5A7FDFD5,0x3C155FDE',
        'sf=0x18644',
        'md=0,1,2',
        'am=AppleTV5,3',
        'pk=b1a6148b714cd5cf1b20fd1bd7bb9bdf81376e5d4e92318a9088e7db95c1b74f',
        'tp=UDP',
        'vn=65537',
        'vs=425.1',
        'ov=13.4.8',
        'vv=2'
      ],
      requiresPassword: true,
      airplay2: true
    });
  });

  it('treats plain RAOP receivers without password flags as selectable', () => {
    expect(
      parseRaopLookupOutput(
        '5CAAFD0046D4@Office',
        `
23:34:20.584  5CAAFD0046D4@Office._raop._tcp.local. can be reached at Sonos-5CAAFD0046D4.local.:7000 (interface 15)
 cn=0,1 da=true et=0,4 ft=0x445F8A00,0x801C340 fv=p20.86.7-77050 md=0,1,2 am=Play:5 sf=0x4 tp=UDP vn=65537 vs=366.0 pk=76c362f4e9378eaab52a88a7f560e0dc31aba7d5b3aafdeed9655522728a313f
`
      )
    ).toMatchObject({
      id: '5CAAFD0046D4@Office',
      name: 'Office',
      host: 'Sonos-5CAAFD0046D4.local',
      port: 7000,
      requiresPassword: false,
      airplay2: true
    });
  });

  it('rejects lookup results with unsafe hosts or invalid ports', () => {
    expect(
      parseRaopLookupOutput(
        'BAD@Kitchen',
        '23:34:20.584  BAD@Kitchen._raop._tcp.local. can be reached at bad host.local.:7000 (interface 15)\n cn=0,1 sf=0x4'
      )
    ).toBeNull();

    expect(
      parseRaopLookupOutput(
        'BAD@Kitchen',
        '23:34:20.584  BAD@Kitchen._raop._tcp.local. can be reached at kitchen.local.:70000 (interface 15)\n cn=0,1 sf=0x4'
      )
    ).toBeNull();
  });
});

const avahiRecord = (id = 'AABBCC@Office', address = '192.168.10.4', txt = '"cn=0,1" "pw=false"', protocol = 'IPv4') => `=;eth0;${protocol};${id};_raop._tcp;local;office.local;${address};5000;${txt}`;
const ready = async () => ({eligible: true, discoveryExecutable: true, discoveryService: 'ready' as const, senderLoaded: true, ffmpeg: true, ready: true, message: 'Ready'});
const resolve = (command: string) => `/usr/bin/${command}`;

describe('bounded Linux Avahi discovery', () => {
  it('decodes UTF-8 byte escapes and quoted TXT without breaking semicolons or escapes', () => {
    const records = parseAvahiBrowseOutput(avahiRecord('AABBCC@Caf\\195\\169\\059Room', '192.168.10.4', '"cn=0,1" "pw=true" "am=Room; \\"speaker\\" \\\\ stereo"'));
    expect(records).toEqual([expect.objectContaining({id: 'AABBCC@Café;Room', name: 'Café;Room', host: '192.168.10.4', port: 5000, requiresPassword: true, airplay2: false, txt: ['cn=0,1', 'pw=true', 'am=Room; "speaker" \\ stereo']})]);
  });

  it('deduplicates interfaces, excludes IPv6-only receivers, and detects local IPv4 output', () => {
    const output = [avahiRecord(), avahiRecord().replace('eth0', 'wlan0'), avahiRecord('AABBCC@Office', 'fe80::5', '"cn=0"', 'IPv6'), avahiRecord('ONLY@IPv6', 'fe80::6', '"cn=0"', 'IPv6'), avahiRecord('LOCAL@Here', '127.0.0.1')].join('\n');
    expect(parseAvahiBrowseOutput(output)).toEqual([expect.objectContaining({id: 'AABBCC@Office', local: false}), expect.objectContaining({id: 'LOCAL@Here', local: true})]);
  });

  it('rejects malformed records, invalid addresses/ports/TXT/UTF-8 and caps devices', () => {
    const invalid = [avahiRecord('BAD@x', '0.0.0.0'), avahiRecord('BAD@x', '224.0.0.1'), avahiRecord('BAD@x', 'host.local'), avahiRecord().replace(';5000;', ';70000;'), avahiRecord().replace(';5000;', ';1e3;'), avahiRecord('BAD@x', '1.2.3.4', '"pw=true'), avahiRecord('BAD@\\255'), avahiRecord().replace('=;', '+;')];
    expect(parseAvahiBrowseOutput(invalid.join('\n'))).toEqual([]);
    const many = Array.from({length: 30}, (_, index) => avahiRecord(`ID${index}@Radio`)).join('\n');
    expect(parseAvahiBrowseOutput(many, 1000)).toHaveLength(12);
    expect(parseAvahiBrowseOutput(many, 2)).toHaveLength(2);
  });

  it('sanitizes terminal controls and respects legacy password advertisements on both adapters', () => {
    expect(parseAvahiBrowseOutput(avahiRecord('BAD\\027[31m@Kitchen\\010Radio'))[0]?.name).toBe('Kitchen Radio');
    expect(parseRaopLookupOutput('ID@Radio', 'ID can be reached at radio.local.:5000 (interface 2)\n cn=0,1 pw=true sf=0x4')).toMatchObject({requiresPassword: true, airplay2: false});
  });

  it('uses one bounded Avahi resolve and returns IPv4 receivers', async () => {
    const run = vi.fn(async (_command: string, _args: string[], _timeout: number, _maxBytes: number) => ({output: avahiRecord(), code: 0, timedOut: false, truncated: false}));
    const devices = await discoverAirPlayDevices({platform: 'linux', env: {}, release: '6.6', resolve, run, readiness: ready, timeoutMs: 9000, maxOutputBytes: 999999});
    expect(devices[0]?.id).toBe('AABBCC@Office');
    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith('/usr/bin/avahi-browse', ['--parsable', '--resolve', '--terminate', '--no-db-lookup', '_raop._tcp'], expect.any(Number), 65536, {env: {}});
    expect(run.mock.calls[0]![2]).toBeLessThanOrEqual(2500);
  });

  it('reports a stopped service instead of confusing it with zero receivers', async () => {
    const run = vi.fn();
    await expect(discoverAirPlayDevices({platform: 'linux', env: {}, release: '6.6', resolve, run, readiness: async () => ({...await ready(), ready: false, discoveryService: 'unavailable', message: 'The Avahi service is not ready.'})})).rejects.toThrow('Avahi service is not ready');
    expect(run).not.toHaveBeenCalled();
    await expect(discoverAirPlayDevices({platform: 'linux', env: {}, release: '6.6', resolve, run: async () => ({output: '', code: 1, timedOut: false, truncated: false}), readiness: ready})).rejects.toThrow('Avahi discovery failed');
  });

  it('reports a missing Linux discovery executable without starting a probe', async () => {
    const run = vi.fn();
    await expect(discoverAirPlayDevices({platform: 'linux', env: {}, release: '6.6', hasCommand: () => false, run})).rejects.toThrow('requires avahi-browse');
    expect(run).not.toHaveBeenCalled();
  });

  it.each([{platform: 'linux' as const, env: {RADIOCLI_OFFLINE: '1'}}, {platform: 'linux' as const, env: {WSL_DISTRO_NAME: 'Ubuntu'}}, {platform: 'linux' as const, env: {TERMUX_VERSION: '1'}}, {platform: 'win32' as const, env: {}}])('never spawns discovery on an excluded environment: $env', async options => {
    const run = vi.fn();
    expect(await discoverAirPlayDevices({...options, release: '6.6', hasCommand: () => true, run, readiness: ready})).toEqual([]);
    expect(run).not.toHaveBeenCalled();
  });
});
