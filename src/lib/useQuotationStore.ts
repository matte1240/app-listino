import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Material, OrderLine, QuotationInfo } from "@/types";
import { hydrateLinesFromMaterials, migrateLegacyCartMap } from "@/lib/order-lines";
import { createLineActions, type LineActions } from "@/lib/order-lines-store";

interface QuotationStore extends LineActions {
  materials: Material[];
  /** Righe del preventivo, nell'ordine di inserimento scelto dall'utente. */
  lines: OrderLine[];
  quotationInfo: QuotationInfo;
  searchQuery: string;
  showObsolete: boolean;
  currentStep: 1 | 2 | 3 | 4;
  mobileCartOpen: boolean;
  setMobileCartOpen: (open: boolean) => void;
  setStep: (step: 1 | 2 | 3 | 4) => void;
  setMaterials: (materials: Material[]) => void;
  setMaterialDescrizioneAI: (codice: string, descrizioneAI: string) => void;
  resetQuotation: () => void;
  setSearchQuery: (q: string) => void;
  setShowObsolete: (value: boolean) => void;
  setQuotationInfo: (info: Partial<QuotationInfo>) => void;
}

interface PersistedQuotationState {
  lines: OrderLine[];
  quotationInfo: QuotationInfo;
  currentStep: 1 | 2 | 3 | 4;
}

const today = () => new Date().toISOString().slice(0, 10);

const defaultQuotationInfo = (): QuotationInfo => ({
  clienteId: null,
  cliente: "",
  dataPreventivo: today(),
  dataConsegnaPrevista: today(),
  validitaGiorni: 30,
  note: "",
});

export const useQuotationStore = create<QuotationStore>()(
  persist(
    (set) => ({
      materials: [],
      lines: [],
      quotationInfo: defaultQuotationInfo(),
      searchQuery: "",
      showObsolete: true,
      currentStep: 1,
      mobileCartOpen: false,
      setMobileCartOpen: (mobileCartOpen) => set({ mobileCartOpen }),
      setStep: (currentStep) => set({ currentStep }),

      setMaterials: (materials) =>
        set((state) => ({ materials, lines: hydrateLinesFromMaterials(state.lines, materials) })),

      setMaterialDescrizioneAI: (codice, descrizioneAI) =>
        set((state) => ({
          materials: state.materials.map((material) =>
            material.codice === codice ? { ...material, descrizioneAI } : material
          ),
        })),

      ...createLineActions<QuotationStore>(set),

      resetQuotation: () => set({ lines: [], quotationInfo: defaultQuotationInfo(), currentStep: 1, mobileCartOpen: false }),

      setSearchQuery: (searchQuery) => set({ searchQuery }),

      setShowObsolete: (showObsolete) => set({ showObsolete }),

      setQuotationInfo: (info) =>
        set((state) => ({ quotationInfo: { ...state.quotationInfo, ...info } })),
    }),
    {
      name: "listino-quotation-store",
      version: 1,
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as Record<string, unknown>;
        if (version < 1) {
          // v0: carrello come mappa { codice: { flagged, qty, sconto } } → righe ordinate
          const { quotationItems, ...rest } = state;
          return { ...rest, lines: migrateLegacyCartMap(quotationItems) } as unknown as PersistedQuotationState;
        }
        return state as unknown as PersistedQuotationState;
      },
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<QuotationStore> | undefined;
        return {
          ...currentState,
          ...persisted,
          lines: Array.isArray(persisted?.lines) ? persisted.lines : [],
          quotationInfo: {
            ...defaultQuotationInfo(),
            ...persisted?.quotationInfo,
          },
        };
      },
      partialize: (state): PersistedQuotationState => ({
        lines: state.lines,
        quotationInfo: state.quotationInfo,
        currentStep: state.currentStep,
      }),
    }
  )
);
