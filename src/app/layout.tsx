import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/lib/auth-context";
import Navbar from "@/components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Listino Materiali",
  description: "Consulta e ordina materiali dal listino aziendale",
  icons: {
    icon: "/IVICOLORS_marchio.png",
    apple: "/IVICOLORS_marchio.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className="font-sans antialiased bg-background text-foreground">
        <AuthProvider>
          <Navbar />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
