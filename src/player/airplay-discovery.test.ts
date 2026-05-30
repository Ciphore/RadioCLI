import {describe, expect, it} from 'vitest';
import {parseRaopBrowseOutput, parseRaopLookupOutput} from './airplay-discovery.js';

describe('AirPlay RAOP discovery parsing', () => {
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
});
