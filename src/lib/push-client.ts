import { api } from "./api";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIOS(): boolean {
  return typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

/** Asks permission (must be called from a tap) and saves the subscription. */
export async function enableNotifications(): Promise<"on" | "denied" | "unsupported"> {
  if (!pushSupported()) return "unsupported";
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    await api("/api/push/status", { body: { state: "off" } }).catch(() => {});
    return "denied";
  }
  const reg = (await registerSW()) && (await navigator.serviceWorker.ready);
  if (!reg) return "unsupported";
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  await api("/api/push/subscribe", { body: { subscription: sub.toJSON() } });
  return "on";
}

/** Runs on every unlock: tells the partner if notifications were switched off. */
export async function reportNotificationState(): Promise<"on" | "off" | "unknown"> {
  if (!pushSupported()) return "unknown";
  if (Notification.permission === "denied") {
    await api("/api/push/status", { body: { state: "off" } }).catch(() => {});
    return "off";
  }
  if (Notification.permission !== "granted") return "unknown";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (!sub) {
    await api("/api/push/status", { body: { state: "off" } }).catch(() => {});
    return "off";
  }
  await api("/api/push/subscribe", { body: { subscription: sub.toJSON() } }).catch(() => {});
  return "on";
}
