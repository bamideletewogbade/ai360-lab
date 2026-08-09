export type IntentRoute = 'chat' | 'research' | 'project'

export type RouterSignals = {
  route: IntentRoute
  reason: 'project_language' | 'current_information' | 'explicit_research' | 'direct_help'
  ambiguous: boolean
  signals: string[]
}

const PROJECT = /\b(campaign|brand|branding|logo|flyer|social media pack|promotion|promotional video|launch pack|content calendar|ad campaign|pitch deck)\b/i
const CURRENT = /\b(latest|current|today|this week|this month|price|law|policy|regulation|schedule|news|market data|sources?|citations?)\b/i
const RESEARCH = /\b(research|compare|investigate|fact check|verify|evidence|market analysis|competitor analysis|report)\b/i

/** Small, inspectable safety net for the learned router and provider outages. */
export function routeIntentDeterministically(prompt: string): RouterSignals {
  const text = prompt.replace(/\s+/g, ' ').trim().slice(0, 20_000)
  const signals: string[] = []
  if (PROJECT.test(text)) signals.push('project')
  if (CURRENT.test(text)) signals.push('current')
  if (RESEARCH.test(text)) signals.push('research')

  if (signals.includes('project')) {
    return { route: 'project', reason: 'project_language', ambiguous: signals.length > 1, signals }
  }
  if (signals.includes('current')) {
    return { route: 'research', reason: 'current_information', ambiguous: signals.length > 1, signals }
  }
  if (signals.includes('research')) {
    return { route: 'research', reason: 'explicit_research', ambiguous: false, signals }
  }
  return {
    route: 'chat',
    reason: 'direct_help',
    // Longer turns may describe an outcome without using our English product
    // vocabulary. Those are useful cases for shadow evaluation.
    ambiguous: text.split(/\s+/).length >= 12,
    signals,
  }
}
