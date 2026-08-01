// Turning a table the teacher already wrote into a graph.
//
// The first interactive visual, and deliberately the safest one. Every other
// candidate — a lever simulation, a field diagram — requires deciding what a
// section is ABOUT, and being wrong there puts a misleading picture in a physics
// lesson. A chart of the teacher's own numbers cannot be wrong about the topic:
// the data is theirs, the axes are their column headings, and there is no model
// call anywhere in it.
//
// The distance-time deck already carries two of these, extracted at ingestion:
//
//   Time in s | Distance in m        →  0,50  1,50  2,50 …   a stationary object
//   Time in s | Distance in m | Speed →  0,0  1,10  2,20 …   constant 10 m/s
//
// Both are the canonical graph of the lesson they sit in, and until now a
// student saw them only as a grid of numbers.

export type TopicTable = { headers: string[]; rows: string[][] };

export type Series = { label: string; values: number[] };
export type ChartData = {
  x: Series;
  series: Series[];
  /** Rows that had a number in every plotted column. */
  points: number;
};

/** Below this a "chart" is two dots and a line, which explains nothing. */
export const MIN_POINTS = 3;

/**
 * Reads one cell as a number, or null.
 *
 * Tolerates the units and separators a teacher types into a slide: "50 m",
 * "1,200", "12.5s". Rejects anything with letters left over once the unit is
 * stripped — "(10-0)/(1-0) = 10m/s" is working, not a datum, and a column of
 * working plotted as a series would be nonsense presented as fact.
 */
export function readNumber(cell: string): number | null {
  const text = (cell ?? "").trim();
  if (!text) return null;
  // A leading number, optionally signed and decimal, followed only by a unit.
  const match = /^([+-]?\d[\d,]*(?:\.\d+)?)\s*([a-zA-Z°%/]{0,6})$/.exec(text);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/**
 * A column is numeric only if EVERY non-empty cell in it is a number.
 *
 * Not "most": a column that is numbers for four rows and working for two is
 * exactly the Speed column in the real deck, and plotting the four would draw a
 * line that stops halfway with no explanation.
 */
function columnValues(rows: string[][], index: number): number[] | null {
  const values: number[] = [];
  for (const row of rows) {
    const cell = row[index];
    if (cell === undefined || cell.trim() === "") continue;
    const n = readNumber(cell);
    if (n === null) return null;
    values.push(n);
  }
  return values.length ? values : null;
}

/**
 * A table as a chart, or null when it is not one.
 *
 * Null is the common answer and the important one. A vocabulary table, a
 * comparison of two magnet types, a list of apparatus — none of those are
 * charts, and drawing axes around them would be worse than the grid of numbers
 * they already are.
 *
 * The FIRST numeric column becomes the x axis. In a school table that is
 * essentially always the independent variable — time, distance, mass — because
 * that is the order people write them in.
 */
export function toChart(table: TopicTable): ChartData | null {
  const { headers, rows } = table;
  if (!headers?.length || !rows?.length || rows.length < MIN_POINTS) return null;

  const numeric: { index: number; values: number[] }[] = [];
  for (let i = 0; i < headers.length; i += 1) {
    const values = columnValues(rows, i);
    if (values) numeric.push({ index: i, values });
  }
  if (numeric.length < 2) return null;

  const [xCol, ...yCols] = numeric;
  // Every plotted column must cover the same rows, or points would pair up
  // wrongly and the shape of the graph would be an artefact of missing cells.
  const points = xCol.values.length;
  const series = yCols
    .filter((c) => c.values.length === points)
    .map((c) => ({ label: headers[c.index] ?? `Column ${c.index + 1}`, values: c.values }));
  if (series.length === 0 || points < MIN_POINTS) return null;

  // A column that never changes is an axis label, not a measurement — except
  // when it is the y, where "distance stays at 50" is the whole point of a
  // stationary-object graph. So only the X is required to vary.
  if (new Set(xCol.values).size < 2) return null;

  return { x: { label: headers[xCol.index] ?? "x", values: xCol.values }, series, points };
}

/** Where a line sits in a box, as fractions of width and height. */
export function toPath(values: number[], xs: number[]): { x: number; y: number }[] {
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(0, ...values);
  const yMax = Math.max(...values);
  // A flat line would divide by zero. Centring it is the honest picture of a
  // quantity that does not change.
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;
  return values.map((v, i) => ({
    x: (xs[i] - xMin) / xSpan,
    y: 1 - (v - yMin) / ySpan,
  }));
}

/** Round numbers for an axis, without a dependency. */
export function axisTicks(values: number[], count = 4): number[] {
  const min = Math.min(0, ...values);
  const max = Math.max(...values);
  if (max === min) return [min];
  const step = (max - min) / count;
  return Array.from({ length: count + 1 }, (_, i) => Number((min + step * i).toFixed(2)));
}
