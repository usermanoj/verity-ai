# ESL Learning Hub — Curriculum AI

A premium, AI-native **ESL Learning Hub** for a top-rated international school (IG & IB curriculum). Its defining feature is a **closed-corpus AI tutor**: the AI answers **only from teacher-approved materials, with a citation every time**, and is designed to *guide* — explain, translate, hint, and ask questions — rather than hand over answers.

> Built for the Claude Code Hackathon. Demo topic: **Grade 7 Physics — Moments of a Force**, seeded from the school's own slides + worksheets.

## What's in the demo (Student flow)
- **5-button AI Tutor** — Explain · Give Example · Ask Me Questions · Check My Answer · Translate. Students choose intent; no prompt-writing required.
- **Closed-corpus RAG (vectorless / long-context)** — Claude answers only from the approved corpus and shows `📖 Based on: <source>`. Out-of-corpus questions are refused.
- **Interactive Moments seesaw** — drag weights, watch clockwise/anticlockwise moments and balance update live.
- **ESL Reading Assistant** — difficult words are highlighted with an English + 中文 gloss; read-aloud via the browser.
- **Deterministic grader** — numeric/MCQ answers are graded by rules (value + unit + direction + tolerance), never by an LLM. Fully unit-tested.
- **ESL levels** — the same content re-leveled: advanced → simplified English → beginner → English + Chinese.

## Stack
Next.js 16 (App Router) · TypeScript · Tailwind v4 · Framer Motion · Anthropic SDK (Claude) · Supabase (auth/roles/storage/pgvector, Phase 3). Deploy: Vercel.

## Run locally
```bash
npm install
cp .env.local.example .env.local   # add ANTHROPIC_API_KEY for the live tutor
npm run dev                        # http://localhost:3000
```
Without an API key the app runs in **demo mode** with curated fallback responses, so the whole flow is still clickable.

## Test the accuracy-critical grader
```bash
npx vitest run
```

## Architecture notes
- **Retrieval is hybrid by design.** Small per-topic corpora use vectorless long-context (most accurate, no embedding drift); pgvector scales to the whole-school library; a curriculum knowledge graph (later) powers AI memory + adaptive difficulty.
- **Accuracy = deterministic where it can be.** Numbers and MCQs are graded by `src/lib/grade.ts`; the LLM is reserved for explanation, hints, translation, and rubric short-answer.
- **Academic integrity is enforced in the system prompt** (`src/lib/tutor.ts`): the tutor never completes the task and always cites.

## Roadmap (post-hackathon)
Teacher upload → auto-quiz pipeline · HOD/Principal analytics · whole-school vector + graph RAG · more languages · native iPad app · per-student licensing.
