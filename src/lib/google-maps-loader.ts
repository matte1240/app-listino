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

// Resolves when the Google Maps Places API (loaded by Next.js Script in app/orders/layout.tsx) is ready.
// Uses two complementary mechanisms:
//   1. A "google-maps-loaded" DOM event dispatched by GoogleMapsScript's onLoad callback.
//   2. A 100 ms polling fallback (up to 10 s) in case the event fires before this function is called.
export function loadGoogleMapsPlacesApi(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Server side"));
  }

  const win = window as GoogleWindow;

  if (hasPlacesApi(win)) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    let resolved = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 100; // 100 × 100ms = 10s

    const cleanup = () => {
      window.removeEventListener("google-maps-loaded", onScriptLoad);
      if (pollTimer !== null) clearTimeout(pollTimer);
    };

    const tryResolve = (): boolean => {
      if (resolved) return true;
      if (hasPlacesApi(win)) {
        resolved = true;
        cleanup();
        resolve();
        return true;
      }
      return false;
    };

    // Fired by GoogleMapsScript's onLoad — poll briefly after the event to let
    // the async bootstrap finish setting up window.google.maps.places.
    const onScriptLoad = () => {
      if (tryResolve()) return;
      // The "loading=async" bootstrap may need a few more ticks after the script
      // executes, so keep polling if the API isn't ready yet.
    };

    window.addEventListener("google-maps-loaded", onScriptLoad);

    const poll = () => {
      if (tryResolve()) return;
      attempts++;
      if (attempts >= MAX_ATTEMPTS) {
        cleanup();
        reject(new Error("Google Maps Places API not available after 10s"));
        return;
      }
      pollTimer = setTimeout(poll, 100);
    };

    poll();
  });
}
