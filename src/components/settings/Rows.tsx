"use client";
import type { ReactNode } from "react";

// Settings building blocks: a titled group, a row (label, explanation, control on the right), and a switch row.
export function SGroup({ title, foot, children }: { title: string; foot?: string; children: ReactNode }) {
  return (
    <section className="sgroup" aria-label={title}>
      <h3 className="sgroup__title">{title}</h3>
      <div className="sgroup__card">{children}</div>
      {foot && <p className="sgroup__foot">{foot}</p>}
    </section>
  );
}

export function SRow({ label, hint, onClick, children }: { label: string; hint?: ReactNode; onClick?: () => void; children?: ReactNode }) {
  const text = <span className="srow__text"><strong>{label}</strong>{hint && <small>{hint}</small>}</span>;
  if (onClick) {
    return (
      <button type="button" className="srow srow--tap" onClick={onClick}>
        {text}
        {children ?? <svg className="srow__chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>}
      </button>
    );
  }
  return <div className="srow">{text}{children && <span className="srow__end">{children}</span>}</div>;
}

export function SBlock({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="srow srow--block">
      <span className="srow__text"><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
      <div className="srow__body">{children}</div>
    </div>
  );
}

export function SSwitch({ label, hint, on, onChange, disabled }: { label: string; hint?: ReactNode; on: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" className="srow srow--tap" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)}>
      <span className="srow__text"><strong>{label}</strong>{hint && <small>{hint}</small>}</span>
      <span className={on ? "switch switch--on" : "switch"} aria-hidden="true" />
    </button>
  );
}
