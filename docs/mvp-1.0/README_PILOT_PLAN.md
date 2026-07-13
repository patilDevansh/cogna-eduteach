# MVP 1.0 — Pilot Plan

> Student flow, parent/account model, analytics, privacy, and pilot design.  
> Collect the right data from day one — do not claim scientific cognition understanding.

---

## 1. Student flow (screens & transitions)

Minimum screens:

```text
Parent signup
Student profile creation
Student login / access code
Baseline introduction
Question screen
Confidence input
Hint display
Explanation display
Session summary
Revision queue
Parent summary
```

### Practice screen decisions (frozen)

| Decision | MVP choice |
|---|---|
| When timer starts | On `QUESTION_SHOWN` |
| Confidence asked | **After** submit, before next action shown; skippable → null |
| Hint levels | Up to 3 from `hintLadder`; level 4 full solution only via `SHOW_EXPLANATION` |
| Answer changes | Client tracks edits; send `answerChangedBeforeSubmit: boolean` |
| Skips | Allowed; emits `QUESTION_SKIPPED`; no mastery evidence |
| Bad internet | Client keeps `eventId`; retry same payload; server idempotent |
| Go backward | **No** — cannot revisit prior question in-session |
| Session end | Student button, or auto on time/count limit, or bank exhaustion |

### Baseline intro copy (intent)

Short: “We’ll ask about 12 questions to see where to start. This is practice, not a permanent label.”

---

## 2. Parent onboarding & account model

```text
Parent creates account
→ trial or payment (payment can stub)
→ creates student profile(s)
→ receives student access code
→ student completes baseline
→ parent receives first summary
```

### Frozen account rules

| Question | MVP answer |
|---|---|
| One parent → multiple students? | **Yes** |
| Multiple parents → one student? | **Yes** via `parent_student_links` (guardian invites later ok) |
| Student email required? | **No** (optional) |
| Consent | Parent consent required before student practice; store in `consents` |
| Trial length | **14 days** (configurable) |
| Deletion / export | Parent can request student data export + delete; soft-delete + retention job |
| Who views reports | Parents with `can_view_reports`; student sees student summary only |
| Subscription ends | Read-only reports 7 days; practice locked; data retained per retention policy |

Student does **not** own billing.

---

## 3. Analytics (product + learning)

Preserve **raw events** for independent evaluation — do not rely only on profile aggregates.

### Product

- baseline completion rate
- session completion rate
- questions per session
- hint requests per question
- abandonment (session start, no end)
- D1/D7 return rate
- parent report open rate

### Learning

- repeated misconception rate
- mastery Δ per concept
- independent correctness (no/low hints)
- post-explanation re-test success
- delayed revision performance (5–7 days)
- hint-dependence trend

Instrument via PostHog + DB event tables.

---

## 4. Pilot design

```text
Participants: 10–20 Grade 8 students
Duration: 2–3 weeks
Cadence: 3 short sessions per week (~10–15 min)
Domain: Linear Equations Learning Unit
Parent summary: at least weekly
```

### Primary questions

1. Can students use the product without help?
2. Are inferred misconceptions usually reasonable to a tutor/teacher?
3. Do targeted interventions reduce repeated errors?
4. Do parents understand and value the report?
5. Does the system avoid repetitive or frustrating loops?

### Explicit non-claim

Do **not** claim Cogna scientifically “understands cognition.” Validate whether learning-state estimates are **useful**.

### Pilot learning metrics vs software acceptance

Software gate = functional acceptance in Shared Contracts / Test Plan.  
Pilot metrics (retention, targeted vs non-adaptive) require delayed items + optional experiment design — research, not ship blockers.

---

## 5. Privacy & retention (build requirements)

### Collect

- account identity (parent email)
- student first name / display name
- learning events and answers
- device/session technical logs needed for reliability

### Do not collect (MVP)

- camera, microphone
- precise location
- school SIS records
- health information
- free-form personal disclosures beyond math answers

### Defaults

| Topic | Default |
|---|---|
| Minimum age | 13 with parent account (Grade 8) |
| Parent consent | Required before practice |
| Retention | Raw learning events 24 months; or earlier on delete request |
| Anonymization for research | Optional export strips names; hashed ids |
| Access control | Role-based; student cannot see other students |
| Encryption | TLS in transit; encrypted DB at rest (provider default) |
| Report visibility | Linked parents only |
| Logging redaction | No full answers in third-party logs by default |
| Model providers | MVP: no student math content sent to LLM providers |

Treat as engineering requirements, not a later legal-only page.

---

## 6. First construction milestone (reminder)

> One simulated student: start session → five reviewed questions → evidence-backed profile updates → reproducible decisions → one explanation → one re-test → deterministic summary.
