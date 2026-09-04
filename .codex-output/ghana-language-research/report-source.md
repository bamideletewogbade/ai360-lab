# Improving Ghanaian Language Voice and Translation in AI360

**Status:** Proposed  
**Owner:** AI360 product and engineering  
**Last updated:** 4 September 2026  
**Scope:** Speech recognition, language routing, interpretation, translation, response generation, evaluation, privacy, and rollout for Ghanaian English, Asante Twi, Akuapem Twi, Ga, Ewe, Ghanaian Pidgin, and mixed speech.

## Executive decision

AI360 should stop treating Ghanaian-language voice as one generic multilingual transcription problem. The current design sends every recording as `mixed`, uses OpenAI Whisper Large V3 by default, and then asks the chat model to answer in the selected language. Whisper's official language map does not include Akan/Twi, Ga, Ewe, or Ghanaian Pidgin. The poor user experience is therefore expected: recognition errors destroy meaning before the response model gets a chance to interpret the request, and prompt-only local-language generation introduces a second independent failure surface.

The recommended design is a language-aware, observable pipeline with three separable stages: (1) speech recognition, (2) semantic interpretation/optional translation, and (3) response realization. Route each language and Twi dialect independently, preserve the original transcript, allow code-switching, and select models only after an AI360-specific benchmark with Ghanaian native speakers. Ghanaian Pidgin should be labelled experimental until its own data and benchmark exist.

## Current-state findings

1. `src/lib/languages.ts` advertises English, Twi, Ga, Ewe, and Ghanaian Pidgin. Its own comments say the support labels came from a single live question rather than a native-speaker review.
2. `src/app/app/page.tsx` initializes speech input to `mixed` without a setter or visible language selector, so every recording is submitted as mixed.
3. `src/lib/voice/openrouter.ts` defaults to `openai/whisper-large-v3`. Only English receives a language hint; all local-language and mixed inputs rely on auto-detection.
4. `src/app/api/transcribe/route.ts` returns one raw transcript. No confidence, alternatives, language/dialect hypothesis, or code-switch spans are retained.
5. `src/lib/voice/evaluation.ts` requires only 50 clips in total, not per language/dialect/domain. Mixed speech is not a first-class evaluation language and native approval is a single boolean.
6. `src/lib/languages.ts` uses one prompt directive for target-language response generation. This cannot repair corrupted speech and does not distinguish literal translation, reasoning accuracy, dialect fit, or naturalness.

## Evidence synthesis

### Recognition coverage is mismatched

OpenAI Whisper exposes 99 language tokens, but not Akan/Twi, Ewe, Ga, or Ghanaian Pidgin. OpenRouter can route among current transcription models, but model availability is not evidence of Ghanaian-language accuracy. Its documented endpoint returns a transcript and usage data; AI360 must supply its own evaluation and routing logic.

Ghana-specific and Africa-targeted candidates are materially more promising, but no single candidate covers the product safely:

- Khaya/DONDO covers Asante Twi, Ewe, Ga, English and several related languages under Apache 2.0. Its reported in-domain WER is strong, but the test domain is read religious speech and the model requires an explicit language prefix.
- KASA-42 jointly identifies and transcribes 42 Ghanaian subsets and reports useful Twi/Ewe results, but it is scripture-trained, non-commercial (CC BY-NC), and not a production-ready drop-in.
- Meta Omnilingual ASR reports 7B-model CER of 11.9 for `twi_Latn`, 1.0 for `ewe_Latn`, 2.5 for macro-language `aka_Latn`, and 4.6 for `pcm_Latn`; Ga (`gaa`) and Ghanaian Pidgin (`gpe`) are absent. These corpus-level figures are not a conversational Ghana benchmark and `pcm` must not be relabelled Ghanaian Pidgin.
- Google Cloud and Azure explicitly support Ghanaian English (`en-GH`) but do not document Twi, Ga, or Ewe support. They are credible English baselines, not local-language solutions.
- No research-grade public Ghanaian-Pidgin ASR benchmark was found. Abena advertises `gpe` transcription but publishes no WER, training provenance, privacy/retention evidence, or SLA in the reviewed material.

### Domain and dialect matter more than headline multilingual coverage

An Akan benchmark across image description, informal conversation, scripture, and spontaneous financial dialogue found large domain effects. Fine-tuned Whisper could produce fluent but misleading substitutions. This is dangerous for an assistant because a plausible wrong transcript can trigger a confident wrong answer.

Twi must not be a single undifferentiated route. Public work separates Akuapem and Asante, and Ghanaian benchmarks report very different model behaviour across dialect-heavy sources. Store dialect as request metadata, expose a lightweight choice where useful, and benchmark both separately.

The University of Ghana Ewe work identifies orthographic variation, loanword spelling, morphology, dialect differences, and phonetic confusions as major error sources. Its Whisper baseline had about 37% WER but 12% CER, illustrating why WER alone can misrepresent quality. Preserve Unicode characters and evaluate both exact orthography and meaning.

### Translation and answer generation are separate failure modes

Nsanku's zero-shot study of 19 models on 43 Ghanaian languages found no model-language pair that was both high-performing and consistent across its test. The study is scripture-domain and therefore cannot choose AI360's production model, but it strongly rejects the idea that one general LLM plus a language prompt is enough.

IrokoBench found large gaps between English and African-language task performance, including Twi and Ewe. An English pivot helped some English-centric models, but can lose local nuance. AI360 should therefore A/B test two explicit strategies per language and task: direct native-language processing, and a traceable semantic pivot (`source -> structured meaning/English -> reasoning -> target-language realization`). Never silently replace the user's original transcript with an English paraphrase.

Ghanaian Pidgin is distinct from Nigerian Pidgin and has Ghana-specific morphosyntactic and semantic influences. The current internal code `pcm` is the ISO code normally associated with Nigerian Pidgin, while published Ghanaian resources use `gpe`. Rename and separate the product language identifier before collecting metrics or routing models.

## Proposed architecture

### Design principle

Every stage must preserve provenance and uncertainty. A user-visible answer should be traceable to the original audio, verbatim transcript, detected/selected language and dialect, optional semantic pivot, and final realization model.

### Request lifecycle

1. **Capture in background.** Stop recording triggers background upload and transcription automatically. Show compact states: listening, processing, and ready. Do not require a second “transcribe” click.
2. **Collect routing context.** Send selected language (or explicit auto), Twi dialect when known, expected response language, device/audio metadata, and a short opt-in contextual glossary of names or domain terms.
3. **Generate language hypotheses.** For `auto`, run language/dialect identification and retain top candidates with confidence. Never equate “mixed” with “unknown.” Mixed means code-switching is allowed; unknown means classification is uncertain.
4. **Route ASR.** Use a versioned per-language policy. Ghanaian English can compare the current OpenRouter route with `en-GH` baselines. Twi/Ewe/Ga should compare Ghana-targeted models or partners with Meta Omnilingual and the current provider. Ghanaian Pidgin remains experimental and should have a conservative fallback.
5. **Score and recover.** If confidence is low, candidate transcripts disagree, language identity conflicts, or key entities are uncertain, request a short targeted confirmation (“Did you say X or Y?”), not a full manual transcription step.
6. **Interpret meaning.** Preserve the verbatim transcript. Produce a structured intent/meaning record with protected entities, amounts, dates, place names, language spans, and ambiguity flags. Translation is optional and explicit.
7. **Generate the answer.** Select direct native generation or an English-pivot strategy based on the language/task benchmark. Use language- and dialect-specific few-shot examples and glossaries. Preserve natural code-switching when that is how the user spoke.
8. **Validate before high-impact actions.** For finance, health, identity, or external actions, confirm low-confidence entities and amounts before execution.
9. **Learn with consent.** Let users correct the transcript inline. Store correction diffs and evaluation metadata by default; retain raw audio only with explicit consent, a stated purpose, a short retention period, and deletion controls.

### Core components

| Component | Responsibility | Failure behaviour |
|---|---|---|
| Voice capture | Background record/stop/upload, audio normalization | Preserve draft; retry upload; never lose typed input |
| Language router | Language, dialect, and code-switch hypotheses; policy lookup | Fall back to explicit user selection or cautious confirmation |
| ASR adapters | Provider-specific transcription with N-best/confidence when available | Time-box; compare fallback only within budget |
| Transcript judge | Detect disagreement, entity risk, uncertainty, script/orthography loss | Ask a targeted clarification |
| Meaning layer | Structured intent, entities, source spans, optional translation | Do not fabricate missing meaning; flag ambiguity |
| Response router | Direct vs pivot reasoning and target-language realization | Fall back to bilingual answer or English with disclosure |
| Evaluation store | Consent-safe audio references, gold text, errors, model/policy versions | Fail closed for raw-audio retention; preserve aggregate telemetry |

## Recommended data contract

Each request should capture at least:

| Field | Purpose |
|---|---|
| `speechLanguage` | `en-GH`, `tw-asante`, `tw-akuapem`, `ee`, `gaa`, `gpe`, or `auto` |
| `codeSwitchMode` | `none`, `allowed`, or `detected`; not overloaded into language |
| `languageHypotheses` | Ranked language/dialect candidates and confidence |
| `verbatimTranscript` | Immutable provider output with Unicode preserved |
| `normalizedTranscript` | Search/evaluation form; never replaces verbatim text |
| `alternatives` | N-best candidates or competing provider outputs |
| `entities` | Names, places, dates, amounts, phone numbers, and uncertainty |
| `semanticPivot` | Optional structured meaning or English translation with provenance |
| `modelRoute` | ASR, interpreter, generator, prompts, and versions |
| `consent` | Whether raw audio/corrections may be retained and for how long |

## Model bake-off

Do not select a winner from public leaderboards. Run an offline, reproducible AI360 bake-off:

| Language/variety | Minimum candidates | Initial posture |
|---|---|---|
| Ghanaian English | Current OpenRouter Whisper; Google/Azure `en-GH`; a newer OpenRouter STT model | Supported after app benchmark |
| Asante Twi | Khaya/DONDO; Meta Omnilingual; current Whisper; licensed fine-tune | Separate route and scorecard |
| Akuapem Twi | Same candidates, separately scored | Do not merge with Asante |
| Ewe | Khaya/DONDO; Meta Omnilingual; current Whisper; licensed fine-tune | Use CER plus meaning and orthography |
| Ga | Khaya/DONDO; current Whisper; licensed adaptation based on CDLI/WAXAL-like sources | Coverage gap; conservative release |
| Ghanaian Pidgin | Abena controlled trial; current provider; carefully labelled Nigerian-Pidgin baselines | Experimental until native benchmark |
| Mixed Twi-English | Candidates above plus code-switch-specific research components | Preserve switch spans; never force one language |

Public data can seed tests and training, but product evaluation must match real usage. KasaSpeech provides a permissively licensed Twi-English code-switch corpus; WAXAL provides commercially usable Akan/Ewe data under CC BY 4.0; CDLI provides a small, carefully controlled Ga set. University of Ghana's much larger UGSpeechData is valuable for research but is CC BY-NC-ND; do not use it for ordinary commercial fine-tuning without permission. Audit every source-specific licence before training.

## Evaluation and release gates

Create a private, consented gold set with at least 150 clips per supported variety for the first decision-quality benchmark, then expand continuously. This is a product recommendation, not a universal statistical threshold. Balance speakers and include:

- quiet, office, outdoor, vehicle, and busy-public audio;
- low-cost and high-end phones, weak microphones, and compression;
- spontaneous questions, long turns, commands, and interruptions;
- local names, neighbourhoods, institutions, foods, medicines, and MoMo/financial terms;
- monolingual, inter-sentential, and intra-sentential code-switching;
- formal and informal spellings, Unicode Ghanaian characters, and dialect slices;
- general, health, education, finance, agriculture, and public-service tasks.

Use two native raters per variety, with adjudication for consequential disagreements. Score stages separately:

1. **ASR:** WER, CER, entity error rate, language/dialect ID, code-switch boundary accuracy, deletion/hallucination rate.
2. **Meaning/translation:** adequacy, named-entity/number preservation, omission/addition, terminology, dialect mismatch, literalism, and code-switch handling.
3. **Answer:** task correctness, groundedness, safety, completeness, target-language naturalness, cultural/pragmatic fit, and preference.
4. **Experience:** median/p95 latency, clarification rate, correction rate, abandonment, and successful voice-to-answer completion.

Suggested initial release gates per variety: entity recall at least 95% for ordinary chat and 99% before high-impact actions; meaning preservation at least 95%; major-error-free native review at least 90%; no material regression against typed input; p95 end-to-end latency under the product's chosen budget. WER/CER thresholds should be learned per language and task rather than copied globally.

## Safety, privacy, and operational rules

- Audio is sensitive biometric-adjacent data. Minimize collection, encrypt in transit/at rest, segregate tenants, and never log raw audio or full transcripts in general application logs.
- Make correction collection opt-in and explain whether data improves only the user's experience or the shared model.
- Default to short retention for raw audio; support deletion and dataset withdrawal.
- Keep immutable model, prompt, language-policy, normalization, and glossary versions for replay.
- Hash or redact sensitive entities in telemetry. Store gold datasets separately with restricted access.
- Feature-flag each language and route. Shadow-test challengers, canary by language, and roll back independently.

## Alternatives considered

| Alternative | Benefit | Why not selected as the system design |
|---|---|---|
| Keep one Whisper call and improve the prompt | Minimal engineering work | Cannot add missing acoustic/language coverage; errors occur before prompting |
| Send audio directly to one multimodal LLM | Simple conceptual pipeline | Harder to measure and debug ASR vs reasoning; no evidence of uniformly good Ghanaian coverage |
| Translate everything to English | Improves reasoning for some models | Loses nuance, entities, dialect, and natural code-switching; unnecessary for same-language tasks |
| Self-host one giant multilingual model | Maximum control | Coverage and domain remain uneven; operational cost and licensing do not solve missing data |
| Ask users to manually transcribe every recording | Avoids silent ASR errors | Friction defeats voice UX; targeted clarification is sufficient for uncertain cases |

## 30/60/90-day roadmap

### Days 0–30: make quality measurable

- Replace the always-`mixed` state with `auto` plus an accessible input-language choice; separate response language.
- Rename Ghanaian Pidgin from internal `pcm` to `gpe`, with a backward-compatible migration.
- Implement automatic post-stop transcription, progress states, cancellation, retry, and targeted confirmation.
- Add the versioned voice data contract and per-language feature flags.
- Recruit native reviewers and record the first product-distribution benchmark.
- Remove unsupported “good/workable” quality claims until benchmarked.

### Days 31–60: route and compare

- Build ASR adapters and run shadow bake-offs by language, dialect, domain, noise, and code-switch slice.
- Add transcript alternatives, entity protection, glossary support, and correction diffs.
- Evaluate direct native answering against the semantic-pivot route using MQM-style native review.
- Complete vendor privacy, retention, data-residency, SLA, and licence checks.

### Days 61–90: controlled release

- Promote only varieties that meet their own gates; keep Ga/GPE beta or experimental if evidence is insufficient.
- Canary model policies by language and monitor entity, meaning, correction, clarification, latency, and abandonment metrics.
- Establish a monthly native-speaker error review and quarterly model bake-off.
- Start targeted adaptation only with permissively licensed and consented data; negotiate rights for restricted corpora where valuable.

## Open questions

1. Which language/dialect combinations are launch-critical, and which may remain beta?
2. Can AI360 partner with GhanaNLP/Khaya or CDLI for hosted inference, review, and commercial data rights?
3. What raw-audio retention and residency policy is acceptable for users and enterprise customers?
4. Which high-impact domains require mandatory entity confirmation?
5. What p95 latency and per-minute cost budgets should constrain multi-pass routing?

## Decision

Approve a language-aware pipeline and an evaluation-first rollout. The first implementation milestone is not model fine-tuning; it is fixing routing metadata, removing the second transcription click, preserving uncertainty and provenance, and creating a Ghanaian native-speaker benchmark. Only then should AI360 choose or train per-language models.

## Sources

- OpenAI, Whisper language tokens and model card: https://github.com/openai/whisper/blob/main/whisper/tokenizer.py and https://github.com/openai/whisper/blob/main/model-card.md
- OpenRouter, Speech-to-Text documentation and model discovery: https://openrouter.ai/docs/guides/overview/multimodal/stt
- Khaya AI, DONDO multilingual ASR model card: https://huggingface.co/KhayaAI/w2v-bert-ada_ewe_fat_fra_gaa_nzi_twi_en
- GhanaNLP Community, KASA-42 model card: https://huggingface.co/ghananlpcommunity/kasa42-asr
- Meta, Omnilingual ASR repository and per-language results: https://github.com/facebookresearch/omnilingual-asr and https://raw.githubusercontent.com/facebookresearch/omnilingual-asr/refs/heads/main/per_language_results_table_7B_llm_asr.csv
- Google Cloud, Speech-to-Text language support: https://docs.cloud.google.com/speech-to-text/docs/v1/speech-to-text-supported-languages
- Microsoft Azure, Speech language support: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support
- Wiafe et al., Building an Ewe Language Dataset, ICNLSP 2025: https://aclanthology.org/2025.icnlsp-1.32.pdf
- University of Ghana, UGSpeechData/Data in Brief 2025: https://pmc.ncbi.nlm.nih.gov/articles/PMC12301755/
- GhanaNLP, Akan ASR domain benchmark: https://arxiv.org/abs/2507.02407
- GhanaNLP Community, KasaSpeech: https://huggingface.co/datasets/ghananlpcommunity/Ghana_English-Twi_Code-switching_Speech
- Google WAXAL: https://huggingface.co/datasets/google/WaxalNLP/blob/main/README.md
- CDLI Ga standard speech: https://huggingface.co/datasets/cdli/ghanian_ga_standard_speech_v1.0
- Nsanku Ghanaian translation benchmark: https://arxiv.org/abs/2605.04208
- IrokoBench: https://aclanthology.org/2025.naacl-long.139/
- GhanaNLP English–Twi corpus: https://arxiv.org/abs/2103.15625
- GhanaNLP resources catalog: https://github.com/GhanaNLP/ghanaian-nlp-datasets-models
- Yakpo, Ghanaian Pidgin: https://onlinelibrary.wiley.com/doi/full/10.1111/weng.12635
- GhanaNLP parallel corpora for five Ghanaian languages: https://arxiv.org/abs/2603.13793
- Google WMT MQM human evaluation: https://github.com/google/wmt-mqm-human-evaluation
- SSA-COMET: https://aclanthology.org/2025.emnlp-main.656/

