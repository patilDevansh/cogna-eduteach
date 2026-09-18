# Cogna 10.0

Production classroom orchestration is the active engineering era. The canonical contract is [`../docs/mvp-10.0/README.md`](../docs/mvp-10.0/README.md).

The [Cogna Lotus architecture](./LOTUS_ARCHITECTURE.md) records the current diagnostic implementation, the syllabus-grounded personalized target, the latency design, and the gaps still to validate. Proposed behavior in that document is not a shipped feature or a replacement for the canonical classroom contract.

The [factorisation problems log](./FACTORISATION_PROBLEMS.md) separates browser-confirmed findings from handoff risks that still need targeted verification.

The [continuous diagnostic architecture](./LOTUS_CONTINUOUS_DIAGNOSTIC.md) is the proposed next design for prompt-only question staging on the student's device, a durable rolling pool, curriculum-balanced selection, and background analysis. It follows the live browser finding that the first reserve implementation is fast for arithmetic but still waits on symbolic and algebraic work. It is not yet implemented.

Current state: classroom implementation exists and Lotus has a limited arithmetic fast path. Syllabus ingestion, durable rolling readiness, and fast symbolic/algebraic transitions remain proposed and require implementation and evaluation.
