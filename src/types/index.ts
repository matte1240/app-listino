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

export interface QuotationItem {
  codice: string;
  descrizione: string;
  qty: number;
  um: string;
  prezzoListino: number;
  sconto?: number; // 0 | 8 | 15
}

export interface Quotation {
  id: number;
  numero: string;
  clienteId: number | null;
  cliente: string;
  status: QuotationStatus;
  convertedOrderId: number | null;
  dataPreventivo: string;
  dataConsegnaPrevista: string;
  validitaGiorni: ValiditaPreventivoGiorni;
  note: string;
  agente: string;
  agenteFullName?: string;
  items: QuotationItem[];
  createdAt: string;
  updatedAt: string;
}

export type QuotationStatus = 'attivo' | 'convertito';

export type OrderStatus = 'bozza' | 'confermato' | 'in_lavorazione' | 'spedito' | 'consegnato' | 'annullato';

export interface OrderDraft {
  orderId: number;
  clienteId: number | null;
  cliente: string;
  magazzino: string;
  luogoConsegna: string;
  dataConsegna: string;
  note: string;
  items: OrderHistoryItem[];
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: number;
  parentOrderId: number | null;
  quotationId: number | null;
  clienteId: number | null;
  cliente: string;
  magazzino: string;
  luogoConsegna: string;
  dataConsegna: string;
  note: string;
  agente: string;
  agenteFullName?: string;
  items: OrderHistoryItem[];
  status: OrderStatus;
  createdAt: string;
  updatedAt?: string;
  hasDraft?: boolean;
  draftUpdatedAt?: string | null;
  draft?: OrderDraft | null;
}

export interface OrderItem {
  flagged: boolean;
  qty: number;
  sconto: 0 | 8 | 15;
}

export type OrderMap = Record<string, OrderItem>;

export interface QuotationStoreItem {
  flagged: boolean;
  qty: number;
  sconto: 0 | 8 | 15;
}

export type QuotationMap = Record<string, QuotationStoreItem>;

export interface QuotationInfo {
  clienteId: number | null;
  cliente: string;
  dataPreventivo: string;
  dataConsegnaPrevista: string;
  validitaGiorni: ValiditaPreventivoGiorni;
  note: string;
}

export const VALIDITA_PREVENTIVO_GIORNI = [7, 15, 30] as const;
export type ValiditaPreventivoGiorni = typeof VALIDITA_PREVENTIVO_GIORNI[number];

export const MAGAZZINI = ["Pordenone", "Udine", "Fossalta di Portogruaro", "Trieste"] as const;
export type Magazzino = typeof MAGAZZINI[number];

export interface OrderInfo {
  quotationId: number | null;
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
