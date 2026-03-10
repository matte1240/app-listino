export interface Material {
  codice: string;
  descrizione: string;
  categoria: string;
  raggr: string;
  um: string;
  prezzoListino: number;
  prezzoRiservato: number;
  prezzoPublico: number;
  pzConfezione: number;
  nota: string;
}

export interface OrderItem {
  flagged: boolean;
  qty: number;
}

export type OrderMap = Record<string, OrderItem>;

export interface OrderInfo {
  cliente: string;
  luogoConsegna: string;
  dataConsegna: string;
  note: string;
}
