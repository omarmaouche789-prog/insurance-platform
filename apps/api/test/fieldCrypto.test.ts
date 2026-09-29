import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptField, decryptJson, encryptField, encryptJson } from "../src/lib/fieldCrypto";

describe("field encryption", () => {
  it("round-trips plaintext", () => {
    expect(decryptField(encryptField("123456789"))).toBe("123456789");
  });

  it("uses a fresh IV so equal plaintexts produce different ciphertexts", () => {
    expect(encryptField("123456789")).not.toBe(encryptField("123456789"));
  });

  it("never contains the plaintext", () => {
    expect(encryptField("123456789")).not.toContain("123456789");
  });

  it("rejects tampered ciphertext via the GCM auth tag", () => {
    const [v, iv, tag, ct] = encryptField("123456789").split(":");
    const flipped = Buffer.from(ct, "base64");
    flipped[0] ^= 0xff;
    expect(() => decryptField([v, iv, tag, flipped.toString("base64")].join(":"))).toThrow();
  });

  it("fails to decrypt under a different key", () => {
    const other = crypto.randomBytes(32);
    expect(() => decryptField(encryptField("secret"), other)).toThrow();
  });

  it("rejects values that aren't in the versioned format", () => {
    expect(() => decryptField("123456789")).toThrow("Unrecognized encrypted field format");
  });

  it("round-trips JSON", () => {
    const value = { conditions: ["ASTHMA"], preferredDoctors: [{ name: "Dr. Lee", specialty: "" }] };
    expect(decryptJson(encryptJson(value))).toEqual(value);
  });
});
