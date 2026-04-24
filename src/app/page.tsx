"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import { useOrderStore } from "@/lib/useOrderStore";
import { useAuth } from "@/lib/auth-context";
import { MAGAZZINI, type Anagrafica, type Order, type Material } from "@/types";
import {
  Search,
  Home as HomeIcon,
  FileText,
  Clock,
  Users,
  MapPin,
  Plus,
  Minus,
  Trash2,
  Send,
  Check,
  ChevronRight,
  ChevronDown,
  PackageSearch,
  Loader2,
  Shield,
  Sparkles,
  Mail,
  FileSpreadsheet,
  Bot,
} from "lucide-react";
import UploadExcel from "@/components/UploadExcel";
import UploadAnagrafiche from "@/components/UploadAnagrafiche";

type Screen = "clientPicker" | "catalog" | "order" | "confirm" | "history" | "admin";

// ─────────────────────────────────────────────────
// CLIENT BANNER
// ─────────────────────────────────────────────────
function ClientBanner({ onChangeClient }: { onChangeClient: () => void }) {
  const orderInfo = useOrderStore((s) => s.orderInfo);
  return (
    <div className="bg-ivi-navy-dim px-4 py-2 flex items-center gap-2.5">
      <div className="w-[30px] h-[30px] rounded-lg bg-white/10 flex items-center justify-center shrink-0">
        <Users className="h-[15px] w-[15px] text-white/70" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-white truncate">{orderInfo.cliente}</div>
        <div className="text-[10px] text-white/45">Ordine in corso</div>
      </div>
      <button
        onClick={onChangeClient}
        className="border-none bg-white/10 rounded-md text-[10px] font-semibold text-white/70 px-2 py-1 cursor-pointer"
      >
        Cambia
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────
// BOTTOM NAV
// ─────────────────────────────────────────────────
function BottomNav({
  screen,
  setScreen,
  isAdmin,
}: {
  screen: Screen;
  setScreen: (s: Screen) => void;
  isAdmin: boolean;
}) {
  const orderItems = useOrderStore((s) => s.orderItems);
  const lineCount = Object.values(orderItems).filter((i) => i.flagged && i.qty > 0).length;

  const tabs: { id: Screen; label: string; icon: React.FC<{ className?: string }>; badge?: number }[] = [
    { id: "catalog", label: "Listino", icon: HomeIcon },
    { id: "order", label: "Ordine", icon: FileText, badge: lineCount },
    { id: "history", label: "Storico", icon: Clock },
    ...(isAdmin ? [{ id: "admin" as Screen, label: "Admin", icon: Shield }] : []),
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-ivi-border flex pt-2 pb-5 z-50">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = screen === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setScreen(tab.id)}
            className="flex-1 flex flex-col items-center gap-0.5 border-none bg-transparent cursor-pointer py-0"
          >
            <div className="relative">
              <Icon
                className={`h-[22px] w-[22px] ${active ? "text-ivi-navy" : "text-[#9CA3AF]"}`}
              />
              {(tab.badge ?? 0) > 0 && (
                <div className="absolute -top-1 -right-2 bg-ivi-red text-white rounded-full text-[9px] font-bold min-w-[16px] h-4 flex items-center justify-center px-0.5">
                  {tab.badge}
                </div>
              )}
            </div>
            <span
              className={`text-[10px] ${active ? "font-bold text-ivi-navy" : "font-normal text-[#9CA3AF]"}`}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────
// CLIENT ROW
// ─────────────────────────────────────────────────
function ClientRow({
  client,
  onSelect,
}: {
  client: Anagrafica;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full bg-white border border-ivi-border rounded-xl p-3.5 flex items-center gap-3 cursor-pointer text-left"
    >
      <div className="w-9 h-9 rounded-[9px] bg-ivi-navy/8 flex items-center justify-center shrink-0">
        <Users className="h-4 w-4 text-ivi-navy" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-ivi-text truncate">
          {client.ragioneSociale}
        </div>
        <div className="text-[11px] text-ivi-muted mt-0.5">
          {client.capCitta || client.indirizzo || client.partitaIva}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-ivi-muted shrink-0" />
    </button>
  );
}

// ─────────────────────────────────────────────────
// CLIENT PICKER SCREEN
// ─────────────────────────────────────────────────
function ClientPickerScreen({
  onSelect,
  recentIds,
}: {
  onSelect: (c: Anagrafica) => void;
  recentIds: number[];
}) {
  const [search, setSearch] = useState("");
  const [allClients, setAllClients] = useState<Anagrafica[]>([]);
  const [searchResults, setSearchResults] = useState<Anagrafica[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetch("/api/anagrafiche?limit=20")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.anagrafiche) setAllClients(data.anagrafiche);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    const tid = setTimeout(() => {
      fetch(`/api/anagrafiche?q=${encodeURIComponent(q)}&limit=20`, {
        signal: ctrl.signal,
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          setSearchResults(Array.isArray(data?.anagrafiche) ? data.anagrafiche : []);
        })
        .catch(() => {})
        .finally(() => setSearching(false));
    }, 220);
    return () => {
      ctrl.abort();
      clearTimeout(tid);
    };
  }, [search]);

  const recent = useMemo(
    () => allClients.filter((c) => recentIds.includes(c.id)),
    [allClients, recentIds]
  );

  const displayed =
    search.length >= 2 ? searchResults : allClients;

  return (
    <div className="h-full flex flex-col bg-ivi-bg">
      {/* Header */}
      <div className="bg-ivi-navy px-4 pt-5 pb-4 shrink-0">
        <div className="text-lg font-bold text-white mb-1">Seleziona cliente</div>
        <div className="text-xs text-white/50 mb-3.5">
          Per conto di chi stai effettuando l&apos;ordine?
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[15px] w-[15px] text-white/50" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca cliente o ragione sociale…"
            className="w-full pl-9 pr-3 py-[11px] border border-white/20 rounded-xl text-sm text-white placeholder:text-white/40 outline-none"
            style={{ background: "rgba(255,255,255,0.12)", fontSize: 16 }}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-4 pb-6 flex flex-col gap-5">
        {searching && (
          <div className="flex items-center justify-center py-6 gap-2 text-ivi-muted text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Ricerca…
          </div>
        )}

        {!searching && search.length === 0 && recent.length > 0 && (
          <div>
            <div className="text-[11px] font-bold text-ivi-muted uppercase tracking-wider mb-2.5">
              Recenti
            </div>
            <div className="flex flex-col gap-1.5">
              {recent.map((c) => (
                <ClientRow key={c.id} client={c} onSelect={() => onSelect(c)} />
              ))}
            </div>
          </div>
        )}

        {!searching && (
          <div>
            {search.length === 0 && (
              <div className="text-[11px] font-bold text-ivi-muted uppercase tracking-wider mb-2.5">
                Tutti i clienti
              </div>
            )}
            {displayed.length === 0 && search.length >= 2 ? (
              <div className="text-center py-10 text-ivi-muted text-sm font-medium">
                Nessun cliente trovato
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {displayed.map((c) => (
                  <ClientRow key={c.id} client={c} onSelect={() => onSelect(c)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// PRODUCT ROW
// ─────────────────────────────────────────────────
function ProductRow({
  product,
  qty,
  setQty,
  showOriginalDesc,
}: {
  product: Material;
  qty: number;
  setQty: (code: string, qty: number) => void;
  showOriginalDesc: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const showStepper = qty > 0 || focused;

  return (
    <div
      className={`flex items-center gap-2.5 px-4 py-3 border-b border-ivi-border transition-colors ${
        qty > 0 ? "bg-[#EEF3FB]" : "bg-white"
      }`}
    >
      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] font-bold text-ivi-muted tracking-[0.05em]">
            {product.codice}
          </span>
          {qty > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-ivi-navy inline-block" />
          )}
        </div>
        <div className="text-[13px] font-semibold text-ivi-text truncate">
          {showOriginalDesc ? product.descrizione : (product.descrizioneAI || product.descrizione)}
        </div>
        <div className="text-[11px] text-ivi-muted mt-0.5">
          €{product.prezzoListino.toFixed(3)} / {product.um}
        </div>
      </div>

      {/* Qty stepper */}
      <div className="flex items-center gap-1.5 shrink-0">
        {showStepper ? (
          <>
            <button
              onClick={() => setQty(product.codice, qty - 1)}
              className="w-7 h-7 rounded-lg border border-ivi-border bg-ivi-bg flex items-center justify-center cursor-pointer"
            >
              <Minus className="h-3 w-3 text-ivi-navy" />
            </button>
            <input
              type="number"
              value={qty || ""}
              onChange={(e) => setQty(product.codice, parseInt(e.target.value) || 0)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className="w-11 text-center font-bold text-ivi-navy border-[1.5px] border-ivi-navy rounded-lg py-1 bg-white outline-none"
              style={{ fontSize: 15, WebkitAppearance: "none", MozAppearance: "textfield" }}
            />
            <button
              onClick={() => setQty(product.codice, qty + 1)}
              className="w-7 h-7 rounded-lg border border-ivi-navy bg-ivi-navy flex items-center justify-center cursor-pointer"
            >
              <Plus className="h-3 w-3 text-white" />
            </button>
          </>
        ) : (
          <button
            onClick={() => { setFocused(true); setQty(product.codice, 1); }}
            className="h-8 px-3 rounded-lg border border-ivi-border bg-ivi-bg text-xs font-semibold text-ivi-muted cursor-pointer flex items-center gap-1"
          >
            <Plus className="h-3 w-3" />
            Aggiungi
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// CATALOG SCREEN
// ─────────────────────────────────────────────────
function CatalogScreen({
  onChangeClient,
}: {
  onChangeClient: () => void;
}) {
  const materials = useOrderStore((s) => s.materials);
  const orderItems = useOrderStore((s) => s.orderItems);
  const setQty = useOrderStore((s) => s.setQty);
  const setMaterials = useOrderStore((s) => s.setMaterials);
  const showOriginalDesc = useOrderStore((s) => s.showOriginalDesc);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("Tutti");

  useEffect(() => {
    if (materials.length > 0) return;
    fetch("/api/materials")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.materials?.length) setMaterials(data.materials);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = useMemo(() => {
    const cats = [...new Set(materials.map((m) => m.categoria).filter(Boolean))];
    return ["Tutti", ...cats];
  }, [materials]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return materials.filter((m) => {
      if (m.obsoleto) return false;
      const matchCat = activeCat === "Tutti" || m.categoria === activeCat;
      const matchSearch =
        !q ||
        m.codice.toLowerCase().includes(q) ||
        m.descrizione.toLowerCase().includes(q) ||
        (m.descrizioneAI ?? "").toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [materials, search, activeCat]);

  if (materials.length === 0) {
    return (
      <div className="h-full flex flex-col bg-ivi-bg">
        <div className="bg-ivi-navy shrink-0">
          <ClientBanner onChangeClient={onChangeClient} />
          <div className="px-4 py-3">
            <div className="text-lg font-bold text-white">Listino</div>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center pb-24">
          <div className="w-14 h-14 rounded-2xl bg-ivi-border flex items-center justify-center">
            <PackageSearch className="h-6 w-6 text-ivi-muted" />
          </div>
          <div>
            <p className="font-semibold text-ivi-text">Nessun listino caricato</p>
            <p className="text-sm text-ivi-muted mt-1">
              Usa il pulsante in alto a destra per importare il listino Excel
            </p>
          </div>
          {isAdmin && (
            <div className="mt-2">
              <UploadExcel />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-ivi-bg">
      {/* Header */}
      <div className="bg-ivi-navy shrink-0">
        <ClientBanner onChangeClient={onChangeClient} />
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[15px] w-[15px] text-white/50" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca prodotto o codice…"
              className="w-full pl-9 pr-3 py-[11px] border border-white/20 rounded-xl text-sm text-white placeholder:text-white/40 outline-none"
              style={{ background: "rgba(255,255,255,0.12)", fontSize: 16 }}
            />
          </div>
        </div>
      </div>

      {/* Category pills */}
      <div className="bg-white border-b border-ivi-border shrink-0">
        <div
          className="flex gap-1.5 px-4 py-2.5 overflow-x-auto"
          style={{ scrollbarWidth: "none" }}
        >
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCat(cat)}
              className={`px-3 py-1 rounded-full border-none cursor-pointer text-xs shrink-0 whitespace-nowrap transition-colors ${
                activeCat === cat
                  ? "bg-ivi-navy text-white font-bold"
                  : "bg-ivi-bg text-ivi-muted font-normal"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Product rows */}
      <div className="flex-1 overflow-auto pb-20">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-ivi-muted text-sm font-medium">
            Nessun prodotto trovato
          </div>
        ) : (
          filtered.map((product) => (
            <ProductRow
              key={product.codice}
              product={product}
              qty={orderItems[product.codice]?.qty ?? 0}
              setQty={setQty}
              showOriginalDesc={showOriginalDesc}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// ORDER SCREEN
// ─────────────────────────────────────────────────
function OrderScreen({
  onChangeClient,
  setScreen,
}: {
  onChangeClient: () => void;
  setScreen: (s: Screen) => void;
}) {
  const materials = useOrderStore((s) => s.materials);
  const orderItems = useOrderStore((s) => s.orderItems);
  const orderInfo = useOrderStore((s) => s.orderInfo);
  const setQty = useOrderStore((s) => s.setQty);
  const setOrderInfo = useOrderStore((s) => s.setOrderInfo);
  const resetOrder = useOrderStore((s) => s.resetOrder);

  const [saving, setSaving] = useState(false);
  const [showBranchPicker, setShowBranchPicker] = useState(false);

  const lines = useMemo(
    () =>
      materials
        .filter((m) => orderItems[m.codice]?.flagged && (orderItems[m.codice]?.qty ?? 0) > 0)
        .map((m) => ({ material: m, qty: orderItems[m.codice].qty })),
    [materials, orderItems]
  );

  const total = lines.reduce(
    (s, l) => s + l.material.prezzoListino * l.qty,
    0
  );

  async function handleSend() {
    if (!orderInfo.magazzino || lines.length === 0) return;
    setSaving(true);
    try {
      const items = lines.map((l) => ({
        codice: l.material.codice,
        descrizione: l.material.descrizioneAI || l.material.descrizione,
        qty: l.qty,
        um: l.material.um,
        prezzoListino: l.material.prezzoListino,
      }));
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...orderInfo, items }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Errore salvataggio");
      }
      setScreen("confirm");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  }

  if (lines.length === 0) {
    return (
      <div className="h-full flex flex-col bg-ivi-bg">
        <div className="bg-ivi-navy shrink-0">
          <ClientBanner onChangeClient={onChangeClient} />
          <div className="px-4 py-3.5">
            <div className="text-lg font-bold text-white">Ordine in corso</div>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-2.5 p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-ivi-border flex items-center justify-center">
            <FileText className="h-6 w-6 text-ivi-muted" />
          </div>
          <div className="text-[15px] font-semibold text-ivi-muted">
            Nessuna riga inserita
          </div>
          <div className="text-[13px] text-ivi-muted text-center leading-relaxed">
            Vai al listino e seleziona i prodotti da ordinare
          </div>
          <button
            onClick={() => setScreen("catalog")}
            className="mt-2 px-6 py-3 bg-ivi-navy text-white rounded-xl text-sm font-semibold border-none cursor-pointer"
          >
            Vai al listino
          </button>
        </div>
        <div className="h-20" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-ivi-bg">
      {/* Header */}
      <div className="bg-ivi-navy shrink-0">
        <ClientBanner onChangeClient={onChangeClient} />
        <div className="px-4 py-3 flex justify-between items-end">
          <div>
            <div className="text-lg font-bold text-white">Ordine in corso</div>
            <div className="text-[11px] text-white/50 mt-0.5">
              {lines.length} {lines.length === 1 ? "riga" : "righe"} · €
              {total.toFixed(2)} tot.
            </div>
          </div>
          <button
            onClick={() => resetOrder()}
            className="border-none bg-white/10 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white/60 cursor-pointer"
          >
            Cancella tutto
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto pb-36">
        {/* Order lines */}
        <div className="p-4 flex flex-col gap-2">
          {lines.map(({ material: m, qty }) => (
            <div
              key={m.codice}
              className="bg-white rounded-xl p-3.5 border border-ivi-border"
            >
              <div className="flex items-start gap-2.5 mb-2.5">
                <div className="flex-1">
                  <span className="text-[10px] font-bold text-ivi-muted tracking-[0.05em]">
                    {m.codice}
                  </span>
                  <div className="text-[13px] font-semibold text-ivi-text mt-0.5">
                    {m.descrizioneAI || m.descrizione}
                  </div>
                  <div className="text-[11px] text-ivi-muted mt-0.5">
                    €{m.prezzoListino.toFixed(3)} / {m.um}
                  </div>
                </div>
                <button
                  onClick={() => setQty(m.codice, 0)}
                  className="border-none bg-transparent cursor-pointer p-0.5 opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5 text-ivi-red" />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setQty(m.codice, qty - 1)}
                    className="w-7 h-7 rounded-lg border border-ivi-border bg-ivi-bg flex items-center justify-center cursor-pointer"
                  >
                    <Minus className="h-3 w-3 text-ivi-navy" />
                  </button>
                  <span className="text-base font-bold text-ivi-navy min-w-7 text-center">
                    {qty}
                  </span>
                  <button
                    onClick={() => setQty(m.codice, qty + 1)}
                    className="w-7 h-7 rounded-lg border border-ivi-navy bg-ivi-navy flex items-center justify-center cursor-pointer"
                  >
                    <Plus className="h-3 w-3 text-white" />
                  </button>
                  <span className="text-[11px] text-ivi-muted">{m.um}</span>
                </div>
                <span className="text-sm font-bold text-ivi-navy">
                  €{(m.prezzoListino * qty).toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Order details */}
        <div className="px-4 flex flex-col gap-2">
          {/* Filiale */}
          <div
            className={`bg-white rounded-xl p-3.5 border ${orderInfo.magazzino ? "border-ivi-navy/30" : "border-ivi-border"}`}
          >
            <div className="text-[11px] font-bold text-ivi-muted uppercase tracking-widest mb-2.5">
              Filiale destinataria *
            </div>
            <button
              onClick={() => setShowBranchPicker((s) => !s)}
              className="w-full flex items-center gap-2.5 border border-ivi-border rounded-[9px] px-3 py-2.5 bg-ivi-bg cursor-pointer text-left"
            >
              <MapPin
                className={`h-[15px] w-[15px] ${orderInfo.magazzino ? "text-ivi-navy" : "text-ivi-muted"}`}
              />
              <span
                className={`flex-1 text-sm ${orderInfo.magazzino ? "text-ivi-text font-semibold" : "text-ivi-muted"}`}
              >
                {orderInfo.magazzino || "Seleziona filiale…"}
              </span>
              <ChevronDown className="h-[15px] w-[15px] text-ivi-muted" />
            </button>
            {showBranchPicker && (
              <div className="mt-2 border border-ivi-border rounded-[9px] overflow-hidden">
                {MAGAZZINI.map((branch) => (
                  <button
                    key={branch}
                    onClick={() => {
                      setOrderInfo({ magazzino: branch });
                      setShowBranchPicker(false);
                    }}
                    className={`w-full px-3 py-2.5 border-none border-b border-ivi-border last:border-b-0 cursor-pointer text-left ${
                      orderInfo.magazzino === branch
                        ? "bg-ivi-navy/5"
                        : "bg-white"
                    }`}
                  >
                    <span className="text-[13px] font-semibold text-ivi-text">
                      {branch}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Commessa / Cantiere */}
          <div className="bg-white rounded-xl p-3.5 border border-ivi-border">
            <div className="text-[11px] font-bold text-ivi-muted uppercase tracking-widest mb-2.5">
              Riferimento commessa / cantiere
            </div>
            <input
              value={orderInfo.luogoConsegna}
              onChange={(e) => setOrderInfo({ luogoConsegna: e.target.value })}
              placeholder="Es. Cantiere Via Roma 12, Treviso"
              className="w-full px-3 py-2.5 border border-ivi-border rounded-[9px] text-sm text-ivi-text bg-ivi-bg outline-none"
              style={{ fontSize: 16 }}
            />
          </div>

          {/* Data consegna */}
          <div className="bg-white rounded-xl p-3.5 border border-ivi-border">
            <div className="text-[11px] font-bold text-ivi-muted uppercase tracking-widest mb-2.5">
              Data consegna richiesta
            </div>
            <input
              type="date"
              value={orderInfo.dataConsegna}
              onChange={(e) => setOrderInfo({ dataConsegna: e.target.value })}
              min={new Date().toISOString().split("T")[0]}
              className="w-full px-3 py-2.5 border border-ivi-border rounded-[9px] text-sm text-ivi-text bg-ivi-bg outline-none"
              style={{ fontSize: 16 }}
            />
          </div>

          {/* Note */}
          <div className="bg-white rounded-xl p-3.5 border border-ivi-border">
            <div className="text-[11px] font-bold text-ivi-muted uppercase tracking-widest mb-2.5">
              Note all&apos;ordine
            </div>
            <textarea
              value={orderInfo.note}
              onChange={(e) => setOrderInfo({ note: e.target.value })}
              placeholder="Istruzioni per la consegna, avvertenze particolari…"
              rows={3}
              className="w-full px-3 py-2.5 border border-ivi-border rounded-[9px] text-sm text-ivi-text bg-ivi-bg outline-none resize-none"
              style={{ fontSize: 16 }}
            />
          </div>

          {/* Total */}
          <div className="bg-ivi-navy rounded-xl px-4 py-3.5 flex justify-between items-center">
            <div>
              <div className="text-xs text-white/55 font-medium">Totale ordine</div>
              <div className="text-[10px] text-white/35 mt-0.5">
                IVA esclusa · {lines.length} righe
              </div>
            </div>
            <div className="text-2xl font-bold text-white">€{total.toFixed(2)}</div>
          </div>
        </div>
      </div>

      {/* Send CTA */}
      <div
        className="px-4 py-3 bg-white border-t border-ivi-border"
        style={{ paddingBottom: "calc(12px + 72px)" }}
      >
        <button
          onClick={handleSend}
          disabled={!orderInfo.magazzino || saving}
          className={`w-full py-4 rounded-[13px] text-[15px] font-bold text-white border-none flex items-center justify-center gap-2 transition-colors ${
            orderInfo.magazzino && !saving
              ? "bg-ivi-red cursor-pointer"
              : "bg-[#CBD5E1] cursor-default"
          }`}
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Invio…
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              {orderInfo.magazzino
                ? `Invia ordine a ${orderInfo.magazzino}`
                : "Seleziona filiale per inviare"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// CONFIRM SCREEN
// ─────────────────────────────────────────────────
function ConfirmScreen({
  onNewOrder,
  onChangeClient,
}: {
  onNewOrder: () => void;
  onChangeClient: () => void;
}) {
  const orderInfo = useOrderStore((s) => s.orderInfo);
  // Snapshot info at mount so it stays visible even after order is reset
  const snapshot = useRef({
    cliente: orderInfo.cliente,
    magazzino: orderInfo.magazzino,
    luogoConsegna: orderInfo.luogoConsegna,
  });
  const orderId = useRef(
    `ORD-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 90).padStart(3, "0")}`
  );
  const today = new Date().toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const { cliente, magazzino, luogoConsegna } = snapshot.current;

  return (
    <div className="h-full overflow-auto bg-ivi-bg pb-8">
      <div className="flex flex-col items-center gap-5 p-5 pt-8">
        <div className="w-[72px] h-[72px] rounded-full bg-ivi-success-bg border-[2.5px] border-ivi-success flex items-center justify-center">
          <Check className="h-8 w-8 text-ivi-success" strokeWidth={2.5} />
        </div>
        <div className="text-center">
          <div className="text-[22px] font-bold text-ivi-text">Ordine inviato</div>
          <div className="text-sm text-ivi-muted mt-1.5 leading-relaxed">
            Trasmesso alla filiale {magazzino}
          </div>
        </div>

        {/* Summary card */}
        <div className="w-full bg-white rounded-2xl border border-ivi-border overflow-hidden">
          <div className="bg-ivi-navy px-4 py-3">
            <div className="text-[11px] text-white/50 uppercase tracking-widest font-bold">
              Conferma ordine
            </div>
            <div className="text-base font-bold text-white mt-0.5">
              {orderId.current}
            </div>
          </div>
          <div className="px-4 py-3.5 flex flex-col gap-0">
            {[
              { label: "Cliente", value: cliente },
              { label: "Filiale", value: magazzino },
              { label: "Commessa", value: luogoConsegna || "—" },
              { label: "Data", value: today },
            ].map((row) => (
              <div
                key={row.label}
                className="flex justify-between items-center py-2.5 border-b border-ivi-border last:border-b-0"
              >
                <span className="text-sm text-ivi-muted">{row.label}</span>
                <span className="text-sm font-semibold text-ivi-text max-w-[60%] text-right">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full flex flex-col gap-2.5">
          <button
            onClick={onNewOrder}
            className="w-full py-3.5 bg-ivi-navy text-white rounded-[13px] text-[15px] font-bold border-none cursor-pointer"
          >
            Nuovo ordine per {cliente}
          </button>
          <button
            onClick={onChangeClient}
            className="w-full py-3.5 bg-ivi-bg text-ivi-navy rounded-[13px] text-[15px] font-semibold border border-ivi-border cursor-pointer"
          >
            Cambia cliente
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// HISTORY SCREEN
// ─────────────────────────────────────────────────
function HistoryScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/orders")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setOrders(data?.orders ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function formatDate(iso: string) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div className="h-full flex flex-col bg-ivi-bg">
      <div className="bg-ivi-navy px-4 pt-5 pb-4 shrink-0">
        <div className="text-lg font-bold text-white">Storico ordini</div>
        <div className="text-xs text-white/50 mt-0.5">I tuoi ultimi ordini inviati</div>
      </div>

      <div className="flex-1 overflow-auto p-4 pb-24 flex flex-col gap-2">
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-ivi-muted text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <div className="w-14 h-14 rounded-2xl bg-ivi-border flex items-center justify-center">
              <Clock className="h-6 w-6 text-ivi-muted" />
            </div>
            <div>
              <p className="font-semibold text-ivi-text">Nessun ordine salvato</p>
              <p className="text-sm text-ivi-muted mt-1">
                Gli ordini inviati appariranno qui
              </p>
            </div>
          </div>
        ) : (
          orders.map((order) => {
            const isOpen = expanded === order.id;
            const total = order.items.reduce(
              (s, i) => s + i.prezzoListino * i.qty,
              0
            );
            return (
              <div
                key={order.id}
                className={`bg-white rounded-xl border overflow-hidden cursor-pointer transition-all ${
                  isOpen ? "border-ivi-navy/40" : "border-ivi-border"
                }`}
                onClick={() => setExpanded(isOpen ? null : order.id)}
              >
                <div className="p-3.5 flex items-center gap-3">
                  <div className="w-[38px] h-[38px] rounded-[9px] bg-ivi-navy/10 flex items-center justify-center shrink-0">
                    <FileText className="h-[17px] w-[17px] text-ivi-navy" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-ivi-text truncate">
                      {order.cliente}
                    </div>
                    <div className="text-[11px] text-ivi-muted mt-0.5">
                      #{order.id} · {formatDate(order.createdAt)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-ivi-navy">
                      €{total.toFixed(2)}
                    </div>
                    <div className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-ivi-success-bg text-ivi-success mt-1 inline-block">
                      Inviato
                    </div>
                  </div>
                </div>
                {isOpen && (
                  <div className="border-t border-ivi-border px-3.5 pb-3.5 pt-3">
                    <div className="flex justify-between text-xs text-ivi-muted mb-1.5">
                      <span>Magazzino</span>
                      <span className="font-semibold text-ivi-text">
                        {order.magazzino}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-ivi-muted mb-1.5">
                      <span>Articoli</span>
                      <span className="font-semibold text-ivi-text">
                        {order.items.length} prodotti
                      </span>
                    </div>
                    {order.luogoConsegna && (
                      <div className="flex justify-between text-xs text-ivi-muted mb-3">
                        <span>Commessa</span>
                        <span className="font-semibold text-ivi-text max-w-[60%] text-right">
                          {order.luogoConsegna}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// ADMIN SCREEN
// ─────────────────────────────────────────────────
function AdminScreen() {
  const showOriginalDesc = useOrderStore((s) => s.showOriginalDesc);
  const toggleShowOriginalDesc = useOrderStore((s) => s.toggleShowOriginalDesc);

  const adminLinks = [
    { href: "/admin/users", label: "Utenti", sub: "Gestione accessi e ruoli", icon: Users },
    { href: "/admin/enrich", label: "Arricchimento AI", sub: "Descrizioni prodotti AI", icon: Sparkles },
    { href: "/admin/emails", label: "Email", sub: "Impostazioni notifiche", icon: Mail },
    { href: "/listino-pdf", label: "Listino PDF", sub: "Visualizza PDF listino", icon: FileSpreadsheet },
  ];

  return (
    <div className="h-full flex flex-col bg-ivi-bg">
      <div className="bg-ivi-navy px-4 pt-5 pb-4 shrink-0">
        <div className="text-lg font-bold text-white">Pannello Admin</div>
        <div className="text-xs text-white/50 mt-0.5">Gestione e configurazione</div>
      </div>

      <div className="flex-1 overflow-auto p-4 pb-24 flex flex-col gap-4">
        {/* Upload section */}
        <div>
          <div className="text-[11px] font-bold text-ivi-muted uppercase tracking-wider mb-2 px-1">
            Importazione dati
          </div>
          <div className="bg-white rounded-xl border border-ivi-border overflow-hidden divide-y divide-ivi-border">
            <div className="p-4 flex flex-col gap-1.5">
              <div className="text-xs text-ivi-muted font-medium">Listino prezzi Excel</div>
              <UploadExcel />
            </div>
            <div className="p-4 flex flex-col gap-1.5">
              <div className="text-xs text-ivi-muted font-medium">Anagrafiche clienti</div>
              <UploadAnagrafiche />
            </div>
          </div>
        </div>

        {/* Admin navigation */}
        <div>
          <div className="text-[11px] font-bold text-ivi-muted uppercase tracking-wider mb-2 px-1">
            Navigazione
          </div>
          <div className="bg-white rounded-xl border border-ivi-border overflow-hidden divide-y divide-ivi-border">
            {adminLinks.map(({ href, label, sub, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-4 py-3 hover:bg-ivi-bg transition-colors"
              >
                <div className="w-9 h-9 rounded-[9px] bg-ivi-navy/8 flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-ivi-navy" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-ivi-text">{label}</div>
                  <div className="text-xs text-ivi-muted">{sub}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-ivi-muted shrink-0" />
              </Link>
            ))}
          </div>
        </div>

        {/* Preferences */}
        <div>
          <div className="text-[11px] font-bold text-ivi-muted uppercase tracking-wider mb-2 px-1">
            Preferenze
          </div>
          <div className="bg-white rounded-xl border border-ivi-border overflow-hidden">
            <button
              onClick={toggleShowOriginalDesc}
              className="w-full flex items-center gap-3 px-4 py-3.5 cursor-pointer text-left"
            >
              <div className="w-9 h-9 rounded-[9px] bg-ivi-navy/8 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-ivi-navy" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-ivi-text">Descrizioni prodotti</div>
                <div className="text-xs text-ivi-muted">
                  {showOriginalDesc ? "Mostrando descrizioni originali" : "Mostrando descrizioni AI"}
                </div>
              </div>
              <div
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                  !showOriginalDesc ? "bg-ivi-navy" : "bg-ivi-border"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    !showOriginalDesc ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────
export default function Home() {
  const { loading: authLoading, user } = useAuth();
  const orderInfo = useOrderStore((s) => s.orderInfo);
  const resetOrder = useOrderStore((s) => s.resetOrder);
  const setOrderInfo = useOrderStore((s) => s.setOrderInfo);
  const isAdmin = user?.role === "admin";

  const [screen, setScreenRaw] = useState<Screen>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("ivi_screen") as Screen) || "catalog";
    }
    return "catalog";
  });
  const [recentClientIds, setRecentClientIds] = useState<number[]>(() => {
    if (typeof window !== "undefined") {
      try {
        return JSON.parse(localStorage.getItem("ivi_recent_clients") || "[]");
      } catch {
        return [];
      }
    }
    return [];
  });

  const hasClient =
    typeof orderInfo.clienteId === "number" && orderInfo.clienteId > 0;

  function setScreen(s: Screen) {
    setScreenRaw(s);
    if (typeof window !== "undefined") localStorage.setItem("ivi_screen", s);
  }

  function handleSelectClient(client: Anagrafica) {
    resetOrder();
    setOrderInfo({
      clienteId: client.id,
      cliente: client.ragioneSociale,
      luogoConsegna: client.sedeLegale || "",
    });
    setRecentClientIds((ids) => {
      const next = [client.id, ...ids.filter((id) => id !== client.id)].slice(0, 3);
      if (typeof window !== "undefined") {
        localStorage.setItem("ivi_recent_clients", JSON.stringify(next));
      }
      return next;
    });
    setScreen("catalog");
  }

  function handleChangeClient() {
    setScreen("clientPicker");
  }

  // "Nuovo ordine per lo stesso cliente": reset items but preserve the client
  function handleNewOrder() {
    const saved = { clienteId: orderInfo.clienteId, cliente: orderInfo.cliente };
    resetOrder();
    setOrderInfo(saved);
    setScreen("catalog");
  }

  // "Cambia cliente": full reset and go back to client picker
  function handleSwitchClient() {
    resetOrder();
    setScreen("clientPicker");
  }

  if (authLoading) {
    return (
      <div className="min-h-dvh flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-ivi-navy" />
      </div>
    );
  }

  const effectiveScreen: Screen =
    !hasClient && screen !== "history" && screen !== "admin" ? "clientPicker" : screen;

  const showBottomNav = effectiveScreen !== "confirm";

  const renderScreen = () => {
    switch (effectiveScreen) {
      case "clientPicker":
        return (
          <ClientPickerScreen
            onSelect={handleSelectClient}
            recentIds={recentClientIds}
          />
        );
      case "catalog":
        return <CatalogScreen onChangeClient={handleChangeClient} />;
      case "order":
        return (
          <OrderScreen onChangeClient={handleChangeClient} setScreen={setScreen} />
        );
      case "confirm":
        return <ConfirmScreen onNewOrder={handleNewOrder} onChangeClient={handleSwitchClient} />;
      case "history":
        return <HistoryScreen />;
      case "admin":
        return <AdminScreen />;
    }
  };

  return (
    <div className="h-dvh flex flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden">{renderScreen()}</div>
      {showBottomNav && (
        <BottomNav screen={effectiveScreen} setScreen={setScreen} isAdmin={isAdmin} />
      )}
    </div>
  );
}
