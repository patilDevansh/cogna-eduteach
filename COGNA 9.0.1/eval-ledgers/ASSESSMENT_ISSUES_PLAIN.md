# What’s going wrong when we assess the student

Plain story: we check each line of maths correctly (that part is fine). The broken part is how we **interpret and narrate** what the student knows — especially the “Why this next question” AI text, and sometimes when we show a hint.

---

## The three real assessment mistakes

### 1. Inventing failure after success

**What the student actually did:**  
They got every line right on the hard bracket question — expand, simplify, finish the equation. Clean work. No slips.

**What the system told itself / showed:**  
The “Why this next question” text said they have **many wrong answers** (or “moderate errors”), then used that made-up history to justify the next item.

**Why that hurts assessment:**  
We invent a gap that isn’t there. The next story sounds like remediation for someone who failed, not a fair check after success. Anyone reading the trail thinks the student struggled when they didn’t.

**Example from the eval data:** After a perfect run of the main negative-distribution equation (four correct lines), the Why text claimed “many wrong answers” and moved to a focused expand question. (Seen in the critical trails around mix_014.)

---

### 2. Calling something a “gap” before it was even tested

**What the student actually did:**  
They finished the warm-up two-step equation (`3x + 5 = 20` → answer) perfectly. They had not yet seen a negative-distribution / brackets question in this session.

**What the system told itself / showed:**  
It said the student shows a **likely gap** in distributing negatives — sometimes even with “many wrong answers” — and used that as the reason to open the brackets question.

**Why that hurts assessment:**  
A “gap” means we saw them fail at something. Here we only saw success on a different skill. Treating “we haven’t tested this yet” as “they can’t do it” poisons the student model from the first hop. Probing the skill is fine; calling it a gap is not.

**Example from the eval data:** Right after a perfect warm-up (zero wrongs in the whole session so far), Why said they have a likely gap in distributing negatives “with many wrong answers,” then served the main brackets equation. (Seen early in mix_015 and in many other entry→main hops across the 100 runs.)

---

### 3. Giving a teaching hint after a correct answer; claiming “after teaching” when there was no teaching

**What the student actually did (hint case):**  
On the short expand question (`-3(y - 4)`), they expanded correctly in one shot (e.g. got the positive product right).

**What the system showed:**  
It still offered a teaching hint about multiplying signs — the kind of prompt you’d give after a mistake.

**Why that hurts assessment:**  
Hints after success teach the student (and our logs) that something was wrong when nothing was. It also muddies whether later success came from understanding or from unsolicited coaching.

**What the student actually did (“after teaching” case):**  
They either finished the main question perfectly with no teaching, or only got light help after saying “I don’t know” — not a real taught lesson.

**What the system told itself:**  
Why text said the next question would check learning **after teaching** / **after instruction**.

**Why that hurts assessment:**  
We claim a teaching event that didn’t happen. Transfer then looks like “we taught them, now we’re checking” when we only probed or offered a tip after a decline.

**Examples from the eval data:** Correct one-shot expand still got a sign-product hint (mix_003 pattern; same assist-on-correct pattern showed up dozens of times on that expand item). Separate runs claimed transfer would assess learning “after teaching/instruction” after a perfect main with no failures, or after declines alone (e.g. mix_007 / mix_011 style wording).

---

## What *is* working

- When the student really multiplies two negatives wrong (e.g. treats `(-4)×(-2)` as `-8`), the checker catches it and names the sign product clearly. That diagnosis is trustworthy.
- When they type a bare number like `1` or `-2` instead of a full next line / `x = …`, we treat that as a **format / how to write the step** issue — not as “they can’t distribute.” That distinction is right.

---

## What “good assessment” would look like instead

- Only call something a **gap** after we see a real wrong step (or a clear “I don’t know”) on that skill — never after clean success or before the skill was shown.
- “Why this next question” must match the trail: if every line was valid, say we’re confirming, probing, or moving on — never invent “moderate errors” or “many wrong answers.”
- Save teaching hints for wrong or stuck answers; a correct expand should get credit, not a lecture.
- Only say “after teaching” when we actually taught; otherwise say we’re still assessing or checking despite incomplete practice.
- Keep doing what already works: honest catch of real sign mistakes, and don’t blame distribution when the student only wrote the answer in the wrong form.
