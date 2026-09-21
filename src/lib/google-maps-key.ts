import "server-only";

import { readEnvValue } from "@/lib/read-env-file";

const GOOGLE_MAPS_KEY_NAME = "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY";

export async function getGoogleMapsPublicKey(): Promise<string | null> {
  return readEnvValue(GOOGLE_MAPS_KEY_NAME) || null;
}
