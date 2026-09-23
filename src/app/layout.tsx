import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Mono, DM_Sans } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import AppShell from "@/components/AppShell";
import PwaRegister from "@/components/PwaRegister";
import PushSync from "@/components/PushSync";
import "./globals.css";
import { Toaster } from "sonner";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", axes: ["opsz"] });
const dmMono = DM_Mono({ subsets: ["latin"], variable: "--font-dm-mono", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Ordini Ivicolors",
  description: "Gestione ordini e consultazione listino Ivicolors",
  manifest: "/manifest.webmanifest",
  applicationName: "Ordini Ivicolors",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Ordini Ivicolors",
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
  themeColor: "#FFFFFF",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={`${dmSans.variable} ${bricolage.variable} ${dmMono.variable}`}>
      <body className="font-sans antialiased">
        <PwaRegister />
        <div className="min-h-dvh bg-background text-foreground">
          <AuthProvider>
            <PushSync />
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </div>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
