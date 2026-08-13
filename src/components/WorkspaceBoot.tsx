import { BrandMark } from '@/components/BrandMark'

export function WorkspaceBoot({ authLoaded, signedIn }: { authLoaded: boolean; signedIn: boolean }) {
  const status = !authLoaded
    ? 'Checking your secure session'
    : signedIn
      ? 'Restoring your workspace'
      : 'Opening your workspace'

  return (
    <main className="session-bridge" role="status" aria-live="polite">
      <div className="session-brand">
        <BrandMark width={154} height={38} priority />
      </div>
      <div className="session-orbit" aria-hidden="true">
        <i /><i /><i />
        <span><BrandMark kind="icon" width={43} height={50} alt="" priority /></span>
      </div>
      <p>{status}</p>
      <div className="session-progress" aria-hidden="true"><span /></div>
      <small>Your ideas, files and progress stay connected.</small>
    </main>
  )
}
