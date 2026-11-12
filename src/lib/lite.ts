// Battery saver, on this phone: the moving decorations hold still and the frosted glass becomes a solid tint.
const KEY = "ourspace:lite";
export function isLite(): boolean { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } }
export function applyLite(on = isLite()) { document.documentElement.classList.toggle("lite", on); }
export function setLite(on: boolean) { try { if (on) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* private mode */ } applyLite(on); }
