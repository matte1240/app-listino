import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Material, OrderMap, OrderInfo } from "@/types";

interface OrderStore {
  materials: Material[];
  orderItems: OrderMap;
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
  toggleFlag: (codice: string) => void;
  setQty: (codice: string, qty: number) => void;
  setSconto: (codice: string, sconto: 0 | 8 | 15) => void;
  resetOrder: () => void;
  setSearchQuery: (q: string) => void;
  setShowObsolete: (value: boolean) => void;
  setOrderInfo: (info: Partial<OrderInfo>) => void;
}

const defaultOrderInfo: OrderInfo = {
  clienteId: null,
  cliente: "",
  luogoConsegna: "",
  dataConsegna: "",
  note: "",
  magazzino: "",
};

export const useOrderStore = create<OrderStore>()(
  persist(
    (set, get) => ({
      materials: [],
      orderItems: {},
      orderInfo: defaultOrderInfo,
      searchQuery: "",
      showObsolete: true,
      currentStep: 1,
      mobileCartOpen: false,
      setMobileCartOpen: (mobileCartOpen) => set({ mobileCartOpen }),
      exitDialogOpen: false,
      setExitDialogOpen: (exitDialogOpen) => set({ exitDialogOpen }),
      setStep: (currentStep) => set({ currentStep }),

      setMaterials: (materials) => set({ materials }),

      toggleFlag: (codice) => {
        const current = get().orderItems[codice];
        const wasFlagged = current?.flagged ?? false;
        set((state) => ({
          orderItems: {
            ...state.orderItems,
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
          orderItems: {
            ...state.orderItems,
            [codice]: {
              flagged: newQty > 0,
              qty: newQty,
              sconto: state.orderItems[codice]?.sconto ?? 0,
            },
          },
        }));
      },

      setSconto: (codice, sconto) => {
        set((state) => ({
          orderItems: {
            ...state.orderItems,
            [codice]: {
              ...state.orderItems[codice],
              sconto,
            },
          },
        }));
      },

      resetOrder: () => set({ orderItems: {}, orderInfo: defaultOrderInfo, currentStep: 1, mobileCartOpen: false }),

      setSearchQuery: (searchQuery) => set({ searchQuery }),

      setShowObsolete: (showObsolete) => set({ showObsolete }),

      setOrderInfo: (info) =>
        set((state) => ({ orderInfo: { ...state.orderInfo, ...info } })),
    }),
    {
      name: "listino-order-store",
      partialize: (state) => ({
        orderItems: state.orderItems,
        orderInfo: state.orderInfo,
        currentStep: state.currentStep,
      }),
    }
  )
);
