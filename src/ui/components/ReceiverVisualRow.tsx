import React from 'react';
import {Transform} from 'ink';
import {Chalk} from 'chalk';
import {toAsciiSafe} from '../ascii.js';
import {useDisplay} from '../display-context.js';
import {displayWidth, sliceDisplay} from '../format.js';
import type {buildVisualizer} from '../visualizers/receiver-visualizers.js';

type VisualRow = ReturnType<typeof buildVisualizer>[number];
const colors = [0, 1, 2, 3].map(level => new Chalk({level: level as 0 | 1 | 2 | 3}));

/** Keep animated text out of Ink 7's process-lifetime measurement/wrap caches.
 * Transform must be a direct child of a Box, never nested inside Text: nested
 * transforms are flattened before measurement. Only the fixed-width blank is
 * measured; the current frame is styled at output time and then discarded.
 */
export function ReceiverVisualRow({row, width, ascii, backgroundColor}: {
  row: VisualRow;
  width: number;
  ascii: boolean;
  backgroundColor?: string;
}): React.ReactElement {
  const {colorLevel} = useDisplay();
  const chalk = colors[colorLevel]!;
  const segments = row.segments ?? [{text: row.text, color: row.color}];
  const placeholder = ' '.repeat(Math.max(0, width));

  return <Transform transform={visiblePlaceholder => {
    // Ink clips before invoking Transform. Respect the remaining width so a
    // narrow terminal cannot receive a full row after clipping the placeholder.
    let remaining = displayWidth(visiblePlaceholder);
    let output = '';
    for (const segment of segments) {
      const source = ascii ? toAsciiSafe(segment.text) : segment.text;
      const text = sliceDisplay(source, 0, remaining);
      remaining -= displayWidth(text);
      let styled = chalk.hex(segment.color)(text);
      const background = segment.backgroundColor ?? backgroundColor;
      if (background) styled = chalk.bgHex(background)(styled);
      if (segment.bold) styled = chalk.bold(styled);
      output += styled;
      if (remaining <= 0 || text !== source) break;
    }
    return output;
  }}>{placeholder}</Transform>;
}
