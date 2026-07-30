import { supabaseServer } from "@/lib/supabase/server";
import { checkBudget, nearingLimit, type AiKind, type Verdict } from "@/lib/ai-budget";

// The database half of the spend cap. Kept apart from ai-budget.ts so the
// policy stays importable by tests without a Supabase client.

type Claim = { allowed: boolean; role?: string; userCalls?: number; schoolCalls?: number; reason?: string };

export type ClaimResult = {
  verdict: Verdict;
  /**
   * Calls left today, but only once it is few enough to be worth saying — null
   * otherwise. A running counter on every reply would turn a lesson into a
   * metered taxi ride.
   */
  callsLeft: number | null;
};

/**
 * Counts one AI call against the caller's day and says whether it may proceed.
 *
 * Call this immediately before the model call and only when a model call is
 * actually going to happen — not in demo mode, and not when a cached
 * translation is about to be served. A response that costs nothing must not
 * spend a student's allowance, or the cache stops being a kindness and starts
 * being a tax.
 *
 * Fails OPEN. If the counter is unreachable, the lesson continues: this
 * protects a bill, and a database blip is not a reason to stop teaching a
 * child. The per-IP burst limiter in proxy.ts is still in front, so failing
 * open is bounded rather than unlimited. Logged loudly, because a cap that has
 * silently stopped working looks exactly like a cap that is working.
 */
export async function claimAiCall(kind: AiKind): Promise<ClaimResult> {
  try {
    const supabase = await supabaseServer();
    const { data, error } = await supabase.rpc("claim_ai_call", { p_kind: kind });
    if (error) throw error;

    const claim = (data ?? {}) as Claim;
    if (!claim.allowed) {
      // The function found no account for this caller. The routes authenticate
      // first, so this means the session and the users table disagree.
      console.error(`[ai-usage] claim refused for ${kind}: ${claim.reason ?? "unknown"}`);
      return {
        verdict: {
          allowed: false,
          scope: "person",
          message: "We couldn't check your account just now. Please sign out and back in.",
        },
        callsLeft: null,
      };
    }

    const role = claim.role ?? null;
    const userCalls = claim.userCalls ?? 0;
    return {
      verdict: checkBudget(kind, role, userCalls, claim.schoolCalls ?? 0),
      callsLeft: nearingLimit(kind, role, userCalls),
    };
  } catch (err) {
    // Not swallowed. Four separate bugs in this codebase came from a discarded
    // error, and a usage counter that quietly stopped counting is the same
    // shape: everything looks fine right up to the invoice.
    console.error(`[ai-usage] could not count a ${kind} call — failing open:`, err);
    return { verdict: { allowed: true }, callsLeft: null };
  }
}
