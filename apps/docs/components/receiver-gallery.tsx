'use client';

import {useEffect, useRef, useState} from 'react';
import {receiverStyleNames, receiverColorBehavior, themeNames, themeAccent, type ReceiverStyle, type ThemeName} from '@/lib/receiver-engine';

const names: Record<string, string> = {ultracode: 'Ultra Code', 'gallop-fine': 'Gallop', leds: 'LEDs', 'radial-eq': 'Radial EQ', 'xor-texture': 'XOR Texture'};
function paletteLabel(id: ReceiverStyle) {
  const behavior = receiverColorBehavior[id];
  if (behavior === 'original') return 'Fixed palette — receiver colors do not change this visual';
  if (behavior === 'themed') return 'Adaptive colors — follows the selected receiver color';
  if (id === 'planetarium') return 'Fixed palette with adaptive star accents — planets keep their original colors';
  if (id === 'liftoff') return 'Fixed palette with adaptive accents — rocket and flame keep their original colors';
  return 'Fixed palette with adaptive accents — only parts of this visual follow the selected receiver color';
}
function receiverName(id: string) {
  return names[id] ?? id.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ');
}

const previewStyles = ['stormfront', 'flyover', 'fire'] satisfies ReceiverStyle[];

type Preview = {
  button: HTMLElement;
  canvas: HTMLCanvasElement;
  style: ReceiverStyle;
  elapsed: number;
  updated: number;
};

export function ReceiverGallery({ preview = false }: { preview?: boolean }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const elapsedRef = useRef(new Map<string, number>());
  const [motion, setMotion] = useState<boolean | null>(null);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [theme, setTheme] = useState<ThemeName>('violet');
  const playing = motion ?? !reducedMotion;

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const previews: Preview[] = Array.from(grid.querySelectorAll<HTMLElement>('.rc-receiver')).map(button => ({
      button, canvas: button.querySelector('canvas')!, style: button.dataset.style as ReceiverStyle,
      elapsed: elapsedRef.current.get(button.dataset.style!) ?? 1_600, updated: performance.now(),
    }));
    const visible = new Set<Element>();
    let hovered: HTMLElement | null = null;
    let focused = previews.find(preview => preview.button === document.activeElement)?.button ?? null;
    let interaction: 'hover' | 'focus' = 'focus';
    let active: Preview[] = [];
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let draw: typeof import('@/lib/receiver-canvas').drawReceiver | undefined;
    let loading = false;

    const paint = (item: Preview) => {
      const pulse = Math.floor((item.elapsed % 10_000) / (item.style === 'skyline' ? 120 : 80));
      let color = theme;
      if (preview && item.style === 'flyover') color = 'violet';
      draw?.(item.canvas, item.style, pulse, color);
    };
    const tick = () => {
      const now = performance.now();
      for (const preview of active) {
        preview.elapsed += now - preview.updated;
        preview.updated = now;
        paint(preview);
      }
      timer = active.length ? setTimeout(tick, Math.max(1, 80 - (performance.now() - now))) : undefined;
    };
    const sync = () => {
      clearTimeout(timer);
      const now = performance.now();
      for (const preview of active) preview.elapsed += now - preview.updated;
      const candidates = interaction === 'hover' ? [hovered, focused] : [focused, hovered];
      const selected = candidates.find(button => button && visible.has(button));
      active = [];
      for (const preview of previews) {
        const inView = visible.has(preview.button);
        const animate = Boolean(draw && playing && !document.hidden && inView && (!selected || selected === preview.button));
        preview.canvas.dataset.playing = String(animate);
        if (draw && inView && preview.canvas.dataset.selection !== theme) { paint(preview); preview.canvas.dataset.selection = theme; }
        if (animate) { preview.updated = now; active.push(preview); }
      }
      if (active.length) timer = setTimeout(tick, 80);
      if (visible.size && !draw && !loading) {
        loading = true;
        void import('@/lib/receiver-canvas').then(module => {
          if (disposed) return;
          draw = module.drawReceiver;
          sync();
        });
      }
    };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.35) visible.add(entry.target);
        else visible.delete(entry.target);
      }
      sync();
    }, {threshold: [0, 0.35]});
    const cleanups = previews.map(({button}) => {
      observer.observe(button);
      const enter = (event: PointerEvent) => {
        if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
        hovered = button; interaction = 'hover'; sync();
      };
      const leave = () => { hovered = null; sync(); };
      const focus = () => { focused = button; interaction = 'focus'; sync(); };
      const blur = () => { focused = null; sync(); };
      button.addEventListener('pointerenter', enter);
      button.addEventListener('pointerleave', leave);
      button.addEventListener('focus', focus);
      button.addEventListener('blur', blur);
      return () => {
        button.removeEventListener('pointerenter', enter);
        button.removeEventListener('pointerleave', leave);
        button.removeEventListener('focus', focus);
        button.removeEventListener('blur', blur);
      };
    });
    hovered = window.matchMedia('(hover: hover)').matches
      ? previews.find(preview => preview.button.matches(':hover'))?.button ?? null : null;
    document.addEventListener('visibilitychange', sync);
    return () => {
      disposed = true;
      clearTimeout(timer);
      const now = performance.now();
      for (const preview of active) preview.elapsed += now - preview.updated;
      for (const preview of previews) elapsedRef.current.set(preview.style, preview.elapsed);
      observer.disconnect();
      document.removeEventListener('visibilitychange', sync);
      cleanups.forEach(cleanup => cleanup());
    };
  }, [playing, theme, preview]);

  const cycleTheme = () => {
    setTheme(current => themeNames[(themeNames.indexOf(current) + 1) % themeNames.length]);
  };

  return (
    <section id="receivers" className="rc-section rc-receivers" aria-labelledby="receiver-heading">
      <div className="rc-receiver-heading">
        <div className="rc-heading">
          <h2 id="receiver-heading">{preview ? '64 animated receiver styles' : 'Receiver styles'}</h2>
          <p>{preview ? 'Choose from ASCII patterns, waves, cityscapes, and more.' : '64 animated playback visuals, from flowing patterns to cityscapes and landscapes.'}</p>
        </div>
        {!preview && <div className="rc-receiver-controls">
          <button className="rc-color-toggle" type="button" onClick={cycleTheme} aria-label={`Receiver color: ${theme}. Next color`}>
            <span className="rc-color-dot" style={{backgroundColor: themeAccent(theme)}} aria-hidden="true" />
          </button>
          <button className="rc-motion-toggle" type="button" onClick={() => setMotion(!playing)}
            aria-label={playing ? 'Pause motion' : 'Play motion'} title={playing ? 'Pause motion' : 'Play motion'}>
            <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">{playing
              ? <path d="M3 2h4v12H3zm6 0h4v12H9z" />
              : <path d="m4 2 10 6-10 6z" />}</svg>
          </button>
        </div>}
      </div>
      <div className={`rc-receiver-grid${preview ? ' rc-receiver-teaser' : ''}`} ref={gridRef} data-theme={theme}>
        {(preview ? previewStyles : receiverStyleNames).map(id => {
          const content = <>
            <canvas className="rc-receiver-visual" width={1200} height={600} aria-hidden="true" />
            <span className="rc-receiver-caption"><span className="rc-receiver-name">{receiverName(id)}</span>
              {!preview && <svg className="rc-receiver-palette" viewBox="0 0 16 16" role="img"
                aria-label={paletteLabel(id)}>
                <title>{paletteLabel(id)}</title>
                {receiverColorBehavior[id] === 'original'
                  ? <><path d="M8 1.5a6.5 6.5 0 1 0 0 13h1a1.5 1.5 0 0 0 1-2.6c-.6-.6-.2-1.6.6-1.6h1.2A2.7 2.7 0 0 0 14.5 8 6.5 6.5 0 0 0 8 1.5Z" fill="none" stroke="currentColor" /><circle cx="4.5" cy="7" r="1" fill="currentColor" /><circle cx="7.5" cy="4.5" r="1" fill="currentColor" /><circle cx="11" cy="6" r="1" fill="currentColor" /></>
                  : receiverColorBehavior[id] === 'themed'
                    ? <><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" /><circle cx="8" cy="8" r="3" fill="currentColor" /></>
                    : <><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" /><path d="M8 2a6 6 0 0 1 0 12Z" fill="currentColor" /></>}
              </svg>}
            </span>
          </>;
          return preview
            ? <figure className="rc-receiver" key={id} data-style={id} aria-label={receiverName(id)}>{content}</figure>
            : <button className="rc-receiver" type="button" key={id} data-style={id}
                onClick={cycleTheme} title={paletteLabel(id)} aria-label={`${receiverName(id)}. ${paletteLabel(id)}. Change gallery color`}>{content}</button>;
        })}
      </div>
    </section>
  );
}
