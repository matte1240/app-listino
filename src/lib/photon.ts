import "server-only";

import { readEnvValue } from "@/lib/read-env-file";
import type { AddressSearchResult, AddressSuggestion } from "@/lib/address-types";

export type { AddressSearchResult, AddressSuggestion };

/**
 * Photon (https://github.com/komoot/photon) — motore di ricerca geografica
 * open source su dati OpenStreetMap, pensato per l'autocompletamento
 * carattere-per-carattere. Sostituisce Google Places API.
 *
 * A differenza di Google, la risposta di autocompletamento contiene già
 * coordinate e indirizzo strutturato: non serve una seconda chiamata
 * "place details" quando l'utente seleziona un suggerimento.
 */

const DEFAULT_BASE_URL = "http://photon:2322";
const REQUEST_TIMEOUT_MS = 4000;
const USER_AGENT = "app-listino/1.0 (+https://github.com/matte1240/app-listino)";
const MAX_CACHE_ENTRIES = 200;
const CACHE_TTL_MS = 10 * 60 * 1000;

interface PhotonProperties {
  osm_id?: number;
  osm_type?: string;
  name?: string;
  housenumber?: string;
  street?: string;
  postcode?: string;
  city?: string;
  district?: string;
  county?: string;
  state?: string;
  country?: string;
  countrycode?: string;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: PhotonProperties;
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

function getBaseUrl(): string {
  return (readEnvValue("PHOTON_BASE_URL") || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function joinParts(parts: Array<string | null | undefined>, separator: string): string {
  return parts.map((p) => p?.trim()).filter((p): p is string => !!p).join(separator);
}

/**
 * Compone l'indirizzo in stile italiano, restando vicino al formato che
 * Google restituiva in precedenza (gli ordini storici a DB usano quel formato).
 */
function formatAddress(props: PhotonProperties): { mainText: string; secondaryText: string } {
  // Per una via il nome utile è `street`; per un POI o una località è `name`.
  const streetLine = joinParts([props.street ?? props.name, props.housenumber], " ");
  const cityLine = joinParts([props.postcode, props.city ?? props.county ?? props.state], " ");

  return {
    mainText: streetLine || props.name?.trim() || "",
    secondaryText: joinParts([cityLine, props.country], ", "),
  };
}

function toSuggestion(feature: PhotonFeature): AddressSuggestion | null {
  const props = feature.properties;
  const coords = feature.geometry?.coordinates;
  if (!props || !coords || coords.length < 2) return null;

  const [lng, lat] = coords;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  const { mainText, secondaryText } = formatAddress(props);
  if (!mainText) return null;

  return {
    id: `${props.osm_type ?? "?"}${props.osm_id ?? `${lat},${lng}`}`,
    description: joinParts([mainText, secondaryText], ", "),
    mainText,
    secondaryText,
    lat,
    lng,
    street: props.street ?? null,
    houseNumber: props.housenumber ?? null,
    postcode: props.postcode ?? null,
    city: props.city ?? props.county ?? null,
    countryCode: props.countrycode ?? null,
  };
}

// Cache in-process condivisa fra le richieste (singleton di modulo, come lib/enrich-state.ts).
interface CacheEntry {
  expiresAt: number;
  results: AddressSuggestion[];
}
const cache = new Map<string, CacheEntry>();

function cacheKey(query: string, limit: number): string {
  return `${limit}:${query.toLocaleLowerCase("it-IT")}`;
}

function readCache(key: string): AddressSuggestion[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.results;
}

function writeCache(key: string, results: AddressSuggestion[]): void {
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, results });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    cache.delete(oldestKey);
  }
}

/**
 * Interroga Photon. Distingue esplicitamente "nessun risultato" (`ok` con array
 * vuoto) da "servizio non raggiungibile" (`unavailable`): il componente client
 * usa questa differenza per decidere se accettare o meno il testo libero.
 */
export async function searchAddresses(
  query: string,
  limit: number
): Promise<AddressSearchResult> {
  const key = cacheKey(query, limit);
  const cached = readCache(key);
  if (cached) return { status: "ok", results: cached };

  const url = new URL(`${getBaseUrl()}/api`);
  url.searchParams.set("q", query);
  url.searchParams.set("lang", "it");
  url.searchParams.set("limit", String(limit));

  let payload: PhotonResponse;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return { status: "unavailable", results: [] };
    payload = (await res.json()) as PhotonResponse;
  } catch {
    // Timeout, DNS, connessione rifiutata, JSON malformato…
    return { status: "unavailable", results: [] };
  }

  const results = (payload.features ?? [])
    .map(toSuggestion)
    .filter((s): s is AddressSuggestion => s !== null)
    // Ridondante con l'estratto Italia, ma rende sicuro il fallback
    // su un'istanza Photon con copertura mondiale.
    .filter((s) => !s.countryCode || s.countryCode.toUpperCase() === "IT");

  writeCache(key, results);
  return { status: "ok", results };
}
