// Playing a list of speech segments one after another, and — the part that
// went wrong — stopping.
//
// speechSynthesis.cancel() fires `onend` on the utterance it just cancelled.
// The sequencer's onend handler is "play the next segment", so cancelling
// advanced the queue instead of ending it: pressing Stop on a mixed
// English/中文 reply moved to the next segment, and the next Stop moved to the
// one after that. It read as speech that would not stop and kept repeating.
//
// The sequencing is separated from the browser API so that exact behaviour —
// a cancel that arrives as a completion — can be reproduced in a test.

export type Segment = { text: string; lang: "zh-CN" | "en-US" };

/** Hands one segment to the speech engine and calls `done` when it ends. */
export type PlaySegment = (segment: Segment, done: () => void) => void;

export type Sequence = {
  /** Stop after the current segment's callback; further callbacks are ignored. */
  cancel: () => void;
  /** False once cancelled or finished. */
  isActive: () => boolean;
};

/**
 * Plays `segments` in order.
 *
 * `onFinished` runs only when the sequence reaches the end on its own — a
 * cancelled sequence must not report completion, or the button would flip
 * back to "Read aloud" while the browser is still winding down.
 */
export function speakSequence(
  segments: Segment[],
  play: PlaySegment,
  onFinished?: () => void,
): Sequence {
  let index = 0;
  let active = true;

  const next = () => {
    // The guard the original lacked. Every callback after a cancel — whether
    // it is a real completion, an error, or the synthetic `onend` that
    // cancel() itself produces — lands here and stops.
    if (!active) return;

    if (index >= segments.length) {
      active = false;
      onFinished?.();
      return;
    }
    play(segments[index++], next);
  };

  next();

  return {
    cancel: () => {
      active = false;
    },
    isActive: () => active,
  };
}
