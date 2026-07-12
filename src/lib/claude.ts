import Anthropic from "@anthropic-ai/sdk";

// Model routing: Opus for tutoring quality; override via env for cheaper ops.
export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

export const hasApiKey = () => !!process.env.ANTHROPIC_API_KEY;

let client: Anthropic | null = null;
export function claude(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}
