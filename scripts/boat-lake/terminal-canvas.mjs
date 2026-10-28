/** Paint exactly the glyphs/colors emitted to the TUI; no extra scene detail. */
const quadrants = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█';
const triangles = {
  '◢': [[1, 0], [1, 1], [0, 1]], '◣': [[0, 0], [0, 1], [1, 1]],
  '◤': [[0, 0], [1, 0], [0, 1]], '◥': [[0, 0], [1, 0], [1, 1]],
};
export function paintReceiver(context, frame, cw = 8, ch = 16) {
  frame.forEach((row, y) => {
    let x = 0;
    for (const segment of row.segments) for (const glyph of segment.text) {
      const left = x++ * cw, top = y * ch;
      context.fillStyle = segment.backgroundColor;
      context.fillRect(left, top, cw, ch);
      context.fillStyle = segment.color;
      const mask = quadrants.indexOf(glyph);
      if (mask > 0) {
        for (let bit = 0; bit < 4; bit++) if (mask & (1 << bit)) context.fillRect(left + (bit & 1) * cw / 2, top + (bit >> 1) * ch / 2, cw / 2, ch / 2);
      } else if (glyph in triangles) {
        context.beginPath();
        triangles[glyph].forEach(([dx, dy], index) => context[index ? 'lineTo' : 'moveTo'](left + dx * cw, top + dy * ch));
        context.fill();
      } else if (glyph === '●') {
        context.beginPath();
        context.arc(left + cw / 2, top + ch / 2, cw / 2, 0, Math.PI * 2);
        context.fill();
      } else if (glyph === '─') {
        context.fillRect(left, top + ch / 2 - ch / 16, cw, ch / 8);
      } else if (glyph >= '▁' && glyph <= '▇') {
        const fill = (glyph.codePointAt(0) - 0x2580) / 8 * ch;
        context.fillRect(left, top + ch - fill, cw, fill);
      } else if ('░▒▓'.includes(glyph)) {
        const level = '░▒▓'.indexOf(glyph) + 1;
        for (let dy = 0; dy < ch; dy += 2) for (let dx = 0; dx < cw; dx += 2) {
          if ((dx / 2 + dy / 2 * 3) % 4 < level) context.fillRect(left + dx, top + dy, 2, 2);
        }
      }
    }
  });
}
