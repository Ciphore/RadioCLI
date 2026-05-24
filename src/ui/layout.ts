export type TerminalLayout = {
  columns: number;
  rows: number;
  compact: boolean;
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

export function computeTerminalLayout(columns = 100, rows = 30): TerminalLayout {
  const safeColumns = Math.max(1, columns);
  const safeRows = Math.max(1, rows);
  const compact = safeColumns < 64 || safeRows < 18;
  const topRows = compact ? 0 : 4;
  const footerRows = 1;
  const contentRows = Math.max(1, safeRows - footerRows - topRows);
  const mapMode = safeColumns >= 88 && contentRows >= 24 ? 'full' : 'compact';
  const stationRows = clamp(contentRows - 6, 1, 48);

  return {
    columns: safeColumns,
    rows: safeRows,
    compact,
    topRows,
    contentRows,
    stationRows: compact ? 0 : stationRows,
    countryRows: compact ? 0 : Math.max(1, contentRows - 4),
    mapCountryRows: compact ? 0 : Math.max(1, contentRows - (mapMode === 'full' ? 25 : 14)),
    mapMode,
    receiverWidth: compact ? safeColumns : Math.max(62, safeColumns - 4),
    receiverRows: compact ? safeRows : Math.max(10, contentRows - 1),
    footerRows
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
