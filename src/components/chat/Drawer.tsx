"use client";
import { useEffect, type ReactNode } from "react";

// The side panel: slides in from the left on phones, always open on a computer.
export default function Drawer({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return (
    <>
      <div className={open ? "drawer-scrim drawer-scrim--open" : "drawer-scrim"} onClick={onClose} aria-hidden="true" />
      <aside className={open ? "drawer glass drawer--open" : "drawer glass"} aria-label="Menu">
        {children}
      </aside>
    </>
  );
}

export function DrawerItem({ icon, label, hint, badge, onClick }: { icon: ReactNode; label: string; hint?: string; badge?: boolean | number; onClick: () => void }) {
  return (
    <button type="button" className="ditem" onClick={onClick}>
      <span className="ditem__icon" aria-hidden="true">{icon}</span>
      <span className="ditem__text"><strong>{label}</strong>{hint && <span>{hint}</span>}</span>
      {typeof badge === "number"
        ? badge > 0 && <span className="count-badge" aria-label={`${badge} waiting`}>{badge > 99 ? "99+" : badge}</span>
        : badge && <span className="dot-badge dot-badge--inline" aria-label="Needs you" />}
    </button>
  );
}
