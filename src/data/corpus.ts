// APPROVED TEACHER CORPUS — the ONLY knowledge source the AI Learning Assistant may use.
// Faithfully transcribed / paraphrased from the school's own Grade 7 Physics materials:
//   - PPT: "Grade 7 physics Moments of force.pptx"
//   - PPT: "4-Distance time graph.pptx"
//   - Worksheet 2 (Speed/Velocity) + answer key
//   - Worksheet 7 (Moments) + answer key
// Each chunk carries a precise citation so the AI can show provenance.

export type CorpusChunk = {
  id: string;
  source: string;      // human-readable citation shown to students
  sourceType: "slides" | "worksheet" | "notes";
  topicId: string;
  heading: string;
  text: string;
  // The part of the lesson this concept belongs to. Chunking names it once
  // per document so a 33-section deck reads as five or six movements rather
  // than 33 equal peers. Undefined for the hand-built demo topics and for
  // anything ingested before modules existed — both render flat.
  module?: string;
};

export type TopicMeta = {
  id: string;
  subject: string;
  grade: string;
  title: string;
  objective: string;
};

export const TOPICS: Record<string, TopicMeta> = {
  moments: {
    id: "moments",
    subject: "Physics",
    grade: "Grade 7",
    title: "Moments of a Force",
    objective: "To define the moment of a force and to use the principle of moments.",
  },
  "distance-time": {
    id: "distance-time",
    subject: "Physics",
    grade: "Grade 7",
    title: "Distance–Time Graphs",
    objective:
      "To describe motion from a distance-time graph and to find speed from the gradient of the line.",
  },
};

export const CORPUS: CorpusChunk[] = [
  {
    id: "m-def",
    source: "Moments of Force — Slide 2",
    sourceType: "slides",
    topicId: "moments",
    heading: "What is a moment?",
    text:
      "The turning effect of a force is called a moment. The size of the moment depends on the force applied and how far it is from the pivot. " +
      "Moment = force × perpendicular distance from the turning point (pivot). " +
      "Force is measured in newtons (N), distance in metres (m), so the moment is measured in newton metres (Nm).",
  },
  {
    id: "m-principle",
    source: "Moments of Force — Slide 3",
    sourceType: "slides",
    topicId: "moments",
    heading: "The Principle of Moments",
    text:
      "The Principle of Moments states that when a body is balanced (in equilibrium), the total clockwise moment about a fixed point (pivot) equals the total anticlockwise moment about the same fixed point.",
  },
  {
    id: "m-seesaw",
    source: "Moments of Force — Slides 5–6 (worked example)",
    sourceType: "slides",
    topicId: "moments",
    heading: "Worked example: the seesaw",
    text:
      "Ram weighs 200 N. He sits 1.5 m from the pivot of a seesaw on the left-hand side. Shyam sits 1.0 m from the pivot on the other side. " +
      "For the seesaw to be balanced, the clockwise and anticlockwise moments must be equal: F1 × d1 = F2 × d2. " +
      "So 200 × 1.5 = F2 × 1.0, giving 300 = F2. Shyam's weight is 300 N.",
  },
  {
    id: "m-rearrange",
    source: "Moments of Force — Slides 14–15 (worked example)",
    sourceType: "slides",
    topicId: "moments",
    heading: "Rearranging the formula",
    text:
      "Example: calculate the force applied if the moment of force is 42 Nm and the distance of the force from the pivot is 7 cm. " +
      "M = F × d, so F = M / d. With M = 42 Nm and d = 7 cm = 0.07 m, F = 42 / 0.07 = 600 N. " +
      "Note: always convert distance to metres before calculating.",
  },
  {
    id: "m-net",
    source: "Moments of Force — Slides 9–10 (net moment)",
    sourceType: "slides",
    topicId: "moments",
    heading: "Net (resultant) moment",
    text:
      "When several forces act, find the net moment by adding moments in the same direction and subtracting opposite directions. " +
      "Example: net moment = (1 m × 6 N) − (2 m × 3 N) = 0 Nm, so the beam is balanced. " +
      "Example: net moment = (2 m × 4 N) − (1 m × 6 N) = 2 Nm, anticlockwise.",
  },
  {
    id: "m-ws7-lever",
    source: "Worksheet 7, Q4 (answer key)",
    sourceType: "worksheet",
    topicId: "moments",
    heading: "Worksheet example: turning a lever",
    text:
      "A force of 70 N turns a lever about point P. Moment = force × perpendicular distance from the pivot = 70 × 0.4 = 28 Nm, clockwise. " +
      "Always write the formula, show the working, and state the unit (Nm) and the direction (clockwise or anticlockwise).",
  },
  {
    id: "m-ws7-rock",
    source: "Worksheet 7, Q5 (answer key)",
    sourceType: "worksheet",
    topicId: "moments",
    heading: "Worksheet example: person and rock",
    text:
      "Moment of the person = F × d = 600 × 0.5 = 300 Nm, anticlockwise. Moment of the rock = F × d = 1800 × 0.2 = 360 Nm, clockwise. " +
      "The person produces less moment than the rock, so the total anticlockwise moment is less than the total clockwise moment (not balanced).",
  },
  {
    id: "dt-def",
    source: "Distance-Time Graphs — Slides 1, 7",
    sourceType: "slides",
    topicId: "distance-time",
    heading: "What is steady speed?",
    text:
      "A steady (uniform) speed means an object travels an equal distance in each equal interval of time. " +
      "For example, a steady speed of 10 m/s means a car travels a distance of 10 m every second.",
  },
  {
    id: "dt-axes",
    source: "Distance-Time Graphs — Slides 4–5",
    sourceType: "slides",
    topicId: "distance-time",
    heading: "Which axis is which?",
    text:
      "In a distance-time graph, time is the independent variable and is plotted on the x-axis (horizontal axis). " +
      "Distance is the dependent variable — it changes with time — and is plotted on the y-axis (vertical axis). " +
      "Before plotting, you must choose and write a scale for each axis (for example, 1 cm = 1 second on the x-axis, 1 cm = 10 m on the y-axis), and label both axes clearly.",
  },
  {
    id: "dt-stationary",
    source: "Distance-Time Graphs — Slides 3, 6",
    sourceType: "slides",
    topicId: "distance-time",
    heading: "A horizontal line means stationary",
    text:
      "The distance-time graph of an object that is not moving is a horizontal line parallel to the x-axis, because its distance from the reference point stays the same as time passes. " +
      "For example, a car parked 50 m from a lamp post stays at 50 m at every time reading from 0 s to 5 s.",
  },
  {
    id: "dt-uniform-table",
    source: "Distance-Time Graphs — Slide 7",
    sourceType: "slides",
    topicId: "distance-time",
    heading: "Worked example: steady speed table",
    text:
      "For an object moving at a steady speed of 10 m/s, the distance increases by 10 m every second: " +
      "Time (s): 0, 1, 2, 3, 4, 5 → Distance (m): 0, 10, 20, 30, 40, 50. " +
      "The speed between any two points is found the same way: (10 − 0) m / (1 − 0) s = 10 m/s, and (20 − 10) m / (2 − 1) s = 10 m/s.",
  },
  {
    id: "dt-gradient",
    source: "Distance-Time Graphs — Slide 11",
    sourceType: "slides",
    topicId: "distance-time",
    heading: "The gradient gives the speed",
    text:
      "The slope, or gradient, of a distance-time graph gives the speed of the object. " +
      "A steeper line means a faster speed; a flatter (horizontal) line means the object is stationary.",
  },
  {
    id: "dt-gradient-example",
    source: "Distance-Time Graphs — Slides 13–14 (worked example)",
    sourceType: "slides",
    topicId: "distance-time",
    heading: "Worked example: calculating the gradient",
    text:
      "To calculate the gradient (speed) between two points A and B on a distance-time graph: gradient = (y2 − y1) / (x2 − x1). " +
      "For points where distance goes from 50 m to 150 m as time goes from 1 s to 3 s: gradient = (150 − 50) m / (3 − 1) s = 100 / 2 = 50 m/s. " +
      "The gradient of a distance-time graph gives the speed of the object in motion.",
  },
  {
    id: "dt-journey",
    source: "Distance-Time Graphs — Slide 10",
    sourceType: "slides",
    topicId: "distance-time",
    heading: "Sketching a journey with a rest",
    text:
      "Task: sketch a distance-time graph for this journey — I walked 5 m in 10 seconds, stopped for 10 seconds, then walked 5 m in 5 seconds. " +
      "The first and last parts are sloping lines (moving), and the middle part is a horizontal line (stationary, resting).",
  },
  {
    id: "dt-ws2-cyclist",
    source: "Worksheet 2, Q1 (answer key)",
    sourceType: "worksheet",
    topicId: "distance-time",
    heading: "Worksheet example: cyclist's speed",
    text:
      "A worker cycles 200 m from home to the factory, taking 1 minute 40 seconds (100 s). Speed = distance / time = 200 / 100 = 2 m/s.",
  },
];

// Key vocabulary for the ESL Reading Assistant (difficult-word highlighting).
export const GLOSSARY: Record<string, { en: string; zh: string }> = {
  moment: { en: "the turning effect of a force about a pivot", zh: "力矩（力的转动效果）" },
  pivot: { en: "the fixed point something turns around", zh: "支点（转动的固定点）" },
  perpendicular: { en: "at a right angle (90°) to something", zh: "垂直的（成 90 度角）" },
  clockwise: { en: "turning in the direction a clock's hands move", zh: "顺时针方向" },
  anticlockwise: { en: "turning opposite to a clock's hands", zh: "逆时针方向" },
  equilibrium: { en: "balanced; forces and moments cancel out", zh: "平衡状态" },
  newton: { en: "the unit of force (N)", zh: "牛顿（力的单位 N）" },
  lever: { en: "a rigid bar that turns about a pivot", zh: "杠杆" },
  "steady speed": { en: "equal distance covered in each equal time interval (also called uniform speed)", zh: "匀速（在相等的时间内移动相等的距离）" },
  gradient: { en: "the steepness of a line on a graph; on a distance-time graph it equals the speed", zh: "斜率（图线的坡度；在距离-时间图中代表速度）" },
  stationary: { en: "not moving; distance stays the same as time passes", zh: "静止的（不移动，距离不随时间改变）" },
  axis: { en: "one of the reference lines on a graph — horizontal (x) or vertical (y)", zh: "坐标轴（图表的参考线，水平为x轴，垂直为y轴）" },
  scale: { en: "how many real units each interval on a graph axis represents", zh: "比例尺（坐标轴上每一格代表的实际数值）" },
};
