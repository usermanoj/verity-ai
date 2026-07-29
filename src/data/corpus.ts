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
  /** When the teacher added it. Absent for the two hand-built demo topics. */
  addedAt?: string;
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
//
// Every term below was written for the two hand-built demo topics, Moments
// and Distance–Time. That is why the hover glossary looked like it had been
// removed from uploaded material: it hadn't — ReadingText still runs on every
// lesson section — but a Magnets deck contains none of the words "moment",
// "pivot" or "gradient", so nothing was ever underlined. The feature was
// present and silent.
//
// The magnetism block below covers the Grade 7 corpus actually being
// uploaded, which makes the assistant work on today's material. It is still a
// CURATED list, and that does not scale: the honest fix is to generate a
// glossary per document at ingestion (alongside the practice questions, with
// the same teacher approval step) so any upload — chemistry, biology,
// geography — arrives with its own vocabulary. Until that exists, an upload
// outside these two subjects will underline nothing.
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

  // Magnets and Electromagnets (Grade 7).
  magnet: { en: "an object that attracts magnetic materials like iron", zh: "磁铁（能吸引铁等磁性材料的物体）" },
  magnetic: { en: "able to be attracted by a magnet", zh: "有磁性的（能被磁铁吸引）" },
  "non-magnetic": { en: "not attracted by a magnet", zh: "无磁性的（不被磁铁吸引）" },
  "magnetic field": { en: "the space around a magnet where it can push or pull", zh: "磁场（磁铁周围能产生作用力的空间）" },
  "magnetic force": { en: "the push or pull of a magnet, felt without touching", zh: "磁力（无需接触即可作用的推力或拉力）" },
  "non-contact force": { en: "a force that acts without the objects touching", zh: "非接触力（物体不接触也能作用的力）" },
  pole: { en: "an end of a magnet, where the force is strongest", zh: "磁极（磁铁两端，磁力最强处）" },
  "north pole": { en: "the end of a magnet that points north", zh: "北极（指向北方的磁极）" },
  "south pole": { en: "the end of a magnet that points south", zh: "南极（指向南方的磁极）" },
  attract: { en: "to pull towards", zh: "吸引（拉向自己）" },
  repel: { en: "to push away", zh: "排斥（推开）" },
  electromagnet: { en: "a magnet made by passing current through a coil; it can be switched off", zh: "电磁铁（电流通过线圈产生，可以开关）" },
  solenoid: { en: "a long coil of wire that acts as a magnet when current flows", zh: "螺线管（通电后像磁铁的长线圈）" },
  coil: { en: "wire wound round and round in a spiral", zh: "线圈（缠绕成螺旋的导线）" },
  current: { en: "the flow of electric charge through a wire", zh: "电流（电荷在导线中的流动）" },
  "direct current": { en: "electric current that flows one way only", zh: "直流电（只朝一个方向流动的电流）" },
  core: { en: "the material placed inside a coil to make the field stronger", zh: "铁芯（放在线圈内以增强磁场的材料）" },
  magnetise: { en: "to make a material become a magnet", zh: "磁化（使材料带上磁性）" },
  demagnetise: { en: "to make a material lose its magnetism", zh: "退磁（使材料失去磁性）" },
  permanent: { en: "keeps its magnetism for a long time", zh: "永久的（长期保持磁性）" },
  temporary: { en: "keeps its magnetism only while the current is on", zh: "暂时的（仅在通电时保持磁性）" },
  lodestone: { en: "a natural magnet made of the iron mineral magnetite", zh: "天然磁石（含磁铁矿的天然磁体）" },
  "iron filings": { en: "tiny pieces of iron used to show the shape of a magnetic field", zh: "铁屑（用来显示磁场形状的细小铁粒）" },
  compass: { en: "an instrument with a small magnet that points north", zh: "指南针（内有小磁针，指向北方）" },
};
