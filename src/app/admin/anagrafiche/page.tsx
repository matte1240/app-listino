"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import UploadAnagrafiche from "@/components/UploadAnagrafiche";
import { useAuth } from "@/lib/auth-context";

interface UserOption {
  id: number;
  username: string;
  fullName: string;
  role: "admin" | "agente";
}

interface RapAssignment {
  rap: number;
  userId: number;
  username: string;
  fullName: string;
}

interface RapAssignmentsResponse {
  assignments: RapAssignment[];
  usedRapNumbers: number[];
}

export default function AdminAnagrafichePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<UserOption[]>([]);
  const [usedRapNumbers, setUsedRapNumbers] = useState<number[]>([]);
  const [assignmentByRap, setAssignmentByRap] = useState<Map<number, number>>(new Map());
  const [savingRap, setSavingRap] = useState<number | null>(null);
  const [rapError, setRapError] = useState("");
  const [rapLoaded, setRapLoaded] = useState(false);

  const loadRapData = useCallback(async () => {
    setRapError("");
    try {
      const [usersRes, assignmentsRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/admin/rap-assignments"),
      ]);

      if (!usersRes.ok) throw new Error("Impossibile caricare gli utenti");
      if (!assignmentsRes.ok) throw new Error("Impossibile caricare le assegnazioni");

      const usersData = (await usersRes.json()) as { users: UserOption[] };
      const assignmentsData = (await assignmentsRes.json()) as RapAssignmentsResponse;

      setUsers(usersData.users);
      setUsedRapNumbers(assignmentsData.usedRapNumbers);

      const map = new Map<number, number>();
      for (const a of assignmentsData.assignments) map.set(a.rap, a.userId);
      // Include rap che hanno assegnazione anche se non più presenti in anagrafica
      for (const a of assignmentsData.assignments) {
        if (!assignmentsData.usedRapNumbers.includes(a.rap)) {
          setUsedRapNumbers((prev) => Array.from(new Set([...prev, a.rap])).sort((x, y) => x - y));
        }
      }
      setAssignmentByRap(map);
    } catch (err) {
      setRapError(err instanceof Error ? err.message : "Errore nel caricamento");
    } finally {
      setRapLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) {
      router.replace("/");
      return;
    }
    if (loading || user?.role !== "admin") return;
    loadRapData();
  }, [user, loading, router, loadRapData]);

  async function handleAssign(rap: number, userId: number | null) {
    setSavingRap(rap);
    setRapError("");
    try {
      const res = await fetch("/api/admin/rap-assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rap, userId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Errore salvataggio");
      }
      setAssignmentByRap((prev) => {
        const next = new Map(prev);
        if (userId === null) next.delete(rap);
        else next.set(rap, userId);
        return next;
      });
    } catch (err) {
      setRapError(err instanceof Error ? err.message : "Errore salvataggio");
    } finally {
      setSavingRap(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <main className="max-w-4xl mx-auto px-4 sm:px-5 pt-5 pb-6 flex flex-col gap-5">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground transition-colors">Admin</Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium">Anagrafiche</span>
        </div>

        <div>
          <h1 className="font-bold text-lg">Anagrafiche clienti</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Importa e aggiorna il catalogo clienti da Excel con un layout leggibile anche su mobile.
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-4 flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Carica il file anagrafiche clienti in formato Excel. Le righe esistenti vengono aggiornate
            usando il <strong>Codice</strong> come chiave; gli altri campi (Ragione Sociale, Indirizzo,
            CAP/Città, Partita IVA, Rap) vengono sovrascritti con i valori del file. La colonna{" "}
            <strong>Rap</strong> è opzionale: se assente i valori esistenti non vengono toccati.
          </p>
          <UploadAnagrafiche onUploaded={loadRapData} />
          <p className="text-xs text-muted-foreground">
            Colonne obbligatorie: <strong>Codice</strong> e <strong>Ragione Sociale</strong>.
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-4 flex flex-col gap-3">
          <div>
            <h2 className="font-semibold text-sm">Assegnazione rappresentanti</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Per ogni numero <strong>Rap</strong> presente in anagrafica, scegli l&apos;utente di
              riferimento. L&apos;utente assegnato vedrà e potrà modificare ordini e preventivi di
              tutti i clienti con quel Rap, anche se creati da altri agenti o admin.
            </p>
          </div>

          {rapError && <p className="text-sm text-destructive">{rapError}</p>}

          {!rapLoaded ? (
            <p className="text-sm text-muted-foreground">Caricamento...</p>
          ) : usedRapNumbers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessun numero Rap presente in anagrafica. Importa un file Excel con la colonna{" "}
              <strong>Rap</strong> per popolare la lista.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {usedRapNumbers.map((rap) => {
                const currentUserId = assignmentByRap.get(rap) ?? "";
                const isSaving = savingRap === rap;
                return (
                  <div
                    key={rap}
                    className="flex flex-col gap-2 rounded-xl border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="text-sm font-medium">Rap {rap}</div>
                    <div className="flex items-center gap-2">
                      <select
                        value={String(currentUserId)}
                        disabled={isSaving}
                        onChange={(e) => {
                          const val = e.target.value;
                          handleAssign(rap, val === "" ? null : Number(val));
                        }}
                        className="h-9 w-full sm:w-64 rounded-xl border border-input bg-transparent px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        <option value="">— Non assegnato —</option>
                        {users.map((u) => (
                          <option key={u.id} value={String(u.id)}>
                            {u.fullName || u.username} ({u.role})
                          </option>
                        ))}
                      </select>
                      {isSaving && (
                        <span className="text-xs text-muted-foreground">Salvataggio…</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
