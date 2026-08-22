import {isAbsolute} from 'node:path';

// C0/C1 controls, DEL, ANSI CSI/OSC sequences, and bidi overrides can alter a
// terminal outside the text's visible cells. Preserve ordinary Unicode.
const terminalEscapePattern = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\)?)/g;
const unsafeControlPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const bidiControlPattern = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

export function sanitizeTerminalText(value: string | null | undefined): string | undefined {
  const cleaned = value
    ?.replace(terminalEscapePattern, '')
    .replace(unsafeControlPattern, '')
    .replace(bidiControlPattern, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || undefined;
}

export function safeExternalHttpUrl(value: string): string | null {
  try {
    const cleaned = value.trim();
    const parsed = new URL(cleaned);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? cleaned : null;
  } catch {
    return null;
  }
}

/** Accept public HTTP(S) streams and explicit local playlist targets. */
export function safeMediaTarget(value: string): string | null {
  const target = value.trim();
  if (!target || target.startsWith('-')) {
    return null;
  }

  if (isAbsolute(target)) {
    return target;
  }

  try {
    const parsed = new URL(target);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'file:'
      ? target
      : null;
  } catch {
    return null;
  }
}
