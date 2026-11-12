import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { DISGUISE_ICONS, validName } from "@/lib/disguise";
import { UUID_RE } from "@/lib/server-utils";

// Personal manifest: the installed app opens straight into your own space.
// (On iPhone the home-screen app has its own storage, so the link carries the space id.)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const s = url.searchParams.get("s") || "";
  const m = url.searchParams.get("m") || "";
  const startUrl = UUID_RE.test(s) && UUID_RE.test(m) ? `/?s=${s}&m=${m}` : "/";
  // Disguise (chosen on the phone): another name and icon for the installed app.
  const n = url.searchParams.get("n") || "";
  const i = url.searchParams.get("i") || "";
  const cm = url.searchParams.get("cm") || "";
  const v = Number(url.searchParams.get("v")) || 0;
  const name = validName(n) ? n : null;
  const builtIn = (DISGUISE_ICONS as readonly string[]).includes(i) ? i : null;
  const custom = i === "custom" && UUID_RE.test(cm) && v > 0;
  const disguisedIcons = custom
    ? [
        { src: `/api/app-icon?m=${cm}&s=192&v=${v}`, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: `/api/app-icon?m=${cm}&s=512&v=${v}`, sizes: "512x512", type: "image/png", purpose: "any" },
      ]
    : builtIn
      ? [
          { src: `/icons/disguise/${builtIn}-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
          { src: `/icons/disguise/${builtIn}-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
          { src: `/icons/disguise/${builtIn}-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
        ]
      : null;
  const manifest = {
    id: "/",
    name: name ?? APP_NAME,
    short_name: name ?? APP_NAME,
    description: name ? name : APP_TAGLINE,
    start_url: startUrl,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1d0f18",
    theme_color: "#1d0f18",
    icons: disguisedIcons ?? [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-store" },
  });
}
