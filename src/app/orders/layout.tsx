import GoogleMapsScript from "@/components/GoogleMapsScript";
import { getGoogleMapsPublicKey } from "@/lib/google-maps-key";

export const dynamic = "force-dynamic";

export default async function OrdersLayout({ children }: { children: React.ReactNode }) {
  const gmapsKey = (await getGoogleMapsPublicKey()) ?? "";
  return (
    <>
      <GoogleMapsScript apiKey={gmapsKey} />
      {children}
    </>
  );
}
