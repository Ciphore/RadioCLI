export type AdaptiveExploreLayout = {
  split: boolean;
  mapAreaWidth: number;
  mapColumns: number;
  mapRows: number;
  mapOffsetX: number;
  listWidth: number;
  listRows: number;
  gap: number;
};

export function adaptiveExploreFrameMetrics(
  mode: 'compact' | 'micro',
  height: number
): {headerRows: number; headerGap: number; bodyRows: number} {
  const safeHeight = Math.max(1, height);
  const headerRows = mode === 'compact' && safeHeight >= 4 ? 2 : 1;
  const headerGap = mode === 'compact' && safeHeight >= 5 ? 1 : 0;
  return {headerRows, headerGap, bodyRows: Math.max(0, safeHeight - headerRows - headerGap)};
}

export function computeAdaptiveExploreLayout(
  mode: 'compact' | 'micro',
  width: number,
  bodyRows: number
): AdaptiveExploreLayout {
  const safeWidth = Math.max(1, width);
  const safeRows = Math.max(1, bodyRows);
  // Compact/mini always keeps the map and list side-by-side. Only true micro
  // stacks stations below the map.
  const split = mode === 'compact';

  if (split) {
    const gap = 1;
    const mapAreaWidth = Math.min(Math.max(1, safeWidth - 7), Math.max(24, Math.floor(safeWidth * 0.62)));
    const listWidth = Math.max(1, safeWidth - mapAreaWidth - gap);
    const mapRows = safeRows;
    const mapColumns = Math.max(1, Math.min(mapAreaWidth, mapRows * 4));
    return {
      split,
      mapAreaWidth,
      mapColumns,
      mapRows,
      mapOffsetX: Math.max(0, Math.floor((mapAreaWidth - mapColumns) / 2)),
      listWidth,
      listRows: safeRows,
      gap
    };
  }

  // True micro stacks a detailed map above a height-aware list. Reserve one,
  // two, or three station rows as space permits while leaving most of the
  // viewport available to the map.
  const listRows = Math.min(3, Math.max(1, Math.floor(safeRows / 3)));
  const gap = 0;
  const mapRows = Math.max(1, safeRows - listRows - gap);
  const mapColumns = Math.max(1, Math.min(safeWidth, mapRows * 4));
  return {
    split,
    mapAreaWidth: safeWidth,
    mapColumns,
    mapRows,
    mapOffsetX: Math.max(0, Math.floor((safeWidth - mapColumns) / 2)),
    listWidth: safeWidth,
    listRows,
    gap
  };
}
