export type TerminalColorLevel = 0 | 1 | 2 | 3;

export type TerminalEvidence = {
  isTTY?: boolean;
  colorDepth?: number;
  screenReader?: boolean;
  asciiMode?: boolean;
  reduceMotion?: boolean;
};

export type TerminalCapabilities = {
  unicode: boolean;
  colorLevel: TerminalColorLevel;
  screenReader: boolean;
  reduceMotion: boolean;
  interactive: boolean;
};

/** Environment overrides affect this invocation, never the saved settings. */
export function resolveTerminalCapabilities(env: NodeJS.ProcessEnv = process.env, evidence: TerminalEvidence = {}): TerminalCapabilities {
  const dumb = env.TERM?.toLowerCase() === 'dumb';
  const screenReader = evidence.screenReader === true || env.INK_SCREEN_READER === 'true' || flag(env.RADIOCLI_SCREEN_READER) === true;
  const interactive = evidence.isTTY !== false && !dumb;
  const asciiOverride = flag(env.RADIOCLI_ASCII);
  const unicodeOverride = flag(env.RADIOCLI_UNICODE);
  const locale = [env.LC_ALL, env.LC_CTYPE, env.LANG].find(value => value?.trim())?.trim();
  // An explicit ASCII request wins when both overrides are enabled. A bare
  // C/POSIX locale is a known constraint; SSH and missing locale data are not.
  const unicode = dumb ? false
    : asciiOverride === true ? false
      : unicodeOverride === true ? true
        : asciiOverride === false ? true
          : unicodeOverride === false ? false
            : locale === 'C' || locale === 'POSIX' ? false : !evidence.asciiMode;
  const colorLevel = dumb || screenReader || Boolean(env.NO_COLOR) ? 0 : resolveColorLevel(env, evidence);
  return {
    unicode,
    colorLevel,
    screenReader,
    reduceMotion: Boolean(evidence.reduceMotion) || !interactive || screenReader || env.RADIOCLI_DISABLE_ANIMATION === '1' || env.RADIO_ATLAS_DISABLE_ANIMATION === '1',
    interactive
  };
}

function resolveColorLevel(env: NodeJS.ProcessEnv, evidence: TerminalEvidence): TerminalColorLevel {
  const forced = env.FORCE_COLOR;
  if (forced === '0' || forced === 'false') return 0;
  if (forced === '2') return 2;
  if (forced === '3') return 3;
  if (forced === '' || forced === '1' || forced === 'true') return 1;
  if (evidence.isTTY === false) return 0;
  if (evidence.colorDepth !== undefined) {
    return evidence.colorDepth <= 1 ? 0 : evidence.colorDepth <= 4 ? 1 : evidence.colorDepth <= 8 ? 2 : 3;
  }
  if (/^(truecolor|24bit)$/i.test(env.COLORTERM ?? '') || /(?:direct|truecolor)/i.test(env.TERM ?? '')) return 3;
  if (/256color/i.test(env.TERM ?? '')) return 2;
  if (env.TERM) return 1;
  // Preserve the existing rich display unless the environment supplies a
  // concrete constraint. Native callers can pass stdout.getColorDepth().
  return 3;
}

function flag(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  return undefined;
}
