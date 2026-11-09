import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { UUID_RE } from "@/lib/server-utils";

// Personal manifest: the installed app opens straight into your own space.
// (On iPhone the home-screen app has its own storage, so the link carries the space id.)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const s = url.searchParams.get("s") || "";
  const m = url.searchParams.get("m") || "";
  const startUrl = UUID_RE.test(s) && UUID_RE.test(m) ? `/?s=${s}&m=${m}` : "/";
  const manifest = {
    id: "/",
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_TAGLINE,
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1d0f18",
    theme_color: "#1d0f18",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" },
  });
}
