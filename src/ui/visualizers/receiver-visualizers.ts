import type {PlaybackState, ReceiverStyle, Station, ThemeName} from '../../types.js';
import {truncate} from '../format.js';
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

  if (style === 'sdr') {
    return buildSdrSpectrum(pulse, width, height, station, playback);
  }

  if (style === 'oscilloscope') {
    return buildScope(pulse, width, height).map(text => ({text, color: '#53a8ff'}));
  }

  if (style === 'signal') {
    return buildSignal(pulse, width, height).map(text => ({text, color: '#74f28a'}));
  }

  if (style === 'retro') {
    return buildRetro(pulse, width, height, station, theme);
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

  if (style === 'vinyl') {
    return buildVinyl(pulse, width, height);
  }

  if (style === 'stars') {
    return buildStars(pulse, width, height, theme);
  }

  if (style === 'neon') {
    return buildNeon(pulse, width, height, theme);
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

  return buildSpectrum(pulse, width, height).map(text => ({text, color: '#ffb000'}));
}

function playbackHasSignal(playback: PlaybackState): boolean {
  return playback.state === 'playing' && playback.ready;
}

function buildZeroSignalVisualizer(
  style: ReceiverStyle,
  width: number,
  height: number,
  station: Station | null,
  playback: PlaybackState,
  theme: ThemeName
): VisualLine[] {
  if (style === 'sdr') {
    return buildZeroSdrSpectrum(width, height, station, playback);
  }

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

function buildRetro(
  pulse: number,
  width: number,
  _height: number,
  station: Station | null,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const wLeft = Math.floor((width - 3) / 2);
  const wRight = width - 3 - wLeft;

  const t = pulse * 0.15;
  const leftLvl = Math.max(0.1, Math.min(0.95, 0.4 * Math.sin(t * 1.8) + 0.3 * Math.cos(t * 0.7) + 0.5 + 0.05 * Math.sin(pulse * 1.5)));
  const rightLvl = Math.max(0.1, Math.min(0.95, 0.4 * Math.cos(t * 1.5) + 0.3 * Math.sin(t * 0.9) + 0.5 + 0.05 * Math.cos(pulse * 1.8)));

  const leftMeter = buildVuMeter(leftLvl, wLeft, 'L');
  const rightMeter = buildVuMeter(rightLvl, wRight, 'R');

  const rows: VisualLine[] = [];
  for (let i = 0; i < 4; i++) {
    rows.push({
      text: `${leftMeter[i]} ${rightMeter[i]}`,
      color: i === 2 ? '#ff5f87' : accent
    });
  }

  const signalPercent = Math.round(78 + 12 * Math.sin(pulse * 0.05));
  const indicatorLine = ` TUNED [●]   STEREO [●]   SIGNAL: ${'█'.repeat(Math.round(Math.max(0, (width - 36) * 0.3 * (signalPercent / 100))))} ${signalPercent}%`;
  rows.push({
    text: indicatorLine.padEnd(width).slice(0, width),
    color: accent
  });

  rows.push({
    text: `┌${'─'.repeat(width - 2)}┐`,
    color: '#767676'
  });

  const center = centerFrequency(station);
  const pct = (center - 87.7) / (107.9 - 87.7);
  const pointerPos = Math.max(2, Math.min(width - 5, Math.round(pct * (width - 6)) + 2));
  const sliderText = `│${'─'.repeat(pointerPos - 2)}[█]${'─'.repeat(width - pointerPos - 3)}│`;
  rows.push({
    text: sliderText,
    color: accent
  });

  const labels = ['88', '92', '96', '100', '104', '108'];
  const labelRow = Array.from({length: width}, () => ' ');
  labelRow[0] = '│';
  labelRow[width - 1] = '│';
  for (let i = 0; i < labels.length; i++) {
    const lbl = labels[i]!;
    const anchor = Math.round((i / (labels.length - 1)) * (width - lbl.length - 12)) + 6;
    for (let c = 0; c < lbl.length; c++) {
      labelRow[anchor + c] = lbl[c]!;
    }
  }
  const mhzAnchor = width - 8;
  labelRow[mhzAnchor] = 'M';
  labelRow[mhzAnchor+1] = 'H';
  labelRow[mhzAnchor+2] = 'z';
  rows.push({
    text: labelRow.join(''),
    color: '#767676'
  });

  return rows;
}

function buildVuMeter(lvl: number, w: number, channel: string): string[] {
  const title = ` ${channel}-VU METER `;
  const titlePad = Math.max(0, Math.floor((w - title.length) / 2));
  const frameTop = `┌${'─'.repeat(titlePad)}${title}${'─'.repeat(Math.max(0, w - 2 - title.length - titlePad))}┐`;

  const scaleText = " -20  -10   -3   0  +3 ";
  const scalePad = Math.max(0, Math.floor((w - 2 - scaleText.length) / 2));
  const scaleLine = `│${' '.repeat(scalePad)}${scaleText}${' '.repeat(Math.max(0, w - 2 - scaleText.length - scalePad))}│`;

  const range = w - 8;
  const pos = Math.max(2, Math.min(w - 5, Math.round(lvl * range) + 3));
  const needleChar = pos < Math.floor(w / 2) - 1 ? '\\' : pos > Math.floor(w / 2) + 1 ? '/' : '|';
  const needleLine = `│${' '.repeat(pos)}${needleChar}${' '.repeat(Math.max(0, w - 2 - 1 - pos))}│`;

  const frameBot = `└${'─'.repeat(w - 2)}┘`;
  return [frameTop, scaleLine, needleLine, frameBot];
}

function buildWaterfall(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const chars = [' ', '·', '░', '▒', '▓', '█'];
  const colors = themeContributionColors(theme);

  const carrier1X = Math.round(width * 0.28);
  const carrier2X = Math.round(width * 0.62);
  const carrier3X = Math.round(width * 0.82);

  const rows: VisualLine[] = [];

  for (let y = 0; y < height; y++) {
    const t = pulse - y;
    let rowText = '';

    for (let x = 0; x < width; x++) {
      const c1 = Math.exp(-Math.pow((x - carrier1X) / 1.5, 2)) * (0.6 + 0.35 * Math.sin(t * 0.2));
      const c2 = Math.exp(-Math.pow((x - carrier2X) / 1.0, 2)) * (0.5 + 0.45 * Math.cos(t * 0.13));
      const c3 = Math.exp(-Math.pow((x - carrier3X) / 2.0, 2)) * (0.4 + 0.3 * Math.sin(t * 0.28));

      const sweepCenter = width * (0.45 + 0.28 * Math.sin(t * 0.04));
      const sweep = Math.exp(-Math.pow((x - sweepCenter) / 2.2, 2)) * (0.75 + 0.2 * Math.sin(t * 0.35));

      const noise = Math.abs(Math.sin(x * 2.3 + t * 0.7) * Math.cos(x * 1.1 - t * 0.5)) * 0.18 + 0.05;

      const intensity = Math.min(1.0, Math.max(0.0, c1 + c2 + c3 + sweep + noise));
      const charIdx = Math.min(chars.length - 1, Math.floor(intensity * chars.length));
      rowText += chars[charIdx]!;
    }

    let color = colors[0] ?? '#161b22';
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

  const labelText1 = station ? truncate(station.name, 13).toUpperCase() : 'NO TUNE';
  const labelText2 = station?.codec ? `${station.codec.toUpperCase()} ${station.bitrate ?? ''}`.slice(0, 13) : 'FM STEREO';
  const lbl1 = labelText1.padStart(Math.floor((13 + labelText1.length) / 2)).padEnd(13);
  const lbl2 = labelText2.padStart(Math.floor((13 + labelText2.length) / 2)).padEnd(13);

  const rawLines = [
    `.──────────────────────────────────────────.`,
    `/    (░${spokeLeft}░)       .─────────────.       (░${spokeRight}░)    \\`,
    `/      "o"       |${lbl1}|       "o"      \\`,
    `/                |${lbl2}|                \\`,
    `;  [A - SIDE]    '─────────────'     [STEREO]   ;`,
    `|  ===========================================  |`,
    ` \\           .──────────────────────.           /`,
    `  '──────────'                       '──────────'`
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
    const low = Math.sin(i * 0.18 + pulse * 0.28);
    const mid = Math.cos(i * 0.32 - pulse * 0.15);
    const high = Math.sin(i * 0.45 + pulse * 0.42);
    const normalized = (low * 0.4 + mid * 0.35 + high * 0.25 + 1) / 2;
    const eased = Math.pow(Math.max(0, Math.min(1, normalized)), 1.4);
    return Math.round(eased * height);
  });

  const peaks = Array.from({length: bandCount}, (_, i) => {
    let maxLvl = 0;
    for (let k = 0; k < 8; k++) {
      const p = (pulse - k + 240) % 240;
      const low = Math.sin(i * 0.18 + p * 0.28);
      const mid = Math.cos(i * 0.32 - p * 0.15);
      const high = Math.sin(i * 0.45 + p * 0.42);
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
    const flicker = 0.9 + 0.1 * Math.sin(pulse * 0.45 + x * 0.77);
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
      const inner = clampNumber(outer * (0.42 + 0.16 * Math.sin(position * 17 - pulse * 0.16)), 0, 1);

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
      const texture = Math.sin(x * 1.73 + y * 2.91 + pulse * 0.42);

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
        0.08 * Math.sin(theta * 5 + pulse * 0.1) +
        0.07 * Math.cos(theta * 8 - pulse * 0.07) +
        0.04 * Math.sin(theta * 13 + pulse * 0.05);

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
        Math.sin(position * Math.PI * 4.5 + pulse * 0.17 + phase) * envelope +
        Math.sin(position * Math.PI * 10.0 - pulse * 0.08 + phase) * envelope * 0.18;
      const nextWave =
        Math.sin((position + 0.02) * Math.PI * 4.5 + pulse * 0.17 + phase) * envelope +
        Math.sin((position + 0.02) * Math.PI * 10.0 - pulse * 0.08 + phase) * envelope * 0.18;
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

function buildVinyl(
  pulse: number,
  width: number,
  _height: number
): VisualLine[] {
  const spoke = ['\\', '|', '/', '-'][pulse % 4];
  const rawLines = [
    `┌────────────────── VINYL ──────────────────┐`,
    `│    .──────────────────────────────.   \\   │`,
    `│   /    .──────────────────────.    \\   \\  │`,
    `│  /    /        .──────.        \\    \\   O │`,
    `│  |   |       .'   ${spoke} (O)   '.      |   |    │`,
    `│  \\    \\        '──────'        /    /    │`,
    `│   \\    '──────────────────────'    /     │`,
    `│    '──────────────────────────────'      │`
  ];

  return rawLines.map((content, index) => {
    const visualLength = content.length;
    const pad = Math.max(0, Math.floor((width - visualLength) / 2));
    const text = ' '.repeat(pad) + content + ' '.repeat(Math.max(0, width - visualLength - pad));

    let color = '#d4d8e1';
    if (index === 0) {
      color = '#ffb000';
    } else if (index === 3 || index === 4) {
      color = '#ff5f87';
    } else if (index === 1 || index === 7) {
      color = '#767676';
    }

    return {
      text: text.slice(0, width),
      color
    };
  });
}

function buildStars(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const accent = themeAccent(theme);
  const amp = 0.5 + 0.4 * Math.sin(pulse * 0.2);
  const rows: VisualLine[] = [];

  for (let y = 0; y < height; y++) {
    let rowText = '';
    for (let x = 0; x < width; x++) {
      const speed = 0.4 + 0.3 * (Math.abs(Math.sin(x * 5.7)) % 1);
      const scrollY = Math.floor(y + pulse * speed);
      const hash = Math.abs(Math.sin(x * 12.3 + scrollY * 37.7)) % 1;

      const sway = Math.round(Math.sin(scrollY * 0.15 + pulse * 0.08) * 1.5);
      const isStar = hash < 0.045 && (x + sway) % 4 === 0;

      if (isStar) {
        const symbols = amp > 0.65 ? ['★', '✦', '·', '✧'] : ['·', ' '];
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

function buildNeon(
  pulse: number,
  width: number,
  height: number,
  theme: ThemeName
): VisualLine[] {
  const colors = themeContributionColors(theme);
  const rows: VisualLine[] = [];

  const levels = Array.from({length: width}, (_, i) => {
    const low = Math.sin(i * 0.1 + pulse * 0.4);
    const mid = Math.cos(i * 0.2 + pulse * 0.6);
    const high = Math.sin(i * 0.5 - pulse * 0.3);
    const val = (low * 0.5 + mid * 0.3 + high * 0.2 + 1) / 2;
    return val * val;
  });

  for (let y = 0; y < height; y++) {
    let rowText = '';
    const threshold = 1 - (y / height);
    const nextThreshold = 1 - ((y + 1) / height);

    for (let x = 0; x < width; x++) {
      const val = levels[x]!;
      if (val > threshold) {
        rowText += '█';
      } else if (val > nextThreshold) {
        const diff = (val - nextThreshold) / (threshold - nextThreshold);
        if (diff > 0.75) rowText += '▇';
        else if (diff > 0.5) rowText += '▆';
        else if (diff > 0.25) rowText += '▅';
        else rowText += '▃';
      } else {
        rowText += ' ';
      }
    }

    let color = colors[1] ?? '#ff00ff';
    if (y < height * 0.3) {
      color = colors[4] ?? '#00ffff';
    } else if (y < height * 0.7) {
      color = colors[3] ?? '#00ffff';
    } else {
      color = colors[2] ?? '#ff00ff';
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
  const cx = Math.floor(width * 0.5);
  const cy = Math.floor((height - 1) * 0.48);
  const xScale = Math.max(6, Math.min(width * 0.18, height * 1.32));
  const yScale = Math.max(2, Math.min(height * 0.18, width * 0.035));
  const detail = Math.max(14, Math.min(34, Math.round(Math.min(width * 0.36, height * 2.45))));
  const angleY = pulse * 0.065;
  const angleX = pulse * 0.039 + 0.42;
  const angleZ = pulse * 0.021 - 0.18;
  const distance = 5.6;
  const light = normalize3d({x: -0.35, y: -0.62, z: 0.7});
  const shadeChars = ['.', ':', ';', '=', '+', '*', '#', '%', '@'];
  const faces = [
    {axis: 'x', sign: 1, normal: {x: 1, y: 0, z: 0}},
    {axis: 'x', sign: -1, normal: {x: -1, y: 0, z: 0}},
    {axis: 'y', sign: 1, normal: {x: 0, y: 1, z: 0}},
    {axis: 'y', sign: -1, normal: {x: 0, y: -1, z: 0}},
    {axis: 'z', sign: 1, normal: {x: 0, y: 0, z: 1}},
    {axis: 'z', sign: -1, normal: {x: 0, y: 0, z: -1}}
  ] as const;

  for (const face of faces) {
    const rotatedNormal = rotate3d(face.normal, angleX, angleY, angleZ);
    if (rotatedNormal.z < -0.88) {
      continue;
    }

    const lightLevel = clampNumber(
      rotatedNormal.x * light.x + rotatedNormal.y * light.y + rotatedNormal.z * light.z,
      -1,
      1
    );

    for (let row = 0; row <= detail; row += 1) {
      const u = row / detail * 2 - 1;
      for (let column = 0; column <= detail; column += 1) {
        const v = column / detail * 2 - 1;
        const point = cubeFacePoint(face.axis, face.sign, u, v);
        const rotated = rotate3d(point, angleX, angleY, angleZ);
        const projected = project3d(rotated, cx, cy, xScale, yScale, distance);
        const sx = projected.x;
        const sy = projected.y;

        if (sx < 0 || sx >= width || sy < 0 || sy >= height || rotated.z <= zBuffer[sy]![sx]!) {
          continue;
        }

        const edge = Math.max(Math.abs(u), Math.abs(v));
        const surfaceRipple = Math.sin((u * 5.7 + v * 4.1 + pulse * 0.11) + face.sign) * 0.11;
        const brightness = clampNumber((lightLevel + 1) * 0.34 + rotated.z * 0.08 + edge * 0.12 + surfaceRipple, 0, 1);
        const shadeIndex = Math.min(shadeChars.length - 1, Math.max(0, Math.round(brightness * (shadeChars.length - 1))));
        grid[sy]![sx] = shadeChars[shadeIndex]!;
        zBuffer[sy]![sx] = rotated.z;
      }
    }
  }

  const vertices = [
    {x: -1, y: -1, z: -1},
    {x: 1, y: -1, z: -1},
    {x: 1, y: 1, z: -1},
    {x: -1, y: 1, z: -1},
    {x: -1, y: -1, z: 1},
    {x: 1, y: -1, z: 1},
    {x: 1, y: 1, z: 1},
    {x: -1, y: 1, z: 1}
  ].map(point => project3d(rotate3d(point, angleX, angleY, angleZ), cx, cy, xScale, yScale, distance));
  const edges: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7]
  ];

  for (const [from, to] of edges) {
    drawAsciiCubeEdge(grid, zBuffer, vertices[from]!, vertices[to]!);
  }

  addCubeSignalSpecks(grid, pulse);

  const accent = themeAccent(theme);
  return grid.map((cells, rowIndex) => {
    const text = cells.join('').slice(0, width);
    const hasCube = /[.:;=+*#%@]/.test(text);
    const hasSignal = /[oO]/.test(text);
    let color = '#ff5f87';

    if (!hasCube && hasSignal) {
      color = accent;
    } else if (!hasCube) {
      color = '#767676';
    } else if (rowIndex < height * 0.25) {
      color = '#ff9ab3';
    } else if (rowIndex > height * 0.76) {
      color = '#c06cff';
    }

    return {text, color};
  });
}

function buildSdrSpectrum(
  pulse: number,
  width: number,
  requestedHeight: number,
  station: Station | null,
  playback: PlaybackState
): VisualLine[] {
  const height = Math.max(10, requestedHeight);
  const labelWidth = 5;
  const graphWidth = Math.max(18, width - labelWidth);
  const graphHeight = Math.max(5, height - 5);
  const center = centerFrequency(station);
  const seed = hashText(station?.id ?? station?.name ?? 'radiocli');
  const rows: VisualLine[] = [
    {
      text: fitLine(`┌[ radiocli-sdr ]${'─'.repeat(Math.max(0, width - 20))}`, width),
      color: '#c06cff'
    },
    {
      text: fitLine(`Freq: ${center.toFixed(3)} MHz  |  Rate: 0.20 Msps  |  Gain: Auto`, width),
      color: '#d4d8e1'
    },
    {
      text: fitLine(`Dyn Range: 80 dB  |  Ref Level: 0 dB  |  FPS: 15  |  ${playback.state.toUpperCase()}`, width),
      color: '#d4d8e1'
    },
    {
      text: fitLine('-'.repeat(width), width),
      color: '#7e2dbb'
    }
  ];

  const levels = Array.from({length: graphWidth}, (_, index) => sdrDbAt(index, pulse, graphWidth, seed));
  for (let rowIndex = 0; rowIndex < graphHeight; rowIndex += 1) {
    const rowDb = sdrRowDb(rowIndex, graphHeight);
    const label = String(rowDb).padStart(labelWidth - 1, ' ').padEnd(labelWidth, ' ');
    const trace = levels
      .map((db, index) => {
        const filled = db >= rowDb;
        if (filled && isCarrier(index, graphWidth)) {
          return '#';
        }

        if (filled) {
          return index % 3 === 0 ? ':' : '|';
        }

        return index % 12 === 0 ? '·' : ' ';
      })
      .join('');

    rows.push({
      text: `${label}${trace}`.slice(0, width),
      color: rowIndex < Math.max(1, graphHeight * 0.35) ? '#7e2dbb' : '#ff64d8'
    });
  }

  rows.push({
    text: `${' '.repeat(labelWidth)}${frequencyMarkers(center, graphWidth)}`.slice(0, width),
    color: '#d4d8e1'
  });

  return rows.slice(0, height);
}

function buildZeroSdrSpectrum(
  width: number,
  requestedHeight: number,
  station: Station | null,
  playback: PlaybackState
): VisualLine[] {
  const height = Math.max(10, requestedHeight);
  const labelWidth = 5;
  const graphWidth = Math.max(18, width - labelWidth);
  const graphHeight = Math.max(5, height - 5);
  const center = centerFrequency(station);
  const rows: VisualLine[] = [
    {
      text: fitLine(`┌[ radiocli-sdr ]${'─'.repeat(Math.max(0, width - 20))}`, width),
      color: '#c06cff'
    },
    {
      text: fitLine(`Freq: ${center.toFixed(3)} MHz  |  Rate: 0.00 Msps  |  Signal: 0`, width),
      color: '#d4d8e1'
    },
    {
      text: fitLine(`Dyn Range: 80 dB  |  Ref Level: 0 dB  |  ${playback.state.toUpperCase()}`, width),
      color: '#d4d8e1'
    },
    {
      text: fitLine('-'.repeat(width), width),
      color: '#7e2dbb'
    }
  ];

  for (let rowIndex = 0; rowIndex < graphHeight; rowIndex += 1) {
    const rowDb = sdrRowDb(rowIndex, graphHeight);
    const label = String(rowDb).padStart(labelWidth - 1, ' ').padEnd(labelWidth, ' ');
    const trace = rowIndex === graphHeight - 1 ? '▁'.repeat(graphWidth) : ''.padEnd(graphWidth, ' ');

    rows.push({
      text: `${label}${trace}`.slice(0, width),
      color: rowIndex === graphHeight - 1 ? '#ff64d8' : '#7e2dbb'
    });
  }

  rows.push({
    text: `${' '.repeat(labelWidth)}${frequencyMarkers(center, graphWidth)}`.slice(0, width),
    color: '#d4d8e1'
  });

  return rows.slice(0, height);
}

function buildSpectrum(pulse: number, width: number, requestedHeight: number): string[] {
  const height = Math.max(4, requestedHeight);
  const bandCount = Math.max(18, width);
  const levels = Array.from({length: bandCount}, (_, index) => {
    if (index % 2 === 1) {
      return 0;
    }

    const low = Math.sin(index * 0.12 + pulse * 0.35);
    const mid = Math.sin(index * 0.047 - pulse * 0.22);
    const high = Math.sin(index * 0.33 + pulse * 0.58);
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
  const height = Math.max(5, requestedHeight);
  const rows: string[][] = Array.from({length: height}, (_, rowIndex) =>
    Array.from({length: width}, (_, columnIndex) => (rowIndex === Math.floor(height / 2) && columnIndex % 4 === 0 ? '·' : ' '))
  );
  const amplitude = Math.max(1, (height - 2) / 2);
  const midpoint = (height - 1) / 2;

  for (let x = 0; x < width; x += 1) {
    const current = scopeY(x, pulse, midpoint, amplitude);
    const next = scopeY(x + 1, pulse, midpoint, amplitude);
    const y = clampIndex(Math.round(current), height);
    const slope = next - current;
    rows[y]![x] = slope > 0.18 ? '╲' : slope < -0.18 ? '╱' : '─';
  }

  return rows.map(row => row.join(''));
}

function buildSignal(pulse: number, width: number, requestedHeight: number): string[] {
  const meterWidth = Math.max(10, width - 9);
  const rows = [
    `LEFT   ${buildMeter(pulse, meterWidth, 0)}`.slice(0, width),
    `RIGHT  ${buildMeter(pulse, meterWidth, 2)}`.slice(0, width),
    `TUNER  ${buildMeter(pulse, meterWidth, 4)}`.slice(0, width)
  ];

  while (rows.length < requestedHeight) {
    rows.splice(rows.length - 1, 0, ''.padEnd(width, ' '));
  }

  return rows.slice(0, requestedHeight);
}

function buildMeter(pulse: number, width: number, offset: number): string {
  const symbols = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  return Array.from({length: width}, (_, index) => {
    if (index % 9 === 8) {
      return ' ';
    }

    const value = Math.round((Math.sin(index * 0.43 + pulse * 0.55 + offset) + 1) * 3.5);
    return symbols[value] ?? '▄';
  }).join('');
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
  const t = pulse * 0.075 + variant;
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
  if (style === 'retro' || style === 'cassette' || style === 'vinyl') {
    return 8;
  }

  if (style === 'radar') {
    return Math.max(10, Math.min(14, availableRows));
  }

  const maxRowsByStyle: Partial<Record<ReceiverStyle, number>> = {
    sdr: 16,
    oscilloscope: 9,
    signal: 6,
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
    neon: 12,
    matrix: 14,
    hologram: 12,
    cube: 14
  };
  const maxRows = maxRowsByStyle[style] ?? 8;
  const minRows = style === 'sdr' ? 6 : style === 'cube' || style === 'motion-contour' ? 8 : style.startsWith('motion-') ? 6 : 3;
  return Math.max(minRows, Math.min(maxRows, availableRows));
}

type Point3d = {
  x: number;
  y: number;
  z: number;
};

type ProjectedPoint = {
  x: number;
  y: number;
  z: number;
};

function cubeFacePoint(axis: 'x' | 'y' | 'z', sign: 1 | -1, u: number, v: number): Point3d {
  if (axis === 'x') {
    return {x: sign, y: u, z: v};
  }

  if (axis === 'y') {
    return {x: u, y: sign, z: v};
  }

  return {x: u, y: v, z: sign};
}

function rotate3d(point: Point3d, angleX: number, angleY: number, angleZ: number): Point3d {
  const cosX = Math.cos(angleX);
  const sinX = Math.sin(angleX);
  const y1 = point.y * cosX - point.z * sinX;
  const z1 = point.y * sinX + point.z * cosX;

  const cosY = Math.cos(angleY);
  const sinY = Math.sin(angleY);
  const x2 = point.x * cosY + z1 * sinY;
  const z2 = -point.x * sinY + z1 * cosY;

  const cosZ = Math.cos(angleZ);
  const sinZ = Math.sin(angleZ);
  return {
    x: x2 * cosZ - y1 * sinZ,
    y: x2 * sinZ + y1 * cosZ,
    z: z2
  };
}

function normalize3d(point: Point3d): Point3d {
  const length = Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z) || 1;
  return {
    x: point.x / length,
    y: point.y / length,
    z: point.z / length
  };
}

function project3d(point: Point3d, cx: number, cy: number, xScale: number, yScale: number, distance: number): ProjectedPoint {
  const perspective = distance / (distance - point.z);
  return {
    x: Math.round(cx + point.x * xScale * perspective),
    y: Math.round(cy + point.y * yScale * perspective),
    z: point.z
  };
}

function drawAsciiCubeEdge(grid: string[][], zBuffer: number[][], from: ProjectedPoint, to: ProjectedPoint): void {
  const width = grid[0]?.length ?? 0;
  const height = grid.length;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = Math.round(from.x + dx * t);
    const y = Math.round(from.y + dy * t);
    const z = from.z + (to.z - from.z) * t;

    if (x < 0 || x >= width || y < 0 || y >= height || z < zBuffer[y]![x]! - 0.18) {
      continue;
    }

    const depthChar = z > 0.75 ? '@' : z > 0.25 ? '#' : z > -0.25 ? '*' : '=';
    grid[y]![x] = depthChar;
    zBuffer[y]![x] = Math.max(zBuffer[y]![x]!, z);
  }
}

function addCubeSignalSpecks(grid: string[][], pulse: number): void {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const specks = Math.max(4, Math.min(10, Math.floor(width / 16)));
  const chars = ['.', "'", '+', 'o', 'O'];

  for (let index = 0; index < specks; index += 1) {
    const seed = index * 37.7;
    const orbit = pulse * (0.018 + index * 0.0009) + seed;
    const side = index % 3 === 0 ? -1 : 1;
    const x = Math.round(width * (side < 0 ? 0.28 : 0.72) + Math.sin(orbit) * width * 0.05 + Math.cos(seed) * width * 0.025);
    const y = Math.round(height * 0.5 + Math.cos(orbit * 1.7) * height * 0.26);

    if (x < 0 || x >= width || y < 0 || y >= height || grid[y]![x] !== ' ') {
      continue;
    }

    grid[y]![x] = chars[(index + pulse) % chars.length] ?? '.';
  }
}

function scopeY(x: number, pulse: number, midpoint: number, amplitude: number): number {
  const primary = Math.sin(x * 0.13 + pulse * 0.22);
  const secondary = Math.sin(x * 0.031 - pulse * 0.12) * 0.45;
  return midpoint + (primary + secondary) * amplitude * 0.68;
}

function clampIndex(value: number, length: number): number {
  return Math.max(0, Math.min(length - 1, value));
}

function sdrDbAt(index: number, pulse: number, width: number, seed: number): number {
  const position = index / Math.max(1, width - 1);
  const drift = pulse * 0.18;
  const noise =
    Math.sin(index * 0.73 + seed * 0.013 + drift) * 4.5 +
    Math.sin(index * 0.19 - drift * 0.7) * 3;
  const floor = -62 + Math.sin(index * 0.045 + seed) * 5;
  const centerHump = 17 * Math.exp(-Math.pow((position - 0.54) * 2.35, 2));
  const lowNotch = -9 * Math.exp(-Math.pow((position - 0.13) * 21, 2));
  const peaks =
    carrierPeak(position, 0.40, 16) +
    carrierPeak(position, 0.48, 24) +
    carrierPeak(position, 0.55, 20) +
    carrierPeak(position, 0.64, 15);

  return clampNumber(floor + noise + centerHump + lowNotch + peaks, -80, -8);
}

function sdrRowDb(rowIndex: number, graphHeight: number): number {
  if (graphHeight <= 8) {
    const labels = [-10, -20, -30, -40, -50, -60, -70, -80];
    if (rowIndex === graphHeight - 1) {
      return -80;
    }

    return labels[Math.min(rowIndex, labels.length - 1)] ?? -80;
  }

  return -Math.round(((rowIndex + 1) * 80) / graphHeight / 10) * 10;
}

function carrierPeak(position: number, center: number, strength: number): number {
  return strength * Math.exp(-Math.pow((position - center) * 82, 2));
}

function isCarrier(index: number, width: number): boolean {
  const position = index / Math.max(1, width - 1);
  return [0.40, 0.48, 0.55, 0.64].some(center => Math.abs(position - center) < 0.006);
}

function centerFrequency(station: Station | null): number {
  const hash = hashText(station?.name ?? station?.id ?? 'radiocli');
  return 87.7 + (hash % 202) / 10;
}

function frequencyMarkers(center: number, width: number): string {
  const labels = [-0.08, -0.04, 0, 0.04, 0.08].map(offset => `${(center + offset).toFixed(2)}MHz`);
  const row = Array.from({length: width}, () => ' ');
  for (const [index, label] of labels.entries()) {
    const anchor = Math.round((index / Math.max(1, labels.length - 1)) * (width - label.length));
    for (let character = 0; character < label.length && anchor + character < width; character += 1) {
      row[anchor + character] = label[character]!;
    }
  }

  return row.join('');
}

function hashText(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function fitLine(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value.padEnd(width, ' ');
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
