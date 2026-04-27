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

type GMapsPlacesStatus = string;

interface GMapsAutocompleteService {
  getPlacePredictions(
    request: {
      input: string;
      componentRestrictions?: { country: string };
      types?: string[];
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

type GMapsWindow = Window & {
  google?: {
    maps?: {
      places?: {
        AutocompleteService: new () => GMapsAutocompleteService;
        PlacesServiceStatus: { OK: string };
      };
      Geocoder: new () => GMapsGeocoder;
      GeocoderStatus: { OK: string };
    };
  };
};

const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

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

  const onChangeRef = useRef(onChange);
  const onAddressResolvedRef = useRef(onAddressResolved);
  const onValidityChangeRef = useRef(onValidityChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onAddressResolvedRef.current = onAddressResolved; }, [onAddressResolved]);
  useEffect(() => { onValidityChangeRef.current = onValidityChange; }, [onValidityChange]);

  // Load Google Maps and create service instances
  useEffect(() => {
    if (!mapsApiKey) return;
    loadGoogleMapsPlacesApi(mapsApiKey)
      .then(() => {
        const win = window as GMapsWindow;
        if (win.google?.maps?.places && win.google?.maps?.Geocoder) {
          autocompleteRef.current = new win.google.maps.places.AutocompleteService();
          geocoderRef.current = new win.google.maps.Geocoder();
        }
      })
      .catch(() => {
        // Fallback: plain text input
      });
  }, []);

  // Sync parent value when reset externally (e.g. switching recent destinations)
  const prevValueRef = useRef(value);
  useEffect(() => {
    if (value !== prevValueRef.current && value !== inputValue) {
      setInputValue(value);
      setSuggestions([]);
      setDropdownOpen(false);
      const valid = value === "";
      setIsAddressValid(valid);
      setAddressError(null);
      prevValueRef.current = value;
      onValidityChangeRef.current?.(valid);
    } else {
      prevValueRef.current = value;
    }
  }, [value, inputValue]);

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

  const fetchSuggestions = useCallback((input: string) => {
    if (!autocompleteRef.current || !input.trim()) {
      setSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }
    setSuggestionsLoading(true);
    autocompleteRef.current.getPlacePredictions(
      { input, componentRestrictions: { country: "it" }, types: ["address"] },
      (predictions, status) => {
        setSuggestionsLoading(false);
        const win = window as GMapsWindow;
        const OK = win.google?.maps?.places?.PlacesServiceStatus.OK ?? "OK";
        setSuggestions(status === OK && predictions ? predictions : []);
      }
    );
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVal = e.target.value;
      setInputValue(newVal);
      onChangeRef.current(newVal);
      setIsAddressValid(false);
      setAddressError(null);
      setDropdownOpen(true);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchSuggestions(newVal), 300);
    },
    [fetchSuggestions]
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
      setSuggestions([]);
      setDropdownOpen(false);
      setInputValue(suggestion.description);
      onChangeRef.current(suggestion.description);
      try {
        setIsGeocoding(true);
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
      } catch {
        markInvalid();
      } finally {
        setIsGeocoding(false);
      }
    },
    [geocodeRequest, markValid, markInvalid]
  );

  const geocodeManual = useCallback(
    async (address: string): Promise<boolean> => {
      if (!address.trim()) {
        setIsAddressValid(true);
        setAddressError(null);
        onAddressResolvedRef.current?.({ address: "", lat: null, lng: null, placeId: null, source: null });
        onValidityChangeRef.current?.(true);
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
    [geocodeRequest, markValid, markInvalid]
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
            if (inputValue && suggestions.length === 0 && !suggestionsLoading) {
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
