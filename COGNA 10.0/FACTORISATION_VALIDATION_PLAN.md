# Factorisation: blueprint improvement and student validation

**Status:** Proposed evaluation protocol, 26 October 2026. No real-student evaluation has been run in this work.
**Goal:** Establish whether Cogna identifies useful teaching targets accurately enough for the intended pilot use, and whether the targeted teaching leads to independent learning.

## Business decision

Keep a reviewed skill blueprint with adaptive AI. Position the initial pilot as adaptive mathematics practice with evidence-informed teaching recommendations. Do not claim scientifically validated diagnosis, general-memory measurement, attention-span detection, or proven causal learning gains before the relevant evidence exists.

The first implemented repair is [diagnostic evidence qualification](../docs/mvp-10.0/DIAGNOSTIC_EVIDENCE.md): direct versus supporting successes, cautious report advancement, and no synthetic foundational sign gap.

## Remaining blueprint work, in order

1. **Review the factorisation map with a mathematics educator.** Give each skill an observable learning objective, examples/non-examples, allowed alternative methods, curriculum references, and a definition of sufficient evidence. Review overlaps such as numerical HCF versus finding a numerical common factor in an expression.
2. **Make prerequisites conditional.** Describe which task forms require which prerequisites. Numeric-only common-factor questions must not inherit variable-power dependencies merely because the general skill supports both.
3. **Separate three claims.** Store mathematical correctness, evidence of skill difficulty, and hypotheses about its cause separately. A wrong answer matching a distractor is not proof of the associated misconception. Test competing explanations using discriminating items.
4. **Improve positive evidence and routing together.** Extend the planner beyond the legacy provisional secure state; account for directness, item difficulty, response format, repeated exposure, conflicting evidence, representation, and assistance. Use independent transfer and delayed review before stronger claims. Do not substitute an uncalibrated probability for an uncalibrated label.
5. **Version the curriculum and assessment design.** Reuse shared mathematics skills across board-specific objective mappings. Replace the mandatory 25-slot structure with reviewed coverage/time policies when evidence supports that change. Do not assume the existing CBSE writing prompt supplies ICSE or Cambridge alignment.
6. **Calibrate teacher reports.** A teacher must be able to identify what was observed, what remains hypothetical, what was not tested, and why the next lesson was selected. Review historical reports separately rather than implying a new policy has revalidated them.

## Evaluation package

### A. Define the intended use and reference judgments

Use the diagnostic to select low-stakes teaching/support targets, not to grade intelligence or assign permanent ability labels. Choose the participating curriculum and factorisation scope before evaluation.

Two mathematics educators should independently judge a de-identified sample without seeing Cogna's diagnosis, then adjudicate disagreements. Keep genuine uncertainty as an outcome; do not force every response into a misconception. Their reference judgment must use the same evidence Cogna receives. A separate interview or notebook review may reveal the underlying difficulty, but record it as external validation evidence rather than pretending the app saw it.

For each case record:

| Field | Required content |
|---|---|
| Case and learner reference | Pseudonymous identifiers; consent/permission reference stored separately |
| Curriculum and exposure | Board/version, topic coverage, whether the concept was previously taught |
| Item and skill | Exact question version, primary/supporting skills, difficulty, response format |
| Student evidence | Submitted answer, any voluntarily entered reasoning, explicit uncertainty, assistance, technical interruptions |
| Reference judgment | Correctness, demonstrated skill, suspected difficulty, possible causes, alternatives, confidence, next useful check |
| Cogna judgment | Frozen model/prompt/verifier/policy versions, skill state, uncertainty, proposed and actually delivered action |
| Follow-up evidence | Fresh independent check, delay, intervening teaching/practice, delayed outcome |

### B. Sample the cases that could expose failures

Include students with secure knowledge, incomplete instruction, persistent misconceptions, occasional slips, valid alternative methods, confident wrong answers, uncertain correct answers, mixed performance, and device/language barriers. Include typed answers and every pilot game format. Do not infer frustration or attention span from timing alone.

Determine sample size with an evaluation specialist from the desired precision of false-gap/missed-gap estimates; do not treat a convenient small cohort as conclusive. Split development and held-out evaluation by learner; prevent question-family leakage. Reserve new students and new item variants for the final assessment.

### C. Freeze and compare

Freeze the blueprint, question versions, prompts, mathematical checkers, evidence policy, and release criteria before inspecting held-out results. Compare the existing baseline with the revised hybrid. If testing a free-form AI alternative, run it offline on the same cases and score its output against the same skill definitions; do not expose students to an unevaluated policy.

Use educators as an external reference. Synthetic learners and an automated oracle remain useful for engineering regressions, but neither alone establishes real-child diagnostic validity.

### D. Report the outcomes

- False-gap rate and precision of support recommendations, with denominators and uncertainty intervals.
- Missed-gap rate/recall, per skill and item format; retain “insufficient evidence” as a distinct outcome.
- Accuracy of specific misconception claims separately from accuracy of broad support targets.
- Agreement across comparable fresh items, and sensitivity to valid alternative solutions.
- Educator agreement and unresolved cases; sampled teacher usefulness of the recommended action.
- Coverage, completion/abandonment, uncertainty/abstention, and performance by relevant access/language contexts where sample size permits.
- Immediate independent learning and delayed retention after teaching, logging intervening practice and school instruction.
- Live end-to-end latency, failures, delivered lesson quality, and cost per completed learner session under expected class concurrency.

Set acceptance thresholds with the school/educators **before** evaluation. Mathematical correctness failures and cross-student data exposure block release. Other thresholds must reflect the pilot's intended use and measured uncertainty, not arbitrary scientific-sounding numbers.

## January pilot measurement

All participating grade 8 students receive access together, as agreed. Begin on January's school topics; use a baseline and fresh comparable checks around week four, with later retention checks. Show intervening instruction and actual participation. This design measures progress and associations; it does not isolate Cogna's causal contribution from school teaching, tuition, maturation, or other practice.

## Required external inputs

- Confirmed school, board, January teaching sequence, cohort size, devices, and homework replacement arrangement.
- Agreed student-data permissions, purpose, storage/access, retention/deletion, and de-identification process.
- Consented student response sample and independent educator reviewers.
- School/educator agreement on evaluation scope and release criteria.

No student outreach or data collection is authorized by this document. Do not mark this validation complete until the evidence has been collected and reviewed.

## Evidence base

Validity and reliability must support the intended use of an assessment: [International Test Commission guidance](https://www.intestcom.org/page/15). Assessment should inform targeted mathematics teaching: [EEF mathematics guidance](https://educationendowmentfoundation.org.uk/education-evidence/guidance-reports/maths-ks-2-3). Delayed checks and retrieval have a research basis, but Cogna's thresholds and schedules still require evaluation: [IES learning and study guidance](https://ies.ed.gov/ncee/wwc/PracticeGuide/1).
