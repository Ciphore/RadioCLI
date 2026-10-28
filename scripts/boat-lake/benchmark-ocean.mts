import {performance} from 'node:perf_hooks';
import {buildSumiOcean} from '../../src/ui/visualizers/sumi-ocean.js';
import {buildSumiOceanQuadrants} from './sumi-quadrants.mjs';

type Frame = ReturnType<typeof buildSumiOcean>;
type Builder = (pulse: number, width: number, height: number, theme: 'blue') => Frame;
function measure(build: Builder, width: number, height: number) {
  const coldStart = performance.now();
  build(0, width, height, 'blue');
  const coldMs = performance.now() - coldStart;
  for (let frame = 0; frame < 60; frame++) build(frame, width, height, 'blue');
  const times: number[] = [];
  let runs = 0;
  for (let frame = 0; frame < 200; frame++) {
    const start = performance.now();
    const result = build(frame + 60, width, height, 'blue');
    times.push(performance.now() - start);
    runs += result.reduce((sum, row) => sum + row.segments.length, 0);
  }
  times.sort((a, b) => a - b);
  return {coldMs: +coldMs.toFixed(3), medianMs: +times[100]!.toFixed(3), p95Ms: +times[190]!.toFixed(3), colorRuns: Math.round(runs / 200)};
}
const results = [];
for (const [width, height] of [[120, 30], [100, 14], [80, 10], [60, 7], [36, 4], [24, 4], [20, 3]] as const) {
  const before = measure(buildSumiOceanQuadrants, width, height);
  const after = measure(buildSumiOcean, width, height);
  results.push({viewport: `${width}x${height}`, before, after, speedup: +(before.medianMs / after.medianMs).toFixed(2)});
}
console.log(JSON.stringify({runtime: process.version, results}, null, 2));
