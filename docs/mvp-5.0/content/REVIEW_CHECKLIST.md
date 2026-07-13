# MVP 5.0 Content Review Checklist

## Sign-off

| Reviewer | Scope | Date | Signature |
|---|---|---|---|
| TBD | Math text | TBD | TBD |
| TBD | Modality math claims | TBD | TBD |
| TBD | Policy safety | TBD | TBD |

## Modality asset

**Core checklist:**

- [ ] Transcript / claims match APPROVED solution
- [ ] concept/misconception/unit/subject IDs correct
- [ ] retest mapping exists
- [ ] no clinical / unsafe language
- [ ] duration appropriate for age
- [ ] `review_status=APPROVED`

**Extended modality checklist:**

| Item | Check | Notes |
|---|---|---|
| **Transcript accuracy** | Math claims in voice/video transcripts match APPROVED text solution word-for-word (formulas, numbers, steps) | Any deviation = VALIDATION_FAILED; no "close enough" |
| **Retest mapping** | Links to specific APPROVED text question; misconception/concept aligned | Missing retest = cannot APPROVE |
| **Animation correctness** | Visual steps match solution logic; no misleading intermediate frames | Frame-by-frame review for math animations |
| **Voice tone** | Encouraging, age-appropriate, no condescension or clinical framing | Parent-safe language standard applies |
| **Duration bounds** | ≤ 3 min for explanation modules; ≤ 90 sec for hints (age 12–14 attention) | Longer assets require justification |
| **Asset storage** | CDN-accessible; fallback to TEXT if CDN fails | No broken media in student path |
| **Modality fatigue** | Asset tagged with modalityType for fatigue tracking; system caps modality per session | Prevents video/voice overload |

**Reject reasons (modality-specific):**

| Code | Reason |
|---|---|
| `TRANSCRIPT_MATH_MISMATCH` | Voice/video transcript math claim does not match APPROVED text solution |
| `NO_RETEST_MAPPING` | Missing or broken link to retest question |
| `MISLEADING_VISUAL` | Animation frame suggests incorrect intermediate step |
| `DURATION_EXCESSIVE` | Exceeds age-appropriate attention window |
| `STORAGE_UNAVAILABLE` | Asset not accessible in staging/prod CDN |

## Policy promote

- [ ] safety_eval passed
- [ ] shadow period complete
- [ ] experiment analysis reviewed
- [ ] rollback owner named
