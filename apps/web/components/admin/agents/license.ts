const EXPIRY_WARNING_DAYS = 60;

// Licenses expiring within the warning window (or already expired) get flagged.
export function licenseExpiringSoon(date: string | null): boolean {
  if (!date) return false;
  return new Date(`${date}T00:00:00Z`).getTime() - Date.now() < EXPIRY_WARNING_DAYS * 86_400_000;
}
