import {describe, expect, it} from 'vitest';
import {extractMpvTitle} from './player-controller.js';

describe('extractMpvTitle', () => {
  it('formats keyed radio metadata as artist and title values', () => {
    const title = extractMpvTitle({
      'icy-title': 'title="All The Stars",artist="Kendrick Lamar / SZA",url="song_spot=F" MediaBaseId="0" itunesTrackId="0"'
    });

    expect(title).toBe('Kendrick Lamar / SZA - All The Stars');
  });

  it('keeps ordinary stream titles unchanged', () => {
    expect(extractMpvTitle({'icy-title': 'Kendrick Lamar / SZA - All The Stars'})).toBe('Kendrick Lamar / SZA - All The Stars');
  });

  it('strips standard StreamTitle wrappers', () => {
    expect(extractMpvTitle({StreamTitle: "StreamTitle='Artist - Song';"})).toBe('Artist - Song');
  });
});
