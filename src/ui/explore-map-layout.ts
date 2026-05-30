export type ExploreMapLayout = {
  contentWidth: number;
  headerRows: number;
  bodyRows: number;
  split: boolean;
  listPanelWidth: number;
  mapPanelWidth: number;
  mapRows: number;
  mapColumns: number;
  listRows: number;
  listPageSize: number;
};

export function computeExploreMapLayout(width: number, height: number, pageSize = 1): ExploreMapLayout {
  const contentWidth = Math.max(52, width);
  const headerRows = 3;
  const bodyRows = Math.max(7, height - headerRows - 1);
  const split = contentWidth >= 104 && bodyRows >= 10;
  const listPanelWidth = split ? Math.max(50, Math.min(74, Math.floor(contentWidth * 0.35))) : contentWidth;
  const mapPanelWidth = split ? Math.max(48, contentWidth - listPanelWidth - 1) : contentWidth;
  const mapRows = split ? Math.max(8, bodyRows - 2) : Math.max(7, Math.min(14, Math.floor(bodyRows * 0.52)));
  const mapColumns = Math.max(40, mapPanelWidth - 2);
  const listRows = split ? bodyRows - 2 : Math.max(1, bodyRows - mapRows - 4);
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
    listRows,
    listPageSize
  };
}
