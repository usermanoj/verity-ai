// Pure helpers shared by the upload API route (server) and the ingest form
// (client) so the two agree on how an academic year is defaulted and how a
// section list is parsed. No server-only imports here — safe on both sides.

// IB/IG schools run roughly August–June, so treat August as the rollover:
// an upload in Sept 2026 defaults to "2026-2027", one in Jan 2026 to
// "2025-2026". Editable in the form for schools on a different calendar or
// uploads made near the boundary.
export function currentAcademicYear(now: Date = new Date()): string {
  const y = now.getFullYear();
  const startYear = now.getMonth() >= 7 ? y : y - 1; // getMonth() 7 = August
  return `${startYear}-${startYear + 1}`;
}

// Section input is a single comma-separated field (e.g. "7A" or "7A, 7B") so
// one upload can apply to several of a teacher's own sections at once. Names
// are trimmed, upper-cased ("7a" and "7A" are the same section), and
// de-duplicated while preserving order.
export function parseSections(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const name = part.trim().toUpperCase();
    if (name && !seen.has(name)) {
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}
