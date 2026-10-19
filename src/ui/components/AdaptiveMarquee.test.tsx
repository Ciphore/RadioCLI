import {act, type ComponentProps} from 'react';
import stringWidth from 'string-width';
import {cleanup, render} from 'ink-testing-library';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {DisplayContext, resolveDisplayMode} from '../display-context.js';
import {displayWidth} from '../format.js';
import {AdaptiveMarquee} from './AdaptiveMarquee.js';

describe('AdaptiveMarquee', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubEnv('INK_SCREEN_READER', 'false');
  });
  afterEach(() => {
    act(() => cleanup());
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('waits before moving the selected text and loops without growing its width', async () => {
    const view = renderMarquee({text: 'ABCDEFGHIJ'});

    expect(view.lastFrame()).toBe('ABCDE');
    await act(async () => vi.advanceTimersByTimeAsync(999));
    expect(view.lastFrame()).toBe('ABCDE');
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(view.lastFrame()).toBe('BCDEF');
    await act(async () => vi.advanceTimersByTimeAsync(180));
    expect(view.lastFrame()).toBe('CDEFG');
    await steps(3);
    expect(view.lastFrame()).toBe('FGHIJ');
    await advance(999);
    expect(view.lastFrame()).toBe('FGHIJ');
    await advance(1);
    expect(view.lastFrame()).toBe('ABCDE');
  });

  it.each([
    {text: 'אבגדהוזחטי', first: 'וזחטי', next: 'הוזחט', last: 'אבגדה'},
    {text: 'ابتثجحخدذر', first: 'حخدذر', next: 'جحخدذ', last: 'ابتثج'},
    {text: 'אABCDEFGHI', first: 'EFGHI', next: 'DEFGH', last: 'אABCD'}
  ])('scrolls RTL text toward the beginning, pauses and loops: $text', async ({text, first, next, last}) => {
    const view = renderMarquee({text});
    expect(view.lastFrame()).toBe(first);
    await advance(999);
    expect(view.lastFrame()).toBe(first);
    await advance(1);
    expect(view.lastFrame()).toBe(next);
    await steps(4);
    expect(view.lastFrame()).toBe(last);
    await advance(999);
    expect(view.lastFrame()).toBe(last);
    await advance(1);
    expect(view.lastFrame()).toBe(first);
  });

  it('retains LTR scrolling when the name starts with Latin before RTL text', async () => {
    const view = renderMarquee({text: 'FM אבגדהוזחטי'});
    expect(view.lastFrame()).toBe('FM אב');
    await advance(1000);
    expect(view.lastFrame()).toBe('M אבג');
  });

  it('preserves RTL combining marks and original character order in every frame', async () => {
    const text = 'אָבּגּדּהָוֹ';
    const view = renderMarquee({text, width: 3});
    expect(view.lastFrame()).toBe('דּהָוֹ');
    await advance(1000);
    expect(view.lastFrame()).toBe('גּדּהָ');
    await advance(180);
    expect(view.lastFrame()).toBe('בּגּדּ');
    await advance(180);
    expect(view.lastFrame()).toBe('אָבּגּ');
    for (const frame of view.frames) {
      expect(displayWidth(frame)).toBeLessThanOrEqual(3);
      expect(text).toContain(frame);
      expect(frame).not.toMatch(/^\p{Mark}/u);
    }
  });

  it('keeps joined emoji and wide characters intact in RTL windows', async () => {
    const text = 'אבג👩‍👩‍👧‍👦東京דה';
    const view = renderMarquee({text, width: 4});
    await advance(1000);
    await steps(6);
    for (const frame of view.frames) {
      expect(displayWidth(frame)).toBeLessThanOrEqual(4);
      expect(text).toContain(frame);
      expect(frame.replaceAll('👩‍👩‍👧‍👦', '')).not.toMatch(/[👩👧👦\u200d]/u);
    }
  });

  it.each(['🇯🇵1️⃣ Radio', 'אב🇯🇵1️⃣גד'])('keeps flag and keycap clusters within every marquee frame: %s', async text => {
    const view = renderMarquee({text, width: 4});
    await advance(1000);
    await steps(12);
    for (const frame of view.frames) {
      expect(stringWidth(frame)).toBeLessThanOrEqual(4);
      expect(text).toContain(frame);
      expect(frame.replaceAll('🇯🇵', '').replaceAll('1️⃣', '')).not.toMatch(/[🇯🇵\ufe0f\u20e3]/u);
    }
  });

  it('restarts the edge pause even when an equally long name changes at offset zero', async () => {
    const view = renderMarquee({text: 'ABCDEFGHIJ'});
    await advance(999);
    act(() => view.rerender(<AdaptiveMarquee text="אבגדהוזחטי" width={5} active reduceMotion={false} />));
    await advance(999);
    expect(view.lastFrame()).toBe('וזחטי');
    await advance(1);
    expect(view.lastFrame()).toBe('הוזחט');
  });

  it('resets progress after text, width and selection changes', async () => {
    const view = renderMarquee({text: 'אבגדהוזחטי'});
    await advance(1180);
    act(() => view.rerender(<AdaptiveMarquee text="אבגדהוזחטי" width={3} active reduceMotion={false} />));
    expect(view.lastFrame()).toBe('חטי');
    await advance(1000);
    expect(view.lastFrame()).toBe('זחט');
    act(() => view.rerender(<AdaptiveMarquee text="אבגדהוזחטי" width={3} active={false} reduceMotion={false} />));
    expect(view.lastFrame()).toBe('אב…');
    act(() => view.rerender(<AdaptiveMarquee text="ABCDEFGHIJ" width={3} active reduceMotion={false} />));
    expect(view.lastFrame()).toBe('ABC');
    await advance(999);
    expect(view.lastFrame()).toBe('ABC');
    await advance(1);
    expect(view.lastFrame()).toBe('BCD');
  });

  it('never emits a frame with stale progress when changing direction', async () => {
    const view = renderMarquee({text: 'ABCDEFGHIJ'});
    await advance(1000);
    await steps(2);
    const frames = view.frames.length;
    act(() => view.rerender(<AdaptiveMarquee text="אבגדהוזחטי" width={5} active reduceMotion={false} />));
    expect(view.frames.slice(frames)).toEqual(['וזחטי']);
  });

  it.each([0, -1, 20])('does not schedule animation for empty or fitting widths: %s', async width => {
    const view = renderMarquee({text: 'אבגדהוזחטי', width});
    const frames = view.frames.length;
    await advance(5000);
    expect(view.frames).toHaveLength(frames);
    expect(vi.getTimerCount()).toBe(0);
    expect(view.lastFrame()).toBe(width <= 0 ? '' : 'אבגדהוזחטי');
  });

  it.each([{TERM: 'dumb'}, {RADIOCLI_SCREEN_READER: '1'}, {RADIOCLI_DISABLE_ANIMATION: '1'}])('keeps RTL output static with %j', async env => {
    const display = resolveDisplayMode({}, env);
    let view!: ReturnType<typeof render>;
    act(() => { view = render(
      <DisplayContext.Provider value={display}>
        <AdaptiveMarquee text="אבגדהוזחטי" width={5} active reduceMotion={false} />
      </DisplayContext.Provider>
    ); });
    const frames = view.frames.length;
    await advance(5000);
    expect(view.frames).toHaveLength(frames);
  });

  it('preserves international names and direction in ASCII and no-color modes', async () => {
    const display = resolveDisplayMode({asciiMode: true}, {NO_COLOR: '1', LC_ALL: 'C'});
    let view!: ReturnType<typeof render>;
    act(() => { view = render(
      <DisplayContext.Provider value={display}>
        <AdaptiveMarquee text="אבגדהוזחטי" width={5} active reduceMotion={false} />
      </DisplayContext.Provider>
    ); });
    expect(view.lastFrame()).toBe('וזחטי');
    await advance(1000);
    expect(view.lastFrame()).toBe('הוזחט');
  });

  it('exposes the complete RTL name to screen readers without animation', async () => {
    vi.stubEnv('INK_SCREEN_READER', 'true');
    const display = resolveDisplayMode({}, {INK_SCREEN_READER: 'true'});
    const text = 'راديو العربية International';
    let view!: ReturnType<typeof render>;
    act(() => { view = render(
      <DisplayContext.Provider value={display}>
        <AdaptiveMarquee text={text} width={5} active reduceMotion={false} />
      </DisplayContext.Provider>
    ); });
    expect(view.lastFrame()).toBe(text);
    const frames = view.frames.length;
    await advance(5000);
    expect(view.frames).toHaveLength(frames);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels the timer when unmounted', async () => {
    const view = renderMarquee({text: 'אבגדהוזחטי'});
    act(() => view.unmount());
    await advance(5000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses ordinary truncation when inactive or Reduce Motion is enabled', () => {
    expect(renderMarquee({text: 'ABCDEFGHIJ', active: false}).lastFrame()).toBe('ABCD…');
    expect(renderMarquee({text: 'ABCDEFGHIJ', reduceMotion: true}).lastFrame()).toBe('ABCD…');
    expect(renderMarquee({text: 'אבגדהוזחטי', active: false}).lastFrame()).toBe('אבגד…');
    expect(renderMarquee({text: 'אבגדהוזחטי', reduceMotion: true}).lastFrame()).toBe('אבגד…');
  });
});

function renderMarquee(props: Partial<ComponentProps<typeof AdaptiveMarquee>> & {text: string}): ReturnType<typeof render> {
  let view!: ReturnType<typeof render>;
  act(() => { view = render(<AdaptiveMarquee width={5} active reduceMotion={false} {...props} />); });
  return view;
}

async function advance(ms: number): Promise<void> {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
}

async function steps(count: number): Promise<void> {
  for (let index = 0; index < count; index++) await advance(180);
}
