# COGNA: Full Product & UI Audit (Phase 1)

**Audit Date:** September 2026  
**Auditor Role:** Product Critic, Senior UX Designer, Learning-Science Reviewer & QA Lead  
**True Product Promise:**  
> *"COGNA finds the exact step where algebra breaks, fixes that one gap, and checks later that the student can solve it alone."*

---

## 1. Executive Findings & Critical Assessment

| Strategic Assessment | Finding | Implication |
|---|---|---|
| **Differentiated Core** | Deterministic algebraic step verification + targeted intervention + independent transfer + delayed retention proof. | This is the crown jewel. No other product isolates the *first invalid step* deterministically without hallucinations. |
| **Current Problem** | Over-engineered cognitive modeling, premature scope (73 skills, 125 templates, 2,000 questions), multi-screen dashboards, and clinical/testing vocabulary. | Stresses Grade 8 students, overwhelms parents with un-actionable stats, and burdens teachers with SaaS monitoring. |
| **Urgent Pivot** | Rescope the entire product into **one undeniable learning rescue loop** for Grade 8 Linear Equations (Brackets & Signs), with a 10-minute student flow, a 30-second parent summary, and a 1-minute teacher decision brief. | Strip away cognitive profile maps, mastery heatmaps, and testing jargon in favor of active, dignity-first learning. |

---

## 2. Route-by-Route Product & UI Audit Table

The table below audits every route across the application based on visual inspection, user state simulation, and responsive tests.

| Route / Screen | Intended User & Job to be Done | Current Communication & State | Boredom / Confusion / Friction Risks | COGNA Loop vs Generic Dashboard | Accessibility & Mobile Issues | Proposed Action & Rank |
|---|---|---|---|---|---|---|
| **`/`** (Landing) | Parent & Teacher: understand why COGNA exists and choose login path. | Clean grid backdrop, equation animation, calm copy: *"Practice that pays attention."* | Three competing buttons (`I'm a teacher`, `I'm a parent`, `I'm a student`). Does not clearly state the parent promise. | **Proves loop stance**, but lacks the sharp 1-sentence value proposition. | Good responsiveness; text contrast high (`#16241d` on `#f4f7f3`). | **[P0]** Update headline to: *"COGNA finds the exact step where algebra breaks, fixes that one gap, and checks later that your child can solve it alone."* Provide one clear entry path. |
| **`/student/home`** & **`/student/login`** | Student: start today's session with minimal barrier. | Practice code entry box (`AB12CD`), *"Start practicing"*, *"Use demo code"*, *"Join with my teacher's code"*. | Feels like entering a testing portal. No warm invitation or clarity on what will happen in the 10 minutes. | **Neutral portal.** | Centered card works well on mobile. | **[P1]** Replace code-first friction with 1-click student start: *"10-minute mission: Master equations with brackets & minus signs."* |
| **`/student/diagnostic-v2`** | Student: identify algebraic step misconceptions. | Clean step-by-step math input (`ONE LINE AT A TIME`), "Submit step", "I don't know", debug view toggle. | 1. Why-this-question debug info clutters UI.<br>2. Multiple complex tracks (quadratics, fractions, trinomials) dilute focus.<br>3. After an error, sometimes shows text explanations instead of interactive contrast. | **Strong step engine core**, but UI carries residual diagnostic-lab machinery. | Formula keyboard on mobile can be tight; inputs must support quick algebraic tokens. | **[P0]** Convert into the **"Mistake Microscope"**: When an error occurs, visually spotlight the exact line transformation, show side-by-side contrast, ask 1 discriminating check question, then trigger an independent transfer problem. |
| **`/student/practice`** (Legacy v1/v2) | Student: daily adaptive practice. | 12-question baseline target, confidence picker ("guess", "hunch", "sure"), break advisor modals. | 12-item baseline feels like a formal school test. Final-answer inputs miss step-level diagnosis. | **Looks like a standard quiz app** (Duolingo/Khan style). | Good layout, but excessive modal popups on breaks. | **[P0]** Deprecate legacy final-answer practice flow. Route all student practice through the step-verified Linear Equations loop. |
| **`/student/baseline`** | Student: initial assessment. | Fixed sequence of multiple-choice and short-answer questions. | High test anxiety. No immediate learning win or rescue feeling. | **Generic diagnostic test.** | High cognitive load on mobile. | **[P1]** Replace multi-question baseline with a 2-question approachable entry check inside the 10-minute mission. |
| **`/student/revision`** & **`/student/lotus`** | Student: multi-modal review. | Lotus learning nodes, video explanation generator, interactive exploration. | High cognitive complexity; generates video rendering overhead before proving text/visual contrast efficacy. | **Experimental feature creep.** | Heavy client JS execution. | **[P2]** Flag as roadmap. Keep dormant until the core 10-minute text/visual step loop is validated with students. |
| **`/parent/dashboard`** & **`/parent/students/[id]`** | Parent: know if tuition/time is working and what to do next. | Growth charts, concept meters, mastery trend lines, practice calendar, pattern history. | 1. Too many metrics, bars, and trend graphs.<br>2. Takes >2 minutes to parse.<br>3. Does not answer: *"Can my child solve this alone now?"* | **Generic SaaS analytics dashboard.** Violates the 30-second rule. | Graphs crowd mobile viewport. | **[P0]** Rescope into **"30-Second Parent Evidence Card"**: (1) What improved today, (2) The 1 fragile step, (3) Independent proof, (4) One calm next action. |
| **`/parent/students/[id]/summary`** & **`/weekly`** | Parent: weekly recap. | Text report with generated narrative. | Jargon-heavy: mentions "provisional evidence-backed observations", "retention state". | **Good intent, clinical copy.** | Good readable typography. | **[P1]** Replace clinical copy with humanized evidence language (see Section 3 below). |
| **`/teacher/today`** & **`/teacher/reports`** (Legacy) | Teacher: monitor classroom activity. | Tables of student names, session timestamps, individual score cards. | Requires teacher to log in daily, inspect individual rows, and synthesize instructional meaning manually. | **Generic LMS gradebook / tracking table.** | Wide tables cause horizontal scrolling on tablets. | **[P1]** Replace with the new 1-minute **Classroom Decision Brief** prototype. |
| **`/prototype/teacher-report`** (New 30-Second Brief) | Teacher: decide classroom move for tomorrow in 30–60s. | Hero comprehension count (21/30), segmented readiness bar (18 ready / 8 support / 4 probe), primary difficulty (Variables on both sides), worked mistake comparison, 10-minute lesson blueprint modal, and quarantined evidence modal. | Minimal friction. All 5 core classroom questions answered above the fold. | **Directly proves the COGNA pedagogical loop for schools.** Zero operating burden. | Fully responsive CSS grid with quiet classroom palette. | **[P0]** Promote this prototype to the primary teacher experience at `/teacher/reports` and `/teacher/today`. |
| **`/prototype/quadratics`** | Research prototype for quadratics/factoring. | Product-sum workspace, area model visualization. | Out of scope for Grade 8 Linear Equations proof wedge. | **Valuable research prototype**, but premature for current validation wedge. | Complex multi-pane interactions. | **[P2]** Maintain in `/prototype/` sandbox; do not integrate into main student MVP loop yet. |

---

## 3. Copy & Vocabulary Audit (Jargon vs Humanized Replacements)

COGNA must strictly eliminate clinical, testing, and AI jargon. Below is the mandatory copy translation dictionary across all screens:

| Current / Legacy Jargon in Code & UI | Why it Fails (User Experience) | Exact Replacement for Student / Parent / Teacher |
|---|---|---|
| *"Provisional evidence-backed skill observations"* | Sounds like a medical or legal liability disclaimer. | **"What we've seen so far"** |
| *"Mastery: 64% (Emerging BKT State)"* | False precision; makes students feel judged by an algorithm. | **"Can solve: equations without brackets"**<br>**"Practising: minus signs when opening brackets"** |
| *"Cognitive Model / Learner State"* | Invites false claims that COGNA diagnoses a child's brain or intelligence. | **"Your child's algebra map"** |
| *"Diagnostic Battery / Baseline Assessment"* | Instantly creates test anxiety and compliance dread. | **"10-Minute Algebra Mission"** |
| *"Intervention Triggered — Assistance Level: RULE_PROMPT"* | Engineering debug language leaked to users. | **"Let's look at what just happened on line 2"** |
| *"Failure on transfer task due to conceptual deficiency"* | Deficit-based labeling of a child. | **"Tried a new problem format; still getting comfortable with signs."** |
| *"Delayed retention state: UNVERIFIED"* | Cold, unhelpful system status. | **"We'll do a 2-minute check on Thursday to make sure it stuck."** |
| *"Input conflict — excluded from learner conclusions"* | Accurate internal audit logic, but wordy for a child. | Student UI: *"Let's try that step again together."*<br>Teacher modal: *"Input conflict recorded — excluded from gap attribution."* |

---

## 4. Premature Elements Flagged for Deferral

To ensure COGNA succeeds on its first learning proof, the following elements are explicitly flagged as **premature for MVP-1** and excluded from the active student loop:

1. **73 Micro-Skill Graph & 125 Question Templates:** Defer all topics outside Grade 8 Linear Equations (e.g. trinomial factoring, quadratic formula, algebraic identities).
2. **2,000 Generated Question Quota:** Focus exclusively on **12–18 deeply authored and reviewed question families**.
3. **Multi-Step Video Generation Engine (`@cogna/lesson-video`):** Video rendering introduces latency and infrastructure cost before text/visual step contrast is validated.
4. **Complex Cognitive Profile Dashboards (Growth Charts, Mastery Trend Lines, Heatmaps):** Replace with the clean 30-Second Evidence Card.
5. **School SIS / LMS Integrations:** School pilots need zero IT integration—only a one-page PDF/print classroom brief.

---

## 5. The Decision Test: Core Loop Validation Checklist

Every screen and feature in the rescoped MVP must pass this single test:

$$\text{Mistake on Step } k \;\longrightarrow\; \text{Microscope on First Error} \;\longrightarrow\; \text{Active Contrast Check} \;\longrightarrow\; \text{Independent Transfer Problem} \;\longrightarrow\; \text{Delayed Check (Day 4)}$$

- [x] Does a wrong early step avoid marking downstream skills wrong? **(Deterministic verifier enforces this)**
- [x] Does the help require the student to *act* rather than read a passive text wall? **(Active contrast enforces this)**
- [x] Does the student receive an unhinted, structurally different transfer problem immediately after help? **(Transfer engine enforces this)**
- [x] Does the parent see undeniable proof that the child solved it alone? **(30-second evidence card enforces this)**
- [x] Can the teacher make tomorrow's instructional decision in under 60 seconds? **(Teacher brief prototype enforces this)**
