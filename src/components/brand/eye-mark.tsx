// Rollmark brand glyph — an eye that watches the room, glances around,
// and blinks on its own (pure CSS keyframes from globals.css; honours
// prefers-reduced-motion). `currentColor` drives the ink so it works on
// primary tiles, muted surfaces and plain text alike.
export function EyeMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
      role="img"
    >
      <g className="rm-eye-blink">
        {/* almond outline */}
        <path
          d="M2 12C4.9 7 8.6 4.7 12 4.7s7.1 2.3 10 7.3c-2.9 5-6.6 7.3-10 7.3S4.9 17 2 12Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <g className="rm-eye-look">
          {/* iris as a donut — the pupil is the surface behind the glyph */}
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 7.8a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4Zm0 2.3a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8Z"
            fill="currentColor"
          />
          {/* gleam */}
          <circle cx="12.85" cy="11.1" r="0.62" fill="currentColor" />
        </g>
      </g>
    </svg>
  )
}
