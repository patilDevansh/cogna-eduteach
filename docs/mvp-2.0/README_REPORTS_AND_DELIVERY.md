# MVP 2.0 — Reports and Delivery

> Reports translate evidence into trusted language. They must be accurate, cautious, and useful.

## Report Types

| Report | Audience | Trigger |
|---|---|---|
| Session summary | Student | session end |
| Session summary | Parent | session end |
| Weekly learning insight | Parent | weekly job or parent request |
| Internal diagnostic report | Admin/dev | session end or request |
| Revision plan | Student/parent | daily or weekly planning |

## Weekly Parent Report Sections

1. Practice completed
2. Concepts worked on
3. Improvements observed
4. Patterns being checked
5. Revision plan for next week
6. How parent can help
7. Uncertainty / still gathering evidence

## Language Rules

Use:

- "A pattern we are checking..."
- "Evidence suggests..."
- "Still gathering evidence..."
- "Next short practice..."

Avoid:

- "diagnosed"
- "weak student"
- "attention issue"
- "learning style"
- "will definitely"

## Structured Data

```ts
interface WeeklyReportData {
  studentId: string;
  periodStart: string;
  periodEnd: string;
  sessionsCompleted: number;
  questionsAttempted: number;
  accuracy: number;
  conceptsPracticed: string[];
  masteryChanges: Array<{ conceptId: string; from: number; to: number; confidence: number }>;
  activePatterns: Array<{ misconceptionId: string; confidence: number; uncertainty: string }>;
  revisionPlan: Array<{ conceptId: string; reason: string; questionCount: number }>;
  parentActions: string[];
}
```

## Delivery

Delivery creates `report_delivery` records:

```text
PENDING -> SENT
PENDING -> FAILED -> RETRYING -> SENT
```

Email failure must not block in-app report viewing.

## Parent Requested Report

Parents may request latest report:

```text
POST /students/:id/reports/weekly
```

If a report for the current period already exists, return existing unless `force=true` and user has admin/dev permission.

## Tests

- `W01` weekly report includes session evidence
- `W02` weak evidence appears as uncertainty
- `W03` email failure stores retry state
- `W04` report not generated on answer hot path
- `W05` parent cannot view unlinked student report
