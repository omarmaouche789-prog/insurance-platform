import { describe, expect, it } from "vitest";
import { pickLeastLoadedAgent } from "../src/modules/agent/assignment";
import { commissionAmountCents } from "../src/modules/agent/commissions";
import { buildAgentApplicationWhere } from "../src/modules/agent/agent.service";

describe("pickLeastLoadedAgent", () => {
  it("picks the agent with the fewest open applications", () => {
    expect(
      pickLeastLoadedAgent([
        { id: "a", openApplications: 3 },
        { id: "b", openApplications: 1 },
        { id: "c", openApplications: 2 },
      ]),
    ).toBe("b");
  });

  it("breaks ties deterministically by id", () => {
    expect(
      pickLeastLoadedAgent([
        { id: "zeta", openApplications: 0 },
        { id: "alpha", openApplications: 0 },
      ]),
    ).toBe("alpha");
  });

  it("returns null when nobody is available", () => {
    expect(pickLeastLoadedAgent([])).toBeNull();
  });
});

describe("commissionAmountCents", () => {
  it("is annualized premium × rate, rounded to the cent", () => {
    expect(commissionAmountCents(46800, 500)).toBe(28080); // $468 × 12 × 5%
    expect(commissionAmountCents(33174, 450)).toBe(17914); // $331.74 × 12 × 4.5% = 179.1396
    expect(commissionAmountCents(50000, 0)).toBe(0);
  });
});

describe("buildAgentApplicationWhere", () => {
  it("always scopes to the agent", () => {
    expect(buildAgentApplicationWhere("agent-1", { page: 1, pageSize: 20 })).toEqual({ agentId: "agent-1" });
  });

  it("adds status, carrier-status and name/reference search filters", () => {
    const where = buildAgentApplicationWhere("agent-1", {
      statuses: ["REJECTED"],
      submissionStatuses: ["FAILED"],
      search: "uma",
      page: 1,
      pageSize: 20,
    });
    expect(where).toMatchObject({
      agentId: "agent-1",
      status: { in: ["REJECTED"] },
      submissionStatus: { in: ["FAILED"] },
    });
    expect(where.OR).toEqual([
      { firstName: { contains: "uma", mode: "insensitive" } },
      { lastName: { contains: "uma", mode: "insensitive" } },
      { carrierReference: { contains: "uma", mode: "insensitive" } },
    ]);
  });
});
