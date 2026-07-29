import { describe, expect, it, vi } from "vitest";
import { speakSequence, type Segment } from "./speech-sequence";

const seg = (text: string, lang: Segment["lang"] = "en-US"): Segment => ({ text, lang });

// A stand-in for speechSynthesis that reproduces the behaviour which caused
// the bug: cancel() delivers `onend` for the utterance it cancelled, so a
// cancel arrives at the sequencer looking exactly like a completion.
function engine() {
  const spoken: string[] = [];
  let pending: (() => void) | null = null;

  return {
    spoken,
    play: (s: Segment, done: () => void) => {
      spoken.push(s.text);
      pending = done;
    },
    /** The segment finishes normally. */
    finish: () => {
      const done = pending;
      pending = null;
      done?.();
    },
    /** The browser cancels, and reports it as an end event. */
    cancelFiresOnEnd: () => {
      const done = pending;
      pending = null;
      done?.();
    },
    hasPending: () => pending !== null,
  };
}

describe("speakSequence", () => {
  it("plays segments in order, one at a time", () => {
    const e = engine();
    speakSequence([seg("one"), seg("two"), seg("three")], e.play);
    expect(e.spoken).toEqual(["one"]);
    e.finish();
    expect(e.spoken).toEqual(["one", "two"]);
    e.finish();
    expect(e.spoken).toEqual(["one", "two", "three"]);
  });

  // The bug, exactly: Stop cancelled the current segment, the cancel arrived
  // as onend, and the handler started the next one. On a reply split into
  // several language runs it looked like speech that would not stop.
  it("does not advance to the next segment when cancel arrives as an end event", () => {
    const e = engine();
    const seq = speakSequence([seg("one"), seg("两"), seg("three")], e.play);
    expect(e.spoken).toEqual(["one"]);

    seq.cancel();
    e.cancelFiresOnEnd();

    expect(e.spoken).toEqual(["one"]);
    expect(seq.isActive()).toBe(false);
  });

  it("stays stopped when further callbacks arrive after cancelling", () => {
    // cancel() on a queued utterance can deliver several events.
    const e = engine();
    const seq = speakSequence([seg("one"), seg("two"), seg("three")], e.play);
    seq.cancel();
    e.cancelFiresOnEnd();
    e.cancelFiresOnEnd();
    e.cancelFiresOnEnd();
    expect(e.spoken).toEqual(["one"]);
  });

  it("reports completion when it reaches the end on its own", () => {
    const e = engine();
    const onFinished = vi.fn();
    const seq = speakSequence([seg("one"), seg("two")], e.play, onFinished);
    e.finish();
    e.finish();
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(seq.isActive()).toBe(false);
  });

  it("never reports completion for a cancelled sequence", () => {
    // Otherwise the button flips back to "Read aloud" while the browser is
    // still winding down, and the student taps it again.
    const e = engine();
    const onFinished = vi.fn();
    const seq = speakSequence([seg("one"), seg("two")], e.play, onFinished);
    seq.cancel();
    e.cancelFiresOnEnd();
    expect(onFinished).not.toHaveBeenCalled();
  });

  it("finishes immediately for an empty list", () => {
    const e = engine();
    const onFinished = vi.fn();
    speakSequence([], e.play, onFinished);
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(e.hasPending()).toBe(false);
  });

  it("ignores a cancel that arrives after the sequence already finished", () => {
    const e = engine();
    const onFinished = vi.fn();
    const seq = speakSequence([seg("one")], e.play, onFinished);
    e.finish();
    seq.cancel();
    expect(onFinished).toHaveBeenCalledTimes(1);
  });
});
