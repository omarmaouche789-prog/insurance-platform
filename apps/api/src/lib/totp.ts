import { authenticator } from "otplib";

const ISSUER = "Insurance Marketplace";

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpKeyUri(email: string, secret: string): string {
  return authenticator.keyuri(email, ISSUER, secret);
}

export function verifyTotpCode(secret: string, code: string): boolean {
  return authenticator.check(code, secret);
}
