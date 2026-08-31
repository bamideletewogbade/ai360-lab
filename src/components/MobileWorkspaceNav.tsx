'use client'

export type MobileWorkspaceExperience = 'chat' | 'agent' | 'studio' | 'apps' | 'market' | 'media'

type Props = {
  experience: MobileWorkspaceExperience
  onSelectChats: () => void
  onSelectTools: () => void
  onSelectProjects: () => void
  onSelectMedia: () => void
}

function NavIcon({ kind }: { kind: 'chat' | 'tools' | 'project' | 'media' }) {
  if (kind === 'chat') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 3v-13a2 2 0 0 1 1-2Z" /></svg>
  if (kind === 'tools') return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.5" /><rect x="14" y="3.5" width="6.5" height="6.5" rx="1.5" /><rect x="3.5" y="14" width="6.5" height="6.5" rx="1.5" /><path d="M17.25 14v6.5M14 17.25h6.5" /></svg>
  if (kind === 'project') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5h6l2-2h9v13h-17Z" /><path d="M3.5 9.5h17" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><circle cx="8.5" cy="9" r="1.5" /><path d="m4.5 17 4.5-4.5 3.2 3.2 2.3-2.3 5 5" /></svg>
}

/**
 * Touch workspace navigation: the four primary destinations, always visible.
 *
 * There used to be a fifth "More" tab opening a sheet, but everything in it
 * already had a home — search, recents, settings and help live in the drawer
 * behind the header's menu button, and account lives in the header itself. The
 * sheet's own first row merely reopened that drawer, so a primary destination
 * was being spent on a door to a door. Tools took the slot instead, because an
 * overflow menu is the wrong place for somewhere people are meant to go.
 *
 * The order mirrors the sidebar, and puts the catalogue after the three work
 * surfaces rather than above them — "Examples are secondary".
 */
export function MobileWorkspaceNav({
  experience,
  onSelectChats,
  onSelectTools,
  onSelectProjects,
  onSelectMedia,
}: Props) {
  // Research shares the chat surface, so it must not read as "nowhere".
  const chatsActive = experience === 'chat' || experience === 'agent'

  return (
    <nav className="mobile-workspace-nav" aria-label="Workspace">
      <button type="button" className={chatsActive ? 'active' : ''} aria-current={chatsActive ? 'page' : undefined} onClick={onSelectChats}>
        <NavIcon kind="chat" /><span>Chats</span>
      </button>
      <button type="button" className={experience === 'studio' ? 'active' : ''} aria-current={experience === 'studio' ? 'page' : undefined} onClick={onSelectProjects}>
        <NavIcon kind="project" /><span>Projects</span>
      </button>
      <button type="button" className={experience === 'media' ? 'active' : ''} aria-current={experience === 'media' ? 'page' : undefined} aria-label="Media: create images and video" onClick={onSelectMedia}>
        <NavIcon kind="media" /><span>Media</span>
      </button>
      <button type="button" className={experience === 'market' ? 'active' : ''} aria-current={experience === 'market' ? 'page' : undefined} aria-label="Tools and kits" onClick={onSelectTools}>
        <NavIcon kind="tools" /><span>Tools</span>
      </button>
    </nav>
  )
}
