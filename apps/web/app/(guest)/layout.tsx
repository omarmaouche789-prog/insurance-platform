import type { ReactNode } from "react";
import { SiteHeader } from "../../components/SiteHeader";

export default function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <SiteHeader />
      <main>{children}</main>
    </div>
  );
}
