// Two circles that overlap where a heart sits. Photos replace initials in phase 2.
type Props = {
  a?: string;
  b?: string;
  size?: number;
  alive?: boolean;
  title?: string;
};

export default function BondMark({ a = "", b = "", size = 56, alive = false, title = "The two of you" }: Props) {
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
        <linearGradient id="bond-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8e2f52" />
          <stop offset="1" stopColor="#4d1631" />
        </linearGradient>
        <linearGradient id="bond-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0a3b4" />
          <stop offset="1" stopColor="#c25d7a" />
        </linearGradient>
      </defs>
      <circle cx="26" cy="26" r="22" fill="url(#bond-a)" />
      <circle cx="50" cy="26" r="22" fill="url(#bond-b)" opacity="0.92" />
      <text x="20" y="31.5" className="bond__letter" fill="#fbe7ec" textAnchor="middle">{a}</text>
      <text x="56" y="31.5" className="bond__letter" fill="#3a1226" textAnchor="middle">{b}</text>
      <path
        className="bond__heart"
        d="M38 33.5c-.3 0-.6-.1-.8-.3-3.6-3.2-6.2-5.4-6.2-8.3 0-2.1 1.6-3.7 3.7-3.7 1.3 0 2.5.6 3.3 1.7.8-1.1 2-1.7 3.3-1.7 2.1 0 3.7 1.6 3.7 3.7 0 2.9-2.6 5.1-6.2 8.3-.2.2-.5.3-.8.3z"
        fill="#f6c97f"
      />
    </svg>
  );
}
