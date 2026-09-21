'use client'

export default function Error({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{ display: 'flex', minHeight: '50vh', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '1rem' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>Something went wrong</h2>
      <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1rem' }}>An error occurred while loading this view.</p>
      <button
        onClick={() => reset()}
        style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 500 }}
      >
        Try again
      </button>
    </div>
  )
}
