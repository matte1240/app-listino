"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useId,
  forwardRef,
  useImperativeHandle,
  type ComponentProps,
  type KeyboardEvent,
} from "react";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import type { AddressSearchResult, AddressSuggestion } from "@/lib/address-types";

export interface AddressData {
  address: string;
  lat: number | null;
  lng: number | null;
  /** Identificativo OSM del risultato (`${osm_type}${osm_id}`) */
  placeId: string | null;
  source: "photon" | "manual" | null;
}

export interface AddressAutocompleteInputHandle {
  validateAddress: () => Promise<boolean>;
}

interface AddressAutocompleteInputProps
  extends Omit<ComponentProps<"input">, "value" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
  onAddressResolved?: (data: AddressData) => void;
  onValidityChange?: (isValid: boolean) => void;
}

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;
const MAX_CACHE_ENTRIES = 50;
const SUGGESTIONS_LIMIT = 8;
const REQUEST_TIMEOUT_MS = 6000;

/**
 * Interroga la route proxy dell'app (che a sua volta parla con Photon).
 * Qualunque problema di rete, timeout o risposta inattesa viene riportato come
 * `unavailable`: il chiamante lo tratta come "non ho potuto verificare" e
 * lascia passare il testo libero, invece di bloccare l'inserimento dell'ordine.
 */
async function requestSuggestions(
  query: string,
  limit: number
): Promise<AddressSearchResult> {
  try {
    const res = await fetch(
      `/api/geocode/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }
    );
    if (!res.ok) return { status: "unavailable", results: [] };

    const data = (await res.json()) as Partial<AddressSearchResult>;
    if (data?.status === "ok" && Array.isArray(data.results)) {
      return { status: "ok", results: data.results };
    }
    return { status: "unavailable", results: [] };
  } catch {
    return { status: "unavailable", results: [] };
  }
}

const AddressAutocompleteInput = forwardRef<
  AddressAutocompleteInputHandle,
  AddressAutocompleteInputProps
>(function AddressAutocompleteInput(
  { value, onChange, onAddressResolved, onValidityChange, disabled, ...inputProps },
  ref
) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [isAddressValid, setIsAddressValid] = useState(value === "");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const listboxId = useId();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionCacheRef = useRef<Map<string, AddressSuggestion[]>>(new Map());
  const latestRequestRef = useRef(0);

  const onChangeRef = useRef(onChange);
  const onAddressResolvedRef = useRef(onAddressResolved);
  const onValidityChangeRef = useRef(onValidityChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onAddressResolvedRef.current = onAddressResolved; }, [onAddressResolved]);
  useEffect(() => { onValidityChangeRef.current = onValidityChange; }, [onValidityChange]);

  /** Invalida le richieste in volo, così una risposta tardiva non sovrascrive lo stato. */
  const cancelPendingRequests = useCallback(() => {
    latestRequestRef.current += 1;
    setSuggestionsLoading(false);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Sync parent value when reset externally (e.g. switching recent destinations)
  const prevValueRef = useRef(value);
  useEffect(() => {
    if (value !== prevValueRef.current && value !== inputValue) {
      setInputValue(value);
      setSuggestions([]);
      setDropdownOpen(false);
      setHighlightedIndex(-1);
      cancelPendingRequests();
      const valid = value === "";
      setIsAddressValid(valid);
      setAddressError(null);
      prevValueRef.current = value;
      onValidityChangeRef.current?.(valid);
    } else {
      prevValueRef.current = value;
    }
  }, [value, inputValue, cancelPendingRequests]);

  const markValid = useCallback((data: AddressData) => {
    setIsAddressValid(true);
    setAddressError(null);
    onAddressResolvedRef.current?.(data);
    onValidityChangeRef.current?.(true);
  }, []);

  const markInvalid = useCallback(() => {
    setIsAddressValid(false);
    setAddressError("Inserisci un indirizzo valido o seleziona un suggerimento");
    onValidityChangeRef.current?.(false);
  }, []);

  const fetchSuggestions = useCallback(async (input: string) => {
    const normalizedInput = input.trim();

    if (normalizedInput.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setHighlightedIndex(-1);
      setSuggestionsLoading(false);
      return;
    }

    const cacheKey = normalizedInput.toLocaleLowerCase("it-IT");
    const cached = suggestionCacheRef.current.get(cacheKey);
    if (cached) {
      setSuggestions(cached);
      setHighlightedIndex(-1);
      setSuggestionsLoading(false);
      return;
    }

    setSuggestionsLoading(true);
    const requestId = ++latestRequestRef.current;

    const result = await requestSuggestions(normalizedInput, SUGGESTIONS_LIMIT);

    // Una risposta più vecchia dell'ultima richiesta partita va ignorata.
    if (requestId !== latestRequestRef.current) return;

    setSuggestionsLoading(false);
    setSuggestions(result.results);
    setHighlightedIndex(-1);

    if (result.status === "ok") {
      suggestionCacheRef.current.set(cacheKey, result.results);
      if (suggestionCacheRef.current.size > MAX_CACHE_ENTRIES) {
        const firstKey = suggestionCacheRef.current.keys().next().value;
        if (typeof firstKey === "string") {
          suggestionCacheRef.current.delete(firstKey);
        }
      }
    }
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVal = e.target.value;
      const normalizedInput = newVal.trim();

      setInputValue(newVal);
      onChangeRef.current(newVal);
      setIsAddressValid(false);
      setAddressError(null);
      setDropdownOpen(true);
      setHighlightedIndex(-1);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (normalizedInput.length < MIN_QUERY_LENGTH) {
        setSuggestions([]);
        cancelPendingRequests();
        return;
      }

      debounceRef.current = setTimeout(() => void fetchSuggestions(newVal), DEBOUNCE_MS);
    },
    [fetchSuggestions, cancelPendingRequests]
  );

  /**
   * Photon restituisce coordinate e indirizzo strutturato già nella risposta di
   * autocompletamento: selezionare un suggerimento non richiede una seconda
   * chiamata di dettaglio, quindi è immediato.
   */
  const handleSelectSuggestion = useCallback(
    (suggestion: AddressSuggestion) => {
      cancelPendingRequests();
      setSuggestions([]);
      setDropdownOpen(false);
      setHighlightedIndex(-1);
      setInputValue(suggestion.description);
      onChangeRef.current(suggestion.description);
      markValid({
        address: suggestion.description,
        lat: suggestion.lat,
        lng: suggestion.lng,
        placeId: suggestion.id,
        source: "photon",
      });
    },
    [markValid, cancelPendingRequests]
  );

  const geocodeManual = useCallback(
    async (address: string): Promise<boolean> => {
      cancelPendingRequests();
      const trimmed = address.trim();

      if (!trimmed) {
        setIsAddressValid(true);
        setAddressError(null);
        onAddressResolvedRef.current?.({ address: "", lat: null, lng: null, placeId: null, source: null });
        onValidityChangeRef.current?.(true);
        return true;
      }

      try {
        setIsGeocoding(true);
        setAddressError(null);
        const result = await requestSuggestions(trimmed, 1);

        // Servizio indirizzi non raggiungibile: non possiamo verificare nulla,
        // quindi accettiamo il testo così com'è e lasciamo proseguire l'ordine.
        if (result.status === "unavailable") {
          setInputValue(trimmed);
          onChangeRef.current(trimmed);
          markValid({
            address: trimmed,
            lat: null,
            lng: null,
            placeId: null,
            source: "manual",
          });
          return true;
        }

        const best = result.results[0];
        if (best) {
          setInputValue(best.description);
          onChangeRef.current(best.description);
          markValid({
            address: best.description,
            lat: best.lat,
            lng: best.lng,
            placeId: best.id,
            source: "manual",
          });
          return true;
        }

        // Il servizio ha risposto ma non conosce questo indirizzo.
        markInvalid();
        return false;
      } finally {
        setIsGeocoding(false);
      }
    },
    [markValid, markInvalid, cancelPendingRequests]
  );

  useImperativeHandle(
    ref,
    () => ({
      validateAddress: async () => {
        if (isAddressValid) return true;
        return geocodeManual(inputValue);
      },
    }),
    [isAddressValid, inputValue, geocodeManual]
  );

  const showDropdown = dropdownOpen && (suggestionsLoading || suggestions.length > 0);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        setDropdownOpen(false);
        setHighlightedIndex(-1);
        return;
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (suggestions.length === 0) return;
        e.preventDefault();
        setDropdownOpen(true);
        setHighlightedIndex((current) => {
          const delta = e.key === "ArrowDown" ? 1 : -1;
          const next = current + delta;
          if (next < 0) return suggestions.length - 1;
          if (next >= suggestions.length) return 0;
          return next;
        });
        return;
      }

      if (e.key === "Enter" && showDropdown && highlightedIndex >= 0) {
        const suggestion = suggestions[highlightedIndex];
        if (suggestion) {
          e.preventDefault();
          handleSelectSuggestion(suggestion);
        }
      }
    },
    [suggestions, highlightedIndex, showDropdown, handleSelectSuggestion]
  );

  const optionId = (index: number) => `${listboxId}-option-${index}`;

  return (
    <div className="relative">
      <div className="relative">
        <Input
          value={inputValue}
          disabled={disabled || isGeocoding}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setDropdownOpen(true);
            if (inputValue.trim().length >= MIN_QUERY_LENGTH && suggestions.length === 0 && !suggestionsLoading) {
              void fetchSuggestions(inputValue);
            }
          }}
          onBlur={() => setTimeout(() => {
            setDropdownOpen(false);
            setHighlightedIndex(-1);
          }, 150)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-controls={showDropdown ? listboxId : undefined}
          aria-activedescendant={
            showDropdown && highlightedIndex >= 0 ? optionId(highlightedIndex) : undefined
          }
          {...inputProps}
          className={`${inputProps.className ?? ""} ${!isAddressValid && addressError ? "border-destructive focus-visible:ring-destructive/50" : ""} ${isGeocoding ? "pr-10" : ""}`.trim()}
        />
        {isGeocoding && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 w-full rounded-xl border border-border bg-popover shadow-lg overflow-hidden"
        >
          {suggestionsLoading && (
            <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Ricerca indirizzi…
            </div>
          )}
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              id={optionId(index)}
              type="button"
              role="option"
              aria-selected={index === highlightedIndex}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => handleSelectSuggestion(suggestion)}
              className={`w-full text-left px-3 py-2.5 border-b border-border/60 last:border-b-0 transition-colors ${index === highlightedIndex ? "bg-muted/50" : "hover:bg-muted/50"}`}
            >
              <p className="text-sm font-medium truncate">
                {suggestion.mainText}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {suggestion.secondaryText}
              </p>
            </button>
          ))}
        </div>
      )}

      {addressError && (
        <p className="mt-1 text-xs text-destructive">{addressError}</p>
      )}
    </div>
  );
});

export default AddressAutocompleteInput;
