/**
 * Every proposal the model makes, and what happened to it.
 *
 *   npx tsx scripts/why-suggestions-fail.mts --deck=Magnets
 *   npx tsx scripts/why-suggestions-fail.mts            # all approved decks
 *
 * The route reports "proposed 7, suggested 1", which says the filter is doing
 * almost all the work and nothing about WHICH filter. Two prompt revisions were
 * made against that number without knowing whether the model was inventing
 * visual ids, repeating ones already on screen, or reaching across subjects —
 * three problems with three different fixes.
 *
 * So this runs the same prompt the route runs, then walks each proposal through
 * the same checks in the same order and names the one that dropped it.
 *
 * Costs one model call per deck. Writes nothing.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const { generateText, Output } = await import("ai");
const { z } = await import("zod");
const { aiModel, gatewayFailover, STRUCTURED_FALLBACK_MODELS, withRateLimitRetry } = await import("../src/lib/ai");
const { VISUALS, VISUAL_IDS, assignVisuals } = await import("../src/lib/visuals/catalogue");
const { dedupe, resolveVisuals } = await import("../src/lib/visuals/resolve");
const { sectionsNeedingSuggestion, SUGGEST_SYSTEM_PROMPT, catalogueForPrompt, sectionsForPrompt } =
  await import("../src/lib/visuals/suggest");
const { pageOf } = await import("../src/lib/lesson/page-of");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const wanted = process.argv.find((a) => a.startsWith("--deck="))?.slice("--deck=".length);

const must = <T,>(r: { data: T | null; error: { message: string } | null }, w: string): T => {
  if (r.error) throw new Error(`${w}: ${r.error.message}`);
  if (r.data === null) throw new Error(`${w}: no data`);
  return r.data;
};

const Suggestion = z.object({ chunkId: z.string(), visual: z.string(), reason: z.string() });

const docs = must(
  await db.from("corpus_documents").select("id, source_file").eq("status", "approved"),
  "documents",
).filter((d) => !wanted || d.source_file.toLowerCase().includes(wanted.toLowerCase()));

const tally = new Map<string, number>();

for (const doc of docs) {
  const chunks = must(
    await db.from("corpus_chunks").select("id, heading, text, citation").eq("document_id", doc.id),
    "chunks",
  ).sort((a, b) => pageOf(a.citation) - pageOf(b.citation));
  const media = must(
    await db.from("corpus_document_media").select("page_or_section, kind").eq("document_id", doc.id),
    "media",
  );
  const figures = new Set(media.filter((m) => m.kind !== "slide").map((m) => m.page_or_section as number));

  const matched = assignVisuals(
    chunks.map((c) => {
      const h = (c.heading ?? "").trim();
      return { heading: h, text: c.text.trim() === h ? "" : c.text, hasMedia: figures.has(pageOf(c.citation)) };
    }),
  );
  const resolved = dedupe(resolveVisuals(chunks.map((c) => c.id), matched, [], VISUAL_IDS));
  const onScreen = resolved.map((r) => r.visual).filter((v): v is string => v !== null);
  const eligible = sectionsNeedingSuggestion(
    chunks.map((c) => ({ chunkId: c.id, heading: (c.heading ?? "").trim(), text: c.text })),
    resolved,
  );

  console.log(`\n${"=".repeat(78)}\n${doc.source_file}`);
  console.log(`${eligible.length} bare sections · already on screen: ${onScreen.join(", ") || "nothing"}`);
  if (eligible.length === 0) continue;

  // Mirrors propose.ts: only the interactives not already placed.
  const available = VISUALS.filter((v) => !onScreen.includes(v.id));
  const free = available.filter((v) =>
    eligible.some((e) => v.requires.test(`${e.heading} ${e.text}`)),
  );
  console.log(`free: ${available.map((v) => v.id).join(", ") || "none"}`);
  console.log(`free AND relevant to a bare section: ${free.map((v) => v.id).join(", ") || "none"}`);
  if (free.length === 0) {
    console.log("  -> no model call: nothing relevant is free");
    continue;
  }

  const { output } = await withRateLimitRetry(() =>
    generateText({
      model: aiModel("question"),
      system: SUGGEST_SYSTEM_PROMPT,
      prompt: [
        "The interactives still free in this lesson. The rest are already on screen elsewhere in it and must not be suggested:",
        catalogueForPrompt(free),
        "",
        `Suggest at most ${Math.min(free.length, Math.max(1, Math.ceil(eligible.length / 4)))} of them, for these sections:`,
        "",
        sectionsForPrompt(eligible),
      ].join("\n"),
      output: Output.object({ schema: z.object({ suggestions: z.array(Suggestion) }) }),
      providerOptions: gatewayFailover(STRUCTURED_FALLBACK_MODELS),
    }),
  );

  const ids = new Set(eligible.map((s) => s.chunkId));
  const taken = new Set(onScreen);
  const seen = new Set<string>();

  console.log(`\nthe model proposed ${output.suggestions.length}:`);
  for (const s of output.suggestions) {
    const section = eligible.find((e) => e.chunkId === s.chunkId);

    // Mirrors the tolerant id extraction in keepValidSuggestions.
    const named = VISUALS.some((v) => v.id === s.visual)
      ? s.visual
      : (/^\s*"?([a-z]+)"?\s*[—:-]/.exec(s.visual)?.[1] ?? s.visual);
    const resolvedEntry = VISUALS.find((v) => v.id === named);

    let verdict = "KEPT";
    if (!resolvedEntry) verdict = "invented a visual id";
    else if (!ids.has(s.chunkId)) verdict = "section was not on the list";
    else if (!resolvedEntry.requires.test(`${section!.heading} ${section!.text}`)) verdict = "SUBJECT GATE";
    else if (taken.has(named)) verdict = "already on screen elsewhere";
    else if (seen.has(s.chunkId)) verdict = "second suggestion for that section";
    else if (!String(s.reason ?? "").trim()) verdict = "no reason given";

    if (verdict === "KEPT") {
      taken.add(named);
      seen.add(s.chunkId);
    }
    tally.set(verdict, (tally.get(verdict) ?? 0) + 1);

    console.log(`  [${verdict}]  ${named} -> "${(section?.heading ?? "?").slice(0, 46)}"`);
    console.log(`      ${String(s.reason).slice(0, 130)}`);
  }
}

console.log(`\n${"=".repeat(78)}\nWHAT HAPPENED TO EVERY PROPOSAL`);
const total = [...tally.values()].reduce((a, b) => a + b, 0);
for (const [why, n] of [...tally].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${Math.round((n / total) * 100)}%  ${why}`);
}
console.log("\nNothing was written.");
