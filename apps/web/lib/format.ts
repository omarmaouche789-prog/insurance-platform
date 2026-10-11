import type { DateFormat, SystemSettingsDTO, TimeFormat } from "@insurance/shared";
import { SYSTEM_SETTINGS_DEFAULTS, TIMEZONES } from "@insurance/shared";

// Dates and times are shown in the platform's timezone and formats from
// System Settings → Localization. SiteSettingsProvider calls
// setDisplayPreferences() once the settings load (and from a local cache on
// later visits); until then the defaults apply.
interface DisplayPreferences {
  timeZone: string;
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
}

function toPreferences(l: SystemSettingsDTO["localization"]): DisplayPreferences {
  return { timeZone: TIMEZONES[l.timezone]?.iana ?? "UTC", dateFormat: l.dateFormat, timeFormat: l.timeFormat };
}

let prefs = toPreferences(SYSTEM_SETTINGS_DEFAULTS.localization);
let partsFormatter = makePartsFormatter(prefs.timeZone);

function makePartsFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

export function setDisplayPreferences(localization: SystemSettingsDTO["localization"]): void {
  const next = toPreferences(localization);
  if (next.timeZone !== prefs.timeZone) partsFormatter = makePartsFormatter(next.timeZone);
  prefs = next;
}

export function getDisplayPreferences(): Readonly<DisplayPreferences> {
  return prefs;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

// Calendar parts of an instant in the platform timezone. A bare
// "YYYY-MM-DD" (date of birth, license expiry) is a calendar date already,
// so it's never shifted by the timezone.
function parts(iso: string): { y: string; m: string; d: string; hh: number; mm: string } | null {
  const bare = DATE_ONLY.exec(iso);
  if (bare) return { y: bare[1], m: bare[2], d: bare[3], hh: 0, mm: "00" };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const p = Object.fromEntries(partsFormatter.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: p.year, m: p.month, d: p.day, hh: Number(p.hour) % 24, mm: p.minute };
}

// Accepts an ISO string or a Date (an invalid Date shows as "—" rather
// than throwing).
function toIso(value: string | Date): string {
  return typeof value === "string" ? value : Number.isNaN(value.getTime()) ? "" : value.toISOString();
}

function datePart(x: { y: string; m: string; d: string }, format: DateFormat): string {
  if (format === "DD/MM/YYYY") return `${x.d}/${x.m}/${x.y}`;
  if (format === "YYYY-MM-DD") return `${x.y}-${x.m}-${x.d}`;
  return `${x.m}/${x.d}/${x.y}`;
}

function timePart(hh: number, mm: string, format: TimeFormat): string {
  if (format === "24h") return `${String(hh).padStart(2, "0")}:${mm}`;
  return `${hh % 12 === 0 ? 12 : hh % 12}:${mm} ${hh < 12 ? "AM" : "PM"}`;
}

export function formatDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const x = parts(toIso(iso));
  return x ? datePart(x, prefs.dateFormat) : "—";
}

export function formatTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const x = parts(toIso(iso));
  return x ? timePart(x.hh, x.mm, prefs.timeFormat) : "—";
}

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const x = parts(toIso(iso));
  return x ? `${datePart(x, prefs.dateFormat)} ${timePart(x.hh, x.mm, prefs.timeFormat)}` : "—";
}

// Example output for the settings page.
export function previewDateTime(localization: SystemSettingsDTO["localization"], at: Date): string {
  const saved = prefs;
  const savedFormatter = partsFormatter;
  setDisplayPreferences(localization);
  try {
    return formatDateTime(at);
  } finally {
    prefs = saved;
    partsFormatter = savedFormatter;
  }
}

const RELATIVE = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

// "3 minutes ago", "in 2 days", "yesterday".
export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["minute", 60],
    ["hour", 3600],
    ["day", 86_400],
    ["week", 604_800],
    ["month", 2_629_800],
    ["year", 31_557_600],
  ];
  let unit: Intl.RelativeTimeFormatUnit = "minute";
  let size = 60;
  for (const [u, s] of units) {
    if (abs >= s) {
      unit = u;
      size = s;
    }
  }
  return RELATIVE.format(Math.round(seconds / size), unit);
}

export function formatPercent(ratio: number | null | undefined, digits = 0): string {
  return ratio === null || ratio === undefined ? "—" : `${(ratio * 100).toFixed(digits)}%`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

// Compact currency for chart axes: $1.2k, $3.4M.
export function formatCompactCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(
    cents / 100,
  );
}

export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || "?";
}

export function toDateInput(d: Date): string {
  // Local calendar date, for <input type="date"> values.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
