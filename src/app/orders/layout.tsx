import Script from "next/script";
import { getGoogleMapsPublicKey } from "@/lib/google-maps-key";

export default async function OrdersLayout({ children }: { children: React.ReactNode }) {
  const googleMapsKey = await getGoogleMapsPublicKey();

  return (
    <>
      {googleMapsKey && (
        <Script
          id="google-maps-places"
          src={`https://maps.googleapis.com/maps/api/js?key=${googleMapsKey}&libraries=places&language=it&region=IT`}
          strategy="afterInteractive"
        />
      )}
      {children}
    </>
  );
}
