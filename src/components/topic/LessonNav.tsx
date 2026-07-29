"use client";

import { useEffect, useRef, useState } from "react";

// A horizontal contents rail. A twenty-section deck is a long scroll with no
// sense of where you are or what is coming — the demo topics never had this
// problem because they were short and purpose-built.
//
// Plain anchors, so it works before hydration; the active highlight is the
// only part that needs JavaScript.
export default function LessonNav({ headings }: { headings: { id: string; title: string }[] }) {
  const [activeId, setActiveId] = useState(headings[0]?.id ?? "");
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Topmost visible section wins, so scrolling up highlights the
        // section you're arriving at rather than the one you just left.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );

    for (const h of headings) {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [headings]);

  // Keep the active chip in view on a rail that scrolls sideways — by moving
  // the rail's own scrollLeft, never scrollIntoView.
  //
  // scrollIntoView scrolls every scrollable ancestor, including the document.
  // Once the reader had scrolled past this rail, each new active section
  // dragged the page back up to it, so the lesson could not be scrolled at
  // all: the nav fought the reader for control of the page.
  useEffect(() => {
    const rail = railRef.current;
    const chip = rail?.querySelector<HTMLElement>(`[data-for="${activeId}"]`);
    if (!rail || !chip) return;
    rail.scrollTo({ left: chip.offsetLeft - rail.clientWidth / 2 + chip.clientWidth / 2, behavior: "smooth" });
  }, [activeId]);

  return (
    <nav
      aria-label="Lesson contents"
      className="sticky top-0 z-20 -mx-6 mt-6 border-b border-[var(--border)] bg-[rgba(10,12,24,0.72)] px-6 pt-4 backdrop-blur-xl"
    >
      <div className="mb-2 flex items-baseline gap-2 text-[11px] uppercase tracking-widest text-[var(--muted)]">
        <span>In this lesson</span>
        {/* The count is the other half of the answer: a rail that scrolls is
            only useful if you know roughly how far it goes. */}
        <span className="normal-case tracking-normal opacity-70">
          {headings.length} section{headings.length === 1 ? "" : "s"}
        </span>
      </div>
      {/* The scrollbar used to be hidden outright. On a 29-section deck the
          rail ends mid-chip at the right edge and nothing says there is more,
          so students read the first six headings as the whole lesson. A thin
          one is the affordance; hiding it was style at the cost of meaning. */}
      <div
        ref={railRef}
        className="flex gap-2 overflow-x-auto pb-2 [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--border)] [&::-webkit-scrollbar-thumb:hover]:bg-[var(--brand)] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:h-1.5"
      >
        {headings.map((h, i) => {
          const active = h.id === activeId;
          return (
            <a
              key={h.id}
              href={`#${h.id}`}
              data-for={h.id}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                active
                  ? "border-[var(--brand)] bg-[rgba(99,102,241,0.2)] text-[var(--text)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              <span className="mr-1.5 opacity-60">{i + 1}</span>
              {h.title}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
