import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/lib/auth-context";
import Navbar from "@/components/Navbar";
import PwaRegister from "@/components/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Listino Materiali",
  description: "Consulta e ordina materiali dal listino aziendale",
  manifest: "/manifest.webmanifest",
  applicationName: "Listino Materiali",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Listino",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#005f93",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className="font-sans antialiased bg-background text-foreground">
        <PwaRegister />
        <AuthProvider>
          <Navbar />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
