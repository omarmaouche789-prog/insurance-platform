import type { ReactNode } from "react";
import { FeatureGate } from "../../../components/FeatureGate";

export default function AnalyticsLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="analytics" name="The analytics dashboard">
      {children}
    </FeatureGate>
  );
}
