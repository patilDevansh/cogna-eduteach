-- Everything Kiara says in the Squares and square roots module, as it reads on screen.
-- Not recorded yet: with no AudioAsset v_<key> in scene.rml a line shows as a caption only.
-- rive-area-module/tools/record-voice.mjs records lines like these (it spells out × and ² for the voice).
local lines: { [string]: string } = {
    -- module
    home = 'Welcome to Squares and square roots! Three short lessons, and you will build every idea with your own hands. Pick lesson one to start.',
    complete = 'Lesson complete! Brilliant work.',

    -- 1 · square numbers
    l1s1 = 'This is one tile. Drag the gold corner to grow a square, and watch how many tiles it takes each time.',
    l1s1done = '1, 4, 9, 16, 25, 36. These are the square numbers: a number times itself. We write 6 × 6 as 6².',
    l1s2 = 'Not every number of tiles can make a square. Here are three piles: 12, 16 and 20. Pick one and try to build a square with it.',
    l1s2n12 = '12 tiles fill a 3 by 3 square, with 3 left over. That is not enough for the next square, so 12 is not a square number.',
    l1s2n20 = '20 tiles fill a 4 by 4 square, with 4 left over. 20 is not a square number either.',
    l1s2done = '16 tiles make a 4 by 4 square, with none left over. 16 is a square number: 4 × 4.',
    l1s3 = 'Your turn. This square is 7 tiles along each side. What is 7²?',
    l1n14 = "That's 7 + 7. Squaring means 7 × 7: seven rows of seven.",
    l1nx = '7² means 7 × 7. Count seven rows of seven.',
    l1s3done = '49! 7² = 7 × 7 = 49.',

    -- 2 · odd numbers build squares
    l2s1 = 'Start with one tile. To make the next square, you wrap a border round two of its sides. Tap the gold border, and count the tiles each time.',
    l2s1done = '1 + 3 + 5 + 7 + 9 = 25. Each border is the next odd number, and five of them make 5 × 5.',
    l2s2 = 'Why is the border always an odd number? Here is a 4 by 4 square. Drag the three gold pieces on, to make it 5 by 5.',
    l2s2miss = 'Not there. Each gold piece has its own gap along the edge of the square.',
    l2s2done = 'A strip of 4 down the side, a strip of 4 along the bottom, and 1 for the corner. Two equal strips and one more: that is always an odd number.',
    l2s3 = 'Your turn. What is 1 + 3 + 5 + 7 + 9 + 11? You do not need to add them one by one.',
    l2n12 = "That's 6 × 2. Six borders build a 6 by 6 square, so it is 6 × 6.",
    l2nx = 'Count the odd numbers: there are six of them. Six borders make a 6 by 6 square.',
    l2s3done = '36! The first six odd numbers add up to 6 × 6. The first ten would add up to 10 × 10.',

    -- 3 · square roots
    l3s1 = 'Here are 36 tiles in three long rows. Drag the gold handle to change how wide the rows are. Can you make a perfect square?',
    l3s1done = 'Six rows of six. The side is 6, so the square root of 36 is 6. Look at how we write it.',
    l3s2 = 'Now there are 40 tiles. Drag the gold corner to try different squares. Try a side of 6, then a side of 7.',
    l3s2six = 'A side of 6 uses 36 tiles, and 4 are left over. Too small. Now try a side of 7.',
    l3s2seven = 'A side of 7 needs 49 tiles, and we are 9 short. Too big. Now try a side of 6.',
    l3s2done = 'A side of 6 leaves 4 over. A side of 7 is 9 short. 40 is stuck between 36 and 49, so its square root is between 6 and 7.',
    l3s3 = 'Your turn. This square garden covers 81 square metres. How long is each side?',
    l3n40 = "That's about half of 81. Halving is not the same as finding the side. Which number times itself makes 81?",
    l3nx = 'Which number times itself makes 81? 8 × 8 is 64, so try a little bigger.',
    l3s3done = "9! Because 9 × 9 = 81, the square root of 81 is 9. You've finished all three lessons!",
}

return lines
