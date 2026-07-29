/**
 * Translation quality run — a graded eval, not a unit test.
 *
 *   npx tsx evals/translate.eval.ts
 *
 * It is NOT in the CI suite and must not be: it calls the real provider, so it
 * costs money and its result depends on the model of the day. CI stays fast,
 * free and deterministic; this runs deliberately, before a release or after a
 * model change.
 *
 * The split matters. lib/translate/checks.ts asserts what is DECIDABLE about a
 * translation — numbers preserved, agreed terminology used, nothing dropped,
 * nothing left in English. Those run on every commit. What no unit test can
 * assert is whether the Chinese actually MEANS the English, so that is
 * measured here in two ways:
 *
 *   1. The deterministic checks, over real curriculum sentences.
 *   2. Round-trip back-translation: the Chinese is translated back to English
 *      by the same model and compared with the original for the facts that
 *      matter. A meaning that survives a round trip is rarely wrong; one that
 *      does not is always worth a human look.
 *
 * Back-translation is a signal, not a verdict — a fluent wrong translation can
 * round-trip cleanly. It narrows what a bilingual teacher has to read, which
 * is the honest goal: the final word on a translation shown to a child belongs
 * to a person, and this is how we make that review small enough to actually
 * happen.
 */
import { generateText } from "ai";
import { readFileSync } from "node:fs";
import { aiModel } from "../src/lib/ai";
import { checkTranslation, describeIssues, type Glossary } from "../src/lib/translate/checks";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

// Real sentences from the Grade 7 corpus, chosen for the ways translation
// fails: numbers with units, a term with an everyday homonym, a negation, a
// conditional, and a formula.
const GLOSSARY: Glossary = {
  "magnetic field": { en: "space around a magnet", zh: "磁场（磁铁周围能作用的空间）" },
  solenoid: { en: "a long coil of wire", zh: "螺线管" },
  pivot: { en: "the fixed point something turns around", zh: "支点" },
  moment: { en: "the turning effect of a force", zh: "力矩" },
};

const CASES: { name: string; text: string; mustKeep: string[] }[] = [
  {
    name: "numbers and units",
    text: "A force of 7 N acts at a perpendicular distance of 0.4 m from the pivot, giving a moment of 2.8 N m.",
    mustKeep: ["7", "0.4", "2.8"],
  },
  {
    name: "negation",
    text: "Rubber, feathers and coins are not attracted by a magnet, so they are non-magnetic materials.",
    mustKeep: [],
  },
  {
    name: "conditional",
    text: "If the current is switched off, the iron core loses almost all of its magnetism.",
    mustKeep: [],
  },
  {
    name: "homonym under load",
    text: "The moment of a force is not the same as a moment in time.",
    mustKeep: [],
  },
  {
    name: "term consistency",
    text: "The magnetic field of a solenoid is strongest inside the coil.",
    mustKeep: [],
  },
];

const glossaryLines = Object.entries(GLOSSARY)
  .map(([en, v]) => `- "${en}" → ${v.zh}`)
  .join("\n");

async function toChinese(text: string): Promise<string> {
  const { text: out } = await generateText({
    model: aiModel("translate"),
    maxOutputTokens: 700,
    temperature: 0,
    system:
      "You are a professional bilingual physics teacher translating study material into Simplified Chinese (简体中文) " +
      "for a Grade 7 ESL student. Translate faithfully. Every number, unit and symbol must appear unchanged. " +
      `Use this approved terminology glossary:\n${glossaryLines}\nReturn ONLY the translation, no preamble.`,
    prompt: text,
  });
  return out.trim();
}

async function backToEnglish(chinese: string): Promise<string> {
  const { text: out } = await generateText({
    model: aiModel("translate"),
    maxOutputTokens: 700,
    temperature: 0,
    system:
      "Translate this Simplified Chinese physics text into plain English. Translate ONLY what is written — do not " +
      "correct, improve or add anything. Return only the English.",
    prompt: chinese,
  });
  return out.trim();
}

let failures = 0;

for (const c of CASES) {
  const zh = await toChinese(c.text);
  const issues = checkTranslation(c.text, zh, GLOSSARY);
  const back = await backToEnglish(zh);

  // Facts that must survive the round trip. Numbers are checked exactly;
  // meaning is left for the reader, which is the point.
  const lost = c.mustKeep.filter((n) => !back.includes(n));
  const ok = issues.length === 0 && lost.length === 0;
  if (!ok) failures += 1;

  console.log(`\n${ok ? "✓" : "✗"} ${c.name}`);
  console.log(`   EN   ${c.text}`);
  console.log(`   ZH   ${zh}`);
  console.log(`   BACK ${back}`);
  if (issues.length > 0) console.log(`   ISSUES ${describeIssues(issues)}`);
  if (lost.length > 0) console.log(`   LOST IN ROUND TRIP ${lost.join(", ")}`);
}

console.log(`\n${CASES.length - failures}/${CASES.length} passed.`);
console.log("Read the BACK lines yourself — a clean round trip is evidence, not proof.");
process.exit(failures > 0 ? 1 : 0);
