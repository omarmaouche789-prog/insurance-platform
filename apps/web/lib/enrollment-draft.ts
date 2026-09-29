import type { HealthInfoDTO } from "@insurance/shared";

// Per-tab draft of the enrollment wizard, so a refresh doesn't lose progress.
// The SSN is deliberately never written here — once the application has been
// saved server-side the API holds it (encrypted), and the form asks for it
// again only if the user wants to change it.
export interface EnrollmentDraft {
  version: 1;
  planId: string;
  step: number;
  applicationId: string | null;
  // zipCode is optional so drafts saved before it existed still load.
  personal: { firstName: string; lastName: string; dateOfBirth: string; zipCode?: string };
  healthInfo: HealthInfoDTO;
}

const key = (planId: string) => `enrollment-draft:${planId}`;

// Storage can be unavailable (private mode, blocked site data), so every
// access is best-effort.
export function loadDraft(planId: string): EnrollmentDraft | null {
  try {
    const raw = sessionStorage.getItem(key(planId));
    const draft = raw ? (JSON.parse(raw) as EnrollmentDraft) : null;
    return draft?.version === 1 && draft.planId === planId ? draft : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft: EnrollmentDraft): void {
  try {
    sessionStorage.setItem(key(draft.planId), JSON.stringify(draft));
  } catch {
    // ignore
  }
}

export function clearDraft(planId: string): void {
  try {
    sessionStorage.removeItem(key(planId));
  } catch {
    // ignore
  }
}
