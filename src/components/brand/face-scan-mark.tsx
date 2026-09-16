// Rollmark brand glyph — the Face ID scan mark. The corner brackets and
// smile are static; the two eyes blink on their own (pure CSS keyframes
// from globals.css, honours prefers-reduced-motion). `currentColor`
// drives the ink so it works on primary tiles and muted surfaces alike.
export function FaceScanMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
      role="img"
    >
      {/* corner brackets */}
      <path
        d="M3 7V5a2 2 0 0 1 2-2h2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17 3h2a2 2 0 0 1 2 2v2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 17v2a2 2 0 0 1-2 2h-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 21H5a2 2 0 0 1-2-2v-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* smile */}
      <path
        d="M8 14s1.5 2 4 2 4-2 4-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* eyes — each blinks via scaleY toward its own centre */}
      <g className="rm-scan-eye">
        <path
          d="M9 7.9v2.2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
      <g className="rm-scan-eye">
        <path
          d="M15 7.9v2.2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>
    </svg>
  )
}
