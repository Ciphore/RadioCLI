import type {ReceiverStyle, ThemeName} from '../../types.js';
import {themeAccent, themeContributionColors} from '../theme.js';

type VisualLine = {
  text: string;
  color: string;
  segments?: VisualSegment[];
};

type VisualSegment = {
  text: string;
  color: string;
};

type VisualCell = {
  text: string;
  color: string;
};

type Point = {
  x: number;
  y: number;
};

export const termflixAdditionalStyleNames = [
  'termflix-fire',
  'termflix-matrix',
  'termflix-plasma',
  'termflix-starfield',
  'termflix-waterfall',
  'termflix-radar',
  'wave',
  'life',
  'particles',
  'pendulum',
  'rain',
  'fountain',
  'flow',
  'spiral',
  'ocean',
  'aurora',
  'lightning',
  'smoke',
  'ripple',
  'snow',
  'garden',
  'fireflies',
  'dna',
  'pulse',
  'boids',
  'lava',
  'sandstorm',
  'petals',
  'campfire',
  'eclipse',
  'blackhole',
  'rainforest',
  'crystallize',
  'hackerman',
  'visualizer',
  'cells',
  'atom',
  'automata',
  'globe',
  'dragon',
  'sierpinski',
  'mandelbrot',
  'maze',
  'metaballs',
  'nbody',
  'langton',
  'sort',
  'tetris',
  'snake',
  'invaders',
  'pong',
  'flappy-bird',
  'reaction-diffusion',
  'voronoi'
] as const;

export type TermflixAdditionalStyle = (typeof termflixAdditionalStyleNames)[number];

const termflixAdditionalStyleSet = new Set<string>(termflixAdditionalStyleNames);
const densityChars = [' ', '.', ':', ';', '-', '=', '+', '*', '#', '%', '@'];
const blockChars = [' ', '░', '▒', '▓', '█'];
const sparkChars = ['.', ':', '*', '+', 'x', 'o', 'O', '@'];

export function isTermflixAdditionalStyle(style: ReceiverStyle): style is TermflixAdditionalStyle {
  return termflixAdditionalStyleSet.has(style);
}

export function buildTermflixVisualizer(
  style: TermflixAdditionalStyle,
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  if (width <= 0 || height <= 0) {
    return [];
  }

  switch (style) {
    case 'termflix-fire':
      return buildTermflixFire(pulse, width, height, theme);
    case 'termflix-matrix':
      return buildTermflixMatrix(pulse, width, height, theme);
    case 'termflix-starfield':
      return buildTermflixStarfield(pulse, width, height, theme);
    case 'termflix-waterfall':
      return buildTermflixWaterfall(pulse, width, height, theme);
    case 'termflix-radar':
      return buildTermflixRadar(pulse, width, height, theme);
    case 'particles':
      return buildParticles(pulse, width, height, theme);
    case 'pendulum':
      return buildPendulum(pulse, width, height, theme);
    case 'rain':
      return buildRain(pulse, width, height, theme);
    case 'fountain':
      return buildFountain(pulse, width, height, theme);
    case 'lightning':
      return buildLightning(pulse, width, height, theme);
    case 'snow':
      return buildSnow(pulse, width, height, theme);
    case 'garden':
      return buildGarden(pulse, width, height, theme);
    case 'fireflies':
      return buildFireflies(pulse, width, height, theme);
    case 'dna':
      return buildDna(pulse, width, height, theme);
    case 'pulse':
      return buildPulseRings(pulse, width, height, theme);
    case 'boids':
      return buildBoids(pulse, width, height, theme);
    case 'sandstorm':
      return buildSandstorm(pulse, width, height, theme);
    case 'petals':
      return buildPetals(pulse, width, height, theme);
    case 'campfire':
      return buildCampfire(pulse, width, height, theme);
    case 'eclipse':
      return buildEclipse(pulse, width, height, theme);
    case 'blackhole':
      return buildBlackhole(pulse, width, height, theme);
    case 'rainforest':
      return buildRainforest(pulse, width, height, theme);
    case 'hackerman':
      return buildHackerman(pulse, width, height, theme);
    case 'visualizer':
      return buildTermflixBars(pulse, width, height, theme);
    case 'atom':
      return buildAtom(pulse, width, height, theme);
    case 'globe':
      return buildGlobe(pulse, width, height, theme);
    case 'dragon':
      return buildDragon(pulse, width, height, theme);
    case 'sierpinski':
      return buildSierpinski(pulse, width, height, theme);
    case 'mandelbrot':
      return buildMandelbrot(pulse, width, height, theme);
    case 'maze':
      return buildMaze(pulse, width, height, theme);
    case 'nbody':
      return buildNBody(pulse, width, height, theme);
    case 'langton':
      return buildLangton(pulse, width, height, theme);
    case 'sort':
      return buildSort(pulse, width, height, theme);
    case 'tetris':
      return buildTetris(pulse, width, height, theme);
    case 'snake':
      return buildSnake(pulse, width, height, theme);
    case 'invaders':
      return buildInvaders(pulse, width, height, theme);
    case 'pong':
      return buildPong(pulse, width, height, theme);
    case 'flappy-bird':
      return buildFlappyBird(pulse, width, height, theme);
    case 'wave':
    case 'termflix-plasma':
    case 'life':
    case 'flow':
    case 'spiral':
    case 'ocean':
    case 'aurora':
    case 'smoke':
    case 'ripple':
    case 'lava':
    case 'crystallize':
    case 'cells':
    case 'automata':
    case 'metaballs':
    case 'reaction-diffusion':
    case 'voronoi':
      return buildFieldStyle(style, pulse, width, height, theme);
  }
}

export function termflixVisualizerHeight(style: ReceiverStyle, availableRows: number): number | null {
  if (!isTermflixAdditionalStyle(style)) {
    return null;
  }

  const maxRowsByStyle: Partial<Record<TermflixAdditionalStyle, number>> = {
    hackerman: 12,
    visualizer: 12,
    'termflix-matrix': 14,
    'termflix-radar': 14,
    'termflix-starfield': 14,
    'termflix-waterfall': 14,
    'termflix-fire': 14,
    'termflix-plasma': 14,
    sort: 12,
    snake: 12,
    pong: 12,
    'flappy-bird': 12,
    tetris: 14,
    invaders: 14,
    maze: 14,
    mandelbrot: 14,
    sierpinski: 14,
    dragon: 14,
    globe: 14,
    blackhole: 14,
    rainforest: 14,
    garden: 14,
    nbody: 14,
    langton: 14
  };

  const minimum = ['tetris', 'invaders', 'maze', 'globe', 'blackhole', 'mandelbrot', 'sierpinski', 'dragon', 'termflix-starfield'].includes(style)
    ? 8
    : 6;
  return Math.max(minimum, Math.min(maxRowsByStyle[style] ?? 14, availableRows));
}

function buildFieldStyle(
  style: TermflixAdditionalStyle,
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const palette = paletteFor(style, theme);
  const t = pulse * 0.085;

  return Array.from({length: height}, (_, y) => {
    const cells: VisualCell[] = [];
    for (let x = 0; x < width; x += 1) {
      const nx = width <= 1 ? 0 : (x / (width - 1)) * 2 - 1;
      const ny = height <= 1 ? 0 : (y / (height - 1)) * 2 - 1;
      const value = fieldValue(style, nx, ny, x, y, width, height, t, pulse);
      const char = fieldChar(style, value, nx, ny, t);
      cells.push({text: char, color: colorForValue(value, palette, accent)});
    }

    return lineFromCells(cells, accent);
  });
}

function fieldValue(
  style: TermflixAdditionalStyle,
  nx: number,
  ny: number,
  x: number,
  y: number,
  width: number,
  height: number,
  t: number,
  pulse: number
): number {
  switch (style) {
    case 'wave': {
      const wave =
        Math.sin(nx * 8.5 + t * 4.2) +
        Math.sin((nx + ny) * 6.0 - t * 3.2) +
        Math.cos((nx - ny) * 5.4 + t * 2.6);
      return clampNumber((wave + 3) / 6, 0, 1);
    }
    case 'termflix-plasma': {
      const radius = Math.sqrt(nx * nx + ny * ny);
      const value =
        Math.sin(nx * 9.5 + t * 3.4) +
        Math.sin(ny * 8.2 - t * 2.8) +
        Math.sin((nx + ny) * 7.2 + t * 2.2) +
        Math.cos(radius * 18.0 - t * 5.0);
      return clampNumber((value + 4) / 8, 0, 1);
    }
    case 'flow': {
      const angle = Math.sin(nx * 4.8 + t * 2.5) + Math.cos(ny * 5.8 - t * 2.1);
      const streamline = Math.sin((nx * Math.cos(angle) + ny * Math.sin(angle)) * 19 + t * 7.0);
      return clampNumber(0.45 + streamline * 0.42, 0, 1);
    }
    case 'spiral': {
      const radius = Math.sqrt(nx * nx + ny * ny);
      const theta = Math.atan2(ny, nx);
      const arms = Math.sin(theta * 5.0 + radius * 16.0 - t * 6.5);
      return clampNumber((arms + 1) * 0.5 * (1 - radius * 0.42), 0, 1);
    }
    case 'ocean': {
      const surface =
        -0.28 +
        0.12 * Math.sin(nx * 5.5 + t * 2.8) +
        0.07 * Math.sin(nx * 13.0 - t * 4.0);
      const foam = Math.exp(-Math.pow((ny - surface) / 0.08, 2));
      const depth = clampNumber((ny - surface + 0.75) / 1.65, 0, 1);
      const caustic = 0.22 * Math.sin((nx + depth) * 32 - t * 3.8);
      return clampNumber(foam * 0.95 + depth * 0.42 + caustic, 0, 1);
    }
    case 'aurora': {
      const curtain =
        Math.sin(nx * 7.0 + t * 2.2) * 0.22 +
        Math.sin(nx * 15.0 - t * 1.4) * 0.1 -
        0.25;
      const ribbon = Math.exp(-Math.pow((ny - curtain) / 0.32, 2));
      const shimmer = 0.18 * Math.sin((nx * 31.0 + y * 0.9) + t * 9.0);
      const topFade = clampNumber(1 - (ny + 1) * 0.55, 0, 1);
      return clampNumber(ribbon * topFade + shimmer, 0, 1);
    }
    case 'smoke': {
      const plume = Math.exp(-Math.pow(nx / (0.18 + (1 - ny) * 0.16), 2));
      const rise = clampNumber((ny + 1) / 2, 0, 1);
      const turbulence =
        0.45 +
        0.28 * Math.sin(nx * 12 + ny * 6 - t * 5.0) +
        0.18 * Math.cos(nx * 22 - ny * 9 + t * 3.5);
      return clampNumber(plume * (1 - rise * 0.35) * turbulence, 0, 1);
    }
    case 'ripple': {
      const sources = [
        {x: -0.48 + Math.sin(t * 0.8) * 0.12, y: -0.14},
        {x: 0.38, y: 0.28 + Math.cos(t * 0.9) * 0.18},
        {x: Math.sin(t * 0.6) * 0.3, y: -0.54}
      ];
      let value = 0;
      for (const source of sources) {
        const dx = nx - source.x;
        const dy = (ny - source.y) * 1.8;
        const distance = Math.sqrt(dx * dx + dy * dy);
        value += Math.sin(distance * 28 - t * 7.0) / (1 + distance * 4.2);
      }

      return clampNumber((value + 0.92) / 1.84, 0, 1);
    }
    case 'lava':
    case 'metaballs': {
      const blobs = style === 'lava' ? 6 : 8;
      let value = 0;
      for (let index = 0; index < blobs; index += 1) {
        const seed = index * 41 + 7;
        const bx = Math.sin(t * (0.55 + index * 0.04) + seed) * 0.68;
        const by = Math.cos(t * (0.72 + index * 0.05) + seed * 0.31) * 0.72;
        const dx = nx - bx;
        const dy = (ny - by) * 1.7;
        value += 0.055 / Math.max(0.025, dx * dx + dy * dy);
      }

      return clampNumber(style === 'lava' ? value * 0.86 : value * 0.72, 0, 1);
    }
    case 'life':
    case 'automata': {
      const scaleX = Math.max(1, Math.floor(width / 42));
      const scaleY = Math.max(1, Math.floor(height / 12));
      const cx = Math.floor(x / scaleX);
      const cy = Math.floor(y / scaleY);
      const generation = Math.floor(pulse / (style === 'life' ? 3 : 2));
      const neighborhood =
        hashNoise(cx - 1, cy, generation) +
        hashNoise(cx + 1, cy, generation) +
        hashNoise(cx, cy - 1, generation) +
        hashNoise(cx, cy + 1, generation);
      const live = hashNoise(cx + generation * 3, cy - generation * 2, 0) + neighborhood * 0.26;
      return live > (style === 'life' ? 1.75 : 1.62) ? 0.88 : live > 1.36 ? 0.42 : 0.02;
    }
    case 'cells': {
      const cellA = Math.sin(nx * 12 + t * 2.2) + Math.cos(ny * 10 - t * 1.7);
      const nucleus = Math.sin((nx * nx + ny * ny) * 18 - t * 4.3);
      return clampNumber((cellA + nucleus + 3) / 6, 0, 1);
    }
    case 'crystallize': {
      const radius = Math.sqrt(nx * nx + (ny * 1.7) * (ny * 1.7));
      const theta = Math.atan2(ny * 1.7, nx);
      const branch = Math.abs(Math.sin(theta * 6 + radius * 15));
      const growth = 0.18 + (pulse * 0.012) % 1.1;
      if (radius < 0.045) {
        return 1;
      }

      return radius < growth && branch > 0.72 ? branch : radius < growth * 0.82 && branch > 0.55 ? 0.48 : 0.02;
    }
    case 'reaction-diffusion': {
      const a = Math.sin(nx * 9.0 + Math.sin(ny * 4.0 + t) * 2.2 + t * 1.6);
      const b = Math.cos(ny * 10.0 + Math.cos(nx * 5.0 - t) * 2.0 - t * 1.3);
      const coral = Math.sin((a + b) * 4.5 + t * 3.0);
      return clampNumber((coral + 1) / 2, 0, 1);
    }
    case 'voronoi': {
      let first = Number.POSITIVE_INFINITY;
      let second = Number.POSITIVE_INFINITY;
      for (let index = 0; index < 9; index += 1) {
        const seed = index * 53 + 13;
        const sx = Math.sin(seed + t * (0.6 + index * 0.03));
        const sy = Math.cos(seed * 0.7 - t * (0.7 + index * 0.04));
        const distance = Math.sqrt(Math.pow(nx - sx * 0.9, 2) + Math.pow((ny - sy * 0.82) * 1.65, 2));
        if (distance < first) {
          second = first;
          first = distance;
        } else if (distance < second) {
          second = distance;
        }
      }

      return clampNumber(1 - (second - first) * 7.5, 0, 1);
    }
    default:
      return 0;
  }
}

function fieldChar(style: TermflixAdditionalStyle, value: number, nx: number, ny: number, t: number): string {
  if (style === 'flow') {
    const angle = Math.sin(nx * 5 + t * 2.0) + Math.cos(ny * 7 - t * 2.4);
    const flowChars = ['-', '\\', '|', '/', '~', '+'];
    return value < 0.18 ? ' ' : flowChars[Math.abs(Math.floor(angle * 4.0)) % flowChars.length] ?? '-';
  }

  if (style === 'life' || style === 'automata') {
    return value > 0.72 ? '█' : value > 0.3 ? '▒' : ' ';
  }

  if (style === 'crystallize') {
    return value > 0.72 ? '*' : value > 0.38 ? '+' : ' ';
  }

  if (style === 'cells') {
    return value > 0.72 ? 'O' : value > 0.52 ? 'o' : value > 0.34 ? '.' : ' ';
  }

  if (style === 'voronoi') {
    return value > 0.66 ? '#' : value > 0.45 ? '+' : value > 0.25 ? '.' : ' ';
  }

  if (style === 'lava' || style === 'metaballs') {
    return glyphFor(value, blockChars);
  }

  return glyphFor(value, densityChars);
}

function buildTermflixFire(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const colors = ['#1a0809', '#4a1714', '#8f2c1f', '#d94a2b', '#ff9345', '#ffd166', '#fff1a8'];
  const chars = [' ', '.', ':', '^', '~', '*', 'x', 'X', '#', '@'];
  const accent = themeAccent(theme);

  return Array.from({length: height}, (_, y) => {
    const cells: VisualCell[] = [];
    const vertical = 1 - y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const position = x / Math.max(1, width - 1);
      const center = 1 - Math.abs(position - 0.5) * 0.34;
      const lift = pulse * 0.38 + y * 0.92;
      const tongues =
        0.22 * Math.sin(x * 0.19 - lift) +
        0.17 * Math.sin(x * 0.07 + lift * 1.7) +
        0.11 * Math.cos(x * 0.31 - lift * 0.5);
      const spark = hashNoise(x, y, pulse * 3) > 0.975 && vertical > 0.45 ? 0.45 : 0;
      const heat = clampNumber(Math.pow(vertical, 1.15) * center + tongues + spark - y / Math.max(1, height) * 0.18, 0, 1);
      cells.push({text: glyphFor(heat, chars), color: colorForValue(heat, colors, accent)});
    }

    return lineFromCells(cells, accent);
  });
}

function buildTermflixMatrix(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&?';
  const colors = paletteFor('hackerman', theme);
  const accent = themeAccent(theme);

  return Array.from({length: height}, (_, y) => {
    const cells: VisualCell[] = [];
    for (let x = 0; x < width; x += 1) {
      if (x % 2 === 1) {
        cells.push({text: ' ', color: accent});
        continue;
      }

      const speed = 0.55 + hashNoise(x, 1, 0) * 1.85;
      const offset = hashNoise(x, 2, 0) * height * 2;
      const head = (pulse * speed + offset) % Math.max(1, height * 2) - height * 0.4;
      const distance = y - head;
      if (Math.abs(distance) < 0.55) {
        cells.push({text: chars[Math.floor(hashNoise(x, y, pulse) * chars.length)] ?? '0', color: '#ffffff'});
      } else if (distance > 0 && distance < 7 + hashNoise(x, 4, 0) * 8) {
        const value = 1 - distance / 15;
        cells.push({text: chars[Math.floor(hashNoise(x, y, pulse * 0.4) * chars.length)] ?? '1', color: colorForValue(value, colors, accent)});
      } else {
        cells.push({text: ' ', color: '#161b22'});
      }
    }

    return lineFromCells(cells, accent);
  });
}

function buildTermflixStarfield(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#767676');
  const count = Math.max(70, Math.min(240, Math.floor((width * height) / 7)));
  const cx = width / 2;
  const cy = height / 2;

  for (let star = 0; star < count; star += 1) {
    const angle = hashNoise(star, 1, 0) * Math.PI * 2;
    const speed = 0.28 + hashNoise(star, 2, 0) * 1.2;
    const lane = 0.18 + hashNoise(star, 3, 0) * 0.9;
    const depth = ((pulse * speed + star * 3.7) % 120) / 120;
    const radius = Math.pow(depth, 1.7) * Math.max(width * 0.62, height * 2.4) * lane;
    const x = Math.round(cx + Math.cos(angle) * radius);
    const y = Math.round(cy + Math.sin(angle) * radius * 0.42);
    const glyph = depth > 0.82 ? '@' : depth > 0.62 ? '*' : depth > 0.4 ? '+' : '.';
    const color = depth > 0.78 ? '#ffffff' : depth > 0.52 ? themeAccent(theme) : '#767676';
    setCell(grid, x, y, glyph, color);
  }

  return gridToLines(grid, themeAccent(theme));
}

function buildTermflixWaterfall(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#12385f');
  const accent = themeAccent(theme);
  const falls = Math.max(4, Math.min(11, Math.floor(width / 12)));

  for (let fall = 0; fall < falls; fall += 1) {
    const center = Math.round(width * (0.08 + hashNoise(fall, 1, 0) * 0.84));
    const streamWidth = 2 + Math.round(hashNoise(fall, 2, 0) * 4);
    for (let y = 0; y < height; y += 1) {
      const sway = Math.round(Math.sin(y * 0.4 + pulse * 0.16 + fall) * 2);
      for (let dx = -streamWidth; dx <= streamWidth; dx += 1) {
        const x = center + dx + sway;
        const flow = (pulse * 0.9 + y * 1.7 + fall * 9 + dx) % 9;
        const glyph = flow < 2 ? '|' : flow < 4 ? ':' : flow < 7 ? '.' : ' ';
        const color = y < height * 0.72 ? '#b9f6ff' : '#53a8ff';
        setCell(grid, x, y, glyph, color);
      }
    }
  }

  const splashY = height - 2;
  for (let mist = 0; mist < width; mist += 2) {
    const y = splashY + Math.round(Math.sin(mist * 0.3 + pulse * 0.2));
    setCell(grid, mist, y, hashNoise(mist, pulse, 0) > 0.45 ? '~' : '.', hashNoise(mist, pulse, 1) > 0.5 ? '#b9f6ff' : accent);
  }

  return gridToLines(grid, accent);
}

function buildTermflixRadar(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#123f3c');
  const accent = themeAccent(theme);
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const maxRadius = Math.min(width * 0.38, height * 0.78);
  const beam = pulse * 0.11;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - cx) / Math.max(1, width * 0.025);
      const dy = (y - cy) / Math.max(1, height * 0.095);
      const radius = Math.sqrt(dx * dx + dy * dy);
      if (radius > maxRadius) {
        continue;
      }

      const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
      const diff = (beam - angle + Math.PI * 2) % (Math.PI * 2);
      const ring = Math.abs(radius % 6);
      if (diff < 0.13) {
        setCell(grid, x, y, '█', '#8df084');
      } else if (diff < 0.8) {
        setCell(grid, x, y, glyphFor(1 - diff / 0.8, blockChars), '#26a641');
      } else if (ring < 0.35 || Math.abs(dx) < 0.15 || Math.abs(dy) < 0.15) {
        setCell(grid, x, y, '.', '#315f49');
      }
    }
  }

  for (let blip = 0; blip < 5; blip += 1) {
    const angle = blip * 1.21 + 0.5;
    const radius = maxRadius * (0.25 + hashNoise(blip, 2, 0) * 0.68);
    const x = Math.round(cx + Math.cos(angle) * radius * width * 0.025);
    const y = Math.round(cy + Math.sin(angle) * radius * height * 0.095);
    const sweepDiff = (beam - angle + Math.PI * 2) % (Math.PI * 2);
    setCell(grid, x, y, sweepDiff < 1.1 ? '●' : '.', sweepDiff < 1.1 ? '#fff1a8' : '#767676');
  }

  return gridToLines(grid, accent);
}

function buildParticles(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#767676');
  const palette = ['#ff5f87', '#ffd166', '#53a8ff', '#8df084', '#c06cff', '#ffffff'];
  const bursts = Math.max(4, Math.min(9, Math.floor(width / 18)));

  for (let burst = 0; burst < bursts; burst += 1) {
    const cycle = (pulse * 1.35 + burst * 11) % 42;
    const cx = Math.round(width * (0.12 + hashNoise(burst, 3, 0) * 0.76));
    const cy = Math.round(height * (0.14 + hashNoise(burst, 7, 0) * 0.44));
    const color = palette[burst % palette.length] ?? themeAccent(theme);
    if (cycle < 8) {
      const y = height - 1 - Math.round(cycle * (height / 12));
      drawLine(grid, cx, height - 1, cx, y, '|', '#767676');
      setCell(grid, cx, y, '^', color);
      continue;
    }

    const radius = (cycle - 8) * 0.34;
    const rays = 18 + (burst % 4) * 5;
    for (let ray = 0; ray < rays; ray += 1) {
      const angle = (ray / rays) * Math.PI * 2 + burst * 0.3;
      const x = Math.round(cx + Math.cos(angle) * radius * 2.0);
      const y = Math.round(cy + Math.sin(angle) * radius * 0.82 + (cycle - 8) * 0.04);
      const glyph = cycle < 20 ? sparkChars[ray % sparkChars.length] ?? '*' : ['.', ':', '`', "'"][ray % 4] ?? '.';
      setCell(grid, x, y, glyph, cycle < 26 ? color : '#767676');
    }
  }

  return gridToLines(grid, themeAccent(theme));
}

function buildPendulum(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const accent = themeAccent(theme);
  const grid = emptyGrid(width, height, '#767676');
  const count = Math.max(7, Math.min(17, Math.floor(width / 7)));
  const top = 1;
  const span = Math.max(1, width - 8);

  drawLine(grid, 2, top, width - 3, top, '-', '#767676');
  for (let index = 0; index < count; index += 1) {
    const anchorX = Math.round(4 + (index / Math.max(1, count - 1)) * span);
    const length = Math.max(3, height - 4 - Math.floor(index * 0.12));
    const angle = Math.sin(pulse * (0.065 + index * 0.0028) + index * 0.21) * 0.78;
    const bobX = Math.round(anchorX + Math.sin(angle) * length * 0.66);
    const bobY = Math.round(top + Math.cos(angle) * length * 0.72);
    const color = motionPalette(index / Math.max(1, count - 1), theme);
    drawLine(grid, anchorX, top + 1, bobX, bobY, '.', '#767676');
    setCell(grid, bobX, bobY, '●', color);
  }

  return gridToLines(grid, accent);
}

function buildRain(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#245760');
  const drops = Math.max(24, Math.min(95, Math.floor((width * height) / 9)));

  for (let index = 0; index < drops; index += 1) {
    const speed = 0.7 + hashNoise(index, 5, 0) * 1.4;
    const x = Math.round((hashNoise(index, 2, 0) * width + pulse * 0.24 * speed) % Math.max(1, width));
    const y = Math.round((hashNoise(index, 3, 0) * height + pulse * speed) % Math.max(1, height + 4)) - 2;
    const color = index % 5 === 0 ? '#b9f6ff' : '#53a8ff';
    setCell(grid, x, y, '|', color);
    setCell(grid, x - 1, y + 1, '/', '#1f6f8b');
  }

  for (let x = 0; x < width; x += 3) {
    const ripple = Math.sin(x * 0.45 + pulse * 0.3) > 0.25 ? '~' : '_';
    setCell(grid, x, height - 1, ripple, themeAccent(theme));
  }

  return gridToLines(grid, themeAccent(theme));
}

function buildFountain(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#315f70');
  const cx = Math.floor(width / 2);
  const basinY = height - 2;
  const jets = Math.max(20, Math.min(70, Math.floor(width * 0.55)));

  drawLine(grid, Math.max(0, cx - 16), basinY, Math.min(width - 1, cx + 16), basinY, '═', '#53a8ff');
  drawLine(grid, Math.max(0, cx - 12), basinY + 1, Math.min(width - 1, cx + 12), basinY + 1, '▔', '#1f6feb');
  for (let index = 0; index < jets; index += 1) {
    const phase = (pulse * 0.075 + hashNoise(index, 1, 0)) % 1;
    const angle = -Math.PI / 2 + (hashNoise(index, 2, 0) - 0.5) * 1.4;
    const power = 0.44 + hashNoise(index, 3, 0) * 0.56;
    const progress = phase;
    const arc = Math.sin(progress * Math.PI) * height * 0.78 * power;
    const x = Math.round(cx + Math.cos(angle) * progress * width * 0.33 * power);
    const y = Math.round(basinY + Math.sin(angle) * progress * height * 0.9 - arc * 0.18);
    const glyph = progress < 0.35 ? '|' : progress < 0.72 ? '*' : '.';
    setCell(grid, x, y, glyph, progress < 0.7 ? '#b9f6ff' : '#53a8ff');
  }

  return gridToLines(grid, themeAccent(theme));
}

function buildLightning(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#32384a');
  const active = pulse % 18 < 9;
  const startX = Math.round(width * (0.18 + hashNoise(Math.floor(pulse / 18), 1, 0) * 0.64));
  let x = startX;

  if (!active) {
    return gridToLines(grid, '#767676');
  }

  for (let y = 0; y < height; y += 1) {
    const drift = Math.round((hashNoise(y, Math.floor(pulse / 18), 0) - 0.48) * 5);
    const nextX = clampIndex(x + drift, width);
    drawLine(grid, x, y, nextX, y + 1, y % 2 === 0 ? '/' : '\\', '#ffffff');
    if (y % 4 === 1) {
      drawLine(grid, nextX, y, nextX + (drift >= 0 ? 5 : -5), y + 2, '.', '#b9f6ff');
    }

    x = nextX;
  }

  for (let y = 0; y < height; y += 2) {
    if (hashNoise(y, pulse, 1) > 0.7) {
      setCell(grid, clampIndex(startX + Math.round((hashNoise(y, pulse, 2) - 0.5) * width * 0.5), width), y, '*', themeAccent(theme));
    }
  }

  return gridToLines(grid, themeAccent(theme));
}

function buildSnow(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#767676');
  const flakes = Math.max(30, Math.min(120, Math.floor((width * height) / 8)));

  for (let index = 0; index < flakes; index += 1) {
    const speed = 0.22 + hashNoise(index, 4, 0) * 0.55;
    const sway = Math.sin(pulse * 0.08 + index) * 4;
    const x = Math.round((hashNoise(index, 1, 0) * width + sway + width) % Math.max(1, width));
    const y = Math.round((hashNoise(index, 2, 0) * height + pulse * speed) % Math.max(1, height + 3)) - 2;
    const glyph = index % 9 === 0 ? '*' : index % 3 === 0 ? '+' : '.';
    setCell(grid, x, y, glyph, index % 5 === 0 ? '#ffffff' : '#b9f6ff');
  }

  for (let x = 0; x < width; x += 1) {
    if (x % 5 !== 2) {
      setCell(grid, x, height - 1, '_', '#d0d0d0');
    }
  }

  return gridToLines(grid, themeAccent(theme));
}

function buildGarden(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#315f49');
  const groundY = height - 2;
  const growth = (Math.sin(pulse * 0.045) + 1) / 2;

  for (let x = 0; x < width; x += 1) {
    setCell(grid, x, groundY, x % 2 === 0 ? '_' : ' ', '#315f49');
    setCell(grid, x, height - 1, x % 3 === 0 ? '"' : '_', '#315f49');
  }

  for (let plant = 0; plant < Math.max(6, Math.floor(width / 10)); plant += 1) {
    const x = Math.round(3 + hashNoise(plant, 0, 0) * Math.max(1, width - 6));
    const size = 2 + Math.round((0.35 + hashNoise(plant, 5, 0) * 0.65) * growth * Math.max(2, height * 0.45));
    for (let offset = 0; offset < size; offset += 1) {
      setCell(grid, x, groundY - offset, '|', '#8df084');
      if (offset > 1 && offset % 2 === plant % 2) {
        setCell(grid, x - 1, groundY - offset, '/', '#5eead4');
        setCell(grid, x + 1, groundY - offset, '\\', '#5eead4');
      }
    }

    const flower = ['*', 'o', '@', '+'][plant % 4] ?? '*';
    setCell(grid, x, groundY - size, flower, plant % 2 === 0 ? '#ff5f87' : '#ffd166');
  }

  for (let drop = 0; drop < Math.max(8, width / 8); drop += 1) {
    const x = Math.round((hashNoise(drop, 11, 0) * width + pulse * 0.22) % Math.max(1, width));
    const y = Math.round((hashNoise(drop, 13, 0) * height + pulse * 0.5) % Math.max(1, height));
    setCell(grid, x, y, '|', '#53a8ff');
  }

  return gridToLines(grid, themeAccent(theme));
}

function buildFireflies(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#2f4368');
  const count = Math.max(16, Math.min(55, Math.floor(width / 2.2)));

  for (let index = 0; index < count; index += 1) {
    const x = Math.round(width * (0.05 + 0.9 * hashNoise(index, 1, 0)) + Math.sin(pulse * 0.05 + index) * 4);
    const y = Math.round(height * (0.12 + 0.76 * hashNoise(index, 2, 0)) + Math.cos(pulse * 0.04 + index * 1.7) * 2);
    const blink = (Math.sin(pulse * 0.28 + index * 2.1) + 1) / 2;
    const glyph = blink > 0.8 ? '*' : blink > 0.58 ? '.' : ' ';
    setCell(grid, x, y, glyph, blink > 0.8 ? '#fff1a8' : '#8df084');
  }

  return gridToLines(grid, themeAccent(theme));
}

function buildDna(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#767676');
  const cx = width / 2;
  const amplitude = Math.max(4, width * 0.18);

  for (let y = 0; y < height; y += 1) {
    const phase = y * 0.72 + pulse * 0.17;
    const leftX = Math.round(cx + Math.sin(phase) * amplitude);
    const rightX = Math.round(cx + Math.sin(phase + Math.PI) * amplitude);
    drawLine(grid, leftX, y, rightX, y, y % 2 === 0 ? '-' : '.', '#767676');
    setCell(grid, leftX, y, 'o', '#53a8ff');
    setCell(grid, rightX, y, 'o', '#ff5f87');
  }

  return gridToLines(grid, themeAccent(theme));
}

function buildPulseRings(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#3a3a3a');
  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.max(width * 0.52, height);
  const accent = themeAccent(theme);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - cx) / Math.max(1, width * 0.5);
      const dy = (y - cy) / Math.max(1, height * 0.5);
      const radius = Math.sqrt(dx * dx + dy * dy) * maxRadius;
      const band = (radius - pulse * 0.9 + maxRadius * 4) % 9;
      if (band < 0.9) {
        setCell(grid, x, y, band < 0.35 ? '█' : '·', band < 0.35 ? '#ffffff' : accent);
      }
    }
  }

  setCell(grid, Math.round(cx), Math.round(cy), '●', '#ff5f87');
  return gridToLines(grid, accent);
}

function buildBoids(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#2f4368');
  const count = Math.max(16, Math.min(60, Math.floor(width / 2.5)));

  for (let index = 0; index < count; index += 1) {
    const lane = hashNoise(index, 2, 0) * Math.PI * 2;
    const x = Math.round(width * (0.5 + 0.43 * Math.sin(pulse * 0.045 + lane + index * 0.11)));
    const y = Math.round(height * (0.5 + 0.36 * Math.cos(pulse * 0.055 + lane * 0.7)));
    const heading = Math.sin(pulse * 0.07 + index);
    const glyph = heading > 0.45 ? '>' : heading < -0.45 ? '<' : heading > 0 ? '^' : 'v';
    const color = motionPalette(index / Math.max(1, count - 1), theme);
    setCell(grid, x - Math.sign(heading), y, '.', '#767676');
    setCell(grid, x, y, glyph, color);
  }

  return gridToLines(grid, themeAccent(theme));
}

function buildSandstorm(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#6b5523');
  const particles = Math.max(60, Math.min(220, Math.floor(width * height / 3.2)));

  for (let index = 0; index < particles; index += 1) {
    const speed = 0.8 + hashNoise(index, 1, 0) * 2.4;
    const x = Math.round((hashNoise(index, 2, 0) * width + pulse * speed) % Math.max(1, width));
    const yBase = hashNoise(index, 3, 0) * height;
    const y = Math.round(yBase + Math.sin(pulse * 0.09 + x * 0.08) * 2) % Math.max(1, height);
    const glyph = index % 11 === 0 ? '*' : index % 3 === 0 ? ':' : '.';
    setCell(grid, x, y, glyph, index % 7 === 0 ? '#ffd166' : '#d08770');
  }

  for (let x = 0; x < width; x += 1) {
    const dune = height - 1 - Math.round((Math.sin(x * 0.13 + pulse * 0.04) + 1) * 1.6);
    setCell(grid, x, dune, '~', '#d08770');
  }

  return gridToLines(grid, themeAccent(theme));
}

function buildPetals(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#5b2444');
  const count = Math.max(22, Math.min(80, Math.floor(width / 1.7)));

  for (let index = 0; index < count; index += 1) {
    const speed = 0.28 + hashNoise(index, 4, 0) * 0.64;
    const x = Math.round((hashNoise(index, 1, 0) * width + pulse * speed + Math.sin(pulse * 0.05 + index) * 7) % Math.max(1, width));
    const y = Math.round((hashNoise(index, 2, 0) * height + pulse * speed * 0.42) % Math.max(1, height));
    const glyph = ['.', "'", '`', '*'][index % 4] ?? '.';
    setCell(grid, x, y, glyph, index % 3 === 0 ? '#ff9ab3' : '#ff5f87');
  }

  return gridToLines(grid, themeAccent(theme));
}

function buildCampfire(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#2d1218');
  const cx = Math.floor(width / 2);
  const baseY = height - 2;
  const chars = [' ', '.', ':', '^', '~', '*', 'x', 'X', '#', '@'];
  const colors = ['#2d1218', '#743127', '#b9482d', '#f26f35', '#ffc857', '#fff1a8'];

  drawLine(grid, cx - 10, baseY, cx + 1, baseY + 1, '/', '#7f4f37');
  drawLine(grid, cx + 10, baseY, cx - 1, baseY + 1, '\\', '#7f4f37');
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - cx) / Math.max(1, width * 0.16);
      const dy = (baseY - y) / Math.max(1, height * 0.72);
      if (dy < 0 || dy > 1.15) {
        continue;
      }

      const lick = Math.sin(dx * 3.4 + pulse * 0.42 - dy * 5.5) * 0.22 + Math.cos(dx * 6.2 - pulse * 0.31) * 0.16;
      const heat = clampNumber((1 - Math.abs(dx) * 0.78) * (1 - dy * 0.38) + lick - dy * 0.16, 0, 1);
      if (heat <= 0.1) {
        continue;
      }

      setCell(grid, x, y, glyphFor(heat, chars), colorForValue(heat, colors, themeAccent(theme)));
    }
  }

  for (let ember = 0; ember < 16; ember += 1) {
    const x = cx + Math.round((hashNoise(ember, 1, 0) - 0.5) * width * 0.28 + Math.sin(pulse * 0.07 + ember) * 3);
    const y = baseY - Math.round((pulse * 0.18 + ember * 1.7) % Math.max(1, height - 3));
    setCell(grid, x, y, '.', '#ffc857');
  }

  return gridToLines(grid, themeAccent(theme));
}

function buildEclipse(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#3a3a3a');
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width * 0.18, height * 0.66);
  const moonX = cx + Math.sin(pulse * 0.045) * radius * 1.5;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - cx) / Math.max(1, radius * 2.0);
      const dy = (y - cy) / Math.max(1, radius * 0.82);
      const sun = Math.sqrt(dx * dx + dy * dy);
      const mdx = (x - moonX) / Math.max(1, radius * 1.85);
      const moon = Math.sqrt(mdx * mdx + dy * dy);
      if (sun < 1 && moon > 0.86) {
        setCell(grid, x, y, sun < 0.86 ? '█' : '▒', '#ffd166');
      } else if (sun >= 1 && sun < 1.14) {
        setCell(grid, x, y, '.', '#fff1a8');
      } else if (sun < 1 && moon <= 0.86) {
        setCell(grid, x, y, ' ', '#161b22');
      }
    }
  }

  return gridToLines(grid, themeAccent(theme));
}

function buildBlackhole(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#3a244a');
  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - cx) / Math.max(1, width * 0.34);
      const dy = (y - cy) / Math.max(1, height * 0.65);
      const radius = Math.sqrt(dx * dx + dy * dy);
      const theta = Math.atan2(dy, dx);
      const disk = Math.exp(-Math.pow(dy * 5.2 + Math.sin(theta * 2 + pulse * 0.12) * 0.18, 2)) * (1 - radius * 0.35);
      const swirl = Math.sin(theta * 4 + radius * 20 - pulse * 0.35);
      const value = clampNumber(disk * 0.86 + swirl * 0.16, 0, 1);
      if (radius < 0.18) {
        setCell(grid, x, y, ' ', '#000000');
      } else if (value > 0.14) {
        setCell(grid, x, y, glyphFor(value, densityChars), value > 0.68 ? '#fff1a8' : value > 0.42 ? '#ff5f87' : '#a78bfa');
      }
    }
  }

  return gridToLines(grid, themeAccent(theme));
}

function buildRainforest(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#123f3c');
  const accent = themeAccent(theme);
  const horizon = Math.max(2, Math.floor(height * 0.34));

  for (let x = 0; x < width; x += 1) {
    const mountain = horizon + Math.round(Math.sin(x * 0.12 + pulse * 0.015) * 1.8 + Math.sin(x * 0.041) * 2.8);
    for (let y = mountain; y < height; y += 1) {
      const color = y > height * 0.72 ? '#315f49' : '#123f3c';
      setCell(grid, x, y, y % 2 === 0 ? '▓' : '▒', color);
    }
  }

  for (let tree = 0; tree < Math.max(10, width / 8); tree += 1) {
    const x = Math.round((hashNoise(tree, 2, 0) * width - pulse * 0.04 * (tree % 3)) % Math.max(1, width));
    const base = height - 2 - Math.round(hashNoise(tree, 3, 0) * height * 0.22);
    const trunkHeight = 2 + Math.round(hashNoise(tree, 5, 0) * 4);
    for (let offset = 0; offset < trunkHeight; offset += 1) {
      setCell(grid, x, base - offset, '|', '#7f4f37');
    }

    setCell(grid, x, base - trunkHeight, '♣', '#8df084');
    setCell(grid, x - 1, base - trunkHeight + 1, '*', '#5eead4');
    setCell(grid, x + 1, base - trunkHeight + 1, '*', '#5eead4');
  }

  for (let drop = 0; drop < width / 5; drop += 1) {
    const x = Math.round((hashNoise(drop, 8, 0) * width + pulse * 0.35) % Math.max(1, width));
    const y = Math.round((hashNoise(drop, 9, 0) * height + pulse * 0.7) % Math.max(1, height));
    setCell(grid, x, y, '|', '#53a8ff');
  }

  for (let bird = 0; bird < Math.max(2, width / 40); bird += 1) {
    const x = Math.round((pulse * 0.2 + bird * width * 0.37) % Math.max(1, width));
    const y = Math.max(0, Math.round(1 + hashNoise(bird, 13, 0) * Math.max(1, horizon - 1)));
    setCell(grid, x, y, pulse % 6 < 3 ? 'v' : '^', accent);
  }

  return gridToLines(grid, accent);
}

function buildHackerman(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const palette = paletteFor('hackerman', theme);
  const words = ['TRACE', 'AUTH', 'HASH', 'PORT', 'SYNC', 'ROOT', 'NODE', 'PING'];
  const hex = '0123456789ABCDEF';

  return Array.from({length: height}, (_, y) => {
    let text = '';
    if (y % 4 === 0) {
      const word = words[(y + Math.floor(pulse / 3)) % words.length] ?? 'TRACE';
      const percent = String((Math.floor(pulse * 3 + y * 17) % 100)).padStart(2, '0');
      text = `[${word}] ${percent}% `;
    }

    while (text.length < width) {
      const index = Math.floor(hashNoise(text.length + y * 11, y, pulse) * hex.length);
      text += hex[index] ?? '0';
      if (text.length % 5 === 0) {
        text += ' ';
      }
    }

    return {text: text.slice(0, width), color: palette[y % palette.length] ?? themeAccent(theme)};
  });
}

function buildTermflixBars(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const palette = themeContributionColors(theme);
  const bandCount = Math.max(8, Math.floor(width / 2));
  const levels = Array.from({length: bandCount}, (_, index) => {
    const value =
      Math.sin(index * 0.27 + pulse * 0.44) * 0.42 +
      Math.sin(index * 0.71 - pulse * 0.29) * 0.33 +
      Math.cos(index * 0.13 + pulse * 0.75) * 0.25;
    return Math.max(1, Math.round(((value + 1) / 2) * height));
  });

  return Array.from({length: height}, (_, y) => {
    const threshold = height - y;
    const cells: VisualCell[] = [];
    for (let index = 0; index < bandCount; index += 1) {
      const position = index / Math.max(1, bandCount - 1);
      const active = (levels[index] ?? 0) >= threshold;
      cells.push({text: active ? '█' : ' ', color: palette[Math.min(palette.length - 1, Math.floor(position * palette.length))] ?? themeAccent(theme)});
      cells.push({text: ' ', color: '#767676'});
    }

    return lineFromCells(cells.slice(0, width), themeAccent(theme));
  });
}

function buildAtom(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#3a3a3a');
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const rx = Math.max(5, width * 0.23);
  const ry = Math.max(2, height * 0.34);
  const accent = themeAccent(theme);

  for (let orbit = 0; orbit < 3; orbit += 1) {
    const tilt = orbit * Math.PI / 3;
    for (let step = 0; step < 120; step += 1) {
      const angle = (step / 120) * Math.PI * 2;
      const x = Math.round(cx + Math.cos(angle) * rx * Math.cos(tilt) - Math.sin(angle) * rx * 0.28 * Math.sin(tilt));
      const y = Math.round(cy + Math.sin(angle) * ry * Math.cos(tilt) + Math.cos(angle) * ry * 0.38 * Math.sin(tilt));
      if (step % 5 === 0) {
        setCell(grid, x, y, '.', '#767676');
      }
    }

    const electronAngle = pulse * 0.16 + orbit * Math.PI * 2 / 3;
    const ex = Math.round(cx + Math.cos(electronAngle) * rx * Math.cos(tilt) - Math.sin(electronAngle) * rx * 0.28 * Math.sin(tilt));
    const ey = Math.round(cy + Math.sin(electronAngle) * ry * Math.cos(tilt) + Math.cos(electronAngle) * ry * 0.38 * Math.sin(tilt));
    setCell(grid, ex, ey, '●', orbit === 0 ? '#53a8ff' : orbit === 1 ? '#ff5f87' : '#ffd166');
  }

  setCell(grid, cx, cy, '◎', accent);
  return gridToLines(grid, accent);
}

function buildGlobe(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#245760');
  const cx = width / 2;
  const cy = height / 2;
  const rx = Math.max(8, width * 0.24);
  const ry = Math.max(4, height * 0.42);
  const spin = pulse * 0.055;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const radius = nx * nx + ny * ny;
      if (radius > 1.02) {
        continue;
      }

      const z = Math.sqrt(Math.max(0, 1 - radius));
      const lon = Math.atan2(nx, z) + spin;
      const lat = Math.asin(clampNumber(ny, -1, 1));
      const meridian = Math.abs(Math.sin(lon * 6)) < 0.045;
      const parallel = Math.abs(Math.sin(lat * 8)) < 0.055;
      const land = Math.sin(lon * 2.4 + Math.cos(lat * 3.1) * 1.6) + Math.cos(lon * 5.1 - lat * 2.7) > 0.9;
      if (meridian || parallel) {
        setCell(grid, x, y, land ? '#' : '.', land ? '#8df084' : '#53a8ff');
      } else if (land && (x + y + Math.floor(pulse / 2)) % 3 === 0) {
        setCell(grid, x, y, '*', '#8df084');
      }
    }
  }

  return gridToLines(grid, themeAccent(theme));
}

function buildDragon(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#3a244a');
  const steps = Math.max(90, Math.min(900, Math.floor(width * height * 0.55)));
  const growth = Math.max(24, Math.floor(((pulse * 5) % steps)));
  let direction = Math.floor(pulse / 5) % 4;
  let x = Math.floor(width * 0.42);
  let y = Math.floor(height * 0.55);
  const moves = [
    {x: 1, y: 0},
    {x: 0, y: 1},
    {x: -1, y: 0},
    {x: 0, y: -1}
  ];

  for (let step = 1; step < growth; step += 1) {
    setCell(grid, x, y, step % 5 === 0 ? '*' : '.', motionPalette(step / Math.max(1, growth), theme));
    const lowBit = step & -step;
    const turnRight = ((lowBit << 1) & step) !== 0;
    direction = (direction + (turnRight ? 1 : 3)) % 4;
    const move = moves[direction] ?? moves[0]!;
    x = clampIndex(x + move.x, width);
    y = clampIndex(y + move.y, height);
  }

  return gridToLines(grid, themeAccent(theme));
}

function buildSierpinski(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const accent = themeAccent(theme);
  const zoom = 1 + (Math.sin(pulse * 0.03) + 1) * 0.8;
  return Array.from({length: height}, (_, y) => {
    const cells: VisualCell[] = [];
    for (let x = 0; x < width; x += 1) {
      const sx = Math.floor((x - width / 2) / zoom + width / 2);
      const sy = Math.floor((y + pulse * 0.08) / zoom);
      const filled = ((sx + sy) & sy) === 0;
      cells.push({text: filled ? '▲' : ' ', color: filled ? motionPalette(x / Math.max(1, width - 1), theme) : '#3a3a3a'});
    }

    return lineFromCells(cells, accent);
  });
}

function buildMandelbrot(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const accent = themeAccent(theme);
  const palette = paletteFor('mandelbrot', theme);
  const zoom = 1.0 + (Math.sin(pulse * 0.025) + 1) * 0.55;
  const centerX = -0.64 + Math.sin(pulse * 0.018) * 0.12;
  const centerY = Math.cos(pulse * 0.014) * 0.08;

  return Array.from({length: height}, (_, y) => {
    const cells: VisualCell[] = [];
    for (let x = 0; x < width; x += 1) {
      const cx = centerX + ((x / Math.max(1, width - 1)) - 0.5) * 3.0 / zoom;
      const cy = centerY + ((y / Math.max(1, height - 1)) - 0.5) * 2.2 / zoom;
      let zx = 0;
      let zy = 0;
      let iter = 0;
      const maxIter = 22;
      while (zx * zx + zy * zy <= 4 && iter < maxIter) {
        const nextX = zx * zx - zy * zy + cx;
        zy = 2 * zx * zy + cy;
        zx = nextX;
        iter += 1;
      }

      const value = iter / maxIter;
      cells.push({text: iter === maxIter ? '█' : glyphFor(value, densityChars), color: colorForValue(value, palette, accent)});
    }

    return lineFromCells(cells, accent);
  });
}

function buildMaze(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#3a3a3a');
  const cellW = 4;
  const cellH = 2;
  const cols = Math.max(4, Math.floor(width / cellW));
  const rows = Math.max(4, Math.floor(height / cellH));
  const reveal = Math.floor((pulse * 0.9) % Math.max(1, cols * rows));

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = col * cellW;
      const y = row * cellH;
      const openRight = hashNoise(col, row, 0) > 0.35;
      const openDown = hashNoise(col, row, 1) > 0.45;
      drawLine(grid, x, y, Math.min(width - 1, x + cellW), y, '─', '#767676');
      drawLine(grid, x, y, x, Math.min(height - 1, y + cellH), '│', '#767676');
      if (!openRight) {
        drawLine(grid, Math.min(width - 1, x + cellW), y, Math.min(width - 1, x + cellW), Math.min(height - 1, y + cellH), '│', '#767676');
      }

      if (!openDown) {
        drawLine(grid, x, Math.min(height - 1, y + cellH), Math.min(width - 1, x + cellW), Math.min(height - 1, y + cellH), '─', '#767676');
      }

      if (row * cols + col < reveal) {
        setCell(grid, Math.min(width - 1, x + 1), Math.min(height - 1, y + 1), '·', themeAccent(theme));
      }
    }
  }

  setCell(grid, 1, 1, 'S', '#8df084');
  setCell(grid, Math.max(0, width - 2), Math.max(0, height - 2), 'E', '#ff5f87');
  return gridToLines(grid, themeAccent(theme));
}

function buildNBody(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#3a244a');
  const cx = width / 2;
  const cy = height / 2;
  const bodies = 7;

  for (let body = 0; body < bodies; body += 1) {
    const radiusX = width * (0.08 + body * 0.035);
    const radiusY = height * (0.12 + body * 0.04);
    const speed = 0.04 + body * 0.008;
    for (let trail = 0; trail < 14; trail += 1) {
      const angle = pulse * speed - trail * 0.09 + body;
      const x = Math.round(cx + Math.cos(angle) * radiusX);
      const y = Math.round(cy + Math.sin(angle * 1.3) * radiusY);
      setCell(grid, x, y, trail === 0 ? '●' : '.', trail === 0 ? motionPalette(body / bodies, theme) : '#767676');
    }
  }

  setCell(grid, Math.round(cx), Math.round(cy), '✦', '#ffd166');
  return gridToLines(grid, themeAccent(theme));
}

function buildLangton(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#3a3a3a');
  const visited = new Set<string>();
  const moves = [
    {x: 1, y: 0},
    {x: 0, y: 1},
    {x: -1, y: 0},
    {x: 0, y: -1}
  ];
  let x = Math.floor(width / 2);
  let y = Math.floor(height / 2);
  let direction = 0;
  const steps = Math.min(900, Math.max(80, Math.floor(pulse * 9)));

  for (let step = 0; step < steps; step += 1) {
    const key = `${x},${y}`;
    const black = visited.has(key);
    direction = (direction + (black ? 3 : 1)) % 4;
    if (black) {
      visited.delete(key);
    } else {
      visited.add(key);
    }

    const move = moves[direction] ?? moves[0]!;
    x = (x + move.x + width) % Math.max(1, width);
    y = (y + move.y + height) % Math.max(1, height);
  }

  for (const key of visited) {
    const [sx, sy] = key.split(',').map(Number);
    if (Number.isFinite(sx) && Number.isFinite(sy)) {
      setCell(grid, sx ?? 0, sy ?? 0, '█', '#8df084');
    }
  }

  setCell(grid, x, y, ['>', 'v', '<', '^'][direction] ?? '>', themeAccent(theme));
  return gridToLines(grid, themeAccent(theme));
}

function buildSort(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const accent = themeAccent(theme);
  const bars = Math.max(12, Math.floor(width / 2));
  const values = Array.from({length: bars}, (_, index) => {
    const base = (index * 37) % bars;
    const progress = (pulse * 0.55) % bars;
    const sorted = index < progress;
    return sorted ? index / Math.max(1, bars - 1) : base / Math.max(1, bars - 1);
  });

  return Array.from({length: height}, (_, y) => {
    const threshold = 1 - y / Math.max(1, height - 1);
    const cells: VisualCell[] = [];
    for (let index = 0; index < bars; index += 1) {
      const value = values[index] ?? 0;
      const active = value >= threshold;
      const marker = Math.abs(index - ((pulse * 0.55) % bars)) < 1;
      cells.push({text: active ? '█' : ' ', color: marker ? '#ff5f87' : motionPalette(index / Math.max(1, bars - 1), theme)});
      cells.push({text: ' ', color: '#767676'});
    }

    return lineFromCells(cells.slice(0, width), accent);
  });
}

function buildTetris(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#3a3a3a');
  const boardW = Math.min(20, Math.max(10, Math.floor(width * 0.28)));
  const boardH = Math.min(height, 14);
  const left = Math.floor((width - boardW) / 2);
  const top = Math.max(0, Math.floor((height - boardH) / 2));
  const pieces: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [-1, 0], [1, 0], [2, 0]],
    [[0, 0], [1, 0], [0, 1], [-1, 1]],
    [[0, 0], [-1, 0], [1, 0], [1, 1]]
  ];

  drawLine(grid, left - 1, top, left - 1, top + boardH - 1, '│', '#767676');
  drawLine(grid, left + boardW, top, left + boardW, top + boardH - 1, '│', '#767676');
  drawLine(grid, left - 1, top + boardH - 1, left + boardW, top + boardH - 1, '─', '#767676');
  for (let row = 0; row < Math.max(2, boardH / 4); row += 1) {
    for (let x = 0; x < boardW; x += 2) {
      if (hashNoise(x, row, 0) > 0.42) {
        setCell(grid, left + x, top + boardH - 2 - row, '█', motionPalette(x / boardW, theme));
      }
    }
  }

  const piece = pieces[Math.floor(pulse / 10) % pieces.length] ?? pieces[0]!;
  const px = left + Math.floor(boardW / 2) + Math.round(Math.sin(pulse * 0.12) * boardW * 0.24);
  const py = top + Math.round((pulse * 0.32) % Math.max(1, boardH - 5));
  for (const [dx, dy] of piece) {
    setCell(grid, px + dx * 2, py + dy, '█', '#ff5f87');
    setCell(grid, px + dx * 2 + 1, py + dy, '█', '#ff5f87');
  }

  return gridToLines(grid, themeAccent(theme));
}

function buildSnake(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#315f49');
  const margin = 1;
  drawRect(grid, margin, margin, width - margin - 1, height - margin - 1, '#767676');
  const path: Point[] = [];
  const bodyLength = Math.max(10, Math.min(38, Math.floor(width / 2.4)));
  const usableW = Math.max(2, width - 4);
  const usableH = Math.max(2, height - 4);
  const headStep = Math.floor(pulse * 1.2);

  for (let index = 0; index < bodyLength; index += 1) {
    const step = headStep - index;
    const x = 2 + ((step % usableW) + usableW) % usableW;
    const y = 2 + (Math.floor(step / usableW) % usableH + usableH) % usableH;
    path.push({x, y});
  }

  path.forEach((point, index) => setCell(grid, point.x, point.y, index === 0 ? '@' : 'o', index === 0 ? '#ffd166' : '#8df084'));
  setCell(grid, 2 + Math.floor(hashNoise(Math.floor(pulse / 20), 1, 0) * usableW), 2 + Math.floor(hashNoise(Math.floor(pulse / 20), 2, 0) * usableH), '*', '#ff5f87');
  return gridToLines(grid, themeAccent(theme));
}

function buildInvaders(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#2f4368');
  const rows = 3;
  const cols = Math.max(5, Math.min(12, Math.floor(width / 8)));
  const offsetX = Math.round(Math.sin(pulse * 0.12) * 4);
  const top = 1;
  const left = Math.max(1, Math.floor((width - cols * 6) / 2) + offsetX);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = left + col * 6;
      const y = top + row * 2;
      const alien = pulse % 8 < 4 ? '/W\\' : '\\M/';
      writeText(grid, x, y, alien, row === 0 ? '#ff5f87' : '#8df084');
    }
  }

  const playerX = Math.round(width / 2 + Math.sin(pulse * 0.08) * width * 0.28);
  writeText(grid, playerX - 2, height - 2, '/A\\', themeAccent(theme));
  for (let shot = 0; shot < 4; shot += 1) {
    const y = height - 3 - Math.round((pulse * 0.9 + shot * 5) % Math.max(1, height - 5));
    setCell(grid, playerX + shot - 2, y, '|', '#ffd166');
  }

  return gridToLines(grid, themeAccent(theme));
}

function buildPong(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#3a3a3a');
  drawRect(grid, 0, 0, width - 1, height - 1, '#767676');
  for (let y = 1; y < height - 1; y += 2) {
    setCell(grid, Math.floor(width / 2), y, '│', '#767676');
  }

  const leftPaddle = Math.round((Math.sin(pulse * 0.11) + 1) * 0.5 * Math.max(1, height - 5)) + 1;
  const rightPaddle = Math.round((Math.cos(pulse * 0.1) + 1) * 0.5 * Math.max(1, height - 5)) + 1;
  drawLine(grid, 2, leftPaddle, 2, leftPaddle + 3, '█', '#53a8ff');
  drawLine(grid, width - 3, rightPaddle, width - 3, rightPaddle + 3, '█', '#ff5f87');
  const bx = Math.round(3 + ((Math.sin(pulse * 0.12) + 1) * 0.5) * Math.max(1, width - 7));
  const by = Math.round(1 + ((Math.sin(pulse * 0.18 + 1.5) + 1) * 0.5) * Math.max(1, height - 3));
  setCell(grid, bx, by, '●', '#ffd166');
  return gridToLines(grid, themeAccent(theme));
}

function buildFlappyBird(pulse: number, width: number, height: number, theme: ThemeName): VisualLine[] {
  const grid = emptyGrid(width, height, '#245760');
  const birdX = Math.max(4, Math.floor(width * 0.22));
  const birdY = Math.round(height * 0.48 + Math.sin(pulse * 0.22) * height * 0.22);

  for (let pipe = 0; pipe < Math.max(3, width / 24); pipe += 1) {
    const x = Math.round(width - ((pulse * 0.55 + pipe * 24) % Math.max(1, width + 24)));
    const gap = Math.round(height * (0.32 + hashNoise(pipe, 2, 0) * 0.36));
    const gapSize = Math.max(4, Math.floor(height * 0.32));
    for (let y = 0; y < height; y += 1) {
      if (y > gap - gapSize / 2 && y < gap + gapSize / 2) {
        continue;
      }

      writeText(grid, x, y, '██', '#8df084');
    }
  }

  writeText(grid, birdX - 1, birdY, pulse % 6 < 3 ? '<o>' : '<O/', '#ffd166');
  drawLine(grid, 0, height - 1, width - 1, height - 1, '_', '#315f49');
  return gridToLines(grid, themeAccent(theme));
}

function drawRect(grid: VisualCell[][], left: number, top: number, right: number, bottom: number, color: string): void {
  drawLine(grid, left, top, right, top, '─', color);
  drawLine(grid, left, bottom, right, bottom, '─', color);
  drawLine(grid, left, top, left, bottom, '│', color);
  drawLine(grid, right, top, right, bottom, '│', color);
}

function lineFromCells(cells: VisualCell[], fallbackColor: string): VisualLine {
  const text = cells.map(cell => cell.text).join('');
  const segments: VisualSegment[] = [];

  for (const cell of cells) {
    const previous = segments[segments.length - 1];
    if (previous && previous.color === cell.color) {
      previous.text += cell.text;
    } else {
      segments.push({text: cell.text, color: cell.color});
    }
  }

  return {text, color: fallbackColor, segments};
}

function emptyGrid(width: number, height: number, color: string): VisualCell[][] {
  return Array.from({length: height}, () => Array.from({length: width}, () => ({text: ' ', color})));
}

function gridToLines(grid: VisualCell[][], fallbackColor: string): VisualLine[] {
  return grid.map(row => lineFromCells(row, fallbackColor));
}

function setCell(grid: VisualCell[][], x: number, y: number, text: string, color: string): void {
  const row = grid[y];
  const cell = row?.[x];
  if (!cell) {
    return;
  }

  row![x] = cell.text === ' ' ? {text, color} : {text: cell.text === text ? text : '█', color: color === '#767676' ? cell.color : color};
}

function writeText(grid: VisualCell[][], x: number, y: number, text: string, color: string): void {
  for (let index = 0; index < text.length; index += 1) {
    setCell(grid, x + index, y, text[index] ?? ' ', color);
  }
}

function drawLine(grid: VisualCell[][], fromX: number, fromY: number, toX: number, toY: number, text: string, color: string): void {
  const steps = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY), 1);
  for (let step = 0; step <= steps; step += 1) {
    const ratio = step / steps;
    const x = Math.round(fromX + (toX - fromX) * ratio);
    const y = Math.round(fromY + (toY - fromY) * ratio);
    setCell(grid, x, y, text, color);
  }
}

function glyphFor(value: number, chars: readonly string[]): string {
  return chars[Math.max(0, Math.min(chars.length - 1, Math.floor(clampNumber(value, 0, 0.999) * chars.length)))] ?? ' ';
}

function colorForValue(value: number, palette: readonly string[], fallback: string): string {
  return palette[Math.max(0, Math.min(palette.length - 1, Math.floor(clampNumber(value, 0, 0.999) * palette.length)))] ?? fallback;
}

function paletteFor(style: TermflixAdditionalStyle, theme: ThemeName): string[] {
  if (theme === 'mono') {
    return ['#161b22', '#3a3a3a', '#767676', '#b0b0b0', '#d0d0d0'];
  }

  switch (style) {
    case 'campfire':
    case 'sandstorm':
    case 'eclipse':
      return ['#2d1218', '#743127', '#b9482d', '#f26f35', '#ffc857', '#fff1a8'];
    case 'rain':
    case 'fountain':
    case 'ocean':
    case 'ripple':
      return ['#0b1720', '#12385f', '#1f6feb', '#53a8ff', '#b9f6ff'];
    case 'garden':
    case 'rainforest':
    case 'life':
    case 'automata':
    case 'boids':
      return ['#07140e', '#123f3c', '#1f766c', '#5eead4', '#8df084'];
    case 'aurora':
    case 'fireflies':
      return ['#10142a', '#24474d', '#2dd4bf', '#8df084', '#fff1a8'];
    case 'blackhole':
    case 'dragon':
    case 'mandelbrot':
    case 'metaballs':
    case 'lava':
      return ['#080610', '#302047', '#7c5cff', '#ff5f87', '#ffd166'];
    case 'hackerman':
      return ['#0e4429', '#26a641', '#39d353', '#8df084'];
    default:
      return ['#161b22', '#245760', '#53a8ff', '#8df084', '#ffd166', '#ff5f87', themeAccent(theme)];
  }
}

function motionPalette(position: number, theme: ThemeName): string {
  if (theme === 'mono') {
    const mono = ['#767676', '#9a9a9a', '#b0b0b0', '#d0d0d0'];
    return mono[Math.min(mono.length - 1, Math.max(0, Math.floor(position * mono.length)))] ?? '#d0d0d0';
  }

  const palette = ['#6ee7f2', '#8df084', '#e7f75c', '#ffd24f', '#ff9345', '#ff3f8e', '#b56cff', '#66a3ff'];
  return palette[Math.min(palette.length - 1, Math.max(0, Math.floor(position * palette.length)))] ?? '#6ee7f2';
}

function hashNoise(x: number, y: number, pulse: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + pulse * 0.037) * 43758.5453;
  return value - Math.floor(value);
}

function clampIndex(value: number, length: number): number {
  return Math.max(0, Math.min(length - 1, value));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
