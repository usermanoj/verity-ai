import { supabaseServer } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/supabase/config";

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

export async function getTeacherAnalytics(): Promise<TeacherAnalytics | null> {
  return callAnalytics<TeacherAnalytics>("teacher_analytics");
}

export async function getSchoolAnalytics(): Promise<SchoolAnalytics | null> {
  return callAnalytics<SchoolAnalytics>("school_analytics");
}

// null means "couldn't read", which the dashboards render as an honest
// message. The RPCs are role-gated and return nothing at all to a caller
// without the right role, so null is also what a wrong-role request produces
// — the page never has to decide whether it is allowed to see this.
async function callAnalytics<T>(fn: "teacher_analytics" | "school_analytics"): Promise<T | null> {
  if (!hasSupabase()) return null;
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc(fn);
    if (error || !data) return null;
    return data as T;
  } catch {
    return null;
  }
}
