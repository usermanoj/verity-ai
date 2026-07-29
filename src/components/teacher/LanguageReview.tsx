"use client";

import { useState } from "react";
import { PRESSABLE } from "@/lib/ui";

// Where a teacher corrects the Chinese this product generates.
//
// Two things are written by a model and shown to children — glossary entries
// and translations — and until now neither could be fixed. A wrong gloss
// stayed wrong for every student who hovered it. A school cannot be asked to
// trust output that no teacher can edit, and the fix compounds: a correction
// saved here is what every future student sees, because the translation memory
// prefers a teacher's version over the model's from then on.

export type GlossaryRow = {
  id: string;
  term: string;
  en: string;
  zh: string;
  hidden: boolean;
  edited: boolean;
};

export type TranslationRow = {
  id: string;
  source: string;
  translation: string;
  origin: "model" | "teacher";
};

type Saving = { id: string; state: "saving" | "saved" | "failed" };

export default function LanguageReview({
  documentId,
  glossary,
  translations,
}: {
  documentId: string;
  glossary: GlossaryRow[];
  translations: TranslationRow[];
}) {
  const [terms, setTerms] = useState(glossary);
  const [texts, setTexts] = useState(translations);
  const [status, setStatus] = useState<Saving | null>(null);

  async function post(payload: Record<string, unknown>, id: string): Promise<boolean> {
    setStatus({ id, state: "saving" });
    try {
      const res = await fetch("/api/language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const ok = res.ok;
      setStatus({ id, state: ok ? "saved" : "failed" });
      // The confirmation clears itself; a permanent tick on every row it has
      // ever touched stops meaning anything.
      if (ok) setTimeout(() => setStatus((s) => (s?.id === id ? null : s)), 2000);
      return ok;
    } catch {
      setStatus({ id, state: "failed" });
      return false;
    }
  }

  const badge = (id: string) => {
    if (status?.id !== id) return null;
    if (status.state === "saving") return <span className="text-[11px] text-[var(--muted)]">saving…</span>;
    if (status.state === "saved") return <span className="text-[11px] text-[#6ee7b7]">saved</span>;
    return <span className="text-[11px] text-[var(--warn)]">couldn&apos;t save — try again</span>;
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-1 text-sm font-medium uppercase tracking-widest text-[var(--muted)]">
          Vocabulary · {terms.filter((t) => !t.hidden).length} shown to students
        </h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          Generated from this document. Students see the English and 中文 when they hover a highlighted word.
          Correct anything that is wrong, or hide a word that doesn&apos;t belong.
        </p>

        {terms.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            No vocabulary was extracted from this document.
          </p>
        ) : (
          <div className="space-y-2">
            {terms.map((t) => (
              <div
                key={t.id}
                className={`rounded-2xl border border-[var(--border)] p-3 ${t.hidden ? "opacity-50" : ""}`}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t.term}</span>
                  {t.edited && (
                    <span className="rounded-full bg-[rgba(99,102,241,0.18)] px-2 py-0.5 text-[10px] text-[var(--brand2)]">
                      edited
                    </span>
                  )}
                  {t.hidden && <span className="text-[11px] text-[var(--muted)]">hidden from students</span>}
                  <span className="ml-auto flex items-center gap-2">
                    {badge(t.id)}
                    <button
                      onClick={async () => {
                        const next = !t.hidden;
                        if (await post({ kind: "glossary", id: t.id, hidden: next }, t.id)) {
                          setTerms((rows) => rows.map((r) => (r.id === t.id ? { ...r, hidden: next } : r)));
                        }
                      }}
                      className={`rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)] hover:text-[var(--text)] ${PRESSABLE}`}
                    >
                      {t.hidden ? "Show" : "Hide"}
                    </button>
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-[var(--muted)]">Plain English</span>
                    <input
                      defaultValue={t.en}
                      onBlur={async (e) => {
                        const en = e.target.value.trim();
                        if (!en || en === t.en) return;
                        if (await post({ kind: "glossary", id: t.id, en, hidden: t.hidden }, t.id)) {
                          setTerms((rows) => rows.map((r) => (r.id === t.id ? { ...r, en, edited: true } : r)));
                        }
                      }}
                      className="w-full rounded-xl bg-black/20 px-3 py-2 text-sm outline-none ring-1 ring-[var(--border)] focus:ring-[var(--brand)]"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-[var(--muted)]">中文</span>
                    <input
                      defaultValue={t.zh}
                      onBlur={async (e) => {
                        const zh = e.target.value.trim();
                        if (!zh || zh === t.zh) return;
                        if (await post({ kind: "glossary", id: t.id, zh, hidden: t.hidden }, t.id)) {
                          setTerms((rows) => rows.map((r) => (r.id === t.id ? { ...r, zh, edited: true } : r)));
                        }
                      }}
                      className="w-full rounded-xl bg-black/20 px-3 py-2 text-sm outline-none ring-1 ring-[var(--border)] focus:ring-[var(--brand)]"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-sm font-medium uppercase tracking-widest text-[var(--muted)]">
          Translations · {texts.length} saved
        </h2>
        <p className="mb-3 text-xs text-[var(--muted)]">
          Every passage a student has translated from this lesson. Edit one and your version is what every student
          sees from then on — the model is not asked again.
        </p>

        {texts.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Nothing translated from this lesson yet. Passages appear here the first time a student taps Translate.
          </p>
        ) : (
          <div className="space-y-2">
            {texts.map((t) => (
              <div key={t.id} className="rounded-2xl border border-[var(--border)] p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] ${
                      t.origin === "teacher"
                        ? "bg-[rgba(52,211,153,0.16)] text-[#6ee7b7]"
                        : "bg-[rgba(255,255,255,0.08)] text-[var(--muted)]"
                    }`}
                  >
                    {t.origin === "teacher" ? "your version" : "AI translation"}
                  </span>
                  <span className="ml-auto">{badge(t.id)}</span>
                </div>
                <p className="mb-2 text-xs leading-relaxed text-[var(--muted)]">{t.source}</p>
                <textarea
                  defaultValue={t.translation}
                  rows={3}
                  onBlur={async (e) => {
                    const translation = e.target.value.trim();
                    if (!translation || translation === t.translation) return;
                    if (await post({ kind: "translation", documentId, source: t.source, translation }, t.id)) {
                      setTexts((rows) =>
                        rows.map((r) => (r.id === t.id ? { ...r, translation, origin: "teacher" } : r)),
                      );
                    }
                  }}
                  className="w-full rounded-xl bg-black/20 px-3 py-2 text-sm leading-relaxed outline-none ring-1 ring-[var(--border)] focus:ring-[var(--brand)]"
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
