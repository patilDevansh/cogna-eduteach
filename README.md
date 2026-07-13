# Cogna

**AI Cognitive Learning Engine**

---

## Implementation Mandate

> **You are not designing this product. You are implementing the product vision exactly as specified.**

Cursor is an implementation agent. Whenever a decision is ambiguous, prefer the solution that improves the AI's understanding of the student's learning rather than adding flashy features.

If a feature request, design decision, or architectural choice conflicts with this document, prioritize these principles over adding more features. Challenge assumptions, minimize complexity, and optimize for building the best cognitive learning engine—not the largest edtech platform.

The goal is to build the first version of a company—not a demo.

---

## Product Vision

We are NOT building another AI tutor.

We are NOT building another ChatGPT wrapper.

We are NOT building another video learning platform.

We are building an AI Cognitive Learning Engine.

The AI should continuously build an increasingly accurate understanding of how every individual student learns.

The product is not trying to answer questions. The product is trying to understand the learner.

Every interaction should improve the student's cognitive profile.

Think of YouTube's recommendation algorithm. Every click improves the recommendation model. Our platform should do the same for learning. Every answer, hesitation, mistake, revision and hint should improve the AI's understanding of the student.

---

## Company Goal

Build the world's most personalized learning companion by understanding every student's cognitive strengths, weaknesses, misconceptions, memory patterns and learning preferences.

Education is only the application. Understanding the learner is the mission.

---

## MVP Goal

Do NOT build a full education platform.

The objective is to validate one hypothesis:

> Can an AI become increasingly better at understanding how an individual student learns through repeated interactions?

Everything in MVP should exist only to answer that question.

---

## Target Audience

| | |
|---|---|
| **Students** | Age 13–15, Grade 8–9, CBSE |
| **Primary Buyer** | Parents |
| **Primary User** | Students |

The app should feel like a personal mentor rather than a school LMS.

---

## Subject & First Topic

**Mathematics** — exposes reasoning better than any other school subject and provides measurable signals for cognitive inference.

**First topic: Linear Equations** (ONLY learning content in MVP)

- Variables
- Expressions
- Constants
- One Variable Equations
- Word Problems
- Simple Real-Life Applications

No other chapters.

---

## Product Principles

The product should:

- Learn continuously
- Adapt continuously
- Never assume
- Improve after every interaction
- Explain every recommendation
- Be transparent
- Build trust

The product should NEVER replace teachers, parents, or school. It should become the student's intelligent learning companion.

---

## Observable Signals

Every question answered by the student should collect these signals. Everything should be stored. Nothing should be discarded.

**Performance:** Correct/Incorrect, Number of Attempts, Question Difficulty, Concept Tested, Accuracy

**Time:** Time to First Response, Total Time, Idle Time

**Behaviour:** Question Skipped, Session Length, Practice Frequency, Learning Streak

**Help:** Hint Requested, Hint Level, Explanation Requested, Number of Hints

**Confidence:** Self-rated Confidence (1–5), Answer Changed Before Submit

**Learning Progress:** Improvement Rate, Revision Performance, Days Since Last Revision

---

## Diagnostic Factors

The AI continuously estimates (all with confidence scores — never pretend certainty):

- Concept Mastery
- Knowledge Gaps
- Misconceptions
- Confidence Calibration
- Memory Retention
- Learning Velocity
- Preferred Explanation Style
- Problem Solving Strategy
- Engagement
- Revision Readiness

**Never infer:** IQ, ADHD, Autism, Depression, Anxiety disorders, Personality, Mental health conditions.

---

## Student Profile

Every student owns a continuously evolving cognitive profile:

- Concept Mastery
- Knowledge Graph
- Misconceptions
- Retention
- Confidence
- Learning Velocity
- Preferred Explanation Style
- Revision Queue
- Engagement
- Last Updated

The profile should improve after every interaction.

---

## Learning Loop

```
Student starts session
        ↓
Question generated
        ↓
Student answers
        ↓
Observable signals captured
        ↓
Diagnostic engine updates student profile
        ↓
Decision engine chooses next action
        ↓
Adaptive question generated
        ↓
Repeat
```

The entire product revolves around this loop.

---

## Decision Engine

After every question, determine whether the next action should be:

- Easier / Harder / Same difficulty question
- Revision
- Prerequisite review
- Visual explanation
- Analogy
- Step-by-step explanation
- Word problem
- Concept reinforcement

The student should never notice the adaptation. It should feel natural.

---

## Student Experience

Calm. Minimal. Modern. No clutter. No overwhelming dashboards.

Every session: 10–15 minutes. Student opens the app and continues exactly where they left off. No searching. No navigation. The AI already knows what should happen next.

**Dashboard shows:** Current Mastery, Today's Progress, Weak Concepts, Revision Queue, Learning Streak, Strengths, Areas Improving. Simple insights. No percentages everywhere. Use visual mastery.

---

## Parent Reports

Weekly Progress, Concepts Mastered, Concepts Forgotten, Revision Completion, Confidence Trends, Strengths, Weaknesses, Suggestions.

Parents should understand everything within one minute. Avoid educational jargon.

---

## MVP Features

- Authentication
- Student Profiles
- Adaptive Question Engine
- Diagnostic Engine
- Student Cognitive Profile
- Student Dashboard
- Parent Report Generator
- Revision Queue
- Progress Tracking
- Analytics

## NOT in MVP

Video Lectures, Gamification, Leaderboards, Teacher/School Dashboard, Marketplace, Voice AI, ChatGPT-style chatbot, Notebook Scanner, AR, VR, Community, Assignments, Multiple Subjects, Competitive Exams, Regional Languages.

---

## AI Architecture

Separate AI into independent modules:

1. Question Generator
2. Diagnostic Engine
3. Decision Engine
4. Explanation Engine
5. Recommendation Engine
6. Report Generator

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, TypeScript, TailwindCSS, React |
| Backend | Node.js, NestJS |
| Database | PostgreSQL, Redis |
| ORM | Prisma |
| Auth | Clerk |
| AI | OpenAI (embedding-ready architecture) |
| Cloud | Vercel, Supabase |
| Object Storage | Cloudflare R2 |
| Analytics | PostHog |
| Monitoring | Sentry |

---

## UI Design

Minimal. Apple-level simplicity. Linear-level cleanliness. Not colorful. Professional. Education should feel premium. Animations should be subtle. Responsive. Mobile-first.

---

## Engineering

Clean architecture. SOLID principles. Proper folder structure. Reusable components. Typed APIs. Validation. Testing. Error boundaries. Logging. Scalable architecture. Avoid technical debt.

---

## Final Goal

Do not optimize for shipping quickly. Optimize for building a company whose cognitive engine becomes more accurate every day.

**The interface is only a window into that engine. The engine is the product.**
