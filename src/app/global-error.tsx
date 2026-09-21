'use client'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ display: 'flex', minHeight: '100vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Something went wrong</h2>
        <button
          onClick={() => reset()}
          style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 500 }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
