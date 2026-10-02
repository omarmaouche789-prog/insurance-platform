import { describe, expect, it } from "vitest";
import { blogPostDisplayStatus, formatRateBps, isTotpCode, normalizeBackupCode, slugify } from "@insurance/shared";
import { hit, resetRateLimits } from "../src/lib/rateLimit";
import { parseUserAgent } from "../src/lib/userAgent";
import { generateTotpCode, generateTotpSecret, matchTotpStep, currentTotpStep } from "../src/lib/totp";
import { generateBackupCodes, hashBackupCode, looksLikeBackupCode, readTotpSecret, sealTotpSecret } from "../src/modules/security/secrets";
import { htmlToText, readingMinutes, sanitizePostHtml } from "../src/modules/cms/sanitize";
import { sniffImageMime } from "../src/modules/cms/images";
import { newPasswordSchema } from "../src/lib/password";

describe("rate limiter", () => {
  it("allows up to max per window, then blocks until reset", () => {
    resetRateLimits();
    const t = 1_000_000;
    expect(hit("k", 1000, 2, t).allowed).toBe(true);
    expect(hit("k", 1000, 2, t + 1).allowed).toBe(true);
    expect(hit("k", 1000, 2, t + 2)).toMatchObject({ allowed: false, remaining: 0 });
    expect(hit("k", 1000, 2, t + 1001).allowed).toBe(true);
    expect(hit("other", 1000, 2, t + 2).allowed).toBe(true);
  });
});

describe("user agent parsing", () => {
  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0 Safari/537.36 Edg/128.0", "Edge on Windows", "desktop"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15", "Safari on macOS", "desktop"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36", "Chrome on Android", "mobile"],
    ["Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1", "Safari on iPadOS", "tablet"],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0", "Firefox on Linux", "desktop"],
  ])("%s", (ua, summary, type) => {
    expect(parseUserAgent(ua)).toMatchObject({ summary, type });
  });

  it("handles missing and unknown agents", () => {
    expect(parseUserAgent(undefined)).toEqual({ browser: null, os: null, type: "unknown", summary: null });
    expect(parseUserAgent("curl/8.0").summary).toBe("Unknown device");
  });
});

describe("TOTP", () => {
  it("reports the time step a valid code belongs to", () => {
    const secret = generateTotpSecret();
    expect(matchTotpStep(secret, generateTotpCode(secret))).toBe(currentTotpStep());
    expect(matchTotpStep(secret, "abcdef")).toBeNull();
  });

  it("encrypts secrets at rest and reads legacy plaintext", () => {
    const sealed = sealTotpSecret("JBSWY3DPEHPK3PXP");
    expect(sealed).toMatch(/^v1:/);
    expect(readTotpSecret(sealed)).toBe("JBSWY3DPEHPK3PXP");
    expect(readTotpSecret("JBSWY3DPEHPK3PXP")).toBe("JBSWY3DPEHPK3PXP");
  });
});

describe("backup codes", () => {
  it("generates unique, unambiguous codes", () => {
    const codes = generateBackupCodes(50);
    expect(new Set(codes).size).toBe(50);
    for (const c of codes) {
      expect(c).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
      expect(c).not.toMatch(/[01ILO]/);
    }
  });

  it("hashes independent of formatting", () => {
    expect(hashBackupCode("abcde-fghjk")).toBe(hashBackupCode("ABCDEFGHJK"));
    expect(hashBackupCode("ABCDE-FGHJK")).not.toBe(hashBackupCode("ABCDE-FGHJM"));
    expect(looksLikeBackupCode("abcde fghjk")).toBe(true);
    expect(looksLikeBackupCode("123456")).toBe(false);
    expect(normalizeBackupCode(" ab-cd ")).toBe("ABCD");
    expect(isTotpCode(" 123456 ")).toBe(true);
  });
});

describe("password policy", () => {
  it("requires length and a letter + digit", () => {
    expect(newPasswordSchema.safeParse("Password123!").success).toBe(true);
    expect(newPasswordSchema.safeParse("short1").success).toBe(false);
    expect(newPasswordSchema.safeParse("12345678").success).toBe(false);
    expect(newPasswordSchema.safeParse("x1".repeat(65)).success).toBe(false);
  });
});

describe("CMS helpers", () => {
  it("sanitizes and summarizes HTML", () => {
    expect(sanitizePostHtml('<p style="color:red">Hi<iframe src="https://x"></iframe></p>')).toBe("<p>Hi</p>");
    expect(htmlToText("<p>Hello&nbsp;<strong>world</strong></p>")).toBe("Hello world");
    expect(readingMinutes(`<p>${"word ".repeat(660)}</p>`)).toBe(3);
  });

  it("slugifies", () => {
    expect(slugify("  Héllo, Wörld!  Plans & Prices ")).toBe("hello-world-plans-prices");
    expect(slugify("---")).toBe("");
    expect(slugify("a".repeat(100))).toHaveLength(80);
  });

  it("derives scheduled status", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    expect(blogPostDisplayStatus("PUBLISHED", "2026-10-02T00:00:00Z", now)).toBe("SCHEDULED");
    expect(blogPostDisplayStatus("PUBLISHED", "2026-09-30T00:00:00Z", now)).toBe("PUBLISHED");
    expect(blogPostDisplayStatus("DRAFT", "2026-10-02T00:00:00Z", now)).toBe("DRAFT");
  });

  it("sniffs image types", () => {
    expect(sniffImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageMime(Buffer.from("GIF89a....", "latin1"))).toBe("image/gif");
    expect(sniffImageMime(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]))).toBe("image/webp");
    expect(sniffImageMime(Buffer.from("<svg>"))).toBeNull();
  });

  it("formats rates", () => {
    expect(formatRateBps(500)).toBe("5%");
    expect(formatRateBps(525)).toBe("5.25%");
  });
});
