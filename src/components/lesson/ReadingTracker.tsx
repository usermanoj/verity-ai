"use client";

import { useEffect, useRef } from "react";

// Recording that a child got to the end of the lesson — and nothing finer.
//
// A section counts as reached when it comes into view. That is the whole
// measurement. No timing: not how long a section was on screen, not how long
// the page was open, not whether the tab had focus. Those are the obvious
// things to collect and they are surveillance of a minor — they score a
// left-open tab as diligence and a fast reader as inattentive, and once a
// school holds them it is being asked questions about a child's afternoon that
// it should not be answering.
//
// Batched deliberately. An observer that posted per section would send thirty
// requests down a classroom's shared connection while a student was trying to
// read; this sends the set so far, at most every fifteen seconds and only when
// it has grown.

/** No more often than this, however fast they scroll. */
const FLUSH_MS = 15_000;

/** Enough of the card on screen to have been in front of them. */
const VISIBLE_RATIO = 0.35;

export default function ReadingTracker({ topicId, total }: { topicId: string; total: number }) {
  // Refs throughout: none of this should cause a render. The student is
  // reading, and a lesson that re-renders because it is being measured is a
  // lesson made worse by the measuring.
  const seen = useRef(new Set<number>());
  const sent = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (total <= 0) return;

    const flush = (final = false) => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      if (seen.current.size <= sent.current) return;
      const sections = [...seen.current].sort((a, b) => a - b);
      sent.current = sections.length;

      const body = JSON.stringify({ topicId, sections, total });
      // sendBeacon survives the page being closed, which is exactly when the
      // last and most complete report is ready. fetch would be cancelled.
      if (final && typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon("/api/events/reading", new Blob([body], { type: "application/json" }));
        return;
      }
      void fetch("/api/events/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        // A failure here must be invisible. Losing a reading figure is a
        // thinner dashboard; an error on a lesson page is a child stuck.
      }).catch(() => {});
    };

    const schedule = () => {
      if (timer.current) return;
      timer.current = setTimeout(() => flush(), FLUSH_MS);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.sectionIndex);
          if (Number.isNaN(index)) continue;
          seen.current.add(index);
          // Once seen is seen — no need to keep watching it, and it keeps the
          // observer's work proportional to what is left rather than to the
          // length of the lesson.
          observer.unobserve(entry.target);
        }
        schedule();
      },
      { threshold: VISIBLE_RATIO },
    );

    const sections = document.querySelectorAll("[data-section-index]");
    sections.forEach((el) => observer.observe(el));

    // Leaving the tab is the most reliable moment to report, and on mobile it
    // is often the only one — a backgrounded page may never see unload.
    const onHide = () => {
      if (document.visibilityState === "hidden") flush(true);
    };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onHide);
      flush(true);
    };
  }, [topicId, total]);

  return null;
}
