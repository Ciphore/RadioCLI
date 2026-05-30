import {describe, expect, it} from 'vitest';
import type {Station} from '../../types.js';
import {receiverDialLabel} from './NowPlayingScreen.js';

const station: Station = {
  id: 'station-1',
  provider: 'radio-browser',
  name: 'Test FM',
  tags: []
};

describe('receiverDialLabel', () => {
  it('uses a station frequency when the station name exposes one', () => {
    expect(receiverDialLabel({...station, name: 'KCRW 89.9 FM', codec: 'AAC'})).toBe('FM 89.9');
    expect(receiverDialLabel({...station, name: 'KNX 1070 News'})).toBe('AM 1070');
  });

  it('uses codec instead of a broken placeholder when bitrate is unavailable', () => {
    expect(receiverDialLabel({...station, codec: 'AAC'})).toBe('FM AAC');
  });

  it('keeps the compact bitrate and codec dial when both are available', () => {
    expect(receiverDialLabel({...station, codec: 'MP3', bitrate: 64})).toBe('FM 064.M');
  });
});
