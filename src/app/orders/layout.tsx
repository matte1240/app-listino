import GoogleMapsScript from "@/components/GoogleMapsScript";

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GoogleMapsScript />
      {children}
    </>
  );
}
