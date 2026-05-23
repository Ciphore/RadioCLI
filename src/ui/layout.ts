export type TerminalLayout = {
  columns: number;
  rows: number;
  compact: boolean;
  contentRows: number;
  stationRows: number;
  countryRows: number;
  mapCountryRows: number;
  mapMode: 'compact' | 'full';
  receiverWidth: number;
  footerRows: number;
};

export function computeTerminalLayout(columns = 100, rows = 30): TerminalLayout {
  const safeColumns = Math.max(1, columns);
  const safeRows = Math.max(1, rows);
  const compact = safeColumns < 64 || safeRows < 18;
  const footerRows = 2;
  const contentRows = Math.max(1, safeRows - footerRows - 1);
  const mapMode = safeColumns >= 88 && safeRows >= 28 ? 'full' : 'compact';

  return {
    columns: safeColumns,
    rows: safeRows,
    compact,
    contentRows,
    stationRows: compact ? 0 : clamp(safeRows - 13, 4, 18),
    countryRows: compact ? 0 : clamp(safeRows - 9, 5, 26),
    mapCountryRows: compact ? 0 : clamp(safeRows - (mapMode === 'full' ? 22 : 14), 4, 14),
    mapMode,
    receiverWidth: compact ? safeColumns : clamp(safeColumns - 4, 62, 88),
    footerRows
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
