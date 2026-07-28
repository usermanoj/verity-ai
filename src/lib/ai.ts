import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

// Model-agnostic AI layer. Every call site asks for a ROLE — "primary",
// "chunk", "translate", "question" — and this module decides which provider
// and which model serves it, so switching either is an env var change rather
// than a call-site rewrite.
//
// Four providers, because relying on one turned out to be a single point of
// failure in practice rather than in theory. The Vercel AI Gateway began
// requiring a positive credit balance for every request — including
// bring-your-own-key — and ingestion stopped dead: no chunking, no questions,
// no way to test, and nothing wrong with the code. A provider you cannot
// swap is a provider that can halt the project.
//
//   gateway    Vercel AI Gateway (default). One key, many models, failover.
//   anthropic  Direct to Anthropic with ANTHROPIC_API_KEY.
//   openai     Direct to OpenAI with OPENAI_API_KEY.
//   local      Any OpenAI-compatible endpoint — Ollama, LM Studio, vLLM.
//              Free and offline, at a real cost in output quality.
export type AiProvider = "gateway" | "anthropic" | "openai" | "local";
export type AiRole = "primary" | "chunk" | "translate" | "question";

export const AI_PROVIDER = (process.env.AI_PROVIDER || "gateway") as AiProvider;

// Model names are provider-specific, so each provider carries its own
// defaults. Every one is overridable per role, which is what makes a wrong
// default here a one-line env change rather than a code change.
//
// The two tiers are deliberate. Chunking is mechanical ("split faithfully,
// never invent") where top-tier reasoning adds latency rather than quality,
// and a teacher reviews every chunk before approval — which is exactly what
// makes the cheaper tier safe there. Tutoring answers students directly, so
// it gets the better model.
const DEFAULTS: Record<AiProvider, Record<AiRole, string>> = {
  gateway: {
    primary: "anthropic/claude-sonnet-5",
    chunk: "anthropic/claude-haiku-4.5",
    translate: "anthropic/claude-sonnet-5",
    question: "anthropic/claude-sonnet-5",
  },
  anthropic: {
    primary: "claude-sonnet-5",
    chunk: "claude-haiku-4.5",
    translate: "claude-sonnet-5",
    question: "claude-sonnet-5",
  },
  openai: {
    primary: "gpt-5.4",
    chunk: "gpt-5.4-mini",
    translate: "gpt-5.4-mini",
    question: "gpt-5.4-mini",
  },
  local: {
    primary: "llama3.1",
    chunk: "llama3.1",
    translate: "llama3.1",
    question: "llama3.1",
  },
};

const ROLE_ENV: Record<AiRole, string | undefined> = {
  primary: process.env.AI_MODEL,
  chunk: process.env.AI_CHUNK_MODEL,
  translate: process.env.AI_TRANSLATE_MODEL,
  question: process.env.AI_QUESTION_MODEL,
};

function modelId(role: AiRole): string {
  return ROLE_ENV[role] || DEFAULTS[AI_PROVIDER][role] || DEFAULTS.gateway[role];
}

// Created lazily and once. Constructing a provider reads env vars, which are
// not present at module load in every environment.
let anthropicProvider: ReturnType<typeof createAnthropic> | undefined;
let openaiProvider: ReturnType<typeof createOpenAI> | undefined;
let localProvider: ReturnType<typeof createOpenAICompatible> | undefined;

// The model to hand to generateText/streamText for a role.
//
// The Gateway path returns a plain "provider/model" string, which the AI SDK
// resolves through the Gateway itself; the direct paths return a provider
// instance that talks to the vendor with no Vercel involvement at all.
export function aiModel(role: AiRole): LanguageModel {
  const id = modelId(role);

  switch (AI_PROVIDER) {
    case "anthropic":
      anthropicProvider ??= createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      return anthropicProvider(id);
    case "openai":
      openaiProvider ??= createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      return openaiProvider(id);
    case "local":
      localProvider ??= createOpenAICompatible({
        name: "local",
        // Ollama's OpenAI-compatible endpoint by default; LM Studio and vLLM
        // expose the same shape on their own ports.
        baseURL: process.env.AI_LOCAL_BASE_URL || "http://localhost:11434/v1",
        // Most local servers ignore the key but the SDK wants one present.
        apiKey: process.env.AI_LOCAL_API_KEY || "local",
      });
      return localProvider(id);
    default:
      return id;
  }
}

// Gateway failover only means anything on the Gateway. Sending it to a direct
// provider would be a silently ignored option that reads as protection the
// call does not actually have.
export function gatewayFailover(models: string[]) {
  return AI_PROVIDER === "gateway" ? { gateway: { models } } : undefined;
}

// Whether the configured provider has what it needs to make a call. Without
// this the app answers with real-looking output from a demo path, or throws
// deep inside a request.
export const hasApiKey = () => {
  switch (AI_PROVIDER) {
    case "anthropic":
      return Boolean(process.env.ANTHROPIC_API_KEY);
    case "openai":
      return Boolean(process.env.OPENAI_API_KEY);
    // A local endpoint needs no credential; if it isn't running, the call
    // fails loudly, which is the honest outcome.
    case "local":
      return true;
    default:
      return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
  }
};

// Kept for the call sites that still name models directly.
export const MODEL = modelId("primary");
export const TRANSLATE_MODEL = modelId("translate");
export const CHUNK_MODEL = modelId("chunk");

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

// Failover for calls that ask for a typed object (Output.object / json_schema)
// rather than prose.
//
// The list above cannot be reused for those. Its last resort, llama-3.3-70b,
// is served through Groq, which rejects `json_schema` outright — so the
// moment the primary model was rate-limited, ingestion failed with "This
// model does not support response format `json_schema`" instead of degrading.
// A fallback that cannot satisfy the request is not a fallback.
//
// Every model here has been chosen because it supports structured output;
// adding one that doesn't turns a rate limit into a hard failure.
export const STRUCTURED_FALLBACK_MODELS = [
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-sonnet-5",
  "openai/gpt-5.4-mini",
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
