# Local developer diagnostic exit

This additive development-only contract follows the product owner's 5 November 2026 request. A standalone synthetic demo in local developer mode may pause at an automatic Lotus stopping point after its answer has been saved. The pending choice includes the actual stopping reason, saved-answer count and availability of a checked next question.

The developer chooses Finish test or Stay in test. Finishing produces the diagnostic report. Staying advances to the existing checked next item and acknowledges that particular stopping condition for the rest of this developer run. A different condition can prompt again. Without further checked content, continuation is unavailable and the prompt explains why.

The answer, pending decision, acknowledged stopping conditions and choice history persist in the session's existing JSON snapshot. Choice retries return the saved outcome. A conflicting second choice is rejected. A pending decision survives refresh and API restart. Active-session responses redact the internal continuation item and its answer key.

Eligibility requires a non-production environment, the explicit LOTUS_DEV_OBSERVER_BYPASS local setting, an authenticated demo learner, no classroom assignment and a developer-mode request. Ordinary student and classroom diagnostics follow their configured stopping rules. This development extension adds no learning action alias.

The API reports the effective factorisation time limit so the developer clock and server agree. Verification uses synthetic local fixtures and controlled model responses.
