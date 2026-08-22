import {describe, expect, it} from 'vitest';
import type {Station, TrackPlay} from '../../types.js';
import {receiverStationIdentity, recentTracksForStation} from './NowPlayingScreen.js';

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

describe('receiverStationIdentity', () => {
  it('puts station name and location together in the receiver header', () => {
    expect(receiverStationIdentity({...station, city: 'Sausalito', state: 'California', country: 'United States'}, 60)).toEqual({
      name: 'Test FM',
      location: 'SAUSALITO, CALIFORNIA, UNITED STATES'
    });
  });

  it('truncates the location after preserving a station name that fits', () => {
    expect(receiverStationIdentity({...station, country: 'The United States Of America'}, 20)).toEqual({
      name: 'Test FM',
      location: 'THE UNITE…'
    });
  });

  it('uses the full identity width for a long station name', () => {
    expect(receiverStationIdentity({...station, name: 'A Very Long Station Name', country: 'Canada'}, 12)).toEqual({
      name: 'A Very Long…',
      location: ''
    });
  });
});
