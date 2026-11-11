import type { Metadata, Viewport } from "next";
import { Dancing_Script, Figtree, Fraunces, Fredoka, Special_Elite } from "next/font/google";
import SWRegister from "@/components/SWRegister";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display", style: ["normal", "italic"], display: "swap" });
const body = Figtree({ subsets: ["latin"], variable: "--font-body", display: "swap" });
// Status fonts: not preloaded, so they only download when a status actually uses one.
const script = Dancing_Script({ subsets: ["latin"], variable: "--font-script", display: "swap", preload: false });
const round = Fredoka({ subsets: ["latin"], variable: "--font-round", display: "swap", preload: false });
const type = Special_Elite({ subsets: ["latin"], weight: "400", variable: "--font-type", display: "swap", preload: false });

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
    <html lang="en" className={`${display.variable} ${body.variable} ${script.variable} ${round.variable} ${type.variable}`}>
      <body>
        {children}
        <SWRegister />
      </body>
    </html>
  );
}
