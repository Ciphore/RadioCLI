'use client';

import {useEffect, useMemo, useRef, useState} from 'react';
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
const reviewStorageKey = 'radiocli.receiver-review.v1';
const reviewFilters = [
  {id: 'all', label: 'All'},
  {id: 'unmarked', label: 'Unmarked'},
  {id: 'marked', label: 'Marked'},
] as const;
type ReviewFilter = (typeof reviewFilters)[number]['id'];
type Review = {theme: ThemeName; marked: ReadonlySet<ReceiverStyle>};
const defaultReview: Review = {theme: 'violet', marked: new Set()};

function loadReview(): Review {
  try {
    const stored = JSON.parse(localStorage.getItem(reviewStorageKey) ?? 'null') as
      {theme?: unknown; marked?: unknown} | null;
    const marked = new Set(Array.isArray(stored?.marked) ? stored.marked : []);
    return {
      theme: themeNames.find(theme => theme === stored?.theme) ?? defaultReview.theme,
      marked: new Set(receiverStyleNames.filter(style => marked.has(style))),
    };
  } catch {
    return defaultReview;
  }
}

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
  const [review, setReview] = useState<Review | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [copyResult, setCopyResult] = useState<'copied' | 'manual' | null>(null);
  const {theme, marked} = review ?? defaultReview;
  const playing = motion ?? !reducedMotion;
  const search = query.trim().toLowerCase();
  const matches = useMemo(() => search
    ? receiverStyleNames.filter(id => id.includes(search) || receiverName(id).toLowerCase().includes(search))
    : receiverStyleNames, [search]);
  const displayedStyles = useMemo(() => {
    if (preview) return previewStyles;
    if (filter === 'all') return matches;
    return matches.filter(id => marked.has(id) === (filter === 'marked'));
  }, [preview, filter, matches, marked]);

  useEffect(() => {
    if (!preview) setReview(loadReview());
  }, [preview]);

  useEffect(() => {
    if (preview || !review) return;
    try {
      localStorage.setItem(reviewStorageKey, JSON.stringify({theme: review.theme, marked: [...review.marked]}));
    } catch { /* Review controls remain available with storage disabled. */ }
  }, [preview, review]);

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
      // Ultra Code keeps its preview cycle. Other receivers keep advancing on their own clocks.
      const elapsed = item.style === 'ultracode' ? item.elapsed % 10_000 : item.elapsed;
      const pulse = Math.floor(elapsed / (item.style === 'skyline' ? 120 : 80));
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
    for (const {button} of previews) observer.observe(button);
    // Only the home-page teaser isolates a hovered preview. The full
    // gallery keeps every visible receiver moving while cards are marked.
    const cleanups = (preview ? previews : []).map(({button}) => {
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
    hovered = preview && window.matchMedia('(hover: hover)').matches
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
  }, [displayedStyles, playing, theme, preview]);

  const toggleMark = (id: ReceiverStyle, button: HTMLButtonElement) => {
    if (filter !== 'all' && document.activeElement === button) {
      const adjacent = button.nextElementSibling ?? button.previousElementSibling;
      const target = adjacent instanceof HTMLButtonElement ? adjacent
        : button.closest('section')?.querySelector<HTMLButtonElement>('.rc-review-filters [aria-pressed="true"]');
      target?.focus({preventScroll: true});
    }
    setCopyResult(null);
    setReview(current => {
      const previous = current ?? defaultReview;
      const next = new Set(previous.marked);
      if (!next.delete(id)) next.add(id);
      return {...previous, marked: next};
    });
  };

  const markedIds = receiverStyleNames.filter(id => marked.has(id)).join('\n');
  const copyMarked = async () => {
    try {
      await navigator.clipboard.writeText(markedIds);
      setCopyResult('copied');
    } catch {
      setCopyResult('manual');
    }
  };
  const counts = {all: receiverStyleNames.length, unmarked: receiverStyleNames.length - marked.size, marked: marked.size};

  return (
    <section id="receivers" className="rc-section rc-receivers" aria-labelledby="receiver-heading">
      <div className="rc-receiver-heading">
        <div className="rc-heading">
          <h2 id="receiver-heading">{preview ? `${counts.all} animated receiver styles` : 'Receiver styles'}</h2>
          <p>{preview ? 'Choose from ASCII patterns, waves, cityscapes, and more.' : `Review ${counts.all} animated styles. Click a receiver to mark it for removal.`}</p>
        </div>
      </div>
      {!preview && <div className="rc-review-toolbar">
        <div className="rc-review-controls">
          <input className="rc-review-search" type="search" aria-label="Search receivers" placeholder="Search"
            value={query} onChange={event => setQuery(event.currentTarget.value)} />
          <label className="rc-review-color">
            <span className="rc-review-swatch" style={{backgroundColor: themeAccent(theme)}} aria-hidden="true" />
            <select aria-label="Receiver color" value={theme} onChange={event => {
              const theme = event.currentTarget.value as ThemeName;
              setReview(current => ({...(current ?? defaultReview), theme}));
            }}>
              {themeNames.map(name => <option key={name} value={name}>{receiverName(name)}</option>)}
            </select>
          </label>
          <button className="rc-review-motion" type="button" onClick={() => setMotion(!playing)}
            aria-label={playing ? 'Pause motion' : 'Play motion'} title={playing ? 'Pause motion' : 'Play motion'}>
            <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">{playing
              ? <path d="M3 2h4v12H3zm6 0h4v12H9z" />
              : <path d="m4 2 10 6-10 6z" />}</svg>
          </button>
        </div>
        <div className="rc-review-actions">
          <div className="rc-review-filters" role="group" aria-label="Filter by review status">
            {reviewFilters.map(({id, label}) => <button key={id} type="button" aria-pressed={filter === id}
              onClick={() => setFilter(id)}>{label} <span>{counts[id]}</span></button>)}
          </div>
          <button className="rc-review-copy" type="button" disabled={!marked.size} onClick={() => void copyMarked()}>
            {copyResult === 'copied' ? 'Copied IDs' : 'Copy marked IDs'}
          </button>
          <span className="sr-only" role="status">
            {copyResult === 'copied' ? 'Marked receiver IDs copied.' : `${displayedStyles.length} receivers shown. ${marked.size} marked for removal.`}
          </span>
        </div>
        {copyResult === 'manual' && <label className="rc-review-export">
          Marked receiver IDs
          <textarea readOnly rows={3} value={markedIds} onFocus={event => event.currentTarget.select()} />
        </label>}
      </div>}
      {!displayedStyles.length && <p className="rc-review-empty">
        {search ? 'No receivers match this search and filter.' : filter === 'marked' ? 'No receivers marked for removal.' : 'Every receiver is marked for removal.'}
      </p>}
      <div className={`rc-receiver-grid${preview ? ' rc-receiver-teaser' : ''}`} ref={gridRef} data-theme={theme}>
        {displayedStyles.map(id => {
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
                onClick={event => toggleMark(id, event.currentTarget)} aria-pressed={marked.has(id)}
                aria-label={`Mark ${receiverName(id)} for removal`} title={paletteLabel(id)}>
                {content}
                <span className="rc-review-mark" aria-hidden="true">{marked.has(id) ? '✓' : ''}</span>
              </button>;
        })}
      </div>
    </section>
  );
}
