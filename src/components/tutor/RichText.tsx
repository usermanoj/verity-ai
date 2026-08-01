import { Fragment, memo, type ReactNode } from "react";
import { deLatex } from "./delatex";

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
// Memoised, and that matters more than it looks. A streaming reply calls
// setMessages on every token, which re-renders the whole transcript — so a
// 200-token answer re-parsed the Markdown of every message already on screen
// 200 times over. By the tenth exchange that is thousands of pointless
// re-parses per reply, and it is most of why tapping a button felt laggy.
// The text of a finished message never changes, so none of that work was
// ever needed.
function RichText({ text }: { text: string }) {
  // At render, not at storage. The transcript keeps exactly what the model
  // said, so a teacher reading it later sees the truth — and a future renderer
  // that CAN draw formulas is not stuck with text somebody flattened.
  return <div className="space-y-2">{renderBlocks(deLatex(text))}</div>;
}

export default memo(RichText);

function renderBlocks(text: string): ReactNode[] {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  // `start` is why a four-step answer rendered as "1. 1. 1. 1.": the tutor
  // writes a numbered step, then bullets under it, then the next step. The
  // bullets (and the blank lines around them) close the <ol>, so every step
  // opened a fresh list that restarted its own count at one. Carrying the
  // number the model actually wrote keeps the sequence intact however the
  // list is interrupted.
  let list: { ordered: boolean; items: string[]; start: number } | null = null;
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
    const items = list.items.map((item, i) => (
      <li key={i} className="pl-1 leading-relaxed">
        {inline(item)}
      </li>
    ));
    blocks.push(
      list.ordered ? (
        <ol
          key={`l-${blocks.length}`}
          start={list.start}
          className="ml-5 list-decimal space-y-1.5 marker:font-semibold marker:text-[var(--brand2)]"
        >
          {items}
        </ol>
      ) : (
        <ul key={`l-${blocks.length}`} className="ml-5 list-disc space-y-1.5 marker:text-[var(--brand2)]">
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
    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [], start: numbered ? Number(numbered[1]) : 1 };
      }
      list.items.push(numbered ? numbered[2] : bullet![1]);
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

// **bold**, *italic*, `code`, and the [plain-word gloss] the ESL prompt asks
// for, applied in one pass so the delimiters can't be mistaken for each other.
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*|\[[^\]\n]+\])/g;

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
    // The ESL prompt glosses hard words inline — "attracted [pulled] by a
    // magnet". Rendered flat it reads as a typo; set back a shade it reads as
    // the help it is, and the sentence still scans without it.
    if (part.startsWith("[") && part.endsWith("]")) {
      return (
        <span key={i} className="text-[0.92em] text-[var(--muted)]">
          {part}
        </span>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
