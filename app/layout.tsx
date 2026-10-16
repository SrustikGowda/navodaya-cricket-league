import type { Metadata, Viewport } from "next";
import { NavTrail } from "@/components/back-button";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "Navodaya Cricket League", template: "%s · NCL" },
  description: "Navodaya Cricket League 2026, the 15th edition, hosted by the JNVCKM Alumni Group on 15 November at Loyala School Ground, Bengaluru.",
  applicationName: "NCL 2026",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/brand/jnv-logo.png", apple: "/brand/jnv-logo.png" },
  appleWebApp: { capable: true, title: "NCL 2026", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <a className="skip" href="#content">Skip to content</a>
        <NavTrail />
        {children}
      </body>
    </html>
  );
}
