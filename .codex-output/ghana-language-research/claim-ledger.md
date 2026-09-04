# Claim-to-source ledger

| Claim | Source(s) | Confidence | Contradiction or gap |
|---|---|---:|---|
| Whisper lacks explicit tokens for target local languages | OpenAI tokenizer/model card | High | Hosted successors may differ; current app uses open-source Whisper Large V3 slug |
| AI360 always submits `mixed` and only hints English | Repository inspection, 4 Sep 2026 | High | No runtime experiment needed; direct static evidence |
| Ghana-specific ASR candidates should enter a bake-off | DONDO, KASA-42, Omnilingual, WAXAL, CDLI | High | Public scores are domain-specific and not product-comparable |
| Twi dialects require separate routes | KASA-42, Ghana Speech Eval, GhanaNLP Twi corpus | High | Cross-dialect degradation must be measured in AI360 distribution |
| Ewe needs CER/orthographic evaluation alongside WER | Wiafe et al. | High | Quantitative baseline is corpus/model-specific |
| General LLM prompting is not uniformly reliable | Nsanku, IrokoBench | High | Benchmarks are not conversational and model lineups age quickly |
| An English pivot can help but may lose nuance | IrokoBench; code-switch MT study | Medium-high | Ghana-specific conversational A/B test required |
| Ghanaian Pidgin must not be treated as Nigerian Pidgin | Yakpo; GhanaNLP catalog | High | No public Ghanaian-Pidgin product benchmark found |
| Existing `pcm` identifier is semantically wrong for GPE | ISO usage plus reviewed Ghana resources | High | Migration must protect stored data and API compatibility |
| Product benchmark is the decisive next step | Synthesis across domain/dialect studies | High | Sample-size recommendation is a product judgement, not a universal threshold |
| Raw audio needs explicit consent and limited retention | Privacy engineering best practice | High | Final policy requires counsel/security review |

