type GoogleWindow = Window & {
  google?: {
    maps?: {
      importLibrary?: (libraryName: string) => Promise<unknown>;
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

let googleMapsPlacesApiPromise: Promise<void> | null = null;

async function importRequiredLibraries(win: GoogleWindow): Promise<void> {
  const importLibrary = win.google?.maps?.importLibrary;
  if (typeof importLibrary !== "function") return;

  await Promise.all([
    importLibrary("places"),
    importLibrary("geocoding"),
  ]);
}

// Resolves when the Google Maps Places + Geocoding APIs (loaded by Next.js Script
// in app/orders/layout.tsx) are actually ready to be used.
export function loadGoogleMapsPlacesApi(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Server side"));
  }

  const win = window as GoogleWindow;

  if (hasPlacesApi(win)) {
    return Promise.resolve();
  }

  if (googleMapsPlacesApiPromise) {
    return googleMapsPlacesApiPromise;
  }

  googleMapsPlacesApiPromise = new Promise<void>((resolve, reject) => {
    let resolved = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let importing = false;
    const MAX_ATTEMPTS = 150; // 150 × 100ms = 15s

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

    const ensureLibrariesReady = () => {
      if (importing || !win.google?.maps) return;
      importing = true;

      void importRequiredLibraries(win)
        .catch(() => {
          // Fall back to polling below if dynamic import is unavailable/transiently fails.
        })
        .finally(() => {
          importing = false;
          if (!tryResolve()) {
            pollTimer = setTimeout(poll, 100);
          }
        });
    };

    const onScriptLoad = () => {
      if (tryResolve()) return;
      ensureLibrariesReady();
    };

    window.addEventListener("google-maps-loaded", onScriptLoad);

    const poll = () => {
      if (tryResolve()) return;
      attempts++;
      if (attempts >= MAX_ATTEMPTS) {
        cleanup();
        googleMapsPlacesApiPromise = null;
        reject(new Error("Google Maps Places API not available after 15s"));
        return;
      }
      if (win.google?.maps && !importing) {
        ensureLibrariesReady();
        return;
      }
      pollTimer = setTimeout(poll, 100);
    };

    poll();
  });

  return googleMapsPlacesApiPromise;
}
