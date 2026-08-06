# MVP 5.0 — Production Auth

> Roles expand for modality reviewers and policy operators.

| Role | Can |
|---|---|
| parent / student | existing surfaces |
| content_reviewer | text + modality review |
| modality_producer | upload drafts; cannot APPROVE alone |
| policy_ops | shadow/experiment/promote/rollback with dual control |
| teacher_coach | read-only |
| admin | break-glass |

Dual control recommended for policy promote/rollback.

---

## Policy Governance — Dual-Control Promote

**Purpose:** Prevent single-actor policy promotion errors; ensure learned-policy changes are intentional and reviewed.

**Two-actor roles (before Canonical freeze, define exactly):**

| Actor | Example role | Responsibility |
|---|---|---|
| Policy Engineer | policy_ops + engineering lead | Runs offline eval; verifies safety metrics; uploads policy artifact |
| Policy Approver | product owner / safety lead | Reviews safety eval results; business approve for promotion |

**Promote workflow:**

```text
1. Policy Engineer uploads candidate policy version + safety_eval_id
2. System checks: safety_evals.passed = true for that eval
3. Policy Engineer requests promotion (sets status = PROMOTION_REQUESTED)
4. Policy Approver reviews safety eval metrics, experiment results, shadow agreement
5. Policy Approver approves promotion (sets status = PROMOTED) OR rejects (sets status = REJECTED with reason)
6. System enables policy for experiment or default traffic only after dual approval
```

**Rollback workflow:**

```text
Rollback to baseline may be executed by single policy_ops actor in emergency (P0 production issue).
Routine rollback (non-emergency) should follow dual review when feasible.
```

**Audit log:**

All promote/rollback actions logged with actor, timestamp, reason, and safety_eval_id link.
