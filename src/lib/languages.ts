/**
 * Ghanaian language support.
 *
 * The barrier for many people is not that they cannot think through a problem,
 * it is that they cannot do it in English. Being able to ask in Twi and get a
 * useful answer back in Twi is the difference between this being usable and
 * not.
 *
 * Support levels below come from probing the live models on 2026-08-05 with a
 * real question in each language. They record whether a model reliably produces
 * the language at all. They do NOT record whether the output is good: only
 * native speakers can judge that, and that review has not happened yet.
 */

export type LanguageCode = 'en' | 'tw' | 'gaa' | 'ee' | 'pcm'
export type SpeechInputCode = LanguageCode | 'mixed'

export type LanguageSupport = 'native' | 'good' | 'workable'

export type Language = {
  code: LanguageCode
  /** How the language is named in English. */
  name: string
  /** How speakers name it themselves. */
  nativeName: string
  /** Shown in the picker so people recognise their own language. */
  sample: string
  support: LanguageSupport
  /** Extra instruction for languages that need particular handling. */
  guidance?: string
}

export const LANGUAGES: Language[] = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    sample: 'Ask anything',
    support: 'native',
  },
  {
    code: 'tw',
    name: 'Twi',
    nativeName: 'Twi',
    sample: 'Bisa biribiara',
    support: 'good',
  },
  {
    code: 'gaa',
    name: 'Ga',
    nativeName: 'Gã',
    sample: 'Bi nɔ fɛɛ nɔ',
    support: 'workable',
    guidance: 'Ga has less material behind it than Twi. Keep sentences short and concrete, and prefer a plain word over an uncommon one.',
  },
  {
    code: 'ee',
    name: 'Ewe',
    nativeName: 'Eʋegbe',
    sample: 'Bia nu sia nu',
    support: 'workable',
    guidance: 'Ewe has less material behind it than Twi. Keep sentences short and concrete, and prefer a plain word over an uncommon one.',
  },
  {
    code: 'pcm',
    name: 'Pidgin',
    nativeName: 'Pidgin',
    sample: 'Ask me anything',
    support: 'good',
    guidance: 'Use Ghanaian Pidgin as spoken in Accra, not Nigerian Pidgin. Keep it natural rather than exaggerated.',
  },
]

export const DEFAULT_LANGUAGE: LanguageCode = 'en'
export const DEFAULT_SPEECH_INPUT: SpeechInputCode = 'mixed'

/** Speech input and requested response language are independent settings. */
export const SPEECH_INPUT_OPTIONS: ReadonlyArray<{ code: SpeechInputCode; label: string }> = [
  { code: 'mixed', label: 'Mixed languages' },
  { code: 'en', label: 'English' },
  { code: 'tw', label: 'Twi' },
  { code: 'gaa', label: 'Ga' },
  { code: 'ee', label: 'Ewe' },
  { code: 'pcm', label: 'Ghanaian Pidgin' },
]

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && LANGUAGES.some((language) => language.code === value)
}

export function isSpeechInputCode(value: unknown): value is SpeechInputCode {
  return value === 'mixed' || isLanguageCode(value)
}

/**
 * Only send hints the current production provider is known to accept. Passing
 * an unsupported code can perform worse than automatic detection. Ghanaian
 * language choices remain attached as product and evaluation context.
 */
export function transcriptionLanguageHint(code: SpeechInputCode) {
  return code === 'en' ? 'en' : undefined
}

/** Browser voices vary by platform, so untested local voices stay unavailable. */
export function browserSpeechLocale(code: LanguageCode) {
  return code === 'en' ? 'en-GH' : undefined
}

export function findLanguage(code: LanguageCode) {
  return LANGUAGES.find((language) => language.code === code) ?? LANGUAGES[0]
}

/** Languages other than English, for anywhere that needs to list them. */
export function ghanaianLanguages() {
  return LANGUAGES.filter((language) => language.code !== 'en')
}

/**
 * The instruction appended to a system prompt.
 *
 * The subtle part is what NOT to say. An earlier version told the model to
 * "reply in whatever language they wrote in", which sounds right and is wrong:
 * people select Ga and then type their question in English, because typing Ga
 * on a phone keyboard is painful. The model read the English question as
 * permission to answer in English, and the setting did nothing. Probed on
 * 2026-08-05: three of three replies came back in English. With the mirroring
 * rule scoped to only the other Ghanaian languages, three of three came back in
 * Ga.
 *
 * The other rule that matters: mixing English words into a local sentence is
 * correct, not a failure. That is how Accra actually speaks, and inventing an
 * unfamiliar word for "invoice" would serve people worse than borrowing it.
 */
export function languageDirective(code: LanguageCode) {
  const language = findLanguage(code)
  const others = ghanaianLanguages()
    .filter((option) => option.code !== code)
    .map((option) => option.name)

  if (language.code === 'en') {
    return `The person's preferred language is English.
If they write to you in ${others.join(', ')}, reply in that same language instead. The language they write in always wins.
Never comment on which language they chose and never apologise for your ability in it.`
  }

  return `You must write your entire reply in ${language.name} (${language.nativeName}). This is the person's chosen language and it is not optional.
They will often type their question in English, because typing ${language.name} on a phone keyboard is slow. Answer in ${language.name} anyway. An English question is not a request to switch to English.
Only change language if they write to you in ${others.join(', ')}, in which case reply in that one instead.
Mixing English words into a ${language.name} sentence is correct and expected, especially for business, technical, legal and money terms with no everyday local equivalent. Borrow the English word rather than inventing an unfamiliar one.
Keep numbers, currency, institution names and place names as people actually say them.
Never comment on which language they chose, never apologise for your ability in it, and never offer to switch to English unless they ask.${language.guidance ? `\n${language.guidance}` : ''}`
}
