import type { PackSection } from '@/lib/studio/coordinator'

export type SectionEvaluation = {
  id: PackSection['id']
  passed: boolean
  issues: string[]
}

const PLACEHOLDER_PATTERN = /\b(?:todo|tbd|insert (?:name|detail|link)|lorem ipsum|your (?:business|brand|name) here)\b/i
const MARKDOWN_LINK_PATTERN = /\[[^\]]+\]\(https?:\/\/[^)]+\)/

/**
 * A cheap, deterministic gate runs before another model is allowed to spend
 * credits correcting work. These checks intentionally measure usability, not
 * writing taste.
 */
export function evaluatePackSections(sections: PackSection[]): SectionEvaluation[] {
  return sections.map((section) => {
    const issues: string[] = []
    const content = section.content.trim()
    const minimum = section.id === 'domains' ? 40 : 160
    if (content.length < minimum) issues.push('The deliverable is too short to be useful.')
    if (PLACEHOLDER_PATTERN.test(content)) issues.push('The deliverable still contains a placeholder.')
    if (section.id === 'researcher' && !MARKDOWN_LINK_PATTERN.test(content)) {
      issues.push('Current research needs a descriptive source link next to its evidence.')
    }
    if (/^#{1,2}\s/m.test(content)) issues.push('Use sections within the project, not a second document title.')
    return { id: section.id, passed: issues.length === 0, issues }
  })
}

