# English → Chinese translation

## What runs, in order

1. **Student taps Translate.** The client sends the last real assistant reply
   (skipping past any previous translation) plus `topicId`.
2. **The route loads that document's glossary** — the terms extracted from its
   own text at ingestion (`corpus_glossary`, migration 0021). Not a global
   physics list: on a geography upload that was worse than nothing.
3. **One `generateText` call at `temperature: 0`**, with the glossary injected
   as approved renderings and an instruction that every number, unit and symbol
   must appear unchanged.
4. **`checkTranslation()` runs** — see below.
5. **One corrective retry, only for blocking errors.** The failure is fed back
   verbatim. Whichever attempt is sounder wins; the retry is not assumed better.
6. **Anything still failing is logged**, and the translation is served anyway
   with an `issues` array on the response.

`generateText`, not streaming: a translation must be complete or not shown. A
half-streamed translation is worse than a spinner.

## What is tested, and what cannot be

**You cannot unit-test that a translation is faithful.** Fidelity is a
judgement about meaning; a test can only assert what is decidable. A suite that
claims otherwise is green while the Chinese is wrong, which is worse than no
suite.

So the work is split three ways:

| Layer | Asserts | Where | Runs |
|---|---|---|---|
| **Unit** | numbers preserved, agreed terms used, nothing dropped, nothing left in English, no preamble | `src/lib/translate/checks.test.ts` | every commit, free, deterministic |
| **Runtime** | the same checks, on every real translation, with one corrective retry | `src/app/api/translate/route.ts` | every student tap |
| **Eval** | round-trip fidelity over real curriculum sentences | `evals/translate.eval.ts` | deliberately, before a release or after a model change |

The eval is deliberately **not** in CI: it calls the real provider, so it costs
money and its result moves with the model.

### The checks

- `numbers_changed` (**error**) — a quantity in the source missing from the
  output. "7 N" becoming "5 N" is fluent Chinese and wrong physics, and it is
  the one error a student reading in their second language cannot catch.
  Decimal commas and trailing zeros are normalised, so `0,40` and `0.4` match.
- `untranslated` (**error**) — no Chinese characters for a source that had
  English words.
- `not_a_translation` (**error**) — output opens with "Sure! Here is…".
- `empty` (**error**).
- `glossary_term_missing` (**warning**) — the approved rendering was not used.
  Logged, never retried: withholding a usable translation over word choice
  serves nobody and doubles the cost of every tap.
- `too_short` (**warning**) — output far shorter than Chinese density explains.

### Round-trip back-translation

The eval translates EN → ZH → EN and compares. A meaning that survives a round
trip is rarely wrong; one that does not is always worth a human look.

It is **a signal, not a verdict** — a fluent wrong translation can round-trip
cleanly. The purpose is to narrow what a bilingual teacher has to read. The
final word on text shown to a child belongs to a person; this makes that review
small enough to actually happen.

## Alternatives considered

| Approach | Verdict |
|---|---|
| **Translation memory** — cache source → translation, reuse forever | **Worth doing next.** Same passage always gives the same Chinese, cost drops to zero on repeats, and it gives teachers something to correct once. Needs a table and an edit UI. |
| **Human-reviewed translations** for the whole corpus | The gold standard, and what `ZH_TRANSLATIONS` already does for the two demo topics. Doesn't scale to arbitrary uploads without a translator on staff. Best as a correction layer over the cache above. |
| **Dedicated MT** (DeepL, Google) | Better raw fluency, but no glossary steering of this kind and no way to say "this is Grade 7 physics". Terminology consistency matters more here than fluency. |
| **LLM-as-judge on every translation** | Doubles cost and latency per tap for a probabilistic verdict. The deterministic checks catch the failures that actually hurt; the judge belongs in the eval, not the request path. |
| **Fine-tuning** | Premature. Revisit with a corpus of teacher corrections, which the translation memory would produce. |

## Known limits

- **Terminology depends on the glossary being present.** A document ingested
  before migration 0021 has none — `scripts/backfill-glossary.mts` fixes those.
- **No translation memory yet**, so the same passage is paid for on every tap
  even though `temperature: 0` makes the answer identical.
- **`too_short` is a heuristic.** It is a warning, never a block.
