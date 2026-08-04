/**
 * Tipi condivisi fra il provider di ricerca indirizzi (server) e il componente
 * di autocompletamento (client). File volutamente privo di side effect e di
 * `server-only`, così può essere importato da entrambi i lati.
 */

/** Suggerimento normalizzato, indipendente dal provider. */
export interface AddressSuggestion {
  /** Chiave stabile per React: `${osm_type}${osm_id}` */
  id: string;
  /** Indirizzo completo formattato, es. "Via Roma 10, 33170 Pordenone, Italia" */
  description: string;
  /** Prima riga del suggerimento, es. "Via Roma 10" */
  mainText: string;
  /** Seconda riga del suggerimento, es. "33170 Pordenone, Italia" */
  secondaryText: string;
  lat: number;
  lng: number;
  street: string | null;
  houseNumber: string | null;
  postcode: string | null;
  city: string | null;
  countryCode: string | null;
}

/**
 * `ok` con array vuoto significa "cercato, nessun risultato".
 * `unavailable` significa "non sono riuscito a cercare": il client in questo
 * caso accetta il testo libero invece di bloccare l'inserimento dell'ordine.
 */
export type AddressSearchResult =
  | { status: "ok"; results: AddressSuggestion[] }
  | { status: "unavailable"; results: [] };
