import GoogleMapsScript from "@/components/GoogleMapsScript";
import { readEnvValue } from "@/lib/read-env-file";

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  const gmapsKey = readEnvValue("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
  return (
    <>
      <GoogleMapsScript apiKey={gmapsKey} />
      {children}
    </>
  );
}
