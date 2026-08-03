import { generateText, Output } from "ai";
import { z } from "zod";
import { aiModel, gatewayFailover, STRUCTURED_FALLBACK_MODELS, withRateLimitRetry } from "@/lib/ai";
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

export type ProposeResult = { suggestions: Suggestion[]; model: string };

/**
 * Asks for interactives for the sections matching left bare.
 *
 * Returns nothing rather than throwing when the model has no opinion — an
 * empty list is the expected answer for most decks, and treating it as a
 * failure would train a teacher to ignore the feature.
 */
export async function proposeVisuals(
  sections: SectionForSuggestion[],
  catalogue: { id: string; label: string; blurb: string }[],
  alreadyShowing: readonly string[] = [],
): Promise<ProposeResult> {
  const model = aiModel("question");
  const modelId = typeof model === "string" ? model : model.modelId;

  if (sections.length === 0) return { suggestions: [], model: modelId };

  const { output } = await withRateLimitRetry(() =>
    generateText({
      model,
      system: SUGGEST_SYSTEM_PROMPT,
      prompt: [
        "The interactives available:",
        catalogueForPrompt(catalogue),
        "",
        // Stated as a number rather than left to judgement: "choose fewer"
        // is advice a model agrees with and then ignores.
        `Suggest at most ${Math.max(1, Math.ceil(sections.length / 4))} of them, for these sections:`,
        "",
        sectionsForPrompt(sections),
      ].join("\n"),
      output: Output.object({ schema: z.object({ suggestions: z.array(SuggestionSchema) }) }),
      providerOptions: gatewayFailover(STRUCTURED_FALLBACK_MODELS),
    }),
  );

  return {
    // Untrusted from here backwards: an invented id, a section that was never
    // offered, the same visual twice — all dropped rather than repaired.
    suggestions: keepValidSuggestions(
      output.suggestions ?? [],
      sections,
      catalogue.map((v) => v.id),
      alreadyShowing,
    ),
    model: modelId,
  };
}
