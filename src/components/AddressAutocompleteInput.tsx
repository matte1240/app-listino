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
import usePlacesAutocomplete, { getGeocode, getLatLng } from "use-places-autocomplete";
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
  /** Validate the current address text, geocoding if necessary. Returns true if valid. */
  validateAddress: () => Promise<boolean>;
}

interface AddressAutocompleteInputProps
  extends Omit<ComponentProps<"input">, "value" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
  onAddressResolved?: (data: AddressData) => void;
  onValidityChange?: (isValid: boolean) => void;
}

const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

const AddressAutocompleteInput = forwardRef<
  AddressAutocompleteInputHandle,
  AddressAutocompleteInputProps
>(function AddressAutocompleteInput(
  { value, onChange, onAddressResolved, onValidityChange, disabled, ...inputProps },
  ref
) {
  const [apiReady, setApiReady] = useState(false);

  // Load the Google Maps Places API once
  useEffect(() => {
    if (!mapsApiKey) return;
    loadGoogleMapsPlacesApi(mapsApiKey)
      .then(() => setApiReady(true))
      .catch(() => {
        // Fallback: plain text input when API unavailable
      });
  }, []);

  const {
    value: inputValue,
    setValue: setInputValue,
    suggestions: { status, data: suggestions, loading: suggestionsLoading },
    clearSuggestions,
    init,
  } = usePlacesAutocomplete({
    requestOptions: {
      componentRestrictions: { country: "it" },
      types: ["address"],
    },
    debounce: 300,
    defaultValue: value,
    initOnMount: false,
  });

  // Initialize the Places service once the API script has loaded
  useEffect(() => {
    if (apiReady) {
      init();
    }
  }, [apiReady, init]);

  // Track validation state
  const [isAddressValid, setIsAddressValid] = useState(value === "");
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Keep refs stable for callbacks
  const onChangeRef = useRef(onChange);
  const onAddressResolvedRef = useRef(onAddressResolved);
  const onValidityChangeRef = useRef(onValidityChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onAddressResolvedRef.current = onAddressResolved; }, [onAddressResolved]);
  useEffect(() => { onValidityChangeRef.current = onValidityChange; }, [onValidityChange]);

  // Sync parent value → hook when parent resets (e.g. switching recent destinations)
  const prevValueRef = useRef(value);
  useEffect(() => {
    if (value !== prevValueRef.current && value !== inputValue) {
      setInputValue(value, false); // false = don't fetch suggestions
      clearSuggestions();
      // If reset to empty, consider valid (field is optional)
      const valid = value === "";
      setIsAddressValid(valid);
      setAddressError(null);
      prevValueRef.current = value;
      onValidityChangeRef.current?.(valid);
    } else {
      prevValueRef.current = value;
    }
  }, [value, inputValue, setInputValue, clearSuggestions]);

  const markValid = useCallback(
    (data: AddressData) => {
      setIsAddressValid(true);
      setAddressError(null);
      onAddressResolvedRef.current?.(data);
      onValidityChangeRef.current?.(true);
    },
    []
  );

  const markInvalid = useCallback(() => {
    setIsAddressValid(false);
    setAddressError("Inserisci un indirizzo valido o seleziona un suggerimento");
    onValidityChangeRef.current?.(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVal = e.target.value;
      setInputValue(newVal);
      onChangeRef.current(newVal);
      // User typing after a validated selection → invalidate
      setIsAddressValid(false);
      setAddressError(null);
      setDropdownOpen(true);
    },
    [setInputValue]
  );

  const handleSelectSuggestion = useCallback(
    async (suggestion: { place_id: string; description: string }) => {
      clearSuggestions();
      setDropdownOpen(false);
      setInputValue(suggestion.description, false);
      onChangeRef.current(suggestion.description);

      try {
        setIsGeocoding(true);
        const results = await getGeocode({ placeId: suggestion.place_id });
        const { lat, lng } = await getLatLng(results[0]);
        const formattedAddress = results[0].formatted_address ?? suggestion.description;
        setInputValue(formattedAddress, false);
        onChangeRef.current(formattedAddress);
        markValid({
          address: formattedAddress,
          lat,
          lng,
          placeId: suggestion.place_id,
          source: "google",
        });
      } catch {
        markInvalid();
      } finally {
        setIsGeocoding(false);
      }
    },
    [clearSuggestions, setInputValue, markValid, markInvalid]
  );

  const geocodeManual = useCallback(
    async (address: string): Promise<boolean> => {
      if (!address.trim()) {
        setIsAddressValid(true);
        setAddressError(null);
        onAddressResolvedRef.current?.({
          address: "",
          lat: null,
          lng: null,
          placeId: null,
          source: null,
        });
        onValidityChangeRef.current?.(true);
        return true;
      }
      try {
        setIsGeocoding(true);
        setAddressError(null);
        const results = await getGeocode({ address });
        const { lat, lng } = await getLatLng(results[0]);
        const formattedAddress = results[0].formatted_address ?? address;
        setInputValue(formattedAddress, false);
        onChangeRef.current(formattedAddress);
        markValid({
          address: formattedAddress,
          lat,
          lng,
          placeId: results[0].place_id ?? null,
          source: "manual",
        });
        return true;
      } catch {
        markInvalid();
        return false;
      } finally {
        setIsGeocoding(false);
      }
    },
    [setInputValue, markValid, markInvalid]
  );

  // Expose validateAddress via ref
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

  const showDropdown =
    dropdownOpen && (suggestionsLoading || (status === "OK" && suggestions.length > 0));

  return (
    <div className="relative">
      <div className="relative">
        <Input
          value={inputValue}
          disabled={disabled || isGeocoding}
          onChange={handleInputChange}
          onFocus={() => setDropdownOpen(true)}
          onBlur={() => {
            // Delay to allow click on suggestion items
            setTimeout(() => setDropdownOpen(false), 150);
          }}
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
