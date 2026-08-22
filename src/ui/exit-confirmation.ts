export const EXIT_CONFIRMATION_MS = 4500;

export type ExitConfirmationDecision = {
  shouldExit: boolean;
  armedUntil: number;
};

export function ctrlCExitDecision(armedUntil: number, now: number): ExitConfirmationDecision {
  if (armedUntil > 0 && now <= armedUntil) {
    return {shouldExit: true, armedUntil: 0};
  }

  return {shouldExit: false, armedUntil: now + EXIT_CONFIRMATION_MS};
}
