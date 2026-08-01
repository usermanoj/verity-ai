// Turning leaked LaTeX back into something a child can read.
//
// The system prompt forbids it (rule 6), and a model produced this anyway, in
// front of a real Grade 7 student:
//
//   Example: \(200\,\text{N} \times 1.5\,\text{m} = F \times 1.0\,\text{m}\)
//   Step 1: \(200 \times 1.5 = 300\)
//
// A prompt is a request, not a guarantee, and this is a rendering concern in
// the end: the chat shows plain text, so anything the model wraps in \( \)
// arrives as backslashes. For someone reading physics in a second language,
// that is worse than no formula — they cannot tell the notation from the
// content.
//
// Deliberately a small, total transformation rather than a LaTeX parser. It
// handles what a chat model actually emits for school maths and leaves anything
// exotic alone, because a half-parsed formula is more misleading than a raw
// one.

const REPLACEMENTS: [RegExp, string][] = [
  // Delimiters first, so what is inside them is exposed to the rules below.
  [/\\\[|\\\]|\\\(|\\\)/g, ""],
  // PAIRED dollars only. Stripping every `$` turned "It costs $5" into "It
  // costs 5" — a physics deck can mention money, and silently deleting a
  // currency symbol changes what a sentence says.
  [/\$\$([\s\S]*?)\$\$/g, "$1"],
  [/\$([^$\n]+)\$/g, "$1"],
  // \text{N} and \mathrm{kg} are wrappers around ordinary words.
  [/\\(?:text|mathrm|mathbf|textbf|mathit)\{([^{}]*)\}/g, "$1"],
  // \frac{a}{b} → a/b. Only the non-nested case: a nested fraction rendered
  // as a/b/c would be wrong, and wrong maths beats ugly maths only in the
  // direction nobody wants.
  [/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1/$2"],
  // The operators and units that actually turn up in Grade 7 physics.
  [/\\times/g, "×"],
  [/\\cdot/g, "·"],
  [/\\div/g, "÷"],
  [/\\pm/g, "±"],
  [/\\approx/g, "≈"],
  [/\\neq/g, "≠"],
  [/\\leq/g, "≤"],
  [/\\geq/g, "≥"],
  [/\\degree|\\circ/g, "°"],
  [/\\theta/g, "θ"],
  [/\\alpha/g, "α"],
  [/\\beta/g, "β"],
  [/\\Delta/g, "Δ"],
  [/\\pi/g, "π"],
  // \, and \; are thin spaces; \! is negative space. All become one space.
  [/\\[,;:!]/g, " "],
  [/\\quad|\\qquad/g, "  "],
  // A trailing \\ is a line break inside a LaTeX block.
  [/\\\\/g, "\n"],
];

/**
 * Rewrites common LaTeX into plain text, leaving everything else untouched.
 *
 * Applied at render time rather than to the stored text: the transcript keeps
 * exactly what the model said, so a teacher reading it later sees the truth,
 * and a future renderer that CAN draw formulas is not stuck with text somebody
 * flattened years earlier.
 */
export function deLatex(text: string): string {
  if (!text.includes("\\") && !text.includes("$")) return text;

  let out = text;
  for (const [pattern, replacement] of REPLACEMENTS) out = out.replace(pattern, replacement);

  // Collapse the double spaces the substitutions leave behind, without
  // touching newlines — the block renderer depends on those.
  return out
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trimEnd())
    .join("\n");
}
