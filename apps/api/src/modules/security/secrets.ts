import crypto from "node:crypto";
import { BACKUP_CODE_COUNT, normalizeBackupCode } from "@insurance/shared";
import { env } from "../../lib/env";
import { decryptField, encryptField } from "../../lib/fieldCrypto";

// ─── TOTP secrets ────────────────────────────────────────────────────────────
// Stored AES-256-GCM encrypted ("v1:…"). Base32 secrets never contain ":",
// so a value without the prefix is unambiguously a legacy plaintext row.

export function sealTotpSecret(secret: string): string {
  return encryptField(secret);
}

export function isSealedSecret(stored: string): boolean {
  return stored.startsWith("v1:");
}

export function readTotpSecret(stored: string): string {
  return isSealedSecret(stored) ? decryptField(stored) : stored;
}

// ─── Backup codes ────────────────────────────────────────────────────────────
// 10 characters from a 32-letter alphabet without look-alikes (0/O, 1/I/L):
// 50 bits each. Stored as an HMAC under a key derived from the field
// encryption key, so a database dump alone can't be used to test guesses.

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 10;

let hmacKey: Buffer | null = null;
function backupCodeKey(): Buffer {
  hmacKey ??= Buffer.from(crypto.hkdfSync("sha256", env.fieldEncryptionKey, Buffer.alloc(0), "backup-codes:v1", 32));
  return hmacKey;
}

export function generateBackupCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]);
  return `${chars.slice(0, 5).join("")}-${chars.slice(5).join("")}`;
}

export function generateBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(generateBackupCode());
  return [...codes];
}

export function hashBackupCode(code: string): string {
  return crypto.createHmac("sha256", backupCodeKey()).update(normalizeBackupCode(code)).digest("hex");
}

export function looksLikeBackupCode(code: string): boolean {
  const normalized = normalizeBackupCode(code);
  return normalized.length === CODE_LENGTH && [...normalized].every((c) => ALPHABET.includes(c));
}
