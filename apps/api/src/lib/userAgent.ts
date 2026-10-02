import type { DeviceType } from "@insurance/shared";

// Just enough user-agent parsing for a readable login history ("Chrome on
// macOS"). Order matters: Edge and Opera also claim to be Chrome, and every
// Chromium browser also claims to be Safari.
const BROWSERS: Array<[RegExp, string]> = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const OPERATING_SYSTEMS: Array<[RegExp, string]> = [
  [/iPhone|iPod/, "iOS"],
  [/iPad/, "iPadOS"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/CrOS/, "ChromeOS"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Linux/, "Linux"],
];

export interface ParsedUserAgent {
  browser: string | null;
  os: string | null;
  type: DeviceType;
  summary: string | null;
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua) return { browser: null, os: null, type: "unknown", summary: null };
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? null;
  const os = OPERATING_SYSTEMS.find(([re]) => re.test(ua))?.[1] ?? null;
  const type: DeviceType = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))
    ? "tablet"
    : /Mobi|iPhone|iPod/.test(ua)
      ? "mobile"
      : browser || os
        ? "desktop"
        : "unknown";
  const summary = browser && os ? `${browser} on ${os}` : (browser ?? os ?? "Unknown device");
  return { browser, os, type, summary };
}
