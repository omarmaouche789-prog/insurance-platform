import type { Request } from "express";
import type { Prisma } from "@prisma/client";
import type { PublicStatusDTO, SystemSettingsDTO, SystemSettingsResponseDTO } from "@insurance/shared";
import { SYSTEM_SETTINGS_DEFAULTS } from "@insurance/shared";
import { prisma } from "../../lib/prisma";
import { recordAuditEvent } from "../../lib/audit";

type Section = keyof SystemSettingsDTO;
const SECTIONS = Object.keys(SYSTEM_SETTINGS_DEFAULTS) as Section[];

// The maintenance check reads settings on every request, so they're cached
// briefly. Each API instance re-reads within CACHE_MS of a change made on
// another instance; the instance that saved sees it immediately.
const CACHE_MS = process.env.NODE_ENV === "test" ? 0 : 10_000;
let cache: { value: SystemSettingsDTO; at: number } | null = null;

export function invalidateSettingsCache(): void {
  cache = null;
}

// Stored values are merged over the defaults field by field, so a setting
// added in a later release gets its default without a migration, and a
// malformed stored value can't take the platform down.
export function mergeSettings(rows: Array<{ key: string; value: Prisma.JsonValue }>): SystemSettingsDTO {
  const merged = structuredClone(SYSTEM_SETTINGS_DEFAULTS);
  for (const row of rows) {
    if (!SECTIONS.includes(row.key as Section) || !row.value || typeof row.value !== "object" || Array.isArray(row.value)) continue;
    const section = merged[row.key as Section] as Record<string, unknown>;
    for (const [field, value] of Object.entries(row.value)) {
      if (field in section && typeof value === typeof section[field]) section[field] = value;
    }
  }
  return merged;
}

export async function getSystemSettings(): Promise<SystemSettingsDTO> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  try {
    const rows = await prisma.systemSetting.findMany({ select: { key: true, value: true } });
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

export async function getSettingsForAdmin(): Promise<SystemSettingsResponseDTO> {
  const [settings, latest] = await Promise.all([
    getSystemSettings(),
    prisma.systemSetting.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true, updatedBy: { select: { firstName: true, lastName: true } } },
    }),
  ]);
  return {
    settings,
    updatedAt: latest?.updatedAt.toISOString() ?? null,
    updatedBy: latest?.updatedBy ? `${latest.updatedBy.firstName} ${latest.updatedBy.lastName}` : null,
  };
}

// Lists "section.field" paths whose value differs, for the audit log.
export function diffSettings(before: SystemSettingsDTO, after: SystemSettingsDTO): string[] {
  const changed: string[] = [];
  for (const section of SECTIONS) {
    for (const [field, value] of Object.entries(after[section])) {
      if ((before[section] as Record<string, unknown>)[field] !== value) changed.push(`${section}.${field}`);
    }
  }
  return changed;
}

export async function updateSystemSettings(
  actorUserId: string,
  next: SystemSettingsDTO,
  req: Request,
): Promise<SystemSettingsResponseDTO> {
  invalidateSettingsCache();
  const before = await getSystemSettings();
  const changed = diffSettings(before, next);
  if (changed.length) {
    await prisma.$transaction(
      SECTIONS.map((key) =>
        prisma.systemSetting.upsert({
          where: { key },
          create: { key, value: next[key], updatedById: actorUserId },
          update: { value: next[key], updatedById: actorUserId },
        }),
      ),
    );
    invalidateSettingsCache();
    // Old and new values are all non-sensitive booleans/numbers, plus the
    // maintenance message, which is public text.
    await recordAuditEvent({
      actorUserId,
      action: "admin.settings.update",
      entityType: "SystemSettings",
      metadata: {
        changed,
        before: Object.fromEntries(changed.map((p) => [p, pick(before, p)])),
        after: Object.fromEntries(changed.map((p) => [p, pick(next, p)])),
      } as Prisma.InputJsonObject,
      req,
    });
  }
  return getSettingsForAdmin();
}

function pick(s: SystemSettingsDTO, path: string): string | number | boolean {
  const [section, field] = path.split(".") as [Section, string];
  return (s[section] as Record<string, string | number | boolean>)[field];
}

export async function getPublicStatus(): Promise<PublicStatusDTO> {
  const s = await getSystemSettings();
  return { maintenance: s.maintenance, features: { twoFactor: s.features.twoFactor } };
}
