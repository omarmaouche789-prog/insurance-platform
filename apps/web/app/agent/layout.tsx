import type { ReactNode } from "react";
import { AgentShell } from "../../components/agent/AgentNav";

export default function AgentLayout({ children }: { children: ReactNode }) {
  return <AgentShell>{children}</AgentShell>;
}
