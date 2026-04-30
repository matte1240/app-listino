type GoogleWindow = Window & {
  __googleMapsScriptState?: "loaded" | "error";
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
const MAX_ATTEMPTS = 180; // 180 × 100ms = 18s
const POLL_INTERVAL_MS = 100;
const IMPORT_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function importRequiredLibraries(win: GoogleWindow): Promise<void> {
  const importLibrary = win.google?.maps?.importLibrary;
  // Gracefully support the legacy `libraries=places` loader path where the
  // modular importLibrary API may not be exposed yet.
  if (typeof importLibrary !== "function") return;

  await Promise.all([
    withTimeout(importLibrary("places"), IMPORT_TIMEOUT_MS),
    withTimeout(importLibrary("geocoding"), IMPORT_TIMEOUT_MS),
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

  const nextPromise = new Promise<void>((resolve, reject) => {
    let settled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let importing = false;

    const cleanup = () => {
      window.removeEventListener("google-maps-loaded", onScriptLoad);
      window.removeEventListener("google-maps-error", onScriptError);
      if (pollTimer !== null) clearTimeout(pollTimer);
    };

    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (googleMapsPlacesApiPromise === nextPromise) {
        googleMapsPlacesApiPromise = null;
      }
      reject(error);
    };

    const tryResolve = (): boolean => {
      if (settled) return true;
      if (hasPlacesApi(win)) {
        settled = true;
        cleanup();
        resolve();
        return true;
      }
      return false;
    };

    const ensureLibrariesReady = () => {
      if (settled || importing || !win.google?.maps) return;
      importing = true;

      importRequiredLibraries(win)
        .catch((error) => {
          console.warn("Google Maps library import failed, will continue polling...", error);
        })
        .finally(() => {
          importing = false;
          if (settled) return;
          if (!tryResolve()) {
            pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
          }
        });
    };

    const onScriptLoad = () => {
      if (settled) return;
      if (tryResolve()) return;
      ensureLibrariesReady();
    };

    const onScriptError = () => {
      finishReject(new Error("Google Maps script failed to load"));
    };

    window.addEventListener("google-maps-loaded", onScriptLoad);
    window.addEventListener("google-maps-error", onScriptError);

    if (win.__googleMapsScriptState === "error") {
      onScriptError();
      return;
    }

    const poll = () => {
      if (settled) return;
      if (tryResolve()) return;

      attempts++;
      if (attempts >= MAX_ATTEMPTS) {
        finishReject(new Error("Google Maps Places API not available after 18s"));
        return;
      }

      if (win.google?.maps && !importing) {
        // Skip scheduling another timer here because ensureLibrariesReady()
        // schedules the next poll itself after the import attempt finishes.
        ensureLibrariesReady();
        return;
      }

      pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
  });

  googleMapsPlacesApiPromise = nextPromise;

  return googleMapsPlacesApiPromise;
}
