/**
 * What does a tutor turn cost, and what will it cost on a real deck?
 *
 *   npx tsx scripts/audit-prompt-scale.mts
 *
 * The closed corpus is the product's whole promise, and it is bought by putting
 * the ENTIRE approved deck into the system prompt of every single turn. Today
 * that is 32 sections from one small deck, read by two students. A teacher
 * uploading a sixty-slide deck to a class of thirty has never happened.
 *
 * Measured here, with no model call and no write:
 *
 *   SIZE     how big the prompt is, and per section, so a bigger deck can be
 *            extrapolated honestly rather than guessed at.
 *
 *   CACHE    whether the cached block really is identical across every variant
 *            a lesson produces. If it is not, the split buys nothing.
 *
 *   BILL     a class of thirty, one lesson, under three cache arrangements.
 *
 * WHY THE SPLIT EXISTS. A cache entry is a PREFIX ending at a breakpoint. With
 * one block and the breakpoint at the end, a prompt differing anywhere — the
 * student's English level, the button they pressed, the turn number — matches
 * no cached entry and re-sends the deck at full price. One lesson produces
 * ninety such variants. Putting the breakpoint after the corpus lets all
 * ninety share one cached copy.
 *
 * Prices are the ones written below and will drift; the ratios are the finding.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env: Record<string, string> = {};
for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
for (const k of Object.keys(env)) if (!process.env[k]) process.env[k] = env[k];

const { buildSystemParts } = await import("../src/lib/tutor");
type Intent = "explain" | "translate" | "example" | "askme" | "check";
type Level = "beginner" | "intermediate" | "advanced";

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const docs = (await db.from("corpus_documents").select("id, source_file").eq("status", "approved")).data ?? [];
const deck = docs.find((d) => d.source_file.includes("Magnets")) ?? docs[0];
if (!deck) throw new Error("no approved deck");

const INTENTS: Intent[] = ["explain", "translate", "example", "askme", "check"];
const LEVELS: Level[] = ["beginner", "intermediate", "advanced"];

// A character count is provider-independent and needs no tokeniser. English
// prose runs about 4 characters to the token; nothing below depends on that
// constant being exact.
const CHARS_PER_TOKEN = 4;
const tok = (chars: number) => Math.round(chars / CHARS_PER_TOKEN);

// ------------------------------------------------------------------- SIZE ---

const variants: { stable: string; variable: string }[] = [];
for (const level of LEVELS)
  for (const intent of INTENTS)
    for (const turn of [0, 1, 2])
      for (const chinese of [false, true])
        variants.push(await buildSystemParts(deck.id, level, intent, turn, true, chinese));

const one = variants[0];
const whole = `${one.stable}\n\n${one.variable}`;
const sections = (one.stable.match(/<source /g) ?? []).length;

// The corpus proper: from the first <source> to the last </source>, rather
// than "everything after a heading", which silently swallowed the rules when
// the material moved to the top.
const corpusStart = one.stable.indexOf("<source ");
const corpusEnd = one.stable.lastIndexOf("</source>") + "</source>".length;
const corpusChars = corpusEnd - corpusStart;

console.log(`DECK      ${deck.source_file}`);
console.log(`SIZE      ${sections} approved sections`);
console.log(`          ${whole.length} characters ≈ ${tok(whole.length)} tokens per turn`);
console.log(`          ${corpusChars} of them are the deck itself (${Math.round((corpusChars / whole.length) * 100)}%)`);
console.log(`          ${Math.round(corpusChars / sections)} characters per section`);

// ------------------------------------------------------------------ CACHE ---

const stableBlocks = new Set(variants.map((v) => v.stable));
const distinctWhole = new Set(variants.map((v) => `${v.stable}\n\n${v.variable}`));
const stable = one.stable;

console.log(`\nCACHE     ${distinctWhole.size} distinct prompts across level × intent × turn × Chinese`);
console.log(`          ${stableBlocks.size} distinct CACHED block${stableBlocks.size === 1 ? "" : "s"} — must be 1, or the split buys nothing`);
console.log(`          cached block ${stable.length} chars ≈ ${tok(stable.length)} tokens (${((stable.length / whole.length) * 100).toFixed(1)}% of the prompt)`);
console.log(`          varying tail ${whole.length - stable.length} chars ≈ ${tok(whole.length - stable.length)} tokens`);
if (stableBlocks.size !== 1) {
  console.log(`\n          !! the cached block is NOT constant. Something student-specific has`);
  console.log(`             leaked above the breakpoint and every variant is paying full price.`);
}

// ------------------------------------------------------------------- BILL ---

// Sonnet-class list prices per million tokens, written down so they can be
// corrected rather than believed.
const IN = 3.0;
const CACHE_WRITE = 3.75;
const CACHE_READ = 0.3;

const CLASS = 30;
const TURNS = 8; // a student's tutor turns in one lesson
const total = CLASS * TURNS;
const nVariants = distinctWhole.size;

const perSection = corpusChars / sections;
const fixedChars = whole.length - corpusChars; // rules, task mode, preamble
const stableFixed = stable.length - corpusChars;

console.log(`\nBILL      ${CLASS} students × ${TURNS} tutor turns = ${total} turns, one lesson`);
console.log(`
          sections   tokens/turn      no cache    one block     split (now)`);
for (const n of [sections, 60, 120, 300]) {
  const corpusTok = tok(perSection * n);
  const promptTok = corpusTok + tok(fixedChars);
  const stableTok = corpusTok + tok(stableFixed);
  const tailTok = promptTok - stableTok;

  const noCache = (promptTok * total * IN) / 1e6;

  // One block, breakpoint at the end: each distinct variant writes its own
  // entry the first time it is seen, and reads it thereafter.
  const writes = Math.min(nVariants, total);
  const oneBlock = (promptTok * writes * CACHE_WRITE + promptTok * (total - writes) * CACHE_READ) / 1e6;

  // Split: the deck is written once and read by every turn after it; the short
  // tail is never cached.
  const split =
    (stableTok * CACHE_WRITE + stableTok * (total - 1) * CACHE_READ + tailTok * total * IN) / 1e6;

  const mark = n === sections ? " ← today" : "";
  console.log(
    `          ${String(n).padStart(8)}   ${String(promptTok).padStart(11)}   ${("$" + noCache.toFixed(2)).padStart(11)}  ${("$" + oneBlock.toFixed(2)).padStart(11)}  ${("$" + split.toFixed(2)).padStart(14)}${mark}`,
  );
}

console.log(`
          "one block" is what this codebase did until now: caching was on, and
          ${nVariants} variants meant it almost never hit. Read the last two columns
          against each other; the absolute figures depend on list prices above.`);

console.log("\nNothing was written, and no model was called.");
