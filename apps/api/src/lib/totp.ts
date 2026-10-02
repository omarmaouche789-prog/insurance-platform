import { authenticator } from "otplib";

const ISSUER = "Insurance Marketplace";
const STEP_SECONDS = 30;

// Accept the previous and next 30s step as well, to tolerate phone clock drift.
authenticator.options = { window: 1, step: STEP_SECONDS };

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpKeyUri(email: string, secret: string): string {
  return authenticator.keyuri(email, ISSUER, secret);
}

export function verifyTotpCode(secret: string, code: string): boolean {
  return authenticator.check(code, secret);
}

export function currentTotpStep(now = Date.now()): number {
  return Math.floor(now / 1000 / STEP_SECONDS);
}

// The absolute time step the code belongs to, or null if it doesn't match
// within the drift window. Callers store the step to refuse replays.
export function matchTotpStep(secret: string, code: string, now = Date.now()): number | null {
  const delta = authenticator.checkDelta(code, secret);
  return delta === null ? null : currentTotpStep(now) + delta;
}

export function generateTotpCode(secret: string): string {
  return authenticator.generate(secret);
}
