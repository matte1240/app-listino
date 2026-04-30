"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
  type ComponentProps,
} from "react";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { loadGoogleMapsPlacesApi } from "@/lib/google-maps-loader";

export interface AddressData {
  address: string;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  source: "google" | "manual" | null;
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

// Minimal inline types to avoid requiring @types/google.maps
interface GMapsPrediction {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface GMapsGeocoderResult {
  formatted_address: string;
  place_id: string;
  geometry: { location: { lat(): number; lng(): number } };
}

type GMapsAutocompleteSessionToken = object;
type GMapsPlacesStatus = string;

interface GMapsAutocompleteService {
  getPlacePredictions(
    request: {
      input: string;
      componentRestrictions?: { country: string };
      types?: string[];
      sessionToken?: GMapsAutocompleteSessionToken;
    },
    callback: (
      predictions: GMapsPrediction[] | null,
      status: GMapsPlacesStatus
    ) => void
  ): void;
}

interface GMapsGeocoder {
  geocode(
    request: { placeId?: string; address?: string },
    callback: (
      results: GMapsGeocoderResult[] | null,
      status: string
    ) => void
  ): void;
}

interface GMapsPlaceInstance {
  fetchFields(options: { fields: string[] }): Promise<{ place: GMapsPlaceInstance }>;
  formattedAddress?: string;
  location?: { lat(): number; lng(): number };
  id?: string;
}

type GMapsWindow = Window & {
  google?: {
    maps?: {
      places?: {
        AutocompleteService?: new () => GMapsAutocompleteService;
        AutocompleteSessionToken?: new () => GMapsAutocompleteSessionToken;
        PlacesServiceStatus?: { OK: string };
        /** New Places API (2025) */
        AutocompleteSuggestion?: {
          fetchAutocompleteSuggestions(request: {
            input: string;
            includedRegionCodes?: string[];
            sessionToken?: GMapsAutocompleteSessionToken;
          }): Promise<{
            suggestions: Array<{
              placePrediction: {
                text: { toString(): string };
                mainText: { toString(): string };
                secondaryText: { toString(): string };
                placeId: string;
              };
            }>;
          }>;
        };
        /** New Places API (2025) */
        Place?: new (options: { id: string }) => GMapsPlaceInstance;
      };
      Geocoder: new () => GMapsGeocoder;
      GeocoderStatus: { OK: string };
    };
  };
};

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;
const MAX_CACHE_ENTRIES = 50;
const MAX_GOOGLE_MAPS_RETRIES = 2;
const GOOGLE_MAPS_RETRY_DELAY_MS = 150;

const AddressAutocompleteInput = forwardRef<
  AddressAutocompleteInputHandle,
  AddressAutocompleteInputProps
>(function AddressAutocompleteInput(
  { value, onChange, onAddressResolved, onValidityChange, disabled, ...inputProps },
  ref
) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<GMapsPrediction[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [isAddressValid, setIsAddressValid] = useState(value === "");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const autocompleteRef = useRef<GMapsAutocompleteService | null>(null);
  const geocoderRef = useRef<GMapsGeocoder | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionTokenRef = useRef<GMapsAutocompleteSessionToken | null>(null);
  const predictionCacheRef = useRef<Map<string, GMapsPrediction[]>>(new Map());
  const latestRequestRef = useRef(0);

  const onChangeRef = useRef(onChange);
  const onAddressResolvedRef = useRef(onAddressResolved);
  const onValidityChangeRef = useRef(onValidityChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onAddressResolvedRef.current = onAddressResolved; }, [onAddressResolved]);
  useEffect(() => { onValidityChangeRef.current = onValidityChange; }, [onValidityChange]);

  const resetAutocompleteSession = useCallback(() => {
    sessionTokenRef.current = null;
    latestRequestRef.current += 1;
  }, []);

  const getAutocompleteSessionToken = useCallback((): GMapsAutocompleteSessionToken | undefined => {
    const win = window as GMapsWindow;
    const SessionTokenCtor = win.google?.maps?.places?.AutocompleteSessionToken;
    if (!SessionTokenCtor) return undefined;

    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new SessionTokenCtor();
    }

    return sessionTokenRef.current;
  }, []);

  const initGoogleMapsRefs = useCallback(() => {
    const win = window as GMapsWindow;
    const maps = win.google?.maps;
    if (!maps) return;
    if (maps.places?.AutocompleteService && !autocompleteRef.current) {
      autocompleteRef.current = new maps.places.AutocompleteService();
    }
    if (maps.Geocoder && !geocoderRef.current) {
      geocoderRef.current = new maps.Geocoder();
    }
  }, []);

  const ensureGoogleMapsReady = useCallback(() => {
    return loadGoogleMapsPlacesApi()
      .then(() => {
        initGoogleMapsRefs();
      })
      .catch(() => {
        // Google Maps unavailable: keep field as free text input
      });
  }, [initGoogleMapsRefs]);

  // Wait for the Google Maps script (loaded in app/orders/layout.tsx) to be ready.
  // Also listen for the "google-maps-loaded" event in case the script loads after
  // the initial polling window has already expired (e.g. very slow connections).
  useEffect(() => {
    loadGoogleMapsPlacesApi()
      .then(initGoogleMapsRefs)
      .catch(() => {
        // Google Maps non disponibile: il campo funziona come testo libero
      });

    const onLateLoad = () => initGoogleMapsRefs();
    window.addEventListener("google-maps-loaded", onLateLoad);
    return () => {
      window.removeEventListener("google-maps-loaded", onLateLoad);
    };
  }, [initGoogleMapsRefs]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      resetAutocompleteSession();
    };
  }, [resetAutocompleteSession]);

  // Sync parent value when reset externally (e.g. switching recent destinations)
  const prevValueRef = useRef(value);
  useEffect(() => {
    if (value !== prevValueRef.current && value !== inputValue) {
      setInputValue(value);
      setSuggestions([]);
      setDropdownOpen(false);
      resetAutocompleteSession();
      const valid = value === "";
      setIsAddressValid(valid);
      setAddressError(null);
      prevValueRef.current = value;
      onValidityChangeRef.current?.(valid);
    } else {
      prevValueRef.current = value;
    }
  }, [value, inputValue, resetAutocompleteSession]);

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

  const fetchSuggestions = useCallback((input: string, retriesLeft = MAX_GOOGLE_MAPS_RETRIES) => {
    const normalizedInput = input.trim();

    const win = window as GMapsWindow;
    const canUseNewApi =
      typeof win.google?.maps?.places?.AutocompleteSuggestion?.fetchAutocompleteSuggestions === "function";
    const canUseLegacyApi = !!autocompleteRef.current;

    if (!canUseNewApi && !canUseLegacyApi) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      if (retriesLeft > 0) {
        void ensureGoogleMapsReady().then(() => {
          setTimeout(() => {
            fetchSuggestions(input, retriesLeft - 1);
          }, GOOGLE_MAPS_RETRY_DELAY_MS);
        });
      }
      return;
    }

    if (normalizedInput.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    const cacheKey = normalizedInput.toLocaleLowerCase("it-IT");
    const cachedSuggestions = predictionCacheRef.current.get(cacheKey);
    if (cachedSuggestions) {
      setSuggestions(cachedSuggestions);
      setSuggestionsLoading(false);
      return;
    }

    setSuggestionsLoading(true);
    const requestId = ++latestRequestRef.current;
    const sessionToken = getAutocompleteSessionToken();

    const storeSuggestions = (next: GMapsPrediction[]) => {
      if (requestId !== latestRequestRef.current) return;
      setSuggestionsLoading(false);
      setSuggestions(next);
      predictionCacheRef.current.set(cacheKey, next);
      if (predictionCacheRef.current.size > MAX_CACHE_ENTRIES) {
        const firstKey = predictionCacheRef.current.keys().next().value;
        if (typeof firstKey === "string") {
          predictionCacheRef.current.delete(firstKey);
        }
      }
    };

    if (canUseNewApi) {
      // New Places API (2025): promise-based AutocompleteSuggestion
      const autocompleteService = win.google!.maps!.places!.AutocompleteSuggestion!;
      autocompleteService
        .fetchAutocompleteSuggestions({
          input: normalizedInput,
          includedRegionCodes: ["it"],
          sessionToken,
        })
        .then(({ suggestions }) => {
          const mapped: GMapsPrediction[] = suggestions.map((s) => ({
            place_id: s.placePrediction.placeId,
            description: s.placePrediction.text.toString(),
            structured_formatting: {
              main_text: s.placePrediction.mainText.toString(),
              secondary_text: s.placePrediction.secondaryText.toString(),
            },
          }));
          storeSuggestions(mapped);
        })
        .catch(() => {
          storeSuggestions([]);
        });
    } else {
      // Legacy Places API: callback-based AutocompleteService
      autocompleteRef.current!.getPlacePredictions(
        {
          input: normalizedInput,
          componentRestrictions: { country: "it" },
          types: ["address"],
          sessionToken,
        },
        (predictions, status) => {
          // Note: PlacesServiceStatus may be absent in newer library versions
          const OK = win.google?.maps?.places?.PlacesServiceStatus?.OK ?? "OK";
          const next = status === OK && predictions ? predictions : [];
          storeSuggestions(next);
        }
      );
    }
  }, [getAutocompleteSessionToken, ensureGoogleMapsReady]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVal = e.target.value;
      const normalizedInput = newVal.trim();

      setInputValue(newVal);
      onChangeRef.current(newVal);
      setIsAddressValid(false);
      setAddressError(null);
      setDropdownOpen(true);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!normalizedInput) {
        setSuggestions([]);
        setSuggestionsLoading(false);
        resetAutocompleteSession();
        return;
      }

      if (normalizedInput.length < MIN_QUERY_LENGTH) {
        setSuggestions([]);
        setSuggestionsLoading(false);
        return;
      }

      debounceRef.current = setTimeout(() => fetchSuggestions(newVal), DEBOUNCE_MS);
    },
    [fetchSuggestions, resetAutocompleteSession]
  );

  const geocodeRequest = useCallback(
    (request: { placeId?: string; address?: string }): Promise<GMapsGeocoderResult | null> =>
      new Promise((resolve) => {
        if (!geocoderRef.current) { resolve(null); return; }
        geocoderRef.current.geocode(request, (results, status) => {
          const win = window as GMapsWindow;
          const OK = win.google?.maps?.GeocoderStatus.OK ?? "OK";
          resolve(status === OK && results?.[0] ? results[0] : null);
        });
      }),
    []
  );

  const handleSelectSuggestion = useCallback(
    async (suggestion: GMapsPrediction) => {
      resetAutocompleteSession();
      setSuggestions([]);
      setDropdownOpen(false);
      setInputValue(suggestion.description);
      onChangeRef.current(suggestion.description);
      try {
        setIsGeocoding(true);
        const win = window as GMapsWindow;
        const PlaceClass = win.google?.maps?.places?.Place;

        if (typeof PlaceClass === "function") {
          // New Places API (2025): use Place.fetchFields()
          const place = new PlaceClass({ id: suggestion.place_id });
          await place.fetchFields({ fields: ["formattedAddress", "location", "id"] });
          const addr = place.formattedAddress;
          if (addr && place.location) {
            setInputValue(addr);
            onChangeRef.current(addr);
            markValid({
              address: addr,
              lat: place.location.lat(),
              lng: place.location.lng(),
              placeId: place.id ?? suggestion.place_id,
              source: "google",
            });
          } else if (addr) {
            setInputValue(addr);
            onChangeRef.current(addr);
            markValid({
              address: addr,
              lat: null,
              lng: null,
              placeId: place.id ?? suggestion.place_id,
              source: "google",
            });
          } else {
            markInvalid();
          }
        } else {
          // Legacy: use Geocoder
          const result = await geocodeRequest({ placeId: suggestion.place_id });
          if (result) {
            const addr = result.formatted_address;
            setInputValue(addr);
            onChangeRef.current(addr);
            markValid({
              address: addr,
              lat: result.geometry.location.lat(),
              lng: result.geometry.location.lng(),
              placeId: suggestion.place_id,
              source: "google",
            });
          } else {
            markInvalid();
          }
        }
      } catch {
        markInvalid();
      } finally {
        setIsGeocoding(false);
      }
    },
    [geocodeRequest, markValid, markInvalid, resetAutocompleteSession]
  );

  const geocodeManual = useCallback(
    async (address: string): Promise<boolean> => {
      resetAutocompleteSession();

      if (!address.trim()) {
        setIsAddressValid(true);
        setAddressError(null);
        onAddressResolvedRef.current?.({ address: "", lat: null, lng: null, placeId: null, source: null });
        onValidityChangeRef.current?.(true);
        return true;
      }

      // Fallback: if Google Maps is not available, keep manual text input valid.
      if (!geocoderRef.current) {
        const manualAddress = address.trim();
        setInputValue(manualAddress);
        onChangeRef.current(manualAddress);
        markValid({
          address: manualAddress,
          lat: null,
          lng: null,
          placeId: null,
          source: "manual",
        });
        return true;
      }

      try {
        setIsGeocoding(true);
        setAddressError(null);
        const result = await geocodeRequest({ address });
        if (result) {
          const addr = result.formatted_address;
          setInputValue(addr);
          onChangeRef.current(addr);
          markValid({
            address: addr,
            lat: result.geometry.location.lat(),
            lng: result.geometry.location.lng(),
            placeId: result.place_id ?? null,
            source: "manual",
          });
          return true;
        }
        markInvalid();
        return false;
      } catch {
        markInvalid();
        return false;
      } finally {
        setIsGeocoding(false);
      }
    },
    [geocodeRequest, markValid, markInvalid, resetAutocompleteSession]
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

  return (
    <div className="relative">
      <div className="relative">
        <Input
          value={inputValue}
          disabled={disabled || isGeocoding}
          onChange={handleInputChange}
          onFocus={() => {
            setDropdownOpen(true);
            if (inputValue.trim().length >= MIN_QUERY_LENGTH && suggestions.length === 0 && !suggestionsLoading) {
              fetchSuggestions(inputValue);
            }
          }}
          onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="words"
          spellCheck={false}
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          aria-haspopup="listbox"
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
          role="listbox"
          className="absolute z-30 mt-1 w-full rounded-xl border border-border bg-popover shadow-lg overflow-hidden"
        >
          {suggestionsLoading && (
            <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Ricerca indirizzi…
            </div>
          )}
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.place_id}
              type="button"
              role="option"
              aria-selected={false}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelectSuggestion(suggestion)}
              className="w-full text-left px-3 py-2.5 border-b border-border/60 last:border-b-0 hover:bg-muted/50 transition-colors"
            >
              <p className="text-sm font-medium truncate">
                {suggestion.structured_formatting.main_text}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {suggestion.structured_formatting.secondary_text}
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
