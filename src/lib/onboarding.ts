/**
 * First-run personalization.
 *
 * A two-question intake (who you are, what you want to do) turns the generic
 * empty state into one shaped around the person. The research this follows is
 * blunt: branching the first run on a self-reported goal lifts activation more
 * than any other cheap change, and the goal is a stronger signal than the role.
 * So the suggested prompts key off the goal, and the role tunes the greeting.
 *
 * Kept pure and dependency free so it is directly unit testable and can be
 * reused by any surface that needs the same personalization.
 */

export type OnboardingRole = 'student' | 'professional' | 'entrepreneur' | 'organization'
export type OnboardingGoal = 'learn' | 'write' | 'research' | 'business'
export type OnboardingProfile = { role: OnboardingRole; goal: OnboardingGoal }
export type SuggestedTask = { icon: string; label: string; prompt: string }

export const ONBOARDING_ROLES: Array<{ id: OnboardingRole; label: string; detail: string }> = [
  { id: 'student', label: 'Student', detail: 'Learning, studying or preparing' },
  { id: 'professional', label: 'Professional', detail: 'Working a job or a role' },
  { id: 'entrepreneur', label: 'Entrepreneur', detail: 'Running or starting a business' },
  { id: 'organization', label: 'Organization', detail: 'A team, school or NGO' },
]

export const ONBOARDING_GOALS: Array<{ id: OnboardingGoal; label: string; detail: string }> = [
  { id: 'learn', label: 'Learn something', detail: 'Understand a topic or prepare' },
  { id: 'write', label: 'Write & communicate', detail: 'Messages, replies and documents' },
  { id: 'research', label: 'Research a decision', detail: 'Find current, sourced answers' },
  { id: 'business', label: 'Grow a business', detail: 'Customers, marketing and sales' },
]

/** The general set shown to anyone who skips the intake. */
export const DEFAULT_TASKS: SuggestedTask[] = [
  { icon: 'Aa', label: 'Write an SMS', prompt: 'Draft a friendly SMS reminding parents about PTA this Friday at 3pm.' },
  { icon: '≡', label: 'Summarize a document', prompt: 'Summarize this document into key points and clear next steps.' },
  { icon: 'PR', label: 'Draft a proposal', prompt: 'Write a short business proposal for a smoothie stand in Accra.' },
  { icon: 'WK', label: 'Plan my week', prompt: 'Help me build a practical plan for my week. Ask what commitments and priorities I have.' },
]

// Ghana-framed prompt sets. The goal picks the set; every prompt lands one
// concrete, useful outcome rather than describing a feature.
const GOAL_TASKS: Record<OnboardingGoal, SuggestedTask[]> = {
  learn: [
    { icon: 'Aa', label: 'Explain it simply', prompt: 'Explain this topic to me in simple terms with an everyday example: ' },
    { icon: 'SP', label: 'Make a study plan', prompt: 'Help me build a study plan. Ask what I am preparing for and how much time I have.' },
    { icon: '?', label: 'Quiz me', prompt: 'Quiz me on this topic to check what I actually understand: ' },
    { icon: '≡', label: 'Summarize my notes', prompt: 'Summarize these notes into the key points I can revise quickly.' },
  ],
  write: [
    { icon: 'Aa', label: 'Draft a message', prompt: 'Draft a friendly, clear WhatsApp or SMS message for: ' },
    { icon: 'PR', label: 'Write a proposal', prompt: 'Write a short, professional proposal for: ' },
    { icon: '✎', label: 'Improve my writing', prompt: 'Improve this so it reads clearly and professionally, keeping my meaning: ' },
    { icon: '↩', label: 'Reply to a message', prompt: 'Help me write a polite, clear reply to this message: ' },
  ],
  research: [
    { icon: 'RS', label: 'Research a decision', prompt: 'Research this and help me make a well-supported decision, with sources: ' },
    { icon: '⇄', label: 'Compare options', prompt: 'Compare these options and recommend the best one for my situation: ' },
    { icon: '₵', label: 'Check current prices', prompt: 'Find the current prices and options for this in Ghana, with sources: ' },
    { icon: '≡', label: 'Summarize a document', prompt: 'Summarize this document into key points and clear next steps.' },
  ],
  business: [
    { icon: 'WA', label: 'WhatsApp broadcast', prompt: 'Draft a friendly WhatsApp broadcast telling my customers about a new offer.' },
    { icon: 'PR', label: 'Business proposal', prompt: 'Write a short, practical business proposal for: ' },
    { icon: 'CL', label: 'Plan a week of posts', prompt: 'Plan a week of social media posts for my business. Ask what I sell and to whom.' },
    { icon: '₵', label: 'Price it fairly', prompt: 'Help me price my product or service fairly. Ask about my costs and my customers.' },
  ],
}

export function isOnboardingRole(value: unknown): value is OnboardingRole {
  return ONBOARDING_ROLES.some((role) => role.id === value)
}

export function isOnboardingGoal(value: unknown): value is OnboardingGoal {
  return ONBOARDING_GOALS.some((goal) => goal.id === value)
}

/** Reads a stored profile back, rejecting anything malformed. */
export function parseProfile(raw: unknown): OnboardingProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const candidate = raw as { role?: unknown; goal?: unknown }
  if (isOnboardingRole(candidate.role) && isOnboardingGoal(candidate.goal)) {
    return { role: candidate.role, goal: candidate.goal }
  }
  return null
}

/** The literal a stored key holds when the person declined the intake. */
export const SKIPPED = 'skipped'

/** Parses a raw localStorage string into a profile, tolerating any corruption. */
export function readStoredProfile(raw: string | null): OnboardingProfile | null {
  if (!raw || raw === SKIPPED) return null
  try {
    return parseProfile(JSON.parse(raw))
  } catch {
    return null
  }
}

export type FirstRunDecision = {
  /** The personalization to apply now, if any. */
  profile: OnboardingProfile | null
  /** Whether to open the two-question intake. */
  showIntake: boolean
  /**
   * A decision to write to this identity's own key so it is not recomputed on
   * every load. Set only when a signed-in identity inherits the choice its
   * person already made as a guest on this device (claim-on-login).
   */
  adopt: OnboardingProfile | 'skipped' | null
}

/**
 * Decides the first run for the active identity.
 *
 * Onboarding is guest-first and remembered per identity, not per device. A
 * guest is personalized immediately and their answer follows them into their
 * account the moment they sign in, so signing up never re-asks the same person.
 * But each distinct signed-in identity keeps its own record, so a shared device
 * — common on campus and office connections — never leaks one person's
 * personalization to the next, and a brand-new identity still gets its intake.
 */
export function resolveFirstRun(input: {
  /** Raw value at this identity's scoped key. */
  scopedRaw: string | null
  /** Raw value at the guest/base key on this device. */
  guestRaw: string | null
  signedIn: boolean
  isGuestScope: boolean
}): FirstRunDecision {
  const { scopedRaw, guestRaw, signedIn, isGuestScope } = input

  if (scopedRaw === SKIPPED) return { profile: null, showIntake: false, adopt: null }
  const own = readStoredProfile(scopedRaw)
  if (own) return { profile: own, showIntake: false, adopt: null }

  // This identity has no record of its own. A signed-in person inherits the
  // choice they made as a guest on this device rather than answering twice.
  if (signedIn && !isGuestScope) {
    if (guestRaw === SKIPPED) return { profile: null, showIntake: false, adopt: SKIPPED }
    const guest = readStoredProfile(guestRaw)
    if (guest) return { profile: guest, showIntake: false, adopt: guest }
  }

  return { profile: null, showIntake: true, adopt: null }
}

/** The four suggested prompts to show, shaped by the person's goal. */
export function personalizedTasks(profile: OnboardingProfile | null): SuggestedTask[] {
  if (!profile) return DEFAULT_TASKS
  return GOAL_TASKS[profile.goal]
}

/** A short, role-aware line for the empty state. Falls back cleanly. */
export function personalizedIntro(profile: OnboardingProfile | null): string {
  if (!profile) {
    return 'Ask, write, research or start a project in your own words. AI360 chooses the right approach and shows its work when that matters.'
  }
  const role = ONBOARDING_ROLES.find((item) => item.id === profile.role)?.label.toLowerCase() ?? 'you'
  const byGoal: Record<OnboardingGoal, string> = {
    learn: `Built around learning. Pick a starting point below, or ask about anything you want to understand.`,
    write: `Built around writing and messages. Start with one below, or paste something you want to improve.`,
    research: `Built around sourced answers. Start with one below, or ask a question that needs checking.`,
    business: `Built around growing a business. Start with one below, or describe what you are working on.`,
  }
  return `Shaped for a ${role}. ${byGoal[profile.goal]}`
}
