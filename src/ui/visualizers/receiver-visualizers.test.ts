import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {defaultReceiverStyle, receiverStyleNames, type PlaybackState, type ReceiverStyle, type Station} from '../../types.js';
import {buildVisualizer, visualizerHeight} from './receiver-visualizers.js';

const station: Station = {
  id: 'station-1',
  provider: 'radio-browser',
  name: 'KEXP 90.3 FM',
  country: 'United States',
  tags: ['alternative', 'indie']
};

const playback: PlaybackState = {
  state: 'playing',
  backend: 'mpv',
  message: 'playing',
  volume: 70,
  muted: false,
  ready: true
};

const inactivePlaybacks: PlaybackState[] = [
  {...playback, state: 'idle', backend: 'none', message: 'idle', ready: false},
  {...playback, state: 'stopped', message: 'stopped', ready: false},
  {...playback, state: 'loading', message: 'loading', ready: false},
  {...playback, state: 'error', message: 'error', ready: false}
];
const pausedPlayback: PlaybackState = {...playback, state: 'paused', message: 'paused'};

function frameText(rows: ReturnType<typeof buildVisualizer>): string {
  return rows.map(row => row.text).join('\n');
}

function frameSignature(rows: ReturnType<typeof buildVisualizer>): string {
  return JSON.stringify(rows);
}

function frameHash(rows: ReturnType<typeof buildVisualizer>): string {
  return createHash('sha256').update(frameSignature(rows)).digest('hex');
}

function visibleCellCount(rows: ReturnType<typeof buildVisualizer>): number {
  return rows.reduce((total, row) => {
    if (!row.segments) {
      return total + row.text.replace(/\s/g, '').length;
    }

    return (
      total +
      row.segments.reduce(
        (rowTotal, segment) =>
          rowTotal + (segment.backgroundColor ? segment.text.length : segment.text.replace(/\s/g, '').length),
        0
      )
    );
  }, 0);
}

const cubeGlyph = /[.:;=+*#%@/\\|_\-]/;
const asciiAnimationStyles = ['fire', 'fireworks', 'spinning-donut', 'starfield'] as const;
const newlyResponsiveStyles = [
  'ultracode',
  'motion-contour',
  'leds',
  'matrix',
  'hologram',
  'equalizer',
  'cube',
  'fire',
  'fireworks',
  'spinning-donut',
  'starfield'
] as const;
const immersiveReceiverStyles = [
  'sumi-ocean'
] as const satisfies readonly ReceiverStyle[];
const retiredExternalStylePrefix = `${'term'}${'flix'}-`;
const removedReceiverStyles = [
  'spectrum',
  'oscilloscope',
  'motion-bars',
  'motion-dots',
  'motion-braid',
  'radar',
  'dual-ripple',
  'perspective-floor',
  'bloom-bars',
  'coral',
  'bokeh',
  'vector-balls',
  'smoke',
  'running-horse',
  'tesla-arcs',
  'isometric',
  'clockwork',
  'starlink',
  'stained-glass',
  'barcode',
  'inkblot',
  'wave-stack',
  'glitch-blocks',
  'motion-area',
  'mirror',
  'circuit-pulse',
  'shard-field',
  'honeycomb',
  'magma',
  'oil-slick',
  'warp-streak',
  'blocks',
  'vu-meters',
  'dejong',
  'truchet',
  'tuning-dial',
  'prism',
  `${retiredExternalStylePrefix}plasma`,
  `${retiredExternalStylePrefix}fire`,
  `${retiredExternalStylePrefix}matrix`,
  `${retiredExternalStylePrefix}starfield`,
  `${retiredExternalStylePrefix}waterfall`,
  `${retiredExternalStylePrefix}radar`,
  'pendulum',
  'lightning',
  'garden',
  'pulse',
  'sandstorm',
  'crystallize',
  'dragon',
  'sierpinski',
  'maze',
  'sort',
  'tetris',
  'snake',
  'invaders',
  'pong',
  'flappy-bird',
  'waterfall',
  'cassette',
  'stars',
  'radio-waves',
  'raindrops',
  'vinyl',
  'soundwave',
  'spectrum-3d',
  'rf-constellation',
  'sphere',
  'mobius',
  's-meter',
  'dna',
  'jellyfish',
  'orbits',
  'chromatic',
  'ferro-crown',
  'nautilus',
  'vortex-street',
  'kinetic-mobile',
  'harmonic-harp',
  'neon-transit',
  'lantern-drift',
  'murmuration',
  'koi-shoal',
  'calligraphy',
  'aperture-bloom',
  'kintsugi',
  'sonic-loom',
  'river-delta',
  'peacock-plume',
  'eclipse-corona',
  'cloud-chamber',
  'origami-tide',
  'tv-static',
  'sunspot',
  'plasma',
  'metaballs',
  'moonlit-tide',
  'sumi-mountains',
  'motion-blob',
  'clifford',
  'paris',
  'kyoto',
  'sahara'
] as const;

function glyphFootprint(rows: ReturnType<typeof buildVisualizer>, pattern: RegExp): {width: number; height: number; minY: number; maxY: number} {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  rows.forEach((row, y) => {
    for (let x = 0; x < row.text.length; x += 1) {
      if (!pattern.test(row.text[x]!)) {
        continue;
      }

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  });

  return {
    width: Number.isFinite(minX) ? maxX - minX + 1 : 0,
    height: Number.isFinite(minY) ? maxY - minY + 1 : 0,
    minY: Number.isFinite(minY) ? minY : -1,
    maxY: Number.isFinite(maxY) ? maxY : -1
  };
}

function backgroundAt(rows: ReturnType<typeof buildVisualizer>, y: number, x: number): string | undefined {
  const row = rows[y];
  let offset = 0;
  for (const segment of row?.segments ?? []) {
    const end = offset + segment.text.length;
    if (x >= offset && x < end) {
      return segment.backgroundColor;
    }
    offset = end;
  }

  return undefined;
}

describe('receiver visualizers', () => {
  it('registers exactly the remaining immersive receiver styles', () => {
    expect(immersiveReceiverStyles).toHaveLength(1);
    expect(new Set(immersiveReceiverStyles).size).toBe(1);
    expect(receiverStyleNames).toEqual(expect.arrayContaining([...immersiveReceiverStyles]));
  });

  it('cycles receiver styles by visual family and defaults to gallop fine', () => {
    expect(defaultReceiverStyle).toBe('gallop-fine');
    expect(receiverStyleNames.slice(0, 8)).toEqual([
      'ultracode',
      'pulse-grid',
      'hex-pulse',
      'moire',
      'galaxy',
      'cyclone',
      'nebula',
      'lava-lamp'
    ]);
    expect(receiverStyleNames[receiverStyleNames.indexOf('lava-lamp') + 1]).toBe('gallop-fine');
    expect(receiverStyleNames.indexOf('cascade')).toBe(receiverStyleNames.indexOf('matrix') + 1);
    expect(receiverStyleNames.indexOf('equalizer')).toBe(receiverStyleNames.indexOf('hologram') + 1);
    expect(receiverStyleNames.indexOf('braille-wave')).toBe(receiverStyleNames.indexOf('ribbon') + 1);
    expect(receiverStyleNames.indexOf('caustics')).toBe(receiverStyleNames.indexOf('spectrogram') + 1);
    expect(receiverStyleNames.indexOf('spinning-donut')).toBe(receiverStyleNames.indexOf('cube') + 1);
  });

  it('keeps every immersive style inside its viewport with reconstructable segments', () => {
    const width = 73;

    for (const style of immersiveReceiverStyles) {
      const height = visualizerHeight(style, 14, width);
      const rows = buildVisualizer(style, 17, width, height, station, playback, 'violet');

      expect(rows.length, style).toBeGreaterThan(0);
      expect(rows.length, style).toBeLessThanOrEqual(height);
      for (const row of rows) {
        expect(row.text.length, style).toBeLessThanOrEqual(width);
        expect(row.color, style).not.toBe('');
        if (row.segments) {
          expect(row.segments.map(segment => segment.text).join(''), style).toBe(row.text);
          expect(row.segments.every(segment => segment.color.length > 0), style).toBe(true);
        }
      }
    }
  });

  it('renders deterministic immersive frames for the same synthetic pulse', () => {
    for (const style of immersiveReceiverStyles) {
      const height = visualizerHeight(style, 14, 79);
      const first = buildVisualizer(style, 31, 79, height, station, playback, 'ruby');
      const repeated = buildVisualizer(style, 31, 79, height, station, playback, 'ruby');

      expect(repeated, style).toEqual(first);
    }
  });

  it('keeps every receiver frame deterministic for identical inputs', () => {
    for (const style of receiverStyleNames) {
      const height = visualizerHeight(style, 12, 67);
      const first = buildVisualizer(style, 23, 67, height, station, playback, 'blue');
      const repeated = buildVisualizer(style, 23, 67, height, station, playback, 'blue');

      expect(repeated, style).toEqual(first);
    }
  });

  it('keeps optimized Ultra Code frames byte-for-byte identical', () => {
    const expected = new Map([
      [0, '1cfd93ef3dfc17e22b21bfc8068af84449d2276e7feccd5b1ed2bbe7d1ee02c5'],
      [1, '116758d37e23ae18907a47269735e5b5cadaa21377fbc8c8a59bd6111ca7b88d'],
      [17, '98b916a484db2c341e5c266e43c005d1a4e9266d5dd1887b42d621f39322d7c0'],
      [63, 'b0093bcada12cc256eb39809c3bb6a324bd48ab84b9119b5f9c1b6117c22c6c2']
    ]);

    for (const [pulse, hash] of expected) {
      expect(frameHash(buildVisualizer('ultracode', pulse, 83, 13, station, playback, 'violet'))).toBe(hash);
    }
  });

  it('animates every immersive style as its synthetic pulse changes', () => {
    const pulses = [3, 11, 29, 61];

    for (const style of immersiveReceiverStyles) {
      const height = visualizerHeight(style, 14, 79);
      const frames = pulses.map(pulse =>
        frameSignature(buildVisualizer(style, pulse, 79, height, station, playback, 'teal'))
      );

      expect(new Set(frames).size, style).toBeGreaterThan(1);
    }
  });

  it('gives every immersive style a substantial and distinct visual identity', () => {
    const signatures: string[] = [];

    for (const style of immersiveReceiverStyles) {
      const height = visualizerHeight(style, 14, 79);
      const frames = [13, 37].map(pulse => buildVisualizer(style, pulse, 79, height, station, playback, 'ice'));

      expect(Math.max(...frames.map(visibleCellCount)), style).toBeGreaterThanOrEqual(height);
      signatures.push(frames.map(frameSignature).join('\n'));
    }

    expect(new Set(signatures).size).toBe(immersiveReceiverStyles.length);
  });

  it('excludes retired receiver styles from the UI cycle', () => {
    const styles = new Set<string>(receiverStyleNames);

    expect(styles.has('equalizer')).toBe(true);
    expect(styles.has('ultracode')).toBe(true);
    expect(styles.has('mirror')).toBe(false);
    for (const style of removedReceiverStyles) {
      expect(styles.has(style)).toBe(false);
    }
  });

  it('renders every receiver style inside the requested width', () => {
    for (const style of receiverStyleNames) {
      const height = visualizerHeight(style, 12);
      const rows = buildVisualizer(style, 4, 64, height, station, playback, 'green');

      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThanOrEqual(height);
      for (const row of rows) {
        expect(row.text.length).toBeLessThanOrEqual(64);
      }
    }
  });

  it('fits every receiver style into a complete 20x4 micro viewport', () => {
    for (const style of receiverStyleNames) {
      const rows = buildVisualizer(style, 24, 20, 4, station, playback, 'ruby', 'micro');

      expect(rows, style).toHaveLength(4);
      expect(rows.some(row => row.text.trim() || row.segments?.some(segment => segment.backgroundColor)), style).toBe(true);
      for (const row of rows) {
        expect(row.text.length, style).toBe(20);
        expect(row.segments?.map(segment => segment.text).join(''), style).toBe(row.text);
      }
    }
  });

  it('draws Pulse Grid with its original spaced radial glyphs in micro mode', () => {
    const rows = buildVisualizer('pulse-grid', 2, 20, 4, station, playback, 'ruby', 'micro');

    expect(frameText(rows)).toMatch(/[·∘•●◉]/);
    expect(frameText(rows)).not.toMatch(/[⠀-⣿]/);
    expect(rows.every(row => [...row.text].every((glyph, index) => index % 2 === 0 || glyph === ' '))).toBe(true);
  });

  it('keeps Pulse Grid rings perfectly radial instead of deforming their contours', () => {
    const rows = buildVisualizer('pulse-grid', 7, 81, 13, station, playback, 'teal');
    const text = rows.map(row => row.text);

    expect(text).toEqual([...text].reverse());
    expect(text.every(row => row === [...row].reverse().join(''))).toBe(true);
  });

  it('keeps the micro Hex Pulse balanced around both axes', () => {
    const rows = buildVisualizer('hex-pulse', 2, 20, 4, station, playback, 'ruby', 'micro');

    expect(rows[0]?.text).toBe(rows[3]?.text);
    expect(rows[1]?.text).toBe(rows[2]?.text);
  });

  it('compresses Ultracode ripple spacing instead of cropping full-size rings', () => {
    const direct = buildVisualizer('ultracode', 8, 20, 4, station, playback, 'violet');
    const micro = buildVisualizer('ultracode', 8, 20, 4, station, playback, 'violet', 'micro');
    const transitions = (rows: typeof micro) => rows.reduce((total, row) => total + (row.segments?.length ?? 0), 0);

    expect(transitions(micro)).toBeGreaterThan(transitions(direct));
  });

  it('keeps the complete Liftoff rocket visible throughout a micro launch', () => {
    for (const pulse of [2, 40, 200]) {
      const text = frameText(buildVisualizer('liftoff', pulse, 20, 4, station, playback, 'ruby', 'micro'));

      expect(text, `pulse ${pulse}`).toContain('▲');
      expect(text, `pulse ${pulse}`).toMatch(/[_\\/]/);
    }
  });

  it('lets spacious receiver styles grow in tall panels without exceeding a landscape-safe height', () => {
    const compactMeshHeight = visualizerHeight('mesh', 12, 114);
    const tallMeshHeight = visualizerHeight('mesh', 42, 114);

    expect(compactMeshHeight).toBe(12);
    expect(tallMeshHeight).toBeGreaterThan(compactMeshHeight);
    expect(tallMeshHeight).toBeLessThanOrEqual(Math.floor(114 / 3));
  });

  it('lets the core receiver styles grow in tall panels', () => {
    for (const style of newlyResponsiveStyles) {
      const compactHeight = visualizerHeight(style, 12, 114);
      const tallHeight = visualizerHeight(style, 42, 114);
      const tallRows = buildVisualizer(style, 8, 114, tallHeight, station, playback, 'ruby');

      expect(compactHeight).toBe(12);
      expect(tallHeight).toBeGreaterThan(compactHeight);
      expect(tallHeight).toBeLessThanOrEqual(Math.floor(114 / 3));
      expect(tallRows.length).toBe(tallHeight);
    }
  });

  it('adds more mesh geometry instead of only spacing rows apart in tall panels', () => {
    const compactRows = frameText(buildVisualizer('mesh', 8, 114, visualizerHeight('mesh', 12, 114), station, playback, 'ruby'));
    const tallRows = frameText(buildVisualizer('mesh', 8, 114, visualizerHeight('mesh', 42, 114), station, playback, 'ruby'));

    expect(tallRows.split('\n').length).toBeGreaterThan(compactRows.split('\n').length);
    expect((tallRows.match(/[─╱╲]/g) ?? []).length).toBeGreaterThan((compactRows.match(/[─╱╲]/g) ?? []).length);
  });

  it('animates the ascii cube receiver style', () => {
    const firstFrame = buildVisualizer('cube', 1, 64, 12, station, playback, 'green')
      .map(row => row.text)
      .join('\n');
    const nextFrame = buildVisualizer('cube', 10, 64, 12, station, playback, 'green')
      .map(row => row.text)
      .join('\n');

    expect(firstFrame).toMatch(/[#@*+=;:%]/);
    expect(nextFrame).not.toBe(firstFrame);
  });

  it('keeps the ascii cube centered inside the receiver viewport', () => {
    for (const pulse of [1, 10, 22]) {
      const rows = buildVisualizer('cube', pulse, 120, 12, station, playback, 'ruby');
      const footprint = glyphFootprint(rows, cubeGlyph);

      expect(footprint.width).toBeGreaterThan(0);
      expect(footprint.width).toBeGreaterThanOrEqual(14);
      expect(footprint.width).toBeLessThanOrEqual(30);
      expect(footprint.height).toBeGreaterThanOrEqual(6);
      expect(footprint.minY).toBeGreaterThanOrEqual(0);
      expect(footprint.maxY).toBeLessThanOrEqual(rows.length - 1);
    }
  });

  it('keeps the ascii cube legible on wide receiver panels', () => {
    const rows = buildVisualizer('cube', 10, 152, 13, station, playback, 'ruby');
    const footprint = glyphFootprint(rows, cubeGlyph);
    const text = frameText(rows);

    expect(footprint.width).toBeGreaterThanOrEqual(14);
    expect(footprint.width).toBeLessThanOrEqual(30);
    expect(footprint.height).toBeGreaterThanOrEqual(8);
    expect(text).toMatch(/[\\/]/);
    expect(text).toMatch(/[=-]/);
    expect(text).not.toMatch(/[╱╲─│═║]/);
  });

  it('animates the added ASCII animation receiver styles', () => {
    for (const style of asciiAnimationStyles) {
      const height = visualizerHeight(style, 13);
      const firstFrame = frameText(buildVisualizer(style, 4, 80, height, station, playback, 'ruby'));
      const laterFrame = frameText(buildVisualizer(style, 16, 80, height, station, playback, 'ruby'));

      expect(firstFrame.trim()).not.toBe('');
      expect(laterFrame).not.toBe(firstFrame);
    }
  });

  it('renders fire as a compact turbulent hearth rather than an edge-to-edge sheet', () => {
    const rows = buildVisualizer('fire', 24, 100, 18, station, playback, 'ruby');
    const text = frameText(rows);
    const separatedFlameRuns = Math.max(
      ...rows.slice(2, -4).map(row => row.text.match(/[▄░▒▓█]+/g)?.length ?? 0)
    );

    expect(separatedFlameRuns).toBeGreaterThanOrEqual(3);
    expect(rows.at(-2)?.text).toMatch(/[▀█]/);
    expect(rows.at(-1)?.text).toContain('▄');
    expect(text.split('\n').some(row => row.startsWith('          ') && row.endsWith('          '))).toBe(true);
  });

  it('renders stormfront as open sky with heavy downward rain and no literal window', () => {
    const rows = buildVisualizer('stormfront', 24, 80, 16, station, playback, 'blue');
    const text = frameText(rows);
    const lowerThirdFill = rows.slice(-5).reduce((total, row) => total + row.text.replace(/\s/g, '').length, 0);

    expect(text).not.toMatch(/[┌┐└┘┬┴]/);
    expect(text).toMatch(/[█▓░]/);
    expect(text).not.toMatch(/[┃│╲]/);
    expect(lowerThirdFill).toBeLessThan(80 * 5 * 0.45);
    expect(rows.every(row => row.segments?.every(segment => segment.backgroundColor))).toBe(true);
  });

  it('tapers stormfront clouds through the middle instead of cutting them off at one row', () => {
    const rows = buildVisualizer('stormfront', 24, 80, 16, station, playback, 'blue');
    const middleCloudFill = rows.slice(7, 11).map(row => row.text.replace(/\s/g, '').length);

    expect(Math.min(...middleCloudFill)).toBeGreaterThan(80 * 0.45);
    expect(middleCloudFill[0]).toBeGreaterThan(middleCloudFill.at(-1) ?? 0);
  });

  it('renders alpine as a festive chalet exterior framed by snowy trees', () => {
    const rows = buildVisualizer('alpine', 24, 90, 14, station, playback, 'blue');
    const text = frameText(rows);
    const colors = new Set(rows.flatMap(row => row.segments ?? []).map(segment => segment.color));

    expect(text).toMatch(/▲/);
    expect(text).toMatch(/╋/);
    expect(text).toMatch(/●/);
    expect(colors).toContain('#ffd9a0');
    expect(colors).toContain('#e94747');
    expect(colors).toContain('#4f9a62');
  });

  it('renders constellation links with visible theme-tinted contrast', () => {
    const rows = buildVisualizer('constellation', 10, 80, 12, station, playback, 'ruby');
    const colors = new Set(rows.flatMap(row => row.segments ?? []).map(segment => segment.color));

    expect(frameText(rows)).toMatch(/·/);
    expect(colors).toContain('#ffacc1');
    expect(colors).not.toContain('#2c3340');
  });

  it('renders Manhattan with layered architecture and recognizable illuminated crowns', () => {
    const rows = buildVisualizer('manhattan', 24, 100, 14, station, playback, 'blue');
    const text = frameText(rows);

    expect(visibleCellCount(rows)).toBeGreaterThan(400);
    expect(text).toMatch(/◆/);
    expect(text).toMatch(/[█▄▀│]/);
    expect(text).toMatch(/─/);
  });

  it('renders sumi ocean as layered blue swells with compressed distant waves', () => {
    const rows = buildVisualizer('sumi-ocean', 24, 100, 18, station, playback, 'blue');
    const text = frameText(rows);

    expect(text).toMatch(/[─━]/);
    expect(rows.flatMap(row => row.segments ?? []).some(segment => segment.color === '#15567d')).toBe(true);
    expect(rows.slice(Math.floor(rows.length * 0.4)).every(row => row.text.length === 100)).toBe(true);
    expect(rows.slice(Math.floor(rows.length * 0.4)).every(row => row.segments?.every(segment => segment.backgroundColor))).toBe(true);
  });

  it('renders the audioMotion-inspired contour with segmented color data', () => {
    const rows = buildVisualizer('motion-contour', 8, 64, visualizerHeight('motion-contour', 12), station, playback, 'ruby');

    expect(rows.some(row => row.segments && row.segments.length > 1)).toBe(true);
  });

  it('renders the ultracode ripple with the supplied violet sequence', () => {
    const rows = buildVisualizer('ultracode', 8, 80, visualizerHeight('ultracode', 12), station, playback, 'violet');
    const text = frameText(rows);
    const segments = rows.flatMap(row => row.segments ?? []);
    const backgrounds = new Set(segments.map(segment => segment.backgroundColor).filter(Boolean));

    expect(rows).toHaveLength(12);
    expect(rows.every(row => row.text.length === 80)).toBe(true);
    expect(text.trim()).toBe('');
    expect(text).not.toMatch(/Effort|Faster|Smarter|low|medium|high|xhigh|ultracode|workflows|adjust|confirm|cancel|quit/);
    expect(backgrounds.has('#8c50f0')).toBe(true);
    expect(backgrounds.has('#3e1676')).toBe(true);
    expect(backgrounds.size).toBeGreaterThan(3);
  });

  it('starts the ultracode ripple at the receiver center and adapts to the display color', () => {
    const violetRows = buildVisualizer('ultracode', 0, 81, 9, station, playback, 'violet');
    const rubyRows = buildVisualizer('ultracode', 0, 81, 9, station, playback, 'ruby');
    const centerX = 40;
    const centerY = 4;

    expect(backgroundAt(violetRows, centerY, centerX)).toBe('#8c50f0');
    expect(backgroundAt(violetRows, centerY, centerX - 1)).toBeUndefined();
    expect(backgroundAt(violetRows, centerY - 1, centerX)).toBeUndefined();
    expect(backgroundAt(rubyRows, centerY, centerX)).toBe('#ff5f87');
  });

  it('holds every receiver style at a zero-signal frame when playback is inactive', () => {
    for (const style of receiverStyleNames) {
      const height = visualizerHeight(style, 12);
      for (const inactivePlayback of inactivePlaybacks) {
        const firstFrame = buildVisualizer(style, 1, 64, height, station, inactivePlayback, 'ruby');
        const laterFrame = buildVisualizer(style, 24, 64, height, station, inactivePlayback, 'ruby');

        expect(frameText(laterFrame)).toBe(frameText(firstFrame));
        expect(firstFrame.length).toBeGreaterThan(0);
        expect(firstFrame.length).toBeLessThanOrEqual(height);
        for (const row of firstFrame) {
          expect(row.text.length).toBeLessThanOrEqual(64);
        }
      }
    }
  });

  it('keeps every paused receiver on its current frame except Ultracode', () => {
    for (const style of receiverStyleNames) {
      const height = visualizerHeight(style, 12);
      const pausedFrame = buildVisualizer(style, 17, 64, height, station, pausedPlayback, 'ruby');

      if (style === 'ultracode') {
        expect(pausedFrame.at(-1)?.text).toBe('▁'.repeat(64));
      } else {
        const playingFrame = buildVisualizer(style, 17, 64, height, station, playback, 'ruby');
        expect(frameSignature(pausedFrame)).toBe(frameSignature(playingFrame));
      }
    }
  });

  it('renders inactive receiver visuals as a flat zero-level baseline', () => {
    const rows = buildVisualizer('ultracode', 8, 32, 6, station, inactivePlaybacks[0]!, 'ruby');

    expect(rows).toHaveLength(6);
    expect(rows.slice(0, -1).every(row => row.text.trim() === '')).toBe(true);
    expect(rows.at(-1)?.text).toBe('▁'.repeat(32));
    expect(frameText(rows)).not.toMatch(/[▃▅▆▇█]/);
  });

  it('scrolls the skyline right-to-left on a steady frame cadence', () => {
    const height = visualizerHeight('skyline', 14);
    const early = frameText(buildVisualizer('skyline', 2, 80, height, station, playback, 'ruby'));
    const adjacent = frameText(buildVisualizer('skyline', 3, 80, height, station, playback, 'ruby'));
    const next = frameText(buildVisualizer('skyline', 4, 80, height, station, playback, 'ruby'));
    const later = frameText(buildVisualizer('skyline', 30, 80, height, station, playback, 'ruby'));
    const firstStepChanges = [...early].filter((glyph, index) => glyph !== adjacent[index]).length;
    const secondStepChanges = [...adjacent].filter((glyph, index) => glyph !== next[index]).length;

    expect(early).toMatch(/[█▓▀]/);
    expect(later).not.toBe(early);
    expect(firstStepChanges).toBeGreaterThan(200);
    expect(secondStepChanges).toBeGreaterThan(200);
    expect(Math.abs(firstStepChanges - secondStepChanges)).toBeLessThan(80);
    expect(receiverStyleNames).toContain('planetarium');
    expect(receiverStyleNames).not.toContain('motion-blob');
    expect(receiverStyleNames).not.toContain('honeycomb');
    expect(receiverStyleNames).not.toContain('magma');
    expect(receiverStyleNames).not.toContain('oil-slick');
    expect(receiverStyleNames).not.toContain('warp-streak');
    expect(receiverStyleNames).not.toContain('running-horse');
    expect(receiverStyleNames).not.toContain('starlink');
    expect(receiverStyleNames).not.toContain('bloom-bars');
    expect(receiverStyleNames).not.toContain('stained-glass');
    expect(receiverStyleNames).not.toContain('barcode');
    expect(receiverStyleNames).not.toContain('inkblot');
    expect(receiverStyleNames).not.toContain('wave-stack');
    expect(receiverStyleNames).not.toContain('glitch-blocks');
    expect(receiverStyleNames).not.toContain('motion-area');
    expect(receiverStyleNames).not.toContain('circuit-pulse');
    expect(receiverStyleNames).not.toContain('shard-field');
  });

  it('fills dense new styles so the panel is not mostly empty', () => {
    for (const style of [
      'pixel-crush',
      'cascade',
      'phosphene',
      'fire',
      'aurora'
    ] as const) {
      const rows = buildVisualizer(style, 12, 64, visualizerHeight(style, 12), station, playback, 'violet');
      const text = frameText(rows);
      const filled = text.replace(/\s/g, '').length;
      const total = text.replace(/\n/g, '').length;
      expect(filled / Math.max(1, total)).toBeGreaterThan(0.25);
    }
  });

  it('moves fireworks burst origins across generations', () => {
    const height = visualizerHeight('fireworks', 14);
    const frames = [0, 40, 80, 120].map(p =>
      frameText(buildVisualizer('fireworks', p, 80, height, station, playback, 'ruby'))
    );
    // Not all frames should be identical — bursts re-roll positions
    const unique = new Set(frames);
    expect(unique.size).toBeGreaterThan(1);
    expect(frames.some(f => /[*✦★+]/.test(f))).toBe(true);
  });

  it('keeps the liftoff rocket in frame while the world scrolls past', () => {
    const height = visualizerHeight('liftoff', 14);
    const early = frameText(buildVisualizer('liftoff', 2, 80, height, station, playback, 'ruby'));
    const mid = frameText(buildVisualizer('liftoff', 40, 80, height, station, playback, 'ruby'));
    const late = frameText(buildVisualizer('liftoff', 200, 80, height, station, playback, 'ruby'));

    // Rocket body glyphs present at every stage (camera follows)
    expect(early).toMatch(/[█▓▲]/);
    expect(mid).toMatch(/[█▓▲]/);
    expect(late).toMatch(/[█▓▲]/);
    // Early still shows pad; late has left the ground behind
    expect(early).toMatch(/[▀▁]/);
    expect(late).not.toMatch(/[▀▁]/);
    expect(mid).not.toBe(early);
    expect(late).not.toBe(mid);
  });
});
