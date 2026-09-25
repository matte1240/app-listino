import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Material, OrderHistoryItem, OrderInfo, OrderLine } from "@/types";
import { hydrateLinesFromMaterials, migrateLegacyCartMap } from "@/lib/order-lines";
import { createLineActions, type LineActions } from "@/lib/order-lines-store";

interface OrderStore extends LineActions {
  materials: Material[];
  /** Righe del corpo ordine, nell'ordine di inserimento scelto dall'utente. */
  lines: OrderLine[];
  /** Righe del preventivo approvato da cui nasce l'ordine (per non richiedere una seconda approvazione). */
  sourceQuotationItems: OrderHistoryItem[] | null;
  setSourceQuotationItems: (items: OrderHistoryItem[] | null) => void;
  orderInfo: OrderInfo;
  searchQuery: string;
  showObsolete: boolean;
  currentStep: 1 | 2 | 3 | 4;
  mobileCartOpen: boolean;
  setMobileCartOpen: (open: boolean) => void;
  exitDialogOpen: boolean;
  setExitDialogOpen: (open: boolean) => void;
  setStep: (step: 1 | 2 | 3 | 4) => void;
  setMaterials: (materials: Material[]) => void;
  setMaterialDescrizioneAI: (codice: string, descrizioneAI: string) => void;
  resetOrder: () => void;
  setSearchQuery: (q: string) => void;
  setShowObsolete: (value: boolean) => void;
  setOrderInfo: (info: Partial<OrderInfo>) => void;
}

interface PersistedOrderState {
  lines: OrderLine[];
  sourceQuotationItems: OrderHistoryItem[] | null;
  orderInfo: OrderInfo;
  currentStep: 1 | 2 | 3 | 4;
}

const defaultOrderInfo: OrderInfo = {
  quotationId: null,
  clienteId: null,
  cliente: "",
  luogoConsegna: "",
  cig: "",
  cup: "",
  dataConsegna: "",
  note: "",
  magazzino: "",
};

export const useOrderStore = create<OrderStore>()(
  persist(
    (set) => ({
      materials: [],
      lines: [],
      sourceQuotationItems: null,
      setSourceQuotationItems: (sourceQuotationItems) => set({ sourceQuotationItems }),
      orderInfo: defaultOrderInfo,
      searchQuery: "",
      showObsolete: true,
      currentStep: 1,
      mobileCartOpen: false,
      setMobileCartOpen: (mobileCartOpen) => set({ mobileCartOpen }),
      exitDialogOpen: false,
      setExitDialogOpen: (exitDialogOpen) => set({ exitDialogOpen }),
      setStep: (currentStep) => set({ currentStep }),

      setMaterials: (materials) =>
        set((state) => ({ materials, lines: hydrateLinesFromMaterials(state.lines, materials) })),

      setMaterialDescrizioneAI: (codice, descrizioneAI) =>
        set((state) => ({
          materials: state.materials.map((m) =>
            m.codice === codice ? { ...m, descrizioneAI } : m
          ),
        })),

      ...createLineActions<OrderStore>(set),

      // Anche ricerca e filtro obsoleti (condivisi con il Listino): un ordine nuovo parte dal catalogo completo.
      resetOrder: () =>
        set({
          lines: [],
          sourceQuotationItems: null,
          orderInfo: { ...defaultOrderInfo },
          currentStep: 1,
          mobileCartOpen: false,
          searchQuery: "",
          showObsolete: true,
        }),

      setSearchQuery: (searchQuery) => set({ searchQuery }),

      setShowObsolete: (showObsolete) => set({ showObsolete }),

      setOrderInfo: (info) =>
        set((state) => ({ orderInfo: { ...state.orderInfo, ...info } })),
    }),
    {
      name: "listino-order-store",
      version: 2,
      migrate: (persistedState, version) => {
        let state = (persistedState ?? {}) as Record<string, unknown>;
        if (version < 1) {
          // v0: carrello come mappa { codice: { flagged, qty, sconto } } → righe ordinate
          const { orderItems, ...rest } = state;
          state = { ...rest, lines: migrateLegacyCartMap(orderItems) };
        }
        if (version < 2) {
          // v1: testata senza CIG/CUP → campi aggiunti vuoti
          state = { ...state, orderInfo: { ...defaultOrderInfo, ...(state.orderInfo as Partial<OrderInfo> | undefined) } };
        }
        return state as unknown as PersistedOrderState;
      },
      partialize: (state): PersistedOrderState => ({
        lines: state.lines,
        sourceQuotationItems: state.sourceQuotationItems,
        orderInfo: state.orderInfo,
        currentStep: state.currentStep,
      }),
    }
  )
);
