export type TerminalLayout = {
  columns: number;
  rows: number;
  mode: 'full' | 'compact' | 'micro';
  compact: boolean;
  horizontalPadding: 0 | 1;
  frameWidth: number;
  topRows: number;
  contentRows: number;
  stationRows: number;
  countryRows: number;
  mapCountryRows: number;
  mapMode: 'compact' | 'full';
  receiverWidth: number;
  receiverRows: number;
  footerRows: number;
};

export function computeTerminalLayout(columns = 100, rows = 30, footerRows = 2): TerminalLayout {
  const safeColumns = Math.max(1, columns);
  const safeRows = Math.max(1, rows);
  const mode = safeColumns >= 68 && safeRows >= 22
    ? 'full'
    : safeColumns >= 34 && safeRows >= 10
      ? 'compact'
      : 'micro';
  const compact = mode !== 'full';
  const horizontalPadding: 0 | 1 = mode === 'micro' ? 0 : 1;
  const frameWidth = Math.max(1, safeColumns - horizontalPadding * 2);
  const topRows = mode === 'full' ? 3 : 0;
  const desiredFooterRows = mode === 'full'
    ? clamp(Math.round(footerRows), 2, 4)
    : mode === 'compact'
      ? (safeRows >= 14 ? 2 : 1)
      : 1;
  const reservedFooterRows = Math.min(desiredFooterRows, Math.max(0, safeRows - topRows - 1));
  const contentRows = Math.max(1, safeRows - reservedFooterRows - topRows);
  const mapMode = frameWidth >= 88 && contentRows >= 24 ? 'full' : 'compact';
  const stationRows = clamp(contentRows - 6, 1, 48);
  const countryRows = clamp(contentRows - 5, 1, 64);

  return {
    columns: safeColumns,
    rows: safeRows,
    mode,
    compact,
    horizontalPadding,
    frameWidth,
    topRows,
    contentRows,
    stationRows: compact ? Math.max(1, contentRows - 3) : stationRows,
    countryRows: compact ? Math.max(1, contentRows - 3) : countryRows,
    mapCountryRows: compact ? Math.max(1, contentRows - 3) : Math.max(1, contentRows - (mapMode === 'full' ? 25 : 14)),
    mapMode,
    // Match the shared application frame (columns - 2) so the Now Playing
    // header and receiver panel align with both edges of the top navigation.
    receiverWidth: frameWidth,
    receiverRows: compact ? contentRows : Math.max(10, contentRows - 1),
    footerRows: reservedFooterRows
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
