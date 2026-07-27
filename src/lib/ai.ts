// Model-agnostic AI layer: every call site below routes through the Vercel
// AI Gateway using a plain "provider/model" string, so switching providers
// (Claude, GPT, Gemini, DeepSeek, Qwen, Kimi, ...) is an env var change, not
// a call-site rewrite.
//
// Default was originally claude-opus-4.8 (the strongest Claude tier) but
// that's restricted on Vercel's free Hobby-tier AI Gateway — every real
// call failed with "Free tier users do not have access to this model"
// until diagnosed during first live deployment. claude-sonnet-5 is the
// strongest tier reasonably likely to be free-tier accessible, so it's the
// best quality-vs-availability tradeoff for the primary model.
export const MODEL = process.env.AI_MODEL || "anthropic/claude-sonnet-5";
export const TRANSLATE_MODEL = process.env.AI_TRANSLATE_MODEL || MODEL;

// Ingestion chunking runs on the fast/cheap tier by default, not the primary
// model. Chunking is a mechanical extraction task ("split faithfully, never
// invent") where top-tier reasoning adds latency, not quality — and it was
// the dominant share of the 30-60s+ a teacher watched "Processing…" after
// every upload. Any chunking slip is also caught by design: a teacher
// reviews every chunk before approval, which is exactly what makes the
// faster tier safe here. Tutoring/question-generation stay on MODEL.
export const CHUNK_MODEL = process.env.AI_CHUNK_MODEL || "anthropic/claude-haiku-4.5";

// AI_GATEWAY_API_KEY is scoped per Vercel environment (Production, and
// Preview restricted to the staging branch) — other branches' PR previews
// have no value here and correctly stay in demo mode.
export const hasApiKey = () =>
  Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);

// Gateway-level failover — tried automatically if the primary model is
// unavailable (plan-tier restricted, rate-limited, or deprecated), so a
// future case like the claude-opus-4.8 incident above degrades gracefully
// instead of silently failing every request. Ordered capable-to-cheap, with
// a widely-available open-weight model as the last resort. Spread this into
// providerOptions.gateway at every generateText/streamText call site.
export const GATEWAY_FALLBACK_MODELS = [
  "anthropic/claude-haiku-4.5",
  "openai/gpt-5.4-mini",
  "meta/llama-3.3-70b",
];

// How many model calls this app will have in flight at once.
//
// Ingestion fans out per batch, and question generation fanned out per chunk
// — up to forty concurrent calls the moment a teacher approved a deck. On the
// Gateway's free tier that is not "fast", it is an instant rate limit: the
// upload failed after three attempts with "Free tier requests on this model
// are rate-limited", having done all the work and thrown it away.
//
// Two is deliberately conservative. The bottleneck for a teacher is the slow
// first call, not throughput, and a run that finishes is worth far more than
// one that races and fails.
const MAX_CONCURRENT_AI_CALLS = Number(process.env.AI_MAX_CONCURRENCY || 2);

// Rate limits are a queue signal, not a failure. Retrying immediately (which
// is what a bare retry does) simply spends the remaining attempts inside the
// same limited window and reports defeat a second later.
const RETRY_DELAYS_MS = [1_000, 4_000, 12_000];

function isRateLimit(error: unknown): boolean {
  const status = (error as { statusCode?: number; status?: number })?.statusCode ?? (error as { status?: number })?.status;
  if (status === 429) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /rate[- ]?limit|too many requests|quota/i.test(message);
}

export async function withRateLimitRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= RETRY_DELAYS_MS.length || !isRateLimit(error)) throw error;
      // Jittered, so parallel calls that were limited together don't all come
      // back at the same instant and limit each other again.
      const wait = RETRY_DELAYS_MS[attempt] * (0.75 + Math.random() * 0.5);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

// Promise.all with a ceiling. Results keep input order, so callers that rely
// on position (chunk batches, question sets) are unaffected.
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await run(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

// The two together: bounded concurrency, and each call patient with a rate
// limit rather than burning its retries inside one.
export function mapAiCalls<T, R>(items: T[], run: (item: T, index: number) => Promise<R>): Promise<R[]> {
  return mapWithConcurrency(items, MAX_CONCURRENT_AI_CALLS, (item, i) => withRateLimitRetry(() => run(item, i)));
}

// Wraps a system prompt with an Anthropic prompt-cache breakpoint (the
// approved corpus is large and reused across many requests per topic). The
// Gateway forwards providerOptions to whichever provider is active and
// non-Anthropic providers simply ignore an option they don't recognize.
export function cachedSystem(text: string) {
  return {
    role: "system" as const,
    content: text,
    providerOptions: {
      anthropic: { cacheControl: { type: "ephemeral" as const } },
    },
  };
}
