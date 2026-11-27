# Axel v2 — ChatGPT prompts (style B: semi-realistic painting)

Chosen on 2026-11-23: style **B** from the realism ladder (teen axolotl, green hoodie with π, backpack). The earlier flat, chunky version was rejected as too kiddish.

How to use
- Stay in the **same ChatGPT chat** that made the A/B/C image.
- Run the prompts in order. From prompt 2 onward, **attach `axel-approved.png`** (the result of prompt 1) to every message.
- Save every result as PNG into `apps/web/rive/mascots/axel-v2/source/`.
- If a result drifts (different face, different hoodie, cartoon look), reply: "Match the attached reference exactly: same face, same proportions, same painting style. Change only what I asked for."
- If the background is not transparent, reply: "Same image on a fully transparent background, no ground shadow."

---

## 1. Approved reference

```text
Give me only character B from the image above, alone and centred, full body, exactly as painted: same face, same gills, same hoodie with the π symbol, same backpack, same painting style and lighting. Remove the book. Remove the letter label. Fully transparent background, no ground shadow. Tall 2:3 image, character fills about 85% of the height.
```

Save as `axel-approved.png`. Check it before going on: this image defines Axel.

## 2. Rig pose

```text
Using the attached character exactly (same face, same proportions, same hoodie, same semi-realistic digital painting style, same soft lighting from the upper left), paint Axel in a neutral rig pose:

- Same three-quarter view and same head angle as the reference.
- Standing upright and relaxed, weight on both legs, legs slightly apart.
- Both arms out of the pockets, held slightly away from the body and hanging down, hands open and relaxed with all fingers visible. Nothing in his hands.
- Tail fully visible to one side, not hidden behind the legs.
- All six gills fully visible and spread, none overlapping each other.
- Backpack on, both straps visible.
- Eyes open, looking at the viewer. Mouth closed in his calm subtle smile.

Fully transparent background, no ground shadow. Tall 2:3 image, character fills about 85% of the height.
```

## 3. Parts sheet

```text
Using the attached character exactly (same painting style, same lighting, same colours), paint an exploded parts sheet of Axel in the same three-quarter view. Every part is painted separately with clear empty space around it, nothing touching or overlapping:

- Head with face, without gills
- Six gills, each separate (three left, three right), each complete down to its base
- Hoodie torso with the π symbol, pocket and drawstrings, without sleeves and without the hood
- The hood, as it sits behind the neck
- Left sleeve with hand, right sleeve with hand (hands open, fingers visible)
- Left leg, right leg
- Tail with fin
- Backpack with straps

Important: paint each part COMPLETE, including the area normally hidden where it joins or sits behind another part. For example the top of each sleeve continues as a full rounded shoulder, the top of each leg continues up under the hoodie, and the neck continues down into the collar.

Keep every part the same size it has on the assembled character. Fully transparent background, no shadows between parts. Wide 3:2 image, parts in a tidy grid.
```

## 3b. Lower body (missing from the first parts sheet)

```text
Using the attached character exactly (same painting style, same lighting, same colours, same three-quarter view, same size as the parts sheet you made), paint three more separate parts with clear empty space between them, nothing touching:

1. Hips and belly: his bare pink lower body from just above the hoodie hem down to the tops of the legs, with the pale belly. Painted complete: a full rounded shape at the top (it sits under the hoodie) and full rounded sockets where the legs and the tail attach. No hoodie, no legs, no tail.
2. Left leg, complete from the hip joint to the toes: thigh, knee, shin and foot, with a full rounded top.
3. Right leg, complete from the hip joint to the toes, with a full rounded top.

Fully transparent background, no shadows. Wide 3:2 image.
```

## 4. Eye sheet

```text
Using the attached character exactly, paint six copies of Axel's head (head and gills only, no body) in a tidy 3 by 2 grid. Every copy must be identical: same angle, same size, same lighting, same gills, same closed subtle smile. ONLY the eyes and eyelids change:

1. Open, looking at the viewer
2. Looking up and to the side (thinking)
3. Half-lidded, relaxed and wry
4. Wide open, bright highlights (surprise, "aha")
5. Happy squint, lower lids pushed up by a smile
6. Fully closed (blink)

Keep his small dark realistic eyes: do not enlarge them or make them cartoon eyes. Fully transparent background. Wide 3:2 image.
```

## 5. Mouth sheet (expressions and talking)

```text
Using the attached character exactly, paint ten copies of Axel's head (head and gills only, no body) in a tidy grid of 5 by 2. Every copy must be identical: same angle, same size, same lighting, same gills, same open eyes looking at the viewer. ONLY the mouth and lower jaw change:

Row 1, expressions:
1. Closed, calm subtle smile
2. Broad closed smile
3. Open happy smile
4. Slight frown, mouth pressed flat
5. Unsure, mouth pulled to one side

Row 2, talking:
6. Lips together, neutral
7. Slightly open
8. Wide open ("ah")
9. Rounded ("oh")
10. Stretched wide and narrow ("ee")

Open mouths show a soft dark pink inside and a simple tongue, no teeth. Keep it natural and subtle, not cartoonish. Fully transparent background. Wide 3:2 image.
```

## 6. Mood poses (reference only, I animate towards these)

```text
Using the attached character exactly (same face, same hoodie, same painting style and lighting), paint Axel in five full-body poses side by side:

1. Neutral: standing relaxed, calm smile
2. Thinking: one hand on his chin, eyes looking up and to the side
3. Stuck: shoulders slightly dropped, gills drooping, mouth pressed flat, scratching the back of his head
4. Aha: one finger raised, eyes wide and bright, gills perked up
5. Celebrating: one fist raised in a confident small cheer, broad smile. Cool and understated, not jumping.

Plain light grey background. Very wide image.
```

---

After the art is approved: I cut sheets 2–5 into transparent layers and rig them in Rive with bones and meshes. No vector conversion, so Recraft is not needed for this style.

## 7. Body without arms (for what the arms hide)

Attach `rig-pose` (the result of prompt 2), not the approved reference.

```text
Edit the attached image. Remove both arms completely: both sleeves, both forearms and both hands. Paint what was hidden behind them: the side of the hoodie with an empty armhole seam at each shoulder, the whole backpack and its strap, the hips and the top of the tail.

Change nothing else. The head, gills, hoodie front, π symbol, cords, legs, tail, pose, size, position, colours, lighting and painting style must stay exactly as they are. Same image size. Fully transparent background, no ground shadow.
```

---

# Whole-body poses (the approach from 2026-11-23)

Axel now moves between complete paintings instead of rotating cut-out limbs. The neutral pose is the
rig pose from prompt 2, so only the five below are new. Prompts 3, 3b and 7 are no longer needed.

How to run these
- Same ChatGPT chat as before. **One prompt per message, one image per prompt.**
- **Attach the rig pose image (the result of prompt 2) to every message.**
- Every pose keeps a plain face (eyes open, calm closed smile). I add the expressions, blinking and
  talking on top, so they work in every pose.
- Save the results as `pose-thinking`, `pose-stuck`, `pose-aha`, `pose-celebrate`, `pose-explain`
  in `apps/web/rive/mascots/axel-v2/source/`.
- If a result changes his size, face, hoodie or legs, reply: "Match the attached image exactly.
  Only the arms and gills may differ, as I described."

The block every prompt shares is already pasted into each one below.

## 8a. Thinking

```text
Edit the attached image to make a new pose of the same character.

Keep exactly as they are: the head (same size, same angle, not tilted or turned), the face (eyes open looking at the viewer, calm closed smile), the hoodie with the π symbol, the backpack, the hips, both legs, both feet and the tail. Same painting style, same lighting, same colours. Same image size, and the character at the same size and in the same place, with his feet exactly where they are now.

Change only this: his right hand (the one on the right of the image) comes up so the fingers rest lightly on his chin, elbow bent. His other arm crosses his body and its hand supports that elbow. Gills as in the attached image.

Fully transparent background, no ground shadow.
```

## 8b. Stuck

```text
Edit the attached image to make a new pose of the same character.

Keep exactly as they are: the head (same size, same angle, not tilted or turned), the face (eyes open looking at the viewer, calm closed smile), the hoodie with the π symbol, the backpack, the hips, both legs, both feet and the tail. Same painting style, same lighting, same colours. Same image size, and the character at the same size and in the same place, with his feet exactly where they are now.

Change only this: his left hand (the one on the left of the image) reaches up and scratches the back of his head, elbow out. His other arm hangs loosely at his side. His shoulders drop a little. All six gills droop downwards, limp.

Fully transparent background, no ground shadow.
```

## 8c. Aha

```text
Edit the attached image to make a new pose of the same character.

Keep exactly as they are: the head (same size, same angle, not tilted or turned), the face (eyes open looking at the viewer, calm closed smile), the hoodie with the π symbol, the backpack, the hips, both legs, both feet and the tail. Same painting style, same lighting, same colours. Same image size, and the character at the same size and in the same place, with his feet exactly where they are now.

Change only this: his right hand (the one on the right of the image) is raised beside his head with the index finger pointing straight up, as if he has just had an idea. His other hand rests on his hip. All six gills are perked up and spread wide.

Fully transparent background, no ground shadow.
```

## 8d. Celebrate

```text
Edit the attached image to make a new pose of the same character.

Keep exactly as they are: the head (same size, same angle, not tilted or turned), the face (eyes open looking at the viewer, calm closed smile), the hoodie with the π symbol, the backpack, the hips, both legs, both feet and the tail. Same painting style, same lighting, same colours. Same image size, and the character at the same size and in the same place, with his feet exactly where they are now.

Change only this: his right arm (the one on the right of the image) is bent with a closed fist raised to shoulder height in a small, confident fist pump. His other arm is bent at his side with a loose fist. Cool and understated, not jumping. All six gills are perked up.

Fully transparent background, no ground shadow.
```

## 8e. Explaining (used while he talks)

```text
Edit the attached image to make a new pose of the same character.

Keep exactly as they are: the head (same size, same angle, not tilted or turned), the face (eyes open looking at the viewer, calm closed smile), the hoodie with the π symbol, the backpack, the hips, both legs, both feet and the tail. Same painting style, same lighting, same colours. Same image size, and the character at the same size and in the same place, with his feet exactly where they are now.

Change only this: his right arm (the one on the right of the image) is bent with the hand held out at chest height, palm up and fingers relaxed, as if he is explaining something or presenting it to the viewer. His other arm hangs loosely at his side. Gills as in the attached image.

Fully transparent background, no ground shadow.
```

## 8f. Neutral (still missing in the new look)

Attach the **explaining** pose (the one with the open hand).

```text
Edit the attached image to make a new pose of the same character.

Keep exactly as they are: the head (same size, same angle, not tilted or turned), the face (eyes open looking at the viewer, calm closed smile), the gills, the hoodie with the π symbol, the backpack, the hips, both legs, both feet and the tail. Same painting style, same lighting, same colours. Same image size, and the character at the same size and in the same place, with his feet exactly where they are now.

Change only this: both arms hang relaxed at his sides, hands open and loose. Nothing else moves.

Real transparent background (a true transparent PNG, not a painted grey-and-white checkerboard), no ground shadow.
```

# Faces for the new look (blinking, expressions, talking)

The poses came out with a slightly different head from the first sheets, so the eye and mouth swaps
need repainting on this head. Three images, three large heads in each.
Attach the **explaining** pose to each message.

## 9a. Eyes

```text
Using the attached character exactly, paint three large copies of his head side by side (head, neck and gills only, no body). Each head fills most of the image height. All three must be identical to the attached image's head: same angle, same size as each other, same lighting, same gills, same calm closed smile. ONLY the eyes and eyelids change:

1. Looking up and to the side (thinking)
2. Half-lidded, relaxed
3. Both eyes fully closed (a blink)

Keep his eyes the same size and style as in the attached image. Real transparent background (a true transparent PNG, not a painted checkerboard). Wide 3:2 image.
```

## 9b. Talking mouths

```text
Using the attached character exactly, paint three large copies of his head side by side (head, neck and gills only, no body). Each head fills most of the image height. All three must be identical to the attached image's head: same angle, same size as each other, same lighting, same gills, same open eyes looking at the viewer. ONLY the mouth and lower jaw change:

1. Mouth slightly open, as if starting a word
2. Mouth wide open ("ah")
3. Mouth rounded and small ("oh")

Open mouths show a soft dark pink inside and a simple tongue, no teeth. Natural and subtle, not cartoonish. Real transparent background (a true transparent PNG, not a painted checkerboard). Wide 3:2 image.
```

## 9c. Expression mouths

```text
Using the attached character exactly, paint three large copies of his head side by side (head, neck and gills only, no body). Each head fills most of the image height. All three must be identical to the attached image's head: same angle, same size as each other, same lighting, same gills, same open eyes looking at the viewer. ONLY the mouth and lower jaw change:

1. Mouth stretched wide and narrow, slightly open ("ee")
2. Mouth pressed flat in a slight frown
3. Open happy smile

Open mouths show a soft dark pink inside and a simple tongue, no teeth. Natural and subtle, not cartoonish. Real transparent background (a true transparent PNG, not a painted checkerboard). Wide 3:2 image.
```

---

# Flat Axel trial (2026-11-23): can he look good in an animatable style?

## 10. Flat style ladder

Attach the **stuck** pose or any pose where one arm hangs down (so his whole body shape is clear).

```text
Redraw the attached character as flat vector art for animation, keeping him recognisably the same: the same teenage proportions (head about one third of his height), the same calm, clever, slightly wry expression, small dark eyes, six gills, green hoodie with a cream π symbol and drawstrings, dark backpack, long tail with a fin, four-fingered hands and feet. He must still appeal to 13 to 15 year olds: cool and confident, not cute, not babyish. Do not enlarge his head or eyes.

Pose: standing relaxed, three-quarter view as in the attached image, both arms hanging loosely at his sides, hands open.

Style rules:
- Clean, confident shapes with smooth curved edges, like a modern tech-brand or sports-team mascot.
- Solid flat colour fills only. No gradients, no texture, no skin spots, no painterly brushwork, no outlines.
- Simplify the gills: each gill is one bold frond shape with about 8 to 10 chunky rounded feather lobes, not hundreds of fine hairs.
- Simplify the tail fin into one clean shape with at most three flat stripes.
- Limited palette: body pink, a paler belly pink, a deeper rose for the gills, hoodie teal, backpack charcoal, cream for the π and cords, dark plum eyes with one white highlight each.

Show the SAME drawing three times side by side, labelled 1, 2, 3, differing only in shading:
1. Pure flat: no shading at all.
2. Flat plus one darker tone per colour, as crisp-edged shadow shapes.
3. Flat plus one darker tone and one lighter tone per colour, as crisp-edged shadow and highlight shapes.

Plain white background. Wide 3:2 image.
```

Tell me the number you like (or "none"). If one works, the next prompts are a rig pose and a parts sheet in that style, then Recraft turns them into vector shapes.

---

# Flat Axel (chosen 2026-11-23: style 1, pure flat) — art for the real rig

Three images. Attach the **flat style ladder** image (the one with 1, 2, 3) to each message.
These are the last art requests before the rig: every part is cut from 11a, so it has to be right.

## 11a. Rig pose

```text
Draw character number 1 from the attached image (the pure flat one, no shading), alone, in exactly that style: same shapes, same colours, same proportions, solid flat fills, no gradients, no outlines, no shading.

This drawing will be cut into parts for animation, so the pose must keep the parts clear of each other:
- Same three-quarter view and same head as in the attached image. Eyes open, calm closed smile.
- Standing upright, legs straight and apart, with clear empty space between the two legs from the feet up to the hips.
- Both arms held out away from the body at about 45 degrees, straight, with clear empty space between each arm and the torso. Hands open, all four fingers of each hand spread apart. The hands must not touch the hips, legs, tail or backpack.
- Tail swept out to one side, touching the body only where it attaches. It must not cross or touch either leg.
- All six gills spread wide like a fan, with clear empty space between every gill. No gill touches another gill.
- Backpack on his back as in the attached image, hoodie with the π symbol and both cords.

Plain pure white background, no ground shadow, no text or label. Tall 2:3 image, the whole character visible with a small margin on every side.
```

## 11b. Eyes

```text
Using character number 1 from the attached image (pure flat, no shading), draw six copies of his head (head, neck and gills only, no body) in a tidy grid of 3 by 2. Every copy must be identical: same angle, same size, same flat colours, same gills, same calm closed smile. ONLY the eyes change:

1. Open, looking at the viewer (as in the attached image)
2. Looking up and to the side (thinking)
3. Half-lidded, relaxed and wry
4. Wide open, with a larger white highlight (surprise)
5. Happy: both eyes closed into upward curves
6. Both eyes fully closed, as flat lines (a blink)

Solid flat fills, no gradients, no outlines, no shading. Plain pure white background. Wide 3:2 image.
```

## 11c. Mouths

```text
Using character number 1 from the attached image (pure flat, no shading), draw twelve copies of his head (head, neck and gills only, no body) in a tidy grid of 4 by 3. Every copy must be identical: same angle, same size, same flat colours, same gills, same open eyes. ONLY the mouth changes:

Row 1, expressions: (1) calm closed smile; (2) broad closed smile; (3) big open happy smile; (4) flat pressed frown.
Row 2: (5) unsure, mouth pulled to one side; (6) small surprised "o"; (7) lips together, neutral; (8) slightly open.
Row 3, speaking: (9) wide open "ah"; (10) rounded "oh"; (11) stretched wide "ee"; (12) lower lip tucked under the top of the mouth, as for "f" or "v".

Open mouths are a dark plum shape with a simple pink tongue, no teeth. Solid flat fills, no gradients, no outlines, no shading. Plain pure white background. Wide 3:2 image.
```
