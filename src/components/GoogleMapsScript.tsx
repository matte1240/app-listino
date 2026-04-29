"use client";

import Script from "next/script";

// NEXT_PUBLIC_* vars are replaced at build time in client components.
// Reading here at module level guarantees the value is always baked in.
const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export default function GoogleMapsScript() {
  if (!GMAPS_KEY) return null;
  return (
    <Script
      id="google-maps-places"
      src={`https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places&language=it&region=IT`}
      strategy="afterInteractive"
    />
  );
}
