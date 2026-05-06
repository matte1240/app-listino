import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Material, QuotationInfo, QuotationMap } from "@/types";

interface QuotationStore {
  materials: Material[];
  quotationItems: QuotationMap;
  quotationInfo: QuotationInfo;
  searchQuery: string;
  showObsolete: boolean;
  currentStep: 1 | 2 | 3 | 4;
  mobileCartOpen: boolean;
  setMobileCartOpen: (open: boolean) => void;
  setStep: (step: 1 | 2 | 3 | 4) => void;
  setMaterials: (materials: Material[]) => void;
  setMaterialDescrizioneAI: (codice: string, descrizioneAI: string) => void;
  toggleFlag: (codice: string) => void;
  setQty: (codice: string, qty: number) => void;
  setSconto: (codice: string, sconto: 0 | 8 | 15) => void;
  resetQuotation: () => void;
  setSearchQuery: (q: string) => void;
  setShowObsolete: (value: boolean) => void;
  setQuotationInfo: (info: Partial<QuotationInfo>) => void;
}

const today = () => new Date().toISOString().slice(0, 10);

const defaultQuotationInfo = (): QuotationInfo => ({
  clienteId: null,
  cliente: "",
  dataPreventivo: today(),
  note: "",
});

export const useQuotationStore = create<QuotationStore>()(
  persist(
    (set, get) => ({
      materials: [],
      quotationItems: {},
      quotationInfo: defaultQuotationInfo(),
      searchQuery: "",
      showObsolete: true,
      currentStep: 1,
      mobileCartOpen: false,
      setMobileCartOpen: (mobileCartOpen) => set({ mobileCartOpen }),
      setStep: (currentStep) => set({ currentStep }),

      setMaterials: (materials) => set({ materials }),

      setMaterialDescrizioneAI: (codice, descrizioneAI) =>
        set((state) => ({
          materials: state.materials.map((material) =>
            material.codice === codice ? { ...material, descrizioneAI } : material
          ),
        })),

      toggleFlag: (codice) => {
        const current = get().quotationItems[codice];
        const wasFlagged = current?.flagged ?? false;
        set((state) => ({
          quotationItems: {
            ...state.quotationItems,
            [codice]: {
              flagged: !wasFlagged,
              qty: current?.qty ?? 0,
              sconto: current?.sconto ?? 0,
            },
          },
        }));
      },

      setQty: (codice, qty) => {
        const newQty = Math.max(0, qty);
        set((state) => ({
          quotationItems: {
            ...state.quotationItems,
            [codice]: {
              flagged: newQty > 0,
              qty: newQty,
              sconto: state.quotationItems[codice]?.sconto ?? 0,
            },
          },
        }));
      },

      setSconto: (codice, sconto) => {
        set((state) => ({
          quotationItems: {
            ...state.quotationItems,
            [codice]: {
              ...state.quotationItems[codice],
              sconto,
            },
          },
        }));
      },

      resetQuotation: () => set({ quotationItems: {}, quotationInfo: defaultQuotationInfo(), currentStep: 1, mobileCartOpen: false }),

      setSearchQuery: (searchQuery) => set({ searchQuery }),

      setShowObsolete: (showObsolete) => set({ showObsolete }),

      setQuotationInfo: (info) =>
        set((state) => ({ quotationInfo: { ...state.quotationInfo, ...info } })),
    }),
    {
      name: "listino-quotation-store",
      partialize: (state) => ({
        quotationItems: state.quotationItems,
        quotationInfo: state.quotationInfo,
        currentStep: state.currentStep,
      }),
    }
  )
);