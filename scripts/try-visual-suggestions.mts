/**
 * What the model would propose for a deck, without saving anything.
 *
 *   npx tsx scripts/try-visual-suggestions.mts --deck=Moments
 *   npx tsx scripts/try-visual-suggestions.mts --deck=Magnets
 *
 * The filter around the model is tested without a network (suggest.test.ts):
 * an invented id, a section never offered, a duplicate. What none of that can
 * tell you is whether the suggestions are any GOOD, and that question is only
 * answerable by reading them next to the sections they are about.
 *
 * So this prints both — the proposal, its reason, and the source text it
 * claims to illustrate — and writes nothing. Judging a prompt from a row count
 * is how you end up shipping confident nonsense to a teacher.
 *
 * Costs one model call. Read-only against the database.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Before the AI module, and dynamic below for the same reason: ESM hoists
// static imports above module-level code, so lib/ai.ts would read
// process.env.AI_PROVIDER while it was still unset.
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const { VISUALS, VISUAL_IDS, assignVisuals } = await import("../src/lib/visuals/catalogue");
const { dedupe, resolveVisuals } = await import("../src/lib/visuals/resolve");
const { sectionsNeedingSuggestion } = await import("../src/lib/visuals/suggest");
const { proposeVisuals } = await import("../src/lib/visuals/propose");
const { pageOf } = await import("../src/lib/lesson/page-of");

const wanted = process.argv.find((a) => a.startsWith("--deck="))?.slice("--deck=".length) ?? "Moments";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
const db = createClient(url, key);

const must = <T,>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what} failed: ${r.error.message}`);
  if (r.data === null) throw new Error(`${what} returned nothing and no error — does that table exist?`);
  return r.data;
};

const docs = must(
  await db.from("corpus_documents").select("id, source_file").eq("status", "approved"),
  "documents",
);
const doc = docs.find((d) => d.source_file.toLowerCase().includes(wanted.toLowerCase()));
if (!doc) throw new Error(`No approved deck matching "${wanted}". Have: ${docs.map((d) => d.source_file).join(", ")}`);

const chunks = must(
  await db.from("corpus_chunks").select("id, heading, text, citation").eq("document_id", doc.id),
  "chunks",
).sort((a, b) => pageOf(a.citation) - pageOf(b.citation));

const mediaRows = must(
  await db.from("corpus_document_media").select("page_or_section, kind").eq("document_id", doc.id),
  "media",
);
const pagesWithFigures = new Set(
  mediaRows.filter((m) => m.kind !== "slide").map((m) => m.page_or_section as number),
);

const overrides = must(
  await db.from("section_visuals").select("chunk_id, visual").in("chunk_id", chunks.map((c) => c.id)),
  "section_visuals",
).map((r) => ({ chunkId: r.chunk_id as string, visual: (r.visual as string | null) ?? null }));

const matched = assignVisuals(
  chunks.map((c) => {
    const heading = (c.heading ?? "").trim();
    return {
      heading,
      text: c.text.trim() === heading ? "" : c.text,
      hasMedia: pagesWithFigures.has(pageOf(c.citation)),
    };
  }),
);
const resolved = dedupe(resolveVisuals(chunks.map((c) => c.id), matched, overrides, VISUAL_IDS));

console.log(`\n${doc.source_file} — ${chunks.length} sections`);
console.log("\nWHAT MATCHING ALREADY DID");
chunks.forEach((c, i) => {
  console.log(`  ${String(i + 1).padStart(2)}. ${(c.heading ?? "(no heading)").slice(0, 52).padEnd(54)}${resolved[i].visual ?? "—"}`);
});

const eligible = sectionsNeedingSuggestion(
  chunks.map((c) => ({ chunkId: c.id, heading: (c.heading ?? "").trim(), text: c.text })),
  resolved,
);
console.log(`\n${eligible.length} section(s) with nothing. Asking the model…`);

const { suggestions, proposed, model } = await proposeVisuals(
  eligible,
  VISUALS,
  resolved.map((r) => r.visual).filter((v): v is string => v !== null),
);

console.log(`\nMODEL: ${model}`);
console.log(`PROPOSED:  ${proposed}  (what the model returned)`);
console.log(`SUGGESTED: ${suggestions.length}  (what survived the filter)`);

for (const s of suggestions) {
  const c = chunks.find((x) => x.id === s.chunkId)!;
  const label = VISUALS.find((v) => v.id === s.visual)?.label ?? s.visual;
  console.log("─".repeat(78));
  console.log(`SECTION   ${c.heading ?? "(no heading)"}`);
  console.log(`PROPOSES  ${label}  (${s.visual})`);
  console.log(`BECAUSE   ${s.reason}`);
  console.log(`SOURCE    ${c.text.replace(/\s+/g, " ").slice(0, 400)}`);
  console.log();
}

if (suggestions.length === 0) {
  console.log("Nothing fitted. For a deck whose concepts the library does not cover, that is the right answer.");
}
console.log("Nothing was written.");
