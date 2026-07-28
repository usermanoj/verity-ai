import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import RichText from "./RichText";

const html = (text: string) => renderToStaticMarkup(<RichText text={text} />);

describe("RichText ordered lists", () => {
  // The shape the tutor actually produces: a numbered step, bullets beneath
  // it, a blank line, the next step. Every interruption closed the <ol>, so a
  // four-step answer rendered as "1. 1. 1. 1." on screen.
  const STEPS = `1. Magnetic and non-magnetic materials

- **Magnetic** = attracted by a magnet.
- Examples: iron, nickel.

2. Permanent and temporary magnets

- A **bar magnet** is permanent.

3. Poles of magnets`;

  it("continues the numbering across interrupting bullets", () => {
    const out = html(STEPS);
    expect(out).toContain('start="1"');
    expect(out).toContain('start="2"');
    expect(out).toContain('start="3"');
  });

  it("does not restart every list at one", () => {
    // Three separate <ol>s is fine; three <ol>s all starting at 1 is the bug.
    expect(html(STEPS).match(/start="1"/g)).toHaveLength(1);
  });

  it("keeps a single uninterrupted list as one element", () => {
    const out = html("1. first\n2. second\n3. third");
    expect(out.match(/<ol/g)).toHaveLength(1);
  });

  it("renders bullets as an unordered list with no start attribute", () => {
    const out = html("- one\n- two");
    expect(out).toContain("<ul");
    expect(out).not.toContain("start=");
  });
});

describe("RichText inline", () => {
  it("sets ESL glosses back from the sentence", () => {
    // "attracted [pulled] by a magnet" — the gloss is help, not emphasis.
    expect(html("attracted [pulled] by a magnet")).toContain("var(--muted)");
  });

  it("still renders bold and code", () => {
    const out = html("**Magnetic** and `iron`");
    expect(out).toContain("<strong");
    expect(out).toContain("<code");
  });

  it("escapes markup in model output rather than rendering it", () => {
    expect(html("<img src=x onerror=alert(1)>")).not.toContain("<img");
  });
});
