import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import OfflineBanner from "./OfflineBanner";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mitt dashboard",
  description: "Personlig dashboard for jobb og privat — Salesforce, Asana, Outlook, Teams og nøkkeltall",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Dashboard",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#12161e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Bakgrunnsfargen settes inline på <html> (ikke bare via globals.css sin
    // body-regel) slik at skjermen er mørk fra aller første maling — også i
    // det korte vinduet før stilarket er brukt, og på PWA-oppstart fra
    // hjem-skjermen. Uten dette blinket det hvitt før appen kom opp.
    <html
      lang="nb"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={{ backgroundColor: "#12161e" }}
    >
      <body className="min-h-full">
        <OfflineBanner />
        <ServiceWorkerRegister />
        <TooltipProvider delay={300}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
