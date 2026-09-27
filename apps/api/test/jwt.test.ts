import { describe, expect, it } from "vitest";
import { signAccessToken, signChallengeToken, verifyAccessToken, verifyChallengeToken } from "../src/lib/jwt";

describe("access tokens", () => {
  it("round-trips the role and adminRole claims", () => {
    const token = signAccessToken({ sub: "user-1", role: "ADMIN", adminRole: "SUPER" });
    const payload = verifyAccessToken(token);
    expect(payload).toMatchObject({ sub: "user-1", role: "ADMIN", adminRole: "SUPER" });
  });

  it("rejects a tampered token", () => {
    const token = signAccessToken({ sub: "user-1", role: "USER", adminRole: null });
    expect(() => verifyAccessToken(`${token}tampered`)).toThrow();
  });
});

describe("2FA challenge tokens", () => {
  it("round-trips the subject", () => {
    const token = signChallengeToken("user-42");
    expect(verifyChallengeToken(token)).toBe("user-42");
  });

  it("rejects a normal access token used as a challenge token", () => {
    const accessToken = signAccessToken({ sub: "user-1", role: "USER", adminRole: null });
    expect(() => verifyChallengeToken(accessToken)).toThrow();
  });
});
