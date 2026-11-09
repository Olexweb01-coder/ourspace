/** Points the manifest at this device's own space so the home-screen app opens straight into it. */
export function personalizeInstall(spaceId: string, memberId: string) {
  const href = `/api/manifest?s=${spaceId}&m=${memberId}`;
  let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.appendChild(link);
  }
  if (link.getAttribute("href") !== href) link.setAttribute("href", href);
}
