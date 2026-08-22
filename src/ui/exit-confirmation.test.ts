import {describe, expect, it} from 'vitest';
import {EXIT_CONFIRMATION_MS, ctrlCExitDecision} from './exit-confirmation.js';

describe('Ctrl+C exit confirmation', () => {
  it('arms the first press and exits on a second press inside the confirmation window', () => {
    const first = ctrlCExitDecision(0, 1000);
    const second = ctrlCExitDecision(first.armedUntil, 1000 + EXIT_CONFIRMATION_MS - 1);

    expect(first).toEqual({shouldExit: false, armedUntil: 1000 + EXIT_CONFIRMATION_MS});
    expect(second).toEqual({shouldExit: true, armedUntil: 0});
  });

  it('re-arms instead of exiting after the confirmation expires', () => {
    const expired = ctrlCExitDecision(1000 + EXIT_CONFIRMATION_MS, 1001 + EXIT_CONFIRMATION_MS);

    expect(expired).toEqual({
      shouldExit: false,
      armedUntil: 1001 + EXIT_CONFIRMATION_MS * 2
    });
  });
});
