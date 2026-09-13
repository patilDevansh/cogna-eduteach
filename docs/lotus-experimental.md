# Cogna Lotus — experimental dual-model diagnostic

Lotus is a signed-in, demo-student AI Lab for observing whether two independently prompted GPT agents can run an adaptive Grade 7 CBSE mathematics diagnostic. It is not the validated `diagnostic-v2` engine, does not write learner conclusions to the database, and must not be presented as a validated school result.

## What it does

For the opening item and every answered question, Lotus runs four model calls:

1. GPT primary assesses the raw evidence independently.
2. GPT challenger assesses the same raw evidence in a separate context without seeing the primary assessment.
3. GPT primary compares both assessments, argues disagreements, and revises when warranted.
4. GPT challenger audits the debate and chooses the next question or exits with a report.

The observer UI first shows the Primary proposal, Challenger proposal, the question actually selected, its source, and why it adds useful evidence. The detailed student evidence, independent assessments, disagreement, and final conclusion remain available underneath. The clean student view hides this material because active hypotheses could coach the student and contaminate later evidence.

## Diagnostic policy

- Initial knowledge is limited to Grade 7 and CBSE; there is no generated learner profile or presumed weakness.
- The focus is arithmetic expressions and bracket sense, with permission to descend to prerequisites or advance.
- The semantic phases are `EXPLORE`, `DIAGNOSE`, and `CONFIRM`. The models may move between them.
- One wrong answer is not a stable weakness, and one correct answer is not mastery.
- Alternative explanations include slips, transcription, guessing, engagement, language or interface barriers, lack of opportunity to learn, and ambiguous items.
- The diagnostic does not teach or hint before it exits.
- A narrow deterministic arithmetic referee establishes the correct numeric answer before either model's educational interpretation is accepted. It does not decide what the error means or what to ask next.
- A selected next question must add information rather than repeat an expression or continue the same structure indefinitely. If needed, the Primary revises the proposed item; unresolved repetition ends with an uncertain report.
- The hard operational limit is 20 minutes or 16 answered questions. The application ends with the best available report even if a model tries to continue.
- Unresolved model disagreement must lead to a discriminating question or an uncertain result; consensus is never forced.
- An observer may replace a low-value current question or end immediately with the best available report.

## Local setup

Add these server-side values to the repository `.env`:

```text
OPENAI_API_KEY=...
LOTUS_EXPERIMENTAL_ENABLED=true
LOTUS_OPENAI_MODEL=gpt-5.6-terra
LOTUS_CHALLENGER_MODEL=gpt-5.6-sol
```

Both agents reuse `OPENAI_API_KEY`, but their first assessments run as separate calls with separate contexts and roles. The Primary uses medium reasoning effort; the stronger Challenger uses high reasoning effort and makes the final audit decision. Model names are configuration, not product policy, and API keys never enter the web bundle.

Start the normal API and web applications, sign in as the demo student, and choose **Open Lotus observer demo**. The direct route is `/student/lotus?observer=1`.

## Deliberate limitations

- Sessions are held in API memory and disappear on API restart.
- The arithmetic referee supports basic numeric expressions only; it is not a symbolic algebra grader. There is no question bank, BKT, IRT, or deterministic diagnostic path.
- Model JSON is checked only for the minimum operational fields. A malformed or unavailable model fails visibly.
- The four-call sequence prioritizes observability over latency or cost.
- Lotus results are not persisted into the canonical learner model or teacher report.

These limits make the first experiment answerable: can the two models generate a useful evidence trail and find a teachable gap? Verification, persistence, evaluation gates, and production policy come after observing real performance.
