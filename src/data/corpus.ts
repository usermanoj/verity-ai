// APPROVED TEACHER CORPUS — the ONLY knowledge source the AI Tutor may use.
// Faithfully transcribed from the school's own Grade 7 Physics materials:
//   - PPT: "Grade 7 physics Moments of force.pptx"
//   - Worksheet 7 (Moments) + answer key
// Each chunk carries a precise citation so the AI can show provenance.

export type CorpusChunk = {
  id: string;
  source: string;      // human-readable citation shown to students
  sourceType: "slides" | "worksheet" | "notes";
  topicId: string;
  heading: string;
  text: string;
};

export const TOPIC = {
  id: "moments",
  subject: "Physics",
  grade: "Grade 7",
  title: "Moments of a Force",
  objective:
    "To define the moment of a force and to use the principle of moments.",
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
};
