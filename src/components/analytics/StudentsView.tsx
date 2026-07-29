"use client";

import { useState } from "react";
import StudentProgressTable from "./StudentProgressTable";
import StudentDetail from "./StudentDetail";
import type { StudentProgress } from "@/lib/student-progress";

// Holds the "which student is open" state so the table stays a pure list and
// the detail panel is only mounted — and only fetched — when a teacher asks
// for a particular child. A transcript is not something to load thirty of
// speculatively.
export default function StudentsView({ students, now }: { students: StudentProgress[]; now: number }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = students.find((s) => s.id === openId);

  return (
    <>
      <StudentProgressTable students={students} now={now} onOpen={setOpenId} />
      {open && (
        // Keyed by student: switching pupils remounts rather than reusing state,
        // so one child's answers can never appear under another's name.
        <StudentDetail key={open.id} studentId={open.id} name={open.name} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}
