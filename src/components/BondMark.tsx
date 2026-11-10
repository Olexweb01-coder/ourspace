import { useId } from "react";

// Two circles that overlap where a heart sits. Your photos fill them once you add them.
type Props = {
  a?: string;
  b?: string;
  aSrc?: string | null;
  bSrc?: string | null;
  size?: number;
  alive?: boolean;
  title?: string;
};

export default function BondMark({ a = "", b = "", aSrc, bSrc, size = 56, alive = false, title = "The two of you" }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg
      className={alive ? "bond bond--alive" : "bond"}
      width={size * 1.46}
      height={size}
      viewBox="0 0 76 52"
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={`${uid}ga`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8e2f52" />
          <stop offset="1" stopColor="#4d1631" />
        </linearGradient>
        <linearGradient id={`${uid}gb`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0a3b4" />
          <stop offset="1" stopColor="#c25d7a" />
        </linearGradient>
        <clipPath id={`${uid}ca`}><circle cx="26" cy="26" r="22" /></clipPath>
        <clipPath id={`${uid}cb`}><circle cx="50" cy="26" r="22" /></clipPath>
      </defs>

      <circle cx="26" cy="26" r="22" fill={`url(#${uid}ga)`} />
      {aSrc
        ? <image href={aSrc} x="4" y="4" width="44" height="44" preserveAspectRatio="xMidYMid slice" clipPath={`url(#${uid}ca)`} />
        : <text x="20" y="31.5" className="bond__letter" fill="#fbe7ec" textAnchor="middle">{a}</text>}

      <circle cx="50" cy="26" r="22" fill={`url(#${uid}gb)`} opacity={bSrc ? 1 : 0.92} />
      {bSrc && <image href={bSrc} x="28" y="4" width="44" height="44" preserveAspectRatio="xMidYMid slice" clipPath={`url(#${uid}cb)`} />}
      {bSrc && <circle cx="50" cy="26" r="22" fill="none" stroke="var(--ink, #1d0f18)" strokeWidth="1.5" />}
      {!bSrc && <text x="56" y="31.5" className="bond__letter" fill="#3a1226" textAnchor="middle">{b}</text>}

      <path
        className="bond__heart"
        d="M38 33.5c-.3 0-.6-.1-.8-.3-3.6-3.2-6.2-5.4-6.2-8.3 0-2.1 1.6-3.7 3.7-3.7 1.3 0 2.5.6 3.3 1.7.8-1.1 2-1.7 3.3-1.7 2.1 0 3.7 1.6 3.7 3.7 0 2.9-2.6 5.1-6.2 8.3-.2.2-.5.3-.8.3z"
        fill="#f6c97f"
        stroke="#1d0f18"
        strokeWidth="0.6"
      />
    </svg>
  );
}
