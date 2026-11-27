-- Everything Kiara says, as it reads on screen. tools/record-voice.mjs records each line
-- into voice/<key>.mp3 (and spells out ×, ², ½ and units for the voice), and scene.rml
-- holds an AudioAsset named v_<key> for each one.
local lines: { [string]: string } = {
    -- module
    home = "Welcome to Area! Seven short lessons, and you'll do everything with your own hands. Pick lesson one to start.",
    complete = 'Lesson complete! Brilliant work.',
    spin = 'Now spin the copy with its gold knob, then slide it in to make a parallelogram.',
    wrongway = "It won't fit that way up. Spin it with the gold knob first.",
    notthere = 'Not there. Slide it so the matching slanted edges meet.',
    keepgoing = 'Nice, keep going!',

    -- 1 · counting squares
    l1s1 = 'Area is how much flat space something covers. This floor needs tiles. Drag your finger across the floor to lay them.',
    l1s1done = 'Covered! 24 tiles. So the area of the floor is 24 square units.',
    l1s2 = 'Counting one by one is slow. Tap each row to count it.',
    l1s2done = "6, 12, 18, 24. That's 4 rows of 6, so 6 × 4 = 24. For a rectangle, area is length × breadth.",
    l1s3 = 'Drag the gold corner to make a rectangle with an area of exactly 12. Find two different ways.',
    l1s3one = "That's 12! Now find a different rectangle that is also 12.",
    l1s3same = "You've made that one already. Try a different shape.",
    l1s3done = "Two different rectangles, the same area. Area is about the space inside, not the shape.",

    -- 2 · area or perimeter
    l2s1 = 'The fence goes round the edge. The land is the space inside. Watch them both get counted, then tell me: how much land is there?',
    l2s1wrong = '16 is the fence, the distance round the edge. Land is the squares inside.',
    l2s1done = 'Yes! 15 square metres of land, and 16 metres of fence.',
    l2s2 = 'This farmer has exactly 20 metres of fence. Before you touch it, make a bet. If the fence stays the same, can the land change?',
    l2s2no = "You say it stays the same. Let's test it. Drag the gold corner, and find the biggest field you can make.",
    l2s2yes = "You say it changes. Let's test it. Drag the gold corner, and find the biggest field you can make.",
    l2s2done = 'A 5 by 5 square! 25 square metres. Same fence, but the square holds the most land.',
    l2s2doneno = 'A 5 by 5 square! 25 square metres. The fence never changed, but the land did. The square holds the most.',
    l2s3 = 'Same 20 metres of fence. Now go the other way. Squeeze it into the smallest field you can.',
    l2s3done = 'Only 9 square metres! A moment ago this same fence held 25. The fence never tells you how much land is inside.',
    l2s4 = 'A room is 8 metres long and 3 metres wide. How many one metre square tiles cover the floor?',
    l2s4w22 = '22 is the distance round the edge, like a skirting board. Tiles cover the inside.',
    l2s4w11 = "That's 8 + 3. For area, we multiply.",
    l2s4done = '24 tiles: 8 × 3. Inside is area. Round the edge is perimeter.',

    -- 3 · parallelogram
    l3s1 = "Ramesh uncle's field is wonky. Its slanted edges break the squares. Swipe straight down across it to cut it.",
    l3slant = 'That cut is slanted. Cut straight down, so you make a square corner.',
    l3short = 'Go all the way, from the top edge to the bottom edge.',
    l3s1done = 'Clean cut!',
    l3s2 = 'Now drag the cut-off piece to the other end of the field.',
    l3s2done = "Click! A perfect rectangle. 6 along, 4 up, so 6 × 4 = 24. And we didn't lose any land.",
    l3s3 = 'Grab the gold handle and lean this field. Keep your eye on the land.',
    l3s3done = 'The slanted side keeps changing, but the land stays 18. Only the base and the straight-up height matter.',
    l3s4 = 'Your turn. This field has a base of 7 and a height of 4. Its slanted side is 5. How much land is there?',
    l3n35 = 'That used the slanted side. Use the height, 4.',
    l3n11 = "That's 7 + 4. For land, we multiply.",
    l3nx = 'Base × height. 7 × 4.',
    l3s4done = '28! The area of a parallelogram is base × height.',

    -- 4 · triangle
    l4s1 = 'This field is a triangle. Tap it to make a copy.',
    l4s1done = 'Two triangles make a parallelogram: 6 × 4 = 24. Our triangle is exactly half of it, 12.',
    l4s2 = "Here's something surprising. Drag the top corner along the dotted line, and watch the area.",
    l4s2done = 'Even when the top goes past the end of the base, the area stays 12. Same base, same height, same area.',
    l4s3 = 'Which line is the height of this triangle? Tap it.',
    l4slant = "That's a slanted side. The height drops straight down, like a stone.",
    l4base = "That's the base. The height stands up from it, at a square corner.",
    l4s3done = 'Yes! Straight down, at a square corner. 4 metres.',
    l4s4 = 'Your turn. How much land is in this triangle?',
    l4n40 = "That's the whole parallelogram. Now take half.",
    l4n25 = 'That used the slanted side, 5. Use the height, 4.',
    l4nx = 'Half of base × height. Half of 10 × 4.',
    l4s4done = "20! A triangle's area is half of base × height.",

    -- 5 · trapezium
    l5s1 = "This field has two parallel sides, the top and the bottom. It's a trapezium. Same trick: tap it to make a copy.",
    l5s1done = "Another parallelogram! Its base is our bottom, 5, plus the copy's top, 3. That makes 8.",
    l5s2 = 'The height is 4. How much land is in the whole parallelogram?',
    l5p20 = "That's only the bottom, 5 × 4. The base is 8 now.",
    l5px = 'Base × height. 8 × 4.',
    l5s2done = '32! Our field is exactly half of it, 16. Add the parallel sides, times the height, then take half.',
    l5s3 = 'Now drag the gold handle to stretch or shrink the top.',
    l5tri = "The top has shrunk to nothing. It's a triangle! The same rule still works.",
    l5para = "Top and bottom are equal now. That's a parallelogram!",
    l5s3done = 'One rule covers them all: half of the two parallel sides added, times the height.',
    l5s4 = 'Your turn. Top 4, bottom 8, height 5. How much land is there?',
    l5n60 = "That's the doubled shape. Now take half.",
    l5n40 = "That's only the bottom. Add the top first.",
    l5nx = 'Half of 4 + 8, times 5.',
    l5s4done = "30! You've got the trapezium rule.",

    -- 6 · splitting shapes
    l6s1 = 'This field has an awkward corner. Drag along a grid line to split it into rectangles.',
    l6bad = 'Cut along a grid line, all the way from one edge to the other.',
    l6s1done = 'Two rectangles. Work out each one, then add them.',
    l6s2 = 'Now split it the other way. Do you get the same total?',
    l6s2same = "That's the split you made before. Try the other direction.",
    l6s2done = 'The same total! Any split works, as long as no land is lost or counted twice.',
    l6s3 = "There's a third way. Drag the gold piece into the empty corner to make one big rectangle.",
    l6s3done = 'A big rectangle, 8 × 6 = 48. Take away the piece we added, 12. 48 − 12 = 36.',
    l6s4 = 'Your turn. How much land is in this field?',
    l6nperim = "That's the fence round the edge. We want the squares inside.",
    l6nx = 'Split it into rectangles, work out each one, and add them.',
    l6s4done = 'Spot on!',

    -- 7 · units
    l7s1 = 'This square is one metre on each side, so its area is one square metre. Drag the slider to zoom right in.',
    l7s1done = '100 centimetres along, and 100 rows. 100 × 100 = 10,000. One square metre is 10,000 square centimetres!',
    l7s2 = 'Now drag the gold corner to make the square bigger. Make one with 9 times the area.',
    l7s2two = 'Twice as wide makes four times the area. Keep going!',
    l7s2done = 'Three times as wide, and three times as tall: 9 times the area.',
    l7s3 = 'A tile is one square metre. How many square centimetres is that?',
    l7n100 = "That's only one side, 100 centimetres. Area needs 100 × 100.",
    l7n200 = "That's 100 + 100. Multiply: 100 × 100.",
    l7nx = '100 centimetres along, 100 rows.',
    l7s3done = "10,000! You've finished the whole Area module!",
}

return lines
