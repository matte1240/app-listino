"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, X } from "lucide-react";

interface UserRow {
  id: number;
  username: string;
  role: "admin" | "agente";
  email: string;
  created_at: string;
}

interface FormData {
  username: string;
  password: string;
  role: "admin" | "agente";
  email: string;
}

const emptyForm: FormData = { username: "", password: "", role: "agente", email: "" };

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

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setShowForm(true);
  }

  function openEdit(u: UserRow) {
    setEditingId(u.id);
    setForm({ username: u.username, password: "", role: u.role, email: u.email });
    setFormError("");
    setShowForm(true);
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

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
      setFormError(data.error || "Errore nel salvataggio");
      setSaving(false);
      return;
    }

    setSaving(false);
    closeForm();
    fetchUsers();
  }

  async function handleDelete(u: UserRow) {
    if (!confirm(`Sei sicuro di voler eliminare l'utente "${u.username}"?`)) return;

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
      <div className="min-h-dvh flex items-center justify-center">
        <p className="text-muted-foreground">Caricamento...</p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <main className="max-w-2xl mx-auto w-full px-4 pt-5 pb-5 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-base">Gestione Utenti</h1>
          <Button size="sm" onClick={openCreate} className="gap-1.5 h-9 rounded-xl">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nuovo utente</span>
          </Button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* Form overlay */}
        {showForm && (
          <div className="border border-border rounded-xl p-4 bg-card shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">
                {editingId ? "Modifica utente" : "Nuovo utente"}
              </h2>
              <Button variant="ghost" size="icon" onClick={closeForm} className="h-7 w-7">
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
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as "admin" | "agente" }))}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="agente">Agente</option>
                  <option value="admin">Admin</option>
                </select>
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

              {formError && <p className="text-sm text-red-500">{formError}</p>}

              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? "Salvataggio..." : editingId ? "Salva modifiche" : "Crea utente"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={closeForm}>
                  Annulla
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Users list */}
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-3 border border-border rounded-xl p-3 bg-card"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{u.username}</span>
                  <Badge variant={u.role === "admin" ? "default" : "secondary"} className="text-xs">
                    {u.role}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {u.email && <>{u.email} · </>}
                  Creato: {new Date(u.created_at + "Z").toLocaleDateString("it-IT")}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => openEdit(u)}
                  aria-label={`Modifica ${u.username}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {u.id !== user?.id && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 hover:text-red-600"
                    onClick={() => handleDelete(u)}
                    aria-label={`Elimina ${u.username}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {users.length === 0 && !loadingUsers && (
          <p className="text-center text-sm text-muted-foreground py-8">Nessun utente trovato</p>
        )}
      </main>
    </div>
  );
}
