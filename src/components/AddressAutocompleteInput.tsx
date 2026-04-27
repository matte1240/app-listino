"use client";

import {
  useEffect,
  useRef,
  type ComponentProps,
} from "react";
import { Input } from "@/components/ui/input";
import { loadGoogleMapsPlacesApi } from "@/lib/google-maps-loader";

type AutocompleteListener = { remove: () => void };

type PlaceResultLike = {
  formatted_address?: string;
  name?: string;
};

type AutocompleteLike = {
  addListener: (event: string, handler: () => void) => AutocompleteListener;
  getPlace: () => PlaceResultLike;
};

type GoogleMapsLike = {
  maps?: {
    places?: {
      Autocomplete?: new (
        input: HTMLInputElement,
        options?: {
          componentRestrictions?: { country: string | string[] };
          fields?: string[];
          types?: string[];
        }
      ) => AutocompleteLike;
    };
  };
};

type WindowWithGoogle = Window & {
  google?: GoogleMapsLike;
};

interface AddressAutocompleteInputProps
  extends Omit<ComponentProps<"input">, "value" | "onChange"> {
  value: string;
  onChange: (value: string) => void;
}

const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

export default function AddressAutocompleteInput({
  value,
  onChange,
  disabled,
  ...inputProps
}: AddressAutocompleteInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let isMounted = true;
    let listener: AutocompleteListener | null = null;

    if (disabled || !mapsApiKey || !inputRef.current) {
      return () => {
        // No external listener to clean up in fallback mode.
      };
    }

    loadGoogleMapsPlacesApi(mapsApiKey)
      .then(() => {
        if (!isMounted || !inputRef.current) return;

        const maps = (window as WindowWithGoogle).google;
        const AutocompleteCtor = maps?.maps?.places?.Autocomplete;

        if (!AutocompleteCtor) {
          return;
        }

        const autocomplete = new AutocompleteCtor(inputRef.current, {
          types: ["address"],
          fields: ["formatted_address", "name"],
          componentRestrictions: { country: "it" },
        });

        listener = autocomplete.addListener("place_changed", () => {
          const place = autocomplete.getPlace();
          const selectedValue =
            place.formatted_address?.trim() ||
            place.name?.trim() ||
            inputRef.current?.value.trim() ||
            "";

          onChangeRef.current(selectedValue);
          inputRef.current?.blur();
        });
      })
      .catch(() => {
        // Fallback: keep plain manual input when Places is unavailable.
      });

    return () => {
      isMounted = false;
      listener?.remove();
    };
  }, [disabled]);

  return (
    <Input
      ref={inputRef}
      value={value}
      disabled={disabled}
      onChange={(event) => onChangeRef.current(event.target.value)}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="words"
      spellCheck={false}
      {...inputProps}
    />
  );
}
