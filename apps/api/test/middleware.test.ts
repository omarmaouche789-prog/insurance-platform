import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { requireAdminRole, requireRole } from "../src/middleware/auth";

function mockRes() {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

describe("requireRole", () => {
  it("calls next for a matching role", () => {
    const req = { auth: { userId: "u1", role: "ADMIN", adminRole: "SUPER" } } as Request;
    const res = mockRes();
    const next = vi.fn();

    requireRole("ADMIN")(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-matching role", () => {
    const req = { auth: { userId: "u1", role: "USER", adminRole: null } } as Request;
    const res = mockRes();
    const next = vi.fn();

    requireRole("ADMIN")(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns 403 when there is no auth context at all", () => {
    const req = {} as Request;
    const res = mockRes();
    const next = vi.fn();

    requireRole("ADMIN")(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe("requireAdminRole", () => {
  it("calls next for a matching admin sub-role", () => {
    const req = { auth: { userId: "u1", role: "ADMIN", adminRole: "FINANCE" } } as Request;
    const res = mockRes();
    const next = vi.fn();

    requireAdminRole("FINANCE", "SUPER")(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 403 for a non-admin role even with an adminRole claim spoofed", () => {
    const req = { auth: { userId: "u1", role: "AGENT", adminRole: "SUPER" } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requireAdminRole("SUPER")(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns 403 for a non-matching admin sub-role", () => {
    const req = { auth: { userId: "u1", role: "ADMIN", adminRole: "OPERATIONS" } } as Request;
    const res = mockRes();
    const next = vi.fn();

    requireAdminRole("FINANCE")(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
