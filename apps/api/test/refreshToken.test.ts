import { describe, expect, it } from "vitest";
import { hashRefreshToken, parseDurationMs } from "../src/lib/refreshToken";

describe("parseDurationMs", () => {
  it("parses days, hours, minutes, and seconds", () => {
    expect(parseDurationMs("30d")).toBe(30 * 86_400_000);
    expect(parseDurationMs("12h")).toBe(12 * 3_600_000);
    expect(parseDurationMs("15m")).toBe(15 * 60_000);
    expect(parseDurationMs("45s")).toBe(45 * 1000);
  });

  it("throws on an invalid format", () => {
    expect(() => parseDurationMs("30days")).toThrow();
    expect(() => parseDurationMs("")).toThrow();
  });
});

describe("hashRefreshToken", () => {
  it("is deterministic and does not just return the input", () => {
    const token = "some-raw-refresh-token";
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
    expect(hashRefreshToken(token)).not.toBe(token);
  });
});
