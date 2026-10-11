import type { AdminRole } from "./roles";

// System settings change platform-wide behavior, so only SUPER admins can
// edit them. Every admin can view (OPERATIONS and the rest read-only).
export const SETTINGS_EDITOR_ADMIN_ROLES = ["SUPER"] as const satisfies readonly AdminRole[];

export function canEditSystemSettings(adminRole: AdminRole | null): boolean {
  return adminRole !== null && (SETTINGS_EDITOR_ADMIN_ROLES as readonly AdminRole[]).includes(adminRole);
}

// ─── Options ─────────────────────────────────────────────────────────────────

// Short codes shown to admins, each mapped to an IANA zone (so daylight
// saving is handled: "EST" means US Eastern time, EST or EDT).
export const TIMEZONES = {
  UTC: { label: "UTC — Coordinated Universal Time", iana: "UTC" },
  EST: { label: "EST — US Eastern", iana: "America/New_York" },
  CST: { label: "CST — US Central", iana: "America/Chicago" },
  MST: { label: "MST — US Mountain", iana: "America/Denver" },
  PST: { label: "PST — US Pacific", iana: "America/Los_Angeles" },
  GMT: { label: "GMT — London", iana: "Europe/London" },
  CET: { label: "CET — Central Europe", iana: "Europe/Paris" },
  IST: { label: "IST — India", iana: "Asia/Kolkata" },
  JST: { label: "JST — Japan", iana: "Asia/Tokyo" },
  AEST: { label: "AEST — Australia Eastern", iana: "Australia/Sydney" },
} as const;
export type TimezoneCode = keyof typeof TIMEZONES;
export const TIMEZONE_CODES = Object.keys(TIMEZONES) as TimezoneCode[];

// The UI is English-only for now; Arabic is listed as coming soon.
export const LANGUAGES = { en: { label: "English", available: true }, ar: { label: "العربية (Arabic) — coming soon", available: false } } as const;
export type LanguageCode = keyof typeof LANGUAGES;
export const AVAILABLE_LANGUAGES = (Object.keys(LANGUAGES) as LanguageCode[]).filter((l) => LANGUAGES[l].available);

export const DATE_FORMATS = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const TIME_FORMATS = { "12h": "12-hour (2:30 PM)", "24h": "24-hour (14:30)" } as const;
export type TimeFormat = keyof typeof TIME_FORMATS;

// ─── Settings ────────────────────────────────────────────────────────────────

export interface SystemSettingsDTO {
  general: {
    companyName: string;
    platformName: string;
    supportEmail: string;
    supportPhone: string;
    logoUrl: string; // "" = use the built-in mark
  };
  features: {
    // ON: admins and agents must have two-factor authentication; anyone
    // without it is sent to set it up before using their portal. Applicants
    // can always opt in.
    twoFactor: boolean;
    // Stored for when SMS is wired to events; nothing sends texts yet.
    smsNotifications: boolean;
    // OFF: applicant/agent notification emails (application updates) stop.
    // Security and account emails (password reset, 2FA notices) always send.
    emailNotifications: boolean;
    // OFF: the analytics dashboard and its API are hidden.
    analytics: boolean;
    // OFF: the public blog and the blog CMS are hidden.
    blog: boolean;
  };
  maintenance: {
    // ON: the API refuses every non-admin request and the web app shows the
    // message to everyone but admins.
    maintenanceMode: boolean;
    maintenanceMessage: string;
  };
  localization: {
    timezone: TimezoneCode;
    language: LanguageCode;
    dateFormat: DateFormat;
    timeFormat: TimeFormat;
  };
  session: {
    // Idle timeout: a session not refreshed for this long must sign in again.
    timeoutMinutes: number;
    // Failed sign-in attempts (password or 2FA code) allowed per account in
    // a 15-minute window before it's locked for the rest of the window.
    maxLoginAttempts: number;
  };
}

export type SettingsSection = keyof SystemSettingsDTO;
export const SETTINGS_SECTIONS: SettingsSection[] = ["general", "features", "maintenance", "localization", "session"];
export type FeatureKey = keyof SystemSettingsDTO["features"];

export const DEFAULT_MAINTENANCE_MESSAGE = "The system is under maintenance. Please try again later.";

export const SYSTEM_SETTINGS_DEFAULTS: SystemSettingsDTO = {
  general: {
    companyName: "Insurance Marketplace, Inc.",
    platformName: "Insurance Marketplace",
    supportEmail: "support@insurancemarketplace.example",
    supportPhone: "+1 (800) 555-0100",
    logoUrl: "",
  },
  features: { twoFactor: false, smsNotifications: false, emailNotifications: true, analytics: true, blog: true },
  maintenance: { maintenanceMode: false, maintenanceMessage: DEFAULT_MAINTENANCE_MESSAGE },
  localization: { timezone: "EST", language: "en", dateFormat: "MM/DD/YYYY", timeFormat: "12h" },
  session: { timeoutMinutes: 30, maxLoginAttempts: 5 },
};

export const SETTINGS_LIMITS = {
  timeoutMinutes: { min: 5, max: 1440 },
  maxLoginAttempts: { min: 3, max: 20 },
  maintenanceMessageMax: 500,
  nameMax: 100,
  logoUrlMax: 500,
} as const;

export const FEATURE_INFO: Record<FeatureKey, { label: string; description: string; critical: boolean }> = {
  twoFactor: { label: "Two-Factor Authentication (2FA)", description: "Require 2FA for admin/agent login", critical: true },
  smsNotifications: { label: "SMS Notifications", description: "Enable SMS notifications to users", critical: false },
  emailNotifications: { label: "Email Notifications", description: "Enable email notifications to users", critical: true },
  analytics: { label: "Analytics Dashboard", description: "Show analytics and reporting", critical: false },
  blog: { label: "Blog CMS", description: "Enable blog and content management", critical: false },
};

export interface SettingsSectionMeta {
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface SystemSettingsResponseDTO {
  settings: SystemSettingsDTO;
  meta: Record<SettingsSection, SettingsSectionMeta>;
}

export interface SettingsSectionResponseDTO<S extends SettingsSection = SettingsSection> {
  section: S;
  values: SystemSettingsDTO[S];
  meta: SettingsSectionMeta;
}

// Public, unauthenticated: what every visitor's browser needs to know.
export interface PublicStatusDTO {
  maintenance: { enabled: boolean; message: string };
  features: { twoFactorRequired: boolean; analytics: boolean; blog: boolean };
  general: SystemSettingsDTO["general"];
  localization: SystemSettingsDTO["localization"];
}

export const MAINTENANCE_ERROR_CODE = "MAINTENANCE";
export const TWO_FACTOR_REQUIRED_CODE = "TWO_FACTOR_REQUIRED";

// Shared validation so the form and the API agree.
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export function isValidPhone(value: string): boolean {
  return /^\+?[\d\s().-]{7,25}$/.test(value) && value.replace(/\D/g, "").length >= 7;
}

export function isValidLogoUrl(value: string): boolean {
  if (!value) return true;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
