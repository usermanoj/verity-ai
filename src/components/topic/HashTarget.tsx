"use client";

import { useEffect } from "react";

// Keeps a #hash target in view while the page is still settling.
//
// "Practise now" jumps to #practice, and the browser does exactly that — at
// the moment it processes the hash. Everything below then finishes arriving:
// lazily-loaded slide images resolve to their real heights, entrance
// animations run, fonts swap. Each one pushes the practice section further
// down, and the student is left somewhere in the middle of the lesson
// wondering why the button didn't work. It is worst on the longest documents,
// which are exactly the ones where scrolling by hand is most painful.
//
// So the jump is re-applied while the layout is still moving, and abandoned
// the instant the student takes over.
export default function HashTarget({ id }: { id: string }) {
  useEffect(() => {
    let teardown: (() => void) | null = null;

    const settle = () => {
      teardown?.();
      if (window.location.hash !== `#${id}`) return;

      let cancelled = false;

      // Any deliberate scroll INPUT means the student has taken control, and
      // yanking them back would be worse than the original bug. Deliberately
      // not the "scroll" event — our own corrections fire that, which would
      // cancel us on the first correction.
      const surrender = () => {
        cancelled = true;
      };
      const passive = { passive: true } as const;
      window.addEventListener("wheel", surrender, passive);
      window.addEventListener("touchstart", surrender, passive);
      window.addEventListener("keydown", surrender);

      const jump = () => {
        if (cancelled) return;
        document.getElementById(id)?.scrollIntoView({ block: "start" });
      };
      jump();

      // Watched rather than put on a fixed timer: images finish at wildly
      // different times on a 30-slide deck over school wifi.
      const observer = new ResizeObserver(jump);
      observer.observe(document.body);

      // A hard stop, so nothing is still nudging a student who simply reads
      // slowly without touching the wheel.
      const done = setTimeout(() => observer.disconnect(), 2500);

      teardown = () => {
        clearTimeout(done);
        observer.disconnect();
        window.removeEventListener("wheel", surrender);
        window.removeEventListener("touchstart", surrender);
        window.removeEventListener("keydown", surrender);
        teardown = null;
      };
    };

    // On arrival (a shared or reloaded #practice link) and on every in-page
    // tap of the button, which is the common case and changes only the hash.
    settle();
    window.addEventListener("hashchange", settle);
    return () => {
      teardown?.();
      window.removeEventListener("hashchange", settle);
    };
  }, [id]);

  return null;
}
