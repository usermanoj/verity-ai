import { Fragment, type ReactNode } from "react";

// Renders the small Markdown subset the tutor actually emits.
//
// Replies were previously dropped into a <p> as raw text, so students saw
// literal "**Axes**" and "- item" instead of formatting — the assistant's
// answers looked broken exactly where they were most structured (numbered
// steps, formulas, bulleted options).
//
// Deliberately not react-markdown: that's ~40 kB for a fraction of CommonMark
// we'd use, and this page already paid for one oversized dependency (the
// 441 kB Sentry bundle). Everything below builds React elements — never
// dangerouslySetInnerHTML — so model output cannot inject markup by
// construction.
export default function RichText({ text }: { text: string }) {
  return <div className="space-y-2">{renderBlocks(text)}</div>;
}

function renderBlocks(text: string): ReactNode[] {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(
      <p key={`p-${blocks.length}`} className="whitespace-pre-wrap">
        {inline(paragraph.join("\n"))}
      </p>,
    );
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, i) => <li key={i}>{inline(item)}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={`l-${blocks.length}`} className="ml-5 list-decimal space-y-1">
          {items}
        </ol>
      ) : (
        <ul key={`l-${blocks.length}`} className="ml-5 list-disc space-y-1">
          {items}
        </ul>
      ),
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(
        <div key={`h-${blocks.length}`} className="pt-1 font-semibold text-[var(--brand2)]">
          {inline(heading[2])}
        </div>,
      );
      continue;
    }

    // Indented sub-bullets are flattened into the same list rather than
    // nested — the tutor only ever goes one level deep in practice.
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

// **bold**, *italic* and `code`, applied in one pass so the delimiters can't
// be mistaken for each other.
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g;

function inline(text: string): ReactNode {
  const parts = text.split(INLINE).filter((p) => p !== "");
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-[var(--text)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="rounded bg-black/30 px-1 py-0.5 text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
