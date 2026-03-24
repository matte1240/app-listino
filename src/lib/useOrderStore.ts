import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Material, OrderMap, OrderInfo, OrderHistoryItem } from "@/types";

interface OrderStore {
  materials: Material[];
  orderItems: OrderMap;
  orderInfo: OrderInfo;
  searchQuery: string;
  drawerOpen: boolean;
  editingId: number | null;
  editingItems: OrderHistoryItem[];
  setDrawerOpen: (open: boolean) => void;
  setMaterials: (materials: Material[]) => void;
  toggleFlag: (codice: string) => void;
  setQty: (codice: string, qty: number) => void;
  resetOrder: () => void;
  setSearchQuery: (q: string) => void;
  setOrderInfo: (info: Partial<OrderInfo>) => void;
  setEditing: (id: number | null, items?: OrderHistoryItem[]) => void;
}

const defaultOrderInfo: OrderInfo = {
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
      drawerOpen: false,
      editingId: null,
      editingItems: [],
      setDrawerOpen: (drawerOpen) => set({ drawerOpen }),

      setEditing: (id, items = []) => set({ editingId: id, editingItems: items }),

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
            },
          },
        }));
      },

      resetOrder: () => set({ orderItems: {}, orderInfo: defaultOrderInfo, editingId: null, editingItems: [] }),

      setSearchQuery: (searchQuery) => set({ searchQuery }),

      setOrderInfo: (info) =>
        set((state) => ({ orderInfo: { ...state.orderInfo, ...info } })),
    }),
    {
      name: "listino-order-store",
      partialize: (state) => ({
        orderItems: state.orderItems,
        orderInfo: state.orderInfo,
        editingId: state.editingId,
        editingItems: state.editingItems,
      }),
    }
  )
);
