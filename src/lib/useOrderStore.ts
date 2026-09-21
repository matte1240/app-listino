import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Material, OrderInfo, OrderLine } from "@/types";
import { hydrateLinesFromMaterials, migrateLegacyCartMap } from "@/lib/order-lines";
import { createLineActions, type LineActions } from "@/lib/order-lines-store";

interface OrderStore extends LineActions {
  materials: Material[];
  /** Righe del corpo ordine, nell'ordine di inserimento scelto dall'utente. */
  lines: OrderLine[];
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
  orderInfo: OrderInfo;
  currentStep: 1 | 2 | 3 | 4;
}

const defaultOrderInfo: OrderInfo = {
  quotationId: null,
  clienteId: null,
  cliente: "",
  luogoConsegna: "",
  dataConsegna: "",
  note: "",
  magazzino: "",
};

export const useOrderStore = create<OrderStore>()(
  persist(
    (set) => ({
      materials: [],
      lines: [],
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

      resetOrder: () => set({ lines: [], orderInfo: { ...defaultOrderInfo }, currentStep: 1, mobileCartOpen: false }),

      setSearchQuery: (searchQuery) => set({ searchQuery }),

      setShowObsolete: (showObsolete) => set({ showObsolete }),

      setOrderInfo: (info) =>
        set((state) => ({ orderInfo: { ...state.orderInfo, ...info } })),
    }),
    {
      name: "listino-order-store",
      version: 1,
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as Record<string, unknown>;
        if (version < 1) {
          // v0: carrello come mappa { codice: { flagged, qty, sconto } } → righe ordinate
          const { orderItems, ...rest } = state;
          return { ...rest, lines: migrateLegacyCartMap(orderItems) } as unknown as PersistedOrderState;
        }
        return state as unknown as PersistedOrderState;
      },
      partialize: (state): PersistedOrderState => ({
        lines: state.lines,
        orderInfo: state.orderInfo,
        currentStep: state.currentStep,
      }),
    }
  )
);
