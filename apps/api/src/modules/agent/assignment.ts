import { prisma } from "../../lib/prisma";
import { zipLookup } from "../../integrations/zipLookup";

// Statuses that still need an agent's attention; APPROVED work doesn't count
// toward an agent's load.
const OPEN_STATUSES = ["DRAFT", "SUBMITTED", "REJECTED"] as const;

export interface AgentCandidate {
  id: string;
  openApplications: number;
}

// Least-loaded agent wins; ties go to the lowest id so assignment is deterministic.
export function pickLeastLoadedAgent(candidates: AgentCandidate[]): string | null {
  const [best] = [...candidates].sort((a, b) => a.openApplications - b.openApplications || a.id.localeCompare(b.id));
  return best?.id ?? null;
}

// Finds an active agent licensed in the applicant's state. Returns null when
// the ZIP can't be resolved or nobody covers it — the application is then left
// for an admin to assign.
export async function findAgentForZip(zipCode: string): Promise<string | null> {
  const location = await zipLookup.lookup(zipCode);
  if (!location) return null;

  const agents = await prisma.user.findMany({
    where: {
      role: "AGENT",
      isActive: true,
      agentProfile: { isActive: true, regions: { has: location.state } },
    },
    select: {
      id: true,
      _count: { select: { assignedApplications: { where: { status: { in: [...OPEN_STATUSES] } } } } },
    },
  });

  return pickLeastLoadedAgent(agents.map((a) => ({ id: a.id, openApplications: a._count.assignedApplications })));
}
