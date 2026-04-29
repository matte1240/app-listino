type GoogleWindow = Window & {
  google?: {
    maps?: {
      places?: {
        AutocompleteService?: unknown;
        AutocompleteSuggestion?: { fetchAutocompleteSuggestions?: unknown };
      };
      Geocoder?: unknown;
    };
  };
};

function hasPlacesApi(win: GoogleWindow): boolean {
  const places = win.google?.maps?.places;
  if (!places || typeof win.google?.maps?.Geocoder !== "function") return false;
  const hasLegacy = typeof places.AutocompleteService === "function";
  const hasNew =
    typeof places.AutocompleteSuggestion?.fetchAutocompleteSuggestions === "function";
  return hasLegacy || hasNew;
}

// Poll until the Google Maps script (loaded by Next.js Script in app/orders/layout.tsx) is ready.
// Waits up to 10 seconds to account for slow connections.
export function loadGoogleMapsPlacesApi(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Server side"));
  }

  const win = window as GoogleWindow;

  if (hasPlacesApi(win)) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    let attempts = 0;
    const MAX_ATTEMPTS = 100; // 100 × 100ms = 10s

    const poll = () => {
      if (hasPlacesApi(win)) {
        resolve();
        return;
      }
      attempts++;
      if (attempts >= MAX_ATTEMPTS) {
        reject(new Error("Google Maps Places API not available after 10s"));
        return;
      }
      setTimeout(poll, 100);
    };

    poll();
  });
}
