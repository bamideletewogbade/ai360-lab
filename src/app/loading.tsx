export default function Loading() {
  return (
    <main className="route-loading" role="status" aria-live="polite">
      <div className="route-loading-visual" aria-hidden="true">
        <span>AI</span><i /><i /><i />
      </div>
      <p><b>AI360</b></p>
      <small>Preparing your next step</small>
    </main>
  )
}
