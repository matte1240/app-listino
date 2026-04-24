"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Plus, Pencil, Trash2, X, Users, Loader2 } from "lucide-react";

interface UserRow {
  id: number;
  username: string;
  role: "admin" | "agente";
  email: string;
  created_at: string;
}

interface UserForm {
  username: string;
  password: string;
  role: "admin" | "agente";
  email: string;
}

const emptyForm: UserForm = { username: "", password: "", role: "agente", email: "" };

const inputClass =
  "w-full h-11 px-3.5 rounded-xl border border-ivi-border bg-ivi-bg text-sm text-ivi-text placeholder:text-ivi-muted/60 outline-none focus:border-ivi-navy focus:bg-white transition-colors";

export default function AdminUsersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

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
    if (!loading && (!user || user.role !== "admin")) { router.push("/"); return; }
    if (loading || user?.role !== "admin") return;
    fetchUsers();
  }, [user, loading, router, fetchUsers]);

  function openCreate() {
    setEditingId(null); setForm(emptyForm); setFormError(""); setShowForm(true);
  }
  function openEdit(u: UserRow) {
    setEditingId(u.id);
    setForm({ username: u.username, password: "", role: u.role, email: u.email });
    setFormError(""); setShowForm(true);
  }
  function closeForm() {
    setShowForm(false); setEditingId(null); setForm(emptyForm); setFormError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(""); setSaving(true);
    if (!editingId && !form.password) {
      setFormError("La password è obbligatoria per un nuovo utente");
      setSaving(false); return;
    }
    const body: Record<string, string> = { username: form.username, role: form.role, email: form.email };
    if (form.password) body.password = form.password;
    const res = await fetch(editingId ? `/api/users/${editingId}` : "/api/users", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) { setFormError(data.error || "Errore nel salvataggio"); setSaving(false); return; }
    setSaving(false); closeForm(); fetchUsers();
  }

  async function handleDelete(u: UserRow) {
    if (!confirm(`Eliminare l'utente "${u.username}"?`)) return;
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    if (res.ok) { fetchUsers(); } else { const d = await res.json(); alert(d.error || "Errore"); }
  }

  if (loading || loadingUsers) {
    return (
      <div className="min-h-dvh bg-ivi-bg flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-ivi-muted" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-ivi-bg">
      <div className="bg-ivi-navy px-4 pt-5 pb-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-lg font-bold text-white">Gestione Utenti</div>
            <div className="text-xs text-white/50 mt-0.5">Accessi e ruoli agenti</div>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-sm font-semibold px-3 py-2 rounded-xl transition-colors border-none cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nuovo utente</span>
          </button>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-5 flex flex-col gap-4">
        {error && <p className="text-sm text-ivi-red">{error}</p>}

        {showForm && (
          <div className="bg-white rounded-xl border border-ivi-border p-4 flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-ivi-text">
                {editingId ? "Modifica utente" : "Nuovo utente"}
              </div>
              <button
                onClick={closeForm}
                className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-ivi-bg border-none cursor-pointer text-ivi-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div>
                <label htmlFor="form-username" className="block text-[11px] font-bold text-ivi-muted tracking-[0.08em] uppercase mb-1.5">
                  Username
                </label>
                <input
                  id="form-username" type="text" required minLength={3}
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                  placeholder="Inserisci username" className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="form-password" className="block text-[11px] font-bold text-ivi-muted tracking-[0.08em] uppercase mb-1.5">
                  Password{editingId ? " (lascia vuoto per non cambiare)" : ""}
                </label>
                <input
                  id="form-password" type="password"
                  required={!editingId} minLength={editingId ? 0 : 6}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder={editingId ? "Nuova password (opzionale)" : "Inserisci password"}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="form-role" className="block text-[11px] font-bold text-ivi-muted tracking-[0.08em] uppercase mb-1.5">
                  Ruolo
                </label>
                <select
                  id="form-role" value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as "admin" | "agente" }))}
                  className={inputClass}
                >
                  <option value="agente">Agente</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label htmlFor="form-email" className="block text-[11px] font-bold text-ivi-muted tracking-[0.08em] uppercase mb-1.5">
                  Email
                </label>
                <input
                  id="form-email" type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@esempio.com" className={inputClass}
                />
              </div>

              {formError && <p className="text-sm text-ivi-red">{formError}</p>}

              <div className="flex gap-2 pt-1">
                <button
                  type="submit" disabled={saving}
                  className="flex items-center gap-1.5 bg-ivi-navy text-white text-sm font-semibold px-4 py-2.5 rounded-xl border-none cursor-pointer disabled:opacity-60 transition-colors"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {saving ? "Salvataggio…" : editingId ? "Salva modifiche" : "Crea utente"}
                </button>
                <button
                  type="button" onClick={closeForm}
                  className="text-sm font-semibold px-4 py-2.5 rounded-xl border border-ivi-border text-ivi-muted bg-white cursor-pointer hover:bg-ivi-bg transition-colors"
                >
                  Annulla
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-3 bg-white border border-ivi-border rounded-xl p-3.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-ivi-text truncate">{u.username}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    u.role === "admin" ? "bg-ivi-navy/10 text-ivi-navy" : "bg-ivi-bg text-ivi-muted"
                  }`}>
                    {u.role}
                  </span>
                </div>
                <p className="text-xs text-ivi-muted mt-0.5">
                  {u.email && <>{u.email} · </>}
                  {new Date(u.created_at + "Z").toLocaleDateString("it-IT")}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => openEdit(u)}
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-ivi-muted hover:text-ivi-navy hover:bg-ivi-bg border-none cursor-pointer transition-colors"
                  aria-label={`Modifica ${u.username}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {u.id !== user?.id && (
                  <button
                    onClick={() => handleDelete(u)}
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-ivi-muted hover:text-ivi-red hover:bg-ivi-red/10 border-none cursor-pointer transition-colors"
                    aria-label={`Elimina ${u.username}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {users.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-ivi-border flex items-center justify-center">
                <Users className="h-6 w-6 text-ivi-muted" />
              </div>
              <p className="text-sm text-ivi-muted">Nessun utente trovato</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
