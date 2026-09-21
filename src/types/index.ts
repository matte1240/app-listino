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
  mqConfezione?: number | null;
  pzBancale?: number | null;
  mqBancale?: number | null;
  nota: string;
}

export interface EnrichedData {
  codice: string;
  descrizioneAI: string;
  updatedAt: string;
}

/**
 * Tipo di riga del corpo ordine/preventivo.
 * - articolo: riga da listino (codice presente in `materials`)
 * - manuale: riga inserita a mano (descrizione, U.M. e prezzo liberi)
 * - commento: nota testuale a tutta larghezza, senza quantità né prezzo
 * - trasporto: spese di trasporto, sempre ultima riga
 */
export type OrderLineType = "articolo" | "manuale" | "commento" | "trasporto";

export interface OrderHistoryItem {
  /** Identificativo stabile della riga (assente negli ordini salvati prima dell'introduzione). */
  id?: string;
  /** Assente = "articolo" (retro-compatibilità con gli ordini già salvati). */
  tipo?: OrderLineType;
  codice: string;
  descrizione: string;
  qty: number;
  um: string;
  prezzoListino: number;
  /** Percentuale 0-100; 0/8/15 sono i preset, qualsiasi altro valore è uno "sconto libero". */
  sconto?: number;
}

export type QuotationItem = OrderHistoryItem;

/** Riga come vive nello store del wizard: id e tipo sempre valorizzati. */
export type OrderLine = OrderHistoryItem & { id: string; tipo: OrderLineType };

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
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  cancelledFromStatus?: OrderStatus | null;
  hasDraft?: boolean;
  draftUpdatedAt?: string | null;
  draft?: OrderDraft | null;
}

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
