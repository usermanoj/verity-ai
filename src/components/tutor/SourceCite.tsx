"use client";

// Provenance, at the size it deserves.
//
// The model emits one citation per chunk it used, and they were printed
// verbatim:
//
//   📖 Based on: Magnets and Electromagnets.pptx — Page/Section 1, Magnets
//   and Electromagnets.pptx — Page/Section 4, Magnets and Electromagnets.pptx
//   — Page/Section 8, … (nine times)
//
// Six lines of repeated filename under a four-line answer. It buried the
// reply, and it told a student nothing they could act on.
//
// Deleting it was the obvious response and the wrong one: "answers only from
// your teacher's material, and shows you where" IS the product — it's the
// claim that separates this from a chatbot, and the one a head of department
// will ask to see. So the filename is stated once and each section becomes a
// chip that jumps to that part of the lesson. Same guarantee, one quiet line,
// and now it does something: "where did that come from?" is one click.

export type SourceRef = { section: number; anchor?: string };

// Citations arrive as "<file> — Page/Section <n>", comma-joined. Scanning for
// the section numbers is safer than splitting on ", " — filenames contain
// commas often enough ("Unit 7, Magnets.pptx") to make that a real bug.
const SECTION_RE = /Page\/Section\s+(\d+)/g;

export function parseCite(cite: string): { file: string | null; sections: number[] } {
  const body = cite.replace(/^📖\s*Based on:\s*/, "").trim();

  const sections = [...body.matchAll(SECTION_RE)].map((m) => Number(m[1]));
  const unique = [...new Set(sections)].sort((a, b) => a - b);

  // Everything before the first em-dash of the first citation — the same file
  // for every entry in practice, since a reply draws on one document.
  const file = body.split(" — ")[0]?.replace(/\s*\(demo mode.*\)\s*$/, "").trim() || null;

  return { file: file && file !== body ? file : null, sections: unique };
}

export default function SourceCite({
  cite,
  anchors,
}: {
  cite: string;
  // Section number → element id on the lesson page. Absent on the two demo
  // topics, which have hand-built layouts and no per-section anchors; chips
  // stay unlinked there rather than pointing somewhere wrong.
  anchors?: Record<string, string>;
}) {
  const { file, sections } = parseCite(cite);

  // Nothing parsed — show what we were given rather than swallowing the
  // provenance, which is the one thing here that must not go missing.
  if (sections.length === 0) {
    return (
      <div className="mt-2.5 text-[11px] leading-relaxed text-[var(--muted)]">
        📖 {cite.replace(/^📖\s*Based on:\s*/, "")}
      </div>
    );
  }

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-[var(--border)] pt-2 text-[11px]">
      <span className="text-[var(--muted)]" title={file ?? undefined}>
        📖 From your material
      </span>
      <span className="flex flex-wrap gap-1">
        {sections.map((n) => {
          const anchor = anchors?.[String(n)];
          const label = `§${n}`;
          const base =
            "rounded-md bg-[rgba(34,211,238,0.12)] px-1.5 py-0.5 font-medium text-[var(--brand2)] tabular-nums";
          return anchor ? (
            <a
              key={n}
              href={`#${anchor}`}
              title={`Jump to section ${n}`}
              className={`${base} transition hover:bg-[rgba(34,211,238,0.24)]`}
            >
              {label}
            </a>
          ) : (
            <span key={n} className={base}>
              {label}
            </span>
          );
        })}
      </span>
    </div>
  );
}
