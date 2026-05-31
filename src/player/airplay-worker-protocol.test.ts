import {describe, expect, it} from 'vitest';
import {decodeWorkerStart, encodeWorkerStart, maxWorkerMessageBytes, parseWorkerMessage, serializeWorkerMessage} from './airplay-worker-protocol.js';

describe('AirPlay worker protocol', () => {
  it('round-trips worker start payloads through a CLI-safe token', () => {
    const start = {
      streamUrl: 'https://streams.example.com/live.mp3',
      stationName: 'Test FM',
      volume: 35,
      muted: false,
      device: {
        id: '5CAAFD0046D4@Office',
        name: 'Office',
        host: 'Sonos-5CAAFD0046D4.local',
        port: 7000,
        txt: ['cn=0,1', 'sf=0x4'],
        requiresPassword: false,
        airplay2: true
      }
    };

    expect(decodeWorkerStart(encodeWorkerStart(start))).toEqual(start);
  });

  it('serializes line-delimited command and event messages', () => {
    expect(parseWorkerMessage(serializeWorkerMessage({type: 'setVolume', volume: 20}))).toEqual({type: 'setVolume', volume: 20});
    expect(parseWorkerMessage(serializeWorkerMessage({type: 'setVolume', volume: 220}))).toEqual({type: 'setVolume', volume: 100});
    expect(parseWorkerMessage(serializeWorkerMessage({type: 'password-required'}))).toEqual({type: 'password-required'});
    expect(parseWorkerMessage('not json')).toBeNull();
  });

  it('rejects unsafe worker start payloads and oversized messages', () => {
    const unsafeStart = {
      streamUrl: 'file:///Users/me/secret.mp3',
      stationName: 'Test FM',
      volume: 35,
      muted: false,
      device: {
        id: 'test@Test',
        name: 'Test',
        host: 'test.local',
        port: 7000,
        txt: [],
        requiresPassword: false,
        airplay2: false
      }
    };

    expect(() => decodeWorkerStart(encodeWorkerStart(unsafeStart))).toThrow('http or https');
    expect(parseWorkerMessage(`{"type":"passcode","code":"${'1'.repeat(65)}"}`)).toBeNull();
    expect(parseWorkerMessage('x'.repeat(maxWorkerMessageBytes + 1))).toBeNull();
  });
});
