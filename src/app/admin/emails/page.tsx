"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, CheckCircle2, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { useNavigationGuard } from "@/lib/navigation-guard";
import { cn } from "@/lib/utils";
import { MAGAZZINI } from "@/types";
import AdminBreadcrumb from "../AdminBreadcrumb";

type BranchConfig = Record<string, { emailTo: string; emailCc: string }>;
type EmailField = "emailTo" | "emailCc";

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Primo indirizzo non valido di un elenco separato da virgole (stessa regola dell'API). */
function findInvalidEmail(value: string): string | null {
  for (const part of value.split(",")) {
    const email = part.trim();
    if (email && !EMAIL_RE.test(email)) return email;
  }
  return null;
}

/** Configurazione confrontabile: solo i valori che l'API salva (spazi esterni rimossi). */
function serializeConfig(config: BranchConfig): string {
  return JSON.stringify(MAGAZZINI.map((m) => [config[m]?.emailTo?.trim() ?? "", config[m]?.emailCc?.trim() ?? ""]));
}

/** Margini di scorrimento: un campo raggiunto col fuoco (Tab, tastiera) non finisce sotto la barra superiore o quella di salvataggio. */
const FIELD_CLASS =
  "text-sm bg-background scroll-mt-[calc(var(--app-header-h)+1rem)] scroll-mb-[calc(var(--app-tabbar-h)+5.75rem)] lg:scroll-mb-24";

function fieldId(magazzino: string, field: EmailField) {
  return `${field === "emailTo" ? "to" : "cc"}-${magazzino}`;
}

function errorKey(magazzino: string, field: EmailField) {
  return `${magazzino}|${field}`;
}

export default function EmailsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [config, setConfig] = useState<BranchConfig>({});
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const setNavigationGuard = useNavigationGuard((s) => s.setGuard);
  const saveBarRef = useRef<HTMLDivElement>(null);

  const dirty = savedSnapshot !== null && serializeConfig(config) !== savedSnapshot;

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "admin")) router.replace("/");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!authLoading && user?.role === "admin") {
      fetch("/api/branch-emails")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          const loaded: BranchConfig = data?.config ?? {};
          setConfig(loaded);
          setSavedSnapshot(serializeConfig(loaded));
        })
        .finally(() => setLoading(false));
    }
  }, [authLoading, user]);

  // Modifiche non salvate: conferma prima di lasciare la pagina (link della shell, percorso, logout, ricarica/chiusura).
  useEffect(() => {
    if (!dirty) return;
    const guard = () => window.confirm("Gli indirizzi email modificati non sono stati salvati. Uscire senza salvare?");
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    setNavigationGuard(guard);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      if (useNavigationGuard.getState().guard === guard) setNavigationGuard(null);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty, setNavigationGuard]);

  function updateField(magazzino: string, field: EmailField, value: string) {
    setConfig((prev) => ({
      ...prev,
      [magazzino]: { ...(prev[magazzino] ?? { emailTo: "", emailCc: "" }), [field]: value },
    }));
    setSaveError(null);
    setFieldErrors((prev) => {
      if (!prev[errorKey(magazzino, field)]) return prev;
      const next = { ...prev };
      delete next[errorKey(magazzino, field)];
      return next;
    });
  }

  function validateField(value: string): string | null {
    const invalid = findInvalidEmail(value);
    return invalid ? `Indirizzo non valido: ${invalid}` : null;
  }

  function handleBlur(magazzino: string, field: EmailField, value: string) {
    const message = validateField(value);
    if (message) setFieldErrors((prev) => ({ ...prev, [errorKey(magazzino, field)]: message }));
  }

  /**
   * Campo raggiunto col fuoco (Tab) già dentro la finestra ma coperto dalla barra superiore o da quella di salvataggio:
   * il browser non lo sposta perché lo considera visibile, quindi lo scopre qui.
   */
  function keepFieldClear(el: HTMLElement) {
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const minTop = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      const maxBottom = (saveBarRef.current?.getBoundingClientRect().top ?? window.innerHeight) - 12;
      if (rect.top < minTop) window.scrollBy({ top: rect.top - minTop });
      else if (rect.bottom > maxBottom) window.scrollBy({ top: rect.bottom - maxBottom });
    });
  }

  function revealField(magazzino: string, field: EmailField) {
    const el = document.getElementById(fieldId(magazzino, field));
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }

  async function handleSave() {
    setSaveError(null);
    const errors: Record<string, string> = {};
    let firstInvalid: [string, EmailField] | null = null;
    for (const magazzino of MAGAZZINI) {
      for (const field of ["emailTo", "emailCc"] as const) {
        const message = validateField(config[magazzino]?.[field] ?? "");
        if (message) {
          errors[errorKey(magazzino, field)] = message;
          firstInvalid ??= [magazzino, field];
        }
      }
    }
    setFieldErrors(errors);
    if (firstInvalid) {
      setSaveError("Correggi gli indirizzi evidenziati prima di salvare.");
      revealField(...firstInvalid);
      return;
    }

    const toSave: BranchConfig = {};
    for (const magazzino of MAGAZZINI) {
      toSave[magazzino] = {
        emailTo: config[magazzino]?.emailTo?.trim() ?? "",
        emailCc: config[magazzino]?.emailCc?.trim() ?? "",
      };
    }

    setSaving(true);
    try {
      const res = await fetch("/api/branch-emails", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: toSave }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        if (data?.magazzino && (data.field === "emailTo" || data.field === "emailCc")) {
          setFieldErrors({ [errorKey(data.magazzino, data.field)]: data.error ?? "Indirizzo non valido" });
          revealField(data.magazzino, data.field);
        }
        setSaveError(data?.error ?? "Errore nel salvataggio");
        return;
      }
      setConfig(toSave);
      setSavedSnapshot(serializeConfig(toSave));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError("Connessione non disponibile, riprova");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-[calc(100dvh-var(--app-header-h)-var(--app-tabbar-h))] flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento…</p>
      </div>
    );
  }

  const statusText = saveError
    ? saveError
    : saved && !dirty
      ? "Modifiche salvate"
      : dirty
        ? "Modifiche non salvate"
        : "Nessuna modifica da salvare";

  return (
    <div className="min-h-[calc(100dvh-var(--app-header-h)-var(--app-tabbar-h))] bg-background">
      <main className="max-w-4xl mx-auto px-4 sm:px-5 lg:px-10 pt-6 lg:pt-8 pb-6 flex flex-col gap-5">
        <AdminBreadcrumb current="Email" />
        <h1 className="text-[28px] leading-tight font-bold">Email Filiali</h1>

        <p className="text-sm text-muted-foreground -mt-2">
          Configura gli indirizzi email destinatari per ogni filiale. Gli ordini verranno inviati all&apos;email della filiale selezionata.
        </p>

        <div className="flex flex-col gap-4">
          {MAGAZZINI.map((magazzino) => {
            const entry = config[magazzino] ?? { emailTo: "", emailCc: "" };
            const toError = fieldErrors[errorKey(magazzino, "emailTo")];
            const ccError = fieldErrors[errorKey(magazzino, "emailCc")];
            return (
              <div
                key={magazzino}
                className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3"
              >
                <h2 className="font-semibold text-sm flex items-center gap-2">
                  <Warehouse className="h-4 w-4 text-primary" />
                  {magazzino}
                </h2>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={fieldId(magazzino, "emailTo")} className="text-xs font-medium text-muted-foreground">
                    Destinatario (To)
                  </Label>
                  <Input
                    id={fieldId(magazzino, "emailTo")}
                    type="email"
                    autoComplete="off"
                    placeholder="ordini@filiale.it"
                    value={entry.emailTo}
                    onChange={(e) => updateField(magazzino, "emailTo", e.target.value)}
                    onFocus={(e) => keepFieldClear(e.currentTarget)}
                    onBlur={(e) => handleBlur(magazzino, "emailTo", e.target.value)}
                    aria-invalid={toError ? true : undefined}
                    aria-describedby={toError ? `${fieldId(magazzino, "emailTo")}-error` : undefined}
                    className={FIELD_CLASS}
                  />
                  {toError && (
                    <p id={`${fieldId(magazzino, "emailTo")}-error`} className="text-xs text-destructive">{toError}</p>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={fieldId(magazzino, "emailCc")} className="text-xs font-medium text-muted-foreground">
                    Copia conoscenza (CC) — separare più indirizzi con virgola
                  </Label>
                  <Input
                    id={fieldId(magazzino, "emailCc")}
                    type="text"
                    inputMode="email"
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="responsabile@filiale.it, admin@azienda.it"
                    value={entry.emailCc}
                    onChange={(e) => updateField(magazzino, "emailCc", e.target.value)}
                    onFocus={(e) => keepFieldClear(e.currentTarget)}
                    onBlur={(e) => handleBlur(magazzino, "emailCc", e.target.value)}
                    aria-invalid={ccError ? true : undefined}
                    aria-describedby={ccError ? `${fieldId(magazzino, "emailCc")}-error` : undefined}
                    className={FIELD_CLASS}
                  />
                  {ccError && (
                    <p id={`${fieldId(magazzino, "emailCc")}-error`} className="text-xs text-destructive">{ccError}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Barra di salvataggio sempre raggiungibile mentre si modificano le filiali in fondo alla pagina */}
        <div className="sticky bottom-[calc(var(--app-tabbar-h)+0.75rem)] z-10 lg:bottom-4">
          <div ref={saveBarRef} className="flex items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 pl-4 shadow-lg backdrop-blur-md">
            <p
              role="status"
              className={cn(
                "min-w-0 flex-1 text-sm",
                saveError
                  ? "font-medium text-destructive"
                  : saved && !dirty
                    ? "font-medium text-emerald-700 dark:text-emerald-300"
                    : dirty
                      ? "font-medium text-amber-700 dark:text-amber-300"
                      : "text-muted-foreground"
              )}
            >
              {statusText}
            </p>
            <Button onClick={handleSave} disabled={saving || !dirty} className="shrink-0">
              {saving ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Salvataggio…</>
              ) : saved && !dirty ? (
                <><CheckCircle2 className="h-4 w-4" /> Salvato</>
              ) : (
                <><Save className="h-4 w-4" /> Salva</>
              )}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
