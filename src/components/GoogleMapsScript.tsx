"use client";

import Script from "next/script";

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
        window.dispatchEvent(new Event("google-maps-loaded"));
      }}
    />
  );
}
