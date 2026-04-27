const GOOGLE_MAPS_SCRIPT_ID = "google-maps-places-script";

type GoogleWindow = Window & {
  google?: {
    maps?: {
      places?: unknown;
    };
  };
};

let loaderPromise: Promise<void> | null = null;

function hasPlacesApi(win: GoogleWindow): boolean {
  return Boolean(win.google?.maps?.places);
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

    const fail = (error: Error) => {
      loaderPromise = null;
      reject(error);
    };

    const onLoad = () => {
      if (hasPlacesApi(win)) {
        resolve();
        return;
      }
      fail(new Error("Google Maps loaded without Places library"));
    };

    const onError = () => {
      fail(new Error("Failed to load Google Maps Places API"));
    };

    if (existingScript) {
      if (hasPlacesApi(win)) {
        resolve();
        return;
      }

      if (existingScript.dataset.loaded === "true") {
        fail(new Error("Google Maps script already loaded without Places API"));
        return;
      }

      existingScript.addEventListener("load", onLoad, { once: true });
      existingScript.addEventListener("error", onError, { once: true });
      return;
    }

    const params = new URLSearchParams({
      key: apiKey,
      libraries: "places",
      language: "it",
      region: "IT",
      v: "weekly",
    });

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;

    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        // With loading=async removed, places may still need a tick to populate
        if (hasPlacesApi(win)) {
          resolve();
        } else {
          setTimeout(() => {
            if (hasPlacesApi(win)) {
              resolve();
            } else {
              fail(new Error("Google Maps loaded without Places library"));
            }
          }, 0);
        }
      },
      { once: true }
    );
    script.addEventListener("error", onError, { once: true });

    document.head.appendChild(script);
  });

  return loaderPromise;
}
