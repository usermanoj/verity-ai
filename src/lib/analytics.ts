import { supabaseServer } from "@/lib/supabase/server";
import type { StudentProgress } from "@/lib/student-progress";
import type { AskedAbout, QuestionOutcome } from "@/lib/concept-failure";
import { hasSupabase } from "@/lib/supabase/config";
import { reportError } from "@/lib/errors/report";

// Reads the analytics RPCs. One call per dashboard, because a dashboard that
// issues eight queries pays eight round trips to a database in another
// region — the same reasoning that took the ingest screen from 1462ms to
// 178ms.
//
// Every figure here describes CURRICULUM READINESS, not student learning.
// See supabase/migrations/0015_analytics.sql for why: the tables that would
// carry engagement are empty until students sign in, so anything of that kind
// on these pages would be invented.

export type TeacherAnalytics = {
  documents: { total: number; approved: number; pending: number; rejected: number };
  sectionsLive: number;
  questions: { approved: number; pending: number; rejected: number };
  byLevel: { level: string; count: number }[];
  byFormat: { format: string; count: number }[];
  sections: { section: string; subject: string; grade: string; hasMaterial: boolean }[];
  topicsWithoutQuestions: { id: string; name: string }[];
  weekly: { week: string; count: number }[];
};

export type SchoolAnalytics = {
  teachers: { total: number; contributing: number };
  documents: { approved: number; pending: number };
  questionsPending: number;
  coverage: { subject: string; grade: string; sections: number; covered: number }[];
  byTeacher: { name: string; approved: number; pending: number }[];
  weekly: { week: string; count: number }[];
};

// Learning analytics — what students actually did. Empty until students sign
// in, join a class and answer something; see migration 0018.
export type Attainment = { attempts: number; correct: number; studentsEnrolled: number; studentsActive: number };
export type HardTopic = { topic: string; attempts: number; correct: number };
export type AssistantUse = {
  studentsUsing: number;
  intents: { intent: string; count: number }[];
  shortcutting: number;
};

export type TeacherLearning = {
  overall: Attainment;
  bySection: {
    section: string;
    subject: string;
    grade: string;
    attempts: number;
    correct: number;
    enrolled: number;
    active: number;
  }[];
  hardestTopics: HardTopic[];
  students: { name: string; attempts: number; correct: number }[];
  assistant: AssistantUse;
};

export type SchoolLearning = {
  overall: Attainment;
  bySubject: { subject: string; grade: string; attempts: number; correct: number }[];
  hardestTopics: HardTopic[];
  assistant: AssistantUse;
};

export async function getTeacherAnalytics(): Promise<TeacherAnalytics | null> {
  return callAnalytics<TeacherAnalytics>("teacher_analytics");
}

export async function getTeacherLearning(): Promise<TeacherLearning | null> {
  return callAnalytics<TeacherLearning>("teacher_learning_analytics");
}

export async function getSchoolLearning(): Promise<SchoolLearning | null> {
  return callAnalytics<SchoolLearning>("school_learning_analytics");
}

export async function getSchoolAnalytics(): Promise<SchoolAnalytics | null> {
  return callAnalytics<SchoolAnalytics>("school_analytics");
}

// Language support across the school. Everything here exists per student for
// a teacher; none of it rolled up to the people who decide where help goes.
export type SchoolLanguage = {
  students: number;
  levels: { advanced: number; intermediate: number; beginner: number };
  chinese: number;
  unassessed: number;
  sections: {
    grade: string;
    section: string;
    subject: string;
    students: number;
    beginner: number;
    chinese: number;
    unassessed: number;
  }[];
  glossary: { edited: number; total: number };
  translations: { corrected: number; total: number };
};

export async function getSchoolLanguage(): Promise<SchoolLanguage | null> {
  return callAnalytics<SchoolLanguage>("school_language_analytics");
}

// Per-student progress, plus the instant everything is measured against.
//
// `now` is stamped here rather than in the component: every row then compares
// against the same moment, and the render stays pure — calling Date.now()
// during render is what the compiler forbids.
// What the class is getting wrong, and what they keep asking about.
//
// Both return [] rather than null on failure: an empty panel says "nothing
// yet", which is the truthful reading when a class has not started, and a
// dashboard that shows an error where a teacher expects a list is worse than
// one that shows the list is empty. The reason is logged either way.
export async function getQuestionOutcomes(): Promise<QuestionOutcome[]> {
  return rpcList<QuestionOutcome>("teacher_question_outcomes");
}

export async function getAskedAbout(): Promise<AskedAbout[]> {
  return rpcList<AskedAbout>("teacher_asked_about");
}

async function rpcList<T>(fn: "teacher_question_outcomes" | "teacher_asked_about"): Promise<T[]> {
  if (!hasSupabase()) return [];
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc(fn);
    if (error) {
      console.error(`[analytics] ${fn} failed:`, error);
      return [];
    }
    return (data as unknown as T[] | null) ?? [];
  } catch (err) {
    console.error(`[analytics] ${fn} threw:`, err);
    return [];
  }
}

export async function getStudentProgress(): Promise<{ students: StudentProgress[]; now: number }> {
  const now = Date.now();
  if (!hasSupabase()) return { students: [], now };
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc("teacher_student_progress");
    if (error) {
      console.error("[analytics] student progress failed:", error);
      return { students: [], now };
    }
    return { students: (data as unknown as StudentProgress[] | null) ?? [], now };
  } catch (err) {
    console.error("[analytics] student progress threw:", err);
    return { students: [], now };
  }
}

// null means "couldn't read", which the dashboards render as an honest
// message. The RPCs are role-gated and return nothing at all to a caller
// without the right role, so null is also what a wrong-role request produces
// — the page never has to decide whether it is allowed to see this.
type AnalyticsFn =
  | "teacher_analytics"
  | "school_analytics"
  | "teacher_learning_analytics"
  | "school_learning_analytics"
  | "school_language_analytics";

async function callAnalytics<T>(fn: AnalyticsFn): Promise<T | null> {
  if (!hasSupabase()) return null;
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc(fn);
    if (error || !data) return null;
    return data as T;
  } catch (err) {
    // Still returns null — a dashboard panel showing nothing beats a page
    // that will not render. But the failure is now recorded, because "the
    // analytics look empty" was previously indistinguishable from "there is no
    // data yet", and those need opposite responses.
    await reportError("analytics", err, "rpc failed");
    return null;
  }
}
