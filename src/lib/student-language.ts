import { supabaseServer } from "@/lib/supabase/server";
import { hasSupabase } from "@/lib/supabase/config";

// A student's reading level, as a property of the student.
//
// It lived in localStorage, which meant: lost on a shared classroom tablet,
// lost on the library computer, and invisible to the teacher. A child who
// needs the easiest English had to know to find a dropdown and re-find it on
// every device — and the one adult who actually knows they need it could not
// set it for them.

export type EslLevel = "advanced" | "intermediate" | "beginner";
export type LanguagePref = { level: EslLevel; chinese: boolean };

export const DEFAULT_PREF: LanguagePref = { level: "intermediate", chinese: false };

function isLevel(value: unknown): value is EslLevel {
  return value === "advanced" || value === "intermediate" || value === "beginner";
}

/**
 * The signed-in user's saved preference, or the default.
 *
 * Read on its own rather than folded into getCurrentAppUser(), and swallowing
 * its own errors, on purpose: these columns arrive with migration 0024, and
 * adding them to the query every page uses to identify the caller would mean
 * a deployment landing before the migration takes down sign-in for everyone.
 * A reading level is worth a lot; it is not worth that.
 */
export async function getLanguagePref(userId: string | undefined): Promise<LanguagePref> {
  if (!userId || !hasSupabase()) return DEFAULT_PREF;
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase
      .from("users")
      .select("esl_level, esl_chinese")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return DEFAULT_PREF;
    return {
      level: isLevel(data.esl_level) ? data.esl_level : DEFAULT_PREF.level,
      chinese: data.esl_chinese === true,
    };
  } catch {
    return DEFAULT_PREF;
  }
}
