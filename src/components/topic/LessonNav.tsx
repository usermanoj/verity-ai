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

  // Keep the active chip in view on a rail that scrolls sideways.
  useEffect(() => {
    railRef.current?.querySelector<HTMLElement>(`[data-for="${activeId}"]`)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeId]);

  return (
    <nav aria-label="Lesson contents" className="mt-6">
      <div className="mb-2 text-[11px] uppercase tracking-widest text-[var(--muted)]">In this lesson</div>
      <div ref={railRef} className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
