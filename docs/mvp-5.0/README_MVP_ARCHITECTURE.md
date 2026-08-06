# MVP 5.0 — Architecture

> **Delta from MVP 4.0:** Multi-agent specialists, modality providers, and a learned policy layer with mandatory safety gate. Still prefer modular monolith + workers; “agentic” means **bounded specialists**, not free-form agents.

## Agentic interpretation

```text
Orchestrator (Learning Loop)
  ├── Diagnostic Agent
  ├── Decision / Policy Agent (rules + optional learned policy)
  ├── Teaching Agent (QG + Explanation + Modality Director)
  ├── Revision Agent
  ├── Parent Communication Agent
  └── Safety Agent (content review, policy eval, deny lists)
```

No specialist calls another without ownership contracts. No specialist calls unconstrained LLM tools on the student hot path.

## Data flow

```text
Event
  -> Diagnostic Agent (multi-subject features)
  -> Profile
  -> Policy Agent
       |-- rules baseline
       |-- learned policy (if promoted + eligible)
  -> Teaching Agent
       |-- text question / explanation
       |-- modality module (animation/video/voice) if intent + APPROVED asset
  -> Outcome events (including modality outcomes)
  -> offline learning dataset (for future policy training)
```

## Modality Director

Selects among APPROVED assets given `learningIntent`, misconception, and modality preference — never generates live unchecked media for math claims.

## Learned policy placement

```text
Offline:
  logs → dataset → train candidate policy → offline eval → safety suite → shadow → experiment → promote

Online default:
  only promoted policyVersion; instant rollback to rules baseline
```

## Anti-scope

- Multi-agent debate loops that delay Tx4 unboundedly
- Student-facing chain-of-thought from foundation models as grading
- Self-modifying prompts without versioning
