import type {PlaybackState, ReceiverStyle, Station, ThemeName} from '../../types.js';
import {truncate} from '../format.js';
import {themeAccent, themeContributionColors} from '../theme.js';
import {buildTermflixVisualizer, isTermflixAdditionalStyle, termflixVisualizerHeight} from './termflix-visualizers.js';

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

export function buildVisualizer(
  style: ReceiverStyle,
  pulse: number,
  width: number,
  height: number,
  station: Station | null,
  playback: PlaybackState,
  theme: ThemeName
): VisualLine[] {
  if (!playbackHasSignal(playback)) {
    return buildZeroSignalVisualizer(style, width, height, station, playback, theme);
  }

  if (isTermflixAdditionalStyle(style)) {
    return buildTermflixVisualizer(style, pulse, width, height, theme);
  }

  if (style === 'oscilloscope') {
    return buildScope(pulse, width, height).map(text => ({text, color: '#53a8ff'}));
  }

  if (style === 'waterfall') {
    return buildWaterfall(pulse, width, height, theme);
  }

  if (style === 'cassette') {
    return buildCassette(pulse, width, height, station);
  }

  if (style === 'equalizer') {
    return buildEqualizer(pulse, width, height, theme);
  }

  if (style === 'motion-bars') {
    return buildMotionBars(pulse, width, height, theme);
  }

  if (style === 'motion-blob') {
    return buildMotionBlob(pulse, width, height, theme);
  }

  if (style === 'motion-area') {
    return buildMotionArea(pulse, width, height, theme);
  }

  if (style === 'motion-dots') {
    return buildMotionDots(pulse, width, height, theme);
  }

  if (style === 'motion-contour') {
    return buildMotionContour(pulse, width, height, theme);
  }

  if (style === 'motion-braid') {
    return buildMotionBraid(pulse, width, height, theme);
  }

  if (style === 'radar') {
    return buildRadar(pulse, width, height, theme);
  }

  if (style === 'blocks') {
    return buildBlocks(pulse, width, height, theme);
  }

  if (style === 'leds') {
    return buildLeds(pulse, width, height, theme);
  }

  if (style === 'stars') {
    return buildStars(pulse, width, height, theme);
  }

  if (style === 'matrix') {
    return buildMatrix(pulse, width, height, theme);
  }

  if (style === 'hologram') {
    return buildHologram(pulse, width, height, theme);
  }

  if (style === 'cube') {
    return buildAsciiCube(pulse, width, height, theme);
  }

  if (style === 'fire') {
    return buildAsciiFire(pulse, width, height, theme);
  }

  if (style === 'fireworks') {
    return buildAsciiFireworks(pulse, width, height, theme);
  }

  if (style === 'plasma') {
    return buildAsciiPlasma(pulse, width, height, theme);
  }

  if (style === 'radio-waves') {
    return buildAsciiRadioWaves(pulse, width, height, theme);
  }

  if (style === 'raindrops') {
    return buildAsciiRaindrops(pulse, width, height, theme);
  }

  if (style === 'spinning-donut') {
    return buildAsciiDonut(pulse, width, height, theme);
  }

  if (style === 'starfield') {
    return buildAsciiStarfield(pulse, width, height, theme);
  }

  if (style === 'vu-meters') {
    return buildVuMeters(pulse, width, height, theme);
  }

  if (style === 'mesh') {
    return buildMesh(pulse, width, height, theme);
  }

  if (style === 'ribbon') {
    return buildRibbon(pulse, width, height, theme);
  }

  if (style === 'orbits') {
    return buildOrbits(pulse, width, height, theme);
  }

  if (style === 'vinyl') {
    return buildVinyl(pulse, width, height, theme);
  }

  if (style === 'mirror') {
    return buildMirror(pulse, width, height, theme);
  }

  if (style === 'soundwave') {
    return buildSoundwave(pulse, width, height, theme);
  }

  if (style === 'tunnel') {
    return buildTunnel(pulse, width, height, theme);
  }

  if (style === 'kaleidoscope') {
    return buildKaleidoscope(pulse, width, height, theme);
  }

  if (style === 'constellation') {
    return buildConstellation(pulse, width, height, theme);
  }

  if (style === 'pulse-grid') {
    return buildPulseGrid(pulse, width, height, theme);
  }

  if (style === 'lissajous') {
    return buildLissajous(pulse, width, height, theme);
  }

  if (style === 'braille-wave') {
    return buildBrailleWave(pulse, width, height, theme);
  }

  if (style === 'radial-eq') {
    return buildRadialEq(pulse, width, height, theme);
  }

  if (style === 'spectrogram') {
    return buildSpectrogram(pulse, width, height, theme);
  }

  if (style === 'nebula') {
    return buildNebula(pulse, width, height, theme);
  }

  if (style === 'silk') {
    return buildSilk(pulse, width, height, theme);
  }

  if (style === 'ripple-tank') {
    return buildRippleTank(pulse, width, height, theme);
  }

  if (style === 'phyllotaxis') {
    return buildPhyllotaxis(pulse, width, height, theme);
  }

  if (style === 'harmonograph') {
    return buildHarmonograph(pulse, width, height, theme);
  }

  if (style === 'bloom-bars') {
    return buildBloomBars(pulse, width, height, theme);
  }

  if (style === 'moire') {
    return buildMoire(pulse, width, height, theme);
  }

  if (style === 'galaxy') {
    return buildGalaxy(pulse, width, height, theme);
  }

  if (style === 'caustics') {
    return buildCaustics(pulse, width, height, theme);
  }

  if (style === 'lorenz') {
    return buildLorenz(pulse, width, height, theme);
  }

  if (style === 'fern') {
    return buildFern(pulse, width, height, theme);
  }

  if (style === 'chladni') {
    return buildChladni(pulse, width, height, theme);
  }

  if (style === 'spirograph') {
    return buildSpirograph(pulse, width, height, theme);
  }

  if (style === 'tesseract') {
    return buildTesseract(pulse, width, height, theme);
  }

  if (style === 'torus-knot') {
    return buildTorusKnot(pulse, width, height, theme);
  }

  if (style === 'spectrum-3d') {
    return buildSpectrum3d(pulse, width, height, theme);
  }

  if (style === 'tuning-dial') {
    return buildTuningDial(pulse, width, height, theme);
  }

  if (style === 'rf-constellation') {
    return buildRfConstellation(pulse, width, height, theme);
  }

  if (style === 'rotozoomer') {
    return buildRotozoomer(pulse, width, height, theme);
  }

  if (style === 'fractal-tree') {
    return buildFractalTree(pulse, width, height, theme);
  }

  if (style === 'julia') {
    return buildJulia(pulse, width, height, theme);
  }

  if (style === 'clifford') {
    return buildClifford(pulse, width, height, theme);
  }

  if (style === 'dejong') {
    return buildDeJong(pulse, width, height, theme);
  }

  if (style === 'truchet') {
    return buildTruchet(pulse, width, height, theme);
  }

  if (style === 'sphere') {
    return buildSphere(pulse, width, height, theme);
  }

  if (style === 'mobius') {
    return buildMobius(pulse, width, height, theme);
  }

  if (style === 's-meter') {
    return buildSMeter(pulse, width, height, theme);
  }

  if (style === 'goniometer') {
    return buildGoniometer(pulse, width, height, theme);
  }

  if (style === 'copper-bars') {
    return buildCopperBars(pulse, width, height, theme);
  }

  if (style === 'twister') {
    return buildTwister(pulse, width, height, theme);
  }

  if (style === 'coral') {
    return buildCoral(pulse, width, height, theme);
  }

  if (style === 'cyclone') {
    return buildCyclone(pulse, width, height, theme);
  }

  if (style === 'jellyfish') {
    return buildJellyfish(pulse, width, height, theme);
  }

  if (style === 'lava-lamp') {
    return buildLavaLamp(pulse, width, height, theme);
  }

  if (style === 'newton') {
    return buildNewton(pulse, width, height, theme);
  }

  if (style === 'prism') {
    return buildPrism(pulse, width, height, theme);
  }

  return buildSpectrum(pulse, width, height).map(text => ({text, color: '#ffb000'}));
}

function playbackHasSignal(playback: PlaybackState): boolean {
  return playback.state === 'playing' && playback.ready;
}

function buildZeroSignalVisualizer(
  _style: ReceiverStyle,
  width: number,
  height: number,
  _station: Station | null,
  _playback: PlaybackState,
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

function buildWaterfall(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const chars = [' ', '.', ':', ';', '+', '*', '#', '@'];
  const colors = themeContributionColors(theme);
  const rows: VisualLine[] = [];

  for (let y = 0; y < height; y++) {
    const age = y / Math.max(1, height - 1);
    const t = pulse * 0.92 - y * 1.35;
    let rowText = '';

    for (let x = 0; x < width; x++) {
      const position = x / Math.max(1, width - 1);
      const drift = Math.sin(t * 0.035) * width * 0.08;
      const carrierA = Math.exp(-Math.pow((x - (width * 0.22 + drift)) / 1.8, 2)) * 0.9;
      const carrierB = Math.exp(-Math.pow((x - (width * 0.55 - drift * 0.6)) / 1.35, 2)) * 1.0;
      const carrierC = Math.exp(-Math.pow((x - (width * 0.78 + Math.sin(t * 0.05) * width * 0.04)) / 2.4, 2)) * 0.72;
      const fallingStreak = Math.exp(-Math.pow(((x + y * 2.8 - pulse * 3.2) % 41) - 20, 2) / 58) * 0.42;
      const rainTexture = Math.abs(Math.sin(position * 48 + t * 0.72) * Math.cos(position * 19 - t * 0.38)) * 0.22;
      const fade = 1 - age * 0.44;
      const intensity = clampNumber((carrierA + carrierB + carrierC + fallingStreak + rainTexture) * fade, 0, 1);
      const charIdx = Math.min(chars.length - 1, Math.floor(intensity * chars.length));
      rowText += chars[charIdx]!;
    }

    let color = colors[1] ?? '#161b22';
    if (y === 0) {
      color = '#ffffff';
    } else if (y === 1) {
      color = colors[4] ?? '#ffffff';
    } else if (y === 2) {
      color = colors[3] ?? '#ffffff';
    } else if (y === 3) {
      color = colors[2] ?? '#ffffff';
    } else if (y === 4) {
      color = colors[1] ?? '#ffffff';
    }

    rows.push({
      text: rowText.slice(0, width),
      color
    });
  }

  return rows;
}

function buildCassette(
  pulse: number,
  width: number,
  _height: number,
  station: Station | null
): VisualLine[] {
  const spokeLeft = ['\\', '|', '/', '-'][pulse % 4];
  const spokeRight = ['/', '|', '\\', '-'][pulse % 4];

  const labelText1 = station ? truncate(station.name, 18).toUpperCase() : 'NO TUNE';
  const labelText2 = station?.codec ? `${station.codec.toUpperCase()} ${station.bitrate ?? ''} KBPS`.slice(0, 18) : 'FM STEREO';
  const lbl1 = labelText1.padStart(Math.floor((18 + labelText1.length) / 2)).padEnd(18);
  const lbl2 = labelText2.padStart(Math.floor((18 + labelText2.length) / 2)).padEnd(18);

  const rawLines = [
    `.------------------------------------------------------------.`,
    `| A-SIDE  RADIOCLI C-90        HIGH BIAS        NR  TYPE II |`,
    `|  .--------.      .------------------.      .--------.      |`,
    `|  |  ${spokeLeft}o${spokeLeft}   |======|${lbl1}|======|   ${spokeRight}o${spokeRight}  |      |`,
    `|  |  /_\\   |      |${lbl2}|      |   /_\\  |      |`,
    `|  '--------'      '------------------'      '--------'      |`,
    `|  o     o        [ PLAY ]  ==== TAPE ====        o     o    |`,
    `'------------------------------------------------------------'`
  ];

  return rawLines.map((content, index) => {
    const visualLength = content.length;
    const pad = Math.max(0, Math.floor((width - visualLength) / 2));
    const text = ' '.repeat(pad) + content + ' '.repeat(Math.max(0, width - visualLength - pad));

    let color = '#d4d8e1';
    if (index === 0 || index === 7) {
      color = '#767676';
    } else if (index === 2 || index === 3) {
      color = '#ffb000';
    } else if (index === 4) {
      color = '#53a8ff';
    }

    return {
      text: text.slice(0, width),
      color
    };
  });
}

function buildEqualizer(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const bandWidth = 3;
  const bandCount = Math.floor((width - 2) / bandWidth);

  const levels = Array.from({length: bandCount}, (_, i) => {
    const low = Math.sin(i * 0.18 + pulse * 0.46);
    const mid = Math.cos(i * 0.32 - pulse * 0.28);
    const high = Math.sin(i * 0.45 + pulse * 0.68);
    const normalized = (low * 0.4 + mid * 0.35 + high * 0.25 + 1) / 2;
    const eased = Math.pow(Math.max(0, Math.min(1, normalized)), 1.4);
    return Math.round(eased * height);
  });

  const peaks = Array.from({length: bandCount}, (_, i) => {
    let maxLvl = 0;
    for (let k = 0; k < 8; k++) {
      const p = (pulse - k + 240) % 240;
      const low = Math.sin(i * 0.18 + p * 0.46);
      const mid = Math.cos(i * 0.32 - p * 0.28);
      const high = Math.sin(i * 0.45 + p * 0.68);
      const normalized = (low * 0.4 + mid * 0.35 + high * 0.25 + 1) / 2;
      const eased = Math.pow(Math.max(0, Math.min(1, normalized)), 1.4);
      const lvl = Math.round(eased * height);
      if (lvl > maxLvl) {
        maxLvl = lvl;
      }
    }
    return maxLvl;
  });

  const rows: VisualLine[] = [];
  const colors = themeContributionColors(theme);

  for (let rowIndex = 0; rowIndex < height; rowIndex++) {
    const threshold = height - rowIndex;
    let rowText = ' ';

    for (let i = 0; i < bandCount; i++) {
      const lvl = levels[i]!;
      const peak = peaks[i]!;

      let bandChar = '  ';
      if (lvl >= threshold) {
        bandChar = '██';
      } else if (peak === threshold) {
        bandChar = '◆◆';
      } else {
        bandChar = '··';
      }

      rowText += bandChar + ' ';
    }

    let color = colors[2] ?? accent;
    if (rowIndex < Math.max(1, height * 0.3)) {
      color = '#ff5f87';
    } else if (rowIndex < Math.max(2, height * 0.6)) {
      color = colors[4] ?? accent;
    } else {
      color = colors[3] ?? accent;
    }

    rows.push({
      text: rowText.padEnd(width).slice(0, width),
      color
    });
  }

  return rows;
}

function buildMotionBars(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const h = Math.max(7, height);
  const mid = Math.floor(h / 2);
  const half = Math.max(1, Math.min(mid, h - mid - 1));
  const accent = themeAccent(theme);
  const levels = Array.from({length: width}, (_, x) => {
    if (x % 3 === 2) {
      return 0;
    }

    const position = x / Math.max(1, width - 1);
    const flicker = 0.9 + 0.1 * Math.sin(pulse * 0.74 + x * 0.77);
    return clampNumber(motionEnvelope(position, pulse, 0.2) * flicker, 0, 1);
  });

  return Array.from({length: h}, (_, y) => {
    const distance = Math.abs(y - mid);
    const cells: VisualCell[] = Array.from({length: width}, (_, x) => {
      const position = x / Math.max(1, width - 1);
      const level = levels[x] ?? 0;
      const limit = Math.max(1, Math.round(level * half));

      if (distance === 0) {
        return {text: x % 8 === 0 ? '┄' : '─', color: accent};
      }

      if (x % 3 === 2) {
        return {text: ' ', color: motionColorAt(position, theme)};
      }

      if (distance <= limit) {
        return {
          text: distance === limit ? '▓' : '█',
          color: motionColorAt(position, theme)
        };
      }

      if (distance === limit + 1 && x % 5 === 0) {
        return {text: '░', color: dimMotionColorAt(position, theme)};
      }

      return {text: ' ', color: motionColorAt(position, theme)};
    });

    return lineFromCells(cells, accent);
  }).slice(0, height);
}

function buildMotionBlob(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const h = Math.max(7, height);
  const mid = (h - 1) / 2;
  const half = Math.max(1, h / 2 - 1);
  const accent = themeAccent(theme);

  return Array.from({length: h}, (_, y) => {
    const normalizedY = Math.abs((y - mid) / half);
    const cells: VisualCell[] = Array.from({length: width}, (_, x) => {
      const position = x / Math.max(1, width - 1);
      const fade = 1 - Math.pow(position, 1.35) * 0.56;
      const outer = clampNumber(motionEnvelope(position, pulse, 1.1) * fade, 0, 1);
      const inner = clampNumber(outer * (0.42 + 0.16 * Math.sin(position * 17 - pulse * 0.3)), 0, 1);

      if (normalizedY <= inner) {
        return {text: '█', color: position > 0.56 ? '#5ab7ff' : '#a36bff'};
      }

      if (normalizedY <= outer) {
        return {text: '▓', color: position > 0.68 ? '#4bc9d9' : '#ff3f8e'};
      }

      if (normalizedY <= outer + 0.08 && x % 2 === 0) {
        return {text: '░', color: dimMotionColorAt(position, theme)};
      }

      if (Math.round(y) === Math.round(mid) && x % 7 === 0) {
        return {text: '·', color: accent};
      }

      return {text: ' ', color: accent};
    });

    return lineFromCells(cells, accent);
  }).slice(0, height);
}

function buildMotionArea(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const h = Math.max(8, height);
  const mid = Math.floor(h / 2);
  const accent = themeAccent(theme);
  const topLevels = Array.from({length: width}, (_, x) => {
    const position = x / Math.max(1, width - 1);
    return clampNumber(0.2 + motionEnvelope(position, pulse, 2.0) * 0.74, 0.1, 1);
  });
  const bottomLevels = Array.from({length: width}, (_, x) => {
    const position = x / Math.max(1, width - 1);
    return clampNumber(0.14 + motionEnvelope(1 - position, pulse + 37, 0.8) * 0.7, 0.08, 0.92);
  });

  return Array.from({length: h}, (_, y) => {
    const cells: VisualCell[] = Array.from({length: width}, (_, x) => {
      const position = x / Math.max(1, width - 1);
      const top = mid - Math.round((topLevels[x] ?? 0) * Math.max(1, mid - 1));
      const bottom = mid + Math.round((bottomLevels[x] ?? 0) * Math.max(1, h - mid - 2));

      if (y === mid) {
        return {text: x % 6 === 0 ? '━' : '─', color: accent};
      }

      if (y < mid && y >= top) {
        return {
          text: y === top ? '▄' : '█',
          color: position < 0.58 ? '#5fe6e0' : '#314c68'
        };
      }

      if (y > mid && y <= bottom) {
        return {
          text: y === bottom ? '▀' : '█',
          color: position < 0.55 ? '#ff3f8e' : '#a6346f'
        };
      }

      if ((y === top - 1 || y === bottom + 1) && x % 4 === 0) {
        return {text: '·', color: dimMotionColorAt(position, theme)};
      }

      return {text: ' ', color: accent};
    });

    return lineFromCells(cells, accent);
  }).slice(0, height);
}

function buildMotionDots(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const h = Math.max(8, height);
  const mid = (h - 1) / 2;
  const half = Math.max(1, h / 2 - 1);
  const accent = themeAccent(theme);

  return Array.from({length: h}, (_, y) => {
    const normalizedY = Math.abs((y - mid) / half);
    const cells: VisualCell[] = Array.from({length: width}, (_, x) => {
      if (x % 2 === 1) {
        return {text: ' ', color: accent};
      }

      const position = x / Math.max(1, width - 1);
      const level = motionEnvelope(position, pulse, 2.8);
      const texture = Math.sin(x * 1.73 + y * 2.91 + pulse * 0.7);

      if (normalizedY <= level && texture > -0.62) {
        return {text: '•', color: motionColorAt(position, theme)};
      }

      if (normalizedY <= level + 0.08 && texture > 0.46) {
        return {text: '·', color: dimMotionColorAt(position, theme)};
      }

      return {text: ' ', color: accent};
    });

    return lineFromCells(cells, accent);
  }).slice(0, height);
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

function buildMotionBraid(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const h = Math.max(8, height);
  const grid = emptyMotionGrid(width, h, themeAccent(theme));
  const mid = (h - 1) / 2;
  const half = Math.max(1, h / 2 - 1);
  const strands = 9;

  for (let strand = 0; strand < strands; strand += 1) {
    const phase = strand * 0.54;
    const strandColor = strand % 2 === 0 ? '#5fe6e0' : '#ff3f8e';
    for (let x = 0; x < width; x += 1) {
      const position = x / Math.max(1, width - 1);
      const level = motionEnvelope(position, pulse, 1.7);
      const envelope = clampNumber(0.15 + level * (1 - Math.abs(position - 0.5) * 0.42), 0.12, 0.98);
      const wave =
        Math.sin(position * Math.PI * 4.5 + pulse * 0.3 + phase) * envelope +
        Math.sin(position * Math.PI * 10.0 - pulse * 0.16 + phase) * envelope * 0.18;
      const nextWave =
        Math.sin((position + 0.02) * Math.PI * 4.5 + pulse * 0.3 + phase) * envelope +
        Math.sin((position + 0.02) * Math.PI * 10.0 - pulse * 0.16 + phase) * envelope * 0.18;
      const y = clampIndex(Math.round(mid + wave * half * 0.82), h);
      const slope = nextWave - wave;
      const glyph = slope > 0.05 ? '╲' : slope < -0.05 ? '╱' : '─';
      const color = theme === 'mono' ? motionColorAt(position, theme) : strandColor;
      setMotionCell(grid, x, y, glyph, color);
    }
  }

  return grid.map(row => lineFromCells(row, themeAccent(theme))).slice(0, height);
}

function buildRadar(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const maxRadius = Math.min(cx, cy * 2.2);

  const rows: VisualLine[] = [];
  const beamAngle = (pulse * 0.12) % (2 * Math.PI);

  const targets = [
    { r: maxRadius * 0.4, theta: 1.2, size: 2 },
    { r: maxRadius * 0.75, theta: 3.8, size: 3 },
    { r: maxRadius * 0.55, theta: 5.1, size: 2 },
  ];

  for (let y = 0; y < height; y++) {
    let rowText = '';
    const dy = (y - cy) * 2.0;

    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const r = Math.sqrt(dx * dx + dy * dy);
      const angle = (Math.atan2(dy, dx) + 2 * Math.PI) % (2 * Math.PI);

      const isRing = Math.abs(r - maxRadius) < 0.8 || Math.abs(r - maxRadius * 0.5) < 0.6;
      const isCross = (Math.abs(dx) < 0.6 && r < maxRadius) || (Math.abs(dy) < 0.6 && r < maxRadius);

      let angleDiff = (beamAngle - angle + 2 * Math.PI) % (2 * Math.PI);

      let targetIntensity = 0;
      for (const target of targets) {
        const trX = cx + target.r * Math.cos(target.theta);
        const trY = cy + (target.r * Math.sin(target.theta)) / 2.0;
        const distToTarget = Math.sqrt((x - trX) * (x - trX) + (y - trY) * 2 * (y - trY) * 2);

        if (distToTarget < target.size) {
          const tDiff = (beamAngle - target.theta + 2 * Math.PI) % (2 * Math.PI);
          if (tDiff < 2.0) {
            targetIntensity = 1.0 - tDiff / 2.0;
          }
        }
      }

      if (r > maxRadius + 1) {
        rowText += ' ';
      } else if (targetIntensity > 0.1) {
        rowText += targetIntensity > 0.6 ? '█' : '▓';
      } else if (angleDiff < 0.15 && r < maxRadius) {
        rowText += '█';
      } else if (angleDiff < 1.0 && r < maxRadius) {
        const shadeChars = ['░', '▒', '▓'];
        const idx = Math.min(2, Math.floor((1.0 - angleDiff) * 3));
        rowText += shadeChars[idx]!;
      } else if (isRing) {
        rowText += '·';
      } else if (isCross) {
        rowText += '┼';
      } else {
        rowText += ' ';
      }
    }

    rows.push({
      text: rowText.padEnd(width).slice(0, width),
      color: accent
    });
  }

  return rows;
}

function buildBlocks(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const bandWidth = 2;
  const bandCount = Math.floor((width - 1) / bandWidth);
  const blockSymbols = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

  const levels = Array.from({length: bandCount}, (_, i) => {
    const low = Math.sin(i * 0.15 + pulse * 0.32);
    const mid = Math.cos(i * 0.28 - pulse * 0.18);
    const high = Math.sin(i * 0.41 + pulse * 0.48);
    const normalized = (low * 0.4 + mid * 0.35 + high * 0.25 + 1) / 2;
    const eased = Math.pow(Math.max(0, Math.min(1, normalized)), 1.3);
    return Math.round(eased * height * 8);
  });

  const rows: VisualLine[] = [];
  const colors = themeContributionColors(theme);

  for (let rowIndex = 0; rowIndex < height; rowIndex++) {
    const threshold = (height - rowIndex) * 8;
    let rowText = '';

    for (let i = 0; i < bandCount; i++) {
      const v = levels[i]!;
      let char = ' ';

      if (v >= threshold) {
        char = '█';
      } else if (v >= threshold - 7) {
        const sub = v - (threshold - 8);
        char = blockSymbols[Math.max(0, Math.min(7, sub))] ?? ' ';
      }

      rowText += char + ' ';
    }

    let color = colors[2] ?? accent;
    if (rowIndex < Math.max(1, height * 0.3)) {
      color = '#ff5f87';
    } else if (rowIndex < Math.max(2, height * 0.6)) {
      color = colors[4] ?? accent;
    } else {
      color = colors[3] ?? accent;
    }

    rows.push({
      text: rowText.padEnd(width).slice(0, width),
      color
    });
  }

  return rows;
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
    let color = colors[2] ?? accent;
    if (y === 0 || y === 1) {
      color = '#ff5f87';
    } else if (y < 4) {
      color = colors[4] ?? accent;
    } else {
      color = colors[3] ?? accent;
    }

    rows.push({ text, color });
  }

  return rows;
}

function buildStars(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const rows: VisualLine[] = [];

  for (let y = 0; y < height; y++) {
    let rowText = '';
    for (let x = 0; x < width; x++) {
      const speed = 0.55 + 0.35 * (Math.abs(Math.sin(x * 5.7 + y * 1.9)) % 1);
      const scrollX = Math.floor(x - pulse * speed * 1.8);
      const scrollY = Math.floor(y + pulse * speed * 0.9);
      const hash = Math.abs(Math.sin(scrollX * 12.3 + scrollY * 37.7)) % 1;
      const diagonalLane = Math.abs((scrollX + scrollY * 2) % 9);
      const isStar = hash < 0.14 && diagonalLane <= 2;

      if (isStar) {
        const symbols = ['/', '*', '+', '.'];
        const sym = symbols[Math.floor(hash * 22) % symbols.length] ?? '·';
        rowText += sym;
      } else {
        rowText += ' ';
      }
    }

    let color = '#767676';
    if (y < Math.max(1, height * 0.25)) {
      color = '#ffffff';
    } else if (y < Math.max(2, height * 0.65)) {
      color = accent;
    }

    rows.push({
      text: rowText.slice(0, width),
      color
    });
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

      const glitch = Math.random() > 0.98 ? 1 : 0;
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
  const scaleY = Math.max(2, Math.min((height - 2) / 3.0, width / 12));
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

  const accent = themeAccent(theme);
  return grid.map((cells, rowIndex) => {
    const text = cells.join('').slice(0, width);
    const hasCube = /[.:;=+*#%@/\\|_\-]/.test(text);
    let color = '#ff5f87';

    if (!hasCube) {
      color = '#767676';
    } else if (rowIndex < height * 0.25) {
      color = '#ff9ab3';
    } else if (rowIndex > height * 0.76) {
      color = '#c06cff';
    } else if (theme === 'mono') {
      color = accent;
    }

    return {text, color};
  });
}

function buildAsciiFire(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const chars = [' ', '.', ':', '^', '~', '*', 'x', 'X', '#', '@'];
  const colors = ['#2d1218', '#743127', '#b9482d', '#f26f35', '#ffc857', '#fff1a8'];
  const rows: VisualLine[] = [];

  for (let y = 0; y < height; y += 1) {
    const positionY = y / Math.max(1, height - 1);
    const heatBase = Math.pow(positionY, 1.12);
    const cells: VisualCell[] = [];

    for (let x = 0; x < width; x += 1) {
      const centerPull = 1 - Math.abs((x / Math.max(1, width - 1)) - 0.5) * 0.38;
      const upwardTime = pulse * 0.58 + (height - y) * 0.62;
      const lick =
        Math.sin(x * 0.18 + upwardTime - y * 0.32) * 0.2 +
        Math.sin(x * 0.07 - upwardTime * 0.7 + y * 0.46) * 0.15 +
        Math.cos(x * 0.31 + upwardTime * 0.42) * 0.08;
      const sparks = hashNoise(x, y, pulse * 2) > 0.968 && positionY < 0.46 ? 0.42 : 0;
      const heat = clampNumber(heatBase * centerPull + lick + sparks - (1 - positionY) * 0.28, 0, 1);
      const index = Math.min(chars.length - 1, Math.floor(heat * chars.length));
      const colorIndex = Math.min(colors.length - 1, Math.floor(heat * colors.length));
      cells.push({text: chars[index] ?? ' ', color: colors[colorIndex] ?? themeAccent(theme)});
    }

    rows.push(lineFromCells(cells, themeAccent(theme)));
  }

  return rows;
}

function buildAsciiFireworks(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#767676');
  const palette = ['#ff5f87', '#ffd166', '#53a8ff', '#8df084', '#c06cff', '#ffffff'];
  const bursts = Math.max(3, Math.min(7, Math.floor(width / 26)));

  for (let burst = 0; burst < bursts; burst += 1) {
    const seed = burst * 97 + 19;
    const cycle = (pulse * 1.55 + burst * 17) % 44;
    const radius = cycle * 0.22;
    const centerX = Math.round(width * (0.18 + ((seed * 37) % 64) / 100));
    const centerY = Math.round(height * (0.18 + ((seed * 23) % 42) / 100));
    const color = palette[burst % palette.length] ?? themeAccent(theme);
    const rays = 14 + (burst % 5) * 4;

    if (cycle < 6) {
      const launchY = height - 1 - Math.round(cycle * 1.25);
      setMotionCell(grid, centerX, launchY, '|', color);
      setMotionCell(grid, centerX, launchY - 1, '.', color);
      continue;
    }

    for (let ray = 0; ray < rays; ray += 1) {
      const angle = (ray / rays) * Math.PI * 2 + burst * 0.33;
      const x = Math.round(centerX + Math.cos(angle) * radius * (1.7 + (ray % 3) * 0.34));
      const y = Math.round(centerY + Math.sin(angle) * radius * 0.72);
      const tailX = Math.round(centerX + Math.cos(angle) * Math.max(0, radius - 1.2) * 1.5);
      const tailY = Math.round(centerY + Math.sin(angle) * Math.max(0, radius - 1.2) * 0.66);
      const glyph = cycle < 16 ? ['*', '+', 'x', 'o'][ray % 4]! : ['.', ':', "'", '`'][ray % 4]!;
      setMotionCell(grid, tailX, tailY, '.', '#767676');
      setMotionCell(grid, x, y, glyph, color);
    }
  }

  return grid.map(row => lineFromCells(row, themeAccent(theme)));
}

function buildAsciiPlasma(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const chars = [' ', '.', ':', ';', '-', '=', '+', '*', '#', '%', '@'];
  const palette = ['#53a8ff', '#6ee7f2', '#8df084', '#ffd166', '#ff5f87', '#c06cff'];
  const rows: VisualLine[] = [];

  for (let y = 0; y < height; y += 1) {
    const cells: VisualCell[] = [];
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const ny = y / Math.max(1, height - 1);
      const value =
        Math.sin(nx * 14 + pulse * 0.16) +
        Math.sin((nx * 7 + ny * 9) + pulse * 0.11) +
        Math.cos(Math.sqrt(Math.pow(nx - 0.5, 2) + Math.pow(ny - 0.5, 2)) * 18 - pulse * 0.22);
      const normalized = clampNumber((value + 3) / 6, 0, 1);
      const char = chars[Math.min(chars.length - 1, Math.floor(normalized * chars.length))] ?? ' ';
      const color = palette[Math.min(palette.length - 1, Math.floor(((normalized + pulse * 0.01) % 1) * palette.length))] ?? themeAccent(theme);
      cells.push({text: char, color});
    }

    rows.push(lineFromCells(cells, themeAccent(theme)));
  }

  return rows;
}

function buildAsciiRadioWaves(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#767676');
  const accent = themeAccent(theme);
  const cx = Math.floor(width * 0.5);
  const cy = Math.floor(height * 0.52);
  const maxRadius = Math.max(width * 0.42, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - cx) / Math.max(1, width * 0.018);
      const dy = (y - cy) / Math.max(1, height * 0.085);
      const radius = Math.sqrt(dx * dx + dy * dy);
      const band = (radius - pulse * 0.62 + maxRadius) % 7;
      if (band > 0.52 && band < 1.16) {
        const glyph = radius < 6 ? 'o' : radius < 14 ? ')' : radius < 22 ? '}' : '·';
        setMotionCell(grid, x, y, glyph, radius < 14 ? accent : '#53a8ff');
      }
    }
  }

  setMotionCell(grid, cx, cy, '●', '#ff5f87');
  setMotionCell(grid, cx - 1, cy, '(', accent);
  setMotionCell(grid, cx + 1, cy, ')', accent);
  return grid.map(row => lineFromCells(row, accent));
}

function buildAsciiRaindrops(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#1f6f8b');
  const drops = Math.max(10, Math.min(34, Math.floor(width / 5)));

  for (let drop = 0; drop < drops; drop += 1) {
    const seed = drop * 53 + 11;
    const x = Math.round(((seed * 17) % Math.max(1, width - 2)) + 1);
    const y = Math.round((pulse * (0.28 + (drop % 5) * 0.04) + seed) % Math.max(1, height + 4)) - 2;
    const rippleAge = (pulse + seed) % 22;
    const rippleY = Math.round(((seed * 29) % Math.max(1, height - 2)) + 1);
    const rippleRadius = rippleAge * 0.28;

    setMotionCell(grid, x, y, rippleAge < 5 ? '|' : '.', '#6ee7f2');
    for (const side of [-1, 1]) {
      const rippleX = Math.round(x + side * rippleRadius * 2.1);
      const glyph = rippleAge < 8 ? 'o' : rippleAge < 14 ? 'O' : '.';
      setMotionCell(grid, rippleX, rippleY, glyph, rippleAge < 12 ? '#53a8ff' : '#767676');
    }
  }

  for (let x = 0; x < width; x += 4) {
    setMotionCell(grid, x, height - 1, '~', themeAccent(theme));
  }

  return grid.map(row => lineFromCells(row, themeAccent(theme)));
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
  const scale = Math.min(width * 0.22, height * 1.15);

  for (let theta = 0; theta < Math.PI * 2; theta += 0.11) {
    for (let phi = 0; phi < Math.PI * 2; phi += 0.18) {
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
      const screenX = Math.round(cx + scale * inverseZ * x * 2.1);
      const screenY = Math.round(cy + scale * inverseZ * y * 0.86);
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

  const colors = themeContributionColors(theme);
  return grid.map((cells, rowIndex) => ({
    text: cells.join('').slice(0, width),
    color: colors[Math.min(colors.length - 1, Math.floor((rowIndex / Math.max(1, height - 1)) * colors.length))] ?? themeAccent(theme)
  }));
}

function buildAsciiStarfield(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#767676');
  const count = Math.max(45, Math.min(180, Math.floor((width * height) / 10)));
  const cx = width / 2;
  const cy = height / 2;

  for (let star = 0; star < count; star += 1) {
    const seed = star * 9283 + 17;
    const angle = (hashNoise(seed, 0, 0) * Math.PI * 2);
    const lane = 0.08 + hashNoise(seed, 9, 0) * 0.92;
    const speed = 0.2 + hashNoise(seed, 17, 0) * 0.9;
    const depth = ((pulse * speed + seed) % 90) / 90;
    const radius = Math.pow(depth, 1.75) * Math.max(width * 0.56, height * 2.6) * lane;
    const x = Math.round(cx + Math.cos(angle) * radius);
    const y = Math.round(cy + Math.sin(angle) * radius * 0.34);
    const glyph = depth > 0.82 ? '@' : depth > 0.64 ? '*' : depth > 0.42 ? '+' : '.';
    const color = depth > 0.75 ? '#ffffff' : depth > 0.48 ? themeAccent(theme) : '#767676';
    setMotionCell(grid, x, y, glyph, color);
  }

  return grid.map(row => lineFromCells(row, themeAccent(theme)));
}

function buildVuMeters(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#10141c');
  const accent = themeAccent(theme);
  const meterWidth = Math.max(1, Math.floor(width / 2));
  const channels = [
    clampNumber(0.5 + 0.4 * Math.sin(pulse * 0.21) + 0.08 * Math.sin(pulse * 0.93), 0, 1),
    clampNumber(0.5 + 0.4 * Math.sin(pulse * 0.19 + 1.7) + 0.08 * Math.cos(pulse * 0.81), 0, 1)
  ];
  const minAngle = -Math.PI * 0.6;
  const maxAngle = Math.PI * 0.6;

  for (let channel = 0; channel < 2; channel += 1) {
    const left = channel * meterWidth;
    const pivotX = left + meterWidth / 2;
    const pivotY = height - 1;
    const radius = Math.min(meterWidth / 2 - 1, height - 2);
    const xStretch = Math.min(2.0, (meterWidth / 2 - 1) / Math.max(1, radius * Math.sin(maxAngle)));
    const level = channels[channel] ?? 0;

    for (let angle = minAngle; angle <= maxAngle; angle += 0.035) {
      const tx = pivotX + Math.sin(angle) * radius * xStretch;
      const ty = pivotY - Math.cos(angle) * radius;
      const frac = (angle - minAngle) / (maxAngle - minAngle);
      const tickColor = frac > 0.82 ? '#ff5f87' : frac > 0.62 ? '#ffd166' : '#3a4250';
      paintCell(grid, tx, ty, '·', tickColor);
    }

    const needleAngle = minAngle + (maxAngle - minAngle) * level;
    for (let r = 0; r <= radius; r += 0.45) {
      const tx = pivotX + Math.sin(needleAngle) * r * xStretch;
      const ty = pivotY - Math.cos(needleAngle) * r;
      const glyph = Math.abs(Math.sin(needleAngle)) > 0.55 ? (needleAngle < 0 ? '╱' : '╲') : '│';
      paintCell(grid, tx, ty, glyph, level > 0.82 ? '#ff5f87' : accent);
    }

    paintCell(grid, pivotX, pivotY, '▄', '#9aa4b2');
    paintCell(grid, left + 1, 0, channel === 0 ? 'L' : 'R', '#9aa4b2');
  }

  return grid.map(row => lineFromCells(row, accent));
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
  const rows = Math.max(4, Math.min(10, height - 1));

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

function buildOrbits(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#080b12');
  const accent = themeAccent(theme);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const rx = width * 0.42;
  const ry = height * 0.42;
  const palette = ['#6ee7f2', '#8df084', '#ffd166', '#ff5f87', '#c06cff'];
  const particles = 5;

  for (let particle = 0; particle < particles; particle += 1) {
    const a = 2 + particle * 0.5;
    const b = 3 + particle * 0.4;
    const phase = particle * 1.3;
    const headColor = theme === 'mono' ? accent : palette[particle % palette.length] ?? accent;

    for (let trail = 11; trail >= 0; trail -= 1) {
      const t = pulse * 0.08 - trail * 0.085;
      const x = cx + Math.sin(a * t + phase) * rx;
      const y = cy + Math.sin(b * t) * ry;
      const glyph = trail === 0 ? '◉' : trail < 3 ? '●' : trail < 6 ? '•' : '·';
      const color = trail < 3 ? headColor : dimMotionColorAt(particle / particles, theme);
      paintCell(grid, x, y, glyph, color);
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildVinyl(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#04050a');
  const accent = themeAccent(theme);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const aspect = 2.05;
  const radius = Math.min((width / 2 - 1) / aspect, height / 2 - 0.5);
  const spin = pulse * 0.18;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - cx) / aspect;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > radius) {
        continue;
      }

      const angle = Math.atan2(dy, dx);

      if (r < radius * 0.22) {
        const hole = r < radius * 0.05;
        const tick = !hole && Math.abs(((angle + spin) % (Math.PI * 2)) % (Math.PI * 2)) < 0.13 && r > radius * 0.08;
        paintCell(grid, x, y, hole ? '·' : tick ? '│' : '▒', hole ? '#04050a' : tick ? '#ffe9c0' : '#b23a5b');
        continue;
      }

      const specular = Math.cos(angle - spin);
      const groove = Math.sin(r * 4.6) > 0.2;
      if (specular > 0.86) {
        paintCell(grid, x, y, '░', '#3a3f49');
      } else if (groove) {
        paintCell(grid, x, y, '·', '#1c1f26');
      }
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

function buildSoundwave(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#0a0e16');
  const accent = themeAccent(theme);
  const colors = themeContributionColors(theme);
  const mid = (height - 1) / 2;
  const reach = Math.max(1, mid);

  for (let x = 0; x < width; x += 1) {
    const s = x + pulse * 1.6;
    const amplitude =
      (Math.abs(Math.sin(s * 0.2)) * 0.6 + Math.abs(Math.sin(s * 0.07 + 1.3)) * 0.4) *
      (0.35 + 0.65 * Math.abs(Math.sin(s * 0.013)));
    const env = Math.round(amplitude * reach);

    if (env === 0) {
      paintCell(grid, x, mid, '─', colors[2] ?? accent);
      continue;
    }

    for (let d = 0; d <= env; d += 1) {
      const frac = d / Math.max(1, reach);
      const colorIndex = Math.min(colors.length - 1, 1 + Math.round(frac * (colors.length - 2)));
      const edge = d === env;
      paintCell(grid, x, mid - d, edge ? '▔' : '█', edge ? accent : colors[colorIndex] ?? accent);
      paintCell(grid, x, mid + d, edge ? '▁' : '█', edge ? accent : colors[colorIndex] ?? accent);
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
        drawLineCells(grid, a.x, a.y, b.x, b.y, '·', '#2c3340');
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
  const grid = emptyMotionGrid(width, height, '#0a0e16');
  const accent = themeAccent(theme);
  const colors = themeContributionColors(theme);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const levels = ['·', '∘', '•', '●', '◉'];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x % 2 === 1) {
        continue;
      }

      const dx = (x - cx) / 2.0;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const wave = Math.sin(r * 0.7 - pulse * 0.3) * 0.5 + 0.5;
      const sway = Math.sin(x * 0.2 + y * 0.3 + pulse * 0.1) * 0.2;
      const value = clampNumber(wave + sway, 0, 1);
      const levelIndex = Math.min(levels.length - 1, Math.floor(value * levels.length));
      const colorIndex = Math.min(colors.length - 1, Math.max(1, Math.round(value * (colors.length - 1))));
      paintCell(grid, x, y, levels[levelIndex] ?? '·', value > 0.16 ? colors[colorIndex] ?? accent : '#1a2029');
    }
  }

  return grid.map(row => lineFromCells(row, accent));
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

function buildBloomBars(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#070b12');
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const eighths = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const bandWidth = 2;
  const bands = Math.ceil(width / bandWidth);

  for (let band = 0; band < bands; band += 1) {
    const x = band * bandWidth;
    const level = spectrumSample(band, pulse);
    const filled = level * height;
    const fullCells = Math.floor(filled);
    const remainder = filled - fullCells;
    let peak = 0;
    for (let k = 0; k < 14; k += 1) {
      peak = Math.max(peak, spectrumSample(band, pulse - k));
    }

    for (let i = 0; i < fullCells; i += 1) {
      const y = height - 1 - i;
      const colorIndex = Math.min(ramp.length - 1, 1 + Math.round((i / Math.max(1, height - 1)) * (ramp.length - 2)));
      paintCell(grid, x, y, '█', ramp[colorIndex] ?? accent);
    }

    if (remainder > 0.08 && fullCells < height) {
      const colorIndex = Math.min(ramp.length - 1, 1 + Math.round((fullCells / Math.max(1, height - 1)) * (ramp.length - 2)));
      paintCell(grid, x, height - 1 - fullCells, eighths[Math.min(7, Math.floor(remainder * 8))] ?? '▁', ramp[colorIndex] ?? accent);
    }

    const tipY = height - 1 - fullCells;
    if (tipY - 1 >= 0) {
      paintCell(grid, x, tipY - 1, '░', '#2b3340');
    }

    const peakY = height - 1 - Math.round(peak * (height - 1));
    if (peakY >= 0 && peakY < height) {
      paintCell(grid, x, peakY, '▔', '#ffffff');
    }
  }

  return grid.map(row => lineFromCells(row, accent));
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
  const centerA = {x: width * 0.4 + Math.sin(pulse * 0.02) * width * 0.1, y: height * 0.5};
  const centerB = {x: width * 0.6 + Math.cos(pulse * 0.018) * width * 0.1, y: height * 0.5};
  const shades = [' ', '·', '░', '▒', '▓', '█'];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const da = Math.sqrt(((x - centerA.x) / 2) ** 2 + (y - centerA.y) ** 2);
      const db = Math.sqrt(((x - centerB.x) / 2) ** 2 + (y - centerB.y) ** 2);
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
  const palette = ['#bcd7ff', '#9ec2ff', '#ffffff', '#ffd9a8', '#ffb38a'];
  const dotsWide = width * 2;
  const dotsHigh = height * 4;
  const cx = (dotsWide - 1) / 2;
  const cy = (dotsHigh - 1) / 2;
  const arms = 2;
  const rotation = pulse * 0.03;
  const span = Math.min(dotsWide, dotsHigh) * 0.62;
  const count = Math.min(1100, Math.floor((dotsWide * dotsHigh) / 3));

  for (let i = 0; i < count; i += 1) {
    const fraction = i / count;
    const radius = fraction * span;
    const arm = i % arms;
    const jitter = (hashNoise(i, 1, 0) - 0.5) * 0.55;
    const angle = arm * ((Math.PI * 2) / arms) + radius * 0.12 + rotation + jitter;
    const brightness = fraction < 0.12 ? 1 : 1 - fraction;
    if (hashNoise(i, 7, 0) < 0.6 + brightness * 0.4) {
      const color =
        fraction < 0.1
          ? '#ffffff'
          : theme === 'mono'
            ? motionColorAt(1 - fraction, theme)
            : palette[Math.floor(hashNoise(i, 3, 0) * palette.length) % palette.length] ?? accent;
      brailleSet(canvas, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, color);
    }
  }

  const coreRadius = Math.min(dotsWide, dotsHigh) * 0.05;
  for (let angle = 0; angle < Math.PI * 2; angle += 0.18) {
    for (let r = 0; r < coreRadius; r += 0.7) {
      brailleSet(canvas, cx + Math.cos(angle) * r, cy + Math.sin(angle) * r, '#ffffff');
    }
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
  const radius = 5;
  const rolling = 3 + 1.5 * (0.5 + 0.5 * Math.sin(pulse * 0.008));
  const offset = 2.2 + 1.2 * Math.sin(pulse * 0.012);
  const ratio = (radius - rolling) / rolling;
  const scale = (Math.min(dotsWide, dotsHigh) * 0.46) / (radius - rolling + offset);
  const rotation = pulse * 0.02;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const samples = 1700;

  for (let i = 0; i < samples; i += 1) {
    const theta = i * 0.06;
    const x = (radius - rolling) * Math.cos(theta) + offset * Math.cos(ratio * theta);
    const y = (radius - rolling) * Math.sin(theta) - offset * Math.sin(ratio * theta);
    const frac = i / samples;
    const color = theme === 'mono' ? motionColorAt(frac, theme) : ramp[Math.min(ramp.length - 1, 1 + Math.round(frac * (ramp.length - 2)))] ?? accent;
    brailleSet(canvas, cx + (x * cos - y * sin) * scale, cy + (x * sin + y * cos) * scale, color);
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

function buildSpectrum3d(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#05070d');
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const rows = Math.max(4, Math.min(9, height - 2));
  const horizon = new Array<number>(width).fill(height);

  for (let d = rows - 1; d >= 0; d -= 1) {
    const depth = d / Math.max(1, rows - 1);
    const t = pulse * 0.6 - (rows - 1 - d) * 3;
    const inset = Math.round((1 - depth) * width * 0.16);
    const baseLine = (height - 1) * (0.85 - 0.5 * (1 - depth));
    const amp = height * (0.2 + 0.2 * depth);
    const color = ramp[Math.min(ramp.length - 1, 1 + Math.round(depth * (ramp.length - 2)))] ?? accent;
    const span = Math.max(1, width - 2 * inset - 1);

    for (let x = inset; x < width - inset; x += 1) {
      const nx = (x - inset) / span;
      const level = spectrumSample(nx * (width * 0.45) + d * 0.7, t);
      const ridgeY = Math.max(0, Math.min(height - 1, Math.round(baseLine - level * amp)));
      const top = horizon[x] ?? height;
      if (ridgeY < top) {
        for (let y = ridgeY; y < top; y += 1) {
          paintCell(grid, x, y, y === ridgeY ? '▀' : '█', y === ridgeY && depth > 0.66 ? '#ffffff' : color);
        }

        horizon[x] = ridgeY;
      }
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildTuningDial(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#0a0e16');
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const left = 2;
  const right = width - 3;
  const span = Math.max(1, right - left);
  const scaleY = Math.floor(height * 0.5);
  const t = pulse * 0.03;
  const position = clampNumber(0.5 + 0.45 * Math.sin(t) * Math.cos(t * 0.5), 0, 1);
  const needleX = left + Math.round(position * span);

  for (let x = left; x <= right; x += 1) {
    paintCell(grid, x, scaleY, '─', '#3a4250');
  }

  const minorStep = Math.max(2, Math.floor(span / 26));
  for (let x = left; x <= right; x += minorStep) {
    paintCell(grid, x, scaleY - 1, '╵', '#4a5260');
  }

  const labels = ['88', '92', '96', '100', '104', '108'];
  for (let i = 0; i < labels.length; i += 1) {
    const label = labels[i] ?? '';
    const x = left + Math.round((i / (labels.length - 1)) * span);
    paintCell(grid, x, scaleY - 1, '╿', accent);
    for (let c = 0; c < label.length; c += 1) {
      paintCell(grid, x - Math.floor(label.length / 2) + c, scaleY + 2, label[c] ?? '', '#9aa4b2');
    }
  }

  const stations = [0.12, 0.3, 0.46, 0.62, 0.78, 0.9];
  let nearest = 1;
  for (const station of stations) {
    paintCell(grid, left + Math.round(station * span), scaleY - 2, '▾', '#ffd166');
    nearest = Math.min(nearest, Math.abs(position - station));
  }

  for (let y = 1; y < height - 1; y += 1) {
    paintCell(grid, needleX, y, y === scaleY ? '┃' : '│', y === scaleY ? '#ffffff' : '#ff5f87');
  }
  paintCell(grid, needleX, 0, '▼', '#ff5f87');

  const strength = clampNumber(1 - nearest * 6, 0, 1);
  const bars = Math.round(strength * 12);
  for (let i = 0; i < 12; i += 1) {
    paintCell(grid, left + i, height - 1, i < bars ? '▰' : '▱', i < bars ? ramp[Math.min(ramp.length - 1, 2 + Math.floor(i / 4))] ?? accent : '#2a313c');
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildRfConstellation(
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
  const half = Math.min(dotsWide, dotsHigh) * 0.42;

  for (let x = 0; x < dotsWide; x += 1) {
    brailleSet(canvas, x, cy, '#2a313c');
  }
  for (let y = 0; y < dotsHigh; y += 1) {
    brailleSet(canvas, cx, y, '#2a313c');
  }

  const levels = [-0.75, -0.25, 0.25, 0.75];
  const noiseAmp = 0.06 + 0.05 * (0.5 + 0.5 * Math.sin(pulse * 0.05));
  const seed = Math.floor(pulse);
  const perPoint = 11;

  for (const inPhase of levels) {
    for (const quadrature of levels) {
      const color = ramp[Math.min(ramp.length - 1, 2 + Math.round(Math.abs(inPhase) + Math.abs(quadrature)))] ?? accent;
      for (let k = 0; k < perPoint; k += 1) {
        const jitterI = inPhase + (hashNoise(inPhase * 100 + quadrature * 10 + k, seed, k * 0.3) - 0.5) * noiseAmp * 2;
        const jitterQ = quadrature + (hashNoise(quadrature * 100 + inPhase * 10 + k + 7, seed + 3, k * 0.7) - 0.5) * noiseAmp * 2;
        brailleSet(canvas, cx + jitterI * half, cy - jitterQ * half, k === 0 ? '#ffffff' : color);
      }
    }
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

function drawBrailleArc(canvas: BrailleCanvas, cx: number, cy: number, radius: number, start: number, end: number, color: string): void {
  const step = 0.6 / Math.max(1, radius);
  for (let a = start; a <= end; a += step) {
    brailleSet(canvas, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, color);
  }
}

function buildClifford(
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
  const a = -1.4 + 0.28 * Math.sin(pulse * 0.011);
  const b = 1.6 + 0.2 * Math.cos(pulse * 0.008);
  const c = 1.0;
  const d = 0.7;
  const scaleX = dotsWide * 0.4 / 2.1;
  const scaleY = dotsHigh * 0.4 / 1.9;
  const count = Math.min(4200, Math.floor((dotsWide * dotsHigh) / 2));
  let x = 0.12;
  let y = 0.08;

  for (let i = 0; i < count; i += 1) {
    const nx = Math.sin(a * y) + c * Math.cos(a * x);
    const ny = Math.sin(b * x) + d * Math.cos(b * y);
    x = nx;
    y = ny;
    if (i < 20) {
      continue;
    }

    const color = ramp[Math.min(ramp.length - 1, 1 + Math.round(((y + 1.9) / 3.8) * (ramp.length - 2)))] ?? accent;
    brailleSet(canvas, cx + x * scaleX, cy + y * scaleY, color);
  }

  return brailleToLines(canvas, accent);
}

function buildDeJong(
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
  const a = 1.4 + 0.25 * Math.sin(pulse * 0.01);
  const b = -2.3 + 0.2 * Math.cos(pulse * 0.009);
  const c = 2.4;
  const d = -2.1;
  const scale = (Math.min(dotsWide, dotsHigh) * 0.46) / 2.2;
  const count = Math.min(4200, Math.floor((dotsWide * dotsHigh) / 2));
  let x = 0.1;
  let y = 0.1;

  for (let i = 0; i < count; i += 1) {
    const nx = Math.sin(a * y) - Math.cos(b * x);
    const ny = Math.sin(c * x) - Math.cos(d * y);
    x = nx;
    y = ny;
    if (i < 20) {
      continue;
    }

    const color = ramp[Math.min(ramp.length - 1, 1 + Math.round(((x + 2) / 4) * (ramp.length - 2)))] ?? accent;
    brailleSet(canvas, cx + x * scale, cy + y * scale, color);
  }

  return brailleToLines(canvas, accent);
}

function buildTruchet(
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
  const tile = 8;
  const phase = Math.floor(pulse * 0.07);
  const radius = tile / 2;

  for (let ty = 0; ty < Math.ceil(dotsHigh / tile); ty += 1) {
    for (let tx = 0; tx < Math.ceil(dotsWide / tile); tx += 1) {
      const ox = tx * tile;
      const oy = ty * tile;
      const color = ramp[Math.min(ramp.length - 1, 2 + ((tx + ty) % 2))] ?? accent;
      if (hashNoise(tx, ty, phase) > 0.5) {
        drawBrailleArc(canvas, ox, oy, radius, 0, Math.PI / 2, color);
        drawBrailleArc(canvas, ox + tile, oy + tile, radius, Math.PI, Math.PI * 1.5, color);
      } else {
        drawBrailleArc(canvas, ox + tile, oy, radius, Math.PI / 2, Math.PI, color);
        drawBrailleArc(canvas, ox, oy + tile, radius, Math.PI * 1.5, Math.PI * 2, color);
      }
    }
  }

  return brailleToLines(canvas, accent);
}

function buildSphere(
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
  const radius = Math.min(dotsWide, dotsHigh) * 0.44;
  const rotY = pulse * 0.03;
  const rotX = 0.45;
  const bright = ramp[ramp.length - 1] ?? accent;
  const dim = '#2c3340';

  const project = (theta: number, phi: number): {x: number; y: number; z: number} => {
    let x = Math.cos(theta) * Math.cos(phi);
    let y = Math.sin(theta);
    let z = Math.cos(theta) * Math.sin(phi);
    const x1 = x * Math.cos(rotY) + z * Math.sin(rotY);
    z = -x * Math.sin(rotY) + z * Math.cos(rotY);
    x = x1;
    const y1 = y * Math.cos(rotX) - z * Math.sin(rotX);
    z = y * Math.sin(rotX) + z * Math.cos(rotX);
    y = y1;
    return {x, y, z};
  };

  for (let l = 0; l < 12; l += 1) {
    const phi = (l / 12) * Math.PI * 2;
    for (let t = -Math.PI / 2; t <= Math.PI / 2; t += 0.04) {
      const p = project(t, phi);
      brailleSet(canvas, cx + p.x * radius, cy + p.y * radius, p.z > 0 ? bright : dim);
    }
  }

  for (let la = -4; la <= 4; la += 1) {
    const theta = (la / 5) * (Math.PI / 2);
    for (let phi = 0; phi < Math.PI * 2; phi += 0.03) {
      const p = project(theta, phi);
      brailleSet(canvas, cx + p.x * radius, cy + p.y * radius, p.z > 0 ? bright : dim);
    }
  }

  return brailleToLines(canvas, accent);
}

function buildMobius(
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
  const rotY = pulse * 0.025;
  const tilt = 0.62 + 0.22 * Math.sin(pulse * 0.012);
  const scale = Math.min(dotsWide, dotsHigh) * 0.3;
  const uSteps = 220;
  const vSteps = 9;

  for (let i = 0; i <= uSteps; i += 1) {
    const u = (i / uSteps) * Math.PI * 2;
    const cu = Math.cos(u / 2);
    for (let j = 0; j <= vSteps; j += 1) {
      const v = -1 + (2 * j) / vSteps;
      let x = (1 + v * 0.5 * cu) * Math.cos(u);
      let y = (1 + v * 0.5 * cu) * Math.sin(u);
      let z = v * 0.5 * Math.sin(u / 2);
      const x1 = x * Math.cos(rotY) + z * Math.sin(rotY);
      z = -x * Math.sin(rotY) + z * Math.cos(rotY);
      x = x1;
      const y1 = y * Math.cos(tilt) - z * Math.sin(tilt);
      z = y * Math.sin(tilt) + z * Math.cos(tilt);
      y = y1;
      const persp = 3 / (3 - z);
      const color = ramp[Math.min(ramp.length - 1, 1 + Math.round(clampNumber((z + 1.6) / 3.2, 0, 1) * (ramp.length - 2)))] ?? accent;
      brailleSet(canvas, cx + x * scale * persp, cy + y * scale * persp, color);
    }
  }

  return brailleToLines(canvas, accent);
}

function buildSMeter(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#0a0e16');
  const ramp = themeContributionColors(theme);
  const accent = themeAccent(theme);
  const left = 2;
  const right = width - 3;
  const span = Math.max(1, right - left);
  const midY = Math.floor(height / 2);
  const level = clampNumber(0.5 + 0.4 * Math.sin(pulse * 0.06) + 0.1 * Math.sin(pulse * 0.21), 0, 1);
  const filled = Math.round(level * span);
  let peak = 0;
  for (let k = 0; k < 18; k += 1) {
    peak = Math.max(peak, clampNumber(0.5 + 0.4 * Math.sin((pulse - k) * 0.06) + 0.1 * Math.sin((pulse - k) * 0.21), 0, 1));
  }
  const peakX = left + Math.round(peak * span);

  const ticks = ['S1', 'S3', 'S5', 'S7', 'S9', '+20', '+40'];
  for (let i = 0; i < ticks.length; i += 1) {
    const label = ticks[i] ?? '';
    const x = left + Math.round((i / (ticks.length - 1)) * span);
    paintCell(grid, x, midY - 2, '╷', '#4a5260');
    for (let c = 0; c < label.length; c += 1) {
      paintCell(grid, x - 1 + c, midY - 3, label[c] ?? '', i >= 4 ? '#ff9ab3' : '#9aa4b2');
    }
  }

  for (let i = 0; i <= span; i += 1) {
    const x = left + i;
    const frac = i / span;
    if (i <= filled) {
      const zone = frac > 0.78 ? '#ff5f87' : frac > 0.6 ? '#ffd166' : ramp[ramp.length - 1] ?? accent;
      paintCell(grid, x, midY, '▰', zone);
      paintCell(grid, x, midY + 1, '▰', zone);
    } else {
      paintCell(grid, x, midY, '▱', '#2a313c');
      paintCell(grid, x, midY + 1, '▱', '#2a313c');
    }
  }

  paintCell(grid, peakX, midY, '▮', '#ffffff');
  paintCell(grid, peakX, midY + 1, '▮', '#ffffff');

  const signal = `${Math.round(level * 60)} dB`;
  for (let c = 0; c < signal.length; c += 1) {
    paintCell(grid, left + c, height - 1, signal[c] ?? '', accent);
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

function buildCoral(
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
  const growFrac = clampNumber(((pulse * 1.3) % 200) / 150, 0, 1);
  const effDepth = Math.min(8, 2 + Math.floor(growFrac * 6));
  const seedLength = Math.min(dotsWide, dotsHigh) * 0.17;

  const branch = (x: number, y: number, angle: number, length: number, depth: number): void => {
    if (depth > effDepth || length < 1.2) {
      return;
    }

    const nx = x + Math.cos(angle) * length;
    const ny = y + Math.sin(angle) * length;
    const color = ramp[Math.min(ramp.length - 1, 1 + Math.round((depth / 7) * (ramp.length - 2)))] ?? accent;
    drawBrailleLine(canvas, x, y, nx, ny, color);
    const jitter = (hashNoise(Math.round(x), Math.round(y), depth) - 0.5) * 0.3;
    branch(nx, ny, angle + Math.PI / 3 + jitter, length * 0.74, depth + 1);
    branch(nx, ny, angle - Math.PI / 3 + jitter, length * 0.74, depth + 1);
    branch(nx, ny, angle + jitter * 0.5, length * 0.6, depth + 2);
  };

  for (let seed = 0; seed < 6; seed += 1) {
    branch(cx, cy, (seed / 6) * Math.PI * 2 + pulse * 0.01, seedLength, 0);
  }

  return brailleToLines(canvas, accent);
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
    const life = ((pulse * 0.9 + i * 7.3) % 130) / 130;
    const r = maxR * (1 - life);
    const angle = phase + pulse * 0.05 + (maxR / (r + 5)) * 0.9;
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

function buildJellyfish(
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
  const bob = Math.sin(pulse * 0.08) * dotsHigh * 0.06;
  const pulsate = 0.82 + 0.18 * Math.sin(pulse * 0.12);
  const bellY = dotsHigh * 0.34 + bob;
  const bellRx = dotsWide * 0.2 * pulsate;
  const bellRy = dotsHigh * 0.2 * pulsate;
  const bellColor = ramp[ramp.length - 1] ?? accent;

  for (let ring = 1; ring <= 3; ring += 1) {
    const rx = bellRx * (ring / 3);
    const ry = bellRy * (ring / 3);
    const color = ring === 3 ? bellColor : ramp[Math.min(ramp.length - 1, 2 + ring)] ?? accent;
    for (let a = Math.PI; a <= Math.PI * 2; a += 0.05) {
      brailleSet(canvas, cx + Math.cos(a) * rx, bellY + Math.sin(a) * ry, color);
    }
  }

  const tentacles = 7;
  for (let ti = 0; ti < tentacles; ti += 1) {
    const baseX = cx + (ti / (tentacles - 1) - 0.5) * 2 * bellRx * 0.82;
    const length = dotsHigh * (0.4 + 0.13 * Math.sin(pulse * 0.07 + ti));
    for (let s = 0; s < length; s += 1) {
      const sway = Math.sin(s * 0.2 + pulse * 0.1 + ti * 0.7) * (s * 0.07);
      const color = ramp[Math.min(ramp.length - 1, Math.max(1, 4 - Math.floor((s / length) * 3)))] ?? accent;
      brailleSet(canvas, baseX + sway, bellY + bellRy * 0.2 + s, color);
    }
  }

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

function buildPrism(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const grid = emptyMotionGrid(width, height, '#05060c');
  const accent = themeAccent(theme);
  const midY = Math.floor(height / 2);
  const apexX = Math.floor(width * 0.4);
  const mono = theme === 'mono';
  const ramp = themeContributionColors(theme);
  const colors = ['#ff4d4d', '#ff9a3d', '#ffe14d', '#7ee787', '#4dd2ff', '#6a8cff', '#b86bff'];

  for (let x = 2; x < apexX; x += 1) {
    paintCell(grid, x, midY, '─', '#e6edf3');
  }

  const triH = Math.min(4, Math.floor(height / 3));
  const topY = midY - triH;
  const botY = midY + triH;
  for (let i = 0; i <= 2 * triH; i += 1) {
    const y = topY + i;
    const halfW = Math.round((i / (2 * triH)) * triH);
    paintCell(grid, apexX - halfW, y, '/', '#aab4c4');
    paintCell(grid, apexX + halfW, y, '\\', '#aab4c4');
  }
  for (let x = apexX - triH; x <= apexX + triH; x += 1) {
    paintCell(grid, x, botY, '_', '#7a8696');
  }

  for (let c = 0; c < colors.length; c += 1) {
    const angle = (c - (colors.length - 1) / 2) * 0.085 + Math.sin(pulse * 0.05) * 0.02;
    const color = mono ? ramp[Math.min(ramp.length - 1, 1 + c % (ramp.length - 1))] ?? accent : colors[c] ?? accent;
    for (let x = apexX + 2; x < width - 1; x += 1) {
      const dx = x - apexX;
      const y = midY + Math.round(dx * Math.tan(angle) + Math.sin(dx * 0.2 - pulse * 0.1) * 0.6);
      paintCell(grid, x, y, '━', color);
    }
  }

  return grid.map(row => lineFromCells(row, accent));
}

function buildSpectrum(pulse: number, width: number, requestedHeight: number): string[] {
  const height = Math.max(4, requestedHeight);
  const bandCount = Math.max(18, width);
  const levels = Array.from({length: bandCount}, (_, index) => {
    if (index % 2 === 1) {
      return 0;
    }

    const low = Math.sin(index * 0.12 + pulse * 0.62);
    const mid = Math.sin(index * 0.047 - pulse * 0.4);
    const high = Math.sin(index * 0.33 + pulse * 0.9);
    const normalized = (low * 0.45 + mid * 0.35 + high * 0.2 + 1) / 2;
    const eased = Math.pow(Math.max(0, Math.min(1, normalized)), 1.35);
    return Math.max(1, Math.min(height, Math.round(eased * height)));
  });

  return Array.from({length: height}, (_, rowIndex) => {
    const threshold = height - rowIndex;
    return levels
      .map((level, index) => {
        if (index % 2 === 1) {
          return ' ';
        }

        return level >= threshold ? '▌' : ' ';
      })
      .join('')
      .slice(0, width);
  });
}

function buildScope(pulse: number, width: number, requestedHeight: number): string[] {
  const height = Math.max(7, requestedHeight);
  const midpoint = Math.floor(height / 2);
  const rows: string[][] = Array.from({length: height}, (_, rowIndex) =>
    Array.from({length: width}, (_, columnIndex) => {
      if (rowIndex === midpoint) {
        return columnIndex % 8 === 0 ? '+' : '-';
      }

      return columnIndex % 16 === 0 && rowIndex % 2 === 0 ? ':' : ' ';
    })
  );

  let previousY = oscilloscopeY(0, pulse, height);
  for (let x = 1; x < width; x += 1) {
    const currentY = oscilloscopeY(x, pulse, height);
    drawScopeSegment(rows, x - 1, previousY, x, currentY);
    previousY = currentY;
  }

  return rows.map(row => row.join('')).slice(0, requestedHeight);
}

function oscilloscopeY(x: number, pulse: number, height: number): number {
  const midpoint = (height - 1) / 2;
  const amplitude = Math.max(1, (height - 3) / 2);
  const sweep = x * 0.18 - pulse * 0.72;
  const carrier = Math.sin(sweep);
  const harmonic = Math.sin(x * 0.047 + pulse * 0.33) * 0.38;
  const triggerKick = Math.exp(-Math.pow(((x + pulse * 1.8) % 34) - 17, 2) / 18) * Math.sin(pulse * 0.21) * 0.45;
  return clampIndex(Math.round(midpoint + (carrier + harmonic + triggerKick) * amplitude * 0.76), height);
}

function drawScopeSegment(rows: string[][], fromX: number, fromY: number, toX: number, toY: number): void {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = Math.round(fromX + dx * t);
    const y = Math.round(fromY + dy * t);
    const row = rows[y];
    if (!row?.[x]) {
      continue;
    }

    row[x] = Math.abs(dy) < 0.25 ? '_' : dy > 0 ? '\\' : '/';
    if (rows[y + 1]?.[x] === ' ') {
      rows[y + 1]![x] = '.';
    }
  }
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

function emptyMotionGrid(width: number, height: number, color: string): VisualCell[][] {
  return Array.from({length: height}, () => Array.from({length: width}, () => ({text: ' ', color})));
}

function setMotionCell(grid: VisualCell[][], x: number, y: number, text: string, color: string): void {
  const row = grid[y];
  const cell = row?.[x];
  if (!row || !cell) {
    return;
  }

  row[x] = cell.text === ' ' ? {text, color} : {text: '█', color: '#ffe45c'};
}

function motionEnvelope(position: number, pulse: number, variant: number): number {
  const t = pulse * 0.13 + variant;
  const centers = [
    0.12 + 0.035 * Math.sin(t * 0.9),
    0.34 + 0.045 * Math.cos(t * 0.55 + variant),
    0.58 + 0.05 * Math.sin(t * 0.72 + 1.4),
    0.80 + 0.032 * Math.cos(t * 1.1)
  ];
  const widths = [0.065, 0.095, 0.08, 0.055];
  const weights = [0.95, 0.7, 1.0, 0.42];
  let value = 0.06;

  for (let index = 0; index < centers.length; index += 1) {
    const center = centers[index] ?? 0.5;
    const width = widths[index] ?? 0.08;
    const weight = weights[index] ?? 0.5;
    value += weight * Math.exp(-Math.pow((position - center) / width, 2));
  }

  const ripple =
    0.1 * Math.sin(position * 30 + t * 2.4) +
    0.06 * Math.cos(position * 61 - t * 1.6) +
    0.04 * Math.sin(position * 97 + variant * 3.1);
  return clampNumber(value + ripple, 0.03, 1);
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

function dimMotionColorAt(position: number, theme: ThemeName): string {
  if (theme === 'mono') {
    return '#767676';
  }

  const palette = ['#245760', '#315f49', '#626629', '#6b5523', '#6e3728', '#5b2444', '#3f2c5c', '#2f4368'];
  const index = Math.min(palette.length - 1, Math.max(0, Math.floor(position * palette.length)));
  return palette[index] ?? '#245760';
}

export function visualizerHeight(style: ReceiverStyle, availableRows: number): number {
  const termflixHeight = termflixVisualizerHeight(style, availableRows);
  if (termflixHeight !== null) {
    return termflixHeight;
  }

  if (style === 'cassette') {
    return 8;
  }

  if (style === 'radar') {
    return Math.max(10, Math.min(14, availableRows));
  }

  const maxRowsByStyle: Partial<Record<ReceiverStyle, number>> = {
    oscilloscope: 10,
    waterfall: 12,
    equalizer: 12,
    'motion-bars': 12,
    'motion-blob': 12,
    'motion-area': 11,
    'motion-dots': 12,
    'motion-contour': 14,
    'motion-braid': 12,
    blocks: 12,
    leds: 10,
    stars: 12,
    matrix: 14,
    hologram: 12,
    cube: 14,
    fire: 14,
    fireworks: 14,
    plasma: 14,
    'radio-waves': 14,
    raindrops: 14,
    'spinning-donut': 14,
    starfield: 14,
    'vu-meters': 12,
    mesh: 14,
    ribbon: 12,
    orbits: 12,
    vinyl: 14,
    mirror: 12,
    soundwave: 12,
    tunnel: 14,
    kaleidoscope: 14,
    constellation: 12,
    'pulse-grid': 12,
    lissajous: 14,
    'braille-wave': 12,
    'radial-eq': 14,
    spectrogram: 12,
    nebula: 14,
    silk: 14,
    'ripple-tank': 14,
    phyllotaxis: 14,
    harmonograph: 14,
    'bloom-bars': 12,
    moire: 14,
    galaxy: 14,
    caustics: 14,
    lorenz: 14,
    fern: 14,
    chladni: 14,
    spirograph: 14,
    tesseract: 14,
    'torus-knot': 14,
    'spectrum-3d': 14,
    'tuning-dial': 12,
    'rf-constellation': 14,
    rotozoomer: 14,
    'fractal-tree': 14,
    julia: 14,
    clifford: 14,
    dejong: 14,
    truchet: 14,
    sphere: 14,
    mobius: 14,
    's-meter': 12,
    goniometer: 14,
    'copper-bars': 14,
    twister: 14,
    coral: 14,
    cyclone: 14,
    jellyfish: 14,
    'lava-lamp': 14,
    newton: 14,
    prism: 12
  };
  const spaciousStyles = new Set<ReceiverStyle>([
    'vu-meters',
    'mesh',
    'ribbon',
    'orbits',
    'vinyl',
    'mirror',
    'soundwave',
    'tunnel',
    'kaleidoscope',
    'constellation',
    'pulse-grid',
    'lissajous',
    'braille-wave',
    'radial-eq',
    'spectrogram',
    'nebula',
    'silk',
    'ripple-tank',
    'phyllotaxis',
    'harmonograph',
    'bloom-bars',
    'moire',
    'galaxy',
    'caustics',
    'lorenz',
    'fern',
    'chladni',
    'spirograph',
    'tesseract',
    'torus-knot',
    'spectrum-3d',
    'tuning-dial',
    'rf-constellation',
    'rotozoomer',
    'fractal-tree',
    'julia',
    'clifford',
    'dejong',
    'truchet',
    'sphere',
    'mobius',
    's-meter',
    'goniometer',
    'copper-bars',
    'twister',
    'coral',
    'cyclone',
    'jellyfish',
    'lava-lamp',
    'newton',
    'prism'
  ]);
  const maxRows = maxRowsByStyle[style] ?? 8;
  const minRows =
    style === 'cube' || style === 'motion-contour' || style === 'spinning-donut'
      ? 8
      : spaciousStyles.has(style)
        ? 7
        : style.startsWith('motion-')
          ? 6
          : 3;
  return Math.max(minRows, Math.min(maxRows, availableRows));
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

function clampIndex(value: number, length: number): number {
  return Math.max(0, Math.min(length - 1, value));
}

function hashNoise(x: number, y: number, pulse: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233 + pulse * 0.037) * 43758.5453;
  return value - Math.floor(value);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
