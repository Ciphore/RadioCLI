import React, {useEffect, useState} from 'react';
import {Text} from 'ink';
import {displayWidth, sliceDisplay, truncate} from '../format.js';
import {useDisplay} from '../display-context.js';
import {toAsciiSafe} from '../ascii.js';

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
  const safeWidth = Math.max(0, width);
  const maxOffset = Math.max(0, displayWidth(text) - safeWidth);
  const animated = active && !reduceMotion && !terminalReduceMotion && maxOffset > 0;
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    setOffset(0);
  }, [active, reduceMotion, terminalReduceMotion, safeWidth, text]);

  useEffect(() => {
    if (!animated) return;
    const delay = offset === 0 || offset >= maxOffset ? edgePauseMs : stepMs;
    const timer = setTimeout(() => {
      setOffset(current => current >= maxOffset ? 0 : current + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [animated, maxOffset, offset]);

  const visible = animated
    ? sliceDisplay(text, Math.min(offset, maxOffset), safeWidth)
    : truncate(text, safeWidth);
  return <Text aria-label={text}>{ascii ? toAsciiSafe(visible) : visible}</Text>;
}
