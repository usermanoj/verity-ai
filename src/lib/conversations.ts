import { supabaseAdmin, hasSupabaseAdmin } from "@/lib/supabase/admin";
import type { AppUser } from "@/lib/auth";
import { isDemoTopic } from "@/lib/access";

// Records what students ask the tutor, and what it answered.
//
// This is the data behind the product's most distinctive claim — that a
// teacher can see whether the assistant is being used to learn or to
// shortcut. Until students signed in there was nobody to attribute a
// transcript to, so the tables sat empty from the first migration until now.
//
// Only STUDENTS are logged. A teacher previewing their own lesson generates
// exactly the traffic that would make a class's figures meaningless, and they
// are not the subject of the monitoring either.
//
// Every function here fails silently. A logging failure must never cost a
// student their answer — the tutor reply is the product, the record of it is
// bookkeeping.

const RECENT_CONVERSATION_MINUTES = 60;

export async function conversationFor(user: AppUser | null, topicId: string): Promise<string | null> {
  if (!user || user.role !== "student" || !hasSupabaseAdmin()) return null;

  try {
    const admin = supabaseAdmin();

    // Continue the same conversation if the student is still on the topic
    // they were on an hour ago. Without this, every button press becomes its
    // own "conversation" and the record loses the thing a teacher reads it
    // for — the shape of a student working through something.
    const since = new Date(Date.now() - RECENT_CONVERSATION_MINUTES * 60_000).toISOString();
    const { data: existing } = await admin
      .from("conversations")
      .select("id")
      .eq("student_id", user.id)
      .eq("topic_id", topicId)
      .gte("started_at", since)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) return existing.id;

    const { data: created } = await admin
      .from("conversations")
      .insert({ student_id: user.id, topic_id: topicId, class_id: await classFor(user.id, topicId) })
      .select("id")
      .maybeSingle();

    return created?.id ?? null;
  } catch {
    return null;
  }
}

export async function logTurn(
  conversationId: string | null,
  role: "user" | "assistant",
  text: string,
  intent?: string,
  citedChunkIds: string[] = [],
): Promise<void> {
  if (!conversationId || !text.trim() || !hasSupabaseAdmin()) return;
  try {
    await supabaseAdmin()
      .from("conversation_turns")
      .insert({ conversation_id: conversationId, role, text, intent: intent ?? null, cited_chunk_ids: citedChunkIds });
  } catch {
    // Deliberately silent — see the note at the top of this file.
  }
}

// Which of the student's classes this topic reached them through.
//
// A student can be in several classes and a document can be shared across
// sections, so this is genuinely ambiguous; the first match is taken. Null
// for the seeded demo topics, which belong to no class — which is why 0017
// had to drop the NOT NULL rather than invent one.
async function classFor(studentId: string, topicId: string): Promise<string | null> {
  if (isDemoTopic(topicId)) return null;
  try {
    const admin = supabaseAdmin();

    const { data: enrolments } = await admin
      .from("class_enrollments")
      .select("class_id")
      .eq("student_id", studentId);
    const classIds = (enrolments ?? []).map((e) => e.class_id);
    if (classIds.length === 0) return null;

    const { data: match } = await admin
      .from("corpus_document_sections")
      .select("class_id")
      .eq("document_id", topicId)
      .in("class_id", classIds)
      .limit(1)
      .maybeSingle();

    return match?.class_id ?? null;
  } catch {
    return null;
  }
}
