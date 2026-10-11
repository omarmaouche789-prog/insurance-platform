import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type {
  FeatureKey,
  PublicStatusDTO,
  SettingsSection,
  SettingsSectionMeta,
  SettingsSectionResponseDTO,
  SystemSettingsDTO,
  SystemSettingsResponseDTO,
} from "@insurance/shared";
import {
  AVAILABLE_LANGUAGES,
  DATE_FORMATS,
  isValidEmail,
  isValidLogoUrl,
  isValidPhone,
  SETTINGS_LIMITS,
  SETTINGS_SECTIONS,
  SYSTEM_SETTINGS_DEFAULTS,
  TIME_FORMATS,
  TIMEZONE_CODES,
} from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { recordAuditEvent } from "../../lib/audit";
import { HttpError } from "../../middleware/errorHandler";

// ─── Validation ──────────────────────────────────────────────────────────────

const required = (label: string, max: number = SETTINGS_LIMITS.nameMax) =>
  z.string({ invalid_type_error: `${label} must be text` }).trim().min(1, `${label} is required`).max(max, `${label} can be at most ${max} characters`);
const int = (label: string, { min, max }: { min: number; max: number }) =>
  z.number({ invalid_type_error: `${label} must be a number` }).int(`${label} must be a whole number`).min(min, `${label} must be at least ${min}`).max(max, `${label} can be at most ${max}`);
const bool = (label: string) => z.boolean({ invalid_type_error: `${label} must be on or off` });
const oneOf = <T extends string>(label: string, values: readonly [T, ...T[]]) =>
  z.enum(values, { errorMap: () => ({ message: `Choose a valid ${label.toLowerCase()}` }) });

// One schema per setting. Used to validate writes and to discard stored
// values that no longer make sense (they fall back to the default).
export const FIELD_SCHEMAS: { [S in SettingsSection]: { [K in keyof SystemSettingsDTO[S]]: z.ZodType<SystemSettingsDTO[S][K]> } } = {
  general: {
    companyName: required("Company name"),
    platformName: required("Platform name"),
    supportEmail: required("Support email", 254).refine(isValidEmail, "Enter a valid support email address"),
    supportPhone: required("Support phone", 25).refine(isValidPhone, "Enter a valid support phone number"),
    logoUrl: z
      .string({ invalid_type_error: "Logo URL must be text" })
      .trim()
      .max(SETTINGS_LIMITS.logoUrlMax, `Logo URL can be at most ${SETTINGS_LIMITS.logoUrlMax} characters`)
      .refine(isValidLogoUrl, "Logo URL must start with https:// (or leave it empty)"),
  },
  features: {
    twoFactor: bool("Two-factor authentication"),
    smsNotifications: bool("SMS notifications"),
    emailNotifications: bool("Email notifications"),
    analytics: bool("Analytics dashboard"),
    blog: bool("Blog CMS"),
  },
  maintenance: {
    maintenanceMode: bool("Maintenance mode"),
    maintenanceMessage: z
      .string({ invalid_type_error: "Maintenance message must be text" })
      .trim()
      .max(SETTINGS_LIMITS.maintenanceMessageMax, `Keep the message under ${SETTINGS_LIMITS.maintenanceMessageMax} characters`),
  },
  localization: {
    timezone: oneOf("Timezone", TIMEZONE_CODES as [SystemSettingsDTO["localization"]["timezone"], ...SystemSettingsDTO["localization"]["timezone"][]]),
    language: oneOf("Language", AVAILABLE_LANGUAGES as [SystemSettingsDTO["localization"]["language"], ...SystemSettingsDTO["localization"]["language"][]]),
    dateFormat: oneOf("Date format", DATE_FORMATS),
    timeFormat: oneOf("Time format", Object.keys(TIME_FORMATS) as [SystemSettingsDTO["localization"]["timeFormat"], ...SystemSettingsDTO["localization"]["timeFormat"][]]),
  },
  session: {
    timeoutMinutes: int("Session timeout", SETTINGS_LIMITS.timeoutMinutes),
    maxLoginAttempts: int("Max login attempts", SETTINGS_LIMITS.maxLoginAttempts),
  },
};

export function isSection(value: string): value is SettingsSection {
  return (SETTINGS_SECTIONS as string[]).includes(value);
}

export function isSettingKey<S extends SettingsSection>(section: S, key: string): key is Extract<keyof SystemSettingsDTO[S], string> {
  return Object.prototype.hasOwnProperty.call(FIELD_SCHEMAS[section], key);
}

// Parses one value; throws a 400 naming the problem.
export function parseSetting<S extends SettingsSection>(section: S, key: string, value: unknown): unknown {
  if (!isSettingKey(section, key)) throw new HttpError(400, `Unknown setting: ${section}.${key}`);
  const schema = (FIELD_SCHEMAS[section] as Record<string, z.ZodTypeAny>)[key];
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message ?? `Invalid value for ${section}.${key}`);
  return result.data;
}

// ─── Reading ─────────────────────────────────────────────────────────────────

// The maintenance and 2FA gates read settings on every request, so they're
// cached briefly. Each API instance re-reads within CACHE_MS of a change made
// on another instance; the instance that saved sees it immediately.
const CACHE_MS = process.env.NODE_ENV === "test" ? 0 : 10_000;
let cache: { value: SystemSettingsDTO; at: number } | null = null;

export function invalidateSettingsCache(): void {
  cache = null;
}

type Row = { section: string; key: string; value: Prisma.JsonValue };

// Stored values are laid over the defaults one by one. A value that fails
// its schema (or a row for a setting that no longer exists) is ignored, so a
// bad row can't take the platform down and new settings need no migration.
export function mergeSettings(rows: Row[]): SystemSettingsDTO {
  const merged = structuredClone(SYSTEM_SETTINGS_DEFAULTS);
  for (const row of rows) {
    if (!isSection(row.section) || !isSettingKey(row.section, row.key)) continue;
    const parsed = (FIELD_SCHEMAS[row.section] as Record<string, z.ZodTypeAny>)[row.key].safeParse(row.value);
    if (parsed.success) (merged[row.section] as Record<string, unknown>)[row.key] = parsed.data;
  }
  return merged;
}

export async function getSystemSettings(): Promise<SystemSettingsDTO> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  try {
    const rows = await prisma.systemSetting.findMany({ select: { section: true, key: true, value: true } });
    // Defensive: treat an unexpected result as "nothing stored".
    const value = mergeSettings(Array.isArray(rows) ? rows : []);
    cache = { value, at: Date.now() };
    return value;
  } catch (err) {
    // Settings must never take sign-in or the API down: fall back to the
    // last known values, else the defaults.
    console.error("Couldn't read system settings:", err instanceof Error ? err.message : err);
    return cache?.value ?? structuredClone(SYSTEM_SETTINGS_DEFAULTS);
  }
}

const EMPTY_META: SettingsSectionMeta = { updatedAt: null, updatedBy: null };

async function loadMeta(): Promise<Record<SettingsSection, SettingsSectionMeta>> {
  const rows = await prisma.systemSetting.findMany({
    orderBy: { updatedAt: "desc" },
    select: { section: true, updatedAt: true, updatedBy: { select: { firstName: true, lastName: true } } },
  });
  const meta = Object.fromEntries(SETTINGS_SECTIONS.map((s) => [s, EMPTY_META])) as Record<SettingsSection, SettingsSectionMeta>;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!isSection(row.section) || meta[row.section] !== EMPTY_META) continue; // newest first
    meta[row.section] = {
      updatedAt: row.updatedAt.toISOString(),
      updatedBy: row.updatedBy ? `${row.updatedBy.firstName} ${row.updatedBy.lastName}` : null,
    };
  }
  return meta;
}

export async function getSettingsForAdmin(): Promise<SystemSettingsResponseDTO> {
  const [settings, meta] = await Promise.all([getSystemSettings(), loadMeta()]);
  return { settings, meta };
}

export async function getSettingsSection<S extends SettingsSection>(section: S): Promise<SettingsSectionResponseDTO<S>> {
  const { settings, meta } = await getSettingsForAdmin();
  return { section, values: settings[section], meta: meta[section] };
}

// ─── Writing ─────────────────────────────────────────────────────────────────

// Saves some or all settings of one section. Only changed values are
// written; every change is audit-logged with its before and after value
// (all settings are non-personal configuration).
export async function updateSettings<S extends SettingsSection>(
  actorUserId: string,
  section: S,
  patch: Record<string, unknown>,
  req: Request,
  action = "admin.settings.update",
): Promise<SystemSettingsResponseDTO> {
  const parsed = Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, parseSetting(section, key, value)]));

  invalidateSettingsCache();
  const before = await getSystemSettings();
  const current = before[section] as Record<string, unknown>;
  const next = { ...current, ...parsed };

  if (section === "maintenance" && next.maintenanceMode === true && !String(next.maintenanceMessage ?? "").trim()) {
    throw new HttpError(400, "Write the message users will see before turning on maintenance mode");
  }

  const changed = Object.keys(parsed).filter((key) => JSON.stringify(current[key]) !== JSON.stringify(parsed[key]));
  if (changed.length) {
    await prisma.$transaction(
      changed.map((key) =>
        prisma.systemSetting.upsert({
          where: { section_key: { section, key } },
          create: { section, key, value: parsed[key] as Prisma.InputJsonValue, updatedById: actorUserId },
          update: { value: parsed[key] as Prisma.InputJsonValue, updatedById: actorUserId },
        }),
      ),
    );
    invalidateSettingsCache();
    await recordAuditEvent({
      actorUserId,
      action,
      entityType: "SystemSettings",
      entityId: section,
      metadata: {
        section,
        changed,
        before: Object.fromEntries(changed.map((k) => [k, current[k]])),
        after: Object.fromEntries(changed.map((k) => [k, parsed[k]])),
      } as Prisma.InputJsonObject,
      req,
    });
  }
  return getSettingsForAdmin();
}

// Flips a feature (or sets it, when `enabled` is given — so two admins
// toggling at once can't undo each other by accident).
export async function toggleFeature(actorUserId: string, feature: FeatureKey, enabled: boolean | undefined, req: Request): Promise<SystemSettingsResponseDTO> {
  invalidateSettingsCache();
  const current = (await getSystemSettings()).features[feature];
  return updateSettings(actorUserId, "features", { [feature]: enabled ?? !current }, req, "admin.settings.feature_toggle");
}

// ─── Public ──────────────────────────────────────────────────────────────────

export async function getPublicStatus(): Promise<PublicStatusDTO> {
  const s = await getSystemSettings();
  return {
    maintenance: { enabled: s.maintenance.maintenanceMode, message: s.maintenance.maintenanceMessage },
    features: { twoFactorRequired: s.features.twoFactor, analytics: s.features.analytics, blog: s.features.blog },
    general: s.general,
    localization: s.localization,
  };
}
