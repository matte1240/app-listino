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

/** Da chiamare nel click dei link di navigazione: `false` = navigazione bloccata dal wizard. */
export function canNavigateTo(href: string): boolean {
  const { guard } = useNavigationGuard.getState();
  return guard ? guard(href) : true;
}
