import type {PlaybackState, ReceiverStyle, Station, ThemeName} from '../../types.js';
import {themeAccent, themeContributionColors} from '../theme.js';
import {receiverStyleMetadata} from './receiver-style-registry.js';

type VisualLine = {
  text: string;
  color: string;
  segments?: VisualSegment[];
};

type VisualSegment = {
  text: string;
  color: string;
  backgroundColor?: string;
  bold?: boolean;
};

type VisualCell = {
  text: string;
  color: string;
  backgroundColor?: string;
  bold?: boolean;
};

type VisualizerBuilder = (
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
) => VisualLine[];

const receiverStyleBuilders = {
  ultracode: buildUltracode,
  'motion-contour': buildMotionContour,
  leds: buildLeds,
  matrix: buildMatrix,
  hologram: buildHologram,
  cube: buildAsciiCube,
  fire: buildAsciiFire,
  fireworks: buildAsciiFireworks,
  'spinning-donut': buildAsciiDonut,
  starfield: buildAsciiStarfield,
  mesh: buildMesh,
  ribbon: buildRibbon,
  mirror: buildMirror,
  tunnel: buildTunnel,
  kaleidoscope: buildKaleidoscope,
  constellation: buildConstellation,
  'pulse-grid': buildPulseGrid,
  lissajous: buildLissajous,
  'braille-wave': buildBrailleWave,
  'radial-eq': buildRadialEq,
  spectrogram: buildSpectrogram,
  nebula: buildNebula,
  silk: buildSilk,
  'ripple-tank': buildRippleTank,
  phyllotaxis: buildPhyllotaxis,
  harmonograph: buildHarmonograph,
  moire: buildMoire,
  galaxy: buildGalaxy,
  caustics: buildCaustics,
  lorenz: buildLorenz,
  fern: buildFern,
  chladni: buildChladni,
  tesseract: buildTesseract,
  'torus-knot': buildTorusKnot,
  rotozoomer: buildRotozoomer,
  'fractal-tree': buildFractalTree,
  julia: buildJulia,
  goniometer: buildGoniometer,
  'copper-bars': buildCopperBars,
  twister: buildTwister,
  cyclone: buildCyclone,
  'lava-lamp': buildLavaLamp,
  newton: buildNewton,
  aurora: buildAurora,
  'xor-texture': buildXorTexture,
  'hex-pulse': buildHexPulse,
  spirograph: buildSpirograph,
  liftoff: buildLiftoff,
  'neural-net': buildNeuralNet,
  flyover: buildFlyover,
  skyline: buildSkyline,
  'golden-gate': buildGoldenGate,
  manhattan: buildManhattan,
  alpine: buildAlpine,
  'ordered-dither': buildOrderedDither,
  'pixel-crush': buildPixelCrush,
  stormfront: buildStormfront,
  cascade: buildCascade,
  phosphene: buildPhosphene,
  planetarium: buildPlanetarium,
  'sumi-ocean': buildSumiOcean
} satisfies Record<ReceiverStyle, VisualizerBuilder>;

export function buildVisualizer(
  style: ReceiverStyle,
  pulse: number,
  width: number,
  height: number,
  _station: Station | null,
  playback: PlaybackState,
  theme: ThemeName,
  viewport: 'standard' | 'micro' = 'standard'
): VisualLine[] {
  if (!playbackHasVisualSignal(style, playback)) {
    return buildZeroSignalVisualizer(width, height, theme);
  }

  if (viewport === 'micro') {
    return buildMicroVisualizer(style, pulse, width, height, theme);
  }

  return receiverStyleBuilders[style](pulse, width, height, theme);
}

function buildMicroVisualizer(
  style: ReceiverStyle,
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const targetWidth = Math.max(1, width);
  const targetHeight = Math.max(1, height);
  if (microNativeScaleStyles.has(style)) {
    return receiverStyleBuilders[style](pulse, targetWidth, targetHeight, theme);
  }

  const sourceHeight = Math.max(targetHeight, receiverStyleMetadata[style].minRows);
  const scale = sourceHeight / targetHeight;
  const sourceWidth = Math.max(targetWidth, Math.min(96, Math.round(targetWidth * scale)));
  const sourceRows = receiverStyleBuilders[style](pulse, sourceWidth, sourceHeight, theme);
  return resampleVisualizer(sourceRows, sourceWidth, sourceHeight, targetWidth, targetHeight, themeAccent(theme));
}

// These procedural fields already derive every coordinate from the requested
// viewport. Rendering them natively preserves their fine geometry (especially
// the circular braille rings) while fixed-size and minimum-size scenes use the
// supersampled fit path below.
const microNativeScaleStyles = new Set<ReceiverStyle>([
  'pulse-grid',
  'hex-pulse',
  'galaxy',
  'cyclone',
  'fire',
  'stormfront'
]);

function resampleVisualizer(
  rows: VisualLine[],
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  fallbackColor: string
): VisualLine[] {
  const source = Array.from({length: sourceHeight}, (_, rowIndex) =>
    visualCellsForLine(rows[rowIndex], sourceWidth, fallbackColor)
  );

  return Array.from({length: targetHeight}, (_, targetY) => {
    const startY = Math.floor((targetY * sourceHeight) / targetHeight);
    const endY = Math.max(startY + 1, Math.ceil(((targetY + 1) * sourceHeight) / targetHeight));
    const cells = Array.from({length: targetWidth}, (_, targetX) => {
      const startX = Math.floor((targetX * sourceWidth) / targetWidth);
      const endX = Math.max(startX + 1, Math.ceil(((targetX + 1) * sourceWidth) / targetWidth));
      return strongestVisualCell(source, startX, endX, startY, endY, fallbackColor);
    });
    return lineFromCells(cells, fallbackColor);
  });
}

function visualCellsForLine(line: VisualLine | undefined, width: number, fallbackColor: string): VisualCell[] {
  const cells: VisualCell[] = [];
  if (line?.segments) {
    for (const segment of line.segments) {
      for (const text of Array.from(segment.text)) {
        cells.push({text, color: segment.color, backgroundColor: segment.backgroundColor, bold: segment.bold});
      }
    }
  } else if (line) {
    for (const text of Array.from(line.text)) {
      cells.push({text, color: line.color});
    }
  }

  while (cells.length < width) {
    cells.push({text: ' ', color: fallbackColor});
  }
  return cells.slice(0, width);
}

function strongestVisualCell(
  source: VisualCell[][],
  startX: number,
  endX: number,
  startY: number,
  endY: number,
  fallbackColor: string
): VisualCell {
  let selected: VisualCell = {text: ' ', color: fallbackColor};
  let selectedScore = -1;
  let selectedDistance = Number.POSITIVE_INFINITY;
  const centerX = (startX + endX - 1) / 2;
  const centerY = (startY + endY - 1) / 2;

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const cell = source[y]?.[x];
      if (!cell) continue;
      const score = cell.text.trim() ? (cell.bold ? 5 : 4) : cell.backgroundColor ? 2 : 0;
      const distance = Math.abs(x - centerX) + Math.abs(y - centerY);
      if (score > selectedScore || (score === selectedScore && distance < selectedDistance)) {
        selected = cell;
        selectedScore = score;
        selectedDistance = distance;
      }
    }
  }

  return selected;
}

function playbackHasVisualSignal(style: ReceiverStyle, playback: PlaybackState): boolean {
  if (!playback.ready) {
    return false;
  }

  return playback.state === 'playing' || (playback.state === 'paused' && style !== 'ultracode');
}

function buildZeroSignalVisualizer(
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  return buildFlatZeroSignal(width, height, theme);
}

function buildFlatZeroSignal(width: number, requestedHeight: number, theme: ThemeName): VisualLine[] {
  const lineWidth = Math.max(0, width);
  const height = Math.max(1, requestedHeight);
  const blank = ''.padEnd(lineWidth, ' ');
  const baseline = '▁'.repeat(lineWidth);
  const accent = themeAccent(theme);

  return Array.from({length: height}, (_, rowIndex) => ({
    text: rowIndex === height - 1 ? baseline : blank,
    color: rowIndex === height - 1 ? accent : '#767676'
  }));
}

const ultracodeWavelength = 20;
const ultracodeTravelPerPulse = 80 * 0.03;
const ultracodeVioletRamp = ['#3e1676', '#491e87', '#542799', '#5f2faa', '#6b37bc', '#763fcd', '#8148df', '#8c50f0'];

function buildUltracode(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const renderWidth = Math.max(1, width);
  const renderHeight = Math.max(1, height);
  const accent = themeAccent(theme);
  const ramp = ultracodeRippleRamp(theme);
  const selectedColor = ramp[ramp.length - 1] ?? accent;
  const travel = pulse * ultracodeTravelPerPulse;
  const originColumn = Math.floor(renderWidth / 2);
  const originRow = Math.floor(renderHeight / 2);
  const rows = Array.from({length: renderHeight}, (_, rowIndex) => {
    const cells: VisualCell[] = Array.from({length: renderWidth}, (_, columnIndex) => {
      const level = ultracodeRippleLevel(
        ultracodeDistance(columnIndex, rowIndex, originColumn, originRow),
        travel,
        ramp.length
      );

      return {
        text: ' ',
        color: level === null ? accent : selectedColor,
        backgroundColor: level === null ? undefined : ramp[level] ?? selectedColor
      };
    });

    return lineFromCells(cells, accent);
  });

  return rows;
}

function ultracodeDistance(column: number, row: number, originColumn: number, originRow: number): number {
  const dx = column - originColumn;
  const dy = (row - originRow) * 2;
  return Math.sqrt(dx * dx + dy * dy);
}

function ultracodeRippleLevel(distance: number, travel: number, rampLength: number): number | null {
  if (distance > travel) {
    return null;
  }

  const phase = (((distance - travel) % ultracodeWavelength) + ultracodeWavelength) % ultracodeWavelength;
  const brightness = (1 + Math.cos((2 * Math.PI * phase) / ultracodeWavelength)) / 2;
  return Math.min(rampLength - 1, Math.round(brightness * (rampLength - 1)));
}

function ultracodeRippleRamp(theme: ThemeName): string[] {
  if (theme === 'violet') {
    return ultracodeVioletRamp;
  }

  const colors = themeContributionColors(theme);
  const start = colors[1] ?? '#1c1c1c';
  const end = themeAccent(theme);
  return Array.from({length: 8}, (_, index) => interpolateHex(start, end, index / 7));
}

type Rgb = [number, number, number];

function interpolateHex(startHex: string, endHex: string, amount: number): string {
  const start = hexToRgb(startHex);
  const end = hexToRgb(endHex);
  return rgbToHex([
    Math.round(start[0] + (end[0] - start[0]) * amount),
    Math.round(start[1] + (end[1] - start[1]) * amount),
    Math.round(start[2] + (end[2] - start[2]) * amount)
  ]);
}

function hexToRgb(hex: string): Rgb {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3
    ? [...normalized].map(value => value + value).join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  const value = Number.parseInt(expanded, 16);
  return [
    (value >> 16) & 255,
    (value >> 8) & 255,
    value & 255
  ];
}

function rgbToHex([red, green, blue]: Rgb): string {
  return `#${[red, green, blue].map(value => clampColor(value).toString(16).padStart(2, '0')).join('')}`;
}

function clampColor(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function buildMotionContour(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const h = Math.max(9, height);
  const cx = (width - 1) / 2;
  const cy = (h - 1) / 2;
  const xScale = Math.max(1, width * 0.36);
  const yScale = Math.max(1, h * 0.58);
  const rings = 8;
  const accent = themeAccent(theme);

  return Array.from({length: h}, (_, y) => {
    const cells: VisualCell[] = Array.from({length: width}, (_, x) => {
      const nx = (x - cx) / xScale;
      const ny = (y - cy) / yScale;
      const radius = Math.sqrt(nx * nx + ny * ny);
      const theta = Math.atan2(ny, nx);
      const boundary =
        0.62 +
        0.08 * Math.sin(theta * 5 + pulse * 0.18) +
        0.07 * Math.cos(theta * 8 - pulse * 0.13) +
        0.04 * Math.sin(theta * 13 + pulse * 0.09);

      for (let ring = rings; ring >= 1; ring -= 1) {
        const target = boundary * (ring / rings);
        const distance = Math.abs(radius - target);
        if (distance < 0.017 + ring * 0.0015) {
          const position = (theta + Math.PI) / (Math.PI * 2);
          return {
            text: ring % 3 === 0 ? '∙' : ring % 2 === 0 ? '•' : '·',
            color: motionColorAt((position + ring * 0.08) % 1, theme)
          };
        }
      }

      return {text: ' ', color: accent};
    });

    return lineFromCells(cells, accent);
  }).slice(0, height);
}

function buildLeds(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const rows: VisualLine[] = [];
  const freqStrings = ['  60 Hz', ' 150 Hz', ' 400 Hz', '  1 kHz', '2.5 kHz', '  6 kHz', ' 15 kHz', ' 20 kHz'];

  for (let y = 0; y < height; y++) {
    const label = freqStrings[y] ?? `Band ${y+1}`.padStart(7);
    const meterWidth = Math.max(10, width - 13);

    const t = pulse * 0.15;
    const rawVal = 0.4 * Math.sin(y * 0.6 + t * 2.1) + 0.35 * Math.cos(y * 0.23 - t * 1.3) + 0.25 * Math.sin(pulse * 0.08);
    const lvl = Math.max(0.02, Math.min(0.98, (rawVal + 1.0) / 2.0));

    const filledCount = Math.round(lvl * meterWidth);
    const emptyCount = Math.max(0, meterWidth - filledCount);

    const filledBar = '■'.repeat(filledCount);
    const emptyBar = '□'.repeat(emptyCount);

    const text = `${label} │ [${filledBar}${emptyBar}]`.padEnd(width).slice(0, width);

    const colors = themeContributionColors(theme);
    // Low bands warmer/hotter within the theme ramp; highs use the bright accent end.
    // Never hardcode a foreign hue — every band follows the display theme.
    const bandT = height <= 1 ? 1 : y / (height - 1);
    const colorIndex = Math.min(
      colors.length - 1,
      Math.max(1, Math.round(1 + bandT * (colors.length - 2)))
    );
    // Peak levels brighten toward the top of the ramp
    const peakBoost = lvl > 0.85 ? 1 : 0;
    const color = colors[Math.min(colors.length - 1, colorIndex + peakBoost)] ?? accent;

    rows.push({ text, color });
  }

  return rows;
}

function buildMatrix(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()';
  const rows: VisualLine[] = [];
  const colors = themeContributionColors(theme);
  const primaryColor = colors[3] ?? '#00ff00';
  const headColor = '#ffffff';

  for (let y = 0; y < height; y++) {
    let rowText = '';
    for (let x = 0; x < width; x++) {
      if (x % 2 === 1) {
        rowText += ' ';
        continue;
      }

      const speed = 0.5 + Math.abs(Math.sin(x * 123.45)) * 1.5;
      const offset = Math.abs(Math.cos(x * 321.65)) * 100;
      const dropY = (pulse * speed + offset) % (height * 2) - height;

      const dist = y - dropY;
      const tailLen = 4 + Math.abs(Math.sin(x * 11.11)) * 6;

      if (dist === 0) {
        const charIdx = Math.floor(Math.abs(Math.sin(x * y * pulse)) * chars.length) % chars.length;
        rowText += chars[charIdx];
      } else if (dist > 0 && dist < tailLen) {
        const charIdx = Math.floor(Math.abs(Math.cos(x * y + pulse)) * chars.length) % chars.length;
        rowText += chars[charIdx];
      } else {
        rowText += ' ';
      }
    }

    rows.push({
      text: rowText.slice(0, width),
      color: y === Math.floor(pulse) % height ? headColor : primaryColor
    });
  }

  for (let y = 0; y < height; y++) {
    const rowText = rows[y]!.text;
    let isHead = false;
    for (let x = 0; x < width; x++) {
      if (rowText[x] !== ' ') {
        const speed = 0.5 + Math.abs(Math.sin(x * 123.45)) * 1.5;
        const offset = Math.abs(Math.cos(x * 321.65)) * 100;
        const dropY = Math.round((pulse * speed + offset) % (height * 2) - height);
        if (y === dropY) {
          isHead = true;
        }
      }
    }
    if (isHead) {
      rows[y]!.color = headColor;
    }
  }

  return rows;
}

function buildHologram(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const rows: VisualLine[] = [];
  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < height; y++) {
    let rowText = '';
    const ny = (y - cy) / cy;

    for (let x = 0; x < width; x++) {
      const nx = (x - cx) / cx;
      const r = Math.sqrt(nx * nx + ny * ny);
      const theta = Math.atan2(ny, nx);

      const wave1 = Math.sin(r * 10 - pulse * 0.5);
      const wave2 = Math.cos(theta * 4 + pulse * 0.3);
      const interference = (wave1 + wave2) * 0.5;

      const glitch = hashNoise(x, y, Math.floor(pulse / 2)) > 0.98 ? 1 : 0;
      const scanline = Math.abs(y - ((pulse * 2) % height)) < 1 ? 1 : 0;

      const intensity = Math.max(0, interference) + scanline * 0.5 + glitch;

      if (intensity > 1.2) rowText += '█';
      else if (intensity > 0.8) rowText += '▓';
      else if (intensity > 0.4) rowText += '▒';
      else if (intensity > 0.1) rowText += '░';
      else rowText += ' ';
    }

    let color = accent;
    if (Math.abs(y - ((pulse * 2) % height)) < 1) {
      color = '#ffffff';
    }

    rows.push({
      text: rowText.slice(0, width),
      color
    });
  }

  return rows;
}

function buildAsciiCube(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = Array.from({length: height}, () => Array.from({length: width}, () => ' '));
  const zBuffer = Array.from({length: height}, () => Array.from({length: width}, () => Number.NEGATIVE_INFINITY));
  const angleY = pulse * 0.13;
  const angleX = 0.62 + Math.sin(pulse * 0.045) * 0.28;
  const angleZ = Math.sin(pulse * 0.035) * 0.16;
  // Pull the camera back another notch so the cube reads as an object in space
  // instead of pressing against its viewport.
  const scaleY = Math.max(1.45, Math.min((height - 2) / 3.0, width / 12) * 0.7);
  const scaleX = scaleY * 2.35;

  drawCubeSurfaces(grid, zBuffer, angleX, angleY, angleZ, scaleX, scaleY, width, height);

  const vertices = cubeVertices().map(point =>
    projectRotatedCubePoint(rotateCubePoint(point, angleX, angleY, angleZ), scaleX, scaleY, width, height)
  );
  const edges: Array<[number, number]> = [
    [0, 1],
    [1, 3],
    [3, 2],
    [2, 0],
    [4, 5],
    [5, 7],
    [7, 6],
    [6, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7]
  ];

  for (const [from, to] of edges) {
    const a = vertices[from];
    const b = vertices[to];
    if (!a || !b) {
      continue;
    }

    drawCubeEdgeZ(grid, zBuffer, a, b);
  }

  for (const point of vertices) {
    writeCubeSurfaceGlyph(grid, zBuffer, point.x, point.y, point.z + 0.14, cubeCornerGlyph(point.z));
  }

  // Per-glyph theme shading — always tracks display theme (skip dark empty slot).
  const accent = themeAccent(theme);
  const ramp = themeContributionColors(theme).filter((_, i) => i > 0);
  const litRamp = ramp.length > 0 ? ramp : [accent];
  const voidColor = theme === 'mono' ? '#1a1a1a' : '#0c1018';
  const glyphOrder = ' .:-+=*#%@/\\|_;,!';

  return Array.from({length: height}, (_, y) => {
    const cells: VisualCell[] = Array.from({length: width}, (_, x) => {
      const ch = grid[y]![x] ?? ' ';
      if (ch === ' ') {
        return {text: ' ', color: voidColor};
      }
      // Brightness from glyph density + slight depth cue from row
      const gi = Math.max(0, glyphOrder.indexOf(ch));
      const density = gi <= 0 ? 0.35 : clampNumber(gi / Math.max(1, glyphOrder.length - 1), 0.15, 1);
      const depthBoost = clampNumber(0.15 + (zBuffer[y]![x] ?? 0) * 0.35, 0, 0.35);
      const lit = clampNumber(density * 0.75 + depthBoost + 0.15, 0.12, 1);
      const colorIndex = Math.min(litRamp.length - 1, Math.floor(lit * (litRamp.length - 0.01)));
      // Edges/corners punch to pure accent
      const isEdge = /[/\\|_\-=]/.test(ch);
      const color = isEdge ? accent : litRamp[colorIndex] ?? accent;
      return {
        text: ch,
        color: lit > 0.85 ? (theme === 'mono' ? '#ffffff' : accent) : color,
        bold: lit > 0.8 || isEdge
      };
    });
    return lineFromCells(cells, accent);
  });
}

/** A compact fireplace: overlapping turbulent plumes rise from one shared ember bed. */
function buildAsciiFire(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const flameRamp =
    theme === 'mono'
      ? ['#161616', '#343434', '#5a5a5a', '#858585', '#b0b0b0', '#d8d8d8', '#ffffff']
      : ['#180300', '#3d0900', '#721500', '#ad2800', '#e84b08', '#ff7b16', '#ffb52e', '#ffe08a', '#fff7ce'];
  const voidColor = theme === 'mono' ? '#080808' : '#080304';
  const grid = emptyMotionGrid(width, height, voidColor);
  const bass = receiverBandEnergy(pulse, 2);
  const fireLeft = 0.13;
  const fireRight = 0.87;
  const fireSpan = fireRight - fireLeft;
  // A few additional overlapping plumes keep the center lively without
  // widening the compact hearth silhouette.
  const plumeCount = Math.max(7, Math.min(11, Math.round(width / 13)));
  const embers = Array.from({length: Math.max(4, Math.round(width / 18))}, (_, index) => {
    const cycle = height + 5 + Math.floor(hashNoise(index, 18, 0) * height);
    const travel = (pulse * (0.13 + hashNoise(index, 19, 0) * 0.1) + hashNoise(index, 20, 0) * cycle) % cycle;
    return {
      x: Math.round((fireLeft + hashNoise(index, 21, 0) * fireSpan) * Math.max(0, width - 1) + Math.sin(pulse * 0.04 + index) * 1.5),
      y: Math.round(height - 3 - travel),
      bright: hashNoise(index, 22, 0) > 0.56
    };
  });

  for (let y = 0; y < height; y += 1) {
    const rise = (height - 1 - y) / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      let heat = 0;

      for (let index = 0; index < plumeCount; index += 1) {
        const phase = hashNoise(index, 3, 0) * Math.PI * 2;
        const baseCenter = fireLeft + ((index + 0.5) / plumeCount) * fireSpan;
        const flameHeight =
          0.46 + hashNoise(index, 4, 0) * 0.39 + bass * 0.045 + Math.sin(pulse * 0.052 + phase) * 0.055;
        if (rise > flameHeight) {
          continue;
        }

        const vertical = rise / Math.max(0.01, flameHeight);
        const sway =
          Math.sin(pulse * (0.038 + hashNoise(index, 5, 0) * 0.02) + phase + vertical * 3.4) *
            (0.005 + vertical * 0.026) +
          Math.sin(vertical * 8.5 - pulse * 0.09 + index) * vertical * 0.008;
        const center = baseCenter + sway;
        const baseHalfWidth = fireSpan * (0.095 + hashNoise(index, 6, 0) * 0.035);
        const halfWidth = Math.max(0.002, baseHalfWidth * (0.18 + 0.82 * Math.pow(1 - vertical, 0.7)));
        const lateral = Math.abs(nx - center) / halfWidth;
        if (lateral >= 1.15) {
          continue;
        }

        const body = Math.exp(-lateral * lateral * 1.7) * (1 - vertical * 0.3);
        const upwardCurl =
          Math.sin(x * 0.31 + rise * 13 - pulse * 0.17 + phase) * 0.1 +
          Math.sin(x * 0.67 - rise * 19 - pulse * 0.11) * 0.055;
        const breakup = hashNoise(Math.floor(x / 2), Math.floor(y / 2), index) * 0.07;
        const contribution = Math.max(0, body + upwardCurl + breakup - vertical * 0.1);
        heat += contribution * 0.68;
      }

      const sideEnvelope = Math.sin(clampNumber((nx - fireLeft) / fireSpan, 0, 1) * Math.PI);
      heat = clampNumber(heat * Math.pow(Math.max(0, sideEnvelope), 0.28), 0, 1.2);
      if (heat > 0.24) {
        const verticalGlow = 0.56 + (1 - rise) * 0.5;
        const value = clampNumber((heat - 0.16) * verticalGlow, 0, 1);
        const level = Math.min(flameRamp.length - 1, Math.floor(value * (flameRamp.length - 0.01)));
        const edgePhase = Math.sin(x * 0.5 + y * 1.4 - pulse * 0.13);
        const glyph = value > 0.78 ? '█' : value > 0.58 ? '▓' : value > 0.38 ? '▒' : edgePhase > 0 ? '▄' : '░';
        grid[y]![x] = {
          text: glyph,
          color: flameRamp[level] ?? accent,
          bold: value > 0.88
        };
      }
    }
  }

  // The fire occupies one hearth instead of spreading edge-to-edge across the receiver.
  const hearthStart = Math.round(width * fireLeft);
  const hearthEnd = Math.round(width * fireRight);
  for (let x = hearthStart; x <= hearthEnd; x += 1) {
    if (height >= 2) {
      const logGlow = 0.3 + 0.7 * Math.abs(Math.sin(x * 0.17 + pulse * 0.018));
      const colorIndex = Math.min(flameRamp.length - 1, 2 + Math.floor(logGlow * 3));
      paintCell(grid, x, height - 1, x % 11 < 8 ? '▄' : '▓', flameRamp[colorIndex] ?? accent);
    }
    if (height >= 3 && (x + Math.floor(width * 0.18)) % 13 < 9) {
      paintCell(grid, x, height - 2, x % 5 === 0 ? '█' : '▀', flameRamp[x % 5 === 0 ? 5 : 3] ?? accent);
    }
  }

  for (const ember of embers) {
    if (ember.y > 0 && ember.y < height - 2 && ember.x >= 0 && ember.x < width) {
      paintCell(grid, ember.x, ember.y, ember.bright ? '•' : '·', flameRamp[ember.bright ? 6 : 4] ?? accent);
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildAsciiFireworks(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const grid = emptyMotionGrid(width, height, '#06060e');
  const palette =
    theme === 'mono'
      ? ['#888888', '#b0b0b0', '#d8d8d8', '#ffffff']
      : ['#ff5f87', '#ffd166', '#53a8ff', '#8df084', '#c06cff', '#ff9345', '#5eead4', '#ffffff'];

  // Dim star dust so the sky isn't empty between bursts
  for (let s = 0; s < Math.floor((width * height) / 28); s += 1) {
    const sx = Math.floor(hashNoise(s, 1, 0) * width);
    const sy = Math.floor(hashNoise(s, 2, 0) * height);
    if (hashNoise(s, 3, Math.floor(pulse / 20)) > 0.55) {
      paintCell(grid, sx, sy, '·', '#2a2a40');
    }
  }

  const showCount = Math.max(5, Math.min(10, Math.floor(width / 14)));
  // Slower overall tempo — launches and blooms linger longer
  const tempo = 0.78;
  // Staggered generations so bursts appear at different places over time
  for (let show = 0; show < showCount; show += 1) {
    const period = 52 + (show % 5) * 9;
    const phaseOffset = show * 14.5 + hashNoise(show, 7, 0) * 22;
    const t = ((pulse * tempo + phaseOffset) % period + period) % period;
    // Re-roll burst origin each generation so they don't always fire in the same spot
    const gen = Math.floor((pulse * tempo + phaseOffset) / period);
    const originX = Math.floor(
      width * (0.1 + hashNoise(show, gen, 11) * 0.8)
    );
    const peakY = Math.floor(
      height * (0.12 + hashNoise(show, gen, 22) * 0.42)
    );
    const color = palette[Math.floor(hashNoise(show, gen, 33) * palette.length) % palette.length] ?? accent;
    const secondary = palette[(show + gen + 2) % palette.length] ?? color;

    // Launch trail climbing from ground
    const launchLen = 14;
    if (t < launchLen) {
      const progress = t / launchLen;
      const y = Math.round(height - 1 - progress * (height - 1 - peakY));
      const trailLen = 2 + Math.floor(progress * 4);
      for (let k = 0; k < trailLen; k += 1) {
        const fade = 1 - k / trailLen;
        const glyph = k === 0 ? (progress > 0.85 ? '●' : '│') : k < 2 ? '│' : '┊';
        const c = fade > 0.7 ? '#ffffff' : fade > 0.4 ? color : '#555566';
        paintCell(grid, originX, y + k, glyph, c);
        if (k === 0 && progress > 0.5) {
          paintCell(grid, originX - 1, y, '·', color);
          paintCell(grid, originX + 1, y, '·', color);
        }
      }
      continue;
    }

    // Explosion life: expand, glitter, then fade with gravity droop
    const age = t - launchLen;
    const life = 30 + (show % 4) * 4;
    if (age > life) {
      continue;
    }
    const lifeT = age / life;
    // Expand then slow drift
    const expand = 1 - Math.pow(1 - Math.min(1, lifeT * 1.2), 2.2);
    const maxR = (2.2 + hashNoise(show, gen, 44) * 3.5 + (show % 3)) * Math.min(width, height * 2.2) * 0.08;
    const radius = expand * maxR;
    const gravity = lifeT * lifeT * height * 0.22;
    const fade = clampNumber(1 - lifeT * 1.05, 0, 1);
    if (fade < 0.04) {
      continue;
    }

    const rays = 18 + (show % 6) * 4 + Math.floor(hashNoise(show, gen, 55) * 8);
    const rings = lifeT < 0.25 ? 1 : lifeT < 0.55 ? 2 : 3;

    for (let ring = 0; ring < rings; ring += 1) {
      const ringScale = 1 - ring * 0.28;
      const ringR = radius * ringScale;
      for (let ray = 0; ray < rays; ray += 1) {
        const angle =
          (ray / rays) * Math.PI * 2 +
          show * 0.4 +
          gen * 0.15 +
          Math.sin(ray + gen) * 0.08;
        // Slight ellipse + asymmetric petal lengths
        const petal = 0.75 + 0.45 * hashNoise(ray, show, gen);
        const px = originX + Math.cos(angle) * ringR * petal * 1.85;
        const py = peakY + Math.sin(angle) * ringR * petal * 0.72 + gravity * (0.6 + ring * 0.2);
        // Sparkle trail behind each particle
        const trailSteps = lifeT < 0.5 ? 3 : 2;
        for (let s = 0; s < trailSteps; s += 1) {
          const back = s * 0.35;
          const tx = px - Math.cos(angle) * back * petal;
          const ty = py - Math.sin(angle) * back * petal * 0.5 + s * 0.15;
          const sparkFade = fade * (1 - s / trailSteps) * (1 - ring * 0.15);
          if (sparkFade < 0.08) {
            continue;
          }
          let glyph: string;
          if (lifeT < 0.2 && s === 0) {
            glyph = ['✦', '★', '*', '✸'][ray % 4]!;
          } else if (lifeT < 0.45) {
            glyph = s === 0 ? ['*', '+', 'x', '●'][ray % 4]! : '·';
          } else if (lifeT < 0.7) {
            glyph = s === 0 ? [':', '+', '.', '°'][ray % 4]! : '·';
          } else {
            glyph = sparkFade > 0.35 ? '·' : '˙';
          }
          const c =
            sparkFade > 0.75
              ? '#ffffff'
              : sparkFade > 0.4
                ? ring === 0
                  ? color
                  : secondary
                : '#666680';
          paintCell(grid, Math.round(tx), Math.round(ty), glyph, c);
        }
      }
    }

    // Bright flash core at detonation
    if (lifeT < 0.12) {
      const core = ['✸', '✦', '●'];
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx * dx + dy * dy <= 2) {
            paintCell(grid, originX + dx, peakY + dy, core[(dx + dy + 2) % 3]!, '#ffffff');
          }
        }
      }
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildAsciiDonut(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = Array.from({length: height}, () => Array.from({length: width}, () => ' '));
  const zBuffer = Array.from({length: height}, () => Array.from({length: width}, () => Number.NEGATIVE_INFINITY));
  const chars = ['.', ',', '-', '~', ':', ';', '=', '!', '*', '#', '$', '@'];
  const angleA = pulse * 0.07;
  const angleB = pulse * 0.043;
  const cx = width / 2;
  const cy = height / 2;
  // Slightly zoomed out so the full torus stays in frame with margin
  const scale = Math.min(width * 0.165, height * 0.88);

  for (let theta = 0; theta < Math.PI * 2; theta += 0.1) {
    for (let phi = 0; phi < Math.PI * 2; phi += 0.16) {
      const circleX = 2 + Math.cos(theta);
      const circleY = Math.sin(theta);
      const x =
        circleX * (Math.cos(angleB) * Math.cos(phi) + Math.sin(angleA) * Math.sin(angleB) * Math.sin(phi)) -
        circleY * Math.cos(angleA) * Math.sin(angleB);
      const y =
        circleX * (Math.sin(angleB) * Math.cos(phi) - Math.sin(angleA) * Math.cos(angleB) * Math.sin(phi)) +
        circleY * Math.cos(angleA) * Math.cos(angleB);
      const z = Math.cos(angleA) * circleX * Math.sin(phi) + circleY * Math.sin(angleA) + 5;
      const inverseZ = 1 / z;
      const screenX = Math.round(cx + scale * inverseZ * x * 1.85);
      const screenY = Math.round(cy + scale * inverseZ * y * 0.78);
      const luminance =
        Math.cos(phi) * Math.cos(theta) * Math.sin(angleB) -
        Math.cos(angleA) * Math.cos(theta) * Math.sin(phi) -
        Math.sin(angleA) * Math.sin(theta) +
        Math.cos(angleB) * (Math.cos(angleA) * Math.sin(theta) - Math.cos(theta) * Math.sin(angleA) * Math.sin(phi));

      if (screenX < 0 || screenX >= width || screenY < 0 || screenY >= height || inverseZ <= zBuffer[screenY]![screenX]!) {
        continue;
      }

      const charIndex = Math.max(0, Math.min(chars.length - 1, Math.round((luminance + 1) * 0.5 * (chars.length - 1))));
      grid[screenY]![screenX] = chars[charIndex]!;
      zBuffer[screenY]![screenX] = inverseZ;
    }
  }

  // Single display-tone coloring — shading comes from the glyphs only, no white dual-tone.
  const accent = themeAccent(theme);
  return grid.map(cells => ({
    text: cells.join('').slice(0, width),
    color: accent
  }));
}

function buildAsciiStarfield(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const ramp = themeContributionColors(theme);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;

  // Dense multi-layer warp field: dust nebula + mid stars + near streaks + flares
  return Array.from({length: height}, (_, y) => {
    const cells: VisualCell[] = Array.from({length: width}, (_, x) => {
      const dx = x - cx;
      const dy = (y - cy) * 2.05;
      const angle = Math.atan2(dy, dx);
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
      const maxDist = Math.sqrt(cx * cx + (cy * 2.05) ** 2);

      // Soft nebula dust so the void isn't empty
      const nebula =
        0.22 * Math.sin(angle * 3 + pulse * 0.03) +
        0.18 * Math.sin(dist * 0.12 - pulse * 0.04 + angle * 2) +
        0.12 * Math.cos(x * 0.08 + y * 0.15 + pulse * 0.02);
      const dust = clampNumber(0.18 + nebula * 0.5, 0, 0.55);

      // Multiple star layers with different speeds (true parallax warp)
      let best = dust * 0.35;
      let bestGlyph = dust > 0.28 ? '·' : ' ';
      let bestColor = ramp[1] ?? '#2a2a40';
      let bold = false;

      for (let layer = 0; layer < 4; layer += 1) {
        const layerSpeed = 0.35 + layer * 0.55;
        // Quantize angle into star "lanes" so stars feel discrete
        const laneCount = 48 + layer * 36;
        const lane = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * laneCount);
        const laneAngle = (lane / laneCount) * Math.PI * 2 - Math.PI;
        const angDiff = Math.abs(Math.atan2(Math.sin(angle - laneAngle), Math.cos(angle - laneAngle)));
        if (angDiff > 0.04 + layer * 0.01) {
          continue;
        }

        const seed = lane * 17 + layer * 91;
        const phase = hashNoise(seed, layer, 0);
        const depth = ((pulse * layerSpeed * 0.45 + phase * 40 + seed) % 100) / 100;
        const starDist = Math.pow(depth, 1.55) * maxDist * (0.15 + phase * 0.85);
        const along = Math.abs(dist - starDist);
        // Near stars elongate into streaks
        const streak = layer >= 2 ? 0.8 + depth * 4.5 : 0.35 + depth * 1.2;
        const hit = along < streak;

        if (!hit) {
          continue;
        }

        const intensity = clampNumber((1 - along / streak) * (0.35 + depth * 0.75) * (0.5 + layer * 0.2), 0, 1);
        if (intensity <= best) {
          continue;
        }

        best = intensity;
        if (layer >= 3 && depth > 0.7) {
          bestGlyph = intensity > 0.85 ? '✦' : intensity > 0.65 ? '*' : '+';
          bestColor = '#ffffff';
          bold = true;
        } else if (layer >= 2) {
          bestGlyph = depth > 0.6 ? (along < 0.5 ? '━' : '*') : depth > 0.35 ? '+' : '·';
          bestColor = depth > 0.55 ? '#ffffff' : accent;
        } else if (layer === 1) {
          bestGlyph = depth > 0.55 ? '*' : depth > 0.3 ? '+' : '·';
          bestColor = ramp[Math.min(ramp.length - 1, 2 + Math.floor(depth * 3))] ?? accent;
        } else {
          bestGlyph = depth > 0.5 ? '·' : '˙';
          bestColor = ramp[1] ?? '#555566';
        }
      }

      // Occasional cross-flare on the brightest stars
      if (best > 0.88) {
        // already bright center
      }

      if (best < 0.08) {
        return {text: ' ', color: accent};
      }

      // Fill nebula with faint background tint
      const bg =
        dust > 0.32 && best < 0.5
          ? theme === 'mono'
            ? '#121218'
            : ramp[0] ?? '#0a0a14'
          : undefined;

      return {
        text: bestGlyph,
        color: bestColor,
        backgroundColor: bg,
        bold
      };
    });

    // Add a few hard cross-flares as post pass via bright neighbors — done per-cell above
    return lineFromCells(cells, accent);
  });
}

function buildMesh(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#0a0e16');
  const colors = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const rows = Math.max(4, Math.min(Math.round(height * 0.56), height - 1));

  for (let depthRow = rows; depthRow >= 0; depthRow -= 1) {
    const depth = depthRow / rows;
    const nearness = 1 - depth;
    const baseY = (height - 1) * (0.28 + 0.66 * nearness);
    const amp = height * 0.16 * (0.35 + 0.65 * nearness);
    let previousY = -1;

    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const wobble =
        Math.sin(nx * 7 - pulse * 0.18 + depth * 3.1) * amp +
        Math.sin(nx * 13 + pulse * 0.09) * amp * 0.4;
      const y = baseY - wobble;
      const glyph = previousY < 0 ? '─' : y < previousY - 0.4 ? '╱' : y > previousY + 0.4 ? '╲' : '─';
      const colorIndex = Math.min(colors.length - 1, 1 + Math.round(nearness * (colors.length - 2)));
      paintCell(grid, x, y, glyph, colors[colorIndex] ?? accent);
      previousY = y;
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildRibbon(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#0a0e16');
  const accent = themeAccent(theme);
  const palette = themeContributionColors(theme);
  const mid = (height - 1) / 2;
  const baseThickness = Math.max(1.5, height * 0.3);

  for (let x = 0; x < width; x += 1) {
    const nx = x / Math.max(1, width - 1);
    const center =
      mid +
      Math.sin(nx * 5 - pulse * 0.16) * (height * 0.26) +
      Math.sin(nx * 11 + pulse * 0.07) * (height * 0.1);
    const thickness = baseThickness * (0.55 + 0.45 * Math.sin(nx * 9 - pulse * 0.12));

    for (let y = 0; y < height; y += 1) {
      const distance = Math.abs(y - center);
      if (distance > thickness) {
        continue;
      }

      const shade = 1 - distance / Math.max(0.5, thickness);
      const glyph = shade > 0.66 ? '█' : shade > 0.36 ? '▓' : '▒';
      const colorIndex = Math.min(palette.length - 1, Math.max(1, Math.round(shade * (palette.length - 1))));
      paintCell(grid, x, y, glyph, palette[colorIndex] ?? accent);
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildMirror(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#0a0e16');
  const colors = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const baseY = Math.round((height - 1) * 0.66);
  const bandWidth = 2;
  const bands = Math.ceil((width + 1) / bandWidth);
  const sample = (band: number, p: number): number =>
    clampNumber(
      (Math.sin(band * 0.4 + p * 0.3) * 0.42 +
        Math.sin(band * 0.13 - p * 0.18) * 0.34 +
        Math.sin(band * 0.66 + p * 0.52) * 0.24 +
        1) /
        2,
      0,
      1
    );

  for (let band = 0; band < bands; band += 1) {
    const x = band * bandWidth;
    const up = Math.round(sample(band, pulse) * baseY);
    let peak = 0;
    for (let k = 0; k < 10; k += 1) {
      peak = Math.max(peak, Math.round(sample(band, pulse - k) * baseY));
    }

    for (let d = 0; d <= up; d += 1) {
      const frac = d / Math.max(1, baseY);
      const colorIndex = Math.min(colors.length - 1, 1 + Math.round(frac * (colors.length - 2)));
      paintCell(grid, x, baseY - d, '█', colors[colorIndex] ?? accent);
    }

    const reflection = Math.round(up * 0.45);
    for (let d = 1; d <= reflection; d += 1) {
      paintCell(grid, x, baseY + d, d > reflection - 1 ? '░' : '▒', '#27313d');
    }

    if (peak > 0) {
      paintCell(grid, x, baseY - peak, '▀', '#ffffff');
    }
  }

  const baseline = grid[baseY];
  if (baseline) {
    for (let x = 0; x < width; x += 1) {
      if (baseline[x]?.text === ' ') {
        paintCell(grid, x, baseY, '─', '#1d2530');
      }
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildTunnel(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#04060a');
  const colors = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - cx) / (width * 0.5);
      const dy = (y - cy) / (height * 0.5);
      const r = Math.sqrt(dx * dx + dy * dy) + 1e-3;
      const angle = Math.atan2(dy, dx);
      const depth = 1 / r;
      const ring = Math.sin(depth * 5 - pulse * 0.4);
      const twist = Math.sin(angle * 5 + depth * 2 + pulse * 0.08);
      const shade = (ring * 0.7 + twist * 0.3 + 1) / 2;
      const glyph = shade > 0.78 ? '█' : shade > 0.58 ? '▓' : shade > 0.38 ? '▒' : shade > 0.2 ? '░' : ' ';
      if (glyph === ' ') {
        continue;
      }

      const colorIndex = Math.min(colors.length - 1, Math.max(1, Math.round(Math.min(1, depth * 0.7) * (colors.length - 1))));
      paintCell(grid, x, y, glyph, r < 0.12 ? '#ffffff' : colors[colorIndex] ?? accent);
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildKaleidoscope(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#070a12');
  const accent = themeAccent(theme);
  const palette = ['#6ee7f2', '#8df084', '#ffd166', '#ff5f87', '#c06cff', '#66a3ff'];
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const segment = Math.PI / 3;
  const rotation = pulse * 0.05;
  const glyphs = [' ', '·', '∘', '*', '✦', '◆', '█'];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - cx) / 2.0;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      let folded = (Math.atan2(dy, dx) + rotation) % segment;
      folded = Math.abs(((folded + segment) % segment) - segment / 2);
      const value = Math.sin(r * 0.9 - pulse * 0.2) + Math.cos(folded * 6 + r * 0.5 - pulse * 0.12);
      const normalized = clampNumber((value + 2) / 4, 0, 1);
      const glyphIndex = Math.min(glyphs.length - 1, Math.floor(normalized * glyphs.length));
      if (glyphIndex === 0) {
        continue;
      }

      const color =
        theme === 'mono'
          ? motionColorAt(normalized, theme)
          : palette[Math.floor((normalized + rotation * 0.1) * palette.length) % palette.length] ?? accent;
      paintCell(grid, x, y, glyphs[glyphIndex] ?? '·', color);
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildConstellation(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#06090f');
  const accent = themeAccent(theme);
  const linkColor = theme === 'mono' ? '#b8b8b8' : interpolateHex(accent, '#ffffff', 0.48);
  const count = Math.max(8, Math.min(18, Math.floor(width / 6)));
  const nodes: Array<{x: number; y: number}> = [];

  for (let i = 0; i < count; i += 1) {
    const baseX = hashNoise(i * 13 + 1, 1, 0);
    const baseY = hashNoise(i * 7 + 3, 2, 0);
    const speedX = 0.6 + hashNoise(i, 5, 0) * 0.8;
    const speedY = 0.4 + hashNoise(i, 9, 0) * 0.7;
    const x = baseX * (width - 1) + Math.sin(pulse * 0.03 * speedX + i) * width * 0.16;
    const y = baseY * (height - 1) + Math.cos(pulse * 0.025 * speedY + i * 1.3) * height * 0.2;
    nodes.push({
      x: ((x % (width - 1)) + (width - 1)) % (width - 1),
      y: ((y % (height - 1)) + (height - 1)) % (height - 1)
    });
  }

  const linkDistance = width * 0.22;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      const dx = a.x - b.x;
      const dy = (a.y - b.y) * 2;
      if (Math.sqrt(dx * dx + dy * dy) < linkDistance) {
        drawLineCells(grid, a.x, a.y, b.x, b.y, '·', linkColor);
      }
    }
  }

  for (const node of nodes) {
    paintCell(grid, node.x, node.y, '✦', accent);
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildPulseGrid(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const canvas = createBraille(width, height);
  const accent = themeAccent(theme);
  const colors = themeContributionColors(theme);
  const dotsWide = Math.max(1, width * 2);
  const dotsHigh = Math.max(1, height * 4);
  const cx = (dotsWide - 1) / 2;
  const cy = (dotsHigh - 1) / 2;
  const ringGap = Math.max(5, Math.min(dotsWide, dotsHigh) * 0.24);
  const travel = (pulse * 0.65) % ringGap;
  const stroke = Math.max(0.65, ringGap * 0.1);

  for (let y = 0; y < dotsHigh; y += 1) {
    for (let x = 0; x < dotsWide; x += 1) {
      const radius = Math.hypot(x - cx, y - cy);
      const phase = ((radius - travel) % ringGap + ringGap) % ringGap;
      const distanceToRing = Math.min(phase, ringGap - phase);
      if (distanceToRing > stroke) continue;

      const ring = Math.floor((radius + ringGap - travel) / ringGap);
      const intensity = 1 - distanceToRing / stroke;
      const colorIndex = Math.min(
        colors.length - 1,
        Math.max(1, colors.length - 1 - (ring % Math.max(1, colors.length - 1)))
      );
      brailleSet(canvas, x, y, intensity > 0.82 ? '#ffffff' : colors[colorIndex] ?? accent);
    }
  }

  return brailleToLines(canvas, accent);
}

function buildLissajous(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#04070d');
  const accent = themeAccent(theme);
  const ramp = themeContributionColors(theme);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const rx = width * 0.42;
  const ry = height * 0.42;
  const a = 3;
  const b = 2;
  const delta = pulse * 0.03;
  const samples = 620;

  for (let s = samples; s >= 0; s -= 1) {
    const t = pulse * 0.05 + s * 0.0102;
    const x = cx + Math.sin(a * t + delta) * rx;
    const y = cy + Math.sin(b * t) * ry;
    const brightness = 1 - s / samples;
    const colorIndex = Math.min(ramp.length - 1, Math.max(1, Math.floor(brightness * ramp.length)));
    const glyph = s === 0 ? '◉' : brightness > 0.6 ? '●' : brightness > 0.3 ? '•' : '·';
    const color = theme === 'mono' ? motionColorAt(brightness, theme) : ramp[colorIndex] ?? accent;
    paintCell(grid, x, y, glyph, color);
  }

  return grid.map(row => lineFromCells(row, accent));
}

function paintCell(grid: VisualCell[][], x: number, y: number, text: string, color: string): void {
  const ix = Math.round(x);
  const iy = Math.round(y);
  const row = grid[iy];
  if (!row || !row[ix]) {
    return;
  }

  row[ix] = {text, color};
}

function drawLineCells(
  grid: VisualCell[][],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  text: string,
  color: string
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy) * 2)));

  for (let step = 1; step < steps; step += 1) {
    const t = step / steps;
    const x = Math.round(x0 + dx * t);
    const y = Math.round(y0 + dy * t);
    const row = grid[y];
    if (row?.[x]?.text === ' ') {
      row[x] = {text, color};
    }
  }
}

type BrailleCanvas = {
  width: number;
  height: number;
  dots: Uint8Array;
  colors: string[];
};

const BRAILLE_BITS: number[][] = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80]
];

function createBraille(width: number, height: number): BrailleCanvas {
  const size = Math.max(0, width * height);
  return {width, height, dots: new Uint8Array(size), colors: new Array(size).fill('')};
}

function brailleSet(canvas: BrailleCanvas, fx: number, fy: number, color: string): void {
  const px = Math.round(fx);
  const py = Math.round(fy);
  if (px < 0 || py < 0 || px >= canvas.width * 2 || py >= canvas.height * 4) {
    return;
  }

  const cx = px >> 1;
  const cy = py >> 2;
  const index = cy * canvas.width + cx;
  canvas.dots[index]! |= BRAILLE_BITS[py & 3]![px & 1]!;
  if (color) {
    canvas.colors[index] = color;
  }
}

function brailleToLines(canvas: BrailleCanvas, fallbackColor: string): VisualLine[] {
  const rows: VisualLine[] = [];
  for (let cy = 0; cy < canvas.height; cy += 1) {
    const cells: VisualCell[] = [];
    for (let cx = 0; cx < canvas.width; cx += 1) {
      const index = cy * canvas.width + cx;
      const bits = canvas.dots[index] ?? 0;
      cells.push({
        text: bits === 0 ? ' ' : String.fromCharCode(0x2800 + bits),
        color: canvas.colors[index] || fallbackColor
      });
    }

    rows.push(lineFromCells(cells, fallbackColor));
  }

  return rows;
}

function drawBrailleLine(canvas: BrailleCanvas, x0: number, y0: number, x1: number, y1: number, color: string): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    brailleSet(canvas, x0 + dx * t, y0 + dy * t, color);
  }
}

function spectrumSample(band: number, p: number): number {
  return clampNumber(
    (Math.sin(band * 0.35 + p * 0.3) * 0.4 +
      Math.sin(band * 0.12 - p * 0.17) * 0.35 +
      Math.sin(band * 0.62 + p * 0.52) * 0.25 +
      1) /
      2,
    0,
    1
  );
}

function buildBrailleWave(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const canvas = createBraille(width, height);
  const colors = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const dotsWide = width * 2;
  const dotsHigh = height * 4;
  const mid = (dotsHigh - 1) / 2;
  let previousY = -1;

  for (let x = 0; x < dotsWide; x += 1) {
    const nx = x / Math.max(1, dotsWide - 1);
    const wave =
      Math.sin(nx * Math.PI * 4 - pulse * 0.22) * 0.5 +
      Math.sin(nx * Math.PI * 9 + pulse * 0.13) * 0.28 +
      Math.sin(nx * Math.PI * 2 - pulse * 0.07) * 0.2;
    const envelope = 0.35 + 0.65 * Math.sin(nx * Math.PI);
    const amplitude = wave * envelope;
    const y = mid - amplitude * mid * 0.82;
    const colorIndex = Math.min(colors.length - 1, 1 + Math.round(Math.abs(amplitude) * (colors.length - 2)));
    const color = colors[colorIndex] ?? accent;

    const target = Math.round(y);
    if (previousY < 0) {
      previousY = target;
    }

    const low = Math.min(previousY, target);
    const high = Math.max(previousY, target);
    for (let yy = low; yy <= high; yy += 1) {
      brailleSet(canvas, x, yy, color);
    }

    previousY = target;
  }

  return brailleToLines(canvas, accent);
}

function buildRadialEq(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const canvas = createBraille(width, height);
  const colors = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const dotsWide = width * 2;
  const dotsHigh = height * 4;
  const cx = (dotsWide - 1) / 2;
  const cy = (dotsHigh - 1) / 2;
  const inner = Math.min(dotsWide, dotsHigh) * 0.13;
  const maxLength = Math.max(2, Math.min(dotsWide, dotsHigh) / 2 - inner - 1);
  const bands = 80;

  for (let band = 0; band < bands; band += 1) {
    const angle = (band / bands) * Math.PI * 2;
    const level = spectrumSample(band * 1.4, pulse);
    const length = inner + level * maxLength;
    for (let r = inner; r <= length; r += 0.6) {
      const frac = (r - inner) / Math.max(1, maxLength);
      const colorIndex = Math.min(colors.length - 1, 1 + Math.round(frac * (colors.length - 2)));
      brailleSet(canvas, cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, colors[colorIndex] ?? accent);
    }
  }

  for (let angle = 0; angle < Math.PI * 2; angle += 0.05) {
    brailleSet(canvas, cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner, accent);
  }

  return brailleToLines(canvas, accent);
}

function buildSpectrogram(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#05070d');
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const shades = [' ', '░', '▒', '▓', '█'];

  for (let x = 0; x < width; x += 1) {
    const t = pulse * 0.9 - (width - 1 - x);
    for (let y = 0; y < height; y += 1) {
      const freq = (height - 1 - y) / Math.max(1, height - 1);
      const formantA = Math.exp(-Math.pow((freq - (0.3 + 0.18 * Math.sin(t * 0.06))) / 0.12, 2));
      const formantB = 0.7 * Math.exp(-Math.pow((freq - (0.62 + 0.12 * Math.sin(t * 0.04 + 2))) / 0.09, 2));
      const base = (1 - freq) * 0.5;
      const shimmer = 0.2 * Math.sin(freq * 30 + t * 0.5) * Math.cos(freq * 11 - t * 0.3);
      const value = clampNumber(base + (formantA + formantB) * 0.7 + shimmer, 0, 1);
      const shadeIndex = Math.min(shades.length - 1, Math.floor(value * shades.length));
      if (shadeIndex === 0) {
        continue;
      }

      const colorIndex = Math.min(ramp.length - 1, Math.max(1, Math.round(value * (ramp.length - 1))));
      paintCell(grid, x, y, shades[shadeIndex] ?? '░', ramp[colorIndex] ?? accent);
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildNebula(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#04060e');
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const shades = [' ', '·', '░', '▒', '▓'];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = x / width;
      const ny = y / height;
      const cloudA = Math.sin(nx * 5 + pulse * 0.03) * 0.5 + 0.5;
      const cloudB = Math.sin(nx * 9 - ny * 7 + pulse * 0.02) * 0.5 + 0.5;
      const cloudC = Math.sin((nx + ny) * 6 + pulse * 0.025) * 0.5 + 0.5;
      const density = clampNumber(cloudA * 0.4 + cloudB * 0.35 + cloudC * 0.35 - 0.4, 0, 1);
      const shadeIndex = Math.min(shades.length - 1, Math.floor(density * shades.length));
      if (shadeIndex > 0) {
        const colorIndex = Math.min(ramp.length - 1, Math.max(1, Math.round(density * (ramp.length - 1))));
        paintCell(grid, x, y, shades[shadeIndex] ?? '·', ramp[colorIndex] ?? accent);
      }

      const star = hashNoise(x * 3 + 1, y * 7 + 3, 0);
      if (star > 0.992) {
        const twinkle = 0.5 + 0.5 * Math.sin(pulse * 0.3 + star * 40);
        if (twinkle > 0.5) {
          paintCell(grid, x, y, twinkle > 0.85 ? '✦' : '·', twinkle > 0.85 ? '#ffffff' : '#9aa4b2');
        }
      }
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildSilk(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const canvas = createBraille(width, height);
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const dotsWide = width * 2;
  const dotsHigh = height * 4;
  const lines = Math.max(6, Math.floor(dotsHigh / 4));

  for (let line = 0; line < lines; line += 1) {
    const base = ((line + 0.5) / lines) * dotsHigh;
    const phase = line * 0.5;
    const colorIndex = Math.min(ramp.length - 1, 1 + Math.round((line / lines) * (ramp.length - 2)));
    const color = ramp[colorIndex] ?? accent;
    let previous = -1;

    for (let x = 0; x < dotsWide; x += 1) {
      const nx = x / Math.max(1, dotsWide - 1);
      const warp =
        Math.sin(nx * Math.PI * 3 - pulse * 0.12 + phase) * dotsHigh * 0.06 +
        Math.sin(nx * Math.PI * 7 + pulse * 0.06 - phase) * dotsHigh * 0.03 +
        Math.sin(pulse * 0.04 + phase) * dotsHigh * 0.02;
      const target = Math.round(base + warp);
      if (previous < 0) {
        previous = target;
      }

      const low = Math.min(previous, target);
      const high = Math.max(previous, target);
      for (let yy = low; yy <= high; yy += 1) {
        brailleSet(canvas, x, yy, color);
      }

      previous = target;
    }
  }

  return brailleToLines(canvas, accent);
}

function buildRippleTank(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const canvas = createBraille(width, height);
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const dotsWide = width * 2;
  const dotsHigh = height * 4;
  const sources = [
    {x: dotsWide * 0.32 + Math.sin(pulse * 0.03) * dotsWide * 0.05, y: dotsHigh * 0.4},
    {x: dotsWide * 0.68 + Math.cos(pulse * 0.025) * dotsWide * 0.05, y: dotsHigh * 0.62}
  ];

  for (let y = 0; y < dotsHigh; y += 1) {
    for (let x = 0; x < dotsWide; x += 1) {
      let value = 0;
      for (const source of sources) {
        const distance = Math.sqrt((x - source.x) ** 2 + (y - source.y) ** 2);
        value += Math.cos(distance * 0.5 - pulse * 0.35);
      }

      const normalized = (value + 2) / 4;
      if (normalized > 0.85) {
        const colorIndex = Math.min(ramp.length - 1, 1 + Math.round(normalized * (ramp.length - 2)));
        brailleSet(canvas, x, y, ramp[colorIndex] ?? accent);
      }
    }
  }

  return brailleToLines(canvas, accent);
}

function buildPhyllotaxis(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const canvas = createBraille(width, height);
  const accent = themeAccent(theme);
  const palette = ['#6ee7f2', '#8df084', '#ffd166', '#ff5f87', '#c06cff', '#66a3ff'];
  const dotsWide = width * 2;
  const dotsHigh = height * 4;
  const cx = (dotsWide - 1) / 2;
  const cy = (dotsHigh - 1) / 2;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const count = Math.min(540, Math.floor((dotsWide * dotsHigh) / 6));
  const scale = (Math.min(dotsWide, dotsHigh) * 0.46) / Math.sqrt(Math.max(1, count));
  const breath = 0.88 + 0.12 * Math.sin(pulse * 0.12);

  for (let n = 0; n < count; n += 1) {
    const angle = n * goldenAngle + pulse * 0.03;
    const radius = scale * Math.sqrt(n) * breath;
    const frac = n / count;
    const color = theme === 'mono' ? motionColorAt(frac, theme) : palette[Math.floor(frac * palette.length) % palette.length] ?? accent;
    brailleSet(canvas, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, color);
  }

  return brailleToLines(canvas, accent);
}

function buildHarmonograph(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const canvas = createBraille(width, height);
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const dotsWide = width * 2;
  const dotsHigh = height * 4;
  const cx = (dotsWide - 1) / 2;
  const cy = (dotsHigh - 1) / 2;
  const ax = dotsWide * 0.44;
  const ay = dotsHigh * 0.44;
  const f1 = 2 + 0.3 * Math.sin(pulse * 0.01);
  const f2 = 3 + 0.3 * Math.cos(pulse * 0.012);
  const phase = pulse * 0.02;
  const samples = 900;

  for (let s = 0; s < samples; s += 1) {
    const t = s * 0.05;
    const decay = Math.exp(-t * 0.022);
    const x = cx + ax * decay * Math.sin(f1 * t + phase);
    const y = cy + ay * decay * Math.sin(f2 * t + phase * 1.3);
    const frac = s / samples;
    const colorIndex = Math.min(ramp.length - 1, 1 + Math.round((1 - frac) * (ramp.length - 2)));
    brailleSet(canvas, x, y, ramp[colorIndex] ?? accent);
  }

  return brailleToLines(canvas, accent);
}

function buildMoire(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#05060c');
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  // Panel-centered foci (char aspect ~2:1); gentle orbit stays symmetric about mid
  const midX = (width - 1) / 2;
  const midY = (height - 1) / 2;
  const separation = Math.min(width, height * 2) * 0.14;
  const drift = Math.sin(pulse * 0.02) * separation * 0.35;
  const centerA = {x: midX - separation + drift, y: midY + Math.cos(pulse * 0.018) * height * 0.04};
  const centerB = {x: midX + separation - drift, y: midY - Math.sin(pulse * 0.016) * height * 0.04};
  const shades = [' ', '·', '░', '▒', '▓', '█'];
  const aspect = 2.05; // horizontal compress so rings read as circles

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const da = Math.sqrt(((x - centerA.x) / aspect) ** 2 + (y - centerA.y) ** 2);
      const db = Math.sqrt(((x - centerB.x) / aspect) ** 2 + (y - centerB.y) ** 2);
      const value = Math.sin(da * 1.1 - pulse * 0.1) * Math.sin(db * 1.1 + pulse * 0.08);
      const normalized = (value + 1) / 2;
      const shadeIndex = Math.min(shades.length - 1, Math.floor(normalized * shades.length));
      if (shadeIndex > 0) {
        const colorIndex = Math.min(ramp.length - 1, Math.max(1, Math.round(normalized * (ramp.length - 1))));
        paintCell(grid, x, y, shades[shadeIndex] ?? '·', ramp[colorIndex] ?? accent);
      }
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildGalaxy(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const canvas = createBraille(width, height);
  const accent = themeAccent(theme);
  const armPalette =
    theme === 'mono'
      ? ['#666666', '#888888', '#aaaaaa', '#cccccc', '#ffffff']
      : ['#6a8cff', '#9ec2ff', '#c8dcff', '#ffffff', '#ffd9a8', '#ffb38a', '#e8a0ff', '#80e0ff'];
  const dustColor = theme === 'mono' ? '#333333' : '#1a1030';
  const dotsWide = width * 2;
  const dotsHigh = height * 4;
  const cx = (dotsWide - 1) / 2;
  const cy = (dotsHigh - 1) / 2;
  const arms = 4;
  const rotation = pulse * 0.022;
  const span = Math.min(dotsWide, dotsHigh) * 0.72;

  // Soft halo / bulge dust (background layer)
  const haloCount = Math.min(900, Math.floor((dotsWide * dotsHigh) / 5));
  for (let i = 0; i < haloCount; i += 1) {
    const a = hashNoise(i, 20, 0) * Math.PI * 2;
    const r = Math.pow(hashNoise(i, 21, 0), 0.55) * span * 0.55;
    if (hashNoise(i, 22, 0) > 0.45) {
      brailleSet(canvas, cx + Math.cos(a) * r * 1.15, cy + Math.sin(a) * r * 0.72, dustColor);
    }
  }

  // Spiral arms — dense multi-pass with dust lanes between
  const count = Math.min(3200, Math.floor((dotsWide * dotsHigh) / 1.6));
  for (let i = 0; i < count; i += 1) {
    const fraction = i / count;
    const radius = Math.pow(fraction, 0.85) * span;
    const arm = i % arms;
    // Logarithmic spiral + thickness jitter
    const armAngle = arm * ((Math.PI * 2) / arms);
    const spiral = radius * 0.15;
    const lane = (hashNoise(i, 1, 0) - 0.5) * (0.35 + fraction * 0.9);
    // Dust lane: thin empty strip along arm mid
    const laneAbs = Math.abs(lane);
    if (laneAbs < 0.06 && fraction > 0.15 && fraction < 0.85 && hashNoise(i, 8, 0) > 0.35) {
      continue;
    }
    const angle = armAngle + spiral + rotation + lane * 0.55;
    const x = cx + Math.cos(angle) * radius * (1 + lane * 0.08);
    const y = cy + Math.sin(angle) * radius * 0.62 * (1 + lane * 0.05);

    const brightness = fraction < 0.1 ? 1 : Math.pow(1 - fraction, 0.7);
    // HII regions / star clusters denser mid-arm
    const cluster = hashNoise(i, 5, 0) > 0.92 && fraction > 0.2 && fraction < 0.7;
    if (hashNoise(i, 7, 0) > 0.35 + brightness * 0.5 && !cluster) {
      continue;
    }

    let color: string;
    if (fraction < 0.08 || cluster) {
      color = '#ffffff';
    } else if (theme === 'mono') {
      color = motionColorAt(1 - fraction, theme);
    } else {
      const pi = Math.min(
        armPalette.length - 1,
        Math.floor((arm / arms + hashNoise(i, 3, 0) * 0.4 + fraction * 0.3) * armPalette.length) % armPalette.length
      );
      color = armPalette[pi] ?? accent;
    }
    brailleSet(canvas, x, y, color);
    // Cluster clumps
    if (cluster) {
      for (let k = 0; k < 5; k += 1) {
        brailleSet(
          canvas,
          x + (hashNoise(i, k, 1) - 0.5) * 2.5,
          y + (hashNoise(i, k, 2) - 0.5) * 2.5,
          k === 0 ? '#ffffff' : armPalette[2] ?? accent
        );
      }
    }
  }

  // Central bar
  const barLen = span * 0.18;
  for (let t = -barLen; t <= barLen; t += 0.55) {
    const bx = cx + Math.cos(rotation) * t;
    const by = cy + Math.sin(rotation) * t * 0.55;
    for (let w = -1.2; w <= 1.2; w += 0.5) {
      brailleSet(
        canvas,
        bx + Math.cos(rotation + Math.PI / 2) * w,
        by + Math.sin(rotation + Math.PI / 2) * w * 0.55,
        t * t < barLen * barLen * 0.15 ? '#ffffff' : armPalette[1] ?? accent
      );
    }
  }

  // Bright core + accretion glow
  const coreRadius = Math.min(dotsWide, dotsHigh) * 0.09;
  for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
    for (let r = 0; r < coreRadius; r += 0.45) {
      const fall = 1 - r / coreRadius;
      if (fall < 0.15 && hashNoise(Math.floor(angle * 10), Math.floor(r * 4), 0) < 0.4) {
        continue;
      }
      brailleSet(
        canvas,
        cx + Math.cos(angle) * r,
        cy + Math.sin(angle) * r * 0.7,
        fall > 0.55 ? '#ffffff' : armPalette[0] ?? accent
      );
    }
  }

  // Sparse foreground stars
  for (let s = 0; s < 40; s += 1) {
    const sx = hashNoise(s, 30, 0) * dotsWide;
    const sy = hashNoise(s, 31, 0) * dotsHigh;
    brailleSet(canvas, sx, sy, '#ffffff');
  }

  return brailleToLines(canvas, accent);
}

function buildCaustics(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#04141a');
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x / width) * 6;
      const ny = (y / height) * 6;
      const field =
        Math.sin(nx + pulse * 0.06) +
        Math.sin(ny * 1.3 - pulse * 0.05) +
        Math.sin((nx + ny) * 0.9 + pulse * 0.04) +
        Math.sin((nx - ny) * 1.1 - pulse * 0.045);
      const ridged = 1 - Math.abs(field) / 4;
      const value = Math.pow(clampNumber(ridged, 0, 1), 3);
      let glyph = ' ';
      if (value > 0.86) {
        glyph = '█';
      } else if (value > 0.72) {
        glyph = '▓';
      } else if (value > 0.58) {
        glyph = '▒';
      } else if (value > 0.45) {
        glyph = '░';
      } else if (value > 0.33) {
        glyph = '·';
      }

      if (glyph !== ' ') {
        const colorIndex = Math.min(ramp.length - 1, Math.max(1, Math.round(value * (ramp.length - 1))));
        paintCell(grid, x, y, glyph, value > 0.86 ? '#dffaff' : ramp[colorIndex] ?? accent);
      }
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildLorenz(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const canvas = createBraille(width, height);
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const dotsWide = width * 2;
  const dotsHigh = height * 4;
  const cx = (dotsWide - 1) / 2;
  const cy = (dotsHigh - 1) / 2;
  const steps = 1500;
  const dt = 0.009;
  const sigma = 10;
  const rho = 28;
  const beta = 8 / 3;
  const points: Array<[number, number, number]> = [];
  let x = 0.1;
  let y = 0;
  let z = 0;

  for (let i = 0; i < steps; i += 1) {
    x += sigma * (y - x) * dt;
    y += (x * (rho - z) - y) * dt;
    z += (x * y - beta * z) * dt;
    points.push([x, y, z]);
  }

  const angle = pulse * 0.02;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const scaleX = (dotsWide * 0.42) / 26;
  const scaleZ = (dotsHigh * 0.46) / 26;
  const head = Math.floor(pulse * 6) % steps;

  for (let i = 0; i < steps; i += 1) {
    const point = points[i]!;
    const rx = point[0] * cos - point[1] * sin;
    const sx = cx + rx * scaleX;
    const sy = cy - (point[2] - 25) * scaleZ;
    const distance = (i - head + steps) % steps;
    const depth = clampNumber((point[2] - 5) / 40, 0, 1);
    const color = distance < 45 ? '#ffffff' : ramp[Math.min(ramp.length - 1, 1 + Math.round(depth * (ramp.length - 2)))] ?? accent;
    brailleSet(canvas, sx, sy, color);
  }

  return brailleToLines(canvas, accent);
}

function buildFern(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const canvas = createBraille(width, height);
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const dotsWide = width * 2;
  const dotsHigh = height * 4;
  const total = 5000;
  const grow = Math.min(total, 600 + Math.floor((pulse * 30) % (total + 1200)));
  const sway = Math.sin(pulse * 0.05) * 0.04;
  const maxY = 9.9983;
  const midX = 0.2369;
  const scale = (dotsHigh * 0.97) / maxY;
  const cx = (dotsWide - 1) / 2;
  let seed = 987654321 >>> 0;
  let x = 0;
  let y = 0;

  for (let i = 0; i < grow; i += 1) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    const r = (seed & 0x7fffffff) / 0x7fffffff;
    let nx: number;
    let ny: number;
    if (r < 0.01) {
      nx = 0;
      ny = 0.16 * y;
    } else if (r < 0.86) {
      nx = 0.85 * x + 0.04 * y;
      ny = -0.04 * x + 0.85 * y + 1.6;
    } else if (r < 0.93) {
      nx = 0.2 * x - 0.26 * y;
      ny = 0.23 * x + 0.22 * y + 1.6;
    } else {
      nx = -0.15 * x + 0.28 * y;
      ny = 0.26 * x + 0.24 * y + 0.44;
    }

    x = nx;
    y = ny;
    if (i < 30) {
      continue;
    }

    const swayed = x + sway * y;
    const px = cx + (swayed - midX) * scale;
    const py = dotsHigh - y * scale;
    const color = ramp[Math.min(ramp.length - 1, 1 + Math.round((y / maxY) * (ramp.length - 2)))] ?? accent;
    brailleSet(canvas, px, py, color);
  }

  return brailleToLines(canvas, accent);
}

function buildChladni(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const canvas = createBraille(width, height);
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const dotsWide = width * 2;
  const dotsHigh = height * 4;
  const n = 3 + 2 * Math.sin(pulse * 0.02);
  const m = 4 + 2 * Math.cos(pulse * 0.017);

  for (let yy = 0; yy < dotsHigh; yy += 1) {
    const v = yy / Math.max(1, dotsHigh - 1);
    for (let xx = 0; xx < dotsWide; xx += 1) {
      const u = xx / Math.max(1, dotsWide - 1);
      const z =
        Math.cos(n * Math.PI * u) * Math.cos(m * Math.PI * v) -
        Math.cos(m * Math.PI * u) * Math.cos(n * Math.PI * v);
      if (Math.abs(z) < 0.05) {
        brailleSet(canvas, xx, yy, ramp[Math.min(ramp.length - 1, 2 + Math.floor(v * (ramp.length - 2)))] ?? accent);
      }
    }
  }

  return brailleToLines(canvas, accent);
}

function buildTesseract(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const canvas = createBraille(width, height);
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const dotsWide = width * 2;
  const dotsHigh = height * 4;
  const cx = (dotsWide - 1) / 2;
  const cy = (dotsHigh - 1) / 2;
  const angleA = pulse * 0.025;
  const angleB = pulse * 0.017;
  const scale = Math.min(dotsWide, dotsHigh) * 0.26;

  const projected = Array.from({length: 16}, (_, i) => {
    let x = i & 1 ? 1 : -1;
    let y = i & 2 ? 1 : -1;
    let z = i & 4 ? 1 : -1;
    let w = i & 8 ? 1 : -1;
    const xw = x * Math.cos(angleA) - w * Math.sin(angleA);
    w = x * Math.sin(angleA) + w * Math.cos(angleA);
    x = xw;
    const yz = y * Math.cos(angleB) - z * Math.sin(angleB);
    z = y * Math.sin(angleB) + z * Math.cos(angleB);
    y = yz;
    const w4 = 2.2 / (2.2 - w);
    const x3 = x * w4;
    const y3 = y * w4;
    const z3 = z * w4;
    const persp = 2.6 / (2.6 - z3);
    return {x: x3 * persp, y: y3 * persp, z: z3};
  });

  for (let i = 0; i < 16; i += 1) {
    for (let j = i + 1; j < 16; j += 1) {
      const diff = i ^ j;
      if ((diff & (diff - 1)) === 0) {
        const a = projected[i]!;
        const b = projected[j]!;
        const depth = clampNumber((a.z + 1.6) / 3.2, 0, 1);
        const color = ramp[Math.min(ramp.length - 1, 1 + Math.round(depth * (ramp.length - 2)))] ?? accent;
        drawBrailleLine(canvas, cx + a.x * scale, cy + a.y * scale, cx + b.x * scale, cy + b.y * scale, color);
      }
    }
  }

  return brailleToLines(canvas, accent);
}

function buildTorusKnot(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const canvas = createBraille(width, height);
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const dotsWide = width * 2;
  const dotsHigh = height * 4;
  const cx = (dotsWide - 1) / 2;
  const cy = (dotsHigh - 1) / 2;
  const p = 2;
  const q = 3;
  const tilt = 0.6 + 0.3 * Math.sin(pulse * 0.01);
  const spin = pulse * 0.02;
  const scale = Math.min(dotsWide, dotsHigh) * 0.17;
  const samples = 1400;
  let previous: {x: number; y: number} | null = null;

  for (let i = 0; i <= samples; i += 1) {
    const theta = (i / samples) * Math.PI * 2;
    const r = Math.cos(q * theta) + 2;
    let x = r * Math.cos(p * theta);
    let y = r * Math.sin(p * theta);
    let z = -Math.sin(q * theta);
    const xs = x * Math.cos(spin) + z * Math.sin(spin);
    z = -x * Math.sin(spin) + z * Math.cos(spin);
    x = xs;
    const ys = y * Math.cos(tilt) - z * Math.sin(tilt);
    z = y * Math.sin(tilt) + z * Math.cos(tilt);
    y = ys;
    const persp = 3.2 / (3.2 - z);
    const sx = cx + x * scale * persp;
    const sy = cy + y * scale * persp;
    const color = ramp[Math.min(ramp.length - 1, 1 + Math.round(clampNumber((z + 3) / 6, 0, 1) * (ramp.length - 2)))] ?? accent;
    if (previous) {
      drawBrailleLine(canvas, previous.x, previous.y, sx, sy, color);
    }

    previous = {x: sx, y: sy};
  }

  return brailleToLines(canvas, accent);
}

function buildRotozoomer(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#05060c');
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const angle = pulse * 0.03;
  const zoom = 0.5 + 0.35 * Math.sin(pulse * 0.02);
  const cos = Math.cos(angle) * zoom;
  const sin = Math.sin(angle) * zoom;
  const shades = ['·', '░', '▒', '▓', '█'];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - cx;
      const dy = (y - cy) * 2;
      const u = dx * cos - dy * sin;
      const v = dx * sin + dy * cos;
      const texture = Math.sin(u * 0.4) * Math.sin(v * 0.4);
      const normalized = (texture + 1) / 2;
      const shadeIndex = Math.min(shades.length - 1, Math.floor(normalized * shades.length));
      const colorIndex = Math.min(ramp.length - 1, Math.max(1, Math.round(normalized * (ramp.length - 1))));
      paintCell(grid, x, y, shades[shadeIndex] ?? '·', ramp[colorIndex] ?? accent);
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildFractalTree(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const canvas = createBraille(width, height);
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const dotsWide = width * 2;
  const dotsHigh = height * 4;
  const wind = Math.sin(pulse * 0.05) * 0.12;
  const maxDepth = 9;

  const branch = (x: number, y: number, angle: number, length: number, depth: number): void => {
    if (depth > maxDepth || length < 1) {
      return;
    }

    const nx = x + Math.cos(angle) * length;
    const ny = y - Math.sin(angle) * length;
    const color = ramp[Math.min(ramp.length - 1, 1 + Math.round((depth / maxDepth) * (ramp.length - 2)))] ?? accent;
    drawBrailleLine(canvas, x, y, nx, ny, color);

    const spread = 0.4 + 0.08 * Math.sin(pulse * 0.04 + depth);
    branch(nx, ny, angle + spread + wind, length * 0.72, depth + 1);
    branch(nx, ny, angle - spread + wind * 0.6, length * 0.72, depth + 1);
    if (depth % 2 === 0) {
      branch(nx, ny, angle + wind * 1.4, length * 0.6, depth + 2);
    }
  };

  branch(dotsWide / 2, dotsHigh - 1, Math.PI / 2, dotsHigh * 0.26, 0);
  return brailleToLines(canvas, accent);
}

function buildJulia(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#05060c');
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const shades = [' ', '·', '░', '▒', '▓', '█'];
  const cRe = 0.7885 * Math.cos(pulse * 0.02);
  const cIm = 0.7885 * Math.sin(pulse * 0.02);
  const maxIter = 42;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let zx = (x / Math.max(1, width - 1) - 0.5) * 3.0;
      let zy = (y / Math.max(1, height - 1) - 0.5) * 3.0;
      let iter = 0;
      for (; iter < maxIter; iter += 1) {
        const xt = zx * zx - zy * zy + cRe;
        zy = 2 * zx * zy + cIm;
        zx = xt;
        if (zx * zx + zy * zy > 4) {
          break;
        }
      }

      if (iter === maxIter) {
        paintCell(grid, x, y, '█', accent);
        continue;
      }

      const t = Math.pow(iter / maxIter, 0.5);
      const shadeIndex = Math.min(shades.length - 1, Math.floor(t * shades.length));
      if (shadeIndex === 0) {
        continue;
      }

      const colorIndex = Math.min(ramp.length - 1, Math.max(1, Math.round(t * (ramp.length - 1))));
      paintCell(grid, x, y, shades[shadeIndex] ?? '·', ramp[colorIndex] ?? accent);
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildGoniometer(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const canvas = createBraille(width, height);
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const dotsWide = width * 2;
  const dotsHigh = height * 4;
  const cx = (dotsWide - 1) / 2;
  const cy = (dotsHigh - 1) / 2;
  const scale = Math.min(dotsWide, dotsHigh) * 0.44;

  const reach = scale * 0.9;
  for (let s = -reach; s <= reach; s += 1) {
    brailleSet(canvas, cx, cy + s, '#2a313c');
    brailleSet(canvas, cx + s, cy, '#2a313c');
    brailleSet(canvas, cx + s, cy + s, '#1f2630');
    brailleSet(canvas, cx + s, cy - s, '#1f2630');
  }

  const widthMod = 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(pulse * 0.04));
  const samples = 320;
  for (let i = samples; i >= 0; i -= 1) {
    const t = pulse * 0.12 + i * 0.07;
    const env = 0.6 + 0.4 * Math.sin(t * 0.5);
    const leftCh = Math.sin(t * 3) * env;
    const rightCh = Math.sin(t * 3 + Math.sin(pulse * 0.03) * widthMod * Math.PI) * env;
    const px = ((leftCh - rightCh) / Math.SQRT2) * scale;
    const py = -((leftCh + rightCh) / Math.SQRT2) * scale;
    const bright = 1 - i / samples;
    const color = i < 6 ? '#ffffff' : ramp[Math.min(ramp.length - 1, 1 + Math.round(bright * (ramp.length - 2)))] ?? accent;
    brailleSet(canvas, cx + px, cy + py, color);
  }

  return brailleToLines(canvas, accent);
}

function buildCopperBars(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#05060c');
  const accent = themeAccent(theme);
  const palette = ['#ff5f87', '#ffd166', '#53a8ff', '#8df084', '#c06cff', '#5eead4'];
  const bars = 6;

  for (let b = 0; b < bars; b += 1) {
    const center = (0.5 + 0.42 * Math.sin(pulse * 0.05 + b * 1.05)) * (height - 1);
    const halfThickness = 1.7;
    const color = theme === 'mono' ? motionColorAt(b / bars, theme) : palette[b % palette.length] ?? accent;
    for (let y = 0; y < height; y += 1) {
      const distance = Math.abs(y - center);
      if (distance <= halfThickness) {
        const shade = 1 - distance / halfThickness;
        const glyph = shade > 0.66 ? '█' : shade > 0.33 ? '▓' : '▒';
        for (let x = 0; x < width; x += 1) {
          paintCell(grid, x, y, glyph, color);
        }
      }
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildTwister(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#070a12');
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const cx = (width - 1) / 2;
  const halfWidth = Math.min(width * 0.4, 20);
  const ribbon = 1.5;

  for (let y = 0; y < height; y += 1) {
    const angle = y * 0.4 - pulse * 0.12;
    const x1 = cx + Math.cos(angle) * halfWidth;
    const x2 = cx + Math.cos(angle + ribbon) * halfWidth;
    const z1 = Math.sin(angle);
    const z2 = Math.sin(angle + ribbon);
    const lo = Math.round(Math.min(x1, x2));
    const hi = Math.round(Math.max(x1, x2));
    for (let x = lo; x <= hi; x += 1) {
      const tt = (x - x1) / ((x2 - x1) || 1);
      const z = z1 + (z2 - z1) * tt;
      const brightness = (z + 1) / 2;
      const glyph = brightness > 0.66 ? '█' : brightness > 0.33 ? '▓' : '▒';
      const colorIndex = Math.min(ramp.length - 1, 1 + Math.round(brightness * (ramp.length - 2)));
      paintCell(grid, x, y, glyph, ramp[colorIndex] ?? accent);
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildCyclone(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const canvas = createBraille(width, height);
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const dotsWide = width * 2;
  const dotsHigh = height * 4;
  const cx = (dotsWide - 1) / 2;
  const cy = (dotsHigh - 1) / 2;
  const maxR = Math.min(dotsWide, dotsHigh) * 0.52;
  const count = Math.min(260, Math.floor((dotsWide * dotsHigh) / 9));

  for (let i = 0; i < count; i += 1) {
    const phase = hashNoise(i, 1, 0) * Math.PI * 2;
    // Slightly slower spiral inhale + spin than before
    const life = ((pulse * 0.68 + i * 7.3) % 130) / 130;
    const r = maxR * (1 - life);
    const angle = phase + pulse * 0.036 + (maxR / (r + 5)) * 0.9;
    for (let trail = 0; trail < 4; trail += 1) {
      const rr = r + trail * 1.4;
      const aa = angle - trail * 0.12;
      const x = cx + Math.cos(aa) * rr;
      const y = cy + Math.sin(aa) * rr;
      const color = trail === 0 ? (r < maxR * 0.18 ? '#ffffff' : ramp[ramp.length - 1] ?? accent) : ramp[Math.min(ramp.length - 1, 1 + Math.round((1 - rr / maxR) * (ramp.length - 2)))] ?? accent;
      brailleSet(canvas, x, y, color);
    }
  }

  brailleSet(canvas, cx, cy, '#ffffff');
  return brailleToLines(canvas, accent);
}

function buildLavaLamp(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#0a0610');
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const blobs = Array.from({length: 5}, (_, b) => {
    const speed = 0.14 + ((b * 7) % 5) / 20;
    return {
      x: width * (0.5 + 0.32 * Math.sin(pulse * 0.015 * (1 + b * 0.2) + b)),
      y: height + (b * height) / 5 - ((pulse * speed) % (height + 6)),
      r: 2.2 + 1.3 * Math.sin(pulse * 0.02 + b * 1.7) + (b % 2 ? 0.8 : 0)
    };
  });

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let field = 0;
      for (const blob of blobs) {
        const dx = (x - blob.x) * 0.5;
        const dy = y - blob.y;
        field += (blob.r * blob.r) / (dx * dx + dy * dy + 0.6);
      }

      const glyph = field > 2 ? '█' : field > 1.4 ? '▓' : field > 1 ? '▒' : field > 0.7 ? '░' : ' ';
      if (glyph !== ' ') {
        const colorIndex = Math.min(ramp.length - 1, Math.max(1, Math.round(clampNumber(field / 2.4, 0, 1) * (ramp.length - 1))));
        paintCell(grid, x, y, glyph, ramp[colorIndex] ?? accent);
      }
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildNewton(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#05060c');
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const shades = [' ', '·', '░', '▒', '▓', '█'];
  const roots = [
    {x: 1, y: 0, color: ramp[2] ?? accent},
    {x: -0.5, y: Math.sqrt(3) / 2, color: ramp[4] ?? accent},
    {x: -0.5, y: -Math.sqrt(3) / 2, color: accent}
  ];
  const zoom = 1.7 + 0.4 * Math.sin(pulse * 0.02);
  const rot = pulse * 0.012;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);
  const maxIter = 22;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = (x / Math.max(1, width - 1) - 0.5) * 2 * zoom;
      const py = (y / Math.max(1, height - 1) - 0.5) * 2 * zoom;
      let zx = px * cosR - py * sinR;
      let zy = px * sinR + py * cosR;
      let iter = 0;
      for (; iter < maxIter; iter += 1) {
        const r2 = zx * zx + zy * zy;
        if (r2 < 1e-6) {
          break;
        }

        const denom = 3 * ((zx * zx - zy * zy) * (zx * zx - zy * zy) + (2 * zx * zy) * (2 * zx * zy));
        const ax = zx * zx - zy * zy;
        const ay = 2 * zx * zy;
        const numX = (ax * zx - ay * zy) - 1;
        const numY = ax * zy + ay * zx;
        zx = zx - (numX * ax + numY * ay) / (denom || 1e-6);
        zy = zy - (numY * ax - numX * ay) / (denom || 1e-6);
        let done = false;
        for (const root of roots) {
          if ((zx - root.x) ** 2 + (zy - root.y) ** 2 < 0.01) {
            done = true;
            break;
          }
        }
        if (done) {
          break;
        }
      }

      let chosen = roots[0]!;
      let best = Infinity;
      for (const root of roots) {
        const dist = (zx - root.x) ** 2 + (zy - root.y) ** 2;
        if (dist < best) {
          best = dist;
          chosen = root;
        }
      }

      const t = 1 - iter / maxIter;
      const shadeIndex = Math.min(shades.length - 1, 1 + Math.floor(t * (shades.length - 1)));
      paintCell(grid, x, y, shades[shadeIndex] ?? '·', chosen.color);
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildAurora(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  // Northern-lights palette: deep night → teal → green → violet → white fringe
  const night = theme === 'mono' ? '#0a0a0a' : '#040814';
  const ramp =
    theme === 'mono'
      ? ['#0e0e12', '#1a1a24', '#2e2e3a', '#4a4a5a', '#787888', '#a8a8b8', '#d0d0dc', '#ffffff']
      : ['#061018', '#0a2a28', '#0d4a3c', '#128a5a', '#2ecf7a', '#7dffb0', '#a8ffe0', '#c8b0ff', '#e8f0ff'];
  const glyphs = [' ', '·', '┊', '│', '║', '░', '▒', '▓', '█'];
  const curtains = 6;

  return Array.from({length: height}, (_, y) => {
    const ny = y / Math.max(1, height - 1);
    const cells: VisualCell[] = Array.from({length: width}, (_, x) => {
      const nx = x / Math.max(1, width - 1);
      let field = 0;
      let filament = 0;

      for (let c = 0; c < curtains; c += 1) {
        // Curtain folds drift slowly; each sheet has different phase & width
        const fold =
          0.08 +
          c * 0.15 +
          0.06 * Math.sin(pulse * 0.035 + c * 1.9) +
          0.03 * Math.sin(y * 0.28 + pulse * 0.05 + c) +
          0.02 * Math.sin(y * 0.55 - pulse * 0.04 + c * 0.7);
        const halfWidth = 0.045 + 0.02 * Math.sin(pulse * 0.03 + c) + 0.015 * Math.sin(y * 0.4 + c);
        const dist = Math.abs(nx - fold);
        // Soft body of the curtain (filled, not holey)
        const body = Math.exp(-Math.pow(dist / halfWidth, 2));
        // Vertical brightness: bright mid-band, dimmer top & bottom edge
        const vertical =
          0.35 +
          0.65 * Math.sin(Math.PI * clampNumber(ny * 1.15 - 0.05, 0, 1)) *
            (0.7 + 0.3 * Math.sin(pulse * 0.06 + c * 1.1 + y * 0.15));
        field += body * vertical * (0.85 + 0.15 * Math.sin(pulse * 0.08 + c));

        // Fine vertical filaments inside the curtain
        if (body > 0.15) {
          const micro = Math.sin(x * (2.8 + c * 0.4) + pulse * 0.25 + y * 0.1);
          filament += body * Math.max(0, micro) * 0.35;
        }
      }

      // Background night sky stars
      const star = hashNoise(x, y, 3) > 0.992 ? 0.55 : 0;
      // Horizontal shimmer bands
      const shimmer = 0.08 * Math.sin(x * 0.55 + pulse * 0.18 + y * 0.08);
      const intensity = clampNumber(field * 0.7 + filament + shimmer + star * 0.3, 0, 1);

      // Always paint night background so there are no "holes"
      if (intensity < 0.06) {
        const starGlyph = star > 0 ? '·' : ' ';
        return {
          text: starGlyph,
          color: star > 0 ? '#8899aa' : accent,
          backgroundColor: night
        };
      }

      const level = Math.min(ramp.length - 1, Math.floor(intensity * (ramp.length - 0.01)));
      const gi = Math.min(glyphs.length - 1, Math.floor(intensity * glyphs.length));
      // Prefer vertical glyphs for curtain fibers, blocks for dense cores
      let glyph = glyphs[gi] ?? '█';
      if (intensity > 0.25 && intensity < 0.7 && filament > 0.12) {
        glyph = intensity > 0.5 ? '║' : '│';
      }
      if (star > 0 && intensity < 0.35) {
        glyph = '✦';
      }

      return {
        text: glyph,
        color: intensity > 0.82 ? '#ffffff' : ramp[Math.min(ramp.length - 1, level + 1)] ?? accent,
        backgroundColor: ramp[level] ?? night,
        bold: intensity > 0.75
      };
    });

    return lineFromCells(cells, accent);
  });
}

function buildXorTexture(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#05060c');
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const angle = pulse * 0.04;
  const zoom = 0.55 + 0.2 * Math.sin(pulse * 0.02);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const shades = [' ', '·', '░', '▒', '▓', '█'];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - cx) * zoom;
      const dy = (y - cy) * 2 * zoom;
      const u = Math.floor(dx * cos - dy * sin + pulse * 0.4);
      const v = Math.floor(dx * sin + dy * cos - pulse * 0.25);
      const xor = (u ^ v) & 255;
      const normalized = xor / 255;
      const shadeIndex = Math.min(shades.length - 1, Math.floor(normalized * shades.length));
      if (shadeIndex === 0) {
        continue;
      }

      const colorIndex = Math.min(ramp.length - 1, 1 + Math.round(normalized * (ramp.length - 2)));
      paintCell(grid, x, y, shades[shadeIndex] ?? '·', ramp[colorIndex] ?? accent);
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildHexPulse(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#05060c');
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const size = Math.max(1.4, Math.min(2.4, Math.min(width * 0.55, height) / 3));
  const shades = ['·', '░', '▒', '▓', '█'];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = (x - cx) * 0.55;
      const py = y - cy;
      const q = ((Math.sqrt(3) / 3) * px - (1 / 3) * py) / size;
      const r = ((2 / 3) * py) / size;
      const s = -q - r;
      const iq = Math.round(q);
      const ir = Math.round(r);
      const is = Math.round(s);
      const qDiff = Math.abs(iq - q);
      const rDiff = Math.abs(ir - r);
      const sDiff = Math.abs(is - s);
      let hq = iq;
      let hr = ir;
      if (qDiff > rDiff && qDiff > sDiff) {
        hq = -ir - is;
      } else if (rDiff > sDiff) {
        hr = -iq - is;
      }

      const dist = Math.sqrt(hq * hq + hr * hr + hq * hr);
      const edgeQ = Math.abs(q - hq);
      const edgeR = Math.abs(r - hr);
      const edge = Math.max(edgeQ, edgeR, Math.abs((-q - r) - (-hq - hr)));
      const wave = (Math.sin(dist * 1.1 - pulse * 0.12) + 1) / 2;
      const border = edge > 0.3 ? 1 : 0.28;
      const intensity = (0.28 + wave * 0.72) * border * (0.48 + 0.52 * (1 - Math.min(1, dist / 8)));
      if (intensity < 0.1) {
        continue;
      }

      const shadeIndex = Math.min(shades.length - 1, Math.floor(intensity * shades.length));
      const colorIndex = Math.min(ramp.length - 1, 1 + Math.round(wave * (ramp.length - 2)));
      paintCell(grid, x, y, shades[shadeIndex] ?? '·', ramp[colorIndex] ?? accent);
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildSpirograph(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const canvas = createBraille(width, height);
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const dotsWide = width * 2;
  const dotsHigh = height * 4;
  const cx = (dotsWide - 1) / 2;
  const cy = (dotsHigh - 1) / 2;
  const scale = Math.min(dotsWide, dotsHigh) * 0.36;
  const k = 0.42 + 0.08 * Math.sin(pulse * 0.01);
  const l = 0.68 + 0.12 * Math.cos(pulse * 0.015);
  const rot = pulse * 0.02;
  const steps = Math.min(1400, Math.floor(dotsWide * dotsHigh * 0.35));
  const drawTo = Math.floor(steps * (0.55 + 0.45 * ((Math.sin(pulse * 0.03) + 1) / 2)));

  let prevX = cx;
  let prevY = cy;
  for (let i = 0; i <= drawTo; i += 1) {
    const t = (i / steps) * Math.PI * 2 * 11 + rot;
    const x = cx + scale * ((1 - k) * Math.cos(t) + l * k * Math.cos(((1 - k) / k) * t));
    const y = cy + scale * ((1 - k) * Math.sin(t) - l * k * Math.sin(((1 - k) / k) * t));
    const colorIndex = Math.min(ramp.length - 1, 1 + Math.round((i / Math.max(1, drawTo)) * (ramp.length - 2)));
    const color = ramp[colorIndex] ?? accent;
    if (i > 0) {
      drawBrailleLine(canvas, prevX, prevY, x, y, color);
    }
    prevX = x;
    prevY = y;
  }

  return brailleToLines(canvas, accent);
}

function blitAsciiSprite(
  grid: VisualCell[][],
  sprite: readonly string[],
  originX: number,
  originY: number,
  color: string
): void {
  for (let row = 0; row < sprite.length; row += 1) {
    const line = sprite[row] ?? '';
    for (let col = 0; col < line.length; col += 1) {
      const ch = line[col]!;
      if (ch === ' ') {
        continue;
      }
      paintCell(grid, originX + col, originY + row, ch, color);
    }
  }
}

/**
 * One-shot launch with camera follow: rocket stays in frame; world scrolls past.
 * Pulse resets on Now Playing re-entry and resumes from the frozen pause frame.
 */
function buildLiftoff(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#03040c');
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const rocket = [
    '    /\\',
    '   /██\\',
    '   |██|',
    '   |▓▓|',
    '   |██|',
    '  /|  |\\',
    ' /_|██|_\\',
    '/__|__|__\\'
  ];

  const padHold = 18;
  const ignition = Math.max(0, pulse - padHold);
  // 0 = still on pad, 1 = camera locked on rocket in cruise — slower climb
  const liftT = clampNumber(ignition / 48, 0, 1);
  const ease = liftT * liftT * (3 - 2 * liftT); // smoothstep

  // Rocket stays in frame: rises from pad to a fixed cruise position, then holds
  const padBottom = height - 1;
  const cruiseBottom = Math.min(height - 1, Math.max(rocket.length - 1, Math.floor(height * 0.4)));
  const rocketBottom = Math.floor(padBottom + (cruiseBottom - padBottom) * ease);
  const bodyX = Math.floor(width / 2) - 4;
  const engineX = bodyX + 4;
  const offPad = liftT > 0.08;
  const highAltitude = liftT > 0.55;
  const deepSpace = liftT > 0.85;

  // Stars / atmosphere scroll downward as we climb (camera rides with rocket)
  // Keep parallax gentle so scenery doesn't whip past
  const scrollSpeed = 0.08 + ease * 1.35 + Math.max(0, ignition - 48) * 0.018;
  for (let s = 0; s < Math.floor((width * height) / 7); s += 1) {
    const sx = Math.floor(hashNoise(s, 1, 0) * width);
    const baseY = hashNoise(s, 2, 0) * height * 4;
    const sy = Math.floor((baseY + ignition * scrollSpeed * (0.5 + hashNoise(s, 3, 0))) % height);
    const bright = hashNoise(s, 4, 0);
    if (offPad && bright > 0.5) {
      const len = 1 + Math.min(7, Math.floor(scrollSpeed * bright * 1.2));
      for (let k = 0; k < len; k += 1) {
        paintCell(
          grid,
          sx,
          (sy + k) % height,
          k === 0 ? (bright > 0.9 ? '┃' : '|') : '┊',
          bright > 0.9 ? '#ffffff' : ramp[1] ?? accent
        );
      }
    } else {
      paintCell(grid, sx, sy, bright > 0.85 ? '+' : '·', bright > 0.85 ? '#ffffff' : ramp[1] ?? accent);
    }
  }

  // Distant planets drift past once we're high
  if (deepSpace) {
    for (let p = 0; p < 3; p += 1) {
      const planetX = Math.floor(width * (0.15 + p * 0.32) + Math.sin(pulse * 0.015 + p) * 2);
      const planetY = Math.floor(
        ((hashNoise(p, 8, 0) * height * 2 + ignition * scrollSpeed * 0.15) % (height + 8)) - 4
      );
      const pr = 1 + (p % 2);
      for (let dy = -pr; dy <= pr; dy += 1) {
        for (let dx = -pr * 2; dx <= pr * 2; dx += 1) {
          if ((dx / 2) * (dx / 2) + dy * dy <= pr * pr + 0.2) {
            const col =
              theme === 'mono'
                ? '#888888'
                : (['#6a8ab0', '#c08060', '#80b080'] as const)[p % 3]!;
            paintCell(grid, planetX + dx, planetY + dy, '█', col);
          }
        }
      }
    }
  }

  // Ground / pad scroll down and off-screen as camera climbs with the rocket
  const groundY = Math.floor(height - 1 + ease * (height + 6));
  if (groundY < height && groundY >= 0) {
    for (let x = 0; x < width; x += 1) {
      const pad = Math.abs(x - engineX) < width * 0.22;
      paintCell(grid, x, groundY, pad ? '▀' : '▁', pad ? '#888899' : '#333344');
    }
    if (!offPad || liftT < 0.35) {
      const towerX = bodyX - 3;
      for (let ty = Math.max(0, rocketBottom - 6); ty < groundY; ty += 1) {
        paintCell(grid, towerX, ty, '║', '#667788');
        if (ty % 2 === 0) {
          paintCell(grid, towerX + 1, ty, '═', '#556677');
        }
      }
    }
  }

  // Ground blast during ignition
  if (liftT < 0.4 && groundY < height && groundY >= height - 10) {
    const blast = 1 - liftT / 0.4;
    const smokeColors =
      theme === 'mono' ? ['#444444', '#777777', '#aaaaaa'] : ['#4a4038', '#8a7a68', '#c8b8a0', '#eee8dc'];
    for (let sy = groundY; sy >= Math.max(0, groundY - Math.floor(7 * blast)); sy -= 1) {
      const rise = groundY - sy;
      const spread = Math.floor(3 + rise * 2.4 * blast + Math.sin(pulse * 0.5 + rise) * 2);
      for (let dx = -spread; dx <= spread; dx += 1) {
        if (hashNoise(dx + 50, sy, Math.floor(pulse * 2)) < 0.32) {
          continue;
        }
        const t = 1 - Math.abs(dx) / Math.max(1, spread);
        const gi = Math.min(3, Math.floor(t * blast * 4));
        paintCell(grid, engineX + dx, sy, ['░', '▒', '▓', '█'][gi] ?? '░', smokeColors[Math.min(smokeColors.length - 1, gi)] ?? accent);
      }
    }
  }

  // Exhaust plume always under the rocket (in frame)
  const flameColors =
    theme === 'mono'
      ? ['#555555', '#888888', '#bbbbbb', '#ffffff']
      : ['#5a1a08', '#ff3a10', '#ff8a14', '#ffd040', '#ffffff'];
  const plumeLen = Math.min(height - rocketBottom, 5 + Math.floor(3 + Math.sin(pulse * 0.9) * 2) + (highAltitude ? 1 : 3));
  for (let f = 0; f < plumeLen; f += 1) {
    const along = f / Math.max(1, plumeLen - 1);
    const billow = along < 0.35 ? along * 2.5 : 0.9 + Math.sin(along * 4 + pulse) * 0.15;
    const spread = Math.max(
      1,
      Math.floor((1.2 + billow * 3.2 + Math.sin(pulse * 1.1 + f) * 1.1) * (highAltitude ? 0.7 : 1))
    );
    for (let dx = -spread; dx <= spread; dx += 1) {
      const edge = Math.abs(dx) / Math.max(1, spread);
      const flicker = hashNoise(dx + 30, f, Math.floor(pulse * 3));
      if (flicker < edge * 0.35) {
        continue;
      }
      const heat = clampNumber((1 - edge) * (1 - along * 0.55) * (0.7 + flicker * 0.3), 0, 1);
      const glyph = heat > 0.75 ? '█' : heat > 0.5 ? '▓' : heat > 0.3 ? '▒' : '░';
      const ci = Math.min(flameColors.length - 1, Math.floor(heat * flameColors.length));
      const color =
        along > 0.55 && edge > 0.45
          ? theme === 'mono'
            ? '#666666'
            : '#8a7060'
          : flameColors[ci] ?? accent;
      const px = engineX + dx + Math.floor(Math.sin(pulse * 0.7 + f * 0.4) * (along * 1.5));
      const py = rocketBottom + f;
      if (py >= 0 && py < height) {
        paintCell(grid, px, py, glyph, color);
      }
    }
  }

  if (offPad && !highAltitude) {
    for (let d = 1; d <= 4; d += 1) {
      const dy = rocketBottom + d * 2;
      if (dy >= 0 && dy < height) {
        paintCell(grid, engineX, dy, '◆', '#ffffff');
        paintCell(grid, engineX - 1, dy, '·', flameColors[3] ?? accent);
        paintCell(grid, engineX + 1, dy, '·', flameColors[3] ?? accent);
      }
    }
  }

  // Rocket always drawn in frame
  const rocketTop = rocketBottom - rocket.length + 1;
  blitAsciiSprite(grid, rocket, bodyX, rocketTop, ramp[ramp.length - 1] ?? accent);
  if (rocketTop >= 0 && rocketTop < height) {
    paintCell(grid, engineX, rocketTop, '▲', '#ffffff');
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildNeuralNet(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const canvas = createBraille(width, height);
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const dotsWide = width * 2;
  const dotsHigh = height * 4;
  const layers = [4, 7, 7, 5, 3];
  const nodes: {x: number; y: number; layer: number; index: number}[] = [];
  const marginX = dotsWide * 0.08;
  const usableX = dotsWide - marginX * 2;

  layers.forEach((count, layer) => {
    const x = marginX + (layer / Math.max(1, layers.length - 1)) * usableX;
    for (let i = 0; i < count; i += 1) {
      const y = dotsHigh * (0.12 + (i + 0.5) * (0.76 / count));
      nodes.push({x, y, layer, index: i});
    }
  });

  const byLayer = layers.map((_, layer) => nodes.filter(n => n.layer === layer));
  for (let layer = 0; layer < byLayer.length - 1; layer += 1) {
    const a = byLayer[layer] ?? [];
    const b = byLayer[layer + 1] ?? [];
    for (const from of a) {
      for (const to of b) {
        const activity = (Math.sin(pulse * 0.07 + from.index * 0.7 + to.index * 0.5 + layer) + 1) / 2;
        if (activity < 0.35) {
          continue;
        }
        const color = ramp[Math.min(ramp.length - 1, 1 + Math.round(activity * (ramp.length - 2)))] ?? accent;
        drawBrailleLine(canvas, from.x, from.y, to.x, to.y, color);
        const t = ((pulse * 0.05 + from.index * 0.13 + to.index * 0.09 + layer * 0.2) % 1 + 1) % 1;
        const px = from.x + (to.x - from.x) * t;
        const py = from.y + (to.y - from.y) * t;
        brailleSet(canvas, px, py, '#ffffff');
        brailleSet(canvas, px + 1, py, '#ffffff');
      }
    }
  }

  for (const node of nodes) {
    const pulseNode = (Math.sin(pulse * 0.09 + node.layer + node.index) + 1) / 2;
    const color = pulseNode > 0.7 ? '#ffffff' : ramp[Math.min(ramp.length - 1, 2 + node.layer)] ?? accent;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx * dx + dy * dy <= 2) {
          brailleSet(canvas, node.x + dx, node.y + dy, color);
        }
      }
    }
  }

  return brailleToLines(canvas, accent);
}

const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
];

function buildFlyover(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#04070c');
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const scroll = pulse * 0.09;
  const asciiRamp = ' ·:;+=xX$&#@';

  for (let y = 0; y < height; y += 1) {
    const depth = (y + 1) / height;
    const perspective = 0.35 + depth * 1.8;
    for (let x = 0; x < width; x += 1) {
      const u = (x / Math.max(1, width - 1) - 0.5) * perspective * 6 + scroll * 0.4;
      const v = scroll + depth * 4;
      const h =
        0.5 +
        0.28 * Math.sin(u * 1.3 + v * 0.7) +
        0.18 * Math.sin(u * 0.45 - v * 1.1) +
        0.12 * Math.sin(u * 2.4 + v * 1.7 + pulse * 0.02);
      const ridge = Math.pow(clampNumber(h, 0, 1), 1.35);
      const fog = 1 - depth * 0.55;
      const value = clampNumber(ridge * fog, 0, 1);
      const threshold = ((BAYER_4[y & 3]![x & 3] ?? 0) + 0.5) / 16;
      const dithered = value > threshold ? value : value * 0.35;
      if (dithered < 0.08) {
        continue;
      }
      const glyphIndex = Math.min(asciiRamp.length - 1, Math.floor(dithered * asciiRamp.length));
      const colorIndex = Math.min(ramp.length - 1, 1 + Math.round(ridge * (ramp.length - 2)));
      paintCell(grid, x, y, asciiRamp[glyphIndex] ?? '·', ramp[colorIndex] ?? accent);
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

/** Downtown night drive — parallax towers, window grids, streetlamps and passing traffic. */
function buildSkyline(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const P = (color: string, mono: string): string => artColor(theme, color, mono);
  const skyTop = P('#040610', '#0a0a0e');
  const skyMid = P('#0b1128', '#14141c');
  const skyGlow = P('#3c2a1e', '#2a2a30');
  const farBody = P('#131c33', '#202028');
  const farWindow = P('#4a5a7e', '#5c5c5c');
  const bodyA = P('#0d1428', '#17171e');
  const bodyB = P('#111a32', '#1d1d26');
  const bodyEdge = P('#25324e', '#3c3c46');
  const winWarm = P('#ffd166', '#e2e2e2');
  const winCool = P('#a9d4ff', '#c8c8c8');
  const winDim = P('#5a6f9e', '#8a8a8a');
  const shopGlow = P('#ffb45c', '#d4d4d4');
  const lampWarm = P('#ffe9b0', '#f0f0f0');
  const moonTint = P('#e8ecf8', '#e8e8e8');
  const starTint = P('#9fb2e8', '#8a8a8a');
  const curbBg = P('#1a2030', '#26262e');
  const roadBg = P('#090b12', '#101014');
  const dashPaint = P('#c8b06a', '#9a9a9a');
  const headlight = P('#fff6dc', '#f8f8f8');
  const taillight = P('#ff4455', '#b8b8b8');
  const carBody = P('#232b3e', '#33333c');
  const beacon = P('#ff5f87', '#dcdcdc');
  const tankWood = P('#6b5340', '#585858');
  const grid = emptyMotionGrid(width, height, skyTop);

  const sidewalkY = height - 2;
  const ground = sidewalkY;
  // Advance the rigid city and road exactly one cell on every Skyline frame.
  // A style-specific timer controls the actual speed; keeping positions
  // integral here eliminates duplicate frames and fractional-rounding jumps.
  const cityScroll = pulse;
  const starScroll = Math.floor(pulse / 4);
  const roadScroll = cityScroll;
  const trafficScroll = pulse;
  const worldPeriod = Math.max(80, width * 3);

  // Night-sky gradient sinking into a sodium glow on the roofline.
  for (let y = 0; y < sidewalkY; y += 1) {
    const t = y / Math.max(1, sidewalkY - 1);
    const bg = t < 0.6 ? interpolateHex(skyTop, skyMid, t / 0.6) : interpolateHex(skyMid, skyGlow, (t - 0.6) / 0.4);
    for (let x = 0; x < width; x += 1) {
      sceneCell(grid, x, y, ' ', bg, bg);
    }
  }

  // Parallax stars and a crescent moon drift slower than the towers.
  for (let s = 0; s < Math.floor(width / 2); s += 1) {
    const sx = (Math.floor(hashNoise(s, 4, 0) * width * 2) - starScroll + width * 4) % (width + 8) - 4;
    const sy = Math.floor(hashNoise(s, 5, 0) * Math.max(1, sidewalkY * 0.45));
    if (sx >= 0 && sx < width && hashNoise(s, 6, 0) > 0.27) {
      sceneOverlay(grid, sx, sy, s % 5 === 0 ? '+' : '·', starTint);
    }
  }

  const moonX = Math.round(width * 0.84);
  const moonY = Math.max(1, Math.round(sidewalkY * 0.16));
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -2; dx <= 1; dx += 1) {
      if (Math.abs(dx) + Math.abs(dy) * 2 > 2) {
        continue;
      }

      sceneOverlay(grid, moonX + dx, moonY + dy, dx === 1 ? '·' : '•', dx === 1 ? interpolateHex(moonTint, skyMid, 0.5) : moonTint);
    }
  }

  // Hazy midtown backdrop sliding past at a fraction of street speed.
  type Tower = {id: number; x: number; w: number; h: number};
  const farTowers: Tower[] = [];
  let farCursor = 0;
  let farId = 0;
  while (farCursor < worldPeriod + width + 20) {
    const w = 5 + Math.floor(hashNoise(farId, 41, 0) * 8);
    const h = 2 + Math.floor(hashNoise(farId, 42, 0) * Math.max(2, Math.round(sidewalkY * 0.5)));
    farTowers.push({id: farId, x: farCursor, w, h});
    farCursor += w + 1 + Math.floor(hashNoise(farId, 43, 0) * 4);
    farId += 1;
  }

  for (const b of farTowers) {
    const farScroll = Math.floor(pulse / 2);
    let screenX = b.x - (farScroll % worldPeriod);
    if (screenX + b.w < -2) {
      screenX += worldPeriod;
    }

    if (screenX > width + 2) {
      continue;
    }

    const top = sidewalkY - 1 - b.h;
    for (let y = Math.max(0, top); y < sidewalkY; y += 1) {
      for (let dx = 0; dx < b.w; dx += 1) {
        const sx = Math.round(screenX + dx);
        if (sx < 0 || sx >= width) {
          continue;
        }

        sceneCell(grid, sx, y, ' ', farBody, farBody);
      }
    }

    for (let y = Math.max(0, top) + 1; y < sidewalkY - 1; y += 2) {
      for (let dx = 1; dx < b.w - 1; dx += 3) {
        const sx = Math.round(screenX + dx);
        if (sx >= 0 && sx < width && hashNoise(b.id * 3, y, dx) > 0.68) {
          sceneOverlay(grid, sx, y, '·', farWindow);
        }
      }
    }
  }

  // Near towers: setbacks, parapets, water tanks and blinking masts.
  const towers: Tower[] = [];
  let cursor = 0;
  let id = 0;
  while (cursor < worldPeriod + width + 20) {
    const w = 4 + Math.floor(hashNoise(id, 1, 0) * 7);
    const h = 3 + Math.floor(hashNoise(id, 2, 0) * Math.max(3, sidewalkY - 3));
    towers.push({id, x: cursor, w, h});
    cursor += w + 1 + Math.floor(hashNoise(id, 3, 0) * 3);
    id += 1;
  }

  for (const b of towers) {
    let screenX = b.x - (cityScroll % worldPeriod);
    if (screenX + b.w < -2) {
      screenX += worldPeriod;
    }

    if (screenX > width + 2) {
      continue;
    }

    const top = ground - b.h;
    const body = b.id % 2 === 0 ? bodyA : bodyB;
    const inset = b.w >= 7 && hashNoise(b.id, 6, 0) > 0.5 ? 1 : 0;
    const shoulderY = top + Math.max(1, Math.round(b.h * 0.28));
    for (let y = Math.max(0, top); y < ground; y += 1) {
      for (let dx = 0; dx < b.w; dx += 1) {
        if (inset > 0 && y < shoulderY && (dx < inset || dx >= b.w - inset)) {
          continue;
        }

        const sx = Math.round(screenX + dx);
        if (sx < 0 || sx >= width) {
          continue;
        }

        const edge = dx === 0 || dx === b.w - 1 || y === Math.max(0, top);
        const fleck = hashNoise(b.id * 7 + dx, y * 3, 0);
        sceneCell(grid, sx, y, edge ? '█' : fleck > 0.88 ? '▒' : '▓', edge ? bodyEdge : body, body);
      }
    }

    // Office windows in a mullioned grid; a few flicker as tenants move.
    for (let y = Math.max(0, top) + 1; y < ground - 1; y += 1) {
      for (let dx = 1; dx < b.w - 1; dx += 2) {
        if (inset > 0 && y < shoulderY && (dx < inset || dx >= b.w - inset)) {
          continue;
        }

        const sx = Math.round(screenX + dx);
        if (sx < 0 || sx >= width) {
          continue;
        }

        const roll = hashNoise(b.id * 13 + dx, y * 5, 0);
        if (roll < 0.4) {
          continue;
        }

        const color = roll > 0.86 ? winCool : roll > 0.62 ? winWarm : winDim;

        sceneOverlay(grid, sx, y, roll > 0.7 ? '▀' : '·', color);
      }
    }

    // Storefront glow spilling onto the sidewalk.
    for (let dx = 0; dx < b.w; dx += 1) {
      const sx = Math.round(screenX + dx);
      if (sx < 0 || sx >= width) {
        continue;
      }

      const lit = hashNoise(b.id, dx, 17) > 0.3 && dx % 2 === 0;
      sceneCell(grid, sx, ground - 1, lit ? '▀' : '▄', lit ? shopGlow : bodyEdge, curbBg);
    }

    // Rooftop furniture: parapet cap, water tank or blinking mast.
    if (top >= 1) {
      for (let dx = 0; dx < b.w; dx += 1) {
        const sx = Math.round(screenX + dx);
        if (sx >= 0 && sx < width && !(inset > 0 && (dx < inset || dx >= b.w - inset))) {
          sceneOverlay(grid, sx, top, '▀', bodyEdge);
        }
      }

      const tankRoll = hashNoise(b.id, 9, 0);
      const cx = Math.round(screenX + b.w / 2);
      if (tankRoll > 0.68 && b.w >= 5 && top >= 3) {
        sceneOverlay(grid, cx - 1, top - 1, '│', bodyEdge);
        sceneOverlay(grid, cx, top - 1, '│', bodyEdge);
        sceneOverlay(grid, cx - 1, top - 2, '▄', tankWood);
        sceneOverlay(grid, cx, top - 2, '▄', tankWood);
        sceneOverlay(grid, cx - 1, top - 3, '▀', tankWood);
        sceneOverlay(grid, cx, top - 3, '▀', tankWood);
      } else if (top >= 2) {
        sceneOverlay(grid, cx, top - 1, '│', bodyEdge);
        if ((Math.floor(pulse / 8) + b.id) % 2 === 0) {
          sceneOverlay(grid, cx, top - 2, '•', beacon);
        }
      }
    }
  }

  // Sidewalk and asphalt: the roadside blurs past quickest of all.
  for (let x = 0; x < width; x += 1) {
    sceneCell(grid, x, sidewalkY, ' ', curbBg, curbBg);
    const grit = hashNoise(x, 71, 0) > 0.72 ? '·' : ' ';
    sceneCell(grid, x, height - 1, grit, interpolateHex(roadBg, '#ffffff', 0.14), roadBg);
    if ((x + roadScroll) % 9 < 4) {
      sceneOverlay(grid, x, height - 1, '─', dashPaint);
    }
  }

  // Streetlamps pool their light between the towers and the road.
  for (let lx = -(roadScroll % 13); lx < width; lx += 13) {
    sceneOverlay(grid, lx, sidewalkY, '•', lampWarm, true);
    sceneOverlay(grid, lx, sidewalkY - 1, '·', interpolateHex(lampWarm, curbBg, 0.35));
    if (hashNoise(lx + roadScroll, 0, 0) > 0.5) {
      sceneOverlay(grid, lx, height - 1, '˙', interpolateHex(lampWarm, roadBg, 0.55));
    }
  }

  // Oncoming headlights sweep by; the car ahead keeps its red distance.
  const oncoming = width + 4 - (trafficScroll % (width + 10));
  sceneOverlay(grid, oncoming, sidewalkY, '•', headlight, true);
  sceneOverlay(grid, oncoming + 1, sidewalkY, '•', headlight, true);
  sceneOverlay(grid, oncoming + 2, sidewalkY, '█', carBody);
  sceneOverlay(grid, oncoming + 3, sidewalkY, '█', carBody);
  const oncomingTwo = width + 4 - ((trafficScroll + Math.round(width * 0.55)) % (width + 10));
  sceneOverlay(grid, oncomingTwo, sidewalkY, '•', headlight, true);
  sceneOverlay(grid, oncomingTwo + 1, sidewalkY, '█', carBody);

  const ahead = Math.round(width * 0.62);
  sceneOverlay(grid, ahead, sidewalkY, '•', taillight, true);
  sceneOverlay(grid, ahead + 1, sidewalkY, '•', taillight, true);
  sceneOverlay(grid, ahead + 2, sidewalkY, '█', carBody);

  return grid.map(row => lineFromCells(row, accent));
}

/** Scenic painters keep their own art palettes; the mono theme falls back to greys. */
function artColor(theme: ThemeName, color: string, mono: string): string {
  return theme === 'mono' ? mono : color;
}

/** Bounds-checked painter that writes a full cell (glyph + ink + paper). */
function sceneCell(
  grid: VisualCell[][],
  x: number,
  y: number,
  text: string,
  color: string,
  backgroundColor?: string,
  bold = false
): void {
  const row = grid[Math.round(y)];
  const cell = row?.[Math.round(x)];
  if (!row || !cell) {
    return;
  }

  row[Math.round(x)] = bold ? {text, color, backgroundColor, bold} : {text, color, backgroundColor};
}

/** Bounds-checked painter that keeps the paper already underneath the mark. */
function sceneOverlay(grid: VisualCell[][], x: number, y: number, text: string, color: string, bold = false): void {
  const row = grid[Math.round(y)];
  const cell = row?.[Math.round(x)];
  if (!row || !cell) {
    return;
  }

  row[Math.round(x)] = bold
    ? {text, color, backgroundColor: cell.backgroundColor, bold}
    : {text, color, backgroundColor: cell.backgroundColor};
}

/** Golden Gate at midday — stippled cumulus, international-orange span, shimmering bay. */
function buildGoldenGate(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const P = (color: string, mono: string): string => artColor(theme, color, mono);
  const skyTop = P('#0f3c8e', '#12121a');
  const skyMid = P('#4a90d8', '#34343e');
  const skyLow = P('#aad4f4', '#5c5c68');
  const cloudCore = P('#fff8e6', '#f2f2f2');
  const cloudMid = P('#f6e4bc', '#d2d2d2');
  const cloudShade = P('#d9c298', '#9e9e9e');
  const headland = P('#4c5c40', '#24242c');
  const bluff = P('#2e3f26', '#17171d');
  const bluffLight = P('#4c6234', '#2e2e36');
  const waterNear = P('#1a5a9e', '#26262e');
  const waterFar = P('#0d3160', '#121218');
  const glint = P('#d9ecfc', '#c4c4c4');
  const orange = P('#e0521f', '#7c7c7c');
  const orangeLight = P('#ff8148', '#b4b4b4');
  const orangeDark = P('#a83a12', '#4e4e4e');
  const sunCore = P('#fffdf4', '#ffffff');
  const sunHalo = P('#fff2c8', '#e8e8e8');
  const fogTint = P('#e8ecf2', '#c8c8c8');
  const carWhite = P('#e8e8e8', '#d0d0d0');
  const carRed = P('#c8352a', '#6a6a6a');
  const carBlue = P('#2a4a7c', '#4a4a4a');
  const grid = emptyMotionGrid(width, height, skyTop);

  const horizon = Math.max(2, Math.round(height * 0.58));
  const deckY = horizon;
  const towerTopY = Math.max(1, Math.round(height * 0.15));
  const towerAX = Math.round(width * 0.26);
  const towerBX = Math.round(width * 0.64);
  const waterStart = Math.min(height - 1, deckY + 1);

  // Sky wash with a fine offset dot grain.
  const skyBg: string[] = [];
  for (let y = 0; y < horizon; y += 1) {
    const t = y / Math.max(1, horizon - 1);
    const bg = t < 0.55 ? interpolateHex(skyTop, skyMid, t / 0.55) : interpolateHex(skyMid, skyLow, (t - 0.55) / 0.45);
    skyBg.push(bg);
    for (let x = 0; x < width; x += 1) {
      const dot = (x + y) % 2 === 0 && hashNoise(x * 0.9, y * 1.7, 0) > 0.66;
      sceneCell(grid, x, y, dot ? '˙' : ' ', dot ? interpolateHex(bg, '#ffffff', 0.3) : bg, bg);
    }
  }

  // High afternoon sun with a soft halo over the ocean side.
  const sunX = Math.round(width * 0.8);
  const sunY = Math.max(1, Math.round(horizon * 0.22));
  const sunR = Math.max(1.1, height * 0.08);
  for (let y = Math.floor(sunY - sunR * 2.2); y <= Math.ceil(sunY + sunR * 2.2); y += 1) {
    if (y < 0 || y >= horizon) {
      continue;
    }

    for (let x = Math.floor(sunX - sunR * 2); x <= Math.ceil(sunX + sunR * 2); x += 1) {
      if (x < 0 || x >= width) {
        continue;
      }

      const dx = (x - sunX) / 1.9;
      const dy = y - sunY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= sunR) {
        sceneCell(grid, x, y, d < sunR * 0.62 ? '●' : '•', d < sunR * 0.55 ? sunCore : sunHalo, skyBg[y], d < sunR * 0.5);
      } else if (d <= sunR * 1.9 && hashNoise(x, y, 0) > 0.84) {
        sceneOverlay(grid, x, y, '˙', sunHalo);
      }
    }
  }

  // Slow-drifting stippled cumulus with shaded bellies.
  const clouds = [
    {cx: 0.14, cy: 0.18, rx: 0.11, ry: 0.2, seed: 5},
    {cx: 0.42, cy: 0.1, rx: 0.15, ry: 0.16, seed: 9},
    {cx: 0.72, cy: 0.26, rx: 0.1, ry: 0.18, seed: 13},
    {cx: 0.93, cy: 0.08, rx: 0.09, ry: 0.13, seed: 19}
  ];
  for (const cloud of clouds) {
    const drift = ((cloud.cx + pulse * 0.0016) % 1.3) - 0.15;
    const cx = drift * width;
    const cy = cloud.cy * horizon;
    const rx = Math.max(3, cloud.rx * width);
    const ry = Math.max(1.2, cloud.ry * horizon);
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      if (y < 0 || y >= horizon) {
        continue;
      }

      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        if (x < 0 || x >= width) {
          continue;
        }

        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const d = dx * dx + dy * dy * 1.3;
        if (d > 1) {
          continue;
        }

        const fluff = (1 - d) * (0.5 + 0.5 * hashNoise(x * 1.9 + cloud.seed, y * 2.7, cloud.seed));
        if (fluff < 0.3) {
          continue;
        }

        const shade = dy > 0.32;
        sceneCell(
          grid,
          x,
          y,
          fluff > 0.64 ? '●' : fluff > 0.44 ? '•' : '·',
          shade ? cloudShade : fluff > 0.6 ? cloudCore : cloudMid,
          skyBg[y],
          fluff > 0.8
        );
      }
    }
  }

  // Tiny gulls high above the strait, bobbing on the wind.
  for (let b = 0; b < 4; b += 1) {
    const bx = Math.floor((hashNoise(b, 21, 0) * width + pulse * 0.06) % width);
    const by = Math.floor(hashNoise(b, 22, 0) * Math.max(1, horizon * 0.45)) + (Math.sin(pulse * 0.18 + b * 2.2) > 0.55 ? 1 : 0);
    sceneOverlay(grid, bx, by, '~', P('#2c3c58', '#686868'));
  }

  // Distant Marin ridgeline just above the horizon.
  for (let x = 0; x < width; x += 1) {
    const lift = 0.5 + 0.5 * Math.sin((x / Math.max(1, width)) * 7.3 + 1.2);
    const ridge = horizon - 1 - Math.round(lift * height * 0.04);
    sceneCell(grid, x, ridge, '░', headland, skyBg[ridge]);
    if (ridge + 1 < horizon) {
      sceneCell(grid, x, ridge + 1, '▒', headland, headland);
    }
  }

  // Bay water: gradient body, tidal streaks, lapping glints, whitecap flecks.
  for (let y = waterStart; y < height; y += 1) {
    const depth = (y - waterStart) / Math.max(1, height - 1 - waterStart);
    const bg = interpolateHex(waterNear, waterFar, depth);
    for (let x = 0; x < width; x += 1) {
      const lap = hashNoise(x * 0.6, y * 3.1, Math.floor(pulse / 3));
      const still = hashNoise(x * 1.7, y * 2.9, 0);
      const streak = depth < 0.4 && hashNoise(x * 0.35, y * 6.3, Math.floor(pulse / 4)) > 0.94;
      const text = streak ? '~' : lap > 0.9 ? '·' : still > 0.86 ? '˙' : ' ';
      const color = lap > 0.965 ? glint : streak ? interpolateHex(glint, bg, 0.35) : interpolateHex(glint, bg, 0.55);
      sceneCell(grid, x, y, text, color, bg);
    }
  }

  // Sunlight glitter lane wobbling across the channel.
  for (let y = waterStart; y < height; y += 1) {
    const depth = (y - waterStart) / Math.max(1, height - 1 - waterStart);
    const laneX = Math.round(sunX + Math.sin(y * 0.9 + pulse * 0.22) * (1 + depth * 2));
    for (let dx = -1; dx <= 1; dx += 1) {
      if (hashNoise(laneX + dx, y * 3.7, Math.floor(pulse / 2)) > 0.52) {
        sceneOverlay(grid, laneX + dx, y, hashNoise(laneX + dx, y, 3) > 0.5 ? '·' : '˙', interpolateHex(glint, waterFar, depth * 0.35));
      }
    }
  }

  // Foreground bluff on the left anchorage side.
  const bluffW = Math.max(3, Math.round(width * 0.09));
  for (let x = 0; x < bluffW; x += 1) {
    const falloff = x / bluffW;
    const ridge = Math.round(height * (0.68 + falloff * 0.22) + hashNoise(x, 3, 0) * 1.5);
    for (let y = Math.max(waterStart, ridge); y < height; y += 1) {
      const fleck = hashNoise(x * 1.9, y * 2.3, 0);
      sceneCell(grid, x, y, fleck > 0.62 ? '▒' : fleck > 0.3 ? '░' : ' ', fleck > 0.62 ? bluffLight : bluff, bluff);
    }
  }

  // Fort Point crouched at the waterline under the south anchorage.
  const fortBrick = P('#7a5a44', '#4a4a4a');
  const fortRoof = P('#3a2c22', '#2c2c2c');
  const fortX = Math.min(bluffW + 1, Math.max(1, width - 8));
  sceneCell(grid, fortX, waterStart, '█', fortBrick, fortRoof);
  sceneCell(grid, fortX + 1, waterStart, '░', P('#d9c8a8', '#9a9a9a'), fortBrick);
  sceneCell(grid, fortX + 2, waterStart, '█', fortBrick, fortRoof);

  // Broken tower reflections trembling in the water.
  for (const tx of [towerAX, towerBX]) {
    for (let y = waterStart + 1; y < height; y += 1) {
      const depth = (y - waterStart) / Math.max(1, height - 1 - waterStart);
      for (let dx = -2; dx <= 3; dx += 1) {
        const shimmerX = tx + dx + (hashNoise(y, dx * 7, 15) > 0.5 ? 1 : 0);
        if (hashNoise(shimmerX * 2.9, y * 1.3, Math.floor(pulse / 4)) > 0.5 + depth * 0.25) {
          sceneOverlay(grid, shimmerX, y, depth > 0.45 ? '·' : '•', depth > 0.45 ? orangeDark : orange);
        }
      }
    }
  }

  // Main cables: straight backstays, parabolic main span, dotted suspenders.
  const sagBottom = deckY - 2;
  const mainSpan = Math.max(1, towerBX - towerAX);
  const cableY = (x: number): number => {
    if (x < towerAX) {
      return deckY - 1 + (towerTopY - (deckY - 1)) * clampNumber(x / Math.max(1, towerAX), 0, 1);
    }

    if (x > towerBX) {
      return towerTopY + (deckY - 1 - towerTopY) * clampNumber((x - towerBX) / Math.max(1, width - 1 - towerBX), 0, 1);
    }

    const t = (x - towerAX) / mainSpan;
    return towerTopY + (sagBottom - towerTopY) * 4 * t * (1 - t);
  };

  for (let x = 0; x < width; x += 1) {
    sceneOverlay(grid, x, cableY(x), '•', orangeDark);
  }

  for (let x = 2; x < width - 1; x += 2) {
    const top = Math.round(cableY(x));
    for (let y = top + 1; y < deckY; y += 1) {
      sceneOverlay(grid, x, y, '│', orangeDark);
    }
  }

  // Deck with a sunlit top chord.
  for (let x = 0; x < width; x += 1) {
    sceneCell(grid, x, deckY, '▀', orangeLight, orange);
  }

  // Commuter traffic humming across the deck in both directions.
  for (let i = 0; i < Math.max(2, Math.floor(width / 26)); i += 1) {
    const east = Math.round((pulse * 0.7 + i * 29) % (width + 4)) - 2;
    const west = Math.round(width + 1 - ((pulse * 0.55 + i * 23) % (width + 4)));
    const eastPaint = [carWhite, carRed, carBlue][i % 3] ?? carWhite;
    sceneCell(grid, east, deckY, '▀', eastPaint, orangeDark);
    sceneCell(grid, west, deckY, '▀', i % 2 === 0 ? carRed : carWhite, orangeDark);
  }

  // Art-deco towers: tapered saddles, portal struts, woven brace under the deck.
  for (const tx of [towerAX, towerBX]) {
    const legL = tx - 3;
    const legR = tx + 1;
    const base = Math.min(height - 1, waterStart + 2);
    const taperRows = Math.max(1, Math.round((deckY - towerTopY) * 0.18));
    for (let y = towerTopY; y <= base; y += 1) {
      const legs = y < towerTopY + taperRows ? [legL, legR + 1] : [legL, legL + 1, legR, legR + 1];
      for (const lx of legs) {
        const edge = lx === legL || lx === legR + 1;
        sceneCell(grid, lx, y, '█', edge ? orangeLight : orange, orangeDark);
      }

      if (y > deckY) {
        const weave = (y - deckY) % 3;
        if (weave !== 2) {
          sceneCell(grid, legL + 2 + weave, y, weave === 0 ? '╲' : '╱', orange, orangeDark);
          sceneCell(grid, legR - 1 - weave, y, weave === 0 ? '╱' : '╲', orange, orangeDark);
        }
      }
    }

    for (let s = 0; s < 4; s += 1) {
      const sy = towerTopY + Math.round(((deckY - towerTopY) * s) / 3);
      for (let x = legL; x <= legR + 1; x += 1) {
        sceneCell(grid, x, sy, '█', orangeLight, orangeDark);
      }
    }

    sceneOverlay(grid, legL, towerTopY - 1, '▀', orangeLight);
    sceneOverlay(grid, legR, towerTopY - 1, '▀', orangeLight);
    if (towerTopY >= 2 && Math.sin(pulse * 0.3 + tx) > 0) {
      sceneOverlay(grid, legL, towerTopY - 2, '•', P('#ff5566', '#ffffff'));
    }
  }

  // A lone sloop heeling across the strait, wake trailing astern.
  const sail = P('#f4f2e8', '#e2e2e2');
  const hullWood = P('#3a3a34', '#4c4c4c');
  const boatX = 2 + Math.floor((width * 0.4 + pulse * 0.11) % Math.max(1, width - 6));
  const boatY = Math.min(height - 2, waterStart + 1);
  sceneOverlay(grid, boatX, boatY - 1, '│', hullWood);
  sceneOverlay(grid, boatX - 1, boatY, '▲', sail);
  sceneOverlay(grid, boatX + 1, boatY, '▲', sail);
  sceneOverlay(grid, boatX, boatY, '│', hullWood);
  sceneOverlay(grid, boatX - 1, boatY + 1, '▄', hullWood);
  sceneOverlay(grid, boatX, boatY + 1, '▄', hullWood);
  sceneOverlay(grid, boatX + 1, boatY + 1, '▄', hullWood);
  sceneOverlay(grid, boatX - 2, boatY + 1, '·', glint);
  sceneOverlay(grid, boatX - 3, boatY + 1, '˙', interpolateHex(glint, waterFar, 0.4));

  // Karl the Fog spilling through the Gate while the towers poke clear.
  const fogDrift = Math.floor(pulse * 0.15);
  const fogBase = towerTopY + Math.max(2, Math.round((deckY - towerTopY) * 0.55));
  for (let y = fogBase; y <= Math.min(height - 1, waterStart + 1); y += 1) {
    for (let x = 0; x < width; x += 1) {
      const bank = hashNoise((x - fogDrift) * 0.16, y * 2.3, 5);
      const shred = hashNoise((x - fogDrift) * 0.55, y * 4.1, 0);
      if (x < width * (0.3 + bank * 0.45) && shred > 0.58 && bank > 0.42) {
        sceneOverlay(grid, x, y, shred > 0.8 ? '░' : '·', fogTint);
      }
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

/** Manhattan at night — landmark silhouettes, lit windows, Hudson reflections. */
function buildManhattan(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const P = (color: string, mono: string): string => artColor(theme, color, mono);
  const skyTop = P('#030510', '#08080c');
  const skyMid = P('#0a1534', '#15151e');
  const skyGlow = P('#2c2450', '#262630');
  const starDim = P('#7a8ab8', '#5c5c5c');
  const starBright = P('#dce6ff', '#eaeaea');
  const body = P('#0b1128', '#111116');
  const bodyAlt = P('#0e1732', '#191920');
  const bodyFleck = P('#1a2444', '#2b2b34');
  const farBody = P('#111a35', '#202028');
  const facadeLine = P('#26375c', '#4a4a52');
  const crownLight = P('#edf3ff', '#ffffff');
  const winWarm = P('#ffd166', '#e2e2e2');
  const winCool = P('#a9d4ff', '#bebebe');
  const winDim = P('#5a6f9e', '#787878');
  const waterTop = P('#060b1c', '#0d0d12');
  const waterDeep = P('#030612', '#07070a');
  const beacon = P('#ff4455', '#ffffff');
  const silver = P('#c7d2e8', '#d8d8d8');
  const tankWood = P('#4a4038', '#3c3c3c');
  const shopGlow = P('#ffb45c', '#d0d0d0');
  const headlight = P('#fff6dc', '#f4f4f4');
  const taillight = P('#ff4455', '#a8a8a8');
  const ferryHull = P('#1c2a24', '#242428');
  const grid = emptyMotionGrid(width, height, skyTop);

  const ground = Math.max(3, Math.round(height * 0.78));

  // Night sky gradient with a warm city glow at the roofline.
  const skyBg: string[] = [];
  for (let y = 0; y < ground; y += 1) {
    const t = y / Math.max(1, ground - 1);
    const bg = t < 0.62 ? interpolateHex(skyTop, skyMid, t / 0.62) : interpolateHex(skyMid, skyGlow, (t - 0.62) / 0.38);
    skyBg.push(bg);
    for (let x = 0; x < width; x += 1) {
      sceneCell(grid, x, y, ' ', bg, bg);
    }
  }

  const skyAt = (y: number): string => skyBg[clampNumber(Math.round(y), 0, skyBg.length - 1)] ?? skyMid;

  // Sparse stars with a slow twinkle.
  const starCount = Math.floor(width * ground * 0.026);
  for (let s = 0; s < starCount; s += 1) {
    const sx = Math.floor(hashNoise(s, 1, 0) * width);
    const sy = Math.floor(hashNoise(s, 2, 0) * ground * 0.7);
    const twinkle = 0.5 + 0.5 * Math.sin(pulse * (0.05 + hashNoise(s, 3, 0) * 0.12) + s * 1.7);
    if (twinkle < 0.42) {
      continue;
    }

    const bright = hashNoise(s, 4, 0) * twinkle;
    sceneOverlay(grid, sx, sy, bright > 0.72 ? '•' : bright > 0.5 ? '·' : '˙', bright > 0.6 ? starBright : starDim);
  }

  // Crescent moon with a faint dotted halo.
  const moonX = Math.round(width * 0.84);
  const moonY = Math.round(ground * 0.2);
  const moonR = Math.max(1.2, height * 0.07);
  for (let y = Math.floor(moonY - moonR * 2.4); y <= Math.ceil(moonY + moonR * 1.4); y += 1) {
    for (let x = Math.floor(moonX - moonR * 2.2); x <= Math.ceil(moonX + moonR * 2.2); x += 1) {
      const dx = (x - moonX) / 1.9;
      const dy = y - moonY;
      const d = Math.sqrt(dx * dx + dy * dy);
      const shadow = Math.sqrt((dx - moonR * 0.5) ** 2 + dy * dy);
      if (d <= moonR && shadow > moonR * 0.9) {
        sceneCell(grid, x, y, d < moonR * 0.62 ? '●' : '•', P('#e8ecf8', '#f0f0f0'), skyAt(y), d < moonR * 0.5);
      } else if (d > moonR && d <= moonR * 2.1 && hashNoise(x, y, 0) > 0.78) {
        sceneOverlay(grid, x, y, '˙', P('#8a94b8', '#6a6a6a'));
      }
    }
  }

  // A distant borough layer gives the island depth behind the hero towers.
  let farX = 0;
  let farId = 0;
  while (farX < width) {
    const farW = 2 + Math.floor(hashNoise(farId, 121, 0) * 5);
    const farH = 2 + Math.floor(hashNoise(farId, 122, 0) * Math.max(2, ground * 0.34));
    const farTop = ground - farH;
    for (let y = Math.max(1, farTop); y < ground; y += 1) {
      for (let x = farX; x < Math.min(width, farX + farW); x += 1) {
        const edge = x === farX || x === farX + farW - 1;
        sceneCell(grid, x, y, edge ? '░' : ' ', farBody, farBody);
      }
    }
    for (let y = farTop + 1; y < ground - 1; y += 2) {
      for (let x = farX + 1; x < Math.min(width, farX + farW - 1); x += 2) {
        if (hashNoise(farId, x, y) > 0.52) {
          sceneOverlay(grid, x, y, '·', winDim);
        }
      }
    }
    farX += farW + 1;
    farId += 1;
  }

  // Manhattan's stepped silhouette, anchored by three recognizable crowns.
  type TowerBlock = {x: number; w: number; top: number; seed: number; kind: 'slab' | 'empire' | 'chrysler' | 'wtc'};
  const landmarks = [
    {cx: Math.round(width * 0.28), w: Math.max(9, Math.round(width * 0.1)), top: Math.max(3, Math.round(height * 0.16)), kind: 'empire' as const},
    {cx: Math.round(width * 0.5), w: Math.max(7, Math.round(width * 0.07)), top: Math.max(3, Math.round(height * 0.21)), kind: 'chrysler' as const},
    {cx: Math.round(width * 0.72), w: Math.max(8, Math.round(width * 0.085)), top: Math.max(2, Math.round(height * 0.12)), kind: 'wtc' as const}
  ];
  const blocks: TowerBlock[] = landmarks.map(l => ({x: Math.max(0, l.cx - Math.floor(l.w / 2)), w: l.w, top: l.top, seed: l.cx, kind: l.kind}));
  const reserved = (x: number, w: number): boolean =>
    blocks.some(b => x < b.x + b.w + 1 && x + w > b.x - 1);

  let cursor = 0;
  let slabId = 0;
  while (cursor < width) {
    const w = 3 + Math.floor(hashNoise(slabId, 7, 0) * 6);
    if (!reserved(cursor, w)) {
      const tallest = Math.max(2, ground - 4);
      const h = 2 + Math.floor(hashNoise(slabId, 11, 0) * tallest * 0.7);
      blocks.push({x: cursor, w: Math.min(w, width - cursor), top: ground - 1 - h, seed: slabId + 100, kind: 'slab'});
    }

    cursor += w + (hashNoise(slabId, 13, 0) > 0.68 ? 2 : 1);
    slabId += 1;
  }

  const reflections: {x: number; color: string}[] = [];
  const paintWindows = (b: TowerBlock, litRatio: number, coolBias: number): void => {
    for (let y = b.top + 1; y < ground; y += 1) {
      for (let x = b.x + 1; x < Math.min(width - 1, b.x + b.w - 1); x += 2) {
        const roll = hashNoise(x * 3 + b.seed * 17, y * 7, 0);
        if (roll >= litRatio) {
          continue;
        }

        const tone = hashNoise(x * 5, y * 3, b.seed);
        const color = tone < coolBias ? winCool : tone < 0.86 ? winWarm : winDim;
        sceneOverlay(grid, x, y, tone > 0.86 ? '▪' : tone < 0.3 ? '•' : '·', color);
        if (hashNoise(x, y, 45) > 0.5) {
          reflections.push({x, color});
        }
      }
    }
  };

  const carveSky = (x: number, y: number): void => {
    sceneCell(grid, x, y, ' ', skyAt(y), skyAt(y));
  };

  for (const b of blocks) {
    const bodyBg = hashNoise(b.seed, 5, 0) > 0.5 ? body : bodyAlt;
    for (let y = b.top; y < ground; y += 1) {
      for (let x = b.x; x < Math.min(width, b.x + b.w); x += 1) {
        const fleck = hashNoise(x * 2.3, y * 3.1, b.seed);
        const edge = x === b.x || x === b.x + b.w - 1;
        const roof = y === b.top;
        const mullion = !edge && (x - b.x) % 4 === 0;
        const glyph = roof ? '▀' : edge ? '█' : mullion ? '│' : fleck > 0.84 ? '░' : ' ';
        const color = roof || edge || mullion ? facadeLine : fleck > 0.84 ? bodyFleck : bodyBg;
        sceneCell(grid, x, y, glyph, color, bodyBg);
      }
    }

    // Narrow masonry cornices break the facades into believable floor groups.
    for (let y = b.top + 3; y < ground - 1; y += 3) {
      for (let x = b.x + 1; x < Math.min(width, b.x + b.w - 1); x += 1) {
        if ((x - b.x) % 3 !== 0) {
          sceneOverlay(grid, x, y, '▄', interpolateHex(facadeLine, bodyBg, 0.45));
        }
      }
    }

    // Shoulder setbacks give the wider slabs a stepped profile.
    if (b.kind === 'slab' && b.w >= 8) {
      for (let y = b.top; y < Math.min(ground, b.top + 2); y += 1) {
        carveSky(b.x, y);
        carveSky(b.x + b.w - 1, y);
      }
    }

    paintWindows(b, b.kind === 'slab' ? 0.34 : 0.42, b.kind === 'wtc' ? 0.62 : 0.2);

    // Street-level lobby glow washing the sidewalk.
    for (let x = b.x; x < Math.min(width, b.x + b.w); x += 1) {
      const glow = hashNoise(b.seed, x, 31) > 0.42;
      sceneCell(grid, x, ground - 1, glow && x % 2 === 0 ? '░' : ' ', glow ? shopGlow : bodyBg, bodyBg);
    }

    // Cedar water tanks and blinking masts on the roofline.
    if (b.kind === 'slab' && b.w >= 6 && hashNoise(b.seed, 21, 0) > 0.55 && b.top >= 3) {
      const tx = b.x + 1 + Math.floor(hashNoise(b.seed, 22, 0) * Math.max(1, b.w - 4));
      sceneOverlay(grid, tx, b.top - 1, '│', bodyFleck);
      sceneOverlay(grid, tx + 1, b.top - 1, '│', bodyFleck);
      sceneOverlay(grid, tx, b.top - 2, '▄', tankWood);
      sceneOverlay(grid, tx + 1, b.top - 2, '▄', tankWood);
      sceneOverlay(grid, tx, b.top - 3, '▀', interpolateHex(tankWood, '#ffffff', 0.15));
      sceneOverlay(grid, tx + 1, b.top - 3, '▀', interpolateHex(tankWood, '#ffffff', 0.15));
    }

    if (b.kind === 'slab' && b.w >= 4 && hashNoise(b.seed, 8, 0) > 0.55 && b.top > 1) {
      const ax = b.x + Math.floor(b.w / 2);
      sceneOverlay(grid, ax, b.top - 1, '│', bodyFleck);
      if (Math.sin(pulse * 0.15 + b.seed) > 0.4) {
        sceneOverlay(grid, ax, b.top - 1, '•', beacon);
      }
    }
  }

  // Landmark profiles, drawn over their slabs.
  for (const b of blocks) {
    const cxB = b.x + Math.floor(b.w / 2);

    if (b.kind === 'empire') {
      const h = ground - b.top;
      // Three setbacks stepping in toward the crown.
      const setbacks = [
        {until: 0.3, inset: 3},
        {until: 0.55, inset: 2},
        {until: 1, inset: 0}
      ];
      let previousUntil = 0;
      for (const section of setbacks) {
        for (let y = b.top + Math.round(h * previousUntil); y < b.top + Math.round(h * section.until); y += 1) {
          for (let i = 0; i < section.inset; i += 1) {
            carveSky(b.x + i, y);
            carveSky(b.x + b.w - 1 - i, y);
          }
        }

        previousUntil = section.until;
      }

      // Floodlit crown: denser white windows over a pale wash.
      const crownBg = P('#8f9cc0', '#565660');
      for (let y = b.top; y < b.top + Math.round(h * 0.3); y += 1) {
        for (let x = b.x + 3; x <= b.x + b.w - 4; x += 1) {
          const lit = hashNoise(x * 7, y * 3, 0) > 0.42;
          sceneCell(grid, x, y, lit ? '•' : ' ', lit ? crownLight : crownBg, crownBg);
        }
      }

      const observationY = Math.min(ground - 2, b.top + Math.max(2, Math.round(h * 0.3)));
      for (let x = b.x + 1; x < b.x + b.w - 1; x += 1) {
        sceneOverlay(grid, x, observationY, '▀', x % 2 === 0 ? crownLight : silver);
      }

      sceneOverlay(grid, cxB, b.top - 1, '│', silver);
      sceneOverlay(grid, cxB, b.top - 2, '│', silver);
      sceneOverlay(grid, cxB, b.top - 3, '•', Math.sin(pulse * 0.3) > -0.2 ? beacon : P('#5a1a22', '#4a4a4a'));
    }

    if (b.kind === 'chrysler') {
      // Tiered steel crown arcs, then the needle.
      for (let arc = 0; arc < 4; arc += 1) {
        const y = b.top + arc;
        const inset = (3 - arc) <= 1 ? (3 - arc) : 2;
        for (let x = b.x; x < b.x + b.w; x += 1) {
          const edge = x - b.x;
          if (edge < inset || edge > b.w - 1 - inset) {
            carveSky(x, y);
            continue;
          }

          const centerDistance = Math.abs(x - cxB);
          const crownGlyph = centerDistance === 0 ? '◆' : x < cxB ? '╱' : '╲';
          sceneCell(grid, x, y, crownGlyph, arc < 2 ? crownLight : silver, body);
        }
      }

      for (let y = b.top + 4; y < Math.min(ground, b.top + 7); y += 1) {
        sceneOverlay(grid, cxB, y, '│', silver);
      }

      sceneOverlay(grid, cxB, b.top - 1, '│', silver);
      sceneOverlay(grid, cxB, b.top - 2, '│', silver);
      sceneOverlay(grid, cxB, b.top - 3, '•', P('#f2f6ff', '#ffffff'));
    }

    if (b.kind === 'wtc') {
      const h = ground - b.top;
      // Chamfered taper plus glass pinstripes and a lit parapet.
      for (let y = b.top; y < ground; y += 1) {
        const t = (y - b.top) / Math.max(1, h);
        const inset = Math.round((1 - t) * 2.2);
        for (let i = 0; i < inset; i += 1) {
          carveSky(b.x + i, y);
          carveSky(b.x + b.w - 1 - i, y);
        }
      }

      for (let y = b.top + 1; y < ground; y += 1) {
        for (const sx of [b.x + 2, b.x + b.w - 3]) {
          const cell = grid[y]?.[sx];
          if (cell && cell.text === ' ') {
            sceneOverlay(grid, sx, y, '│', P('#2a4a86', '#484858'));
          }
        }
      }

      const tInset = 2;
      for (let x = b.x + tInset; x <= b.x + b.w - 1 - tInset; x += 1) {
        sceneCell(grid, x, b.top, '▀', P('#3a5a9e', '#585860'), body);
      }

      sceneOverlay(grid, cxB, b.top - 1, '│', silver);
      sceneOverlay(grid, cxB, b.top - 2, '│', silver);
      sceneOverlay(grid, cxB, b.top - 3, '│', silver);
      sceneOverlay(grid, cxB, b.top - 4, '•', Math.sin(pulse * 0.3 + 2.1) > -0.2 ? beacon : P('#5a1a22', '#4a4a4a'));
    }
  }

  // The Hudson: dark water carrying trembling columns of window light.
  for (let y = ground; y < height; y += 1) {
    const depth = (y - ground) / Math.max(1, height - 1 - ground);
    const bg = interpolateHex(waterTop, waterDeep, depth);
    for (let x = 0; x < width; x += 1) {
      const ripple = hashNoise(x * 0.55, y * 4.2, Math.floor(pulse / 4));
      const glyph = ripple > 0.94 ? '─' : ripple > 0.84 ? '˙' : ' ';
      sceneCell(grid, x, y, glyph, interpolateHex(silver, bg, 0.55 + depth * 0.2), bg);
    }
  }

  for (const source of reflections) {
    const reach = Math.min(height - ground, 4);
    for (let d = 0; d < reach; d += 1) {
      const y = ground + d;
      const strength = (0.72 - d * 0.16) * (0.55 + 0.45 * Math.sin(pulse * 0.18 + source.x * 1.3 + d));
      if (hashNoise(source.x * 3, y * 7, 12) < strength) {
        const jx = source.x + (hashNoise(y, source.x, 33) > 0.6 ? 1 : 0);
        sceneOverlay(grid, jx, y, d === 0 ? '•' : '·', d === 0 ? source.color : interpolateHex(source.color, waterDeep, 0.45));
      }
    }
  }

  // A worn silver path on the water beneath the moon.
  for (let y = ground; y < height; y += 1) {
    const depth = (y - ground) / Math.max(1, height - 1 - ground);
    const laneX = Math.round(moonX + Math.sin(y * 1.15 + pulse * 0.18) * 1.5);
    if (hashNoise(y * 7, Math.floor(pulse / 2), 5) > 0.42) {
      sceneOverlay(grid, laneX, y, depth > 0.5 ? '·' : '•', interpolateHex(silver, waterDeep, 0.3 + depth * 0.45));
    }
  }

  // Headlights and taillights streaming the West Side Highway.
  for (const flow of [{speed: 0.9, color: headlight, seed: 3}, {speed: -0.7, color: taillight, seed: 11}]) {
    for (let c = 0; c < Math.max(2, Math.floor(width / 22)); c += 1) {
      const raw = pulse * flow.speed + c * Math.floor(width / 2.4) + flow.seed * 7;
      const cx = ((Math.round(raw) % width) + width) % width;
      sceneOverlay(grid, cx, ground, '•', flow.color);
      if (ground + 1 < height) {
        sceneOverlay(grid, cx, ground + 1, '·', interpolateHex(flow.color, waterDeep, 0.5));
      }
    }
  }

  // The Staten Island ferry churning across with lit decks.
  const ferryX = Math.round(width + 5 - ((pulse * 0.24) % (width + 12)));
  const ferryY = Math.min(height - 1, ground + 1);
  sceneOverlay(grid, ferryX, ferryY, '▄', ferryHull);
  sceneOverlay(grid, ferryX + 1, ferryY, '▄', ferryHull);
  sceneOverlay(grid, ferryX + 2, ferryY, '▄', ferryHull);
  sceneOverlay(grid, ferryX, ferryY - 1, '•', winWarm);
  sceneOverlay(grid, ferryX + 1, ferryY - 1, '•', winWarm);
  sceneOverlay(grid, ferryX + 2, ferryY - 1, '·', winDim);
  sceneOverlay(grid, ferryX + 3, ferryY, '·', interpolateHex(silver, waterDeep, 0.45));
  sceneOverlay(grid, ferryX + 4, ferryY, '˙', interpolateHex(silver, waterDeep, 0.7));

  // Quay lamps strung along the waterline.
  for (let x = 4; x < width; x += 9) {
    sceneOverlay(grid, x, ground, '•', winWarm);
    sceneOverlay(grid, x, ground + 1, '·', interpolateHex(winWarm, waterDeep, 0.4));
  }

  // A red-eye blinking its way across the Hudson sky.
  const planeX = Math.round((pulse * 0.5) % (width + 18)) - 9;
  const planeY = Math.max(1, Math.round(ground * 0.14));
  sceneOverlay(grid, planeX, planeY, '─', silver);
  sceneOverlay(grid, planeX + 1, planeY, '•', Math.sin(pulse * 0.6) > 0 ? beacon : silver);
  sceneOverlay(grid, planeX - 2, planeY, '·', interpolateHex(silver, skyAt(planeY), 0.55));
  sceneOverlay(grid, planeX - 4, planeY, '˙', interpolateHex(silver, skyAt(planeY), 0.75));

  return grid.map(row => lineFromCells(row, accent));
}

/** Alpine at night — moonlit peaks, festive chalet, snowy pines and soft drifts. */
function buildAlpine(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const P = (color: string, mono: string): string => artColor(theme, color, mono);
  const skyTop = P('#050818', '#08080c');
  const skyMid = P('#0d1630', '#15151e');
  const skyLow = P('#1c2a4a', '#262630');
  const starDim = P('#8a9ac0', '#5c5c5c');
  const starBright = P('#e4ecff', '#eaeaea');
  const moonCore = P('#f2f4fa', '#f2f2f2');
  const moonShade = P('#c6cede', '#c4c4c4');
  const rockFace = P('#1a2236', '#1a1a20');
  const rockShade = P('#10141f', '#101014');
  const rockHi = P('#2a3450', '#3c3c46');
  const snowBright = P('#eef2fc', '#e8e8e8');
  const snowShade = P('#b9c4dc', '#a0a0a0');
  const chaletWall = P('#4a3226', '#3c3c3c');
  const chaletDark = P('#241a12', '#202020');
  const chaletGlow = P('#ffd9a0', '#e8e8e8');
  const chaletRoof = P('#4b1717', '#303030');
  const evergreen = P('#17382c', '#282828');
  const evergreenDeep = P('#0b211a', '#171717');
  const hollyRed = P('#e94747', '#d8d8d8');
  const hollyGreen = P('#4f9a62', '#a0a0a0');
  const garlandGold = P('#ffd166', '#eeeeee');
  const snowShadow = P('#8ea5c8', '#989898');
  const smoke = P('#8a92a8', '#8a8a8a');
  const grid = emptyMotionGrid(width, height, skyTop);

  const ground = Math.max(3, Math.round(height * 0.8));
  const chaletX = Math.round(width * 0.56);

  // Cold night gradient.
  const skyBg: string[] = [];
  for (let y = 0; y < ground; y += 1) {
    const t = y / Math.max(1, ground - 1);
    const bg = t < 0.55 ? interpolateHex(skyTop, skyMid, t / 0.55) : interpolateHex(skyMid, skyLow, (t - 0.55) / 0.45);
    skyBg.push(bg);
    for (let x = 0; x < width; x += 1) {
      sceneCell(grid, x, y, ' ', bg, bg);
    }
  }

  const skyAt = (y: number): string => skyBg[clampNumber(Math.round(y), 0, skyBg.length - 1)] ?? skyMid;

  // Star field with a slow twinkle.
  const starCount = Math.floor(width * ground * 0.03);
  for (let s = 0; s < starCount; s += 1) {
    const sx = Math.floor(hashNoise(s, 31, 0) * width);
    const sy = Math.floor(hashNoise(s, 32, 0) * ground * 0.62);
    const twinkle = 0.5 + 0.5 * Math.sin(pulse * (0.06 + hashNoise(s, 33, 0) * 0.12) + s * 2.1);
    if (twinkle < 0.4) {
      continue;
    }

    const bright = hashNoise(s, 34, 0) * twinkle;
    sceneOverlay(grid, sx, sy, bright > 0.74 ? '•' : bright > 0.5 ? '·' : '˙', bright > 0.6 ? starBright : starDim);
  }

  // A pale band of Milky Way dust arching over the peaks.
  for (let s = 0; s < Math.floor(width * 1.4); s += 1) {
    const t = hashNoise(s, 61, 0);
    const sx = Math.floor(t * width);
    const sy = Math.floor(ground * (0.08 + t * 0.3) + (hashNoise(s, 62, 0) - 0.5) * ground * 0.1);
    if (sy >= 0 && sy < ground * 0.6 && hashNoise(s, 63, 0) > 0.38) {
      sceneOverlay(grid, sx, sy, '˙', interpolateHex(starDim, skyAt(sy), 0.45));
    }
  }

  // A shooting star stitches the sky every few seconds.
  const shootCycle = 90;
  const shootPhase = pulse % shootCycle;
  if (shootPhase < 5) {
    const shootSeed = Math.floor(pulse / shootCycle);
    const headX = Math.floor(width * (0.2 + hashNoise(shootSeed, 71, 0) * 0.5)) + shootPhase * 2;
    const headY = Math.max(1, Math.floor(ground * 0.08)) + shootPhase;
    for (let k = 0; k < 3; k += 1) {
      sceneOverlay(grid, headX - k * 2, headY - k, k === 0 ? '•' : k === 1 ? '·' : '˙', interpolateHex(starBright, skyMid, 0.2 + k * 0.3));
    }
  }

  // Full moon with crater shading and a faint halo.
  const moonX = Math.round(width * 0.2);
  const moonY = Math.round(ground * 0.2);
  const moonR = Math.max(1.4, height * 0.09);
  for (let y = Math.floor(moonY - moonR * 2.4); y <= Math.ceil(moonY + moonR * 2.4); y += 1) {
    if (y < 0 || y >= ground) {
      continue;
    }

    for (let x = Math.floor(moonX - moonR * 2.2); x <= Math.ceil(moonX + moonR * 2.2); x += 1) {
      if (x < 0 || x >= width) {
        continue;
      }

      const dx = (x - moonX) / 1.9;
      const dy = y - moonY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= moonR) {
        const crater = hashNoise(Math.round(dx * 3) + 9, Math.round(dy * 3) + 4, 0) > 0.68;
        sceneCell(grid, x, y, d < moonR * 0.6 ? '●' : '•', crater ? moonShade : moonCore, skyAt(y), d < moonR * 0.45);
      } else if (d <= moonR * 2.1 && hashNoise(x, y, 0) > 0.82) {
        sceneOverlay(grid, x, y, '˙', starDim);
      }
    }
  }

  // Two restrained ridgelines keep the Alpine setting without crowding the
  // chalet or swallowing the open snowy-night sky.
  const heroX = Math.round(width * 0.58);
  const ranges = [
    {base: Math.round(ground * 0.68), amp: 0.15, seed: 2, rock: rockShade, cliff: rockFace, snow: snowShade, snowLine: 0.38, hero: true},
    {base: Math.round(ground * 0.82), amp: 0.1, seed: 9, rock: rockFace, cliff: rockShade, snow: snowBright, snowLine: 0.5, hero: false}
  ];
  for (const range of ranges) {
    const crests: number[] = [];
    for (let x = 0; x < width; x += 1) {
      const ridge =
        Math.abs(Math.sin(x * 0.09 + range.seed)) * 0.6 +
        Math.abs(Math.sin(x * 0.23 + range.seed * 1.7)) * 0.3 +
        hashNoise(x, range.seed, 0) * 0.1;
      const hero = range.hero ? Math.exp(-Math.pow((x - heroX) / Math.max(2, width * 0.07), 2)) * height * 0.08 : 0;
      crests.push(Math.round(range.base - ridge * height * range.amp - hero));
    }

    for (let x = 0; x < width; x += 1) {
      const crest = crests[x] ?? range.base;
      const slope = Math.abs((crests[x + 1] ?? crest) - (crests[x - 1] ?? crest));
      for (let y = crest; y < ground; y += 1) {
        const depth = (y - crest) / Math.max(1, ground - crest);
        const snowy = depth < range.snowLine * (0.5 + hashNoise(x, range.seed + 40, 0) * 0.7);
        const fleck = hashNoise(x * 1.9, y * 2.7, range.seed);
        if (snowy) {
          const glyph = depth < 0.12 ? '░' : fleck > 0.55 ? '·' : ' ';
          sceneCell(grid, x, y, glyph, range.snow, interpolateHex(range.snow, range.rock, 0.35));
        } else if (slope >= 2 && depth < 0.75) {
          const glyph = fleck > 0.62 ? '▒' : fleck > 0.4 ? '░' : ' ';
          sceneCell(grid, x, y, glyph, range.cliff, range.rock);
        } else {
          const glyph = fleck > 0.9 ? '░' : ' ';
          const color = depth > 0.5 ? range.rock : interpolateHex(range.rock, skyAt(y), 0.2);
          sceneCell(grid, x, y, glyph, fleck > 0.9 ? rockHi : color, range.rock);
        }
      }
    }

    // Bright crest highlight along each ridgeline.
    for (let x = 0; x < width; x += 1) {
      const crest = crests[x] ?? range.base;
      sceneOverlay(grid, x, crest, '·', range.snow);
    }
  }

  // Recast the shoreline as a soft snowfield, then stage a generous exterior
  // view of the chalet. The warm facade and flanking trees are the foreground
  // focus; the moonlit ranges stay atmospheric rather than competing with it.
  for (let y = ground; y < height; y += 1) {
    const depth = (y - ground) / Math.max(1, height - 1 - ground);
    const bg = interpolateHex(snowShade, snowBright, 0.38 + depth * 0.34);
    for (let x = 0; x < width; x += 1) {
      const drift = Math.sin(x * 0.11 + y * 0.8) + Math.sin(x * 0.035 - y * 1.3);
      const glyph = hashNoise(x * 0.7, y * 3.1, 0) > 0.91 ? '·' : drift > 1.55 ? '˙' : ' ';
      sceneCell(grid, x, y, glyph, glyph === ' ' ? bg : snowBright, bg);
    }
  }

  const drawSnowyPine = (treeX: number, treeHeight: number, foreground = false): void => {
    const top = Math.max(1, ground - treeHeight);
    const rows = Math.max(2, ground - top);
    for (let row = 0; row < rows; row += 1) {
      const y = top + row;
      const half = Math.max(0, Math.round((row / Math.max(1, rows - 1)) * Math.min(4, treeHeight * 0.42)));
      for (let dx = -half; dx <= half; dx += 1) {
        const edge = Math.abs(dx) === half;
        const snowed = row % 2 === 0 && edge;
        const color = snowed ? snowBright : foreground ? evergreen : evergreenDeep;
        sceneOverlay(grid, treeX + dx, y, snowed ? '▲' : row === 0 ? '▲' : '▓', color);
      }
    }
    sceneOverlay(grid, treeX, ground, '│', chaletDark);
    sceneOverlay(grid, treeX, ground - 1, '▲', foreground ? evergreen : evergreenDeep);
  };

  const sideTrees = [
    {x: Math.round(width * 0.1), h: 6, foreground: true},
    {x: Math.round(width * 0.23), h: 4, foreground: false},
    {x: Math.round(width * 0.84), h: 5, foreground: false},
    {x: Math.round(width * 0.94), h: 7, foreground: true}
  ];
  for (const tree of sideTrees) {
    if (Math.abs(tree.x - chaletX) > 7) {
      drawSnowyPine(tree.x, Math.min(tree.h, Math.max(3, ground - 1)), tree.foreground);
    }
  }

  const houseHalf = Math.min(12, Math.max(6, Math.round(width * 0.12)));
  const ridgeY = Math.max(1, ground - 7);
  const eaveY = Math.max(ridgeY + 2, ground - 4);
  const wallLeft = chaletX - houseHalf + 2;
  const wallRight = chaletX + houseHalf - 2;

  // Timber facade and golden windows, seen clearly from outside.
  for (let y = eaveY + 1; y < ground; y += 1) {
    for (let x = wallLeft; x <= wallRight; x += 1) {
      const beam = y === eaveY + 1 || x === wallLeft || x === wallRight || (x - wallLeft) % 5 === 0;
      sceneCell(grid, x, y, beam ? '▓' : '░', beam ? chaletDark : chaletWall, chaletWall);
    }
  }

  const roofRise = Math.max(1, eaveY - ridgeY);
  for (let y = ridgeY; y <= eaveY; y += 1) {
    const span = Math.max(1, Math.round(((y - ridgeY + 1) / (roofRise + 1)) * houseHalf));
    for (let dx = -span; dx <= span; dx += 1) {
      const snowyEdge = y === ridgeY || Math.abs(dx) === span || (y === eaveY && Math.abs(dx) % 3 !== 1);
      sceneCell(
        grid,
        chaletX + dx,
        y,
        snowyEdge ? '▀' : '▓',
        snowyEdge ? snowBright : chaletRoof,
        snowyEdge ? snowShadow : chaletRoof
      );
    }
  }

  const windowY = Math.min(ground - 1, eaveY + 2);
  for (const windowX of [chaletX - Math.max(3, Math.round(houseHalf * 0.48)), chaletX + Math.max(3, Math.round(houseHalf * 0.48))]) {
    sceneCell(grid, windowX - 1, windowY, '▌', chaletGlow, chaletDark, true);
    sceneCell(grid, windowX, windowY, '╋', chaletDark, chaletGlow, true);
    sceneCell(grid, windowX + 1, windowY, '▐', chaletGlow, chaletDark, true);
  }

  const doorX = chaletX + 1;
  for (let y = Math.max(eaveY + 1, ground - 2); y < ground; y += 1) {
    sceneCell(grid, doorX, y, '█', chaletDark, chaletDark);
  }
  sceneOverlay(grid, doorX, ground - 2, '●', hollyGreen, true);
  sceneOverlay(grid, doorX, ground - 1, '•', hollyRed, true);

  // A strand of colored bulbs turns the chalet unmistakably festive.
  const lightColors = [hollyRed, garlandGold, hollyGreen, garlandGold];
  for (let x = wallLeft + 1; x < wallRight; x += 2) {
    const color = lightColors[Math.abs(x - wallLeft) % lightColors.length] ?? garlandGold;
    sceneOverlay(grid, x, eaveY, '•', color, true);
  }

  // Chimney smoke rises slowly while the snow itself keeps its established
  // fall speed and night-time drift below.
  const chimneyX = chaletX + Math.max(3, Math.round(houseHalf * 0.48));
  sceneCell(grid, chimneyX, Math.max(ridgeY, eaveY - 2), '█', chaletDark, chaletDark);
  for (let puff = 0; puff < 4; puff += 1) {
    const rise = (pulse * 0.16 + puff * 1.4) % 5;
    const puffY = eaveY - 3 - Math.floor(rise);
    const puffX = chimneyX + Math.round(Math.sin(pulse * 0.07 + puff * 1.8) * (1 + rise * 0.28));
    if (puffY >= 0) {
      sceneOverlay(grid, puffX, puffY, rise < 1.4 ? '░' : rise < 3 ? '·' : '˙', interpolateHex(smoke, skyAt(puffY), rise * 0.13));
    }
  }

  // A gently lit path gives the scene a welcoming point of entry.
  for (let y = ground; y < height; y += 1) {
    const spread = 1 + (y - ground);
    for (let dx = -spread; dx <= spread; dx += 1) {
      if ((dx + y) % 2 === 0) {
        sceneOverlay(grid, doorX + dx, y, '·', interpolateHex(chaletGlow, snowShade, 0.62));
      }
    }
  }

  // Gentle falling snow, nearer flakes drifting larger.
  const flakes = Math.floor(width * 0.5);
  for (let f = 0; f < flakes; f += 1) {
    const speed = winterPrecipitationSpeed(f);
    const fx = Math.floor(hashNoise(f, 52, 0) * width + Math.sin(pulse * 0.1 + f) * 2);
    const fy = Math.floor((hashNoise(f, 53, 0) * ground + pulse * speed) % (ground + 2));
    if (fx >= 0 && fx < width && fy >= 0 && fy < ground) {
      const cell = grid[fy]?.[fx];
      if (cell && cell.text === ' ') {
        const size = hashNoise(f, 54, 0);
        sceneOverlay(grid, fx, fy, size > 0.78 ? '•' : size > 0.4 ? '·' : '˙', snowBright);
      }
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

const ASCII_DITHER_RAMP = ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@';

function buildOrderedDither(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const ramp = themeContributionColors(theme);
  const t = pulse * 0.06;

  return Array.from({length: height}, (_, y) => {
    const cells: VisualCell[] = Array.from({length: width}, (_, x) => {
      const nx = x / Math.max(1, width - 1);
      const ny = y / Math.max(1, height - 1);
      const field =
        0.5 +
        0.25 * Math.sin((nx * 8 + t) * Math.PI) +
        0.2 * Math.cos((ny * 6 - t * 1.3) * Math.PI) +
        0.15 * Math.sin((nx + ny) * 10 * Math.PI + t * 2);
      const bayer = ((BAYER_4[y & 3]![x & 3] ?? 0) + 0.5) / 16;
      const value = clampNumber(field * 0.85 + bayer * 0.15, 0, 1);
      const glyphIndex = Math.min(ASCII_DITHER_RAMP.length - 1, Math.floor(value * ASCII_DITHER_RAMP.length));
      const colorIndex = Math.min(ramp.length - 1, Math.round(value * (ramp.length - 1)));
      return {
        text: ASCII_DITHER_RAMP[glyphIndex] ?? ' ',
        color: ramp[Math.max(1, colorIndex)] ?? accent
      };
    });
    return lineFromCells(cells, accent);
  });
}

function buildPixelCrush(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const ramp = themeContributionColors(theme);
  const blockW = 4;
  const blockH = 2;
  const cols = Math.ceil(width / blockW);
  const rows = Math.ceil(height / blockH);

  const cellsGrid = emptyMotionGrid(width, height, '#04050a');
  for (let by = 0; by < rows; by += 1) {
    for (let bx = 0; bx < cols; bx += 1) {
      const nx = bx / Math.max(1, cols - 1);
      const ny = by / Math.max(1, rows - 1);
      const field =
        0.5 +
        0.3 * Math.sin(nx * 5 + pulse * 0.09) +
        0.25 * Math.cos(ny * 4 - pulse * 0.07) +
        0.2 * Math.sin((nx + ny) * 7 + pulse * 0.05);
      const n = hashNoise(bx, by, Math.floor(pulse / 3));
      const value = clampNumber(field * 0.75 + n * 0.25, 0, 1);
      const colorIndex = Math.min(ramp.length - 1, Math.floor(value * (ramp.length - 1)));
      const glyph = value > 0.72 ? '█' : value > 0.5 ? '▓' : value > 0.3 ? '▒' : value > 0.15 ? '░' : ' ';
      const color = ramp[Math.max(1, colorIndex)] ?? accent;
      for (let dy = 0; dy < blockH; dy += 1) {
        for (let dx = 0; dx < blockW; dx += 1) {
          const x = bx * blockW + dx;
          const y = by * blockH + dy;
          if (x < width && y < height && glyph !== ' ') {
            paintCell(cellsGrid, x, y, glyph, color);
          }
        }
      }
    }
  }

  return cellsGrid.map(row => lineFromCells(row, accent));
}

function buildStormfront(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const palette =
    theme === 'mono'
      ? ['#080808', '#171717', '#292929', '#454545', '#696969', '#9a9a9a', '#e0e0e0']
      : ['#040912', '#091421', '#102338', '#1a344d', '#294c69', '#527998', '#a6bdd0'];
  const rainColor = theme === 'mono' ? '#d0d0d0' : '#8ec9ed';
  const grid = emptyMotionGrid(width, height, palette[0] ?? '#050a12');
  const flashSeed = Math.floor(pulse / 3);
  const flash = hashNoise(flashSeed, 9, 2) > 0.9 && pulse % 3 < 1.25;

  // Cloud layers taper into torn scud instead of ending on a shared horizon.
  // The per-column underside and full-height fade keep the shelf organically
  // connected to the rain beneath it.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const ny = y / Math.max(1, height - 1);
      const billow =
        0.64 +
        Math.sin(nx * 6.8 + pulse * 0.017 + ny * 2.1) * 0.19 +
        Math.cos(nx * 14.7 - pulse * 0.012 - ny * 4.3) * 0.14 +
        Math.sin((nx + ny) * 8.4 + pulse * 0.009) * 0.08;
      const raggedUnderside =
        0.5 +
        Math.sin(nx * 11.3 - pulse * 0.01) * 0.1 +
        Math.cos(nx * 4.1 + pulse * 0.006) * 0.08;
      const verticalFade = clampNumber(1 - ny / Math.max(0.2, raggedUnderside + 0.3), 0, 1);
      const tornScud = ny > 0.42
        ? Math.max(0, Math.sin(nx * 19.2 + ny * 13.4 + pulse * 0.013)) * Math.max(0, 1 - ny) * 0.22
        : 0;
      const ceiling = billow * verticalFade + tornScud;
      if (ceiling <= 0.1) {
        continue;
      }
      const value = clampNumber(ceiling + (flash ? 0.3 : 0), 0, 1);
      const level = Math.min(palette.length - 1, 1 + Math.floor(value * (palette.length - 1)));
      grid[y]![x] = {
        text: value > 0.72 ? '▓' : value > 0.38 ? '▒' : value > 0.18 ? '░' : '·',
        color: flash && value > 0.45 ? '#dceeff' : palette[level] ?? accent
      };
    }
  }

  if (flash) {
    let boltX = Math.round(width * (0.27 + hashNoise(flashSeed, 2, 0) * 0.46));
    const boltEnd = Math.max(2, Math.round(height * 0.72));
    for (let y = 1; y < boltEnd; y += 1) {
      if (y % 2 === 0) {
        boltX += hashNoise(y, flashSeed, 3) > 0.5 ? 1 : -1;
      }
      paintCell(grid, boltX, y, y % 3 === 0 ? '╲' : '│', '#ffffff');
    }
  }

  // Heavy seeded block drops advance toward increasing rows, so the rain reads
  // downward without relying on thin line glyphs that vary between terminals.
  const dropCount = Math.max(12, Math.floor(width * 0.7));
  for (let index = 0; index < dropCount; index += 1) {
    const speed = winterPrecipitationSpeed(index);
    const cycle = height + 8;
    const headY = Math.floor((hashNoise(index, 32, 0) * cycle + pulse * speed) % cycle) - 3;
    const baseX = Math.floor(hashNoise(index, 33, 0) * Math.max(1, width));
    const driftX = Math.floor(pulse * speed * 0.14);
    const x = (baseX + driftX) % Math.max(1, width);
    const length = 2 + Math.floor(hashNoise(index, 34, 0) * 3);
    for (let trail = 0; trail < length; trail += 1) {
      const y = headY - trail;
      if (y >= 0 && y < height) {
        const dropX = x - Math.floor(trail / 2);
        paintCell(
          grid,
          dropX,
          y,
          trail === 0 ? '█' : trail === length - 1 ? '░' : '▓',
          trail === 0 ? rainColor : palette[5] ?? rainColor
        );
      }
    }
    if (headY >= height - 1 && headY <= height + 1) {
      paintCell(grid, x, height - 1, '⌁', palette[6] ?? rainColor);
    }
  }

  // Sparse low mist suggests distance without covering the lower third.
  const mistY = Math.max(0, height - 3);
  for (let x = 0; x < width; x += 1) {
    if ((x + Math.floor(pulse * 0.03)) % 9 < 3) {
      paintCell(grid, x, mistY, '·', palette[3] ?? accent);
    }
  }

  // Keep one continuous storm sky behind both the cloud shelf and the open
  // rain. Applying it last preserves every glyph while avoiding the abrupt
  // empty lower half that made the scene look cut in two.
  for (let y = 0; y < height; y += 1) {
    const depth = y / Math.max(1, height - 1);
    const lift = flash ? 18 : 0;
    const backgroundColor = theme === 'mono'
      ? rgbColor(8 + Math.round(depth * 12) + lift, 8 + Math.round(depth * 12) + lift, 8 + Math.round(depth * 12) + lift)
      : rgbColor(4 + Math.round(depth * 5) + lift, 9 + Math.round(depth * 12) + lift, 18 + Math.round(depth * 18) + lift);
    for (let x = 0; x < width; x += 1) {
      const cell = grid[y]![x]!;
      grid[y]![x] = {...cell, backgroundColor};
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildCascade(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const glyphs = ['█', '▓', '▒', '░', '║', '│', '┊'];

  return Array.from({length: height}, (_, y) => {
    const cells: VisualCell[] = Array.from({length: width}, (_, x) => {
      const colSpeed = 0.7 + hashNoise(x, 1, 0) * 1.6;
      const head = ((pulse * colSpeed + hashNoise(x, 2, 0) * height * 3) % (height + 6)) - 2;
      const dist = head - y;
      if (dist < 0 || dist > height * 0.9) {
        // residual mist so columns feel thick
        const mist = hashNoise(x, y, Math.floor(pulse / 4));
        if (mist > 0.88) {
          return {text: '·', color: ramp[1] ?? accent};
        }
        return {text: ' ', color: accent};
      }
      const trail = 1 - dist / Math.max(4, height * 0.55);
      const bright = dist < 1.2;
      const gi = bright ? 0 : Math.min(glyphs.length - 1, Math.floor((1 - trail) * glyphs.length));
      const colorIndex = Math.min(ramp.length - 1, Math.floor(trail * (ramp.length - 1)));
      return {
        text: glyphs[gi] ?? '█',
        color: bright ? '#ffffff' : ramp[Math.max(1, colorIndex)] ?? accent,
        backgroundColor: trail > 0.55 ? ramp[Math.max(1, colorIndex - 1)] : undefined,
        bold: bright
      };
    });
    return lineFromCells(cells, accent);
  });
}

/** Closed-eye phosphenes — dense geometric pressure-patterns blooming from center. */
function buildPhosphene(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const palette =
    theme === 'mono'
      ? ['#0a0a0a', '#222222', '#444444', '#777777', '#aaaaaa', '#dddddd', '#ffffff']
      : ['#0a0618', '#1a0a40', '#3a1080', '#8020a0', '#c04080', '#e08040', '#f0d060', '#ffffff'];
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const glyphs = ['·', '░', '▒', '▓', '█'];

  return Array.from({length: height}, (_, y) => {
    const cells: VisualCell[] = Array.from({length: width}, (_, x) => {
      const dx = (x - cx) / Math.max(1, width * 0.5);
      const dy = (y - cy) / Math.max(1, height * 0.5);
      const r = Math.sqrt(dx * dx + dy * dy);
      const ang = Math.atan2(dy, dx);
      const rings = Math.sin(r * 14 - pulse * 0.22);
      const wedges = Math.sin(ang * 6 + pulse * 0.08);
      const spiral = Math.sin(r * 8 - ang * 3 + pulse * 0.12);
      const bloom = Math.exp(-r * r * 1.4) * (0.5 + 0.5 * Math.sin(pulse * 0.06));
      const field = clampNumber(
        0.35 + rings * 0.28 + wedges * 0.2 + spiral * 0.18 + bloom * 0.35,
        0,
        1
      );
      const band = Math.abs(rings) > 0.7 ? 0.2 : 0;
      const value = clampNumber(field + band, 0, 1);
      const level = Math.min(palette.length - 1, Math.floor(value * (palette.length - 0.01)));
      const gi = Math.min(glyphs.length - 1, Math.floor(value * glyphs.length));
      return {
        text: glyphs[gi] ?? '█',
        color: value > 0.85 ? '#ffffff' : palette[level] ?? accent,
        backgroundColor: palette[Math.max(0, level - 1)] ?? palette[0],
        bold: value > 0.8
      };
    });
    return lineFromCells(cells, accent);
  });
}

/** Slow solar system: dense star field, sun, banded planets with rings and moons. */
function buildPlanetarium(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const voidColor = theme === 'mono' ? '#050508' : '#040610';
  const grid = emptyMotionGrid(width, height, voidColor);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;

  // Milky-way dust band (behind everything)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x - cx) / Math.max(1, width * 0.5);
      const ny = (y - cy) / Math.max(1, height * 0.5);
      // Diagonal galactic plane
      const plane = Math.abs(nx * 0.35 + ny * 0.9);
      const dust =
        Math.exp(-plane * plane * 4.5) *
        (0.35 +
          0.25 * Math.sin(nx * 8 + pulse * 0.015) +
          0.2 * Math.sin(ny * 11 - pulse * 0.012) +
          hashNoise(x, y, 0) * 0.25);
      if (dust > 0.22) {
        const c =
          theme === 'mono'
            ? dust > 0.5
              ? '#2a2a38'
              : '#161620'
            : dust > 0.55
              ? '#2a1848'
              : dust > 0.35
                ? '#1a1030'
                : '#0e0c1c';
        paintCell(grid, x, y, dust > 0.5 ? '░' : '·', c);
      }
    }
  }

  // Dense multi-layer star field with color variety + twinkle
  const starCount = Math.floor((width * height) / 3.2);
  for (let s = 0; s < starCount; s += 1) {
    const sx = Math.floor(hashNoise(s, 1, 0) * width);
    const sy = Math.floor(hashNoise(s, 2, 0) * height);
    const twinkle = 0.45 + 0.55 * Math.sin(pulse * (0.08 + hashNoise(s, 3, 0) * 0.18) + s);
    const bright = hashNoise(s, 4, 0) * twinkle;
    if (bright < 0.18) {
      continue;
    }
    const huePick = hashNoise(s, 5, 0);
    let color: string;
    if (theme === 'mono') {
      color = bright > 0.8 ? '#ffffff' : bright > 0.5 ? '#bbbbbb' : '#777777';
    } else if (bright > 0.88) {
      color = '#ffffff';
    } else if (huePick > 0.82) {
      color = '#ffd0a0'; // warm
    } else if (huePick > 0.62) {
      color = '#a0c8ff'; // cool blue
    } else if (huePick > 0.45) {
      color = accent;
    } else {
      color = '#5a5a80';
    }
    const glyph = bright > 0.9 ? '✦' : bright > 0.75 ? '*' : bright > 0.55 ? '+' : bright > 0.35 ? '·' : '˙';
    paintCell(grid, sx, sy, glyph, color);
    // Tiny diffraction spikes on the brightest
    if (bright > 0.92) {
      paintCell(grid, sx - 1, sy, '·', color);
      paintCell(grid, sx + 1, sy, '·', color);
      paintCell(grid, sx, sy - 1, '·', color);
      paintCell(grid, sx, sy + 1, '·', color);
    }
  }

  // Soft colored nebula wash
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const ny = y / Math.max(1, height - 1);
      const neb =
        0.32 * Math.sin(nx * 3.2 + pulse * 0.018) * Math.cos(ny * 2.6 - pulse * 0.014) +
        0.18 * Math.sin((nx + ny) * 5.5 + pulse * 0.01) +
        0.12 * Math.cos(nx * 9 - ny * 4 + pulse * 0.008);
      const cell = grid[y]?.[x]?.text;
      if (neb > 0.2 && (cell === ' ' || cell === '˙' || cell === '·')) {
        const cool = neb > 0.32;
        paintCell(
          grid,
          x,
          y,
          cool ? '░' : '·',
          theme === 'mono' ? '#1a1a28' : cool ? '#1a1840' : '#141028'
        );
      }
    }
  }

  // Central sun with granulation, corona, and slow flares
  const sunR = Math.max(2.2, Math.min(width, height * 2) * 0.075);
  const sunColors =
    theme === 'mono'
      ? ['#3a3a3a', '#666666', '#999999', '#cccccc', '#ffffff']
      : ['#8a2000', '#c04000', '#ff7010', '#ffb028', '#ffe060', '#fff8c0', '#ffffff'];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - cx) / 1.95;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const ang = Math.atan2(dy, dx);
      if (d > sunR * 2.4) {
        continue;
      }
      const grain =
        0.08 * Math.sin(dx * 6 + pulse * 0.05) * Math.cos(dy * 5 - pulse * 0.04);
      const core = 1 - d / (sunR * 1.55);
      // Spiky corona / prominence
      const flare =
        d > sunR
          ? Math.pow(Math.max(0, 1 - (d - sunR) / (sunR * 0.9)), 1.8) *
            (0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(ang * 5 + pulse * 0.12)), 3))
          : 0;
      const heat = clampNumber(core + grain + flare * 0.85, 0, 1);
      if (heat < 0.12) {
        continue;
      }
      const ci = Math.min(sunColors.length - 1, Math.floor(heat * (sunColors.length - 0.01)));
      const glyph = heat > 0.78 ? '█' : heat > 0.5 ? '▓' : heat > 0.28 ? '▒' : '░';
      paintCell(grid, x, y, glyph, sunColors[ci] ?? accent);
    }
  }

  // Full solar-system cast (rocky + gas/ice + dwarf)
  type Planet = {
    orbit: number;
    size: number;
    speed: number;
    phase: number;
    colors: string[];
    rings?: boolean;
    bands?: boolean;
    moons?: number;
    atmosphere?: string;
  };

  const planets: Planet[] =
    theme === 'mono'
      ? [
          {orbit: 0.17, size: 0.65, speed: 0.12, phase: 0.15, colors: ['#777777', '#aaaaaa', '#dddddd']},
          {orbit: 0.27, size: 0.9, speed: 0.09, phase: 2.4, colors: ['#666666', '#999999', '#cccccc'], atmosphere: '#888888'},
          {orbit: 0.37, size: 1.05, speed: 0.07, phase: 4.55, colors: ['#555555', '#888888', '#bbbbbb', '#eeeeee'], bands: true, moons: 1, atmosphere: '#aaaaaa'},
          {orbit: 0.47, size: 0.8, speed: 0.055, phase: 1.35, colors: ['#666666', '#999999', '#cccccc']},
          {orbit: 0.58, size: 1.8, speed: 0.035, phase: 3.7, colors: ['#444444', '#777777', '#aaaaaa', '#dddddd'], bands: true, moons: 4},
          {orbit: 0.69, size: 1.7, speed: 0.025, phase: 5.65, colors: ['#555555', '#888888', '#bbbbbb'], rings: true, moons: 3},
          {orbit: 0.79, size: 1.25, speed: 0.018, phase: 0.65, colors: ['#4a4a4a', '#7a7a7a', '#aaaaaa'], rings: true, moons: 2},
          {orbit: 0.89, size: 1.15, speed: 0.014, phase: 2.85, colors: ['#404050', '#707080', '#a0a0b0'], moons: 1},
          {orbit: 0.97, size: 0.65, speed: 0.01, phase: 5.0, colors: ['#555555', '#888888', '#bbbbbb']}
        ]
      : [
          {orbit: 0.17, size: 0.65, speed: 0.12, phase: 0.15, colors: ['#6a6a6a', '#9a9a9a', '#c8c8c8', '#e8e8e8']},
          {orbit: 0.27, size: 0.9, speed: 0.09, phase: 2.4, colors: ['#a06030', '#d09050', '#f0c070', '#fff0b0'], atmosphere: '#ffc080'},
          {orbit: 0.37, size: 1.05, speed: 0.07, phase: 4.55, colors: ['#184070', '#2a70b0', '#50b0e8', '#a0e0ff', '#d8f4ff'], bands: true, moons: 1, atmosphere: '#60c0ff'},
          {orbit: 0.47, size: 0.8, speed: 0.055, phase: 1.35, colors: ['#802010', '#c04020', '#e07040', '#f0a070']},
          {orbit: 0.58, size: 1.85, speed: 0.035, phase: 3.7, colors: ['#a07040', '#d0a060', '#f0c888', '#fff0d0', '#ffffff'], bands: true, moons: 4},
          {orbit: 0.69, size: 1.7, speed: 0.025, phase: 5.65, colors: ['#a08840', '#d0b868', '#f0e0a0', '#fff8d0'], rings: true, moons: 3},
          {orbit: 0.79, size: 1.25, speed: 0.018, phase: 0.65, colors: ['#40a0a8', '#70d0d8', '#a8f0f4', '#d8ffff'], rings: true, moons: 2, atmosphere: '#80e0e8'},
          {orbit: 0.89, size: 1.15, speed: 0.014, phase: 2.85, colors: ['#2028a0', '#4048d0', '#7080ff', '#a0b0ff'], moons: 1, atmosphere: '#5060e0'},
          {orbit: 0.97, size: 0.65, speed: 0.01, phase: 5.0, colors: ['#807060', '#a09080', '#c0b0a0', '#e0d0c0']}
        ];

  // Faint orbital paths (denser sampling)
  for (const p of planets) {
    const orbitRx = p.orbit * width * 0.48;
    const orbitRy = p.orbit * height * 0.42;
    for (let a = 0; a < Math.PI * 2; a += 0.045) {
      const ox = Math.round(cx + Math.cos(a) * orbitRx);
      const oy = Math.round(cy + Math.sin(a) * orbitRy);
      const cell = grid[oy]?.[ox]?.text;
      if (cell === ' ' || cell === '·' || cell === '˙' || cell === '░') {
        paintCell(grid, ox, oy, '·', theme === 'mono' ? '#2a2a38' : '#1a2848');
      }
    }
  }

  for (const p of planets) {
    const angle = pulse * p.speed + p.phase;
    const orbitRx = p.orbit * width * 0.48;
    const orbitRy = p.orbit * height * 0.42;
    const px = cx + Math.cos(angle) * orbitRx;
    const py = cy + Math.sin(angle) * orbitRy;
    const behindSun = Math.sin(angle) < 0;
    const paintPlanetCell = (x: number, y: number, text: string, color: string): void => {
      const sunDx = (x - cx) / 1.95;
      const sunDy = y - cy;
      const hiddenBySun = behindSun && Math.sqrt(sunDx * sunDx + sunDy * sunDy) <= sunR * 1.55;
      if (!hiddenBySun) {
        paintCell(grid, x, y, text, color);
      }
    };
    // Light direction: toward the sun (center)
    const toSunX = cx - px;
    const toSunY = cy - py;
    const toSunLen = Math.sqrt(toSunX * toSunX + toSunY * toSunY) + 0.001;
    const lx = toSunX / toSunLen;
    const ly = toSunY / toSunLen;

    // Rings first (behind body)
    if (p.rings) {
      const ringColors =
        theme === 'mono' ? ['#666666', '#999999', '#cccccc'] : ['#a09060', '#d0b880', '#f0e0b0', '#807050'];
      for (let a = 0; a < Math.PI * 2; a += 0.035) {
        for (const scale of [1.55, 1.85, 2.15, 2.45]) {
          const rx = Math.round(px + Math.cos(a) * p.size * scale * 2.15);
          const ry = Math.round(py + Math.sin(a) * p.size * scale * 0.42);
          const ddx = (rx - px) / 2;
          const ddy = ry - py;
          if (ddx * ddx + ddy * ddy < p.size * p.size * 0.9) {
            continue;
          }
          // Cassini-ish gap
          if (scale > 1.9 && scale < 2.1 && hashNoise(rx, ry, 0) > 0.55) {
            continue;
          }
          const gi = Math.min(ringColors.length - 1, Math.floor((scale - 1.5) * 2));
          paintPlanetCell(rx, ry, scale > 2.2 ? '·' : '═', ringColors[gi] ?? accent);
        }
      }
    }

    // Thin atmosphere halo
    if (p.atmosphere) {
      const ar = p.size * 1.25;
      for (let dy = -Math.ceil(ar); dy <= Math.ceil(ar); dy += 1) {
        for (let dx = -Math.ceil(ar * 2); dx <= Math.ceil(ar * 2); dx += 1) {
          const nx = dx / 2 / ar;
          const ny = dy / ar;
          const d2 = nx * nx + ny * ny;
          if (d2 > 1 || d2 < 0.72) {
            continue;
          }
          paintPlanetCell(Math.round(px + dx), Math.round(py + dy), '·', p.atmosphere);
        }
      }
    }

    // Planet body with sun-facing lighting
    const pr = p.size;
    for (let dy = -Math.ceil(pr); dy <= Math.ceil(pr); dy += 1) {
      for (let dx = -Math.ceil(pr * 2); dx <= Math.ceil(pr * 2); dx += 1) {
        const nx = dx / 2 / pr;
        const ny = dy / pr;
        const d2 = nx * nx + ny * ny;
        if (d2 > 1) {
          continue;
        }
        // N·L lighting toward sun
        const ndx = nx;
        const ndy = ny;
        const ndz = Math.sqrt(Math.max(0, 1 - d2));
        const lambert = clampNumber(ndx * lx + ndy * ly + ndz * 0.55, 0.08, 1);
        let shade = lambert * (0.55 + 0.45 * (1 - d2));
        if (p.bands) {
          const band = 0.7 + 0.3 * Math.sin(ny * 9 + pulse * 0.04 + nx * 1.5);
          // Great-spot-ish oval on gas giants
          const spot = Math.exp(-Math.pow((nx - 0.25) / 0.35, 2) - Math.pow((ny - 0.15) / 0.2, 2));
          shade *= band * (1 - spot * 0.35);
          if (spot > 0.45) {
            shade *= 0.75;
          }
        }
        // Surface roughness on rocky worlds
        if (!p.bands && !p.rings) {
          shade *= 0.85 + 0.15 * hashNoise(Math.floor(px + dx), Math.floor(py + dy), 7);
        }
        const ci = Math.min(p.colors.length - 1, Math.floor(clampNumber(shade, 0, 0.99) * p.colors.length));
        const glyph = d2 > 0.78 ? '▒' : d2 > 0.45 ? '▓' : '█';
        paintPlanetCell(Math.round(px + dx), Math.round(py + dy), glyph, p.colors[ci] ?? accent);
      }
    }

    // Specular glint on lit limb
    const hx = Math.round(px + lx * pr * 0.55);
    const hy = Math.round(py + ly * pr * 0.45);
    paintPlanetCell(hx, hy, '·', '#ffffff');

    // Moons with tiny discs when large enough
    const moonCount = p.moons ?? 0;
    for (let m = 0; m < moonCount; m += 1) {
      const moonAngle = pulse * (p.speed * (2.8 + m * 0.9)) + p.phase * 2 + m * 1.7;
      const dist = p.size * (2.6 + m * 1.15) + 1.6;
      const mx = px + Math.cos(moonAngle) * dist * 1.65;
      const my = py + Math.sin(moonAngle) * dist * 0.72;
      const moonColor = theme === 'mono' ? '#bbbbbb' : m === 0 ? '#d0d0e0' : '#a0a0b8';
      paintPlanetCell(Math.round(mx), Math.round(my), m === 0 ? '●' : '·', moonColor);
      if (m === 0 && p.size > 1.5) {
        paintPlanetCell(Math.round(mx) + 1, Math.round(my), '·', moonColor);
      }
    }
  }

  // Dense asteroid belt (Mars–Jupiter) + Kuiper dust
  for (let a = 0; a < 90; a += 1) {
    const ang = pulse * 0.01 + a * 0.21 + hashNoise(a, 9, 0) * 0.4;
    const r = 0.34 + hashNoise(a, 10, 0) * 0.07;
    const ax = Math.round(cx + Math.cos(ang) * r * width * 0.48);
    const ay = Math.round(cy + Math.sin(ang) * r * height * 0.42);
    if (hashNoise(a, 11, Math.floor(pulse / 10)) > 0.28) {
      paintCell(grid, ax, ay, a % 5 === 0 ? '+' : '·', theme === 'mono' ? '#666666' : '#7a6a50');
    }
  }
  for (let a = 0; a < 40; a += 1) {
    const ang = pulse * 0.006 + a * 0.4 + hashNoise(a, 12, 0);
    const r = 0.88 + hashNoise(a, 13, 0) * 0.08;
    const ax = Math.round(cx + Math.cos(ang) * r * width * 0.48);
    const ay = Math.round(cy + Math.sin(ang) * r * height * 0.42);
    if (hashNoise(a, 14, Math.floor(pulse / 12)) > 0.4) {
      paintCell(grid, ax, ay, '·', theme === 'mono' ? '#444444' : '#4a4058');
    }
  }

  // Occasional comet with tail pointing away from sun
  const cometPhase = (pulse * 0.012) % 1;
  if (cometPhase < 0.85) {
    const cAng = pulse * 0.011 + 1.2;
    const cR = 0.55 + cometPhase * 0.35;
    const comX = cx + Math.cos(cAng) * cR * width * 0.48;
    const comY = cy + Math.sin(cAng) * cR * height * 0.42;
    paintCell(grid, Math.round(comX), Math.round(comY), '●', '#ffffff');
    // Tail away from sun
    for (let t = 1; t <= 8; t += 1) {
      const tx = Math.round(comX + (comX - cx) * 0.04 * t);
      const ty = Math.round(comY + (comY - cy) * 0.04 * t + Math.sin(t + pulse * 0.1) * 0.3);
      paintCell(grid, tx, ty, t < 3 ? '═' : t < 6 ? '·' : '˙', theme === 'mono' ? '#aaaaaa' : '#c0d8ff');
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function receiverArtPalette(theme: ThemeName, colors: string[]): string[] {
  if (theme !== 'mono') {
    return colors;
  }

  return ['#181818', '#303030', '#505050', '#777777', '#9a9a9a', '#bcbcbc', '#dddddd', '#ffffff'];
}

function receiverBandEnergy(pulse: number, startBand: number, samples = 6): number {
  let total = 0;
  for (let index = 0; index < samples; index += 1) {
    total += spectrumSample(startBand + index * 1.7, pulse + index * 0.11);
  }

  return total / Math.max(1, samples);
}

/** A deep-perspective indigo ocean rendered with restrained sumi marks. */
function buildSumiOcean(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const palette = receiverArtPalette(theme, ['#020817', '#06172c', '#092743', '#0d3c60', '#15567d', '#2777a1', '#66a9cc', '#d7edf5']);
  const grid = emptyMotionGrid(width, height, palette[0] ?? '#020817');
  const moonX = width * (0.73 + Math.sin(pulse * 0.006) * 0.015);
  const moonY = height * 0.22;
  const moonRadius = Math.max(1.1, height * 0.11);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - moonX) / 1.9;
      const dy = y - moonY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= moonRadius) {
        grid[y]![x] = {text: distance < moonRadius * 0.72 ? '█' : '▓', color: palette[7] ?? accent, bold: distance < moonRadius * 0.55};
      } else if (hashNoise(x, y, 0) > 0.992) {
        grid[y]![x] = {text: '·', color: palette[5] ?? accent};
      }
    }
  }

  const horizon = 0.4;
  const layers = [
    {base: 0.42, amp: 0.035, cycles: 15, speed: 0.009, color: 2, glyph: '·'},
    {base: 0.47, amp: 0.038, cycles: 12, speed: 0.012, color: 2, glyph: '░'},
    {base: 0.53, amp: 0.042, cycles: 10, speed: 0.016, color: 3, glyph: '░'},
    {base: 0.61, amp: 0.05, cycles: 8, speed: 0.021, color: 3, glyph: '▒'},
    {base: 0.71, amp: 0.06, cycles: 6.5, speed: 0.027, color: 4, glyph: '▒'},
    {base: 0.83, amp: 0.075, cycles: 5.2, speed: 0.034, color: 5, glyph: '▓'},
    {base: 0.96, amp: 0.1, cycles: 4.2, speed: 0.042, color: 5, glyph: '█'}
  ];
  const bass = receiverBandEnergy(pulse, 2);

  // The water plane grows darker and more textured toward the viewer. Far
  // water is quiet and compressed at the horizon; nearby water occupies more
  // screen space, producing a clear vanishing-depth read.
  const horizonRow = Math.max(0, Math.round(height * horizon));
  for (let y = horizonRow; y < height; y += 1) {
    const depth = (y - horizonRow) / Math.max(1, height - 1 - horizonRow);
    const colorIndex = Math.min(5, 2 + Math.floor(depth * 4));
    for (let x = 0; x < width; x += 1) {
      const texture = hashNoise(x, y, 41);
      const glyph = texture > 0.975
        ? ' '
        : depth > 0.68
          ? texture > 0.48 ? '▓' : '▒'
          : depth > 0.32
            ? texture > 0.62 ? '▒' : '░'
            : texture > 0.76 ? '░' : '·';
      grid[y]![x] = {text: glyph, color: palette[colorIndex] ?? accent};
    }
  }

  layers.forEach((layer, layerIndex) => {
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const phase = nx * layer.cycles * Math.PI * 2 + pulse * layer.speed + layerIndex * 1.9;
      const ridgeNoise = clampNumber(
        0.5 +
          Math.sin(phase) * 0.27 +
          Math.sin(phase * 1.83 + 0.9) * 0.16 +
          Math.cos(phase * 3.2 - 0.4) * 0.07,
        0,
        1
      );
      const near = layerIndex / Math.max(1, layers.length - 1);
      const ridgeY = Math.round(height * (layer.base + layer.amp * (1 - ridgeNoise * 2) - (near > 0.7 ? bass * 0.018 : 0)));
      const crest = layerIndex < 3 ? '─' : '━';
      paintCell(grid, x, ridgeY, crest, palette[Math.min(6, layer.color + 1)] ?? accent);
      if (ridgeY + 1 < height && layerIndex > 1) {
        paintCell(grid, x, ridgeY + 1, layer.glyph, palette[layer.color] ?? accent);
      }
      if (layerIndex > 3 && ridgeY > 0 && (x + layerIndex * 3) % 13 < 3 + Math.floor(near * 3)) {
        paintCell(grid, x, ridgeY - 1, layerIndex > 5 ? '▀' : '·', palette[6] ?? accent);
      }
    }
  });

  // A narrow moon path widens toward the foreground, reinforcing the same
  // perspective even in short terminal viewports.
  for (let y = horizonRow; y < height; y += 1) {
    const depth = (y - horizonRow) / Math.max(1, height - 1 - horizonRow);
    const reflectionHalfWidth = 1 + Math.floor(depth * Math.max(2, width * 0.045));
    const center = Math.round(moonX + Math.sin(y * 2.1 + pulse * 0.025) * reflectionHalfWidth * 0.45);
    for (let offset = -reflectionHalfWidth; offset <= reflectionHalfWidth; offset += 1) {
      if (hashNoise(offset + 30, y, Math.floor(pulse / 12)) > 0.48 + depth * 0.14) {
        paintCell(grid, center + offset, y, depth > 0.65 ? '━' : '─', palette[6] ?? accent);
      }
    }
  }

  // Two distant seabirds keep the horizon alive without making it busy.
  const birdX = Math.round(width * (0.24 + 0.04 * Math.sin(pulse * 0.01)));
  const birdY = Math.max(1, Math.round(height * 0.2));
  paintCell(grid, birdX - 1, birdY, '⌁', palette[6] ?? accent);
  paintCell(grid, birdX + 2, birdY + 1, '⌁', palette[5] ?? accent);

  // A blue water plane beneath the block texture removes isolated black gaps
  // while retaining the foreground-to-horizon depth bands.
  for (let y = horizonRow; y < height; y += 1) {
    const depth = (y - horizonRow) / Math.max(1, height - 1 - horizonRow);
    const backgroundIndex = depth > 0.68 ? 3 : depth > 0.28 ? 2 : 1;
    const backgroundColor = palette[backgroundIndex] ?? palette[1] ?? accent;
    for (let x = 0; x < width; x += 1) {
      const cell = grid[y]![x]!;
      grid[y]![x] = {...cell, backgroundColor};
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function rgbColor(red: number, green: number, blue: number): string {
  const channel = (value: number): string => Math.round(clampNumber(value, 0, 255)).toString(16).padStart(2, '0');
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function lineFromCells(cells: VisualCell[], fallbackColor: string): VisualLine {
  const text = cells.map(cell => cell.text).join('');
  const segments: VisualSegment[] = [];

  for (const cell of cells) {
    const invisibleForeground = cell.text.trim() === '' && cell.backgroundColor === undefined;
    const color = invisibleForeground ? fallbackColor : cell.color;
    const bold = invisibleForeground ? undefined : cell.bold;
    const previous = segments[segments.length - 1];
    if (
      previous &&
      previous.color === color &&
      previous.backgroundColor === cell.backgroundColor &&
      previous.bold === bold
    ) {
      previous.text += cell.text;
    } else {
      segments.push({
        text: cell.text,
        color,
        backgroundColor: cell.backgroundColor,
        bold
      });
    }
  }

  return {text, color: fallbackColor, segments};
}

function emptyMotionGrid(width: number, height: number, color: string): VisualCell[][] {
  return Array.from({length: height}, () => Array.from({length: width}, () => ({text: ' ', color})));
}

function motionColorAt(position: number, theme: ThemeName): string {
  if (theme === 'mono') {
    const mono = ['#767676', '#9a9a9a', '#b0b0b0', '#d0d0d0'];
    const index = Math.min(mono.length - 1, Math.max(0, Math.floor(position * mono.length)));
    return mono[index] ?? '#d0d0d0';
  }

  const palette = ['#6ee7f2', '#8df084', '#e7f75c', '#ffd24f', '#ff9345', '#ff3f8e', '#b56cff', '#66a3ff'];
  const index = Math.min(palette.length - 1, Math.max(0, Math.floor(position * palette.length)));
  return palette[index] ?? '#6ee7f2';
}

export function visualizerHeight(style: ReceiverStyle, availableRows: number, width = 80): number {
  const metadata = receiverStyleMetadata[style];
  const safeAvailableRows = Math.max(1, availableRows);
  const landscapeSafeRows = Math.max(metadata.maxRows, Math.floor(Math.max(1, width) / 3));
  const maxRows = Math.min(safeAvailableRows, landscapeSafeRows);

  // Never claim more rows than the parent can provide. Individual builders
  // already degrade gracefully below their preferred minimums.
  return Math.min(safeAvailableRows, Math.max(metadata.minRows, maxRows));
}

type CubePoint = {
  x: number;
  y: number;
  z: number;
};

function cubeVertices(): CubePoint[] {
  return [
    {x: -1, y: -1, z: -1},
    {x: 1, y: -1, z: -1},
    {x: -1, y: 1, z: -1},
    {x: 1, y: 1, z: -1},
    {x: -1, y: -1, z: 1},
    {x: 1, y: -1, z: 1},
    {x: -1, y: 1, z: 1},
    {x: 1, y: 1, z: 1}
  ];
}

type CubeFace = {
  normal: CubePoint;
  pointAt: (u: number, v: number) => CubePoint;
};

function cubeFaces(): CubeFace[] {
  return [
    {normal: {x: 0, y: 0, z: 1}, pointAt: (u, v) => ({x: u, y: v, z: 1})},
    {normal: {x: 0, y: 0, z: -1}, pointAt: (u, v) => ({x: -u, y: v, z: -1})},
    {normal: {x: 1, y: 0, z: 0}, pointAt: (u, v) => ({x: 1, y: v, z: -u})},
    {normal: {x: -1, y: 0, z: 0}, pointAt: (u, v) => ({x: -1, y: v, z: u})},
    {normal: {x: 0, y: 1, z: 0}, pointAt: (u, v) => ({x: u, y: 1, z: -v})},
    {normal: {x: 0, y: -1, z: 0}, pointAt: (u, v) => ({x: u, y: -1, z: v})}
  ];
}

function rotateCubePoint(point: CubePoint, angleX: number, angleY: number, angleZ: number): CubePoint {
  const cosX = Math.cos(angleX);
  const sinX = Math.sin(angleX);
  const cosY = Math.cos(angleY);
  const sinY = Math.sin(angleY);
  const cosZ = Math.cos(angleZ);
  const sinZ = Math.sin(angleZ);
  const yRotatedX = point.y * cosX - point.z * sinX;
  const zRotatedX = point.y * sinX + point.z * cosX;
  const xRotatedY = point.x * cosY + zRotatedX * sinY;
  const zRotatedY = -point.x * sinY + zRotatedX * cosY;

  return {
    x: xRotatedY * cosZ - yRotatedX * sinZ,
    y: xRotatedY * sinZ + yRotatedX * cosZ,
    z: zRotatedY
  };
}

function projectRotatedCubePoint(rotated: CubePoint, scaleX: number, scaleY: number, width: number, height: number): CubePoint {
  const perspective = 4.4 / (4.4 - rotated.z * 0.68);

  return {
    x: Math.round((width - 1) / 2 + rotated.x * scaleX * perspective),
    y: Math.round((height - 1) / 2 - rotated.y * scaleY * perspective),
    z: rotated.z
  };
}

function drawCubeSurfaces(
  grid: string[][],
  zBuffer: number[][],
  angleX: number,
  angleY: number,
  angleZ: number,
  scaleX: number,
  scaleY: number,
  width: number,
  height: number
): void {
  const light = normalizeCubePoint({x: -0.5, y: 0.72, z: 0.9});

  for (const face of cubeFaces()) {
    const normal = rotateCubePoint(face.normal, angleX, angleY, angleZ);
    if (normal.z <= 0.04) {
      continue;
    }

    const glyph = cubeSurfaceGlyph(clampNumber(dotCubePoint(normal, light) * 0.6 + 0.42, 0.08, 1));
    for (let u = -1; u <= 1.001; u += 0.07) {
      for (let v = -1; v <= 1.001; v += 0.07) {
        const rotated = rotateCubePoint(face.pointAt(u, v), angleX, angleY, angleZ);
        const projected = projectRotatedCubePoint(rotated, scaleX, scaleY, width, height);
        writeCubeSurfaceGlyph(grid, zBuffer, projected.x, projected.y, projected.z, glyph);
      }
    }
  }
}

function normalizeCubePoint(point: CubePoint): CubePoint {
  const length = Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z) || 1;
  return {
    x: point.x / length,
    y: point.y / length,
    z: point.z / length
  };
}

function dotCubePoint(left: CubePoint, right: CubePoint): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function cubeSurfaceGlyph(value: number): string {
  const chars = ['.', ':', '-', '=', '+', '*', '#', '%', '@'];
  return chars[Math.max(0, Math.min(chars.length - 1, Math.round(value * (chars.length - 1))))] ?? '+';
}

function writeCubeSurfaceGlyph(grid: string[][], zBuffer: number[][], x: number, y: number, z: number, glyph: string): void {
  const width = grid[0]?.length ?? 0;
  const height = grid.length;
  if (x < 0 || x >= width || y < 0 || y >= height || z < (zBuffer[y]?.[x] ?? Number.NEGATIVE_INFINITY)) {
    return;
  }

  grid[y]![x] = glyph;
  zBuffer[y]![x] = z;
}

function drawCubeEdgeZ(grid: string[][], zBuffer: number[][], from: CubePoint, to: CubePoint): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const z = from.z + (to.z - from.z) * t + 0.08;
    writeCubeSurfaceGlyph(grid, zBuffer, Math.round(from.x + dx * t), Math.round(from.y + dy * t), z, cubeEdgeGlyph(dx, dy, z, step));
  }
}

function cubeEdgeGlyph(dx: number, dy: number, depth: number, step: number): string {
  if (Math.abs(dx) > Math.abs(dy) * 2.3) {
    return depth > 0.62 ? '=' : '-';
  }

  if (Math.abs(dy) > Math.abs(dx) * 1.45) {
    return '|';
  }

  const diagonal = dx * dy > 0 ? '\\' : '/';
  return depth < -0.7 && step % 4 === 2 ? '.' : diagonal;
}

function cubeCornerGlyph(depth: number): string {
  if (depth > 0.78) {
    return '@';
  }

  if (depth > 0.28) {
    return '#';
  }

  if (depth < -0.78) {
    return '.';
  }

  return '+';
}

function hashNoise(x: number, y: number, pulse: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + pulse * 0.037) * 43758.5453;
  return value - Math.floor(value);
}

function winterPrecipitationSpeed(index: number): number {
  return 0.5 + hashNoise(index, 51, 0) * 0.8;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
