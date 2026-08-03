export const MODEL_OPTIONS = {
  auto: {
    label: 'AI-Auto',
    shortLabel: 'Auto',
    description: 'Best balance of speed and quality',
    model: 'google/gemini-3.6-flash',
  },
  gemini: {
    label: 'Gemini 3.6 Flash',
    shortLabel: 'Gemini',
    description: 'Fast, capable and multimodal',
    model: 'google/gemini-3.6-flash',
  },
  claude: {
    label: 'Claude Sonnet 5',
    shortLabel: 'Claude',
    description: 'Deep analysis and polished writing',
    model: 'anthropic/claude-sonnet-5',
  },
  kimi: {
    label: 'Kimi K3',
    shortLabel: 'Kimi',
    description: 'Long-context agentic reasoning',
    model: 'moonshotai/kimi-k3',
  },
  gpt: {
    label: 'GPT-5.6 Luna',
    shortLabel: 'GPT',
    description: 'Fast general-purpose reasoning',
    model: 'openai/gpt-5.6-luna',
  },
} as const

export type ChatMode = keyof typeof MODEL_OPTIONS

const FALLBACK = 'qwen/qwen3.7-plus'
const FAST_TEXT_MODEL = MODEL_OPTIONS.gpt.model
const MULTIMODAL_MODEL = MODEL_OPTIONS.gemini.model

export type ModelWorkload = 'chat' | 'agent' | 'studio'

export function isChatMode(value: unknown): value is ChatMode {
  return typeof value === 'string' && value in MODEL_OPTIONS
}

export function routeFor(
  mode: ChatMode,
  options: { workload?: ModelWorkload; hasVideo?: boolean } = {},
): { model: string; models: string[] } {
  const workload = options.workload ?? 'chat'
  const automatic = options.hasVideo || workload !== 'chat' ? MULTIMODAL_MODEL : FAST_TEXT_MODEL
  const selected = mode === 'auto' ? automatic : MODEL_OPTIONS[mode].model
  const models = mode === 'auto'
    ? workload === 'chat' && !options.hasVideo
      ? [FAST_TEXT_MODEL, FALLBACK, MULTIMODAL_MODEL]
      : [MULTIMODAL_MODEL, FAST_TEXT_MODEL, FALLBACK]
    : [selected, automatic, FALLBACK]
  return { model: selected, models: [...new Set(models)] }
}

export function providerPreferences(workload: ModelWorkload) {
  return {
    sort: 'price' as const,
    allow_fallbacks: true,
    require_parameters: true,
    preferred_max_latency: { p90: workload === 'chat' ? 3 : 5 },
    preferred_min_throughput: { p50: workload === 'chat' ? 45 : 30 },
    max_price: {
      prompt: workload === 'chat' ? 4 : 6,
      completion: workload === 'chat' ? 18 : 22,
    },
  }
}

export const SYSTEM_PROMPT = `You are AI 360 Lab, a helpful, friendly AI assistant built by AI 360 (an initiative of the Accra Innovation Center) for learners, professionals and entrepreneurs across Africa.

- Be clear, practical and concise. Prefer plain language over jargon.
- Write in a warm, confident editorial voice. Start with the answer, not a generic preamble.
- You have live web search, page reading and date/time tools. Decide when to use them without waiting for the user to ask.
- Use live tools for current events, prices, laws, schedules, recommendations, public figures, changing product details, recent research and questions about a specific URL.
- When live information materially improves accuracy, search first and cite the supporting pages with descriptive Markdown links near the relevant claims.
- Never pretend to have searched. If a tool fails, say that current information could not be verified.
- Never use em dashes or en dashes. Use a period, comma, colon or parentheses instead.
- Use valid Markdown only when structure helps. Never expose Markdown syntax as text.
- Use short paragraphs, descriptive headings, true bullet or numbered lists, and fenced code blocks.
- Never use an H1 heading. Keep headings short and use H2 or H3.
- Use bold sparingly for genuinely important words. Do not bold every label or bullet opening.
- Use tables only when comparing three or more items across the same fields.
- Avoid repetitive conclusions, fake quotations, excessive disclaimers, and phrases such as "As an AI".
- When it helps, use examples relevant to Ghana and Africa (Mobile Money, local business, schools).
- For high-risk topics (medical, legal, financial, employment), help where you can but remind the user to confirm with a qualified professional. Do not present output as a professional decision or verified fact.
- Never claim to be a specific external model or company. You are AI 360 Lab.`
