"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { LayoutList, ClipboardList, Menu, X, LogOut, Shield, FileText, FileSpreadsheet, Plus, ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useOrderStore } from "@/lib/useOrderStore";

const navItems = [
  { href: "/", label: "Listino", icon: LayoutList, adminOnly: false },
  { href: "/listino-pdf", label: "Listino PDF", icon: FileSpreadsheet, adminOnly: false },
  { href: "/orders", label: "Ordini", icon: ClipboardList, adminOnly: false },
  { href: "/admin", label: "Admin", icon: Shield, adminOnly: true },
];

function getUserInitials(username: string): string {
  const trimmed = username.trim();
  if (!trimmed) return "U";
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "U";
  if (tokens.length === 1) return tokens[0].substring(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[1][0]).toUpperCase();
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const orderInfo = useOrderStore((s) => s.orderInfo);
  const setExitDialogOpen = useOrderStore((s) => s.setExitDialogOpen);

  if (!user || pathname === "/login") return null;

  // Detect immersive wizard mode
  const isNewOrder = pathname === "/orders/new";
  const editMatch = pathname.match(/^\/orders\/(\d+)\/edit$/);
  const isEditOrder = !!editMatch;
  const editOrderId = editMatch ? editMatch[1] : null;
  const isWizardMode = isNewOrder || isEditOrder;

  const items = navItems.filter((item) => !item.adminOnly || user.role === "admin");

  return (
    <>
      {/* Top bar */}
      <nav className="sticky top-0 z-40 h-14 bg-background/95 backdrop-blur-md border-b border-border flex items-center">
        <div className="w-full px-4 flex items-center justify-between">

          {/* Left section: Logo + hamburger */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Mobile: hamburger (only outside wizard) */}
            {!isWizardMode && (
              <button
                className="md:hidden flex items-center justify-center h-8 w-8 rounded-lg hover:bg-muted transition-colors shrink-0"
                onClick={() => setOpen(true)}
                aria-label="Apri menu"
              >
                <Menu className="h-5 w-5" />
              </button>
            )}

            {/* Logo (outside wizard) */}
            {!isWizardMode && (
              <Link href="/" className="flex items-center shrink-0">
                <Image
                  src="/IVICOLORS_marchio.png"
                  alt="IVI Colors"
                  width={110}
                  height={36}
                  className="h-8 w-auto object-contain dark:hidden"
                  priority
                />
                <Image
                  src="/IVI_white_marchio.png"
                  alt="IVI Colors"
                  width={110}
                  height={36}
                  className="h-8 w-auto object-contain hidden dark:block"
                  priority
                />
              </Link>
            )}

            {/* Wizard mode: context label */}
            {isWizardMode && (
              <div className="flex items-center gap-2 shrink-0">
                <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${isEditOrder ? "bg-amber-500" : "bg-primary"} text-primary-foreground`}>
                  {isEditOrder ? <FileText className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                </div>
                <span className="font-bold text-sm">
                  {isEditOrder ? `Modifica ordine #${editOrderId}` : "Nuovo ordine"}
                </span>
                {orderInfo.cliente && (
                  <span className="hidden sm:inline text-xs text-muted-foreground">— {orderInfo.cliente}</span>
                )}
              </div>
            )}
          </div>

          {/* Center section: nav links (outside wizard) */}
          {!isWizardMode && (
            <div className="hidden md:flex items-center gap-1">
              {items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Right section: tools + badge */}
          <div className="flex items-center gap-2 shrink-0">


            {/* New order button (outside wizard) */}
            {!isWizardMode && (
              <Button
                size="sm"
                className="gap-1.5 h-8 rounded-xl font-semibold"
                onClick={() => router.push("/orders/new")}
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Nuovo ordine</span>
              </Button>
            )}

            {/* Wizard: exit button */}
            {isWizardMode && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-8 rounded-xl font-semibold text-muted-foreground"
                  onClick={() => setExitDialogOpen(true)}
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Esci</span>
              </Button>
            )}

            {/* User badge with dropdown menu */}
            <div className="relative">
              <button
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground font-bold text-xs hover:bg-primary/90 transition-colors"
                aria-expanded={isUserMenuOpen}
                aria-label={`Menu utente ${user.username}`}
                title={user.username}
              >
                {getUserInitials(user.username)}
              </button>
              {isUserMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsUserMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-10 z-50 w-48 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
                    <div className="px-4 py-3 border-b border-border text-sm">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Utente</p>
                      <p className="font-semibold text-foreground">{user.username}</p>
                    </div>
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        logout();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Esci
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile sidebar (outside wizard only) */}
      {!isWizardMode && open && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/40 md:hidden"
            onClick={() => { setOpen(false); setIsUserMenuOpen(false); }}
          />
          <div className="fixed top-0 left-0 z-50 h-full w-60 bg-background border-r border-border shadow-xl md:hidden flex flex-col">
            <div className="flex items-center justify-between px-4 h-14 border-b border-border shrink-0">
              <span className="font-bold text-sm">{user.username}</span>
              <button
                onClick={() => { setOpen(false); setIsUserMenuOpen(false); }}
                className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted"
                aria-label="Chiudi menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-1 p-3 flex-1">
              {items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {label}
                  </Link>
                );
              })}
            </div>
            <div className="p-3 border-t border-border">
              <button
                onClick={() => { setOpen(false); logout(); }}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-5 w-5" />
                Esci
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
