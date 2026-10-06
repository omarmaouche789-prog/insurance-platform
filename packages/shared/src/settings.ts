import type { AdminRole } from "./roles";

// System settings change platform-wide security behavior, so only SUPER
// admins can edit them; every admin can view.
export const SETTINGS_EDITOR_ADMIN_ROLES = ["SUPER"] as const satisfies readonly AdminRole[];

export function canEditSystemSettings(adminRole: AdminRole | null): boolean {
  return adminRole !== null && (SETTINGS_EDITOR_ADMIN_ROLES as readonly AdminRole[]).includes(adminRole);
}

export interface SystemSettingsDTO {
  features: {
    // OFF blocks new 2FA enrollments. Accounts that already have 2FA are
    // still challenged: a factor is never silently dropped.
    twoFactor: boolean;
    // Stored for upcoming features; nothing reads these yet.
    recommendations: boolean;
    smsNotifications: boolean;
    hipaaCompliance: boolean;
  };
  maintenance: {
    // ON: the API refuses every non-admin request and the web app shows
    // `message` to everyone but admins.
    enabled: boolean;
    message: string;
  };
  session: {
    // Idle timeout: a session not refreshed for this long must sign in again.
    timeoutMinutes: number;
    // Failed sign-in attempts (password or 2FA code) allowed per account in
    // a 15-minute window before it's locked for the rest of the window.
    maxLoginAttempts: number;
  };
}

export const SYSTEM_SETTINGS_DEFAULTS: SystemSettingsDTO = {
  features: { twoFactor: true, recommendations: false, smsNotifications: false, hipaaCompliance: false },
  maintenance: {
    enabled: false,
    message: "We're performing scheduled maintenance and will be back shortly. Thank you for your patience.",
  },
  session: { timeoutMinutes: 30, maxLoginAttempts: 5 },
};

export const SETTINGS_LIMITS = {
  timeoutMinutes: { min: 5, max: 1440 },
  maxLoginAttempts: { min: 3, max: 20 },
  maintenanceMessageMax: 500,
} as const;

export interface SystemSettingsResponseDTO {
  settings: SystemSettingsDTO;
  updatedAt: string | null;
  updatedBy: string | null;
}

// Public, unauthenticated: what every visitor's browser needs to know.
export interface PublicStatusDTO {
  maintenance: { enabled: boolean; message: string };
  features: { twoFactor: boolean };
}

export const MAINTENANCE_ERROR_CODE = "MAINTENANCE";
