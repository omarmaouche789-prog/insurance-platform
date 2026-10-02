import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@insurance/shared";

export const PASSWORD_HASH_ROUNDS = 12;

// bcrypt only reads the first 72 bytes, hence the max length.
export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Password must contain at least one letter and one number");

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_HASH_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// A hash nobody knows the password for — for accounts that must set their
// own password through an invite link before they can sign in.
export function unusablePasswordHash(): Promise<string> {
  return hashPassword(crypto.randomBytes(32).toString("base64"));
}

// For random one-time tokens (password reset links): high-entropy, so a fast
// hash is fine — there's nothing to brute-force.
export function generateUrlToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
