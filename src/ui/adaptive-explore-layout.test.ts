import {describe, expect, it} from 'vitest';
import {adaptiveExploreFrameMetrics, computeAdaptiveExploreLayout} from './adaptive-explore-layout.js';

describe('adaptive Explore layout', () => {
  it('stacks an aspect-correct map above as many station rows as micro can fit', () => {
    const frame = adaptiveExploreFrameMetrics('micro', 7);
    const layout = computeAdaptiveExploreLayout('micro', 24, frame.bodyRows);

    expect(frame).toEqual({headerRows: 1, headerGap: 0, bodyRows: 6});
    expect(layout).toMatchObject({split: false, mapRows: 4, mapColumns: 16, listRows: 2});
    expect(layout.mapColumns).toBeLessThanOrEqual(layout.mapRows * 4);
  });

  it('grows the micro station list from one to three rows with available height', () => {
    expect(computeAdaptiveExploreLayout('micro', 24, 4).listRows).toBe(1);
    expect(computeAdaptiveExploreLayout('micro', 24, 6).listRows).toBe(2);
    expect(computeAdaptiveExploreLayout('micro', 24, 9).listRows).toBe(3);
  });

  it('keeps narrow compact windows side-by-side', () => {
    const frame = adaptiveExploreFrameMetrics('compact', 16);
    const layout = computeAdaptiveExploreLayout('compact', 50, frame.bodyRows);

    expect(layout).toMatchObject({split: true, mapRows: 13, mapColumns: 31, listRows: 13});
    expect(layout.mapAreaWidth + layout.gap + layout.listWidth).toBe(50);
  });

  it('moves the station list beside the map in wide compact windows', () => {
    const layout = computeAdaptiveExploreLayout('compact', 72, 12);

    expect(layout.split).toBe(true);
    expect(layout.mapColumns).toBeLessThanOrEqual(layout.mapRows * 4);
    expect(layout.mapAreaWidth + layout.gap + layout.listWidth).toBe(72);
  });
});
