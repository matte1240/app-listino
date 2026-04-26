const SQLITE_UTC_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
const HAS_TIMEZONE_RE = /(Z|[+-]\d{2}:\d{2})$/i;

/**
 * SQLite datetime('now') returns UTC without timezone, for example:
 * 2026-04-26 10:12:30
 *
 * Normalize it to ISO UTC so client-side formatting can correctly
 * convert it to local time.
 */
export function normalizeUtcTimestamp(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return raw;

  if (SQLITE_UTC_DATETIME_RE.test(raw)) {
    return `${raw.replace(" ", "T")}Z`;
  }

  if (raw.includes("T") && !HAS_TIMEZONE_RE.test(raw)) {
    return `${raw}Z`;
  }

  return raw;
}
