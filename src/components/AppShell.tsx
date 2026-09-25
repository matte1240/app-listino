"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentProps, type ComponentType } from "react";
import { ClipboardList, FileText, FilePlus2, LayoutList, LogOut, Plus, Shield } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { canNavigateTo, LOGOUT_HREF } from "@/lib/navigation-guard";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import PushToggle from "@/components/PushToggle";

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

/** Link della navigazione: durante un wizard con dati non salvati chiede prima conferma di uscita. */
function NavLink({ href, onClick, ...props }: ComponentProps<typeof Link> & { href: string }) {
  return (
    <Link
      href={href}
      onClick={(event) => {
        if (!canNavigateTo(href)) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      {...props}
    />
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
 * Struttura dell'app, uguale in ogni pagina (wizard compresi): sidebar su desktop,
 * barra superiore + tab bar in basso su mobile.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  // Il menu utente si chiude cambiando pagina e passando alla sidebar (es. ruotando il tablet).
  const [menuPathname, setMenuPathname] = useState(pathname);
  if (menuPathname !== pathname) {
    setMenuPathname(pathname);
    setIsUserMenuOpen(false);
  }
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 64rem)");
    const close = () => setIsUserMenuOpen(false);
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, []);

  // Il logout passa dalla guardia dei wizard come i link: con dati non salvati si apre prima la conferma.
  const handleLogout = () => {
    setIsUserMenuOpen(false);
    if (!canNavigateTo(LOGOUT_HREF)) return;
    void logout();
  };

  // Conteggio documenti in attesa di approvazione (solo admin): al mount, ad ogni cambio pagina, ogni 60 s,
  // al focus e quando una pagina segnala una decisione (evento "approvals:changed").
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
    window.addEventListener("approvals:changed", load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
      window.removeEventListener("approvals:changed", load);
    };
  }, [isAdmin, pathname]);

  const showNavigation = !!user && pathname !== "/login";

  const items = navItems.filter((item) => !item.adminOnly || isAdmin);
  const userDisplayName = user ? user.fullName || user.username : "";
  const userInitials = getUserInitials(userDisplayName);
  const roleLabel = isAdmin ? "Amministratore" : "Agente";

  return (
    <>
      {showNavigation && (
        <>
          {/* Desktop: sidebar */}
          <aside className="no-print fixed inset-y-0 left-0 z-40 hidden w-64 flex-col gap-6 border-r border-border bg-sidebar px-4 pt-6 pb-5 lg:flex">
            <NavLink href="/orders" className="self-start px-2.5">
              <Wordmark className="h-[26px]" priority />
            </NavLink>
            <div className="flex flex-col gap-2">
              <Button asChild size="lg" className="w-full">
                <NavLink href="/orders/new">
                  <Plus className="size-5" />
                  Nuovo ordine
                </NavLink>
              </Button>
              <Button asChild variant="outline" className="h-11 w-full">
                <NavLink href="/quotations/new">
                  <FilePlus2 className="size-[18px]" />
                  Nuovo preventivo
                </NavLink>
              </Button>
            </div>
            <nav aria-label="Navigazione principale" className="flex flex-col gap-1">
              {items.map(({ href, label, icon: Icon }) => {
                const active = isActivePath(pathname, href);
                return (
                  <NavLink
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
                  </NavLink>
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
                  onClick={handleLogout}
                  aria-label="Esci"
                  title="Esci"
                  className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </aside>

          {/* Mobile: barra superiore */}
          <header className="no-print sticky top-0 z-40 h-14 border-b border-border bg-card lg:hidden">
            <div className="flex h-full items-center justify-between pr-1.5 pl-4">
              <NavLink href="/orders" className="flex items-center">
                <Wordmark className="h-[22px]" priority />
              </NavLink>
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
                        onClick={handleLogout}
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

      <div className={cn(showNavigation && "pb-[var(--app-tabbar-h)] lg:pl-64 print:p-0")}>
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
                <NavLink
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
                </NavLink>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
