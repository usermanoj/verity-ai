/**
 * What each real account can read from the corpus tables, through RLS.
 *
 *   npx tsx scripts/check-corpus-access.mts
 *
 * Written to verify a policy rewrite, which is the change most likely to be
 * wrong in a way nothing notices: the application reads the corpus with the
 * service role, so RLS could grant everything to everyone and every page would
 * look correct. Run it before the migration and after, and diff.
 *
 * An ERROR line is not the same as a zero. A policy that cannot be evaluated —
 * the mutual recursion between corpus_documents_select and
 * corpus_document_sections_select is the live example — fails the query outright
 * rather than returning nothing, and the two must never be reported the same
 * way.
 *
 * Costs one sign-in record per account. Read-only otherwise.
 */
import { adminClient, asUser, loadEnv, must, table } from "./lib/audit-db.mts";

const env = loadEnv();
const db = adminClient(env);

const TABLES = ["corpus_documents", "corpus_document_sections", "corpus_chunks", "generated_questions"] as const;

const people = must(await db.from("users").select("id, role, display_name").order("role"), "users");
const auth = await db.auth.admin.listUsers();
if (auth.error) throw new Error(`listUsers failed: ${auth.error.message}`);
const emailFor = (id: string) => auth.data.users.find((u) => u.id === id)?.email ?? "";

// What the tables actually hold, so a row count can be read as a fraction of
// the whole rather than as a bare number.
const totals: Record<string, number> = {};
for (const t of TABLES) {
  const { count, error } = await db.from(t).select("*", { count: "exact", head: true });
  if (error) throw new Error(`counting ${t} failed: ${error.message}`);
  totals[t] = count ?? 0;
}

// Which sections each person is in. A student's counts mean nothing without
// it — "1 document" is only readable next to "enrolled in 7A, which has the
// Moments deck".
const classes = must(await db.from("classes").select("id, section_name"), "classes");
const enrolments = must(await db.from("class_enrollments").select("student_id, class_id"), "enrolments");
const sectionsFor = (id: string) =>
  enrolments
    .filter((e) => e.student_id === id)
    .map((e) => classes.find((c) => c.id === e.class_id)?.section_name ?? "?")
    .sort()
    .join(", ") || "—";

const columns = TABLES.map((t) => t.replace("corpus_", "").replace("_", " "));
const rows: string[][] = [["WHO", "ROLE", "IN", ...columns]];
rows.push(["everything there is", "—", "—", ...TABLES.map((t) => String(totals[t]))]);

for (const p of people) {
  const email = emailFor(p.id);
  if (!email) {
    rows.push([p.display_name ?? "?", String(p.role), sectionsFor(p.id), ...TABLES.map(() => "no auth row")]);
    continue;
  }
  const me = await asUser(email, env);
  const cells: string[] = [];
  for (const t of TABLES) {
    // Not head:true. A HEAD request has no body to put an error in, so a
    // failure came back as an empty message and printed as "ERR" with no
    // cause — which is barely better than a silent one. limit(1) still gets
    // the exact count, from the Content-Range header, and keeps the message.
    const { count, error } = await me.from(t).select("*", { count: "exact" }).limit(1);
    cells.push(error ? `ERR ${error.message.slice(0, 40)}` : String(count ?? 0));
  }
  rows.push([p.display_name ?? "?", String(p.role), sectionsFor(p.id), ...cells]);
  await me.auth.signOut();
}

console.log();
console.log(table(rows));
console.log();
