export interface Material {
  codice: string;
  descrizione: string;
  quantita: number;
  pzBancale: number;
  categoria: string;
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
