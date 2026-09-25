"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import AdminBreadcrumb from "../AdminBreadcrumb";

interface UserRow {
  id: number;
  username: string;
  fullName: string;
  role: "admin" | "agente";
  email: string;
  created_at: string;
}

interface FormData {
  username: string;
  fullName: string;
  password: string;
  role: "admin" | "agente";
  email: string;
}

const emptyForm: FormData = { username: "", fullName: "", password: "", role: "agente", email: "" };

export default function AdminUsersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState("");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLElement>(null);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    } else {
      setError("Errore nel caricamento utenti");
    }
    setLoadingUsers(false);
  }, []);

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) {
      router.push("/");
      return;
    }
    if (loading || user?.role !== "admin") return;

    let cancelled = false;
    fetch("/api/users").then(async (res) => {
      if (cancelled) return;
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      } else {
        setError("Errore nel caricamento utenti");
      }
      setLoadingUsers(false);
    }).catch(() => {
      if (!cancelled) {
        setError("Errore nel caricamento utenti");
        setLoadingUsers(false);
      }
    });
    return () => { cancelled = true; };
  }, [user, loading, router]);

  /**
   * Il form sta sopra l'elenco: aprendolo da una riga in fondo resterebbe fuori schermo, quindi lo porta in vista.
   * In creazione il fuoco va sul primo campo; in modifica sul riquadro, per non aprire la tastiera su tablet.
   */
  function revealForm(focusFirstField: boolean) {
    requestAnimationFrame(() => {
      const el = formRef.current;
      if (!el) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      (focusFirstField ? document.getElementById("form-username") : el)?.focus({ preventScroll: true });
    });
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setShowForm(true);
    revealForm(true);
  }

  function openEdit(u: UserRow) {
    setEditingId(u.id);
    setForm({ username: u.username, fullName: u.fullName ?? "", password: "", role: u.role, email: u.email });
    setFormError("");
    setShowForm(true);
    revealForm(false);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSaving(true);

    const url = editingId ? `/api/users/${editingId}` : "/api/users";
    const method = editingId ? "PUT" : "POST";

    const body: Record<string, string> = {
      username: form.username,
      fullName: form.fullName,
      role: form.role,
      email: form.email,
    };
    if (form.password) body.password = form.password;
    // For create, password is required
    if (!editingId && !form.password) {
      setFormError("La password è obbligatoria per un nuovo utente");
      setSaving(false);
      return;
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setFormError("Connessione non disponibile, riprova");
      setSaving(false);
      return;
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setFormError(data?.error || "Errore nel salvataggio");
      setSaving(false);
      return;
    }

    setSaving(false);
    closeForm();
    fetchUsers();
  }

  async function handleDelete(u: UserRow) {
    const displayName = u.fullName || u.username;
    if (!confirm(`Sei sicuro di voler eliminare l'utente "${displayName}"?`)) return;

    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    if (res.ok) {
      fetchUsers();
    } else {
      const data = await res.json();
      alert(data.error || "Errore nell'eliminazione");
    }
  }

  if (loading || loadingUsers) {
    return (
      <div className="min-h-[calc(100dvh-var(--app-header-h)-var(--app-tabbar-h))] flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  // Il ruolo non si cambia sul proprio account né sull'ultimo admin rimasto (l'API rifiuta comunque).
  const adminCount = users.filter((u) => u.role === "admin").length;
  const editingUser = editingId !== null ? users.find((u) => u.id === editingId) : undefined;
  const roleLockReason = !editingUser
    ? null
    : editingUser.id === user?.id
      ? "Non puoi cambiare il tuo ruolo."
      : editingUser.role === "admin" && adminCount <= 1
        ? "Deve restare almeno un amministratore."
        : null;

  return (
    <div className="min-h-[calc(100dvh-var(--app-header-h)-var(--app-tabbar-h))] bg-background">
      <main className="max-w-4xl mx-auto w-full px-4 sm:px-5 pt-5 pb-5 space-y-4">
        <AdminBreadcrumb current="Utenti" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-[28px] leading-tight font-bold">Gestione Utenti</h1>
          <Button onClick={openCreate} className="gap-1.5 w-full justify-center sm:w-auto">
            <Plus className="h-4 w-4" />
            Nuovo utente
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Form overlay */}
        {showForm && (
          <section
            ref={formRef}
            tabIndex={-1}
            aria-labelledby="user-form-title"
            className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-4 scroll-mt-[calc(var(--app-header-h)+1rem)] outline-none"
          >
            <div className="flex items-center justify-between">
              <h2 id="user-form-title" className="font-semibold text-sm">
                {editingUser ? `Modifica utente ${editingUser.fullName || editingUser.username}` : editingId ? "Modifica utente" : "Nuovo utente"}
              </h2>
              <Button variant="ghost" size="icon" onClick={closeForm} aria-label="Chiudi" className="-mr-2">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="form-username" className="text-xs">Username</Label>
                <Input
                  id="form-username"
                  required
                  minLength={3}
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="Inserisci username"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="form-full-name" className="text-xs">Nome completo</Label>
                <Input
                  id="form-full-name"
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                  placeholder="Nome e cognome"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="form-password" className="text-xs">
                  Password{editingId ? " (lascia vuoto per non cambiare)" : ""}
                </Label>
                <Input
                  id="form-password"
                  type="password"
                  minLength={editingId ? 0 : 6}
                  required={!editingId}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder={editingId ? "Nuova password (opzionale)" : "Inserisci password"}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="form-role" className="text-xs">Ruolo</Label>
                <select
                  id="form-role"
                  value={form.role}
                  disabled={roleLockReason !== null}
                  aria-describedby={roleLockReason ? "form-role-hint" : undefined}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as "admin" | "agente" }))}
                  className="h-10 w-full rounded-xl border border-input bg-transparent px-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="agente">Agente</option>
                  <option value="admin">Admin</option>
                </select>
                {roleLockReason && (
                  <p id="form-role-hint" className="text-xs text-muted-foreground">{roleLockReason}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="form-email" className="text-xs">Email</Label>
                <Input
                  id="form-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@esempio.com"
                />
              </div>

              {formError && <p className="text-sm text-destructive">{formError}</p>}

              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
                <Button type="submit" disabled={saving} className="w-full justify-center sm:w-auto">
                  {saving ? "Salvataggio..." : editingId ? "Salva modifiche" : "Crea utente"}
                </Button>
                <Button type="button" variant="outline" onClick={closeForm} className="w-full justify-center sm:w-auto">
                  Annulla
                </Button>
              </div>
            </form>
          </section>
        )}

        {/* Users list */}
        <div className="space-y-2">
          {users.map((u) => {
            const displayName = u.fullName || u.username;
            return (
            <div
              key={u.id}
              className={cn(
                "flex flex-col gap-3 rounded-2xl border border-border bg-card shadow-sm p-3 sm:flex-row sm:items-center sm:justify-between",
                showForm && editingId === u.id && "border-primary ring-2 ring-primary/15"
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{displayName}</span>
                  <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">
                    {u.role}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  @{u.username}
                  {u.email && <> · {u.email}</>}
                  {" · "}
                  Creato: {new Date(u.created_at).toLocaleDateString("it-IT")}
                </p>
              </div>
              <div className="flex w-full gap-2 shrink-0 sm:w-auto sm:justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEdit(u)}
                  aria-label={`Modifica ${displayName}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                {u.id !== user?.id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-red-500 hover:text-red-600"
                    onClick={() => handleDelete(u)}
                    aria-label={`Elimina ${displayName}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            );
          })}
        </div>

        {users.length === 0 && !loadingUsers && (
          <p className="text-center text-sm text-muted-foreground py-8">Nessun utente trovato</p>
        )}
      </main>
    </div>
  );
}
