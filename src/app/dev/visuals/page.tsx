import { notFound } from "next/navigation";
import FormulaPlayground from "@/components/lesson/FormulaPlayground";
import RelationshipPlay from "@/components/lesson/RelationshipPlay";
import ConceptVisual from "@/components/topic/visuals/ConceptVisual";
import TableChart from "@/components/lesson/TableChart";
import { VISUALS } from "@/lib/visuals/catalogue";

// Every interactive on one page, for looking at.
//
// A lesson page needs a signed-in student enrolled in a class the material
// reaches, which is correct and makes "does this widget look right" a ten-step
// errand. Every visual change in this project so far has been verified by
// rendered markup and by tests — which catch the wrong numbers and never catch
// a slider sitting on top of its own label.
//
// Development only. A gallery is a fine thing to have and a bad thing to ship:
// it renders components with sample text, and sample text on a school's domain
// is indistinguishable from material somebody approved.
export const dynamic = "force-dynamic";

// Verbatim from the school's decks, so what is on screen here is what is on
// screen there. Invented examples would make this a picture of itself.
const REAL = {
  formula:
    "Moment = force x perpendicular distance from the turning point. Where force is in newtons (N), distance is in metres(m) and so moment is measured in newton metres (Nm)",
  worked:
    "Example: Calculate the force applied if the moment of force is 42Nm and the distance of the force from pivot is 7cm. M = F x d F = M / d",
  inverse: "Closer the poles, greater is the force. This is used to understand that magnets attract and repel other magnets.",
  otherWay:
    "Greater the distance from the wire, weaker is the magnetic field. The field forms circles around the wire.",
  table: {
    headers: ["Time in s", "Distance in m"],
    rows: [["0", "0"], ["1", "10"], ["2", "20"], ["3", "30"], ["4", "40"], ["5", "50"]],
  },
};

// Subjects this school has not uploaded, to check the claim that none of this
// knows what it is looking at.
const OTHER_SUBJECTS = [
  "Density = mass / volume. This is why a stone sinks in water.",
  "For any rectangle, Area = length x width.",
  "Higher the temperature, faster is the reaction.",
  "More the light, taller is the plant.",
];

export default function DevVisuals() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto max-w-3xl space-y-10 px-6 py-10">
      <header>
        <h1 className="text-2xl font-bold">Interactives</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Development only. Text is verbatim from the school&apos;s real decks unless marked otherwise.
        </p>
      </header>

      <Panel title="Formula — from the moments deck">
        <FormulaPlayground text={REAL.formula} />
        <FormulaPlayground text={REAL.worked} />
      </Panel>

      <Panel title="Relationship — from the magnets deck">
        <RelationshipPlay text={REAL.inverse} />
        <RelationshipPlay text={REAL.otherWay} />
      </Panel>

      <Panel title="The same two components, on subjects nobody has uploaded">
        {OTHER_SUBJECTS.map((text) => (
          <div key={text}>
            <FormulaPlayground text={text} />
            <RelationshipPlay text={text} />
          </div>
        ))}
      </Panel>

      <Panel title="Table becomes a graph">
        <TableChart table={REAL.table} />
      </Panel>

      <Panel title="The hand-built catalogue">
        {VISUALS.map((v) => (
          <div key={v.id} className="mt-6">
            <h3 className="mb-1 text-sm font-medium text-[var(--brand2)]">
              {v.label} <span className="text-[var(--muted)]">· {v.id}</span>
            </h3>
            <ConceptVisual kind={v.id} />
          </div>
        ))}
      </Panel>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">{title}</h2>
      <div className="glass rounded-3xl p-5">{children}</div>
    </section>
  );
}
