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

/**
 * Esito dell'approvazione admin richiesta dagli sconti liberi.
 * Sugli ordini e preventivi lo stato "in attesa" è espresso dallo status del documento
 * (`in_approvazione`); questi campi tracciano richiesta, decisione e motivazione.
 */
export interface ApprovalInfo {
  approvalRequestedAt: string | null;
  approvalDecidedAt: string | null;
  approvalDecidedBy: string | null;
  approvalNote: string | null;
}

/** Stato di approvazione di una bozza di modifica (ordine già confermato). */
export type DraftApprovalStatus = 'in_approvazione' | 'rifiutato';

export interface Quotation extends ApprovalInfo {
  id: number;
  numero: string;
  clienteId: number | null;
  cliente: string;
  status: QuotationStatus;
  convertedOrderId: number | null;
  dataPreventivo: string;
  dataConsegnaPrevista: string;
  /** Destinazione del cantiere (opzionale): vuota = stessa sede del cliente ("STESSA" nel PDF). */
  luogoConsegna: string;
  validitaGiorni: ValiditaPreventivoGiorni;
  note: string;
  agente: string;
  agenteFullName?: string;
  items: QuotationItem[];
  createdAt: string;
  updatedAt: string;
}

export type QuotationStatus = 'attivo' | 'in_approvazione' | 'rifiutato' | 'convertito';

export type OrderStatus = 'bozza' | 'in_approvazione' | 'confermato' | 'in_lavorazione' | 'spedito' | 'consegnato' | 'annullato';

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
  approvalStatus: DraftApprovalStatus | null;
  approvalRequestedAt: string | null;
  approvalNote: string | null;
}

export interface Order extends ApprovalInfo {
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
  /** Stato di approvazione della bozza di modifica collegata (se presente). */
  draftApprovalStatus?: DraftApprovalStatus | null;
  /** Motivazione dell'admin sulla bozza di modifica (se rifiutata). */
  draftApprovalNote?: string | null;
  draft?: OrderDraft | null;
}

export interface QuotationInfo {
  clienteId: number | null;
  cliente: string;
  dataPreventivo: string;
  dataConsegnaPrevista: string;
  luogoConsegna: string;
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
