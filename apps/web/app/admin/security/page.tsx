import type { Metadata } from "next";
import { SecuritySettings } from "../../../components/security/SecuritySettings";

export const metadata: Metadata = { title: "Security" };

export default function SecurityPage() {
  return <SecuritySettings />;
}
