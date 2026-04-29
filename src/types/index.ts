export interface Material {
  codice: string;
  descrizione: string;
  descrizioneAI?: string;
  obsoleto?: boolean;
  categoria: string;
  raggr: string;
  um: string;
  prezzoListino: number;
  prezzoRiservato: number;
  prezzoPublico: number;
  pzConfezione: number;
  nota: string;
}

export interface EnrichedData {
  codice: string;
  descrizioneAI: string;
  updatedAt: string;
}

export interface OrderHistoryItem {
  codice: string;
  descrizione: string;
  qty: number;
  um: string;
  prezzoListino: number;
  sconto?: number; // 0 | 8 | 15
}

export type OrderStatus = 'bozza' | 'confermato' | 'in_lavorazione' | 'spedito' | 'consegnato' | 'annullato';

export interface Order {
  id: number;
  parentOrderId: number | null;
  clienteId: number | null;
  cliente: string;
  magazzino: string;
  luogoConsegna: string;
  dataConsegna: string;
  note: string;
  agente: string;
  items: OrderHistoryItem[];
  status: OrderStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface OrderItem {
  flagged: boolean;
  qty: number;
  sconto: 0 | 8 | 15;
}

export type OrderMap = Record<string, OrderItem>;

export const MAGAZZINI = ["Pordenone", "Udine", "Fossalta di Portogruaro", "Trieste"] as const;
export type Magazzino = typeof MAGAZZINI[number];

export interface OrderInfo {
  clienteId: number | null;
  cliente: string;
  luogoConsegna: string;
  dataConsegna: string;
  note: string;
  magazzino: Magazzino | "";
}

export interface Anagrafica {
  id: number;
  codice: string;
  ragioneSociale: string;
  indirizzo: string;
  capCitta: string;
  partitaIva: string;
}

export type AnagraficaSearchItem = Anagrafica;
