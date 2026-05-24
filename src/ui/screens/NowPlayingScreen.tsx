import React from 'react';
import {Box, Text} from 'ink';
import type {
  IcyNowPlaying,
  PlaybackDiagnostics,
  PlaybackState,
  ReceiverStyle,
  Station,
  ThemeName
} from '../../types.js';
import {stationLocation, stationTags, stationTech, truncate} from '../format.js';
import {panelBackground, themeAccent, themeContributionColors} from '../theme.js';

type NowPlayingProps = {
  station: Station | null;
  playback: PlaybackState;
  metadata: IcyNowPlaying | null;
  theme: ThemeName;
  favorite: boolean;
  pulse: number;
  diagnostics: PlaybackDiagnostics;
  sleepLabel: string;
  showDiagnostics: boolean;
  stationTime: string;
  receiverStyle: ReceiverStyle;
  width: number;
  height: number;
};

type VisualLine = {
  text: string;
  color: string;
};

export function NowPlayingScreen({
  station,
  playback,
  metadata,
  theme,
  favorite,
  pulse,
  diagnostics,
  sleepLabel,
  showDiagnostics,
  stationTime,
  receiverStyle,
  width,
  height
}: NowPlayingProps): React.ReactElement {
  const accent = themeAccent(theme);
  const panelWidth = Math.max(62, width);
  const panelHeight = Math.max(10, height);
  const innerWidth = Math.max(28, panelWidth - 6);
  const visualHeight = visualizerHeight(receiverStyle, panelHeight - (showDiagnostics ? 19 : 15));
  const visualRows = buildVisualizer(receiverStyle, pulse, innerWidth, visualHeight, station, playback, theme);
  const stationName = station ? truncate(station.name, innerWidth) : 'No station tuned';
  const stationPlace = station
    ? truncate(stationLocation(station).toUpperCase(), innerWidth)
    : 'Choose a station from Explore, Countries, Search, Nearby, Recent, or Favorites.';
  const tech = station ? truncate(stationTech(station), innerWidth) : 'Playback backend ready when mpv or ffplay is installed.';
  const tags = station ? truncate(stationTags(station), innerWidth) : 'No stream metadata yet.';
  const metadataLine = metadata?.title ? truncate(metadata.title, innerWidth) : 'Waiting for ICY track metadata';
  const controls = truncate('space pause · f favorite · +/- volume · m mute · s sleep · n/p station · d diagnostics · b back', innerWidth);

  return (
    <Box flexDirection="column">
      <Text bold>Now playing</Text>
      <Box
        borderStyle="round"
        borderColor={accent}
        borderBackgroundColor={panelBackground}
        backgroundColor={panelBackground}
        flexDirection="column"
        paddingX={2}
        paddingY={1}
        width={panelWidth}
        height={panelHeight}
      >
        <Box justifyContent="space-between" width={innerWidth}>
          <Text color={accent} bold>
            FM {station?.bitrate ? String(station.bitrate).padStart(3, '0') : '---'}.
            {station?.codec ? station.codec.slice(0, 1).toUpperCase() : '0'}
          </Text>
          <Text color={accent}>RADIO ATLAS</Text>
          <Text color={accent}>{playback.state.toUpperCase()}</Text>
        </Box>
        <Box marginTop={1}>
          <Text color={accent} bold>{stationName}</Text>
        </Box>
        <Text color="gray">{truncate(stationPlace, innerWidth)}</Text>
        <Box marginTop={1} flexDirection="column">
          {visualRows.map((row, index) => (
            <Text key={index} color={row.color}>
              {row.text}
            </Text>
          ))}
        </Box>
        <Text>{tech}</Text>
        <Text color="gray">{tags}</Text>
        <Box marginTop={1}>
          <Text color={metadata?.title ? accent : 'gray'}>{metadataLine}</Text>
        </Box>
        <Box marginTop={1} justifyContent="space-between" width={innerWidth}>
          <Text color="gray">
            Backend {playback.backend} · Vol {diagnostics.muted ? 'muted' : diagnostics.volume}
          </Text>
          <Text color={favorite ? 'yellow' : 'gray'}>{favorite ? '★ FAVORITE' : '☆ NOT FAVORITE'}</Text>
          <Text color="gray">{sleepLabel}</Text>
        </Box>
        <Box>
          <Text color="gray">{controls}</Text>
        </Box>
        {showDiagnostics ? (
          <Box marginTop={1} flexDirection="column">
            <Text color="gray">Diagnostics</Text>
            <Text color="gray">Stream: {diagnostics.streamUrl ? truncate(diagnostics.streamUrl, innerWidth - 8) : 'none'}</Text>
            <Text color="gray">Station time: {stationTime}</Text>
            <Text color="gray">
              Started: {diagnostics.startedAt ? new Date(diagnostics.startedAt).toLocaleTimeString() : 'not playing'} ·
              available {diagnostics.availableBackends.join(', ') || 'none'}
            </Text>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

function buildVisualizer(
  style: ReceiverStyle,
  pulse: number,
  width: number,
  height: number,
  station: Station | null,
  playback: PlaybackState,
  theme: ThemeName
): VisualLine[] {
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

  return buildSpectrum(pulse, width, height).map(text => ({text, color: '#ffb000'}));
}

function buildRetro(
  pulse: number,
  width: number,
  height: number,
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
  height: number,
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
  height: number
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
  
  for(let y=0; y < height; y++) {
     const rowText = rows[y]!.text;
     let formattedText = "";
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
  const seed = hashText(station?.id ?? station?.name ?? 'radio-atlas');
  const rows: VisualLine[] = [
    {
      text: fitLine(`┌[ radio-atlas-sdr ]${'─'.repeat(Math.max(0, width - 20))}`, width),
      color: '#c06cff'
    },
    {
      text: fitLine(`[f-F]req: ${center.toFixed(3)} MHz  |  [r-R]ate: 0.20 Msps  |  [g-G]ain: Auto`, width),
      color: '#d4d8e1'
    },
    {
      text: fitLine(`[d-D]yn Range: 80 dB  |  Ref [l-L]evel: 0 dB  |  fps[S]: 15  |  ${playback.state.toUpperCase()}`, width),
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

function visualizerHeight(style: ReceiverStyle, availableRows: number): number {
  if (style === 'retro' || style === 'cassette' || style === 'vinyl') {
    return 8;
  }
  if (style === 'radar') {
    return Math.max(10, Math.min(14, availableRows));
  }
  const maxRows = style === 'sdr' ? 16 : style === 'oscilloscope' ? 9 : style === 'signal' ? 6 : style === 'waterfall' ? 12 : style === 'equalizer' ? 12 : style === 'blocks' ? 12 : style === 'leds' ? 10 : style === 'stars' ? 12 : style === 'neon' ? 12 : style === 'matrix' ? 14 : style === 'hologram' ? 12 : 8;
  const minRows = style === 'sdr' ? 6 : 3;
  return Math.max(minRows, Math.min(maxRows, availableRows));
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
  const hash = hashText(station?.name ?? station?.id ?? 'radio-atlas');
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
