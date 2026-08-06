# Diagnostic v2 eval ledgers

Ordered session trails for later evaluation. **Store now; evaluate later.**

## Where

| Path | What |
|---|---|
| `COGNA 9.0.1/eval-ledgers/runs/` | One JSON file per mixed session run |
| `COGNA 9.0.1/eval-ledgers/index.json` | Manifest of all runs |

## Format (each run file)

```json
{
  "runId": "…",
  "scenario": "short label for the mix of behaviours",
  "startedAt": "ISO",
  "sessionId": "…",
  "studentId": "…",
  "items": [
    {
      " ord": 1,
      "question": { "itemKey", "equationPrompt", "openingLine", "stageId" },
      "steps": [
        {
          "previousLine",
          "submittedLine",
          "intent": "correct|wrong_sign|wrong_partial|bare_number|gibberish|dont_know|…",
          "outcome": "SUBMITTED|DECLINED",
          "validity",
          "verificationSource",
          "firstInvalidActionDescription",
          "assistanceOffered",
          "assistanceMessage"
        }
      ],
      "nextQuestionWhy": {
        "source": "AI|RULE",
        "reasoning": "…",
        "nextItemKey",
        "nextEquationPrompt",
        "origin"
      }
    }
  ],
  "endedAt": "ISO",
  "sessionStatus": "…"
}
```

Evaluation (later) reads these files only — does not re-run the quiz unless asked.

## Collect more runs

```bash
# API must be up on :3001
node "COGNA 9.0.1/eval-ledgers/collect-mixed-runs.cjs"
```

Optional: `API_URL=… STUDENT_ID=… node …`

## Status

- **Store:** done — **100** varied runs in `index-100.json` (+ earlier 7 exploratory runs).
- **Evaluate:** not started — wait for owner.

### 100-batch collector

```bash
node "COGNA 9.0.1/eval-ledgers/collect-100-runs.cjs"
```

Progress while running: `progress-100.json`. Manifest: `index-100.json`.
