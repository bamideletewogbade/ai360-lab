# AI360 Voice and Language Architecture

Last reviewed: 2026-08-09

## Product decision

AI360 uses a modular speech cascade for production:

`capture -> upload -> language context -> transcription router -> transcript review -> AI reasoning/tools -> text -> tested speech output`

The transcript review is a permanent safety boundary. A transcript cannot trigger a payment, publication, deletion or other consequential action until the person has seen and sent it.

Full-duplex speech-native models remain an experimental route. They can improve conversational timing, but the production cascade currently gives AI360 stronger reasoning, tool use, auditability, provider portability and per-language evaluation.

## Implemented foundation

- Browser audio uses best-effort mono capture, a 24 kHz target, echo cancellation, noise suppression and automatic gain control.
- The browser sends a binary multipart upload. It does not expand recordings into base64 JSON.
- Spoken language and requested answer language are separate settings. `Mixed languages` is the safe default.
- The transcription route validates MIME type, size and duration, applies rate and credit controls, and uses an idempotency key.
- Provider-specific behavior is isolated behind `TranscriptionProvider`.
- OpenRouter receives multipart audio directly. Only the verified English hint is forced; local and mixed speech use automatic detection until evaluation proves a better route.
- Responses expose whether confidence is available, require transcript review and state that AI360 did not retain the raw recording.
- Browser read-aloud is exposed only for English. Untested local-language text is never sent to an arbitrary English voice.
- WER, CER, Ghanaian entity recall, task preservation, native-speaker approval, latency and environment coverage are executable evaluation metrics.

## Why this architecture

WAXAL's 2026 release provides openly licensed natural ASR and high-fidelity TTS data for 27 Sub-Saharan African languages, with University of Ghana participation. African benchmarking shows that Whisper, MMS, XLS-R and W2v-BERT win under different data conditions. AI360 therefore routes by measured capability instead of coupling the product to one model.

Provider adapters must pass a commercial licence review. A dataset's permissive licence does not automatically make every base model or derived checkpoint commercially usable.

## Pilot gates per language

A language remains `experimental` until a paid native-speaker panel validates at least 50 clips across quiet, office, outdoor and busy-public environments. The initial pilot ceilings are:

- Word error rate no higher than 25%.
- Task meaning preserved in at least 95% of clips.
- Native-speaker approval of at least 90%.
- Ghanaian name and entity recall of at least 90% when entities are present.
- Code-switched speech included in the evaluation.

These are AI360 pilot risk thresholds, not claims that one metric represents overall language quality. Character error rate remains visible because tonal and morphologically rich languages may not be represented fairly by English-oriented word segmentation alone.

## Data and privacy rules

- Raw audio is not saved by AI360 in the synchronous voice-note flow.
- Product transcription consent and model-improvement consent are separate.
- No voice cloning is permitted in the pilot.
- Future opted-in evaluation audio must use private storage, encryption, a short retention period, deletion support, dataset lineage and explicit contributor terms.
- Demographic attributes must be optional, purpose-limited and reported only in aggregate.

## Next phases

1. Collect the first native-speaker evaluation set for English, Twi, Ga, Ewe and Ghanaian Pidgin.
2. Benchmark the current baseline against commercially permissible WAXAL-adapted models.
3. Add a routing policy based on language, quality, latency, price and provider health.
4. Add resumable chunk uploads and background transcription for long recordings.
5. Add server-side TTS only for voices that pass native-speaker listening tests.
6. Introduce streaming partial transcripts after the batch baseline is stable.
7. Test full-duplex speech behind the same contracts; do not bypass review for consequential actions.

## Primary research and standards

- Google Research, WAXAL release: https://research.google/blog/waxal-a-large-scale-open-resource-for-african-language-speech-technology/
- WAXAL paper: https://arxiv.org/abs/2602.02734
- African ASR benchmarking: https://arxiv.org/abs/2512.10968
- Moshi full-duplex speech research: https://arxiv.org/abs/2410.00037
- W3C Media Capture and Streams: https://www.w3.org/TR/mediacapture-streams/
- OpenRouter transcription API: https://openrouter.ai/docs/api/api-reference/transcriptions/create-audio-transcriptions
- Ghana Data Protection Commission compliance tool: https://dataprotection.org.gh/self-assessment-compliance-tool/
