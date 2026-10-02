import { create } from "zustand";

/**
 * Guardia di navigazione per i wizard: riceve la destinazione e restituisce `true` se si può
 * uscire subito, `false` se il wizard ha aperto la conferma di uscita (salva bozza / esci / continua).
 */
type NavigationGuard = (href: string) => boolean;

interface NavigationGuardState {
  guard: NavigationGuard | null;
  setGuard: (guard: NavigationGuard | null) => void;
}

export const useNavigationGuard = create<NavigationGuardState>((set) => ({
  guard: null,
  setGuard: (guard) => set({ guard }),
}));

/**
 * Destinazione usata dal logout: la guardia la riceve come un link qualsiasi, ma dopo la conferma
 * il wizard deve chiamare `logout()` invece di navigare (andare su /login non chiude la sessione).
 */
export const LOGOUT_HREF = "/login";

/** Da chiamare nel click dei link di navigazione: `false` = navigazione bloccata dal wizard. */
export function canNavigateTo(href: string): boolean {
  const { guard } = useNavigationGuard.getState();
  return guard ? guard(href) : true;
}
