import {describe, expect, it} from 'vitest';
import type {Station, TrackPlay} from '../../types.js';
import {receiverDialLabel, recentTracksForStation} from './NowPlayingScreen.js';

const station: Station = {
  id: 'station-1',
  provider: 'radio-browser',
  name: 'Test FM',
  tags: []
};

describe('recentTracksForStation', () => {
  const history: TrackPlay[] = [
    {title: 'Song C', stationKey: 'radio-browser:station-1', stationName: 'Test FM', at: '3'},
    {title: 'Other', stationKey: 'radio-browser:station-2', stationName: 'Other FM', at: '2'},
    {title: 'Song B', stationKey: 'radio-browser:station-1', stationName: 'Test FM', at: '1'},
    {title: 'Song A', stationKey: 'radio-browser:station-1', stationName: 'Test FM', at: '0'}
  ];

  it('returns only the current station tracks, newest first, capped to the limit', () => {
    expect(recentTracksForStation(history, station, 2).map(track => track.title)).toEqual(['Song C', 'Song B']);
  });

  it('returns nothing when no station is tuned', () => {
    expect(recentTracksForStation(history, null, 3)).toEqual([]);
  });
});

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
