-- Lesson 5 · Trapeziums: Kiran's funbox
--
-- A village skatepark in Madhya Pradesh. Kiran Uikey (13) and her crew are building a new funbox, and its side
-- panels are trapeziums: how much plywood does one take? Saroj, the park's carpenter, cuts the panels.
-- (Who they are and why: CAST_AND_STORIES.md in the trail.)
--   1. Kiran rolls in on her skateboard and over the funbox. Then the triangle trick again: tap the side panel for a
--      copy, spin it, slide it in. The parallelogram's base is the bottom plus the copy's top, 5 + 3 = 8
--   2. work out the whole strip on the keypad (32); then the copy lifts off and the sign counts down to 16
--   3. stretch the flat top with a gold handle: shrink it to nothing (a triangle), or to 5 (a parallelogram)
--   4. keypad: top 4, bottom 8, height 5 -> 30 (60 forgot the half; 40 used only the bottom)
-- Evidence for the trail: 'l5s2' and 'l5s4' (the keypads), every answer.

local kit = require('kit')
local people = require('people')
type G = kit.G
type Keypad = kit.Keypad
type Person = people.Person

local L = {}

-- Everything said in this lesson (main.luau merges these into the shared lines).
L.lines = {
    l5s1 = "Kiran's crew is building a new funbox, and its side panels are trapeziums. Tap a side panel to cut a second one.",
    l5spin = 'Use the gold knob to turn the new panel upside down. Then fit it snugly against the first.',
    l5wrongway = "Upside down, remember! Spin it with the knob before you slide it in.",
    l5notthere = 'Close. Push it in until the two slanted edges touch.',
    l5s1done = "One strip, a parallelogram! Follow its bottom edge: one panel's bottom, then the other panel's top.",
    l5s2 = 'Now work out the plywood in the whole strip, using its base and its height.',
    l5p20 = "Only one panel's bottom went in there. The strip's base takes in the copy's top as well.",
    l5p16 = "You've found one panel, which is half the strip. First, the whole strip.",
    l5px = "A parallelogram is base times height. Look at the strip's base.",
    l5s2done = 'Spot on. One panel is half the strip: add the parallel sides, times the height, then halve.',
    l5s3 = 'Kiran wants to try a longer flat top, and a shorter one. Drag the gold handle to stretch or shrink it.',
    l5tri = "No flat top at all, so it's a triangle. The same rule still works, with a top of zero.",
    l5para = 'Top as long as the bottom: a parallelogram. The rule holds for that too.',
    l5s3done = 'Triangle, trapezium or parallelogram: one rule covers every one of them.',
    l5s4 = 'Kiran has sketched a bigger funbox. How many square metres of plywood does one side panel need?',
    l5n60 = 'Both panels at once: the whole strip. One panel needs only half.',
    l5n40 = 'The bottom times the height leaves out the top. Add the top to the bottom first.',
    l5n20 = 'Just the top times the height? Both parallel sides go in, added together.',
    l5nx = 'Which two sides are parallel? Add them, multiply by the height, and remember the half.',
    l5s4done = 'Brilliant! Saroj can cut the plywood, and the crew gets its new funbox.',
}

-- The skatepark: colours ----------------------------------------------------------------------

local OUT = Color.rgb(74, 44, 18) -- the outline brown the people are drawn with
local SKY_HI = Color.rgb(172, 214, 238)
local SKY_LO = Color.rgb(230, 242, 236)
local LEAF = Color.rgb(104, 164, 96)
local LEAF_DK = Color.rgb(74, 134, 78)
local WALL = Color.rgb(236, 228, 210)
local WALL_CAP = Color.rgb(206, 198, 182)
local CONCRETE = Color.rgb(204, 204, 196)
local CONCRETE_LO = Color.rgb(226, 226, 218)
local JOINT = Color.rgb(176, 176, 168)
local M_CORAL = Color.rgb(232, 106, 82)
local M_TEAL = Color.rgb(36, 150, 146)
local M_PURPLE = Color.rgb(124, 90, 178)
local M_BLUE = Color.rgb(64, 120, 200)
local M_PINK = Color.rgb(236, 140, 170)
local TYRE = Color.rgb(52, 54, 60)
-- the plywood
local PLY = Color.rgb(226, 186, 128)
local PLY_HI = Color.rgb(244, 214, 166)
local PLY_COPY = Color.rgb(238, 208, 158)
local PLY_COPY_HI = Color.rgb(252, 232, 196)
local PLY_EDGE = Color.rgb(176, 126, 74)
local PLY_GRAIN = Color.rgb(190, 142, 88)
local PENCIL = Color.rgb(110, 78, 50)
-- the skateboard
local DECK = Color.rgb(34, 146, 150)
local GRIP = Color.rgb(48, 52, 58)
local METAL = Color.rgb(168, 174, 182)
local WHEEL = Color.rgb(244, 236, 214)

local WALL_TOP, FLOOR = 318, 440
local FEET = 624

local function outlined(r: Renderer, path: Path, c: Color, w: number)
    r:drawPath(path, kit.fill(c))
    r:drawPath(path, kit.stroke(OUT, w))
end

-- The skatepark: the backdrop -------------------------------------------------------------------

-- a round tree crown of a few blobs, outlined only on the outside
local function crown(r: Renderer, blobs: { Vector }, rads: { number }, c: Color)
    for i, q in blobs do
        r:drawPath(kit.circle(q.x, q.y, rads[i]), kit.stroke(OUT, 5))
    end
    for i, q in blobs do
        r:drawPath(kit.circle(q.x, q.y, rads[i]), kit.fill(c))
    end
end

local function trees(r: Renderer, t: number)
    local spots = { 92, 300, 520, 770, 1010, 1196 }
    for i, x in spots do
        local sw = math.sin(t * 0.9 + i) * 2
        local y = WALL_TOP - 18 - (i % 2) * 14
        local s = 1 + (i % 3) * 0.12
        local c = if i % 2 == 0 then LEAF_DK else LEAF
        crown(r, {
            Vector.xy(x - 40 * s + sw, y + 6), Vector.xy(x + sw, y - 26 * s), Vector.xy(x + 42 * s + sw, y + 4), Vector.xy(x + sw * 0.5, y + 18),
        }, { 36 * s, 46 * s, 38 * s, 40 * s }, c)
        r:drawPath(kit.circle(x - 14 * s + sw, y - 40 * s, 12 * s), kit.fill(kit.alpha(kit.SURFACE, 0.16)))
    end
end

-- the painted wall: a mural at each end, plain in the middle where the panels are worked on
local function mural(r: Renderer, x0: number, x1: number, seed: number)
    r:save()
    r:clipPath(kit.rect(x0, WALL_TOP, x1 - x0, FLOOR - WALL_TOP))
    local h = FLOOR - WALL_TOP
    -- a sun, waves and hills of colour
    r:drawPath(kit.circle(x0 + (x1 - x0) * 0.28, WALL_TOP + h * 0.42, 30), kit.fill(M_CORAL))
    for k = 0, 7 do
        local a = k * math.pi / 4 + seed
        local cx, cy = x0 + (x1 - x0) * 0.28, WALL_TOP + h * 0.42
        r:drawPath(kit.line(cx + math.cos(a) * 38, cy + math.sin(a) * 38, cx + math.cos(a) * 48, cy + math.sin(a) * 48), kit.stroke(M_CORAL, 4))
    end
    local hills = Path.new()
    hills:moveTo(Vector.xy(x0, FLOOR))
    local n = math.max(2, math.floor((x1 - x0) / 70))
    for k = 0, n do
        local x = x0 + (x1 - x0) * k / n
        hills:lineTo(Vector.xy(x, FLOOR - 34 - ((k + seed) % 2) * 22))
    end
    hills:lineTo(Vector.xy(x1, FLOOR))
    hills:close()
    r:drawPath(hills, kit.fill(M_PURPLE))
    local wave = Path.new()
    wave:moveTo(Vector.xy(x0, FLOOR - 14))
    local m = math.max(2, math.floor((x1 - x0) / 36))
    for k = 1, m do
        local xa = x0 + (x1 - x0) * (k - 0.5) / m
        local xb = x0 + (x1 - x0) * k / m
        wave:cubicTo(Vector.xy(xa - 6, FLOOR - 26), Vector.xy(xa + 6, FLOOR - 26), Vector.xy(xb, FLOOR - 14))
    end
    r:drawPath(wave, kit.stroke(M_TEAL, 7))
    r:drawPath(kit.circle(x0 + (x1 - x0) * 0.72, WALL_TOP + h * 0.36, 22), kit.fill(M_BLUE))
    r:drawPath(kit.circle(x0 + (x1 - x0) * 0.72, WALL_TOP + h * 0.36, 12), kit.fill(M_PINK))
    -- rows of white dots
    for k = 0, math.floor((x1 - x0) / 18) do
        r:drawPath(kit.circle(x0 + 9 + k * 18, WALL_TOP + 14, 2.6), kit.fill(kit.alpha(kit.SURFACE, 0.9)))
    end
    r:restore()
end

-- a kid's bike leaning on the wall, side-on
local function bike(r: Renderer, x: number, y: number, frame: Color, t: number)
    local rw = 15
    r:save()
    r:transform(Mat2D.withTranslation(x, y) * Mat2D.withRotation(-0.05) * Mat2D.withTranslation(-x, -y))
    r:drawPath(kit.ellipse(x + 6, y + 2, 46, 5), kit.soft(kit.alpha(kit.INK, 0.16), 5))
    for i = -1, 1, 2 do
        r:drawPath(kit.circle(x + i * 26, y - rw, rw), kit.stroke(TYRE, 4))
        r:drawPath(kit.circle(x + i * 26, y - rw, 3), kit.fill(METAL))
    end
    local f = kit.polyline({ Vector.xy(x - 26, y - rw), Vector.xy(x - 4, y - rw), Vector.xy(x - 12, y - rw - 22), Vector.xy(x + 16, y - rw - 22), Vector.xy(x - 4, y - rw) })
    r:drawPath(f, kit.stroke(frame, 3.6))
    r:drawPath(kit.line(x + 16, y - rw - 22, x + 26, y - rw), kit.stroke(frame, 3.6))
    r:drawPath(kit.line(x + 16, y - rw - 22, x + 14, y - rw - 32), kit.stroke(METAL, 3))
    r:drawPath(kit.line(x + 8, y - rw - 33, x + 20, y - rw - 31), kit.stroke(TYRE, 3.4))
    r:drawPath(kit.line(x - 12, y - rw - 22, x - 14, y - rw - 28), kit.stroke(METAL, 2.6))
    outlined(r, kit.rrect(x - 22, y - rw - 32, 16, 6, 3), TYRE, 1.4)
    r:restore()
end

type Scene = { bikes: number?, joints: boolean }

local function skatepark(r: Renderer, t: number, sc: Scene)
    local bx, by, bw, bh = kit.BX, kit.BY, kit.BW, kit.BH
    local sky = Gradient.linear(Vector.xy(0, by), Vector.xy(0, WALL_TOP), {
        { position = 0, color = SKY_HI },
        { position = 1, color = SKY_LO },
    })
    r:drawPath(kit.rect(bx, by, bw, WALL_TOP - by + 4), Paint.with({ gradient = sky }))
    trees(r, t)
    -- the wall, its coping, and the mural at each end
    r:drawPath(kit.rect(bx, WALL_TOP, bw, FLOOR - WALL_TOP), kit.fill(WALL))
    mural(r, bx, bx + 170, 0)
    mural(r, 780, bx + bw, 1)
    r:drawPath(kit.rect(bx, WALL_TOP - 8, bw, 10), kit.fill(WALL_CAP))
    r:drawPath(kit.line(bx, WALL_TOP - 8, bx + bw, WALL_TOP - 8), kit.stroke(OUT, 2.2))
    r:drawPath(kit.line(bx, WALL_TOP + 2, bx + bw, WALL_TOP + 2), kit.stroke(kit.alpha(OUT, 0.5), 1.6))
    -- the concrete
    local ground = Gradient.linear(Vector.xy(0, FLOOR), Vector.xy(0, by + bh), {
        { position = 0, color = CONCRETE },
        { position = 1, color = CONCRETE_LO },
    })
    r:drawPath(kit.rect(bx, FLOOR, bw, by + bh - FLOOR), Paint.with({ gradient = ground }))
    r:drawPath(kit.line(bx, FLOOR, bx + bw, FLOOR), kit.stroke(kit.alpha(OUT, 0.45), 2))
    if sc.joints then
        local jp = Path.new()
        for k = -3, 9 do
            local xt = bx + 60 + k * 160
            jp:moveTo(Vector.xy(xt, FLOOR))
            jp:lineTo(Vector.xy(640 + (xt - 640) * 1.9, by + bh))
        end
        jp:moveTo(Vector.xy(bx, 548))
        jp:lineTo(Vector.xy(bx + bw, 548))
        r:drawPath(jp, kit.stroke(kit.alpha(JOINT, 0.7), 1.6))
    end
    local bk = sc.bikes
    if bk ~= nil then
        bike(r, bk, FLOOR + 6, Color.rgb(214, 62, 64), t)
        bike(r, bk + 70, FLOOR + 10, Color.rgb(52, 112, 206), t)
    end
end

-- The plywood panel ------------------------------------------------------------------------------

type Look = {
    lift: number, -- 0 lying in place … 1 held up
    copy: boolean, -- the second panel, freshly cut
    edge: number, -- 0 plain · 1 gold (tap me, move me) · 2 red (not that)
    unit: number, -- grid square in px
    gridAt: Vector, -- a grid crossing
    gridRot: number, -- grid turn (radians)
    alpha: number,
}

local function look(unit: number, gridAt: Vector): Look
    return { lift = 0, copy = false, edge = 0, unit = unit, gridAt = gridAt, gridRot = 0, alpha = 1 }
end

local SLAB_X, SLAB_Y = 3, 7 -- the plywood's thickness, seen from the front

-- A plywood panel with corners P (px): wood grain, and the carpenter's pencil squares. Held panels rise.
local function ply(r: Renderer, P: { Vector }, s: Look)
    if #P < 3 then
        return
    end
    local lift = s.lift
    r:save()
    r:modulateOpacity(s.alpha)
    r:drawPath(kit.poly(kit.offset(P, 4 + 10 * lift, 10 + 22 * lift)), kit.soft(kit.alpha(kit.INK, 0.22 + 0.06 * lift), 9 + 16 * lift))
    local Q = kit.offset(P, 0, -13 * lift)
    -- the edge of the sheet: each side sweeps a band down and to the right
    local QO = kit.offset(Q, SLAB_X, SLAB_Y)
    local edge = kit.fill(PLY_EDGE)
    r:drawPath(kit.poly(QO), edge)
    for i = 1, #Q do
        local a, b = Q[i], Q[(i % #Q) + 1]
        r:drawPath(kit.poly({ a, b, Vector.xy(b.x + SLAB_X, b.y + SLAB_Y), Vector.xy(a.x + SLAB_X, a.y + SLAB_Y) }), edge)
    end
    r:drawPath(kit.poly(QO), kit.stroke(OUT, 1.6))
    -- the face
    local x0, y0, x1, y1 = kit.bbox(Q)
    local base = if s.copy then PLY_COPY else PLY
    local hi = if s.copy then PLY_COPY_HI else PLY_HI
    local grad = Gradient.linear(Vector.xy(x0, y0), Vector.xy(x1, y1), {
        { position = 0, color = hi },
        { position = 0.55, color = base },
        { position = 1, color = kit.mix(base, PLY_EDGE, 0.25) },
    })
    local qp = kit.poly(Q)
    r:drawPath(qp, Paint.with({ gradient = grad }))
    -- grain and pencil squares, in the panel's own frame (they turn with it)
    local u = s.unit
    local at = Vector.xy(s.gridAt.x, s.gridAt.y - 13 * lift)
    local inv = kit.rotate(kit.offset(Q, -at.x, -at.y), Vector.xy(0, 0), -s.gridRot)
    local gx0, gy0, gx1, gy1 = kit.bbox(inv)
    local i0, i1 = math.floor(gx0 / u) - 1, math.ceil(gx1 / u) + 1
    local j0, j1 = math.floor(gy0 / u) - 1, math.ceil(gy1 / u) + 1
    r:save()
    r:clipPath(qp)
    r:transform(Mat2D.withTranslation(at.x, at.y) * Mat2D.withRotation(s.gridRot))
    local grain = Path.new()
    local gy = j0 * u
    local k = 0
    while gy < j1 * u do
        local w = (i1 - i0) * u
        local xa = i0 * u
        local wob = if k % 2 == 0 then 3 else -3
        grain:moveTo(Vector.xy(xa, gy))
        grain:cubicTo(Vector.xy(xa + w * 0.33, gy + wob), Vector.xy(xa + w * 0.66, gy - wob), Vector.xy(xa + w, gy))
        gy += 11
        k += 1
    end
    r:drawPath(grain, kit.stroke(kit.alpha(PLY_GRAIN, 0.45), 1.3))
    local gp = Path.new()
    for i = i0, i1 do
        gp:moveTo(Vector.xy(i * u, j0 * u))
        gp:lineTo(Vector.xy(i * u, j1 * u))
    end
    for j = j0, j1 do
        gp:moveTo(Vector.xy(i0 * u, j * u))
        gp:lineTo(Vector.xy(i1 * u, j * u))
    end
    r:drawPath(gp, kit.stroke(kit.alpha(PENCIL, 0.55), 1.6))
    r:restore()
    if s.edge == 1 then
        r:drawPath(qp, kit.stroke(kit.GOLD, 5))
    elseif s.edge == 2 then
        r:drawPath(qp, kit.stroke(kit.RED, 5))
    else
        r:drawPath(qp, kit.stroke(OUT, 2.6))
    end
    r:restore()
end

-- Kiran's skateboard, side-on. (x, y) is where the wheels meet the ground; ang tilts it about that point.
local function skateboard(r: Renderer, x: number, y: number, ang: number, spin: number)
    r:save()
    r:transform(Mat2D.withTranslation(x, y) * Mat2D.withRotation(ang))
    for i = -1, 1, 2 do
        outlined(r, kit.rrect(i * 22 - 5, -13, 10, 6, 2), METAL, 1.6)
        outlined(r, kit.circle(i * 22, -5.5, 5.5), WHEEL, 2)
        local a = spin + i
        r:drawPath(kit.line(i * 22 - math.cos(a) * 3, -5.5 - math.sin(a) * 3, i * 22 + math.cos(a) * 3, -5.5 + math.sin(a) * 3), kit.stroke(kit.alpha(OUT, 0.5), 1.4))
    end
    -- the deck, kicked up at both ends (drawn clockwise, so it fills)
    local d = Path.new()
    d:moveTo(Vector.xy(-28, -18.5))
    d:lineTo(Vector.xy(28, -18.5))
    d:cubicTo(Vector.xy(32, -18.5), Vector.xy(35, -18.5), Vector.xy(37, -21.5))
    d:lineTo(Vector.xy(40, -20))
    d:cubicTo(Vector.xy(38, -15), Vector.xy(34, -12), Vector.xy(28, -12))
    d:lineTo(Vector.xy(-28, -12))
    d:cubicTo(Vector.xy(-34, -12), Vector.xy(-38, -15), Vector.xy(-40, -20))
    d:lineTo(Vector.xy(-37, -21.5))
    d:cubicTo(Vector.xy(-35, -18.5), Vector.xy(-32, -18.5), Vector.xy(-28, -18.5))
    d:close()
    outlined(r, d, DECK, 2.2)
    r:drawPath(kit.line(-30, -17.5, 30, -17.5), kit.stroke(GRIP, 2))
    r:restore()
end

-- a pill note with a green edge (gold is kept for things that move)
local function note(r: Renderer, f: kit.Fonts, s: string, x: number, y: number, k: number)
    if k <= 0.01 then
        return
    end
    local w = kit.width(f, s, f.body, 20) + 32
    local sc = kit.back(k)
    r:save()
    r:transform(Mat2D.withTranslation(x, y) * Mat2D.withScale(sc, sc))
    r:modulateOpacity(kit.clamp(k * 2, 0, 1))
    r:drawPath(kit.rrect(-w / 2 + 2, -17, w, 38, 19), kit.soft(kit.alpha(kit.INK, 0.16), 6))
    r:drawPath(kit.rrect(-w / 2, -19, w, 38, 19), kit.fill(kit.SURFACE))
    r:drawPath(kit.rrect(-w / 2, -19, w, 38, 19), kit.stroke(kit.ACCENT, 2.5))
    kit.label(r, f, s, f.body, 20, kit.ACCENT_DEEP, 0, 0, 0.5)
    r:restore()
end

-- The lesson -------------------------------------------------------------------------------

type St = {
    phase: string, -- step 1: 'ride' · 'tap' · 'appear' · 'fit' · 'fly' · 'snapped'; step 2: 'joined'
    phaseAt: number,
    tx: number,
    ty: number,
    rot: number,
    rotTarget: number,
    spinning: boolean,
    spinA: number,
    dragging: boolean,
    grabX: number,
    grabY: number,
    held: number,
    flyFrom: Vector,
    misses: number,
    -- step 2
    kp: Keypad,
    solvedAt: number,
    lastCount: number,
    wrongAt: number,
    -- step 3
    a: number,
    aShown: number,
    seen0: boolean,
    seen5: boolean,
    seen0At: number,
    seen5At: number,
    -- Kiran on her board
    rode: boolean, -- the opening ride has happened
    kx: number, -- where she is, and where she is rolling to
    ktx: number,
    ky: number, -- the ground under her wheels
    kang: number, -- board tilt
    onBoard: number, -- 1 riding … 0 stepped off, the board beside her
    spin: number, -- wheel turn
    greetAt: number,
}

-- steps 1 and 2: the side panel, bottom 5, top 3, height 4
local U = 48
local FX, FY = 190, 340
local P = { Vector.xy(0, 4), Vector.xy(5, 4), Vector.xy(4, 0), Vector.xy(1, 0) }
local PIVOT = Vector.xy(2.5, 2)
local KNOB = Vector.xy(3.5, 2.9)
local STAGE = 6.4 * U
local TARGET = 4 * U
local GY = FY + 4 * U -- the floor the funbox stands on
-- step 3
local U3, F3X, F3Y = 60, 420, 250
-- step 4: top 4, bottom 8, height 5
local U4, F4X, F4Y = 42, 180, 250

-- where Kiran and Saroj stand in each step
local HOME: { { number } } = {
    { 930, 1110 },
    { 745, 1192 },
    { 900, 1080 },
    { 720, 1192 },
}
local RIDE_T = 3.4 -- the opening ride, seconds

local kiran = people.new(people.CAST.kiran, -90)
local saroj = people.new(people.CAST.saroj, 1340)

local S: St = {
    phase = 'tap', phaseAt = 0, tx = 0, ty = 0, rot = 0, rotTarget = 0, spinning = false, spinA = 0,
    dragging = false, grabX = 0, grabY = 0, held = 0, flyFrom = Vector.xy(0, 0), misses = 0,
    kp = kit.keypad(860, 172), solvedAt = -1, lastCount = 0, wrongAt = -9,
    a = 3, aShown = 3, seen0 = false, seen5 = false, seen0At = -1, seen5At = -1,
    rode = false, kx = -90, ktx = -90, ky = FEET, kang = 0, onBoard = 1, spin = 0, greetAt = -1,
}

local function copyShape(): { Vector }
    return kit.toPx(kit.rotate(P, PIVOT, S.rot), FX + S.tx, FY + S.ty, U)
end

local function pivotPos(): Vector
    return Vector.xy(FX + S.tx + PIVOT.x * U, FY + S.ty + PIVOT.y * U)
end

local function knobPos(): Vector
    local k = kit.rotate({ KNOB }, PIVOT, S.rot)[1]
    return Vector.xy(FX + S.tx + k.x * U, FY + S.ty + k.y * U)
end

local function rightWay(): boolean
    return math.abs((S.rotTarget % (2 * math.pi)) - math.pi) < 0.05
end

-- the opening ride: in along the floor, an ollie onto the funbox, along its flat top, off the far end, out to the front.
-- Returns where the wheels are (x, ground y) and the board's tilt.
local function rideAt(t: number): (number, number, number)
    local top = FY
    if t < 0.75 then
        return kit.lerp(-80, 150, t / 0.75), GY, 0
    elseif t < 1.2 then
        local k = (t - 0.75) / 0.45
        return kit.lerp(150, 262, k), GY + (top - GY) * k - 360 * k * (1 - k), -0.32 * math.sin(math.pi * k)
    elseif t < 1.7 then
        return kit.lerp(262, 362, (t - 1.2) / 0.5), top, 0
    elseif t < 2.1 then
        local k = (t - 1.7) / 0.4
        return kit.lerp(362, 470, k), top + (GY - top) * k * k - 60 * k * (1 - k), 0.26 * math.sin(math.pi * k)
    elseif t < RIDE_T then
        local k = kit.ease((t - 2.1) / (RIDE_T - 2.1))
        return kit.lerp(470, HOME[1][1], k), kit.lerp(GY, FEET, k), 0
    end
    return HOME[1][1], FEET, 0
end

L.id = 'trapezium'
L.tag = 'TRAPEZIUM'
L.title = 'Trapeziums'
L.blurb = "Kiran's funbox in Madhya Pradesh."
L.steps = {
    { title = 'Two panels, one strip', line = 'l5s1', task = 'Make a parallelogram from two panels' },
    { title = 'Work out the whole strip', line = 'l5s2', task = 'Find the plywood in the whole strip' },
    { title = 'Stretch the flat top', line = 'l5s3', task = 'Shrink the top all the way to nothing' },
    { title = 'Your turn', line = 'l5s4', task = 'Work out the plywood on the keypad' },
}

function L.enter(g: G, step: number)
    S.phase, S.phaseAt, S.tx, S.ty, S.rot, S.rotTarget = 'tap', g.t, 0, 0, 0, 0
    S.spinning, S.dragging, S.held, S.misses = false, false, 0, 0
    S.kp = kit.keypad(860, 172)
    S.solvedAt, S.lastCount, S.wrongAt = -1, 0, -9
    S.a, S.aShown, S.seen0, S.seen5, S.seen0At, S.seen5At = 3, 3, false, false, -1, -1
    if step == 1 and not S.rode then
        -- Kiran rolls in and over the funbox before anything else happens
        S.phase = 'ride'
    elseif step == 2 then
        -- already joined
        S.phase, S.phaseAt, S.tx, S.ty, S.rot, S.rotTarget = 'joined', g.t - 10, TARGET, 0, math.pi, math.pi
    end
    local home = HOME[step]
    if S.kx < -40 and (step > 1 or S.rode) then
        S.kx = home[1]
    end
    S.ktx = home[1]
    people.hush(kiran)
    kiran.mood = 'idle'
    saroj.y = FEET
    people.hush(saroj)
    if saroj.x > 1320 and step > 1 then
        saroj.x = home[2]
    end
    saroj.tx = home[2]
    saroj.mood = 'idle'
end

local function snapNow(g: G)
    S.phase = 'snapped'
    S.phaseAt = g.t
    S.tx, S.ty, S.rot, S.rotTarget = TARGET, 0, math.pi, math.pi
    g.sfx('snap')
    g.sfx('sparkle')
    g.shake(3)
    g.done()
    g.say('l5s1done')
end

-- Kiran: the opening ride, then rolling from spot to spot on her board and stepping off when she gets there
local function moveKiran(g: G, dt: number)
    local riding = false
    if g.step == 1 and S.phase == 'ride' then
        local t = g.t - S.phaseAt
        local x, y, ang = rideAt(t)
        S.spin += (x - S.kx) / 6
        S.kx, S.ky, S.kang = x, y, ang
        S.ktx = x
        riding = true
        if t >= RIDE_T then
            S.phase, S.phaseAt = 'tap', g.t
            S.rode = true
            S.ktx = HOME[1][1]
            S.greetAt = g.t
        end
    else
        -- push off, cruise, and slow down to a stop where she is going
        local before = S.kx
        local gap = S.ktx - S.kx
        local speed = kit.clamp(math.abs(gap) * 2.4, 60, 330)
        S.kx += kit.clamp(gap, -speed * dt, speed * dt)
        S.spin += (S.kx - before) / 6
        S.ky = kit.follow(S.ky, FEET, 8, dt)
        S.kang = kit.follow(S.kang, 0, 10, dt)
        riding = math.abs(S.ktx - S.kx) > 3
    end
    S.onBoard = kit.follow(S.onBoard, if riding then 1 else 0, 9, dt)
    kiran.x, kiran.tx = S.kx, S.kx
    kiran.y = S.ky - 18 * S.onBoard
end

-- how Kiran and Saroj react to what is happening on the board
local function feel(g: G)
    local kr, sj = kiran, saroj
    local mk, ms = 'watch', 'watch'
    local lx, ly = FX + 4 * U, FY + 2 * U
    if g.step == 1 then
        if S.phase == 'ride' then
            mk = 'wave'
            lx, ly = S.kx + 80, S.ky - 60
            sj.lookX, sj.lookY = S.kx, S.ky - 80
        else
            if S.phase ~= 'tap' then
                lx, ly = FX + S.tx + 2.5 * U, FY + S.ty + 2 * U
            end
            if S.greetAt >= 0 and g.t - S.greetAt < 2.8 and S.phase == 'tap' then
                mk = 'wave'
                people.speak(kr, 'Seva Johar!')
            else
                people.hush(kr)
            end
            if S.phase == 'snapped' then
                local a = g.t - S.phaseAt
                if a < 2.6 then
                    mk = 'cheer'
                end
                -- Saroj's tip, the one he gives
                if a > 1.5 and a < 6.5 then
                    people.speak(sj, 'Flip one over:', 'a neat straight strip!')
                else
                    people.hush(sj)
                end
            end
        end
    elseif g.step == 2 then
        lx, ly = FX + 4 * U, FY + 2 * U
        if S.solvedAt >= 0 then
            mk = if g.t - S.solvedAt < 3 then 'cheer' else 'watch'
        else
            mk = if g.t - S.wrongAt < 1.6 then 'puzzled' else 'think'
        end
        people.hush(kr)
        people.hush(sj)
    elseif g.step == 3 then
        lx, ly = F3X + (1 + S.aShown) * U3, F3Y + U3
        if S.seen0 and g.t - S.seen0At < 3.4 then
            mk = if g.t - S.seen0At < 2.4 then 'cheer' else 'watch'
            people.speak(kr, 'A launch ramp!')
        else
            people.hush(kr)
        end
        people.hush(sj)
    else
        lx, ly = F4X + 4 * U4, F4Y + 2.5 * U4
        if S.solvedAt >= 0 then
            local a = g.t - S.solvedAt
            mk = if a < 6 then 'cheer' else 'watch'
            ms = if a > 0.6 and a < 4 then 'cheer' else 'watch'
            if a > 0.4 and a < 6 then
                people.speak(kr, 'Time to build!')
            else
                people.hush(kr)
            end
        else
            mk = if g.age < 1.2 then 'idle' elseif g.t - S.wrongAt < 2 then 'puzzled' else 'think'
            if g.age > 1.4 and g.age < 8 then
                people.speak(kr, 'How much plywood', 'for one panel?')
            else
                people.hush(kr)
            end
        end
        people.hush(sj)
    end
    kr.mood, sj.mood = mk, ms
    kr.lookX, kr.lookY = lx, ly
    if not (g.step == 1 and S.phase == 'ride') then
        sj.lookX, sj.lookY = lx, ly
    end
end

function L.advance(g: G, dt: number)
    S.held = kit.follow(S.held, if S.dragging or S.spinning then 1 else 0, 18, dt)
    local age = g.t - S.phaseAt
    if g.step == 1 then
        if S.phase == 'appear' then
            local k = kit.smooth(age / 0.95)
            S.tx = STAGE * k
            S.ty = -math.sin(k * math.pi) * 40
            if age >= 1 then
                S.tx, S.ty, S.phase, S.phaseAt = STAGE, 0, 'fit', g.t
                g.sfx('thud')
                g.sayNext('l5spin')
            end
        elseif S.phase == 'fit' and not S.spinning then
            S.rot = kit.follow(S.rot, S.rotTarget, 16, dt)
        elseif S.phase == 'fly' then
            local k = kit.ease(age / 0.22)
            S.tx = kit.lerp(S.flyFrom.x, TARGET, k)
            S.ty = kit.lerp(S.flyFrom.y, 0, k)
            S.rot = kit.follow(S.rot, math.pi, 30, dt)
            if age >= 0.22 then
                snapNow(g)
            end
        end
    elseif g.step == 2 and S.solvedAt >= 0 then
        local k = g.t - S.solvedAt
        local n = if k < 1.6 then 32 else 32 - kit.clamp(math.floor((k - 1.6) / 0.07), 0, 16)
        if n ~= S.lastCount then
            if S.lastCount > 0 then
                g.tick(32 - n)
            end
            if n == 16 then
                g.sfx('chime')
            end
            S.lastCount = n
        end
    elseif g.step == 3 then
        S.aShown = kit.follow(S.aShown, S.a, 18, dt)
    end
    kit.keypadAdvance(S.kp, dt)
    moveKiran(g, dt)
    feel(g)
    people.advance(kiran, dt, g.t)
    people.advance(saroj, dt, g.t)
    -- on the board she holds her arms out for balance
    if S.onBoard > 0.5 then
        local w = math.sin(g.t * 3) * 0.08
        kiran.armL, kiran.armR = 1.25 + w, 1.25 - w
        kiran.bendL, kiran.bendR = 0.45, 0.45
        kiran.hop, kiran.hopV = 0, 0
    end
end

-- drawing ------------------------------------------------------------------------------

local function scene(g: G, r: Renderer)
    if g.step == 1 then
        skatepark(r, g.t, { bikes = 82, joints = true })
    elseif g.step == 2 then
        skatepark(r, g.t, { bikes = 82, joints = true })
    elseif g.step == 3 then
        skatepark(r, g.t, { bikes = 1110, joints = true })
    else
        skatepark(r, g.t, { bikes = nil, joints = true })
    end
end

local function drawPair(g: G, r: Renderer, away: number)
    local orig = kit.toPx(P, FX, FY, U)
    local bob = if S.phase == 'tap' and g.age > 2 and S.rode then math.sin(g.t * 4) * 3 else 0
    local st = look(U, Vector.xy(FX, FY - bob))
    st.edge = if S.phase == 'tap' then 1 else 0
    ply(r, kit.offset(orig, 0, -bob), st)
    if S.phase ~= 'tap' and S.phase ~= 'ride' then
        local Q = kit.offset(copyShape(), away * 3 * U, -away * 60)
        local cst = look(U, pivotPos())
        cst.copy = true
        cst.gridRot = S.rot
        local ga = kit.rotate({ Vector.xy(FX + S.tx, FY + S.ty) }, pivotPos(), S.rot)[1]
        cst.gridAt = Vector.xy(ga.x + away * 3 * U, ga.y - away * 60)
        cst.lift = if S.phase == 'appear' then 0.8 else S.held + away
        cst.edge = if S.phase == 'fit' then 1 else 0
        cst.alpha = 1 - away
        ply(r, Q, cst)
        if S.phase == 'fit' then
            local kp = knobPos()
            kit.knob(r, g.t, kp.x, kp.y, 'spin', if S.spinning then 1 else 0, not S.spinning and not S.dragging)
        end
    end
end

local function drawStep1(g: G, r: Renderer)
    local f = g.fonts
    local age = g.t - S.phaseAt
    if S.phase == 'fit' or S.phase == 'fly' then
        local slot = kit.toPx({ Vector.xy(9, 0), Vector.xy(4, 0), Vector.xy(5, 4), Vector.xy(8, 4) }, FX, FY, U)
        local d = math.sqrt((S.tx - TARGET) ^ 2 + S.ty ^ 2)
        local gk = if rightWay() and d < 3 * U then kit.clamp(1.3 - d / (2.6 * U), 0.2, 1) elseif S.misses >= 2 then 0.45 else 0
        if gk > 0 then
            r:drawPath(kit.poly(slot), kit.fill(kit.alpha(kit.GOLD_WASH, 0.6 * gk)))
            r:drawPath(kit.poly(slot), kit.stroke(kit.alpha(kit.GOLD, gk), 3))
        end
    end
    drawPair(g, r, 0)
    -- the parallel sides, named
    if S.phase == 'tap' or S.phase == 'appear' then
        local k = if S.rode then 1 else 0
        if k > 0 then
            kit.halo(r, f, 'top 3', f.body, 18, kit.INK, FX + 2.5 * U, FY - 24, 0.5)
            kit.halo(r, f, 'bottom 5', f.body, 18, kit.INK, FX + 2.5 * U, FY + 4 * U + 40, 0.5)
            for _, y in { FY, FY + 4 * U } do
                local x = FX + 2.5 * U
                r:drawPath(kit.polyline({ Vector.xy(x - 8, y - 7), Vector.xy(x, y), Vector.xy(x - 8, y + 7) }), kit.stroke(OUT, 3))
            end
        end
    end
    if S.phase == 'snapped' then
        if age < 1.2 then
            local a, b = Vector.xy(FX + 5 * U, FY + 4 * U), Vector.xy(FX + 4 * U, FY)
            r:save()
            r:modulateOpacity(kit.clamp(1.2 - age, 0, 1))
            r:drawPath(kit.line(a.x, a.y, b.x, b.y), Paint.with({ style = 'stroke', thickness = 16, color = kit.alpha(kit.GOLD, 0.55), cap = 'round', feather = 5 }))
            r:drawPath(kit.line(a.x, a.y, b.x, b.y), kit.stroke(kit.SURFACE, 4))
            r:restore()
        end
        local para = kit.toPx({ Vector.xy(0, 4), Vector.xy(8, 4), Vector.xy(9, 0), Vector.xy(1, 0) }, FX, FY, U)
        r:drawPath(kit.partialOutline(para, (age - 0.3) / 0.9), kit.stroke(kit.ACCENT, 5))
        local y = FY + 4 * U + 32
        kit.bracket(r, f, Vector.xy(FX, y), Vector.xy(FX + 5 * U, y), 0, 1, '5', kit.clamp((age - 1.4) * 1.5, 0, 1), kit.INK)
        kit.bracket(r, f, Vector.xy(FX + 5 * U, y), Vector.xy(FX + 8 * U, y), 0, 1, '3', kit.clamp((age - 2.4) * 1.5, 0, 1), kit.ACCENT_DEEP)
    end
    -- a hint finger for the tap
    if S.phase == 'tap' and S.rode and g.t - S.phaseAt > 5 then
        local k = ((g.t - S.phaseAt) % 1.6) / 1.6
        local c = kit.centroid(kit.toPx(P, FX, FY, U))
        kit.finger(r, c.x, c.y, if k < 0.7 then 1 else (1 - k) / 0.3, k > 0.3 and k < 0.55)
    end
end

local function uiStep1(g: G, r: Renderer)
    local f = g.fonts
    local age = g.t - S.phaseAt
    if S.phase == 'snapped' then
        kit.rule(r, f, 'base = 5 + 3 = 8', 'the bottom plus the top', kit.clamp((age - 3.4) * 1.5, 0, 1), 820, 176)
    end
    kit.sign(r, f, 'PLYWOOD', '? squares', 0, 1000, 176)
end

local function drawStep2(g: G, r: Renderer)
    local f = g.fonts
    local k = if S.solvedAt >= 0 then g.t - S.solvedAt else -1
    local away = if k >= 0 then kit.clamp((k - 1.2) / 1.0, 0, 1) else 0
    drawPair(g, r, away)
    local hx = FX + 1 * U
    r:drawPath(kit.dashed(hx, FY, hx, FY + 4 * U, 9, 7), kit.stroke(kit.INK, 3))
    r:drawPath(kit.corner(Vector.xy(hx, FY + 4 * U), 1, 0, 0, -1, 13), kit.stroke(kit.INK, 2.5))
    kit.halo(r, f, 'height 4', f.body, 18, kit.INK, hx + 16, FY + 1.6 * U, 0)
    local y = FY + 4 * U + 32
    kit.bracket(r, f, Vector.xy(FX, y), Vector.xy(FX + 8 * U, y), 0, 1, 'base 8', 1 - away, kit.INK)
    if k > 2.4 then
        note(r, f, 'half', FX + 2.6 * U, FY + 2.6 * U, kit.clamp((k - 2.4) * 2, 0, 1))
    end
end

local function uiStep2(g: G, r: Renderer)
    local f = g.fonts
    local k = if S.solvedAt >= 0 then g.t - S.solvedAt else -1
    if k > 3 then
        kit.rule(r, f, 'area = ½ × (a + b) × h', 'a, b: the parallel sides  ·  ½ × (3 + 5) × 4 = 16', kit.clamp((k - 3) * 1.5, 0, 1), 420, 166)
    end
    if S.lastCount > 0 then
        local away = kit.clamp((k - 1.2) / 1.0, 0, 1)
        kit.sign(r, f, if away > 0 then 'ONE PANEL' else 'PARALLELOGRAM', S.lastCount .. ' squares', 0, 640, 262)
    end
    kit.keypadDraw(r, f, S.kp, 'Plywood in the whole strip', 'squares', g.t)
end

local function shapeFor(a: number): { Vector }
    return { Vector.xy(0, 4), Vector.xy(5, 4), Vector.xy(1 + a, 0), Vector.xy(1, 0) }
end

local function drawStep3(g: G, r: Renderer)
    local f = g.fonts
    local a = S.aShown
    local Q = kit.toPx(shapeFor(a), F3X, F3Y, U3)
    ply(r, Q, look(U3, Vector.xy(F3X, F3Y)))
    local hx = F3X + U3
    r:drawPath(kit.dashed(hx, F3Y, hx, F3Y + 4 * U3, 9, 7), kit.stroke(kit.INK, 3))
    kit.halo(r, f, 'height 4', f.body, 18, kit.INK, hx - 14, F3Y + 2 * U3, 1)
    kit.halo(r, f, 'top ' .. S.a, f.body, 19, kit.GOLD_DEEP, F3X + (1 + a / 2) * U3, F3Y - 30, 0.5)
    kit.halo(r, f, 'bottom 5', f.body, 19, kit.INK, F3X + 2.5 * U3, F3Y + 4 * U3 + 42, 0.5)
    kit.knob(r, g.t, F3X + (1 + a) * U3, F3Y, 'slide', S.held, not S.dragging and not S.seen0)
end

local function uiStep3(g: G, r: Renderer)
    local f = g.fonts
    local v = (S.a + 5) * 4 / 2
    r:drawPath(kit.rrect(63, 182, 300, 150, 22), kit.soft(kit.alpha(kit.INK, 0.14), 14))
    r:drawPath(kit.rrect(60, 176, 300, 150, 22), kit.fill(kit.ACCENT_WASH))
    kit.label(r, f, 'PLYWOOD', f.mono, 12, kit.INK_SOFT, 84, 202, 0)
    kit.label(r, f, '½ × (' .. S.a .. ' + 5) × 4', f.display, 28, kit.ACCENT_DEEP, 84, 244, 0)
    kit.label(r, f, '= ' .. kit.num(v), f.display, 36, kit.ACCENT_DEEP, 84, 292, 0)
    if S.seen0 then
        note(r, f, 'top 0: a triangle!', 210, 380, kit.clamp((g.t - S.seen0At) * 2, 0, 1))
    end
    if S.seen5 then
        note(r, f, 'top 5: a parallelogram!', 210, 440, kit.clamp((g.t - S.seen5At) * 2, 0, 1))
    end
end

local function drawStep4(g: G, r: Renderer)
    local f = g.fonts
    local Q = kit.toPx({ Vector.xy(0, 5), Vector.xy(8, 5), Vector.xy(6, 0), Vector.xy(2, 0) }, F4X, F4Y, U4)
    ply(r, Q, look(U4, Vector.xy(F4X, F4Y)))
    local hx = F4X + 2 * U4
    r:drawPath(kit.dashed(hx, F4Y, hx, F4Y + 5 * U4, 9, 7), kit.stroke(kit.INK, 3))
    r:drawPath(kit.corner(Vector.xy(hx, F4Y + 5 * U4), 1, 0, 0, -1, 13), kit.stroke(kit.INK, 2.5))
    kit.halo(r, f, '5 m', f.body, 19, kit.INK, hx + 16, F4Y + 2.5 * U4, 0)
    kit.halo(r, f, '4 m', f.body, 19, kit.INK, F4X + 4 * U4, F4Y - 26, 0.5)
    kit.halo(r, f, '8 m', f.body, 19, kit.INK, F4X + 4 * U4, F4Y + 5 * U4 + 42, 0.5)
    if S.solvedAt >= 0 then
        local k = kit.clamp((g.t - S.solvedAt) * 1.5, 0, 1)
        local a, b = Vector.xy(F4X + 2 * U4, F4Y), Vector.xy(F4X + 6 * U4, F4Y)
        local c, d = Vector.xy(F4X, F4Y + 5 * U4), Vector.xy(F4X + 8 * U4, F4Y + 5 * U4)
        local pen = Paint.with({ style = 'stroke', thickness = 9, color = kit.alpha(kit.ACCENT, k), cap = 'round' })
        r:drawPath(kit.line(a.x, a.y, b.x, b.y), pen)
        r:drawPath(kit.line(c.x, c.y, d.x, d.y), pen)
    end
end

local function uiStep4(g: G, r: Renderer)
    local f = g.fonts
    if S.solvedAt >= 0 then
        kit.rule(r, f, '½ × (4 + 8) × 5 = 30', 'add the parallel sides, times the height, halve', kit.clamp((g.t - S.solvedAt) * 1.5, 0, 1), 420, 528)
    end
    kit.keypadDraw(r, f, S.kp, 'Plywood in square metres', 'sq m', g.t)
end

local function drawPeople(g: G, r: Renderer)
    people.draw(r, g.fonts, saroj, g.t)
    -- Kiran's board: under her feet while she rides, beside her once she steps off
    local ob = S.onBoard
    local bxp = S.kx + 54 * (1 - ob)
    -- in the air (the ollie up, the drop off the end), the shadow stays on whatever is below her
    local below: number? = nil
    if g.step == 1 and S.phase == 'ride' then
        local t = g.t - S.phaseAt
        if t >= 0.75 and t < 1.2 then
            below = if S.kx > FX + U then FY else GY
        elseif t >= 1.7 and t < 2.1 then
            below = if S.kx < FX + 4 * U then FY else GY
        end
    end
    if below ~= nil then
        r:drawPath(kit.ellipse(bxp + 2, below + 2, 32, 5), kit.soft(kit.alpha(kit.INK, 0.18), 5))
    else
        r:drawPath(kit.ellipse(bxp + 2, S.ky + 2, 38, 5), kit.soft(kit.alpha(kit.INK, 0.2), 5))
    end
    if ob < 0.5 then
        skateboard(r, bxp, S.ky, S.kang, S.spin)
    end
    people.draw(r, g.fonts, kiran, g.t)
    if ob >= 0.5 then
        skateboard(r, bxp, S.ky, S.kang, S.spin)
    end
end

function L.draw(g: G, r: Renderer)
    scene(g, r)
    if g.step == 1 then
        drawStep1(g, r)
    elseif g.step == 2 then
        drawStep2(g, r)
    elseif g.step == 3 then
        drawStep3(g, r)
    else
        drawStep4(g, r)
    end
    drawPeople(g, r)
    if g.step == 1 then
        uiStep1(g, r)
    elseif g.step == 2 then
        uiStep2(g, r)
    elseif g.step == 3 then
        uiStep3(g, r)
    else
        uiStep4(g, r)
    end
end

-- input ----------------------------------------------------------------------------------

local function check(g: G)
    local typed = S.kp.value
    local v = tonumber(typed) or -1
    if g.step == 2 then
        if v == 32 then
            g.report('l5s2', true, typed)
            S.kp.okT = 3
            S.solvedAt = g.t
            g.done()
            g.burst(1000, 300, 30)
            g.say('l5s2done')
        else
            g.report('l5s2', false, typed)
            S.wrongAt = g.t
            g.sfx('oops')
            kit.keypadWrong(S.kp, 'Not quite. Have another go.')
            g.say(if v == 20 then 'l5p20' elseif v == 16 then 'l5p16' else 'l5px')
        end
    else
        if v == 30 then
            g.report('l5s4', true, typed)
            S.kp.okT = 3
            S.solvedAt = g.t
            g.done()
            g.burst(1000, 300, 40)
            g.say('l5s4done')
        else
            g.report('l5s4', false, typed, if v == 60 then 'half' else nil)
            S.wrongAt = g.t
            g.sfx('oops')
            kit.keypadWrong(S.kp, 'Not quite. Have another go.')
            g.say(if v == 60 then 'l5n60' elseif v == 40 then 'l5n40' elseif v == 20 then 'l5n20' else 'l5nx')
        end
    end
end

local function setTop(g: G, a: number)
    local n = kit.clamp(a, 0, 5)
    if n == S.a then
        return
    end
    S.a = n
    g.tick(n * 2 + 2)
    if n == 0 and not S.seen0 then
        S.seen0, S.seen0At = true, g.t
        g.sfx('sparkle')
        g.done()
        g.say('l5tri')
        g.sayNext('l5s3done')
    elseif n == 5 and not S.seen5 then
        S.seen5, S.seen5At = true, g.t
        g.sfx('sparkle')
        g.say('l5para')
    end
end

local function goHome(g: G, line: string)
    S.misses += 1
    g.sfx('oops')
    g.shake(4)
    S.tx, S.ty = STAGE, 0
    g.say(line)
    if S.misses >= 2 then
        g.hint('Stuck? Press space and I will do it')
    end
end

-- the opening ride, cut short (Kiran is at her spot at once)
local function endRide(g: G)
    S.phase, S.phaseAt = 'tap', g.t
    S.rode = true
    S.kx, S.ktx, S.ky, S.kang = HOME[1][1], HOME[1][1], FEET, 0
    S.greetAt = g.t
end

function L.down(g: G, p: Vector): boolean
    if g.step == 1 then
        if S.phase == 'tap' and kit.inside(kit.toPx(P, FX, FY, U), p) then
            S.phase, S.phaseAt = 'appear', g.t
            g.sfx('pop')
            g.sfx('whoosh')
            return true
        elseif S.phase == 'fit' then
            if kit.dist(p, knobPos()) < 34 then
                S.spinning = true
                local c = pivotPos()
                S.spinA = math.atan2(p.y - c.y, p.x - c.x)
                g.sfx('pickup')
                return true
            elseif kit.inside(copyShape(), p) then
                S.dragging = true
                S.grabX, S.grabY = p.x - S.tx, p.y - S.ty
                g.sfx('pickup')
                return true
            end
        end
    elseif (g.step == 2 or g.step == 4) and S.solvedAt < 0 then
        local res = kit.keypadDown(S.kp, p)
        if res == 'ok' then
            check(g)
        elseif res == 'key' then
            g.sfx('tick3')
        end
        return res ~= ''
    elseif g.step == 3 then
        if kit.dist(p, Vector.xy(F3X + (1 + S.aShown) * U3, F3Y)) < 44 then
            S.dragging = true
            g.sfx('pickup')
            return true
        end
    end
    return false
end

function L.move(g: G, p: Vector)
    if g.step == 1 and S.spinning then
        local c = pivotPos()
        local a = math.atan2(p.y - c.y, p.x - c.x)
        local da = a - S.spinA
        if da > math.pi then
            da -= 2 * math.pi
        elseif da < -math.pi then
            da += 2 * math.pi
        end
        local before = math.floor(S.rot / (math.pi / 12))
        S.rot += da
        S.spinA = a
        if math.floor(S.rot / (math.pi / 12)) ~= before then
            g.tick(math.floor(S.rot / (math.pi / 12)) % 12)
        end
    elseif g.step == 1 and S.dragging then
        local nx: number = kit.clamp(p.x - S.grabX, -FX + 10, STAGE + 30)
        local ny: number = kit.clamp(p.y - S.grabY, -80, 100)
        if rightWay() and math.sqrt((nx - TARGET) ^ 2 + ny ^ 2) < 0.7 * U then
            nx = kit.lerp(nx, TARGET, 0.6)
            ny = kit.lerp(ny, 0, 0.6)
        end
        S.tx = nx
        S.ty = ny
    elseif g.step == 3 and S.dragging then
        setTop(g, math.floor((p.x - F3X) / U3 - 1 + 0.5))
    end
end

function L.up(g: G, p: Vector)
    if g.step == 1 and S.spinning then
        S.spinning = false
        local q = math.pi / 2
        S.rotTarget = math.floor(S.rot / q + 0.5) * q
        g.sfx('snap')
        if rightWay() then
            g.sfx('sparkle')
            if math.sqrt((S.tx - TARGET) ^ 2 + S.ty ^ 2) < 0.6 * U then
                S.phase, S.phaseAt, S.flyFrom = 'fly', g.t, Vector.xy(S.tx, S.ty)
            end
        end
    elseif g.step == 1 and S.dragging then
        S.dragging = false
        local d = math.sqrt((S.tx - TARGET) ^ 2 + S.ty ^ 2)
        if d < 1.5 * U then
            if rightWay() then
                S.phase, S.phaseAt, S.flyFrom = 'fly', g.t, Vector.xy(S.tx, S.ty)
            else
                goHome(g, 'l5wrongway')
            end
        elseif math.abs(S.tx - STAGE) > 24 or math.abs(S.ty) > 24 then
            goHome(g, if rightWay() then 'l5notthere' else 'l5wrongway')
        end
    elseif g.step == 3 and S.dragging then
        S.dragging = false
        g.sfx('drop')
    end
end

function L.key(g: G, k: number): boolean
    if g.step == 1 and k == 32 then
        if S.phase == 'ride' then
            endRide(g)
        elseif S.phase == 'tap' then
            S.phase, S.phaseAt = 'appear', g.t
            g.sfx('whoosh')
        elseif S.phase == 'fit' then
            S.rotTarget = math.pi
            S.phase, S.phaseAt, S.flyFrom = 'fly', g.t, Vector.xy(S.tx, S.ty)
        end
        return true
    elseif g.step == 1 and S.phase == 'fit' and k == 82 then -- R turns the copy a quarter
        S.rotTarget += math.pi / 2
        g.sfx('snap')
        return true
    elseif (g.step == 2 or g.step == 4) and S.solvedAt < 0 then
        -- the number pad's digits type too
        local res = kit.keypadKey(S.kp, if k >= 320 and k <= 329 then k - 272 else k)
        if res == 'ok' then
            check(g)
            return true
        end
        return res ~= ''
    elseif g.step == 3 and (k == 262 or k == 263) then
        setTop(g, S.a + (if k == 262 then 1 else -1))
        return true
    end
    return false
end

-- the home card: the painted wall, and Kiran rolling over a funbox, again and again
local thumbKiran = people.new(people.CAST.kiran, 0)

function L.thumb(g: G, r: Renderer, x: number, y: number, w: number, h: number)
    local sky = Gradient.linear(Vector.xy(0, y), Vector.xy(0, y + 50), {
        { position = 0, color = SKY_HI },
        { position = 1, color = SKY_LO },
    })
    r:drawPath(kit.rect(x, y, w, h), Paint.with({ gradient = sky }))
    local wy, fy = y + 40, y + 78
    crown(r, { Vector.xy(x + 30, wy - 6), Vector.xy(x + 60, wy - 14), Vector.xy(x + 200, wy - 10), Vector.xy(x + 230, wy - 4) }, { 18, 22, 20, 18 }, LEAF)
    r:drawPath(kit.rect(x, wy, w, fy - wy), kit.fill(WALL))
    r:drawPath(kit.circle(x + 40, wy + 18, 11), kit.fill(M_CORAL))
    r:drawPath(kit.poly({ Vector.xy(x + 170, fy), Vector.xy(x + 190, fy - 18), Vector.xy(x + 210, fy) }), kit.fill(M_PURPLE))
    r:drawPath(kit.poly({ Vector.xy(x + 200, fy), Vector.xy(x + 222, fy - 24), Vector.xy(x + 244, fy) }), kit.fill(M_TEAL))
    r:drawPath(kit.line(x, wy, x + w, wy), kit.stroke(OUT, 1.6))
    r:drawPath(kit.rect(x, fy, w, h - (fy - y)), kit.fill(CONCRETE))
    r:drawPath(kit.line(x, fy, x + w, fy), kit.stroke(kit.alpha(OUT, 0.4), 1.4))
    -- the funbox: a trapezium of plywood
    local gy = y + h - 8
    local fbx, u = x + 100, 12
    local box = kit.toPx({ Vector.xy(0, 2), Vector.xy(5, 2), Vector.xy(4, 0), Vector.xy(1, 0) }, fbx, gy - 2 * u, u)
    ply(r, box, look(u, Vector.xy(fbx, gy - 2 * u)))
    -- Kiran, round and round: along the floor, onto the top, off again
    local tt = (g.t * 0.32) % 1
    local bxp = x - 30 + tt * (w + 60)
    local top, base = gy - 2 * u, gy
    local sy = base
    if bxp > fbx + 0.6 * u and bxp < fbx + 4.4 * u then
        sy = top
    elseif bxp > fbx - 0.8 * u and bxp <= fbx + 0.6 * u then
        local k = (bxp - (fbx - 0.8 * u)) / (1.4 * u)
        sy = base + (top - base) * k - 30 * k * (1 - k)
    elseif bxp >= fbx + 4.4 * u and bxp < fbx + 6 * u then
        local k = (bxp - (fbx + 4.4 * u)) / (1.6 * u)
        sy = top + (base - top) * k * k
    end
    local p = thumbKiran
    p.s, p.x, p.tx, p.y, p.mood = 0.34, bxp, bxp, sy - 7, 'wave'
    people.advance(p, 1 / 60, g.t)
    p.armL, p.armR, p.bendL, p.bendR = 1.25, 1.25, 0.45, 0.45
    people.draw(r, g.fonts, p, g.t)
    r:save()
    r:transform(Mat2D.withTranslation(bxp, sy) * Mat2D.withScale(0.4, 0.4) * Mat2D.withTranslation(-bxp, -sy))
    skateboard(r, bxp, sy, 0, g.t * 8)
    r:restore()
end

return L
