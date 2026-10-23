// The terminal's Gallop renderer uses Buffer only to decode its base64 frames.
// Inject this adapter into the browser bundle without changing the CLI source.
export const Buffer = {
  from(value: string, encoding: 'base64'): Uint8Array {
    if (encoding !== 'base64') throw new Error('Receiver frames must use base64');
    return Uint8Array.from(atob(value), char => char.charCodeAt(0));
  },
};
