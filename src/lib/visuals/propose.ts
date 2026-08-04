import { generateText, Output } from "ai";
import { z } from "zod";
import { aiModel, gatewayFailover, STRUCTURED_FALLBACK_MODELS, withRateLimitRetry } from "@/lib/ai";
import type { VisualEntry } from "./catalogue";
import {
  SUGGEST_SYSTEM_PROMPT,
  catalogueForPrompt,
  keepValidSuggestions,
  sectionsForPrompt,
  type SectionForSuggestion,
  type Suggestion,
} from "./suggest";

// The one impure part of suggesting a visual: asking the model.
//
// Everything that decides whether an answer is usable lives in suggest.ts and
// is tested without a network. This file does the call and hands the result
// straight to that filter — so the untested surface is the request, not the
// judgement.
//
// ONE call for the whole deck, not one per section. Two reasons, and the
// second is the real one: it costs a thirtieth as much, and a model that can
// see every section at once can avoid putting the lever on three of them. Per
// section it would have no idea what it had already suggested.

const SuggestionSchema = z.object({
  chunkId: z.string().describe("The [id] in brackets before the section's heading"),
  visual: z.string().describe("One of the interactive ids from the list"),
  reason: z.string().describe("One short sentence for the teacher: what in this section it illustrates"),
});

export type ProposeResult = {
  suggestions: Suggestion[];
  /**
   * How many the model actually returned, before any were dropped.
   *
   * Without this, "suggested: 0" means either "the model had no opinion" or
   * "it had four and every one was thrown away" — and those call for opposite
   * fixes. A run that cannot tell them apart can only be guessed at, which is
   * how the first version of this prompt was tuned in the wrong direction.
   */
  proposed: number;
  model: string;
};

/**
 * Asks for interactives for the sections matching left bare.
 *
 * Returns nothing rather than throwing when the model has no opinion — an
 * empty list is the expected answer for most decks, and treating it as a
 * failure would train a teacher to ignore the feature.
 */
export async function proposeVisuals(
  sections: SectionForSuggestion[],
  catalogue: VisualEntry[],
  alreadyShowing: readonly string[] = [],
): Promise<ProposeResult> {
  const model = aiModel("question");
  const modelId = typeof model === "string" ? model : model.modelId;

  if (sections.length === 0) return { suggestions: [], proposed: 0, model: modelId };

  // Only what is actually free.
  //
  // The whole catalogue used to be offered, including the interactives already
  // placed elsewhere in the lesson — and then 83% of the model's answers were
  // thrown away for naming one. Measured across all three of this school's
  // decks: ten of twelve proposals, every one rejected by a rule the model was
  // never told about.
  //
  // Its answers were not bad. "Induced magnetism in an iron nail" really is a
  // fine home for the domains interactive. It simply could not know domains
  // was already on screen eleven sections earlier, because nobody said so. Two
  // prompt revisions were spent on the model's judgement before anyone checked
  // which rule was doing the rejecting.
  const available = catalogue.filter((v) => !alreadyShowing.includes(v.id));

  // And of those, only the ones some bare section could plausibly take.
  //
  // This is the subject gate — the same `requires` that rejects a suggestion
  // after the fact — applied BEFORE the call instead of after. Moving it is
  // most of the fix. Told which interactives were free but not which were
  // relevant, the model offered the two-bar-magnets visual to "Definition of a
  // moment" and to "Graph of an object not moving", reasoning from the word
  // "distance" in each. Seven of nine proposals died that way, and every one
  // cost tokens to produce and tokens to read.
  //
  // A filter that decides what to ask is worth more than the same filter
  // deciding what to discard.
  const plausible = available.filter((v) =>
    sections.some((s) => v.requires.test(`${s.heading} ${s.text}`)),
  );

  // Nothing relevant is free, so there is nothing to ask. This is the whole
  // answer for two of this school's three decks — their concepts are covered
  // or uncovered, and the rest of the library is about magnets. The old code
  // spent a model call on each to be told that at length.
  if (plausible.length === 0) return { suggestions: [], proposed: 0, model: modelId };

  const { output } = await withRateLimitRetry(() =>
    generateText({
      model,
      system: SUGGEST_SYSTEM_PROMPT,
      prompt: [
        "The interactives still free in this lesson. The rest are already on screen elsewhere in it and must not be suggested:",
        catalogueForPrompt(plausible),
        "",
        // Stated as a number rather than left to judgement: "choose fewer"
        // is advice a model agrees with and then ignores. Capped by what is
        // free as well as by the length of the deck — asking for seven from a
        // list of two invites it to repeat itself.
        `Suggest at most ${Math.min(plausible.length, Math.max(1, Math.ceil(sections.length / 4)))} of them, for these sections:`,
        "",
        sectionsForPrompt(sections),
      ].join("\n"),
      output: Output.object({ schema: z.object({ suggestions: z.array(SuggestionSchema) }) }),
      providerOptions: gatewayFailover(STRUCTURED_FALLBACK_MODELS),
    }),
  );

  const raw = output.suggestions ?? [];

  return {
    // Untrusted from here backwards: an invented id, a section that was never
    // offered, the same visual twice — all dropped rather than repaired.
    suggestions: keepValidSuggestions(raw, sections, catalogue, alreadyShowing),
    proposed: raw.length,
    model: modelId,
  };
}
