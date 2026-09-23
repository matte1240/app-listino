"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { ClipboardList, FileText, LayoutList, LogOut, Plus, Shield, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import PushToggle from "@/components/PushToggle";
import { useOrderStore } from "@/lib/useOrderStore";
import { useQuotationStore } from "@/lib/useQuotationStore";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  adminOnly: boolean;
}

const navItems: NavItem[] = [
  { href: "/orders", label: "Ordini", icon: ClipboardList, adminOnly: false },
  { href: "/quotations", label: "Preventivi", icon: FileText, adminOnly: false },
  { href: "/", label: "Listino", icon: LayoutList, adminOnly: false },
  { href: "/admin", label: "Admin", icon: Shield, adminOnly: true },
];

function getUserInitials(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return "U";
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "U";
  if (tokens.length === 1) return tokens[0].substring(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[1][0]).toUpperCase();
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function CountBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-yellow px-1.5 text-[11px] font-extrabold text-primary",
        className
      )}
      title={`${count} in attesa di approvazione`}
    >
      {count}
    </span>
  );
}

function Wordmark({ className, priority = false }: { className?: string; priority?: boolean }) {
  return (
    <Image
      src="/brand/ivicolors-dark.svg"
      alt="IVI Colors"
      width={257}
      height={52}
      className={cn("w-auto", className)}
      priority={priority}
      unoptimized
    />
  );
}

/**
 * Struttura dell'app: sidebar su desktop, barra superiore + tab bar in basso su mobile,
 * barra dedicata (senza navigazione) durante i wizard di ordini e preventivi.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const orderInfo = useOrderStore((s) => s.orderInfo);
  const setExitDialogOpen = useOrderStore((s) => s.setExitDialogOpen);
  const quotationInfo = useQuotationStore((s) => s.quotationInfo);
  const resetQuotation = useQuotationStore((s) => s.resetQuotation);

  // Conteggio documenti in attesa di approvazione (solo admin): al mount, ad ogni cambio pagina, ogni 60 s e al focus.
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const isAdmin = user?.role === "admin";
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const load = () => {
      fetch("/api/admin/approvals?count=1", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled && typeof data?.count === "number") setPendingApprovals(data.count);
        })
        .catch(() => {});
    };
    load();
    const timer = window.setInterval(load, 60_000);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [isAdmin, pathname]);

  const showChrome = !!user && pathname !== "/login";

  // Wizard immersivo: niente navigazione, solo contesto e uscita.
  const isNewOrder = pathname === "/orders/new";
  const editMatch = pathname.match(/^\/orders\/(\d+)\/edit$/);
  const editOrderId = editMatch ? editMatch[1] : null;
  const isNewQuotation = pathname === "/quotations/new";
  const editQuotationMatch = pathname.match(/^\/quotations\/(\d+)\/edit$/);
  const editQuotationId = editQuotationMatch ? editQuotationMatch[1] : null;
  const isQuotationWizardMode = isNewQuotation || !!editQuotationId;
  const isWizardMode = isNewOrder || !!editOrderId || isQuotationWizardMode;
  const activeCustomer = isQuotationWizardMode ? quotationInfo.cliente : orderInfo.cliente;

  const showWizardBar = showChrome && isWizardMode;
  const showNavigation = showChrome && !isWizardMode;

  const items = navItems.filter((item) => !item.adminOnly || isAdmin);
  const userDisplayName = user ? user.fullName || user.username : "";
  const userInitials = getUserInitials(userDisplayName);
  const roleLabel = isAdmin ? "Amministratore" : "Agente";

  const wizardTitle = editOrderId
    ? `Modifica ordine #${editOrderId}`
    : editQuotationId
      ? `Modifica preventivo #${editQuotationId}`
      : isNewQuotation
        ? "Nuovo preventivo"
        : "Nuovo ordine";

  const handleWizardExit = () => {
    if (isQuotationWizardMode) {
      resetQuotation();
      router.push("/quotations");
      return;
    }
    setExitDialogOpen(true);
  };

  return (
    <>
      {showWizardBar && (
        <header className="no-print sticky top-0 z-40 h-14 border-b border-border bg-card">
          <div className="flex h-full items-center gap-3 px-3 sm:px-5">
            <Image
              src="/IVICOLORS_marchio.png"
              alt=""
              width={408}
              height={536}
              className="hidden h-8 w-auto sm:block"
              priority
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold leading-tight text-foreground">{wizardTitle}</p>
              {activeCustomer && (
                <p className="truncate text-xs font-medium text-muted-foreground">{activeCustomer}</p>
              )}
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleWizardExit}>
              <X className="h-4 w-4" />
              <span className="hidden sm:inline">Esci</span>
              <span className="sr-only sm:hidden">Esci</span>
            </Button>
          </div>
        </header>
      )}

      {showNavigation && (
        <>
          {/* Desktop: sidebar */}
          <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-64 flex-col gap-6 border-r border-border bg-sidebar px-4 pt-6 pb-5 lg:flex">
            <Link href="/orders" className="self-start px-2.5">
              <Wordmark className="h-[26px]" priority />
            </Link>
            <Button asChild size="lg" className="w-full">
              <Link href="/orders/new">
                <Plus className="size-5" />
                Nuovo ordine
              </Link>
            </Button>
            <nav aria-label="Navigazione principale" className="flex flex-col gap-1">
              {items.map(({ href, label, icon: Icon }) => {
                const active = isActivePath(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
                      active
                        ? "bg-accent font-bold text-primary"
                        : "font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                    {href === "/admin" && pendingApprovals > 0 && <CountBadge count={pendingApprovals} className="ml-auto" />}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-auto flex flex-col gap-2">
              <PushToggle className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60" />
              <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 py-2 pr-1.5 pl-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {userInitials}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{userDisplayName}</p>
                  <p className="text-xs text-muted-foreground">{roleLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  aria-label="Esci"
                  title="Esci"
                  className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </aside>

          {/* Mobile: barra superiore */}
          <header className="no-print sticky top-0 z-40 h-14 border-b border-border bg-card lg:hidden">
            <div className="flex h-full items-center justify-between pr-1.5 pl-4">
              <Link href="/orders" className="flex items-center">
                <Wordmark className="h-[22px]" priority />
              </Link>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsUserMenuOpen((open) => !open)}
                  className="flex size-11 items-center justify-center rounded-full"
                  aria-expanded={isUserMenuOpen}
                  aria-label={`Menu utente ${userDisplayName}`}
                  title={userDisplayName}
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-accent text-xs font-bold text-primary">
                    {userInitials}
                  </span>
                </button>
                {isUserMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsUserMenuOpen(false)} />
                    <div className="absolute top-12 right-1 z-50 w-60 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-border bg-popover shadow-panel">
                      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                          {userInitials}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-foreground">{userDisplayName}</p>
                          <p className="text-xs text-muted-foreground">{roleLabel}</p>
                        </div>
                      </div>
                      <PushToggle
                        className="flex h-12 w-full items-center gap-3 border-b border-border px-4 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                        onDone={() => setIsUserMenuOpen(false)}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          logout();
                        }}
                        className="flex h-12 w-full items-center gap-3 px-4 text-sm font-semibold text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <LogOut className="h-4 w-4" />
                        Esci
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>
        </>
      )}

      <div
        className={cn(
          showNavigation && "pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-64 print:p-0"
        )}
      >
        {children}
      </div>

      {showNavigation && (
        <nav
          aria-label="Navigazione principale"
          className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
        >
          <div
            className="mx-auto grid h-[4.5rem] max-w-md px-2"
            style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
          >
            {items.map(({ href, label, icon: Icon }) => {
              const active = isActivePath(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 text-xs transition-colors",
                    active ? "font-bold text-primary" : "font-semibold text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "relative flex h-8 w-14 items-center justify-center rounded-full transition-colors",
                      active && "bg-accent"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {href === "/admin" && pendingApprovals > 0 && (
                      <CountBadge count={pendingApprovals} className="absolute -top-1 right-1.5 border-2 border-card" />
                    )}
                  </span>
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
