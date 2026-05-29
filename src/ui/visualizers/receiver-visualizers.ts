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
  const scaleY = Math.max(2, Math.min((height - 3) / 2.35, width / 12));
  const scaleX = scaleY * 2.18;

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

  const sortedEdges = edges
    .map(([from, to]) => ({from, to, depth: ((vertices[from]?.z ?? 0) + (vertices[to]?.z ?? 0)) / 2}))
    .sort((left, right) => left.depth - right.depth);

  for (const edge of sortedEdges) {
    const from = vertices[edge.from];
    const to = vertices[edge.to];
    if (!from || !to) {
      continue;
    }

    drawProjectedCubeEdge(grid, from, to, edge.depth);
  }

  for (const point of [...vertices].sort((left, right) => left.z - right.z)) {
    writeCubeGlyph(grid, point.x, point.y, cubeCornerGlyph(point.z));
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
    starfield: 14
  };
  const maxRows = maxRowsByStyle[style] ?? 8;
  const minRows =
    style === 'cube' || style === 'motion-contour' || style === 'spinning-donut'
      ? 8
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
  const light = normalizeCubePoint({x: -0.45, y: 0.7, z: 1});

  for (const face of cubeFaces()) {
    const normal = rotateCubePoint(face.normal, angleX, angleY, angleZ);
    const lightLevel = clampNumber(dotCubePoint(normal, light) * 0.72 + 0.48, 0, 1);
    for (let u = -1; u <= 1.001; u += 0.105) {
      for (let v = -1; v <= 1.001; v += 0.105) {
        const rotated = rotateCubePoint(face.pointAt(u, v), angleX, angleY, angleZ);
        const projected = projectRotatedCubePoint(rotated, scaleX, scaleY, width, height);
        const texture = 0.08 * Math.sin((u + v) * 14 + rotated.z * 2.5);
        const shade = cubeSurfaceGlyph(clampNumber(lightLevel + texture, 0, 1));
        writeCubeSurfaceGlyph(grid, zBuffer, projected.x, projected.y, projected.z, shade);
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

function drawProjectedCubeEdge(grid: string[][], from: CubePoint, to: CubePoint, depth: number): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    writeCubeGlyph(grid, Math.round(from.x + dx * t), Math.round(from.y + dy * t), cubeEdgeGlyph(dx, dy, depth, step));
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

function writeCubeGlyph(grid: string[][], x: number, y: number, glyph: string): void {
  const width = grid[0]?.length ?? 0;
  const height = grid.length;
  if (x < 0 || x >= width || y < 0 || y >= height) {
    return;
  }

  grid[y]![x] = glyph;
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
