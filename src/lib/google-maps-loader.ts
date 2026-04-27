const GOOGLE_MAPS_SCRIPT_ID = "google-maps-places-script";

type GoogleWindow = Window & {
  google?: {
    maps?: {
      places?: {
        AutocompleteService?: unknown;
      };
      Geocoder?: unknown;
    };
  };
};

let loaderPromise: Promise<void> | null = null;

function hasPlacesApi(win: GoogleWindow): boolean {
  return (
    typeof win.google?.maps?.places?.AutocompleteService === "function" &&
    typeof win.google?.maps?.Geocoder === "function"
  );
}

// Poll until Places is ready, up to ~2 seconds
function waitForPlaces(win: GoogleWindow, resolve: () => void, reject: (e: Error) => void, attempts = 0): void {
  if (hasPlacesApi(win)) {
    resolve();
    return;
  }
  if (attempts >= 20) {
    loaderPromise = null;
    reject(new Error("Google Maps loaded without Places library"));
    return;
  }
  setTimeout(() => waitForPlaces(win, resolve, reject, attempts + 1), 100);
}

export function loadGoogleMapsPlacesApi(apiKey: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps Places API is only available in the browser"));
  }

  const win = window as GoogleWindow;

  if (!apiKey) {
    return Promise.reject(new Error("Missing Google Maps API key"));
  }

  if (hasPlacesApi(win)) {
    return Promise.resolve();
  }

  if (loaderPromise) {
    return loaderPromise;
  }

  loaderPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;

    const onScriptLoad = () => {
      if (existingScript) {
        (existingScript as HTMLScriptElement).dataset.loaded = "true";
      }
      waitForPlaces(win, resolve, reject);
    };

    const onScriptError = () => {
      loaderPromise = null;
      reject(new Error("Failed to load Google Maps Places API"));
    };

    if (existingScript) {
      if (hasPlacesApi(win)) {
        resolve();
        return;
      }
      // Script tag exists but may still be loading
      if (existingScript.dataset.loaded === "true") {
        // Script done loading but Places not ready yet — poll
        waitForPlaces(win, resolve, reject);
        return;
      }
      existingScript.addEventListener("load", onScriptLoad, { once: true });
      existingScript.addEventListener("error", onScriptError, { once: true });
      return;
    }

    const params = new URLSearchParams({
      key: apiKey,
      libraries: "places",
      language: "it",
      region: "IT",
    });

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;

    script.addEventListener("load", () => { script.dataset.loaded = "true"; waitForPlaces(win, resolve, reject); }, { once: true });
    script.addEventListener("error", onScriptError, { once: true });

    document.head.appendChild(script);
  });

  return loaderPromise;
}
