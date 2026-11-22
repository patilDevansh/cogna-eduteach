-- Everything Kiara says in the Brackets module, as it reads on screen.
-- Not recorded yet: rive-area-module/tools/record-voice.mjs records each line, and scene.rml then
-- needs an AudioAsset named v_<key> for each one.
local lines: { [string]: string } = {
    -- module
    home = 'Welcome to Brackets! Three short lessons, and you will open every bracket with your own hands. Pick lesson one to start.',
    complete = 'Lesson complete! Brilliant work.',

    -- 1 · one bracket: a(b + c) = ab + ac
    l1s1 = 'This field is 6 squares tall and 14 squares wide. 6 × 14 is awkward to do in your head. Swipe straight down across the field to cut it into two easier pieces.',
    l1slant = 'Cut straight down along a grid line, from the top edge to the bottom edge.',
    l1s1done = 'Two smaller fields, and no land lost. Work out each piece, add them up, and you have 6 × 14. It is 84.',
    l1s2 = 'Now grab the gold knob and slide the cut left and right. Watch the two pieces change, and keep an eye on the total.',
    l1s2keep = 'The pieces change, but the total is always 84. Now leave the cut at 10, the easiest place.',
    l1s2done = '6 × 10 is 60, and 6 × 4 is 24. 60 + 24 = 84. Cutting at 10 turns one hard multiplication into two easy ones.',
    l1s3 = 'Your turn. What is 7 × 12? The field is already cut at 10.',
    l1n70 = "That's only the big piece, 7 × 10. Add the 7 × 2 as well.",
    l1n14 = "That's only the small piece, 7 × 2. Add the big piece, 7 × 10, as well.",
    l1nx = 'Work out 7 × 10, then 7 × 2, and add them.',
    l1s3done = '84! 7 × 12 is 7 × 10 plus 7 × 2. The 7 multiplies every part inside the bracket: a(b + c) = ab + ac.',

    -- 2 · two brackets: (a + b)(c + d)
    l2s1 = 'Here is a bigger field, 13 wide and 12 tall. Cut it at the gold marks: swipe down at 10, then swipe across at 10.',
    l2mark = 'Cut at a gold mark, where the 10 ends.',
    l2s1one = 'Good cut. Now cut the other way, at the other gold mark.',
    l2s1done = 'Four pieces! One big square, two side strips, and a little corner.',
    l2s2 = 'Each piece is an easy multiplication now. Tap each piece to work it out.',
    l2s2done = '100 + 30 + 20 + 6 = 156. So 13 × 12 is 156. Every part of one bracket multiplies every part of the other.',
    l2s3 = 'Your turn. What is 14 × 12? Think of it as 10 + 4, times 10 + 2.',
    l2n108 = "That's only 10 × 10 and 4 × 2. The two side strips count too.",
    l2nx = 'There are four pieces: 10 × 10, 10 × 4, 2 × 10 and 2 × 4. Add all four.',
    l2s3done = '168! 100 + 40 + 20 + 8. Four pieces, because every part multiplies every part.',

    -- 3 · the square of a sum: (a + b)² = a² + 2ab + b²
    l3s1 = 'This square field is 5 by 5, so its area is 25. Drag the gold corner out to make every side 3 longer, and watch what gets added.',
    l3s1done = 'The old square is 25. Then two strips of 5 × 3, and a little 3 × 3 corner. 25 + 15 + 15 + 9 = 64, and 8 × 8 is 64.',
    l3s2 = 'Here is a trap. Lots of people say 5 + 3, all squared, is just 5² + 3². That is 25 + 9, only 34. Drag the two strips into the gaps to see what is missing.',
    l3s2wrong = "That strip doesn't fit there. Try the other gap.",
    l3s2one = 'One strip in, and that is 15 more. Now the other one.',
    l3s2done = '5² + 3² is only 34. The two strips add 15 each, and that makes 64. Never forget the two strips.',
    l3s3 = 'Your turn. What is 10 + 2, all squared?',
    l3n104 = "That's 10² + 2². You forgot the two strips, 10 × 2 each.",
    l3n124 = 'There are two strips, not one. Add another 10 × 2.',
    l3nx = 'Add the big square, the two strips and the little corner.',
    l3s3done = '144! 100 + 20 + 20 + 4. The square of a sum is a² + 2ab + b².',
}

return lines
