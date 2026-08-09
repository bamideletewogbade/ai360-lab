import assert from 'node:assert/strict'
import test from 'node:test'
import {
  browserSpeechLocale, DEFAULT_LANGUAGE, DEFAULT_SPEECH_INPUT, findLanguage,
  ghanaianLanguages, isLanguageCode, isSpeechInputCode, LANGUAGES,
  languageDirective, transcriptionLanguageHint,
} from '../src/lib/languages.ts'

test('the chosen language is stated before anything else can dilute it', () => {
  for (const language of ghanaianLanguages()) {
    const first = languageDirective(language.code).split('\n')[0]
    assert.match(first, new RegExp(language.name), `${language.code} must lead with its own name`)
  }
})

test('the languages people in Ghana actually speak are all offered', () => {
  const codes = LANGUAGES.map((language) => language.code)
  for (const expected of ['en', 'tw', 'gaa', 'ee', 'pcm']) {
    assert.ok(codes.includes(expected as never), `${expected} must be offered`)
  }
  assert.equal(ghanaianLanguages().length, 4)
})

test('every language names itself the way its speakers do', () => {
  for (const language of LANGUAGES) {
    assert.ok(language.nativeName.length > 0, `${language.code} has no native name`)
    assert.ok(language.sample.length > 0, `${language.code} has no sample`)
  }
  assert.equal(findLanguage('ee').nativeName, 'Eʋegbe')
  assert.equal(findLanguage('gaa').nativeName, 'Gã')
})

test('an unknown language code falls back to English rather than breaking', () => {
  assert.equal(isLanguageCode('tw'), true)
  assert.equal(isLanguageCode('fr'), false)
  assert.equal(isLanguageCode(undefined), false)
  assert.equal(findLanguage('zz' as never).code, DEFAULT_LANGUAGE)
})

test('speech input is separate from the requested response language', () => {
  assert.equal(DEFAULT_SPEECH_INPUT, 'mixed')
  assert.equal(isSpeechInputCode('mixed'), true)
  assert.equal(isSpeechInputCode('tw'), true)
  assert.equal(isSpeechInputCode('fr'), false)
})

test('provider hints and browser speech stay conservative until evaluated', () => {
  assert.equal(transcriptionLanguageHint('en'), 'en')
  assert.equal(transcriptionLanguageHint('tw'), undefined)
  assert.equal(transcriptionLanguageHint('mixed'), undefined)
  assert.equal(browserSpeechLocale('en'), 'en-GH')
  assert.equal(browserSpeechLocale('gaa'), undefined)
})

test('a question typed in English does not cancel the chosen language', () => {
  // The bug this guards: people select Ga and then type in English because a
  // Ga keyboard is painful on a phone. Treating that as a language switch made
  // the setting do nothing. Verified against the live model on 2026-08-05.
  for (const language of ghanaianLanguages()) {
    const directive = languageDirective(language.code)
    assert.match(directive, /not optional/i, `${language.code} must state the requirement plainly`)
    assert.match(directive, /phone keyboard/i, `${language.code} must explain why English input happens`)
    assert.match(
      directive,
      /An English question is not a request to switch to English/i,
      `${language.code} must close the English escape hatch`,
    )
  }
})

test('switching is offered only between languages the Lab actually supports', () => {
  const twi = languageDirective('tw')
  assert.match(twi, /Only change language if they write to you in/i)
  assert.doesNotMatch(twi, /Only change language if they write to you in[^.]*English/i)
  // The chosen language is never listed as something to switch to.
  assert.doesNotMatch(twi, /write to you in [^.]*\bTwi\b/i)
})

test('English preference still mirrors a Ghanaian-language message', () => {
  assert.match(languageDirective('en'), /always wins/i)
})

test('English still routes a Ghanaian-language message to a Ghanaian-language reply', () => {
  const directive = languageDirective('en')
  assert.match(directive, /Twi/)
  assert.match(directive, /Ga/)
  assert.match(directive, /Ewe/)
  assert.match(directive, /Pidgin/)
})

test('borrowing English words is treated as correct, not as a failure', () => {
  // Accra genuinely speaks this way. Inventing an unfamiliar local word for
  // "invoice" would serve people worse than borrowing the English one.
  const directive = languageDirective('tw')
  assert.match(directive, /Mixing English words/i)
  assert.match(directive, /Borrow the English word/i)
})

test('the assistant never apologises for its ability in a local language', () => {
  for (const language of LANGUAGES) {
    assert.match(languageDirective(language.code), /never apologise/i, `${language.code} must not apologise`)
  }
})

test('languages with thinner model support carry extra handling guidance', () => {
  assert.ok(findLanguage('gaa').guidance, 'Ga needs guidance')
  assert.ok(findLanguage('ee').guidance, 'Ewe needs guidance')
  assert.match(languageDirective('gaa'), /short and concrete/i)
  assert.equal(findLanguage('en').guidance, undefined)
})

test('Pidgin is pinned to Ghana, not to Nigeria', () => {
  assert.match(languageDirective('pcm'), /Ghanaian Pidgin/)
  assert.match(languageDirective('pcm'), /not Nigerian Pidgin/i)
})
