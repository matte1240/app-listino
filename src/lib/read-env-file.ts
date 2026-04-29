import { readFileSync } from "fs";
import { join } from "path";

function parseEnvLine(line: string, targetKey: string): string | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eq = trimmed.indexOf("=");
  if (eq === -1) return null;
  const key = trimmed.slice(0, eq).trim();
  if (key !== targetKey) return null;
  let val = trimmed.slice(eq + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  return val;
}

function readValueFromFile(filePath: string, key: string): string | null {
  try {
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const val = parseEnvLine(line, key);
      if (val !== null) return val;
    }
  } catch {
    // file not found or unreadable
  }
  return null;
}

// Cache across requests — .env doesn't change while server is running
const cache = new Map<string, string>();

export function readEnvValue(key: string): string {
  if (cache.has(key)) return cache.get(key)!;

  // 1. System env var (Docker -e, CI, etc.)
  const sysVal = process.env[key]?.trim();
  if (sysVal) {
    cache.set(key, sysVal);
    return sysVal;
  }

  // 2. .env files on disk (standalone Next.js in production)
  const cwd = process.cwd();
  for (const file of [".env.local", ".env"]) {
    const val = readValueFromFile(join(cwd, file), key);
    if (val) {
      cache.set(key, val);
      return val;
    }
  }

  cache.set(key, "");
  return "";
}
