import React, {useEffect, useMemo, useState} from 'react';
import {Text} from 'ink';
import {displayWidth, sliceDisplay, sliceDisplayFromEnd, truncate} from '../format.js';
import {useDisplay} from '../display-context.js';
import {toAsciiSafe} from '../ascii.js';
import {textDirection} from '../text-direction.js';

type AdaptiveMarqueeProps = {
  text: string;
  width: number;
  active: boolean;
  reduceMotion: boolean;
};

const edgePauseMs = 1000;
const stepMs = 180;

export function AdaptiveMarquee({text, width, active, reduceMotion}: AdaptiveMarqueeProps): React.ReactElement {
  const {ascii, reduceMotion: terminalReduceMotion} = useDisplay();
  const safeWidth = Math.max(0, Math.floor(width));
  const maxOffset = Math.max(0, displayWidth(text) - safeWidth);
  const animated = active && !reduceMotion && !terminalReduceMotion && safeWidth > 0 && maxOffset > 0;

  // Reset position and cancel the old timer before rendering a changed name or
  // viewport. An effect-based reset can emit a frame using the previous offset.
  return <MarqueeText key={JSON.stringify([text, safeWidth, animated])} text={text} width={safeWidth} maxOffset={maxOffset} animated={animated} ascii={ascii} />;
}

function MarqueeText({text, width, maxOffset, animated, ascii}: {
  text: string;
  width: number;
  maxOffset: number;
  animated: boolean;
  ascii: boolean;
}): React.ReactElement {
  const direction = useMemo(() => textDirection(text), [text]);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!animated) return;
    const delay = offset === 0 || offset >= maxOffset ? edgePauseMs : stepMs;
    const timer = setTimeout(() => {
      setOffset(current => current >= maxOffset ? 0 : current + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [animated, maxOffset, offset]);

  const progress = Math.min(offset, maxOffset);
  // Move the window toward the beginning for RTL text, keeping the original
  // character order. Glyph shaping and bidi rendering remain the terminal's job.
  const visible = animated
    ? (direction === 'rtl' ? sliceDisplayFromEnd : sliceDisplay)(text, progress, width)
    : truncate(text, width);
  return <Text aria-label={text}>{ascii ? toAsciiSafe(visible) : visible}</Text>;
}
