"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Pagina da aprire dopo il login: `?next=` (messo dal proxy) solo se resta su questo sito,
 * altrimenti /orders. Niente "//host" o "/\host", che il browser leggerebbe come un altro dominio.
 */
function getLoginTarget(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next?.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/orders";
  try {
    const url = new URL(next, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname === "/login" || url.pathname.startsWith("/api/")) return "/orders";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/orders";
  }
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { user, login } = useAuth();
  const router = useRouter();

  // Già autenticato (anche subito dopo il login riuscito): si va alla pagina richiesta.
  useEffect(() => {
    if (user) router.replace(getLoginTarget());
  }, [user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    let err: string | null;
    try {
      err = await login(username, password);
    } catch {
      err = "Connessione non disponibile, riprova";
    }
    if (err) {
      setError(err);
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-primary sm:items-center sm:justify-center sm:px-4 sm:py-10">
      {/* Marchio IVI in trasparenza come texture di sfondo */}
      <Image
        src="/IVI_white_marchio.png"
        alt=""
        width={1385}
        height={1821}
        className="pointer-events-none absolute -top-16 -right-36 w-[26rem] max-w-none opacity-[0.08] brightness-0 invert select-none sm:-top-24 sm:-right-24 sm:w-[34rem]"
        priority
      />

      <div className="relative flex w-full flex-1 flex-col sm:max-w-md sm:flex-none">
        <div className="flex flex-col gap-5 px-7 pt-[max(4.5rem,calc(env(safe-area-inset-top)+3rem))] pb-10 sm:px-2 sm:pt-0 sm:pb-8">
          <Image
            src="/brand/ivicolors-white.svg"
            alt="IVI Colors"
            width={257}
            height={52}
            className="h-auto w-52"
            priority
            unoptimized
          />
          <p className="text-xs font-semibold tracking-[0.16em] text-white/80 uppercase">Ordini · Preventivi · Listino</p>
        </div>

        <main className="flex flex-1 flex-col gap-7 rounded-t-[28px] bg-card px-7 pt-9 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_-12px_rgb(8_20_40/0.45)] sm:flex-none sm:rounded-[28px] sm:p-9">
          <div className="flex flex-col gap-2">
            <h1 className="text-[34px] leading-[1.05] font-bold text-foreground">Accesso</h1>
            <p className="text-[15px] text-muted-foreground">Accedi per ordinare materiali</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="username" className="text-[13px] font-semibold text-foreground/80">Username</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Inserisci username"
                className="h-12"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password" className="text-[13px] font-semibold text-foreground/80">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Inserisci password"
                  className="h-12 pr-12"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Nascondi password" : "Mostra password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute top-0.5 right-0.5 flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive">{error}</p>
            )}

            <Button type="submit" size="lg" className="mt-2 h-[54px] w-full text-base" disabled={submitting}>
              {submitting ? "Accesso..." : "Accedi"}
              {!submitting && <ArrowRight className="h-5 w-5" />}
            </Button>
          </form>
        </main>
      </div>
    </div>
  );
}
