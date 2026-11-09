import type { Metadata, Viewport } from "next";
import { Figtree, Fraunces } from "next/font/google";
import SWRegister from "@/components/SWRegister";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", style: ["normal", "italic"], display: "swap" });
const body = Figtree({ subsets: ["latin"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_TAGLINE,
  manifest: "/api/manifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1d0f18",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        {children}
        <SWRegister />
      </body>
    </html>
  );
}
