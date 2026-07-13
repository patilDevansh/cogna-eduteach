# MVP 3.0 Content Review Checklist

> Extends MVP 2.0 checklist. Required before promoting LLM-assisted drafts to student bank.

## Reviewer Sign-Off

| Reviewer | Role | Date | Scope | Signature |
|---|---|---|---|---|
| TBD | Math reviewer | TBD | Linear equations + LLM drafts | TBD |
| TBD | Pedagogy / copy | TBD | hints, explanations, parent-safe language | TBD |

## Question Checklist (carry + new)

For each question:

- [ ] ID stable and unique
- [ ] version correct
- [ ] concept ID canonical (no aliases)
- [ ] difficulty 1–5 matches rubric
- [ ] stem unambiguous
- [ ] accepted answers complete
- [ ] solution steps mathematically correct
- [ ] hint ladder helpful, not revealing too early
- [ ] misconception patterns realistic
- [ ] no unsafe / discouraging / clinical language
- [ ] review status `APPROVED`
- [ ] **draftOriginId recorded if LLM_ASSISTED**
- [ ] **validation log reviewed (not ignored)**
- [ ] **human re-checked LLM arithmetic (not rubber-stamp)**

## Explanation Checklist

- [ ] matches concept + misconception
- [ ] check-for-understanding exists
- [ ] retest mapping exists
- [ ] parent-safe summary language
- [ ] LLM analogy (if any) is mathematically accurate

## Draft Funnel Freeze

- [ ] manifest `targetApproved` met for pilot
- [ ] no `PENDING_REVIEW` in pilot seed
- [ ] random sample of LLM-origin items rechecked after seed
- [ ] deny-list and alias validators green in CI

---

## Sample Reject-Reason Appendix (LLM drafts)

When rejecting LLM-assisted drafts during human review, use structured reasons for analytics:

| Reject Code | Reason | Example |
|---|---|---|
| `MATH_ERROR` | Incorrect solution steps or wrong accepted answer | "Solution claims 3x = 9 → x = 4; should be x = 3" |
| `PEDAGOGICAL_MISMATCH` | Misconception tag doesn't match distractor or explanation | "Tagged SIGN_HANDLING but distractor shows INVERSE_OPERATION error" |
| `AMBIGUOUS_STEM` | Question wording unclear or multiple interpretations | "Stem says 'the number' without defining which variable" |
| `UNSAFE_LANGUAGE` | Clinical, discouraging, or deny-list term | "Stem includes 'students with low ability'; reject per deny-list" |
| `DIFFICULTY_MISMATCH` | Claimed difficulty doesn't match rubric | "Marked difficulty 2 but requires two-step with distribution (should be 4)" |
| `INCOMPLETE_HINT_LADDER` | Hint ladder reveals answer too early or skips steps | "Hint 1 gives final answer instead of guiding first step" |
| `SCHEMA_INVALID_POST_EDIT` | Human edited payload but broke schema | "Removed required acceptedAnswers array during edit" |
| `DUPLICATE_APPROVED` | Functionally identical to existing APPROVED item | "Same as question Q_C2_017 with different variable name" |

Rejected drafts transition to `REJECTED` status with `rejectReason` and `reviewerNote` for future prompt tuning and draft quality analysis.
