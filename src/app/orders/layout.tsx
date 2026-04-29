import GoogleMapsScript from "@/components/GoogleMapsScript";

// Server Component: process.env is read at runtime on the server,
// not baked at build time. Works correctly regardless of whether the
// var was present during the build (CI, Docker multi-stage, etc.).
export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  const gmapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  return (
    <>
      <GoogleMapsScript apiKey={gmapsKey} />
      {children}
    </>
  );
}
