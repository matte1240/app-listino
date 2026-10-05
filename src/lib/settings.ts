import { getDb } from "@/lib/db";
import { DEFAULT_CODICE_MANUALE, DEFAULT_CODICE_TRASPORTO, type LineCodes } from "@/lib/order-lines";

/** Impostazioni applicative persistite nella tabella `app_settings` (chiave/valore). */

export const SETTING_KEYS = {
  metodoCodiceTrasporto: "metodo_codice_trasporto",
  metodoCodiceManuale: "metodo_codice_manuale",
  followUpEnabled: "preventivi_followup_enabled",
  followUpDays: "preventivi_followup_days",
} as const;

/** Giorni di default dopo cui ricordare al rappresentante un preventivo non trasformato in ordine. */
export const DEFAULT_FOLLOWUP_DAYS = 30;
export const MIN_FOLLOWUP_DAYS = 1;
export const MAX_FOLLOWUP_DAYS = 365;

export interface AppSettings {
  /** Codice articolo Metodo per la riga "Spese di trasporto". */
  metodoCodiceTrasporto: string;
  /** Codice articolo Metodo per le righe inserite manualmente. */
  metodoCodiceManuale: string;
  /** Promemoria di ricontatto per i preventivi attivi non trasformati in ordine. */
  followUpEnabled: boolean;
  /** Giorni dopo l'attivazione del preventivo (e fra un promemoria e l'altro). */
  followUpDays: number;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  metodoCodiceTrasporto: DEFAULT_CODICE_TRASPORTO,
  metodoCodiceManuale: DEFAULT_CODICE_MANUALE,
  followUpEnabled: true,
  followUpDays: DEFAULT_FOLLOWUP_DAYS,
};

export function normalizeFollowUpDays(value: unknown): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_FOLLOWUP_DAYS;
  return Math.min(Math.max(parsed, MIN_FOLLOWUP_DAYS), MAX_FOLLOWUP_DAYS);
}

export function getSetting(key: string, fallback = ""): string {
  const row = getDb().prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string } | undefined;
  const value = row?.value?.trim();
  return value || fallback;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value.trim());
}

export function getAppSettings(): AppSettings {
  // Maiuscolo anche in lettura: valori salvati prima della normalizzazione (es. "manuale-x") erano già mostrati maiuscoli.
  return {
    metodoCodiceTrasporto: getSetting(SETTING_KEYS.metodoCodiceTrasporto, DEFAULT_APP_SETTINGS.metodoCodiceTrasporto).toUpperCase(),
    metodoCodiceManuale: getSetting(SETTING_KEYS.metodoCodiceManuale, DEFAULT_APP_SETTINGS.metodoCodiceManuale).toUpperCase(),
    ...getFollowUpSettings(),
  };
}

/** Configurazione dei promemoria di ricontatto preventivi. */
export function getFollowUpSettings(): Pick<AppSettings, "followUpEnabled" | "followUpDays"> {
  return {
    followUpEnabled: getSetting(SETTING_KEYS.followUpEnabled, "true") !== "false",
    followUpDays: normalizeFollowUpDays(getSetting(SETTING_KEYS.followUpDays, String(DEFAULT_FOLLOWUP_DAYS))),
  };
}

export function saveAppSettings(partial: Partial<AppSettings>): AppSettings {
  const db = getDb();
  db.transaction(() => {
    if (partial.metodoCodiceTrasporto !== undefined) {
      setSetting(SETTING_KEYS.metodoCodiceTrasporto, partial.metodoCodiceTrasporto || DEFAULT_APP_SETTINGS.metodoCodiceTrasporto);
    }
    if (partial.metodoCodiceManuale !== undefined) {
      setSetting(SETTING_KEYS.metodoCodiceManuale, partial.metodoCodiceManuale || DEFAULT_APP_SETTINGS.metodoCodiceManuale);
    }
    if (partial.followUpEnabled !== undefined) {
      setSetting(SETTING_KEYS.followUpEnabled, partial.followUpEnabled ? "true" : "false");
    }
    if (partial.followUpDays !== undefined) {
      setSetting(SETTING_KEYS.followUpDays, String(normalizeFollowUpDays(partial.followUpDays)));
    }
  })();
  return getAppSettings();
}

/** Codici da timbrare sulle righe manuali/trasporto in fase di normalizzazione. */
export function getLineCodes(): LineCodes {
  const settings = getAppSettings();
  return { codiceManuale: settings.metodoCodiceManuale, codiceTrasporto: settings.metodoCodiceTrasporto };
}
