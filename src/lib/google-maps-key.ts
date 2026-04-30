import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

const ENV_FILES = [".env.local", ".env"];
const GOOGLE_MAPS_KEY_NAME = "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY";

function parseEnvValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function readKeyFromEnvFile(fileName: string): Promise<string | null> {
  try {
    const filePath = path.join(process.cwd(), fileName);
    const content = await readFile(filePath, "utf8");
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      if (key !== GOOGLE_MAPS_KEY_NAME) continue;

      return parseEnvValue(trimmed.slice(separatorIndex + 1));
    }
  } catch {
    return null;
  }

  return null;
}

export async function getGoogleMapsPublicKey(): Promise<string | null> {
  const runtimeKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (runtimeKey) return runtimeKey;

  for (const envFile of ENV_FILES) {
    const envFileKey = await readKeyFromEnvFile(envFile);
    if (envFileKey) return envFileKey;
  }

  return null;
}
