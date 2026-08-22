import {describe, expect, it} from 'vitest';
import {safeExternalHttpUrl, safeMediaTarget, sanitizeTerminalText} from './safety.js';

describe('untrusted input safety', () => {
  it('removes terminal control and bidi sequences while preserving Unicode text', () => {
    expect(sanitizeTerminalText('\u001b]0;owned\u0007Café 東京\u202eabc')).toBe('Café 東京abc');
  });

  it('allows only HTTP(S) external links', () => {
    expect(safeExternalHttpUrl('https://example.com/?a=1&b=2')).toContain('https://example.com/');
    expect(safeExternalHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalHttpUrl('file:///etc/passwd')).toBeNull();
  });

  it('rejects option-like and unsupported playback targets', () => {
    expect(safeMediaTarget('--audio-device=bad')).toBeNull();
    expect(safeMediaTarget('javascript:alert(1)')).toBeNull();
    expect(safeMediaTarget('https://example.com/live.mp3')).toBe('https://example.com/live.mp3');
  });
});
