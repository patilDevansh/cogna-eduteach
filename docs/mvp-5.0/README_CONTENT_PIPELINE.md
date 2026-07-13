# MVP 5.0 — Content Pipeline

> **Delta from MVP 4.0:** Modality production pipeline alongside text drafts. Generation tools may assist; **student delivery requires APPROVED**.

## Pipelines

### Text (carry)

```text
draft → validate → human review → APPROVED
```

### Modality

```text
script / storyboard draft (human or LLM-assisted)
  -> math claim extraction + validation vs APPROVED solution
  -> media production
  -> human pedagogy + math review
  -> APPROVED modality asset
  -> link retest question
```

## Absolute bans

- Live generative video/voice asserting unchecked math to students
- Modality without transcript/claims review
- Using modality completion alone as mastery proof (require retest evidence)

## Providers

Asset storage (S3/etc.), optional TTS/video tools — all server-side, versioned, kill-switchable.
