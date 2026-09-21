"use client";

import Script from "next/script";

declare global {
  interface Window {
    __googleMapsScriptState?: "loaded" | "error";
  }
}

interface Props {
  apiKey: string;
}

export default function GoogleMapsScript({ apiKey }: Props) {
  if (!apiKey) return null;

  return (
    <Script
      id="google-maps-places"
      src={`https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async&libraries=places&language=it&region=IT`}
      strategy="afterInteractive"
      onLoad={() => {
        window.__googleMapsScriptState = "loaded";
        window.dispatchEvent(new Event("google-maps-loaded"));
      }}
      onError={() => {
        window.__googleMapsScriptState = "error";
        window.dispatchEvent(new Event("google-maps-error"));
      }}
    />
  );
}
