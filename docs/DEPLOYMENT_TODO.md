# Before deployment: to-do

Everything that must be done before Cogna is used at a school with real students. Tick items off as they land.

## 1. Child privacy and consent (blocker)

- [ ] Get a legal review against India's DPDP Act, 2023 (verifiable parental consent for under-18s)
- [ ] Write a privacy policy and terms, and add both pages to the web app
- [ ] Add a parental consent step before a child's data is stored
- [ ] Prepare a data agreement for schools to sign
- [ ] Make "delete my data" remove all of a student's data (today only Lotus data and class removal exist)

## 2. Security

- [x] Remove the prefilled teacher invite code in production (login and signup pages); deployed servers no longer fall back to the public demo invitation
- [ ] Give each school its own invite code, and make codes expire
- [ ] Set a strong `COGNA_SESSION_SECRET` in production, and never set `COGNA_ALLOW_INSECURE_LOCAL_SESSION_SECRET`
- [x] Confirm the "Dev · fake model" switch and the demo logins don't appear in a production build (parent dev signup and demo login now return 404 in production)
- [x] Check `/health` and `/docs` expose nothing in production (both gated)

## 3. AI content safety

- [x] Check Lotus questions for unsafe or inappropriate text before a student sees them (OpenAI moderation on every Lotus call, fails closed)
- [x] Do the same for AI-written lesson scripts and narration, and for the older diagnostic engine's AI replies
- [ ] Decide what a student sees when a check fails: a fallback question or a fixed lesson

## 4. Real AI run (needs credits)

- [ ] Run one diagnostic and one lesson for each of the 12 chapters with the real model
- [ ] Record for each chapter: questions rejected by our checks, wait times, cost per student
- [ ] Set `OPENAI_DAILY_USD_CAP` and `OPENAI_DAILY_CALL_CAP` from those numbers
- [ ] Set the voice service keys (ElevenLabs or Sarvam) and check narration plays

## 5. Content review

- [ ] A maths teacher reviews the 11 drafted chapters in `apps/api/src/lotus/syllabus/`: skills, the order they build on each other, and the planned questions
- [ ] Fix whatever they flag, and rerun `pnpm test:golden`

## 6. Hosting

- [x] Fix the web production build failing type checks on a fresh install (React 18/19 type clash)
- [ ] Never run `pnpm db:seed` against production (it creates the demo accounts)
- [ ] Choose a host for the API and the web app (the `Dockerfile` builds both)
- [ ] Set up a domain with HTTPS
- [ ] Set up a managed PostgreSQL in India, close to the schools
- [ ] Schedule backups, and do one test restore (`scripts/backup-postgres.sh`, `docs/BACKUP_RESTORE.md`)
- [ ] Create a media storage bucket and set `COGNA_MEDIA_STORAGE_BUCKET`
- [ ] Set all production secrets: Clerk keys, session secret, AI keys, `SENTRY_DSN`
- [ ] Set up Sentry alerts so errors reach someone
- [ ] Add a deploy step to CI (`.github/workflows/test-gates.yml` only runs tests)

## 7. Load and devices

- [ ] Simulate 40 students starting a check at once, and measure response and lesson build times
- [ ] Confirm background jobs keep up when everything runs in one API process
- [ ] Test on a cheap Android phone and on a slow, patchy network
- [ ] Do a basic accessibility pass: text size, contrast, keyboard use, screen reader labels

## 8. Demo day

- [ ] Create a clean demo school with seeded data, and remove local test data
- [ ] Write a demo script covering the teacher, student and parent views
- [ ] Rehearse on the school's own network
- [ ] Record a backup walkthrough video in case the network fails

## After the demo, before a full rollout

- [ ] Let parents link to a student the school added
- [ ] Let teachers sign up on their own, with a real password login
- [ ] Send teachers notifications so they don't have to keep checking
- [ ] Add bulk class actions and data export for school systems
