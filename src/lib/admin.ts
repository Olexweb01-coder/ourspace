import { safeEqual } from "./server-utils";

/** Admin routes are called server-to-server from the olexweb admin app. */
export function isAdmin(req: Request): boolean {
  const key = process.env.ADMIN_API_KEY;
  if (!key || key.length < 24) return false;
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token.length > 0 && safeEqual(token, key);
}
