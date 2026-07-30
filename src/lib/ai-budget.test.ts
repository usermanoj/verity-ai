import { describe, expect, it } from "vitest";
import {
  checkBudget,
  nearingLimit,
  DAILY_PER_PERSON,
  DAILY_PER_SCHOOL,
} from "./ai-budget";

// Every assertion here is about a child being told to stop, or not being told
// to stop, in the middle of a lesson. The boundaries matter more than the
// numbers: an off-by-one locks someone out one request early, and nobody
// reports that as a bug — they just stop using it.

const STUDENT_TUTOR = DAILY_PER_PERSON.tutor.student;

describe("checkBudget — the person's own limit", () => {
  it("allows a call at exactly the limit", () => {
    // The count arrives AFTER the increment, so userCalls === limit is the
    // limit-th call of the day and must go through. Rejecting here would give
    // everyone one fewer than the number stated.
    expect(checkBudget("tutor", "student", STUDENT_TUTOR, 0)).toEqual({ allowed: true });
  });

  it("refuses the one after", () => {
    const v = checkBudget("tutor", "student", STUDENT_TUTOR + 1, 0);
    expect(v.allowed).toBe(false);
    expect(v).toMatchObject({ scope: "person" });
  });

  it("gives staff their own, larger allowance", () => {
    // A teacher previewing across many lessons must not be locked out of their
    // own material before period six.
    const overStudent = STUDENT_TUTOR + 1;
    expect(checkBudget("tutor", "teacher", overStudent, 0)).toEqual({ allowed: true });
    expect(checkBudget("tutor", "hod", overStudent, 0)).toEqual({ allowed: true });
    expect(checkBudget("tutor", "principal", overStudent, 0)).toEqual({ allowed: true });
  });

  it("treats an unknown or missing role as staff, not as blocked", () => {
    // Failing open on an unrecognised role. Getting the limit slightly wrong
    // for an odd account is better than locking out a real person because a
    // role string changed.
    expect(checkBudget("tutor", null, STUDENT_TUTOR + 1, 0)).toEqual({ allowed: true });
  });

  it("counts tutor and translate against separate allowances", () => {
    // Spending a day's translation must not cost a student their explanations.
    const t = DAILY_PER_PERSON.translate.student;
    expect(checkBudget("translate", "student", t, 0)).toEqual({ allowed: true });
    expect(checkBudget("translate", "student", t + 1, 0).allowed).toBe(false);
  });
});

describe("checkBudget — the school ceiling", () => {
  it("allows a call at exactly the school limit", () => {
    expect(checkBudget("tutor", "student", 1, DAILY_PER_SCHOOL)).toEqual({ allowed: true });
  });

  it("refuses the one after, even for a student who has barely asked", () => {
    // The point of the ceiling: a per-person cap multiplies by the roll, and
    // thirty students politely inside their own limits can still empty a
    // small balance between them.
    const v = checkBudget("tutor", "student", 1, DAILY_PER_SCHOOL + 1);
    expect(v.allowed).toBe(false);
    expect(v).toMatchObject({ scope: "school" });
  });

  it("applies to staff too", () => {
    // A ceiling a teacher can walk through is not a ceiling.
    expect(checkBudget("tutor", "teacher", 1, DAILY_PER_SCHOOL + 1).allowed).toBe(false);
  });

  it("blames the school, not the child, when both limits are exceeded", () => {
    // A student told they personally asked too much would go and report a
    // fault that is not theirs. The school message is both truer and kinder.
    const v = checkBudget("tutor", "student", STUDENT_TUTOR + 50, DAILY_PER_SCHOOL + 50);
    expect(v).toMatchObject({ allowed: false, scope: "school" });
  });
});

describe("the refusal message", () => {
  it("tells a student what still works", () => {
    // "Limit reached" to an eleven-year-old reads as "you have broken it".
    for (const v of [
      checkBudget("tutor", "student", STUDENT_TUTOR + 1, 0),
      checkBudget("tutor", "student", 1, DAILY_PER_SCHOOL + 1),
    ]) {
      expect(v.allowed).toBe(false);
      if (v.allowed) continue;
      expect(v.message).toMatch(/still work/i);
      expect(v.message).not.toMatch(/error|invalid|denied|forbidden|quota|rate limit/i);
    }
  });

  it("does not tell a student off for asking a lot", () => {
    const v = checkBudget("tutor", "student", STUDENT_TUTOR + 1, 0);
    if (v.allowed) throw new Error("expected a refusal");
    expect(v.message).toMatch(/good sign/i);
  });
});

describe("nearingLimit", () => {
  it("says nothing early in the day", () => {
    expect(nearingLimit("tutor", "student", 1)).toBeNull();
    expect(nearingLimit("tutor", "student", STUDENT_TUTOR - 11)).toBeNull();
  });

  it("warns once the end is close", () => {
    expect(nearingLimit("tutor", "student", STUDENT_TUTOR - 10)).toBe(10);
    expect(nearingLimit("tutor", "student", STUDENT_TUTOR - 1)).toBe(1);
  });

  it("stops warning once there is nothing left to warn about", () => {
    // At the limit and beyond, the refusal message does the talking. "0 more
    // requests today" alongside a working reply would be a contradiction.
    expect(nearingLimit("tutor", "student", STUDENT_TUTOR)).toBeNull();
    expect(nearingLimit("tutor", "student", STUDENT_TUTOR + 5)).toBeNull();
  });

  it("uses the staff allowance for staff", () => {
    const staff = DAILY_PER_PERSON.tutor.staff;
    expect(nearingLimit("tutor", "teacher", STUDENT_TUTOR - 5)).toBeNull();
    expect(nearingLimit("tutor", "teacher", staff - 3)).toBe(3);
  });
});

describe("the limits themselves", () => {
  it("gives a student room for a real lesson", () => {
    // A student working hard through one lesson sends on the order of twenty
    // tutor messages. A limit below that is not a safeguard, it is a broken
    // product — this is the assertion that fails if someone tunes it down to
    // save money without thinking about the child.
    expect(DAILY_PER_PERSON.tutor.student).toBeGreaterThanOrEqual(40);
  });

  it("keeps the school ceiling reachable by a real class", () => {
    // Deliberately low enough to be HIT during a pilot. Being told the school
    // is out for today is recoverable by raising a number; an exhausted
    // balance mid-term is a dead product.
    expect(DAILY_PER_SCHOOL).toBeLessThan(DAILY_PER_PERSON.tutor.student * 30);
  });

  it("gives staff more than students", () => {
    for (const kind of ["tutor", "translate"] as const) {
      expect(DAILY_PER_PERSON[kind].staff).toBeGreaterThan(DAILY_PER_PERSON[kind].student);
    }
  });
});
