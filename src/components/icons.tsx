// Minimal geometric nav glyphs (own drawing, 20px, currentColor).
type P = { className?: string };

const base = "fill-none stroke-current stroke-[1.8] stroke-linecap-round stroke-linejoin-round";

export const IconHistory = ({ className }: P) => (
  <svg viewBox="0 0 20 20" className={className} aria-hidden>
    <g className={base}>
      <path d="M3.5 10a6.5 6.5 0 1 1 1.9 4.6" />
      <path d="M3.5 10H2m1.5 0 1-1.5M10 6.5V10l2.5 1.5" />
    </g>
  </svg>
);

export const IconBook = ({ className }: P) => (
  <svg viewBox="0 0 20 20" className={className} aria-hidden>
    <g className={base}>
      <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H16v11.5H5.5A1.5 1.5 0 0 0 4 16z" />
      <path d="M4 16a1.5 1.5 0 0 1 1.5-1.5H16" />
      <path d="M8 7h5" />
    </g>
  </svg>
);

export const IconZap = ({ className }: P) => (
  <svg viewBox="0 0 20 20" className={className} aria-hidden>
    <path d="M11 2 4.5 11H9l-1 7 6.5-9H10l1-7z" className={base} />
  </svg>
);

export const IconMeet = ({ className }: P) => (
  <svg viewBox="0 0 20 20" className={className} aria-hidden>
    <g className={base}>
      <rect x="2.5" y="4" width="11" height="8.5" rx="2" />
      <path d="M13.5 8l4-2.5v7l-4-2.5" />
      <path d="M6 16.5h8" />
    </g>
  </svg>
);

export const IconGear = ({ className }: P) => (
  <svg viewBox="0 0 20 20" className={className} aria-hidden>
    <g className={base}>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" />
    </g>
  </svg>
);

export const IconMic = ({ className }: P) => (
  <svg viewBox="0 0 20 20" className={className} aria-hidden>
    <g className={base}>
      <rect x="7.5" y="2.5" width="5" height="8" rx="2.5" />
      <path d="M5 9.5a5 5 0 0 0 10 0M10 14.5V17M7.5 17h5" />
    </g>
  </svg>
);

export const IconCheck = ({ className }: P) => (
  <svg viewBox="0 0 20 20" className={className} aria-hidden>
    <path d="M4 10.5l4 4 8-9" className={base} />
  </svg>
);
