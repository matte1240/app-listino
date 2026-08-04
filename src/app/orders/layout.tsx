// Le pagine sotto /orders leggono il DB a runtime: niente prerender in build.
export const dynamic = "force-dynamic";

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
