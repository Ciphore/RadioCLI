/** Canonical receiver-style metadata used by rendering, sizing, UI cycling, and migration. */
export const receiverStyleRegistry = [
  {id: 'ultracode', maxRows: 14, minRows: 7, resetPulse: true},
  {id: 'pulse-grid', maxRows: 12, minRows: 7},
  {id: 'hex-pulse', maxRows: 12, minRows: 7},
  {id: 'moire', maxRows: 14, minRows: 7},
  {id: 'galaxy', maxRows: 14, minRows: 7},
  {id: 'cyclone', maxRows: 14, minRows: 7},
  {id: 'nebula', maxRows: 14, minRows: 7},
  {id: 'lava-lamp', maxRows: 14, minRows: 7},
  {id: 'motion-contour', maxRows: 14, minRows: 8},
  {id: 'ribbon', maxRows: 12, minRows: 7},
  {id: 'braille-wave', maxRows: 12, minRows: 7},
  {id: 'silk', maxRows: 14, minRows: 7},
  {id: 'lissajous', maxRows: 14, minRows: 7},
  {id: 'harmonograph', maxRows: 14, minRows: 7},
  {id: 'spirograph', maxRows: 14, minRows: 7},
  {id: 'goniometer', maxRows: 14, minRows: 7},
  {id: 'radial-eq', maxRows: 14, minRows: 7},
  {id: 'spectrogram', maxRows: 12, minRows: 7},
  {id: 'caustics', maxRows: 14, minRows: 7},
  {id: 'ripple-tank', maxRows: 14, minRows: 7},
  {id: 'leds', maxRows: 10, minRows: 7},
  {id: 'matrix', maxRows: 14, minRows: 7},
  {id: 'cascade', maxRows: 14, minRows: 7},
  {id: 'ordered-dither', maxRows: 14, minRows: 7},
  {id: 'xor-texture', maxRows: 14, minRows: 7},
  {id: 'pixel-crush', maxRows: 14, minRows: 7},
  {id: 'copper-bars', maxRows: 14, minRows: 7},
  {id: 'rotozoomer', maxRows: 14, minRows: 7},
  {id: 'mesh', maxRows: 14, minRows: 7},
  {id: 'hologram', maxRows: 12, minRows: 7},
  {id: 'mirror', maxRows: 12, minRows: 7},
  {id: 'tunnel', maxRows: 14, minRows: 7},
  {id: 'kaleidoscope', maxRows: 14, minRows: 7},
  {id: 'phosphene', maxRows: 14, minRows: 7},
  {id: 'phyllotaxis', maxRows: 14, minRows: 7},
  {id: 'chladni', maxRows: 14, minRows: 7},
  {id: 'newton', maxRows: 14, minRows: 7},
  {id: 'cube', maxRows: 14, minRows: 8},
  {id: 'spinning-donut', maxRows: 14, minRows: 8},
  {id: 'tesseract', maxRows: 14, minRows: 7},
  {id: 'torus-knot', maxRows: 14, minRows: 7},
  {id: 'twister', maxRows: 14, minRows: 7},
  {id: 'lorenz', maxRows: 14, minRows: 7},
  {id: 'fern', maxRows: 14, minRows: 7},
  {id: 'fractal-tree', maxRows: 14, minRows: 7},
  {id: 'julia', maxRows: 14, minRows: 7},
  {id: 'neural-net', maxRows: 14, minRows: 7},
  {id: 'constellation', maxRows: 12, minRows: 7},
  {id: 'starfield', maxRows: 14, minRows: 7},
  {id: 'fireworks', maxRows: 14, minRows: 7},
  {id: 'fire', maxRows: 14, minRows: 7},
  {id: 'aurora', maxRows: 14, minRows: 7},
  {id: 'stormfront', maxRows: 14, minRows: 7},
  {id: 'planetarium', maxRows: 14, minRows: 7},
  {id: 'sumi-ocean', maxRows: 14, minRows: 7},
  {id: 'liftoff', maxRows: 14, minRows: 8, resetPulse: true},
  {id: 'flyover', maxRows: 14, minRows: 7},
  {id: 'skyline', maxRows: 14, minRows: 7},
  {id: 'golden-gate', maxRows: 14, minRows: 7},
  {id: 'manhattan', maxRows: 14, minRows: 7},
  {id: 'alpine', maxRows: 14, minRows: 7}
] as const;

export type ReceiverStyleId = (typeof receiverStyleRegistry)[number]['id'];

export const receiverStyleNames = receiverStyleRegistry.map(style => style.id) as readonly ReceiverStyleId[];
export const defaultReceiverStyle = 'ultracode' as const satisfies ReceiverStyleId;
export const receiverStyleMetadata = Object.fromEntries(
  receiverStyleRegistry.map(style => [style.id, style])
) as Readonly<Record<ReceiverStyleId, (typeof receiverStyleRegistry)[number]>>;

const retiredReceiverStyleNames = [
  'scope', 'spectrum', 'oscilloscope', 'sdr', 'signal', 'retro', 'neon', 'waterfall',
  'cassette', 'casette', 'stars', 'radio-waves', 'raindrops', 'vinyl', 'soundwave',
  'spectrum-3d', 'tuning-dial', 'rf-constellation', 'rf-constelation', 'sphere', 'mobius',
  's-meter', 'jellyfish', 'prism', 'motion-bars', 'motion-dots', 'motion-braid', 'radar',
  'dual-ripple', 'perspective-floor', 'bloom-bars', 'coral', 'bokeh', 'vector-balls',
  'smoke', 'running-horse', 'tesla-arcs', 'isometric', 'clockwork', 'starlink',
  'stained-glass', 'barcode', 'inkblot', 'wave-stack', 'glitch-blocks', 'motion-area',
  'circuit-pulse', 'shard-field', 'honeycomb', 'magma', 'oil-slick', 'warp-streak',
  'blocks', 'vu-meters', 'dejong', 'truchet', 'termflix-fire', 'termflix-matrix',
  'termflix-plasma', 'termflix-starfield', 'termflix-waterfall', 'termflix-radar', 'wave',
  'life', 'particles', 'pendulum', 'rain', 'fountain', 'flow', 'spiral', 'ocean',
  'lightning', 'ripple', 'snow', 'garden', 'fireflies', 'dna', 'pulse', 'boids', 'lava',
  'sandstorm', 'petals', 'campfire', 'eclipse', 'blackhole', 'rainforest', 'crystallize',
  'hackerman', 'visualizer', 'cells', 'atom', 'automata', 'globe', 'dragon', 'sierpinski',
  'sierpinksi', 'mandelbrot', 'maze', 'nbody', 'langton', 'sort', 'tetris', 'snake',
  'invaders', 'pong', 'flappy-bird', 'reaction-diffusion', 'voronoi', 'orbits',
  'chromatic', 'ferro-crown', 'nautilus', 'vortex-street', 'kinetic-mobile',
  'harmonic-harp', 'neon-transit', 'lantern-drift', 'murmuration', 'koi-shoal',
  'calligraphy', 'aperture-bloom', 'kintsugi', 'sonic-loom', 'river-delta',
  'peacock-plume', 'eclipse-corona', 'cloud-chamber', 'origami-tide', 'tv-static',
  'sunspot', 'plasma', 'metaballs', 'moonlit-tide', 'motion-blob', 'clifford', 'paris',
  'kyoto', 'sahara'
] as const;

const retiredReceiverStyles = new Set<string>(retiredReceiverStyleNames);

export function migrateReceiverStyle(value: unknown): unknown {
  if (value === 'equalizer') {
    return 'ultracode';
  }

  if (value === 'sumi-mountains' || value === 'moonlit-tide') {
    return 'sumi-ocean';
  }

  return typeof value === 'string' && retiredReceiverStyles.has(value) ? defaultReceiverStyle : value;
}
