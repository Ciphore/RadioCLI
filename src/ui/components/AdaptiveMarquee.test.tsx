import {act} from 'react';
import {render} from 'ink-testing-library';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {AdaptiveMarquee} from './AdaptiveMarquee.js';

describe('AdaptiveMarquee', () => {
  afterEach(() => vi.useRealTimers());

  it('waits before moving the selected text and loops without growing its width', async () => {
    vi.useFakeTimers();
    const view = render(<AdaptiveMarquee text="ABCDEFGHIJ" width={5} active reduceMotion={false} />);

    expect(view.lastFrame()).toBe('ABCDE');
    await act(async () => vi.advanceTimersByTimeAsync(999));
    expect(view.lastFrame()).toBe('ABCDE');
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(view.lastFrame()).toBe('BCDEF');
    await act(async () => vi.advanceTimersByTimeAsync(180));
    expect(view.lastFrame()).toBe('CDEFG');
  });

  it('uses ordinary truncation when inactive or Reduce Motion is enabled', () => {
    expect(render(<AdaptiveMarquee text="ABCDEFGHIJ" width={5} active={false} reduceMotion={false} />).lastFrame()).toBe('ABCD…');
    expect(render(<AdaptiveMarquee text="ABCDEFGHIJ" width={5} active reduceMotion />).lastFrame()).toBe('ABCD…');
  });
});
