import {clamp} from './app-state.js';

export function commitImmediateSelection(
  selectionRef: {current: number},
  setSelection: (value: number) => void,
  next: number,
  itemCount: number
): number {
  const selected = clamp(next, itemCount - 1);
  // Update the event-facing value before React's next render. Slow terminals
  // can deliver Enter immediately after an arrow key while rendered props are
  // still one selection behind.
  selectionRef.current = selected;
  setSelection(selected);
  return selected;
}
