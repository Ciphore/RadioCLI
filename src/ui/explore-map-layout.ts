export type ExploreMapLayout = {
  contentWidth: number;
  headerRows: number;
  bodyRows: number;
  split: boolean;
  listPanelWidth: number;
  mapPanelWidth: number;
  mapRows: number;
  mapColumns: number;
  mapOffsetX: number;
  listRows: number;
  listPageSize: number;
};

export function computeExploreMapLayout(width: number, height: number, pageSize = 1): ExploreMapLayout {
  const contentWidth = Math.max(52, width);
  // ScreenHeader renders exactly two rows here (title + subtitle). The explicit
  // body margin below supplies the single gutter shared with the panel footer.
  const headerRows = 2;
  const bodyRows = Math.max(7, height - headerRows - 1);
  // Every non-micro Explore layout is side-by-side. Preserve the established
  // wide/full proportions, while giving narrower full layouts a useful map and
  // a deliberately compact station column.
  const split = true;
  const listPanelWidth = contentWidth >= 104
    ? Math.max(50, Math.min(74, Math.floor(contentWidth * 0.35)))
    : Math.max(18, Math.floor(contentWidth * 0.35));
  const mapPanelWidth = Math.max(1, contentWidth - listPanelWidth - 1);
  const mapRows = Math.max(8, bodyRows - 2);
  // A braille cell is two dots wide by four dots tall. With ordinary terminal
  // cells roughly twice as tall as they are wide, a 2:1 world projection is
  // represented by about four terminal columns per row. Use the panel as a
  // viewport and center the map whenever filling it would stretch longitude.
  const mapInnerWidth = Math.max(1, mapPanelWidth - 2);
  const mapColumns = Math.max(1, Math.min(mapInnerWidth, mapRows * 4));
  const mapOffsetX = Math.max(0, Math.floor((mapInnerWidth - mapColumns) / 2));
  const listRows = bodyRows - 2;
  const listPageSize = Math.max(1, Math.min(pageSize, listRows - 3));

  return {
    contentWidth,
    headerRows,
    bodyRows,
    split,
    listPanelWidth,
    mapPanelWidth,
    mapRows,
    mapColumns,
    mapOffsetX,
    listRows,
    listPageSize
  };
}
