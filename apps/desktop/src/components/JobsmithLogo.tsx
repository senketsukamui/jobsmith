export function JobsmithLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      className={className}
      aria-label="Jobsmith"
    >
      <defs>
        <linearGradient id="js-bg" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" fill="url(#js-bg)" />
      <path
        d="M 54 17 L 54 64 C 54 84 40 84 28 72"
        stroke="white"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M 74 17 L 76.5 24.5 L 84 27 L 76.5 29.5 L 74 37 L 71.5 29.5 L 64 27 L 71.5 24.5 Z"
        fill="#fbbf24"
      />
    </svg>
  )
}
