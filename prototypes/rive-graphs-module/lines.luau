-- Everything Kiara says in the Introduction to graphs module, as it reads on screen.
-- Not recorded yet: with no AudioAsset v_<key> in scene.rml a line shows as a caption only.
-- rive-area-module/tools/record-voice.mjs records lines like these.
local lines: { [string]: string } = {
    -- module
    home = 'Welcome to Introduction to graphs! Three short lessons, and every graph here is one you can fly over, climb and ride. Pick lesson one to start.',
    complete = 'Lesson complete! Brilliant work.',

    -- 1 · coordinates
    l1s1 = 'This drone hovers over a city built on a grid. Drag it to a crossing. Its route goes across first, then up, and the two numbers say exactly where it is.',
    l1s1done = 'Look! Turned to face you, the city is a graph. Every point on a graph is just a place: so far across, then so far up.',
    l1s2 = 'Time for deliveries. Fly the drone to P, at 4, 2. Remember: across first, then up.',
    l1s2p = 'Delivered! Now Q, at 2, 6. Two across, six up.',
    l1s2swap = 'Careful, that is 2, 4. You went up first. The first number is always across. Watch: 4 across, then 2 up.',
    l1s2swapq = 'That is 6, 2. You swapped the numbers. Q is 2 across, then 6 up.',
    l1s2x = 'Not that crossing. Watch the route: across first, then up.',
    l1s2done = 'Both delivered! The first number is across, along the x-axis. The second is up, along the y-axis.',
    l1s3 = 'Your turn. Put R at 0, 5. What does a zero across mean?',
    l1n50 = 'That is 5, 0: five across and nothing up, so it sits on the x-axis. R is 0 across and 5 up: it never leaves the y-axis.',
    l1nx = 'Not quite. Zero across means you do not move across at all. Then go 5 up.',
    l1s3done = 'Yes! 0 across, 5 up: R sits right on the y-axis. A zero first means the y-axis; a zero second means the x-axis.',

    -- 2 · reading a line graph
    l2s1 = 'This is a day in Pune, as a temperature graph you can stand on. Drag the sun across the sky and read the temperature it lands on. Find the temperature at 12 noon.',
    l2s1done = '12 noon, 28 degrees. Go up from the time to the line, then across to the temperature axis.',
    l2s2 = 'Now the hiker. In which three hours did it warm up fastest? Tap that part of the ridge.',
    l2n15 = 'That part is the highest, but the hiker walks downhill there: it cooled by 2 degrees. Fastest warming is the steepest climb, not the highest point.',
    l2n6 = 'Up 4 degrees in those three hours. A good climb, but there is a steeper one.',
    l2s2done = 'Yes! 9 to 12 is the steepest climb: up 6 degrees in three hours. Steeper means changing faster.',
    l2s3 = 'Your turn. How many degrees warmer was it at 12 noon than at 6 am?',
    l2n28 = 'That is the temperature at 12 noon. The question asks how much it changed: from 18 up to 28.',
    l2n18 = 'That is the temperature at 6 am. How much did it climb from there to 12 noon?',
    l2nx = 'Read both temperatures, then find the difference: 28 take away 18.',
    l2s3done = '10 degrees! 28 take away 18. A change is the difference between two readings.',

    -- 3 · distance and time
    l3s1 = 'Meet Arjun on his scooter. His road runs up the distance axis. Press and hold to ride, let go to stop, and watch the graph draw itself. Make a graph with a stop in it.',
    l3s1flat = 'See the flat part? The clock kept going but the distance did not change. Flat means standing still.',
    l3s1again = 'That ride never stopped. Try again, and let go for a while in the middle.',
    l3s1still = 'You never moved! Hold to ride, then let go for a stop.',
    l3s1done = 'A flat part means he stopped: time goes on, distance stays the same. A steeper part means he rode faster.',
    l3s2 = 'Riya cycles slowly up a hill, then fast down the other side. Which graph is hers? Tap one to play it.',
    l3nhill = 'Watch Riya: this graph says she rode back towards home! A distance graph shows how far she has gone, not the shape of the hill.',
    l3nfast = 'This one starts steep, so she would start fast. But going uphill is the slow part.',
    l3s2done = 'That is her ride: gentle while she climbs slowly, then steep when she races down. The graph never goes down, because she never turns back.',
    l3s3 = 'Your turn. A car goes 150 kilometres in 3 hours at a steady speed. How far does it go in 1 hour?',
    l3n150 = 'That is the whole trip, in 3 hours. Split it into 3 equal hours.',
    l3n450 = 'That multiplies. The car shares 150 kilometres over 3 hours: divide.',
    l3nx = 'Look at the steps on the line: 3 equal hours share 150 kilometres.',
    l3s3done = '50 kilometres in each hour: 50 kilometres per hour. Distance divided by time gives the speed.',
}

return lines
