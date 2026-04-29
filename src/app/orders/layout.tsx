import Script from "next/script";

const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {GMAPS_KEY && (
        <Script
          id="google-maps-places"
          src={`https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places&language=it&region=IT`}
          strategy="afterInteractive"
        />
      )}
      {children}
    </>
  );
}
