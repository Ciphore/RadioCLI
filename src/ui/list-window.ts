export function visibleWindow<T>(items: readonly T[], selected: number, size: number): {items: T[]; start: number; end: number} {
  const safeSize = Math.max(1, size);
  const clamped = Math.min(Math.max(selected, 0), Math.max(items.length - 1, 0));
  const half = Math.floor(safeSize / 2);
  const start = Math.min(Math.max(clamped - half, 0), Math.max(items.length - safeSize, 0));
  const end = Math.min(start + safeSize, items.length);
  return {items: items.slice(start, end), start, end};
}
