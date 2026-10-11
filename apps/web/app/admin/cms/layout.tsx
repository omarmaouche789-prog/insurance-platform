import type { ReactNode } from "react";
import { FeatureGate } from "../../../components/FeatureGate";

export default function CmsLayout({ children }: { children: ReactNode }) {
  return (
    <FeatureGate feature="blog" name="The blog">
      {children}
    </FeatureGate>
  );
}
