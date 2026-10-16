# MVP 10.0 amendment: the parent dashboard

**Status:** Draft. Product owner decisions of 2026-10-12. Built: due dates, work summary, home page, parent email invite. Not built: reminders, WhatsApp, teacher due-date picker.
**Why:** a parent's first question is "has my child done the work?", and only then "where are they stuck?". The dashboard answers those, in that order, and warns before a deadline is missed — first to the child, then to the parent.

## What a parent gets, in order

1. **Is the work done?** Everything done, something pending, or something overdue.
2. **What's next, how long, and by when.** The one task due soonest, an honest time estimate, and its due date.
3. **Where exactly they struggle.** The precise step, in plain words (from the diagnostic starting point), and whether the final check showed it fixed.

Everything else (topic progress, history, skill lists, weekly letter) is one tap away, never on the home page.

**Never shown:** marks or percentages from adaptive checks, rank or comparison with classmates, time-on-app charts, minute-by-minute activity.

## Task states a parent sees

One task is one class check for one student (first check → lesson → final check, or a catch-up). Built from its steps' `ClassroomAssignment.status`, `startedAt`, `completedAt` and the check's `ClassroomRun.dueAt` (`apps/api/src/classrooms/parent-work.ts`).

| Parent sees | Rule |
|---|---|
| **Done** | `COMPLETE`, or `SKIPPED` (nothing needed fixing). A skip never counts as missed work. |
| **Not started** | `READY`, no `startedAt`, not past `dueAt` |
| **Started, not finished** | `IN_PROGRESS`, not past `dueAt` |
| **Overdue** | not done and past `dueAt` |
| **Not finished** | the teacher ended the check before the child finished (a cancelled check doesn't count) |
| *(hidden)* | `WAITING` (not open yet). `FAILED` shows as "the teacher will restart this", never as the child's fault. |

**Headline:** "All done" or "1 task due Thursday" or "1 task overdue". Under it: "7 of 8 done this month, 6 on time".

## What's next

- Only the open task with the earliest `dueAt` is shown, with the others behind a tap.
- **Time estimate**, always "about N min":
  - First check: up to 15 min (it stops early at the starting point).
  - Lesson: the video length plus about 3 min of practice.
  - Final check: about 5 min.
  - Once 5 or more classmates have finished the same task, use the median of their `completedAt − startedAt` instead.
- A started task shows the time left ("about 5 min left") when progress is known.

## Due dates

- Nullable `dueAt` on `ClassroomRun`, set when the check launches: **2 days** by default, or `dueDays` (1–30) sent when starting a check. The teacher UI for picking it is not built yet.
- A task with no `dueAt` shows no deadline and sends no deadline reminders.
- The teacher roster gains an "overdue" filter from the same field.

## Reminders: the child first, then the parent

| When (IST) | Who | Channel | Condition |
|---|---|---|---|
| 24 h before `dueAt` | Student | In-app banner on student home | not done |
| Due day, 4 pm | Parent | WhatsApp and email | still not done |
| Day after due, 10 am | Parent | In-app only ("overdue, can still be done") | still not done |

- At most **one student reminder and one parent message per assignment**. Deduplicated the same way as `ParentNotification.dedupeKey`.
- No messages between 9 pm and 8 am.
- The tone is calm and blame-free: "Aarav's final check is due today and takes about 5 min." It never says "Aarav failed to …".
- Messages carry only the child's first name, the task, the time estimate and a link. **What the child struggles with stays in the app**, never in WhatsApp or email text.

## How a parent gets connected

1. When a student joins a class with the class code, they can type a parent's email (optional; asked only while no family has linked them).
2. Cogna emails that parent from cogna.eduteach@gmail.com: the child's first name, the class and teacher, a link and a one-time code (30 days). The link carries the code after `#`, so it never reaches a server log. This replaces any earlier code, including the one on a school slip.
3. The parent opens the link, signs in or signs up, and lands on the claim form with the code filled in. Claiming is consent, as before.
4. Limits: one invite per 2 minutes and 3 a day per student. The student sees the address masked (`pr•••@gmail.com`). If mail isn't configured in production, the slip's code is left working and nothing is sent.

Risk: a mistyped address sends the code to a stranger, who could link the child. The masked address helps the student spot typos; the teacher roster should also show it (not built).

## Channels

| Channel | Today | Needed |
|---|---|---|
| In-app | `ParentNotification` exists (check finished, catch-up set) | New kinds: `DUE_SOON`, `OVERDUE` |
| Email | SMTP via nodemailer (`apps/api/src/mail/mail.service.ts`); pilot uses Gmail | `SMTP_USER` / `SMTP_PASS` set per environment |
| WhatsApp | Nothing | WhatsApp Business API provider, pre-approved message templates, a parent phone number (`Parent` has no phone field today) and explicit opt-in recorded with the parent link (DPDP consent for minors' data) |

## Home page, top to bottom

1. Child switcher (a dot on a child with something due or overdue).
2. **Work card:** completion headline, the next task with its time estimate and due date, and the month's done count.
3. **Struggle card:** "What we found / what was done / did it work?" for the most recent check.
4. One thing to try at home (only when there is a confirmed gap).
5. From school: latest updates.
6. "See all of Aarav's maths" → topics, history, weekly letter.

## Open decisions

- **Late joiners:** do they get the class due date, or 2 days from when they joined?
- **Can a teacher extend a deadline** for one student, and does the parent see that?
- **Does a parent's "we tried it" tap** reach the teacher?
- **Message language:** English only for the pilot, or Hindi and regional templates from the start? (WhatsApp templates need approval per language.)
