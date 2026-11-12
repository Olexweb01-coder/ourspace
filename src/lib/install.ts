import { APP_NAME } from "./brand";
import { iconUrl, loadDisguise, manifestParams, shareWithNotifications } from "./disguise";

function setLink(rel: string, href: string) {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  if (link.getAttribute("href") !== href) link.setAttribute("href", href);
}

function setMeta(name: string, content: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = name;
    document.head.appendChild(meta);
  }
  if (meta.content !== content) meta.content = content;
}

/**
 * Points the manifest at this device's own space so the home-screen app opens straight into it,
 * and applies this phone's disguise (name and icon) if it has one.
 */
export function personalizeInstall(spaceId: string, memberId: string) {
  const d = loadDisguise();
  setLink("manifest", `/api/manifest?s=${spaceId}&m=${memberId}${manifestParams(d)}`);
  // iPhone reads these when you add the app to the Home Screen.
  setLink("apple-touch-icon", d?.on ? iconUrl(d, 180) : "/icons/apple-touch-icon.png");
  setMeta("apple-mobile-web-app-title", d?.on ? d.name : APP_NAME);
  document.title = d?.on ? d.name : APP_NAME;
  void shareWithNotifications(d);
}
