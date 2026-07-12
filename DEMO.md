# 2-minute demo script — Verity AI (Curriculum AI for ESL Classrooms)

**One-liner:** *"An AI tutor for ESL students that can only answer from the teacher's own approved materials — cited every time — and is built to guide, not to hand over answers."*

## The problem (10s)
ESL students at international schools face a double barrier: hard science **and** a second language. Generic AI (ChatGPT) will happily do their homework, in unpredictable English, from the whole internet — teachers can't trust it.

## The walkthrough (90s)

1. **Landing → "Enter as a Student".** Premium, iPad-first. Point out the language roadmap strip (Chinese/Mandarin live, Korean/Malay/Tamil next) and the four roles (Student / Teacher / HOD / Principal).

2. **Subjects → Physics → Moments of a Force.** The topic screen.
   - **Learn card:** difficult words are dotted — hover *"perpendicular"* → English meaning **+ 中文**. Click **🔊 Read aloud**. *(ESL support built in.)*

3. **AI Tutor (right panel) — the core.** Switch level to **"English + 中文"**.
   - Tap **Explain** → answer comes back **with a citation**: `📖 Based on: Chapter/Slide…`. *"It only uses the teacher's uploaded material."*
   - Tap **Ask Me Questions** → it turns Socratic — asks the student, doesn't tell.
   - Type *"just give me the answer to Q4"* → **Check My Answer** → it **refuses to hand over the answer** and gives a hint. *(Academic integrity.)*

4. **Interactive seesaw.** Drag Ram/Shyam — clockwise vs anticlockwise moments update live; hits **⚖️ Balanced** at 300 N. Abstract physics you can *feel*.

5. **Practice Zone — the accuracy story.** Answer *"70 N × 0.4 m"* as `28 Nm clockwise`.
   - Graded **instantly and deterministically** — value ✓, unit ✓, direction ✓ — *"numbers are graded by rules, never by a guessing AI."* Get it right → it offers a **Challenge** (adaptive).

6. **Back → Home → Teacher.** The **AI-Monitoring** dashboard.
   - KPIs, then the student table. **Chen Yu** is flagged *AI reliance: High*. Click the row → **full AI chat transparency** with an *"asked for the answer"* flag. *"Every AI conversation is visible to the teacher."*
   - Difficult-topics chart + auto-detected hard vocabulary → tells the teacher what to re-teach.

## The close (20s)
*"Closed-corpus + cited + guides-not-cheats is the trust story generic AI can't tell. It's built on the real production stack — Next.js, Claude, Supabase — and the accuracy-critical grader is unit-tested. This is Grade 7 Physics today; the same engine drops onto any subject a teacher uploads."*

## Talking points if asked
- **Retrieval:** vectorless/long-context for small per-class corpora (most accurate, no embedding drift) → pgvector at whole-school scale → curriculum knowledge graph for adaptivity. Hybrid by design.
- **Accuracy:** deterministic grading for numbers/MCQ; LLM only for explanation, hints, translation, rubric short-answer.
- **Revenue:** B2B annual per-student site license ($15–40/student/yr), tiered Student/Teacher/School.
- **Cost:** pilot ~$300–900/mo; cut with Haiku routing + prompt caching + deterministic grading.
- **Languages:** Chinese (Mandarin, Simplified) live and glossary-tuned; Korean, Malay, and Tamil are next on the roadmap — architecture is topic- and language-agnostic.
