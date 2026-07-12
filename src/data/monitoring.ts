// Mock analytics for the Teacher AI-Monitoring view. Illustrative data only —
// in production this comes from Supabase (chat logs, events, submissions).

export type ChatTurn = {
  from: "student" | "ai";
  text: string;
  intent?: "explain" | "example" | "askme" | "check" | "translate";
  flag?: "answer-seeking" | "copy-paste";
};

export type StudentRow = {
  id: string;
  name: string;
  eslLevel: "Advanced" | "Intermediate" | "Beginner";
  minutes: number;          // time on task this week
  aiQuestions: number;
  quizScore: number;        // %
  reliance: "healthy" | "watch" | "high"; // how much they lean on the AI for answers
  struggling: string;       // topic/skill
  status: "on-track" | "needs-help" | "inactive";
  chat: ChatTurn[];
};

export const CLASS = {
  name: "Grade 7 Physics · Section B",
  topic: "Moments of a Force",
  students: 24,
  active: 21,
};

export const STUDENTS: StudentRow[] = [
  {
    id: "s1", name: "Li Wei", eslLevel: "Beginner", minutes: 52, aiQuestions: 9, quizScore: 78,
    reliance: "healthy", struggling: "Scientific vocabulary", status: "on-track",
    chat: [
      { from: "student", text: "What does 'perpendicular distance' mean?", intent: "explain" },
      { from: "ai", text: "It means the distance measured at a right angle (90°) from the pivot to the line of the force. 📖 Based on: Slide 2" },
      { from: "student", text: "Translate the principle of moments", intent: "translate" },
      { from: "ai", text: "力矩原理：当物体平衡时，顺时针力矩之和 = 逆时针力矩之和。📖 Based on: Slide 3" },
    ],
  },
  {
    id: "s2", name: "Chen Yu", eslLevel: "Intermediate", minutes: 38, aiQuestions: 14, quizScore: 61,
    reliance: "high", struggling: "Rearranging M = F × d", status: "needs-help",
    chat: [
      { from: "student", text: "just tell me the answer to question 4", intent: "check", flag: "answer-seeking" },
      { from: "ai", text: "I won't give the final answer — but check: did you use M = F × d and convert cm to m? 📖 Based on: Worksheet 7" },
      { from: "student", text: "give me the answer please", intent: "check", flag: "answer-seeking" },
      { from: "ai", text: "Let's do it together. What is the force, and what is the distance in metres? 📖 Based on: Slide 15" },
    ],
  },
  {
    id: "s3", name: "Zhang Min", eslLevel: "Advanced", minutes: 64, aiQuestions: 6, quizScore: 94,
    reliance: "healthy", struggling: "—", status: "on-track",
    chat: [
      { from: "student", text: "Give me a challenge question on net moments", intent: "askme" },
      { from: "ai", text: "A beam has 6 N at 1 m clockwise and 3 N at 2 m anticlockwise. Is it balanced? 📖 Based on: Slide 10" },
    ],
  },
  {
    id: "s4", name: "Wang Fang", eslLevel: "Beginner", minutes: 12, aiQuestions: 2, quizScore: 40,
    reliance: "watch", struggling: "Units (Nm vs N)", status: "needs-help",
    chat: [
      { from: "student", text: "why is it Nm not N", intent: "explain" },
      { from: "ai", text: "Because a moment multiplies force (N) by distance (m): N × m = Nm. 📖 Based on: Slide 2" },
    ],
  },
  {
    id: "s5", name: "Liu Yang", eslLevel: "Intermediate", minutes: 0, aiQuestions: 0, quizScore: 0,
    reliance: "healthy", struggling: "Not started", status: "inactive", chat: [],
  },
  {
    id: "s6", name: "Zhao Lei", eslLevel: "Advanced", minutes: 47, aiQuestions: 7, quizScore: 88,
    reliance: "healthy", struggling: "Direction (cw/acw)", status: "on-track",
    chat: [
      { from: "student", text: "how do I know if it's clockwise?", intent: "explain" },
      { from: "ai", text: "Imagine the force pushing the beam — which way does it turn around the pivot? 📖 Based on: Slide 7" },
    ],
  },
];

// Aggregated signals for charts
export const DIFFICULT_TOPICS = [
  { label: "Rearranging M = F × d", pct: 46 },
  { label: "Units (Nm vs N)", pct: 38 },
  { label: "Perpendicular distance", pct: 33 },
  { label: "Direction (cw / acw)", pct: 25 },
  { label: "Net moment", pct: 19 },
];

export const HARD_VOCAB = ["perpendicular", "equilibrium", "anticlockwise", "pivot", "resultant"];
