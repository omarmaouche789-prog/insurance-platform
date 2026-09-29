import crypto from "node:crypto";
import { env } from "./env";

// AES-256-GCM for sensitive columns (SSN, health info). Stored format:
//   v1:<iv>:<authTag>:<ciphertext>   (each part base64)
// The version prefix leaves room for key rotation later (Phase 8).
const VERSION = "v1";
const IV_BYTES = 12;

export function encryptField(plaintext: string, key: Buffer = env.fieldEncryptionKey): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64"))).join(":");
}

export function decryptField(stored: string, key: Buffer = env.fieldEncryptionKey): string {
  const [version, iv, tag, ciphertext] = stored.split(":");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
    throw new Error("Unrecognized encrypted field format");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export function encryptJson(value: unknown): string {
  return encryptField(JSON.stringify(value));
}

export function decryptJson<T>(stored: string): T {
  return JSON.parse(decryptField(stored)) as T;
}
