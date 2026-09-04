import {describe, expect, it, vi} from 'vitest';
import {commitImmediateSelection} from './selection-state.js';

describe('immediate selection state', () => {
  it('makes rapid navigation visible to the following input before a render', () => {
    const ref = {current: 0};
    const setSelection = vi.fn();

    commitImmediateSelection(ref, setSelection, ref.current + 1, 5);
    commitImmediateSelection(ref, setSelection, ref.current + 1, 5);

    expect(ref.current).toBe(2);
    expect(setSelection).toHaveBeenNthCalledWith(1, 1);
    expect(setSelection).toHaveBeenNthCalledWith(2, 2);
  });

  it('clamps immediate selection to the current list', () => {
    const ref = {current: 3};
    commitImmediateSelection(ref, () => undefined, 10, 4);
    expect(ref.current).toBe(3);
  });
});
