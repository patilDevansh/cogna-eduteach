-- Lesson 9 · Where is the height? (trail Day 2)
--
-- No story: a maths studio. Coloured acrylic tiles lie on a green cutting mat whose grid squares are the units, with a
-- plumb bob (Nani's, from lesson 8: require('l8').plumbKit) and a clear set square on the desk.
--   1. drag the plumb bob along a parallelogram's top edge and let go: it drops, swings, settles, and the height snaps
--      in at a square corner and counts itself, 4 squares; the set square flies over and fits the corner
--   2. push the top edge sideways with the gold handle: the slanted side grows and shrinks (live), the height stays 3
--   3. three sticks lie on a new tile (slanted side 5, base 7, height 3): tap the height. Reported as l9s3, with the
--      mix-up 'slant' when the slanted side is tapped
--   4. a trapezium: drop the plumb from 3 different places along its top; 4 squares every time, at 90°
-- The page speaks the lines; each follow-up line waits until the one before it has been heard.

local kit = require('kit')
local l8 = require('l8')
type G = kit.G
type Fonts = kit.Fonts
type Plumb = l8.Plumb

local PK = l8.plumbKit

local L = {}

-- Look ---------------------------------------------------------------------------------------

local DESK = Color.rgb(196, 146, 96)
local DESK_GRAIN = Color.rgb(176, 124, 76)
local MAT = Color.rgb(34, 104, 90)
local MAT_DK = Color.rgb(22, 78, 66)
local SHADOW = Color.rgb(6, 30, 24)
local STICK = Color.rgb(242, 222, 182)
local STICK_EDGE = Color.rgb(120, 84, 40)
local GLASS = Color.rgb(214, 240, 255)

-- the acrylic tiles, one colour per step
local TILE: { Color } = {
    Color.rgb(246, 160, 40), -- saffron
    Color.rgb(232, 72, 132), -- rani pink
    Color.rgb(48, 136, 216), -- blue
    Color.rgb(134, 98, 220), -- violet
}

-- Layout ---------------------------------------------------------------------------------------

local MX, MY, MW, MH = 60, 164, 1160, 458 -- the cutting mat
local GX, GY, U = 88, 188, 48 -- a grid crossing on the mat, and one square
local HANG = 64 -- the thread's length while the bob is carried
local REST = Vector.xy(1004, 600) -- where the set square lies on the desk (its square corner)
local REST_ROT = -0.3

-- a point on the mat's grid (squares) in px
local function gp(x: number, y: number): Vector
    return Vector.xy(GX + x * U, GY + y * U)
end

local function gpts(P: { Vector }): { Vector }
    return kit.toPx(P, GX, GY, U)
end

-- step 1: a parallelogram, base 4..10 on row 7, top 6..12 on row 3 (height 4). The bob slides over the base.
local P1 = { Vector.xy(4, 7), Vector.xy(10, 7), Vector.xy(12, 3), Vector.xy(6, 3) }
local LO1, HI1 = 6.4, 9.6
-- step 2: base 4..12 on row 7, top on row 4 (height 3), leaning from -4 to 4
local LEAN_MIN, LEAN_MAX = -4, 4
-- step 3: base 5..12 on row 7, top 9..16 on row 4: slanted side 5, base 7, height 3 (dropped from the top-left corner)
local P3 = { Vector.xy(5, 7), Vector.xy(12, 7), Vector.xy(16, 4), Vector.xy(9, 4) }
-- step 4: a trapezium, base 3..13 on row 7, top 5..10 on row 3 (height 4)
local P4 = { Vector.xy(3, 7), Vector.xy(13, 7), Vector.xy(10, 3), Vector.xy(5, 3) }
local LO4, HI4 = 5.3, 9.7

-- State ------------------------------------------------------------------------------------------

type Pose = { x: number, y: number, rot: number, side: number } -- side 1: legs run right · -1: left

type St = {
    followed: boolean,
    -- the plumb bob (steps 1, 3, 4)
    pl: Plumb,
    cx: number, -- where its clamp is along the top edge (squares)
    cxTarget: number,
    phase: string, -- 'ready' (carried) · 'falling' · 'landed' (swinging) · 'settled'
    landedAt: number,
    settledAt: number,
    dropX: number,
    counted: number,
    dragging: boolean,
    held: number,
    grabDX: number,
    touched: boolean,
    -- the set square
    sqFrom: Pose,
    sqTo: Pose,
    sqAt: number,
    sqFoot: boolean, -- flying to a foot (clicks in) or home
    sqIn: boolean,
    sqInAt: number,
    sqSaid: boolean,
    -- step 2
    lean: kit.Spring,
    leanTarget: number,
    leanMoved: number,
    minL: number,
    maxL: number,
    leanDone: boolean,
    leanDoneAt: number,
    ghosts: { number },
    ghostT: number,
    ghostFade: number,
    -- step 3
    picked: string,
    wrong: string,
    wrongAt: number,
    misses: number,
    slants: number,
    hinted: boolean,
    hoverLine: string,
    kb: number,
    wob: kit.Spring,
    -- step 4
    drops: { number },
    dropAt: { number },
    dup: boolean,
    allAt: number,
    hops: number,
}

local function pose(x: number, y: number, rot: number, side: number?): Pose
    return { x = x, y = y, rot = rot, side = side or 1 }
end

-- the set square sits on the side of a height that has more base under it
local function sideFor(x: number, b0: number, b1: number): number
    return if x - b0 >= b1 - x then -1 else 1
end

-- step 4: …and, if it can, on a side with no other height under its legs
local function sideAmong(x: number, others: { number }): number
    local reach = 92 / U + 0.3
    local function free(side: number): boolean
        local far = x + side * reach
        if far < 3 or far > 13 then
            return false
        end
        for _, o in others do
            local d = (o - x) * side
            if d > 0.01 and d < reach then
                return false
            end
        end
        return true
    end
    local pref = sideFor(x, 3, 13)
    if free(pref) then
        return pref
    elseif free(-pref) then
        return -pref
    end
    return pref
end

local S: St = {
    followed = false,
    pl = PK.new(HANG), cx = 8, cxTarget = 8, phase = 'ready', landedAt = -1, settledAt = -1, dropX = 8, counted = 0,
    dragging = false, held = 0, grabDX = 0, touched = false,
    sqFrom = pose(REST.x, REST.y, REST_ROT), sqTo = pose(REST.x, REST.y, REST_ROT), sqAt = -99, sqFoot = false, sqIn = false, sqInAt = -1, sqSaid = false,
    lean = { x = 2, v = 0 }, leanTarget = 2, leanMoved = 0, minL = 2, maxL = 2, leanDone = false, leanDoneAt = -1,
    ghosts = {}, ghostT = 0, ghostFade = 1,
    picked = '', wrong = '', wrongAt = -99, misses = 0, slants = 0, hinted = false, hoverLine = '', kb = 0, wob = { x = 0, v = 0 },
    drops = {}, dropAt = {}, dup = false, allAt = -1, hops = 0,
}

-- Protocol ---------------------------------------------------------------------------------------

L.id = 'height'
L.tag = 'WHERE IS THE HEIGHT?'
L.title = 'Where is the height?'
L.blurb = 'Plumb line, lean, check: 90°.'
L.steps = {
    { title = 'Drop the plumb line', line = 'l9s1', task = 'Drag the plumb bob along the top, then let go' },
    { title = 'Lean it: what changes?', line = 'l9s2', task = 'Push the top edge with the gold handle' },
    { title = 'Which one is the height?', line = 'l9s3', task = 'Tap the stick that shows the height' },
    { title = 'The trapezium', line = 'l9s4', task = 'Drop the plumb bob from 3 different places' },
}

L.lines = {
    l9s1 = 'Here is a parallelogram. Its bottom side is the base. But where is its height?',
    l9s1b = 'Drag the plumb bob along the top edge, then let go. Watch where the thread falls.',
    l9s1land = 'Straight down to the base. That straight drop is the height: 4 squares.',
    l9s1sq = 'The set square fits the corner exactly. The height meets the base at 90 degrees.',
    l9s2 = 'Now grab the gold handle and push the top edge sideways, both ways.',
    l9s2b = 'Keep an eye on the slanted side, and on the height.',
    l9s2done = 'The slanted side keeps changing, but the height stays 3. The height never leans.',
    l9s3 = 'Your turn. 3 sticks lie on this shape. Tap the stick that shows its height.',
    l9s3slant = 'That stick leans. It is the slanted side, 5 squares long. The height drops straight down.',
    l9s3slant2 = 'Not the leaning one. Find the stick that goes straight down, like the plumb line.',
    l9s3base = 'That is the base, the side it sits on. The height stands straight up from it.',
    l9s3done = 'Yes! It drops straight down and meets the base at 90 degrees. The height is 3.',
    l9s4 = 'Last one, a trapezium. Drop the plumb bob from 3 different places along its top.',
    l9s4one = '4 squares. Now try another spot.',
    l9s4two = '4 again. One more, somewhere new.',
    l9s4same = 'You dropped it there already. Try a new spot along the top.',
    l9s4done = '4 squares every time. The height always meets the base at 90 degrees.',
}

-- the top edge the bob slides along, in each step: row, and from where to where (squares)
local function track(step: number): (number, number, number)
    if step == 4 then
        return 3, LO4, HI4
    end
    return 3, LO1, HI1
end

local function pinAt(): Vector
    if S.picked == 'height' then
        return gp(9, 4)
    end
    return gp(S.cx, 3)
end

local function sqGo(g: G, to: Pose, foot: boolean)
    -- from wherever it is drawn now
    local k = kit.clamp((g.t - S.sqAt) / 0.6, 0, 1)
    local e = kit.smooth(k)
    S.sqFrom = pose(kit.lerp(S.sqFrom.x, S.sqTo.x, e), kit.lerp(S.sqFrom.y, S.sqTo.y, e), kit.lerp(S.sqFrom.rot, S.sqTo.rot, e), if e < 0.5 then S.sqFrom.side else S.sqTo.side)
    S.sqTo = to
    S.sqAt = g.t
    S.sqFoot = foot
    S.sqIn = false
end

local function sqHome(g: G)
    if S.sqTo.x ~= REST.x or S.sqTo.y ~= REST.y then
        sqGo(g, pose(REST.x, REST.y, REST_ROT), false)
    end
end

function L.enter(g: G, step: number)
    S.followed = false
    S.dragging, S.held, S.grabDX, S.touched = false, 0, 0, false
    S.phase, S.landedAt, S.settledAt, S.counted = 'ready', -1, -1, 0
    S.pl = PK.new(HANG)
    S.cx = if step == 4 then 6 else 8.6
    S.cxTarget = S.cx
    S.dropX = S.cx
    S.sqFrom, S.sqTo, S.sqAt, S.sqFoot, S.sqIn, S.sqInAt = pose(REST.x, REST.y, REST_ROT), pose(REST.x, REST.y, REST_ROT), -99, false, false, -1
    S.sqSaid = false
    S.lean, S.leanTarget, S.leanMoved, S.minL, S.maxL, S.leanDone, S.leanDoneAt = { x = 2, v = 0 }, 2, 0, 2, 2, false, -1
    S.ghosts, S.ghostT, S.ghostFade = {}, 0, 1
    S.picked, S.wrong, S.wrongAt, S.misses, S.slants, S.hoverLine, S.kb = '', '', -99, 0, 0, '', 0
    S.hinted = false
    S.wob = { x = 0, v = 0 }
    S.drops, S.dropAt, S.dup, S.allAt, S.hops = {}, {}, false, -1, 0
    if step == 2 then
        S.pl = PK.new(3 * U)
    elseif step == 3 then
        S.pl = PK.new(0)
    end
end

-- The plumb bob: carried, falling, swinging, settled ----------------------------------------------

local function lift(g: G)
    if S.phase ~= 'ready' then
        S.phase = 'ready'
        S.pl.falling = false
        S.pl.vlen = 0
        S.landedAt, S.settledAt, S.counted = -1, -1, 0
        S.dup = false
        g.sfx('pickup')
    end
end

local function drop(g: G)
    if S.phase ~= 'ready' then
        return
    end
    S.phase = 'falling'
    S.pl.target = 4 * U
    S.pl.falling = true
    S.pl.vlen = 0
    g.sfx('whoosh')
end

-- one frame of the bob; true on the frame it settles
local function plumbAdvance(g: G, dt: number): boolean
    S.cx = kit.follow(S.cx, S.cxTarget, 22, dt)
    local pin = pinAt()
    local pl = S.pl
    local ax = PK.push(pl, pin.x, dt)
    if S.phase == 'ready' then
        pl.len = kit.follow(pl.len, HANG, 9, dt)
        PK.swing(pl, dt, ax, 2.4)
        return false
    end
    local damp = if S.phase == 'settled' then 7 else 1.9
    if PK.swing(pl, dt, ax, damp) then
        S.phase = 'landed'
        S.landedAt = g.t
        pl.om += 0.7
        g.sfx('thud')
        g.shake(2)
    end
    if S.phase == 'landed' and g.t - S.landedAt > 1.5 then
        S.phase = 'settled'
        S.settledAt = g.t
        S.dropX = S.cx
        S.counted = 0
        g.sfx('snap')
        return true
    end
    if S.phase == 'settled' then
        pl.th = kit.follow(pl.th, 0, 8, dt)
        if not S.dup then
            -- the squares of the height count themselves
            local n = kit.clamp(math.floor((g.t - S.settledAt - 0.35) / 0.17) + 1, 0, 4)
            if n > S.counted then
                S.counted = n
                g.tick(n + 3)
                if n == 4 then
                    g.sfx('sparkle')
                end
            end
        end
    end
    return false
end

-- Advance --------------------------------------------------------------------------------------------

local function advance1(g: G, dt: number)
    if not S.followed and g.age > 0.4 and not g.talking() then
        S.followed = true
        g.sayNext('l9s1b')
    end
    if plumbAdvance(g, dt) and not g.isDone() then
        g.done()
        g.say('l9s1land')
    end
    -- once counted, the set square comes over and fits the corner
    if S.phase == 'settled' and g.t - S.settledAt > 1.3 and not S.sqFoot then
        local f = gp(S.dropX, 7)
        sqGo(g, pose(f.x, f.y, 0, sideFor(S.dropX, 4, 10)), true)
    end
end

local function advance2(g: G, dt: number)
    if not S.followed and g.age > 0.4 and not g.talking() then
        S.followed = true
        g.sayNext('l9s2b')
    end
    local before = S.lean.x
    kit.spring(S.lean, S.leanTarget, 320, 18, dt) -- a little overshoot when it is let go
    local l = S.lean.x
    S.leanMoved += math.abs(l - before)
    S.minL = math.min(S.minL, l)
    S.maxL = math.max(S.maxL, l)
    local pin = gp(8 + l, 4)
    PK.swing(S.pl, dt, PK.push(S.pl, pin.x, dt), 3)
    S.ghostFade = kit.follow(S.ghostFade, if S.dragging then 1 else 0.25, if S.dragging then 12 else 1.5, dt)
    S.ghostT += dt
    if S.dragging and S.ghostT > 0.1 then
        S.ghostT = 0
        table.insert(S.ghosts, l)
        if #S.ghosts > 8 then
            table.remove(S.ghosts, 1)
        end
    end
    if not S.leanDone and S.leanMoved > 6 and S.maxL - S.minL > 4.5 then
        S.leanDone = true
        S.leanDoneAt = g.t
        g.done()
        g.say('l9s2done')
    end
end

local function advance3(g: G, dt: number)
    kit.spring(S.wob, 0, 900, 14, dt)
    if S.picked == 'height' then
        local pl = S.pl
        if PK.swing(pl, dt, 0, if S.settledAt >= 0 then 7 else 2.6) then
            S.landedAt = g.t
            pl.om += 0.5
            g.sfx('thud')
        end
        if S.landedAt >= 0 and S.settledAt < 0 and g.t - S.landedAt > 1.3 then
            S.settledAt = g.t
            g.sfx('snap')
            g.sfx('sparkle')
        end
        if S.settledAt >= 0 then
            pl.th = kit.follow(pl.th, 0, 8, dt)
        end
        if S.settledAt >= 0 and g.t - S.settledAt > 0.6 and not S.sqFoot then
            local f = gp(9, 7)
            sqGo(g, pose(f.x, f.y, 0), true)
        end
    elseif S.misses >= 2 and not S.hinted and g.t - S.wrongAt > 3 then
        S.hinted = true
        g.hint('The height goes straight down from a corner')
    end
end

local function advance4(g: G, dt: number)
    if plumbAdvance(g, dt) then
        local x = S.cx
        local fresh = true
        for _, d in S.drops do
            if math.abs(d - x) < 0.8 then
                fresh = false
            end
        end
        if not fresh then
            S.dup = true
            g.sfx('oops')
            g.say('l9s4same')
        elseif #S.drops < 3 then
            table.insert(S.drops, x)
            table.insert(S.dropAt, g.t)
            if #S.drops == 3 then
                S.allAt = g.t
                g.done()
                g.burst(560, 300, 40)
                g.say('l9s4done')
            else
                g.say(if #S.drops == 1 then 'l9s4one' else 'l9s4two')
            end
        end
    end
    -- after the third: the set square hops from foot to foot, clicking into each square corner
    if S.allAt >= 0 and S.hops < 3 and g.t - S.allAt > 1.6 + S.hops * 0.85 then
        S.hops += 1
        local x = S.drops[S.hops]
        local f = gp(x, 7)
        sqGo(g, pose(f.x, f.y, 0, sideAmong(x, S.drops)), true)
    end
end

local function sqAdvance(g: G)
    if not S.sqIn and g.t - S.sqAt >= 0.6 and S.sqAt > 0 then
        S.sqIn = true
        S.sqInAt = g.t
        if S.sqFoot then
            g.sfx('snap')
            if g.step == 1 and not S.sqSaid then
                S.sqSaid = true
                g.sayNext('l9s1sq')
            end
        else
            g.sfx('drop')
        end
    end
end

function L.advance(g: G, dt: number)
    S.held = kit.follow(S.held, if S.dragging then 1 else 0, 18, dt)
    if g.step == 1 then
        advance1(g, dt)
    elseif g.step == 2 then
        advance2(g, dt)
    elseif g.step == 3 then
        advance3(g, dt)
    else
        advance4(g, dt)
    end
    sqAdvance(g)
end

-- Drawing: the studio ---------------------------------------------------------------------------------

local function pencil(r: Renderer, x: number, y: number, rot: number)
    r:save()
    r:transform(Mat2D.withTranslation(x + 4, y + 8) * Mat2D.withRotation(rot))
    r:drawPath(kit.rrect(-80, -8, 170, 16, 6), kit.soft(kit.alpha(SHADOW, 0.35), 6))
    r:restore()
    r:save()
    r:transform(Mat2D.withTranslation(x, y) * Mat2D.withRotation(rot))
    -- eraser and ferrule
    r:drawPath(kit.rrect(-84, -7, 18, 14, 4), kit.fill(Color.rgb(240, 130, 140)))
    r:drawPath(kit.rect(-68, -7.5, 12, 15), kit.fill(Color.rgb(196, 200, 206)))
    r:drawPath(kit.line(-64, -7, -64, 7), kit.stroke(Color.rgb(150, 156, 164), 1.4))
    r:drawPath(kit.line(-60, -7, -60, 7), kit.stroke(Color.rgb(150, 156, 164), 1.4))
    -- body: three faces of a hexagonal pencil
    r:drawPath(kit.rect(-56, -7, 120, 14), kit.fill(Color.rgb(250, 196, 52)))
    r:drawPath(kit.rect(-56, -7, 120, 4), kit.fill(Color.rgb(255, 222, 120)))
    r:drawPath(kit.rect(-56, 3, 120, 4), kit.fill(Color.rgb(222, 160, 30)))
    -- the sharpened wood and its point
    local tip = Path.new()
    tip:moveTo(Vector.xy(64, -7))
    tip:lineTo(Vector.xy(88, 0))
    tip:lineTo(Vector.xy(64, 7))
    tip:close()
    r:drawPath(tip, kit.fill(Color.rgb(236, 200, 150)))
    local lead = Path.new()
    lead:moveTo(Vector.xy(80, -2.4))
    lead:lineTo(Vector.xy(88, 0))
    lead:lineTo(Vector.xy(80, 2.4))
    lead:close()
    r:drawPath(lead, kit.fill(Color.rgb(60, 60, 66)))
    r:drawPath(kit.rrect(-84, -7.5, 172, 15, 5), kit.stroke(kit.alpha(SHADOW, 0.35), 1.2))
    r:restore()
end

-- the desk, the cutting mat with its printed grid and numbers, a pencil
local function studio(g: G, r: Renderer)
    local f = g.fonts
    local bx, by, bw, bh = kit.BX, kit.BY, kit.BW, kit.BH
    r:drawPath(kit.rect(bx, by, bw, bh), kit.fill(DESK))
    local grain = kit.stroke(kit.alpha(DESK_GRAIN, 0.6), 2)
    for i = 0, 12 do
        local yy = by + 8 + i * 40
        local p = Path.new()
        p:moveTo(Vector.xy(bx, yy))
        p:cubicTo(Vector.xy(bx + 400, yy - 8), Vector.xy(bx + 800, yy + 9), Vector.xy(bx + bw, yy - 2))
        r:drawPath(p, grain)
    end
    -- the mat lies on the desk
    r:drawPath(kit.rrect(MX + 4, MY + 9, MW, MH, 16), kit.soft(kit.alpha(SHADOW, 0.4), 12))
    local mat = kit.rrect(MX, MY, MW, MH, 16)
    local mg = Gradient.linear(Vector.xy(MX, MY), Vector.xy(MX + MW, MY + MH), {
        { position = 0, color = kit.mix(MAT, kit.SURFACE, 0.06) },
        { position = 1, color = kit.mix(MAT, MAT_DK, 0.5) },
    })
    r:drawPath(mat, Paint.with({ gradient = mg }))
    r:save()
    r:clipPath(mat)
    local minor = Path.new()
    local major = Path.new()
    for i = 0, 23 do
        local x = GX + i * U
        local p = if i % 5 == 0 then major else minor
        p:moveTo(Vector.xy(x, MY + 20))
        p:lineTo(Vector.xy(x, MY + MH - 6))
    end
    for j = 0, 8 do
        local y = GY + j * U
        local p = if j % 5 == 0 then major else minor
        p:moveTo(Vector.xy(MX + 22, y))
        p:lineTo(Vector.xy(MX + MW - 6, y))
    end
    r:drawPath(minor, kit.stroke(kit.alpha(kit.SURFACE, 0.13), 1.3))
    r:drawPath(major, kit.stroke(kit.alpha(kit.SURFACE, 0.26), 2))
    -- the printed numbers along two edges
    for i = 1, 22 do
        kit.label(r, f, tostring(i), f.mono, 10, kit.alpha(kit.SURFACE, 0.42), GX + i * U, MY + 12, 0.5)
    end
    for j = 1, 8 do
        kit.label(r, f, tostring(j), f.mono, 10, kit.alpha(kit.SURFACE, 0.42), MX + 12, GY + j * U, 0.5)
    end
    r:restore()
    r:drawPath(mat, kit.stroke(MAT_DK, 2.5))
    pencil(r, 1158, 548, -1.15)
end

-- a tile of coloured acrylic, a few millimetres thick: it lifts, and you can see the mat's squares through it
local function tile(r: Renderer, P: { Vector }, c: Color, lift: number)
    r:drawPath(kit.poly(kit.offset(P, 4 + 8 * lift, 10 + 16 * lift)), kit.soft(kit.alpha(SHADOW, 0.42 + 0.08 * lift), 8 + 12 * lift))
    local Q = kit.offset(P, 0, -10 * lift)
    local TH = 7
    local side = kit.fill(kit.mix(c, kit.INK, 0.38))
    r:drawPath(kit.poly(kit.offset(Q, 0, TH)), side)
    for i = 1, #Q do
        local a, b = Q[i], Q[(i % #Q) + 1]
        r:drawPath(kit.poly({ a, b, Vector.xy(b.x, b.y + TH), Vector.xy(a.x, a.y + TH) }), side)
    end
    local x0, y0, x1, y1 = kit.bbox(Q)
    local face = kit.poly(Q)
    local grad = Gradient.linear(Vector.xy(x0, y0), Vector.xy(x1, y1), {
        { position = 0, color = kit.mix(c, kit.SURFACE, 0.22) },
        { position = 0.5, color = c },
        { position = 1, color = kit.mix(c, kit.INK, 0.1) },
    })
    r:drawPath(face, Paint.with({ gradient = grad }))
    r:save()
    r:clipPath(face)
    -- the mat's squares, seen through the tile
    local gl = Path.new()
    local gy0 = GY - 10 * lift
    for i = math.floor((x0 - GX) / U), math.ceil((x1 - GX) / U) do
        gl:moveTo(Vector.xy(GX + i * U, y0))
        gl:lineTo(Vector.xy(GX + i * U, y1))
    end
    for j = math.floor((y0 - gy0) / U), math.ceil((y1 - gy0) / U) do
        gl:moveTo(Vector.xy(x0, gy0 + j * U))
        gl:lineTo(Vector.xy(x1, gy0 + j * U))
    end
    r:drawPath(gl, kit.stroke(kit.alpha(kit.SURFACE, 0.3), 1.3))
    -- a sheen across the acrylic
    local w, h = x1 - x0, y1 - y0
    r:drawPath(kit.poly({ Vector.xy(x0 + w * 0.18, y0 - 4), Vector.xy(x0 + w * 0.3, y0 - 4), Vector.xy(x0 + w * 0.3 - h * 0.7, y1 + 4), Vector.xy(x0 + w * 0.18 - h * 0.7, y1 + 4) }), kit.fill(kit.alpha(kit.SURFACE, 0.16)))
    r:drawPath(face, kit.stroke(kit.alpha(kit.SURFACE, 0.45), 3))
    r:restore()
    r:drawPath(face, kit.stroke(kit.mix(c, kit.INK, 0.45), 2))
end

-- the clear set square: square corner at (0, 0), legs running right and up
local SQ_LEG = 92

local function sqPath(): Path
    local p = Path.new()
    p:moveTo(Vector.xy(0, 0))
    p:lineTo(Vector.xy(SQ_LEG, 0))
    p:lineTo(Vector.xy(0, -SQ_LEG))
    p:close()
    -- the hole, wound the other way
    local a, b = 14, SQ_LEG - 40
    p:moveTo(Vector.xy(a, -a))
    p:lineTo(Vector.xy(a, -b))
    p:lineTo(Vector.xy(b, -a))
    p:close()
    return p
end

local function setSquare(g: G, r: Renderer)
    local k = kit.clamp((g.t - S.sqAt) / 0.6, 0, 1)
    local e = kit.smooth(k)
    local x = kit.lerp(S.sqFrom.x, S.sqTo.x, e)
    local y = kit.lerp(S.sqFrom.y, S.sqTo.y, e)
    local rot = kit.lerp(S.sqFrom.rot, S.sqTo.rot, e)
    local side = if e < 0.5 then S.sqFrom.side else S.sqTo.side
    local lift = math.sin(k * math.pi)
    local sc = 1
    if S.sqIn then
        -- it clicks in: a small overshoot and a wobble that dies away
        local a = g.t - S.sqInAt
        rot += 0.06 * math.sin(a * 32) * math.exp(-a * 9)
        sc = 1 + 0.07 * math.sin(kit.clamp(a * 7, 0, 1) * math.pi)
    end
    local path = sqPath()
    r:save()
    r:transform(Mat2D.withTranslation(x + 3 + 10 * lift, y + 6 + 18 * lift) * Mat2D.withRotation(rot) * Mat2D.withScale(side, 1))
    r:drawPath(path, kit.soft(kit.alpha(SHADOW, 0.28 - 0.08 * lift), 5 + 9 * lift))
    r:restore()
    r:save()
    r:transform(Mat2D.withTranslation(x, y - 14 * lift) * Mat2D.withRotation(rot) * Mat2D.withScale(sc * side, sc))
    r:drawPath(path, kit.fill(kit.alpha(GLASS, 0.45)))
    local outer = Path.new()
    outer:moveTo(Vector.xy(0, 0))
    outer:lineTo(Vector.xy(SQ_LEG, 0))
    outer:lineTo(Vector.xy(0, -SQ_LEG))
    outer:close()
    r:drawPath(outer, kit.stroke(kit.alpha(SHADOW, 0.55), 4.4))
    r:drawPath(outer, kit.stroke(kit.alpha(kit.SURFACE, 0.95), 2.4))
    local ticks = Path.new()
    for i = 1, 8 do
        local d = i * 9
        local l = if i % 5 == 0 then 7 else 4
        ticks:moveTo(Vector.xy(d, 0))
        ticks:lineTo(Vector.xy(d, -l))
        ticks:moveTo(Vector.xy(0, -d))
        ticks:lineTo(Vector.xy(l, -d))
    end
    r:drawPath(ticks, kit.stroke(kit.alpha(kit.SURFACE, 0.85), 1.3))
    local a, b = 14, SQ_LEG - 40
    r:drawPath(kit.poly({ Vector.xy(a, -a), Vector.xy(a, -b), Vector.xy(b, -a) }), kit.stroke(kit.alpha(kit.SURFACE, 0.75), 1.6))
    r:restore()
    -- "90°" pops up beside it once it is in a corner
    if S.sqIn and S.sqFoot and g.step ~= 4 then
        local pk = kit.clamp((g.t - S.sqInAt) * 3, 0, 1)
        if pk > 0 then
            local s = kit.back(pk)
            r:save()
            r:transform(Mat2D.withTranslation(x + side * (SQ_LEG + 26), y - 30) * Mat2D.withScale(s, s))
            r:drawPath(kit.rrect(-30, -16, 60, 32, 16), kit.fill(kit.SURFACE))
            r:drawPath(kit.rrect(-30, -16, 60, 32, 16), kit.stroke(kit.ACCENT, 2))
            kit.label(r, g.fonts, '90°', g.fonts.display, 19, kit.ACCENT_DEEP, 0, 0, 0.5)
            r:restore()
        end
    end
end

-- Drawing: pieces ---------------------------------------------------------------------------------------

-- the dashed height, its square corner and (once counted) the squares numbered down it
local function heightLine(g: G, r: Renderer, top: Vector, foot: Vector, k: number, count: number, since: number, side: number)
    if k <= 0.01 then
        return
    end
    local f = g.fonts
    r:save()
    r:modulateOpacity(k)
    r:drawPath(kit.line(top.x, top.y, foot.x, foot.y), kit.stroke(kit.alpha(kit.SURFACE, 0.55), 8))
    r:drawPath(kit.dashed(top.x, top.y, foot.x, foot.y - PK.BOB, 9, 7), kit.stroke(kit.INK, 3))
    r:restore()
    local ck = kit.back(kit.clamp((g.t - since - 0.15) * 3, 0, 1))
    if ck > 0 then
        r:drawPath(kit.corner(foot, side, 0, 0, -1, 20 * ck), kit.stroke(kit.SURFACE, 6))
        r:drawPath(kit.corner(foot, side, 0, 0, -1, 20 * ck), kit.stroke(kit.ACCENT_DEEP, 3))
    end
    for i = 1, count do
        local pk = kit.back(kit.clamp((g.t - since - 0.35 - (i - 1) * 0.17) * 5, 0, 1))
        local yy = top.y + (i - 0.5) * U
        local tick = top.y + i * U
        r:drawPath(kit.line(top.x - 7, tick, top.x + 7, tick), kit.stroke(kit.INK, 2.5))
        r:save()
        r:transform(Mat2D.withTranslation(top.x - side * 22, yy) * Mat2D.withScale(pk, pk))
        r:drawPath(kit.circle(1, 2, 12), kit.soft(kit.alpha(SHADOW, 0.25), 4))
        r:drawPath(kit.circle(0, 0, 12), kit.fill(kit.SURFACE))
        kit.label(r, f, tostring(i), f.display, 15, kit.ACCENT_DEEP, 0, 1, 0.5)
        r:restore()
    end
end

-- the bob on its clamp: the thread, the steel weight, and the gold knob that carries it
local function bob(g: G, r: Renderer, pin: Vector, knob: boolean)
    PK.draw(r, S.pl, pin.x, pin.y)
    if knob then
        kit.knob(r, g.t, pin.x, pin.y, 'slide', S.held, not S.touched and not S.dragging)
    end
end

local function finger(g: G, r: Renderer, from: Vector, dx: number)
    if S.touched or S.dragging or g.age < 6 then
        return
    end
    local k = ((g.age - 6) % 2.8) / 2.8
    local a = if k < 0.12 then k / 0.12 elseif k > 0.8 then math.max(0, (0.95 - k) / 0.15) else 1
    kit.finger(r, kit.lerp(from.x, from.x + dx, kit.smooth((k - 0.15) / 0.55)), from.y + 4, a, k > 0.12 and k < 0.75)
end

local function trackDraw(g: G, r: Renderer, row: number, lo: number, hi: number)
    if S.phase ~= 'ready' and not S.dragging then
        return
    end
    local a, b = gp(lo, row), gp(hi, row)
    r:drawPath(kit.line(a.x, a.y, b.x, b.y), kit.stroke(kit.alpha(SHADOW, 0.35), 9))
    r:drawPath(kit.dashed(a.x, a.y, b.x, b.y, 8, 7, g.t * 14), kit.stroke(kit.GOLD, 3))
end

-- a white card with a mono title, for the readouts on the right of the mat
local function card(r: Renderer, x: number, y: number, w: number, h: number)
    r:drawPath(kit.rrect(x + 3, y + 8, w, h, 20), kit.soft(kit.alpha(SHADOW, 0.3), 14))
    r:drawPath(kit.rrect(x, y, w, h, 20), kit.fill(kit.SURFACE))
end

local function drawStep1(g: G, r: Renderer)
    local f = g.fonts
    tile(r, gpts(P1), TILE[1], 0)
    kit.halo(r, f, 'base 6', f.body, 18, kit.INK, gp(7, 7).x, gp(7, 7).y + 36, 0.5)
    trackDraw(g, r, 3, LO1, HI1)
    local pin = pinAt()
    local settled = S.phase == 'settled'
    if settled then
        local k = kit.clamp((g.t - S.settledAt) * 3, 0, 1)
        heightLine(g, r, pin, gp(S.dropX, 7), k, S.counted, S.settledAt, sideFor(S.dropX, 4, 10))
        -- the slanted side, for contrast
        local sk = kit.clamp((g.t - S.settledAt - 1.2) * 2, 0, 1)
        if sk > 0 then
            local a, b = gp(10, 7), gp(12, 3)
            r:drawPath(kit.line(a.x, a.y, b.x, b.y), kit.stroke(kit.alpha(kit.ORANGE, sk), 6))
            r:save()
            r:modulateOpacity(sk)
            kit.halo(r, f, 'slanted side: it leans', f.body, 17, kit.ORANGE, gp(11, 5).x + 26, gp(11, 5).y, 0)
            r:restore()
        end
    end
    bob(g, r, pin, true)
    if not S.touched and S.phase == 'ready' then
        kit.halo(r, f, 'plumb bob', f.body, 16, kit.INK_SOFT, pin.x + 30, pin.y - 34, 0)
    end
    finger(g, r, pin, 1.6 * U)
    local val = if S.counted >= 4 then '4 squares' elseif S.counted > 0 then tostring(S.counted) else '?'
    local pop = if settled then (g.t - S.settledAt - 0.35 - (S.counted - 1) * 0.17) * 4 else 0
    kit.sign(r, f, 'HEIGHT', val, pop, 960, 206)
end

local function drawStep2(g: G, r: Renderer)
    local f = g.fonts
    local l = S.lean.x
    local A, B = gp(4, 7), gp(12, 7)
    local C, D = gp(12 + l, 4), gp(4 + l, 4)
    -- ghosts of where the slanted side has been
    for i, gl in S.ghosts do
        local ga = 0.08 * i * S.ghostFade
        local c = gp(12 + gl, 4)
        r:drawPath(kit.line(B.x, B.y, c.x, c.y), kit.stroke(kit.alpha(kit.ORANGE, ga), 3))
    end
    tile(r, { A, B, C, D }, TILE[2], 0)
    r:drawPath(kit.line(B.x, B.y, C.x, C.y), kit.stroke(kit.ORANGE, 6))
    -- the height: the thread, dashed once it hangs still
    local pl = S.pl
    local pin = gp(8 + l, 4)
    local foot = gp(8 + l, 7)
    local still = 1 - kit.clamp(math.abs(pl.th) * 14 + math.abs(pl.om) * 0.8, 0, 1)
    if still > 0.02 then
        r:save()
        r:modulateOpacity(still)
        r:drawPath(kit.dashed(pin.x, pin.y, foot.x, foot.y - PK.BOB, 9, 7), kit.stroke(kit.INK, 3))
        local side = sideFor(8 + l, 4, 12)
        r:drawPath(kit.corner(foot, side, 0, 0, -1, 16), kit.stroke(kit.SURFACE, 6))
        r:drawPath(kit.corner(foot, side, 0, 0, -1, 16), kit.stroke(kit.ACCENT_DEEP, 3))
        r:restore()
    end
    PK.draw(r, pl, pin.x, pin.y)
    local slant = math.sqrt(l * l + 9)
    kit.halo(r, f, '3', f.display, 20, kit.ACCENT_DEEP, pin.x - 20, pin.y + 1.5 * U, 1)
    local mx, my = (B.x + C.x) / 2, (B.y + C.y) / 2
    kit.halo(r, f, string.format('%.1f', slant), f.display, 20, kit.ORANGE, mx + 22, my, 0)
    kit.halo(r, f, 'base 8', f.body, 18, kit.INK, (A.x + B.x) / 2, A.y + 36, 0.5)
    kit.knob(r, g.t, pin.x, pin.y, 'slide', S.held, not S.touched and not S.dragging)
    finger(g, r, pin, -2.4 * U)
    -- the readout: one bar grows and shrinks, one never moves
    local x, y, w, h = 920, 196, 272, 262
    card(r, x, y, w, h)
    kit.label(r, f, 'LENGTHS, IN SQUARES', f.mono, 12, kit.INK_SOFT, x + 22, y + 28, 0)
    local bw = w - 44
    local function row(yy: number, name: string, v: number, c: Color, glow: number)
        if glow > 0.02 then
            r:drawPath(kit.rrect(x + 10, yy - 22, w - 20, 70, 14), kit.fill(kit.alpha(kit.ACCENT_WASH, glow)))
        end
        kit.label(r, f, name, f.body, 17, c, x + 22, yy, 0)
        kit.label(r, f, string.format('%.1f', v), f.display, 28, c, x + w - 22, yy, 1)
        r:drawPath(kit.rrect(x + 22, yy + 22, bw, 14, 7), kit.fill(kit.PAGE))
        r:drawPath(kit.rrect(x + 22, yy + 22, bw * v / 6, 14, 7), kit.fill(c))
        r:drawPath(kit.rrect(x + 26, yy + 24, math.max(0, bw * v / 6 - 8), 4, 2), kit.fill(kit.alpha(kit.SURFACE, 0.35)))
    end
    row(y + 66, 'slanted side', slant, kit.ORANGE, 0)
    row(y + 146, 'height', 3, kit.ACCENT, S.held * (0.6 + 0.4 * math.sin(g.t * 8)))
    local note = if S.leanDone then 'The height never leans.' elseif S.dragging then 'Watch the height…' else 'Push the top both ways.'
    kit.label(r, f, note, f.body, 15, if S.leanDone then kit.ACCENT_DEEP else kit.INK_SOFT, x + 22, y + h - 30, 0)
end

-- step 3: the three sticks
local function sticks(): { [string]: { Vector } }
    return {
        slant = { gp(5, 7), gp(9, 4) },
        base = { gp(5, 7), gp(12, 7) },
        height = { gp(9, 4), gp(9, 7) },
    }
end

local KB = { 'slant', 'height', 'base' }

local function lineAt(p: Vector): string
    local best, bestD = '', 22
    for k, ab in sticks() do
        local d = PK.segDist(p, ab[1], ab[2])
        if d < bestD then
            best, bestD = k, d
        end
    end
    return best
end

local function stick(r: Renderer, a: Vector, b: Vector, lifted: number, tint: Color?, rot: number)
    local c = Vector.xy((a.x + b.x) / 2, (a.y + b.y) / 2)
    local P = kit.rotate({ a, b }, c, rot)
    local A, B = kit.offset(P, 0, -4 * lifted)[1], kit.offset(P, 0, -4 * lifted)[2]
    r:drawPath(kit.line(P[1].x + 3, P[1].y + 6 + 3 * lifted, P[2].x + 3, P[2].y + 6 + 3 * lifted), Paint.with({ style = 'stroke', thickness = 12, color = kit.alpha(SHADOW, 0.35), cap = 'round', feather = 6 }))
    r:drawPath(kit.line(A.x, A.y, B.x, B.y), kit.stroke(STICK_EDGE, 14))
    r:drawPath(kit.line(A.x, A.y, B.x, B.y), kit.stroke(tint or STICK, 10))
    r:drawPath(kit.line(A.x, A.y - 2, B.x, B.y - 2), kit.stroke(kit.alpha(kit.SURFACE, 0.55), 2.5))
end

local function drawStep3(g: G, r: Renderer)
    local f = g.fonts
    tile(r, gpts(P3), TILE[3], 0)
    local sg = sticks()
    local right = S.picked == 'height'
    for _, k in { 'base', 'slant', 'height' } do
        local ab = sg[k]
        local tint: Color? = nil
        local lifted = 0
        local rot = 0
        if S.wrong == k and g.t - S.wrongAt < 1.1 then
            tint = kit.mix(STICK, kit.RED, 0.75)
            rot = S.wob.x
        elseif right and k == 'height' then
            tint = kit.mix(STICK, kit.ACCENT, 0.35)
        elseif right and k == 'slant' then
            tint = kit.mix(STICK, kit.ORANGE, 0.55)
        elseif S.picked == '' and ((S.kb > 0 and KB[S.kb] == k) or S.hoverLine == k) then
            lifted = 1
            tint = kit.mix(STICK, kit.GOLD, 0.45)
        end
        if not right and k == 'height' and S.misses >= 2 and g.t - S.wrongAt > 2.5 then
            -- after two misses, the height glows gently
            local pk = 0.3 + 0.3 * math.sin(g.t * 5)
            r:drawPath(kit.line(ab[1].x, ab[1].y, ab[2].x, ab[2].y), kit.stroke(kit.alpha(kit.GOLD, 0.35 + pk), 24))
        end
        if S.picked == '' and S.kb > 0 and KB[S.kb] == k then
            r:drawPath(kit.line(ab[1].x, ab[1].y, ab[2].x, ab[2].y), kit.stroke(kit.alpha(kit.BLUE, 0.45), 22))
        end
        stick(r, ab[1], ab[2], lifted, tint, rot)
    end
    -- the lengths, in squares
    local sl = sg.slant
    kit.halo(r, f, '5', f.display, 20, if right then kit.ORANGE else kit.INK, (sl[1].x + sl[2].x) / 2 - 30, (sl[1].y + sl[2].y) / 2 - 22, 0.5)
    kit.halo(r, f, '7', f.display, 20, kit.INK, gp(8.5, 7).x, gp(8.5, 7).y + 36, 0.5)
    kit.halo(r, f, '3', f.display, 20, if right then kit.ACCENT_DEEP else kit.INK, gp(9, 4.6).x + 30, gp(9, 4.6).y, 0.5)
    if right then
        local pl = S.pl
        local D, F = gp(9, 4), gp(9, 7)
        PK.draw(r, pl, D.x, D.y)
        if S.settledAt >= 0 then
            local ck = kit.back(kit.clamp((g.t - S.settledAt) * 3, 0, 1))
            r:drawPath(kit.corner(F, 1, 0, 0, -1, 20 * ck), kit.stroke(kit.SURFACE, 6))
            r:drawPath(kit.corner(F, 1, 0, 0, -1, 20 * ck), kit.stroke(kit.ACCENT_DEEP, 3))
            local k = kit.clamp((g.t - S.settledAt - 0.3) * 2.5, 0, 1)
            r:save()
            r:modulateOpacity(k)
            kit.halo(r, f, 'height', f.body, 17, kit.ACCENT_DEEP, gp(9, 4.6).x + 52, gp(9, 4.6).y, 0)
            kit.halo(r, f, 'slanted side', f.body, 17, kit.ORANGE, gp(7, 5.5).x - 30, gp(7, 5.5).y + 22, 1)
            kit.halo(r, f, 'base', f.body, 17, kit.INK, gp(8.5, 7).x + 28, gp(8.5, 7).y + 36, 0)
            r:restore()
        end
    elseif S.picked == '' and S.misses == 0 then
        kit.label(r, f, 'Tap a stick', f.body, 16, kit.alpha(kit.SURFACE, 0.8), gp(10.5, 7).x, gp(10.5, 7).y + 72, 0.5)
    end
end

local function drawStep4(g: G, r: Renderer)
    local f = g.fonts
    tile(r, gpts(P4), TILE[4], 0)
    -- the slanted sides, for contrast
    local a, b = gp(13, 7), gp(10, 3)
    r:drawPath(kit.line(a.x, a.y, b.x, b.y), kit.stroke(kit.alpha(kit.ORANGE, 0.9), 5))
    kit.halo(r, f, 'slanted side 5', f.body, 16, kit.ORANGE, gp(11.5, 5).x + 24, gp(11.5, 5).y, 0)
    kit.halo(r, f, 'base 10', f.body, 18, kit.INK, gp(8, 7).x, gp(8, 7).y + 36, 0.5)
    -- the heights already found, pinned in place
    for i, x in S.drops do
        local top, foot = gp(x, 3), gp(x, 7)
        local active = S.phase == 'settled' and not S.dup and math.abs(S.dropX - x) < 0.01
        if not active then
            local glow = 0
            if S.allAt >= 0 then
                local sweep = g.t - S.allAt - 0.5 - (i - 1) * 0.3
                glow = if sweep > 0 and sweep < 0.6 then math.sin(sweep / 0.6 * math.pi) else 0
            end
            r:drawPath(kit.line(top.x, top.y, foot.x, foot.y), kit.stroke(kit.alpha(kit.GOLD, 0.25 + 0.6 * glow), 8 + 8 * glow))
            r:drawPath(kit.dashed(top.x, top.y, foot.x, foot.y, 9, 7), kit.stroke(kit.INK, 3))
            r:drawPath(kit.corner(foot, 1, 0, 0, -1, 16), kit.stroke(kit.SURFACE, 6))
            r:drawPath(kit.corner(foot, 1, 0, 0, -1, 16), kit.stroke(kit.ACCENT_DEEP, 3))
            kit.halo(r, f, '4', f.display, 18, kit.ACCENT_DEEP, top.x - 16, top.y + 2 * U, 1)
        end
    end
    local row, lo, hi = track(4)
    trackDraw(g, r, row, lo, hi)
    local pin = pinAt()
    if S.phase == 'settled' then
        local k = kit.clamp((g.t - S.settledAt) * 3, 0, 1)
        if S.dup then
            k *= 1 - kit.clamp((g.t - S.settledAt - 1.6) * 2, 0, 1)
        end
        heightLine(g, r, pin, gp(S.dropX, 7), k, if S.dup then 0 else S.counted, S.settledAt, sideAmong(S.dropX, S.drops))
    end
    bob(g, r, pin, S.allAt < 0)
    finger(g, r, pin, 2 * U)
    -- the tally
    local x, y, w, h = 930, 196, 250, 150
    card(r, x, y, w, h)
    kit.label(r, f, 'HEIGHTS FOUND', f.mono, 12, kit.INK_SOFT, x + 22, y + 28, 0)
    for i = 1, 3 do
        local sx, sy = x + 22 + (i - 1) * 72, y + 50
        local filled = i <= #S.drops
        r:drawPath(kit.rrect(sx, sy, 60, 60, 14), kit.fill(if filled then kit.ACCENT_WASH else kit.PAGE))
        r:drawPath(kit.rrect(sx, sy, 60, 60, 14), kit.stroke(if filled then kit.alpha(kit.ACCENT, 0.5) else kit.LINE, 1.5))
        if filled then
            local pk = kit.back(kit.clamp((g.t - S.dropAt[i] - 0.9) * 3, 0, 1))
            r:save()
            r:transform(Mat2D.withTranslation(sx + 30, sy + 30) * Mat2D.withScale(pk, pk))
            kit.label(r, f, '4', f.display, 30, kit.ACCENT_DEEP, 0, 2, 0.5)
            r:restore()
        else
            kit.label(r, f, '?', f.display, 26, kit.INK_FAINT, sx + 30, sy + 32, 0.5)
        end
    end
    kit.label(r, f, 'squares, each time', f.body, 14, kit.INK_SOFT, x + 22, y + h - 22, 0)
    if S.allAt >= 0 then
        kit.rule(r, f, 'The height meets the base at 90°', 'from anywhere along the top: 4 squares', kit.clamp((g.t - S.allAt - 1.2) * 1.5, 0, 1), 470, 186)
    end
end

function L.draw(g: G, r: Renderer)
    studio(g, r)
    if g.step == 1 then
        drawStep1(g, r)
    elseif g.step == 2 then
        drawStep2(g, r)
    elseif g.step == 3 then
        drawStep3(g, r)
    else
        drawStep4(g, r)
    end
    if g.step ~= 2 then
        setSquare(g, r)
    end
end

-- Input --------------------------------------------------------------------------------------------------

local function pick3(g: G, k: string)
    if k == 'height' then
        S.picked = 'height'
        S.pl = PK.new(0)
        S.pl.target = 3 * U
        S.pl.falling = true
        S.landedAt, S.settledAt = -1, -1
        g.sfx('snap')
        g.sfx('chime')
        g.report('l9s3', true, 'height')
        g.hint('')
        g.done()
        g.say('l9s3done')
        return
    end
    S.wrong, S.wrongAt = k, g.t
    S.misses += 1
    S.wob.x, S.wob.v = 0, 4.5
    g.sfx('oops')
    g.shake(3)
    if k == 'base' then
        g.report('l9s3', false, 'base')
        g.say('l9s3base')
    else
        S.slants += 1
        g.report('l9s3', false, 'slanted side', 'slant')
        g.say(if S.slants == 1 then 'l9s3slant' else 'l9s3slant2')
    end
end

local function plumbStep(g: G): boolean
    return (g.step == 1) or (g.step == 4 and S.allAt < 0)
end

function L.down(g: G, p: Vector): boolean
    if plumbStep(g) then
        local pin = pinAt()
        if kit.dist(p, Vector.xy(pin.x, pin.y)) < 44 or (S.phase == 'ready' and kit.dist(p, Vector.xy(pin.x, pin.y + S.pl.len)) < 26) then
            S.dragging = true
            S.touched = true
            S.grabDX = p.x - pin.x
            if S.phase ~= 'ready' then
                lift(g)
                sqHome(g)
            else
                g.sfx('pickup')
            end
            return true
        end
    elseif g.step == 2 then
        local pin = gp(8 + S.lean.x, 4)
        if kit.dist(p, pin) < 46 then
            S.dragging = true
            S.touched = true
            S.grabDX = p.x - pin.x
            g.sfx('pickup')
            return true
        end
    elseif g.step == 3 and S.picked == '' then
        local k = lineAt(p)
        if k ~= '' then
            pick3(g, k)
            return true
        end
    end
    return false
end

function L.move(g: G, p: Vector)
    if plumbStep(g) and S.dragging then
        local row, lo, hi = track(g.step)
        local _ = row
        local x = kit.clamp((p.x - S.grabDX - GX) / U, lo, hi)
        if math.floor(x * 2) ~= math.floor(S.cxTarget * 2) then
            g.tick(math.floor(x * 2))
        end
        S.cxTarget = x
    elseif g.step == 2 and S.dragging then
        local l = kit.clamp((p.x - S.grabDX - GX) / U - 8, LEAN_MIN, LEAN_MAX)
        if math.floor(l * 2) ~= math.floor(S.leanTarget * 2) then
            g.tick(math.floor(l * 2) + 8)
        end
        S.leanTarget = l
    elseif g.step == 3 then
        S.hoverLine = if S.picked == '' then lineAt(p) else ''
    end
end

function L.up(g: G, p: Vector)
    if S.dragging then
        S.dragging = false
        if plumbStep(g) then
            drop(g)
        else
            g.sfx('drop')
        end
    end
end

-- Keys: steps 1 and 4 → ← slide the bob, Space or Enter lets it go · step 2 → ← push the top ·
-- step 3 ↑ ↓ choose a stick, Space or Enter taps it. Once a step is done, → and ← change step again.
function L.key(g: G, k: number): boolean
    local enter = k == 32 or k == 257 or k == 335
    local busy = (g.step == 1 and not g.isDone()) or (g.step == 4 and S.allAt < 0)
    if busy then
        if k == 262 or k == 263 then
            if S.phase ~= 'ready' then
                lift(g)
                sqHome(g)
            end
            S.touched = true
            local _, lo, hi = track(g.step)
            S.cxTarget = kit.clamp(S.cxTarget + (if k == 262 then 0.5 else -0.5), lo, hi)
            g.tick(math.floor(S.cxTarget * 2))
            return true
        elseif enter then
            S.touched = true
            if S.phase == 'ready' then
                drop(g)
            else
                lift(g)
                sqHome(g)
            end
            return true
        end
    elseif g.step == 2 and not S.leanDone then
        if k == 262 or k == 263 then
            S.touched = true
            S.leanTarget = kit.clamp(math.floor(S.leanTarget + 0.5) + (if k == 262 then 1 else -1), LEAN_MIN, LEAN_MAX)
            g.tick(math.floor(S.leanTarget * 2) + 8)
            return true
        end
    elseif g.step == 3 and S.picked == '' then
        if k == 264 or k == 265 then
            local n = #KB
            if S.kb == 0 then
                S.kb = if k == 264 then 1 else n
            else
                S.kb = ((S.kb - 1 + (if k == 264 then 1 else -1)) % n) + 1
            end
            S.hoverLine = ''
            g.sfx('tick2')
            return true
        elseif enter then
            if S.kb == 0 then
                S.kb = 1
                g.sfx('tick2')
            else
                pick3(g, KB[S.kb])
            end
            return true
        end
    end
    return false
end

-- the home card (the module's own lesson list shows lessons 1 to 8; this one opens from the trail)
local thumbPl = PK.new(46)

function L.thumb(g: G, r: Renderer, x: number, y: number, w: number, h: number)
    r:drawPath(kit.rect(x, y, w, h), kit.fill(MAT))
    local gl = Path.new()
    for i = 0, math.floor(w / 18) do
        gl:moveTo(Vector.xy(x + i * 18, y))
        gl:lineTo(Vector.xy(x + i * 18, y + h))
    end
    for j = 0, math.floor(h / 18) do
        gl:moveTo(Vector.xy(x, y + j * 18))
        gl:lineTo(Vector.xy(x + w, y + j * 18))
    end
    r:drawPath(gl, kit.stroke(kit.alpha(kit.SURFACE, 0.14), 1))
    local P = { Vector.xy(x + 40, y + 92), Vector.xy(x + 166, y + 92), Vector.xy(x + 206, y + 28), Vector.xy(x + 80, y + 28) }
    tile(r, P, TILE[1], 0)
    thumbPl.len = 64
    thumbPl.th = math.sin(g.t * 2.4) * 0.25
    PK.draw(r, thumbPl, x + 136, y + 28)
end

return L
