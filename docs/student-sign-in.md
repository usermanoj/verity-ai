# How students sign in — options and trade-offs

Written to settle a decision that is blocking two things at once: the learning
analytics every dashboard is missing, and the fact that approved school
material is currently readable by anyone holding a topic URL.

This is a school product used by minors, so the decision is as much a data
protection one as a technical one. Both are covered below.

---

## The part that is usually missed

**Identity and enrolment are two different problems, and one option rarely
solves both.**

- *Identity* — who is this person? Needed to attribute work, and to keep
  material behind a login at all.
- *Enrolment* — which class are they in? Needed for everything a teacher
  actually wants: "how is 7B doing", "which of my students is stuck".

Single sign-on answers identity completely and enrolment not at all. It will
tell you that `zhang.wei@school.edu.sg` signed in; it will not tell you that
he is in your Grade 7 Physics section 7B. Any option chosen for identity still
needs an answer for enrolment, and that second answer is where most of the
per-class setup cost lives.

---

## Option 1 — School SSO (Google Workspace / Microsoft 365)

Students sign in with the school account they already use daily. Same
mechanism the teachers already use in this app.

**Strengths**

- No credentials held by us at all. The school's identity provider
  authenticates; we receive a subject identifier and a display name. There is
  no password to reset, leak, or be responsible for.
- Strong, real identity: work attributes to a named student, which is what
  makes the teacher and HOD analytics meaningful.
- Access dies with the account. A student who leaves loses access the moment
  IT disables them — no orphaned logins to clean up.
- It is the answer a school's IT department expects to hear. Proposing
  anything else invites the question of why.

**Costs and risks**

- Requires the school's IT to approve the app in their Workspace or Entra
  tenant. That is a real gate, and its timing is not under your control.
- Solves identity only. Enrolment still needs one of the mechanisms below.
- A pilot cannot start until IT says yes, which may be weeks.

---

## Option 2 — Class join codes

The teacher generates a code per section. A student enters it once and is
bound to that class.

**Strengths**

- No IT involvement whatsoever. One willing teacher can run a pilot this week.
- Solves *enrolment* directly and elegantly — the code IS the class.
- Can be fully pseudonymous: if no name is collected, no personal data about a
  child is stored at all, which is the strongest possible privacy position.

**Costs and risks**

- Identity is weak. Codes get shared, screenshotted, posted in group chats.
  You cannot honestly tell a head of department "this is Zhang Wei's work"
  — only "this came from someone who had 7B's code".
- Pseudonymous means the teacher cannot see who is struggling, which is most
  of the value they were promised.
- Attaching names to make it useful means collecting children's names through
  an unauthenticated form, which is a materially worse position than either
  other option — unverified PII with no institutional control.

---

## Option 3 — Roster import

The school provides a student list per class (CSV export, or from their MIS)
and each student gets a login you issue.

**Strengths**

- Solves identity and enrolment together, in one step.
- Strongest attribution: every student is known, in a known class, from day
  one.
- Works for a school with no Google or Microsoft tenant, which does exist.

**Costs and risks**

- **You become the custodian of children's credentials.** Password storage,
  reset flows, lockouts, and the breach liability that comes with them. For an
  early-stage company this is the single largest risk-surface increase
  available.
- You hold a roster of minors' names before any account is ever used. That is
  personal data at rest requiring a lawful basis, a retention policy, and a
  deletion path.
- Heaviest per-class setup, repeated every academic year.
- Leavers linger until someone remembers to remove them.

---

## Data protection, plainly

The users are children. A few points that hold regardless of option:

- **The school is the data controller; we are a processor.** Everything is
  done on the school's instruction, and a data processing agreement should say
  so. SSO supports this posture naturally — the school already holds the
  identity and simply vouches for it. Roster import strains it, because we
  begin holding identity ourselves.
- **International schools are a multi-jurisdiction problem.** A Singapore
  campus will have EU, UK and US nationals in the same classroom, so PDPA is
  the floor and GDPR-shaped obligations are a realistic ceiling. Design to the
  strictest reading, not the local one.
- **Collect the minimum that makes the product work.** A subject identifier, a
  display name, and a class membership are enough for everything the
  dashboards promise. Date of birth, personal email, and photographs are not
  needed and should not be collected.
- **Conversation logs are the sensitive part, not the login.** Once students
  are identified, the tutor transcript becomes a record of a named child's
  confusion. It needs a retention limit, a clear purpose, and an answer to
  "can a parent request this". Worth deciding before the first log is written
  rather than after.

---

## Recommendation

**School SSO for identity, plus a one-time class join code for enrolment.**

This is the combination, not a compromise between the two:

- The school's identity provider proves who the student is, so no credentials
  are ever held and attribution is real.
- The teacher hands out a code once per section, which places that verified
  student in the right class without anyone importing a roster or maintaining
  one.
- The teacher stays in control of their own class list, which is also how they
  already think about it.

Practically it means: a student clicks the topic link, signs in with the
school account, is asked once for a class code, and never sees either step
again.

**If IT approval will take longer than the pilot can wait**, run the pilot on
join codes alone with pseudonymous identity, and be explicit with the teacher
that class-level insight works and per-student insight does not yet. That is
an honest limitation to state; discovering it mid-pilot is not.

**Consider roster import only if a specific school asks for it**, and prefer
their MIS or Google Classroom over holding passwords yourself.

---

## What this costs to build

Roughly in order:

1. Gate student-facing routes behind a session, and scope approved material to
   the sections a student is actually enrolled in — this closes the current
   hole where any topic URL is world-readable.
2. Class membership: a join-code table, a redemption flow, and enrolment
   records.
3. Turn on the logging that already exists but never fires — `events` and
   `practice_attempts` are written today only for a signed-in user, so they
   start filling with no further work.
4. Conversation logging, with a retention decision made first.
5. Build the learning-analytics panels the dashboards currently show as
   deliberately empty.

Steps 1–3 are what unlock everything else, and 1 is worth doing on its own
merit whatever is decided about the rest.
