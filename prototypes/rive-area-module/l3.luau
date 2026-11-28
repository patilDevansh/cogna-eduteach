-- Lesson 3 · The corner house (the parallelogram: base × height)
-- Day 3 · Kavin's kolam patch, part 3. Where the street bends, the corner house's patch leans. Kavin thinks it is
-- smaller than his own (6 by 4, from lesson 1). The student finds out.
--   1. swipe one straight cut down the leaning patch (a slanted or short swipe gets a reaction)
--   2. pick up the cut-off piece and set it in at the other end: it clicks into a rectangle, 6 × 4 = 24
--   3. lean another patch with a gold handle: the slanted side changes, the squares inside stay 18
--   4. work one out on the keypad: base 7, height 4, slanted side 5 → 28 (35 used the slant; 11 added)
-- The street, the corner house and the patch look come from lesson 1 (require('l1').art).

local kit = require('kit')
local people = require('people')
local l1 = require('l1')
local Art = l1.art
type G = kit.G
type Keypad = kit.Keypad
type StreetOpts = l1.StreetOpts

type Bit = { x: number, y: number, vx: number, vy: number, rot: number, spin: number, life: number }

type St = {
    -- step 1
    cutX: number, -- the grid line it was cut on (squares), or -1
    knifeA: Vector?,
    knifeB: Vector?,
    knifeState: number, -- 0 drawing · 1 ready (straight and long enough) · 2 slanted
    misses: number,
    cutAt: number,
    bits: { Bit },
    split: kit.Spring, -- how far apart the pieces jumped
    -- step 2
    px: number, -- the piece's offset (px)
    py: number,
    dragging: boolean,
    grabDX: number,
    grabDY: number,
    held: number,
    tilt: number,
    lastX: number,
    snapped: boolean,
    snapAt: number,
    flying: boolean,
    flyFrom: Vector,
    flyT: number,
    -- step 3
    lean: number,
    leanTarget: number,
    leanMoved: number,
    leanDone: boolean,
    leanDoneAt: number,
    -- step 4
    kp: Keypad,
    solvedAt: number,
    wrongAt: number,
    counted: number,
}

local L = {}

local GROUND = Art.GROUND
local STREET: StreetOpts = { ground = GROUND, tower = 196, palm = 70, bare = 0, corner = true }
-- steps 1 and 2: the corner house's patch, in front of the bend
local U = 52
local FX, FY = 560, 334
local LEANING = { Vector.xy(0, 4), Vector.xy(6, 4), Vector.xy(8, 0), Vector.xy(2, 0) }
-- step 3: a patch to lean
local U2 = 46
local F2X, F2Y = 600, 358
-- step 4: one more leaning patch
local U4 = 40
local F4X, F4Y = 330, 352

local S: St = {
    cutX = -1, knifeA = nil, knifeB = nil, knifeState = 0, misses = 0, cutAt = -1, bits = {}, split = { x = 0, v = 0 },
    px = 0, py = 0, dragging = false, grabDX = 0, grabDY = 0, held = 0, tilt = 0, lastX = 0, snapped = false, snapAt = -1,
    flying = false, flyFrom = Vector.xy(0, 0), flyT = 0,
    lean = 1.5, leanTarget = 1.5, leanMoved = 0, leanDone = false, leanDoneAt = -1,
    kp = kit.keypad(930, 170), solvedAt = -1, wrongAt = -9, counted = 0,
}

local kavin = people.new(people.CAST.kavin, -100)
local paati = people.new(people.CAST.paati, -100)
local kavinUntil, paatiUntil = 0, 0
local tipDone = false
local thumbKavin = people.new(people.CAST.kavin, 0)

-- one of them speaks at a time
local function kavinSays(g: G, a: string, b: string?, dur: number)
    people.speak(kavin, a, b)
    kavinUntil = g.t + dur
    paatiUntil = 0
end

local function paatiSays(g: G, a: string, b: string?, dur: number)
    people.speak(paati, a, b)
    paatiUntil = g.t + dur
    kavinUntil = 0
end

L.lines = {
    l3s1 = "At the corner house, the street bends, so their patch leans. Kavin thinks it's smaller than his. Swipe one straight cut down to find out.",
    l3slant = 'That cut leans. Go straight down, so the corner is square.',
    l3short = 'Cut all the way, from the top edge to the bottom edge.',
    l3s1done = 'Clean cut!',
    l3s2 = 'Pick up the cut-off piece and carry it to the other end. Watch where the slanted edges meet.',
    l3notthere = 'Not there. Find the end where the slanted edges match.',
    l3s2done = "Click! Not a speck of floor was lost, and now it's a rectangle. Count its squares.",
    l3s3 = 'Grab the gold handle and lean this patch both ways. Keep an eye on the squares inside.',
    l3s3done = 'The slanted side keeps changing, but the space inside stays the same. Only the base and the straight-up height matter.',
    l3s4 = "Here's one more leaning patch. Use the measurements to find how much floor it covers, then press Check.",
    l3n35 = 'That used the slanted side. See what Paati says.',
    l3n11 = 'Adding gives the distance along two sides. To fill the space, multiply the base by the height.',
    l3nx = 'Base times the straight-up height. Try once more.',
    l3s4done = 'Yes! The slant never matters: base times the straight-up height gives the area of any parallelogram.',
}

L.id = 'parallelogram'
L.tag = 'PARALLELOGRAM'
L.title = 'The corner house'
L.blurb = 'Cut, slide, lean: base × height.'
L.steps = {
    { title = 'Cut the leaning patch', line = 'l3s1', task = 'Swipe straight down across the patch' },
    { title = 'Slide the piece across', line = 'l3s2', task = 'Drag the cut-off piece to the other end' },
    { title = 'Lean it: does the space change?', line = 'l3s3', task = 'Drag the gold handle both ways' },
    { title = 'Your turn', line = 'l3s4', task = 'Work out the floor on the keypad' },
}

local function sq(x: number, y: number): Vector
    return Vector.xy(FX + x * U, FY + y * U)
end

local function sqs(P: { Vector }): { Vector }
    return kit.toPx(P, FX, FY, U)
end

-- step 1 · cut ----------------------------------------------------------------------

local function judge(a: Vector, b: Vector): number
    local top = (math.min(a.y, b.y) - FY) / U
    local bot = (math.max(a.y, b.y) - FY) / U
    local dx, dy = math.abs(b.x - a.x), math.abs(b.y - a.y)
    if dy < 2.4 * U or top > 1.3 or bot < 2.7 then
        if dy > U and math.deg(math.atan2(dx, dy)) > 14 then
            return 2
        end
        return 0
    end
    if math.deg(math.atan2(dx, dy)) > 14 then
        return 2
    end
    return 1
end

-- flour dust flying off the cut
local function dust(x: number, h: number)
    for i = 1, 22 do
        local side = if i % 2 == 0 then 1 else -1
        table.insert(S.bits, {
            x = x, y = FY + (0.1 + math.random() * (h - 0.2)) * U,
            vx = side * (60 + math.random() * 220), vy = -80 - math.random() * 160,
            rot = math.random() * 3, spin = side * (6 + math.random() * 10), life = 1,
        })
    end
end

local function doCut(g: G, x: number)
    S.cutX = kit.clamp(x, 2, 6)
    S.cutAt = g.t
    S.knifeA, S.knifeB = nil, nil
    g.sfx('slice')
    dust(FX + S.cutX * U, 4)
    S.split.x, S.split.v = 0, 260
    g.shake(5)
    g.done()
    g.sayNext('l3s1done')
    paatiUntil, kavinUntil = 0, 0
end

local function pieceL(): { Vector }
    local x = if S.cutX > 0 then S.cutX else 4
    return { Vector.xy(0, 4), Vector.xy(x, 4), Vector.xy(x, 0), Vector.xy(2, 0) }
end

local function pieceR(): { Vector }
    local x = if S.cutX > 0 then S.cutX else 4
    return { Vector.xy(x, 4), Vector.xy(6, 4), Vector.xy(8, 0), Vector.xy(x, 0) }
end

-- step 3 · lean ------------------------------------------------------------------------

local function leanShape(l: number): { Vector }
    return { Vector.xy(0, 3), Vector.xy(6, 3), Vector.xy(6 + l, 0), Vector.xy(l, 0) }
end

-- protocol -------------------------------------------------------------------------------

local function place(who: people.Person, x: number)
    who.y = 606
    who.x = x
    who.tx = x
end

function L.enter(g: G, step: number)
    if step == 1 then
        S.cutX = -1
    elseif S.cutX < 0 then
        S.cutX = 4
    end
    S.knifeA, S.knifeB, S.knifeState, S.misses, S.cutAt, S.bits = nil, nil, 0, 0, -1, {}
    S.split = { x = if step == 1 then 0 else 16, v = 0 }
    S.px, S.py, S.dragging, S.held, S.tilt, S.snapped, S.snapAt, S.flying = -16, 0, false, 0, 0, false, -1, false
    S.lean, S.leanTarget, S.leanMoved, S.leanDone, S.leanDoneAt = 1.5, 1.5, 0, false, -1
    S.kp = kit.keypad(930, 170)
    S.solvedAt, S.wrongAt = -1, -9
    S.counted = 0
    tipDone = false
    people.hush(kavin)
    people.hush(paati)
    kavinUntil, paatiUntil = 0, 0
    -- to the left of the patches; in steps 1 and 2 also clear of the hint chip in the board's bottom-left corner
    if step == 4 then
        place(kavin, 120)
        place(paati, 232)
    elseif step == 3 then
        place(kavin, 200)
        place(paati, 330)
    else
        place(kavin, 352)
        place(paati, 455)
    end
    kavin.mood, paati.mood = 'idle', 'idle'
end

-- how Kavin and Paati take what is happening on the street
local function feel(g: G)
    local km, pm = 'watch', 'watch'
    local lx, ly = FX + 4 * U, FY + 2 * U
    if g.step == 1 then
        if not tipDone and g.age > 1 and S.cutX < 0 then
            tipDone = true
            kavinSays(g, 'Is their patch', 'smaller than ours?', 4.5)
        end
        if S.cutX < 0 then
            km = if S.knifeA ~= nil then 'watch' elseif g.t < kavinUntil then 'puzzled' else 'think'
            pm = if S.knifeA ~= nil then 'watch' else 'idle'
        elseif g.t - S.cutAt < 1.9 then
            km = 'cheer'
        end
    elseif g.step == 2 then
        lx, ly = FX + S.px + 2 * U, FY + S.py + 2 * U
        if S.snapped then
            local age = g.t - S.snapAt
            if age > 3.4 and not tipDone then
                tipDone = true
                kavinSays(g, 'Not smaller', 'after all!', 4)
            end
            km = if age > 3.4 and age < 6 then 'cheer' else 'watch'
            pm = if age > 3.4 and age < 5.5 then 'wave' else 'watch'
        elseif not S.dragging and not S.flying then
            km = 'point'
        end
    elseif g.step == 3 then
        lx, ly = F2X + (3 + S.lean) * U2, F2Y + U2
        if S.leanDone then
            km = if g.t - S.leanDoneAt < 2.4 then 'cheer' else 'watch'
            if not tipDone then
                tipDone = true
                paatiSays(g, 'Same flour,', 'however it leans.', 4.5)
            end
        elseif not S.dragging and S.leanMoved < 0.5 then
            km = 'think'
        end
    else
        lx, ly = F4X + 5 * U4, F4Y + 2 * U4
        if S.solvedAt >= 0 then
            km = if g.t - S.solvedAt < 2.6 then 'cheer' else 'idle'
            pm = if g.t - S.solvedAt < 2 then 'wave' else 'idle'
        elseif g.t - S.wrongAt < 1.8 then
            km = 'puzzled'
        else
            km = 'think'
        end
    end
    kavin.lookX, kavin.lookY = lx, ly
    paati.lookX, paati.lookY = lx, ly
    kavin.mood, paati.mood = km, pm
end

function L.advance(g: G, dt: number)
    S.held = kit.follow(S.held, if S.dragging then 1 else 0, 18, dt)
    kit.spring(S.split, if S.cutX > 0 then 16 else 0, 300, 14, dt)
    local keep: { Bit } = {}
    for _, b in S.bits do
        b.vy += 700 * dt
        b.x += b.vx * dt
        b.y += b.vy * dt
        b.rot += b.spin * dt
        b.life -= dt * 1.3
        if b.life > 0 then
            table.insert(keep, b)
        end
    end
    S.bits = keep
    if g.step == 2 then
        -- tilt with the motion while held
        local vx = (S.px - S.lastX) / math.max(dt, 1e-3)
        S.lastX = S.px
        S.tilt = kit.follow(S.tilt, if S.dragging then kit.clamp(vx * 0.0009, -0.16, 0.16) else 0, 10, dt)
        if S.flying then
            S.flyT = math.min(1, S.flyT + dt / 0.22)
            local e = kit.ease(S.flyT)
            S.px = kit.lerp(S.flyFrom.x, 6 * U, e)
            S.py = kit.lerp(S.flyFrom.y, 0, e)
            if S.flyT >= 1 then
                S.flying = false
                S.snapped = true
                S.snapAt = g.t
                g.sfx('snap')
                g.sfx('sparkle')
                g.shake(3)
                g.done()
                g.say('l3s2done')
            end
        end
        -- the count after the click
        if S.snapped then
            local n = kit.clamp(math.floor((g.t - S.snapAt - 0.9) / 0.09) + 1, 0, 24)
            if n > S.counted then
                S.counted = n
                g.tick(n - 1)
                if n == 24 then
                    g.sfx('chime')
                end
            end
        end
    elseif g.step == 3 then
        local before = S.lean
        S.lean = kit.follow(S.lean, S.leanTarget, 20, dt)
        S.leanMoved += math.abs(S.lean - before)
        if not S.leanDone and S.leanMoved > 5 then
            S.leanDone = true
            S.leanDoneAt = g.t
            g.done()
            g.say('l3s3done')
        end
    end
    kit.keypadAdvance(S.kp, dt)
    feel(g)
    if g.t > kavinUntil then
        people.hush(kavin)
    end
    if g.t > paatiUntil then
        people.hush(paati)
    end
    people.advance(kavin, dt, g.t)
    people.advance(paati, dt, g.t)
end

local function drawBits(r: Renderer)
    for _, b in S.bits do
        r:save()
        r:modulateOpacity(kit.clamp(b.life * 2, 0, 1))
        r:transform(Mat2D.withTranslation(b.x, b.y) * Mat2D.withRotation(b.rot))
        r:drawPath(kit.rrect(-3, -3, 6, 6, 2), kit.fill(Art.FLOUR))
        r:restore()
    end
end

local function drawStep1(g: G, r: Renderer)
    local f = g.fonts
    if S.cutX < 0 then
        Art.piece(r, sqs(LEANING), 0, 0, U, sq(0, 0), 0)
        -- broken squares along the slanted edges, until the student starts cutting
        if S.knifeA == nil and g.age > 3 and g.age < 9 then
            local pulse = 0.3 + 0.3 * math.sin(g.age * 5)
            for _, P in { { Vector.xy(0, 4), Vector.xy(2, 0), Vector.xy(2, 4) }, { Vector.xy(6, 4), Vector.xy(8, 0), Vector.xy(6, 0) } } do
                r:drawPath(kit.poly(sqs(P)), kit.fill(kit.alpha(kit.RED, pulse)))
            end
            Art.pill(r, f, 'broken squares', FX + 1.6 * U, FY + 4 * U + 36, kit.clamp((g.age - 3) * 2, 0, 1), kit.RED, kit.RED)
        end
        -- a ghost finger shows the swipe
        if S.knifeA == nil and g.age > 6 then
            local k = ((g.age - 6) % 2.6) / 2.6
            local a = if k < 0.1 then k / 0.1 elseif k > 0.75 then math.max(0, (0.9 - k) / 0.15) else 1
            local y = FY - 30 + kit.smooth((k - 0.1) / 0.6) * (4 * U + 60)
            r:drawPath(kit.dashed(FX + 4 * U, FY - 30, FX + 4 * U, y, 10, 9), kit.stroke(kit.alpha(kit.SURFACE, a), 4))
            kit.finger(r, FX + 4 * U, y, a, true)
        end
        -- the cut being drawn: gold once it is a cut that will work
        local a, b = S.knifeA, S.knifeB
        if a ~= nil and b ~= nil then
            if S.knifeState == 1 then
                local gx = FX + kit.clamp(math.floor((a.x + b.x) / 2 / U - FX / U + 0.5), 2, 6) * U
                r:drawPath(kit.dashed(gx, FY - 24, gx, FY + 4 * U + 24, 3, 9), kit.stroke(kit.SURFACE, 3))
                r:drawPath(kit.line(a.x, a.y, b.x, b.y), kit.stroke(kit.GOLD, 6))
            else
                local c = if S.knifeState == 2 then kit.RED else kit.INK
                r:drawPath(kit.dashed(a.x, a.y, b.x, b.y, 12, 9), kit.stroke(c, if S.knifeState == 2 then 5 else 4))
            end
        end
    else
        -- two pieces, nudged apart
        local sx = S.split.x
        Art.piece(r, sqs(pieceR()), 0, 0, U, sq(0, 0), 0)
        Art.piece(r, kit.offset(sqs(pieceL()), -sx, 0), 0, 0, U, sq(-sx / U, 0), 0)
        -- the line of light that just ran down the cut
        local k = (g.t - S.cutAt) / 0.25
        if k < 1.6 then
            local y = FY - 30 + kit.clamp(k, 0, 1) * (4 * U + 60)
            local x = FX + S.cutX * U
            r:save()
            r:modulateOpacity(kit.clamp(1.6 - k, 0, 1))
            r:drawPath(kit.line(x, y - 60, x, y), Paint.with({ style = 'stroke', thickness = 16, color = kit.alpha(kit.SURFACE, 0.6), cap = 'round', feather = 6 }))
            r:drawPath(kit.line(x, y - 60, x, y), kit.stroke(kit.SURFACE, 5))
            r:restore()
        end
    end
    drawBits(r)
end

local function drawStep2(g: G, r: Renderer)
    local f = g.fonts
    local x = S.cutX
    -- where it goes
    local slot = sqs({ Vector.xy(6, 4), Vector.xy(x + 6, 4), Vector.xy(x + 6, 0), Vector.xy(8, 0) })
    local dd = math.sqrt((S.px - 6 * U) ^ 2 + S.py ^ 2)
    if not S.snapped then
        local gk = if dd < 3 * U then kit.clamp(1.3 - dd / (2.6 * U), 0.15, 1) else 0.12
        r:drawPath(kit.poly(slot), kit.fill(kit.alpha(kit.GOLD_WASH, 0.45 * gk + 0.15)))
        r:drawPath(kit.poly(slot), kit.stroke(kit.alpha(kit.GOLD, 0.4 + 0.6 * gk), if dd < 1.2 * U then 5 else 3))
    end
    Art.piece(r, sqs(pieceR()), 0, 0, U, sq(0, 0), 0)
    -- the piece: lifts, tilts with the motion, bobs while it waits
    local bob = if not S.dragging and not S.snapped and not S.flying then math.sin(g.t * 4) * 3 else 0
    local P = kit.offset(sqs(pieceL()), S.px, S.py - bob)
    local c = kit.centroid(P)
    P = kit.rotate(P, c, S.tilt)
    local at = kit.rotate({ Vector.xy(FX + S.px, FY + S.py - bob) }, c, S.tilt)[1]
    Art.piece(r, P, S.held, if S.snapped then 0 else 1, U, at, S.tilt)
    if S.snapped then
        local age = g.t - S.snapAt
        -- the seam lights up
        if age < 1.2 then
            local a, b = sq(6, 4), sq(8, 0)
            r:save()
            r:modulateOpacity(kit.clamp(1.2 - age, 0, 1))
            r:drawPath(kit.line(a.x, a.y, b.x, b.y), Paint.with({ style = 'stroke', thickness = 16, color = kit.alpha(kit.SURFACE, 0.6), cap = 'round', feather = 5 }))
            r:drawPath(kit.line(a.x, a.y, b.x, b.y), kit.stroke(kit.SURFACE, 4))
            r:restore()
        end
        -- the outline draws itself, then the squares are counted, flour falling into each
        local R = sqs({ Vector.xy(x, 0), Vector.xy(x + 6, 0), Vector.xy(x + 6, 4), Vector.xy(x, 4) })
        r:drawPath(kit.partialOutline(R, (age - 0.2) / 0.8), kit.stroke(kit.ACCENT, 5))
        local n = kit.clamp(math.floor((age - 0.9) / 0.09) + 1, 0, 24)
        for i = 0, n - 1 do
            local col, row = i % 6, 3 - math.floor(i / 6)
            local cx, cy = FX + (x + col) * U, FY + row * U
            local drop = kit.clamp((age - 0.9 - i * 0.09) / 0.35, 0, 1)
            Art.flour(r, cx, cy, U, drop, nil, 0)
            if drop > 0.8 then
                kit.label(r, f, tostring(i + 1), f.display, 17, kit.INK_SOFT, cx + U / 2, cy + U / 2, 0.5)
            end
        end
        Art.counter(r, f, 'SQUARES', if n > 0 then tostring(n) else '?', 0, 1096, 340, 130)
        if age > 3.4 then
            kit.bracket(r, f, sq(x, 4.45), sq(x + 6, 4.45), 0, 1, '6', kit.clamp((age - 3.4) * 1.5, 0, 1), kit.INK)
            kit.bracket(r, f, sq(x - 0.5, 4), sq(x - 0.5, 0), -1, 0, '4', kit.clamp((age - 4) * 1.5, 0, 1), kit.INK)
            Art.rule(r, f, '6 × 4 = 24', "24 squares, just like Kavin's patch", kit.clamp((age - 4.8) * 1.5, 0, 1), 470, 166, 30)
        end
    else
        Art.counter(r, f, 'SQUARES', '?', 0, 1096, 340, 130)
    end
end

local function drawStep3(g: G, r: Renderer)
    local f = g.fonts
    local l = S.lean
    local P = kit.toPx(leanShape(l), F2X, F2Y, U2)
    -- the rectangle it would be, as a dashed outline
    local G0 = kit.toPx({ Vector.xy(0, 0), Vector.xy(6, 0), Vector.xy(6, 3), Vector.xy(0, 3) }, F2X, F2Y, U2)
    for i = 1, 4 do
        local a, b = G0[i], G0[(i % 4) + 1]
        r:drawPath(kit.dashed(a.x, a.y, b.x, b.y, 10, 8), kit.stroke(kit.INK_FAINT, 2.5))
    end
    Art.piece(r, P, 0, 0, U2, Vector.xy(F2X, F2Y), 0)
    -- the bit that sticks out, and the gap it would fill
    local extra = if l >= 0 then { Vector.xy(6, 0), Vector.xy(6 + l, 0), Vector.xy(6, 3) } else { Vector.xy(l, 0), Vector.xy(0, 0), Vector.xy(0, 3) }
    local gap = if l >= 0 then { Vector.xy(0, 0), Vector.xy(l, 0), Vector.xy(0, 3) } else { Vector.xy(6 + l, 0), Vector.xy(6, 0), Vector.xy(6, 3) }
    r:drawPath(kit.poly(kit.toPx(extra, F2X, F2Y, U2)), kit.fill(kit.alpha(kit.GOLD, 0.35)))
    r:drawPath(kit.poly(kit.toPx(gap, F2X, F2Y, U2)), kit.fill(kit.alpha(kit.GOLD_WASH, 0.75)))
    r:drawPath(kit.poly(kit.toPx(gap, F2X, F2Y, U2)), kit.stroke(kit.GOLD, 2.5))
    -- after the task: the bit that sticks out glides into the gap, again and again
    if S.leanDone then
        local k = ((g.t - S.leanDoneAt) % 2.6) / 2.6
        local e = kit.smooth((k - 0.15) / 0.55)
        local dx = (if l >= 0 then -6 else 6) * U2 * e
        local lift = math.sin(e * math.pi) * 26
        local Q = kit.offset(kit.toPx(extra, F2X, F2Y, U2), dx, -lift)
        r:save()
        r:modulateOpacity(if k > 0.85 then (1 - k) / 0.15 else 1)
        r:drawPath(kit.poly(kit.offset(Q, 6, 10 + lift * 0.5)), kit.soft(kit.alpha(kit.INK, 0.2), 10))
        r:drawPath(kit.poly(Q), kit.fill(Art.WET))
        r:drawPath(kit.poly(Q), kit.stroke(kit.GOLD, 3))
        r:restore()
    end
    -- the height and the slanted side
    local hx = F2X + (3 + l / 2) * U2
    r:drawPath(kit.dashed(hx, F2Y, hx, F2Y + 3 * U2, 9, 7), kit.stroke(kit.SURFACE, 3))
    r:drawPath(kit.corner(Vector.xy(hx, F2Y + 3 * U2), 1, 0, 0, -1, 13), kit.stroke(kit.SURFACE, 2.5))
    kit.halo(r, f, 'height 3', f.body, 19, kit.INK, hx - 14, F2Y + 1.5 * U2, 1)
    local slant = math.sqrt(l * l + 9)
    local sx, sy = F2X + (6 + l / 2) * U2, F2Y + 1.5 * U2
    kit.halo(r, f, 'slanted side ' .. string.format('%.1f', slant), f.body, 19, kit.ORANGE, sx + 26, sy, 0)
    kit.halo(r, f, 'base 6', f.body, 19, kit.INK, F2X + 3 * U2, F2Y + 3 * U2 + 40, 0.5)
    -- the handle
    kit.knob(r, g.t, F2X + (3 + l) * U2, F2Y, 'slide', S.held, not S.dragging and S.leanMoved < 0.5)
    Art.counter(r, f, 'SQUARES INSIDE', '18', if S.dragging then 0.15 * math.abs(math.sin(g.t * 8)) else 0, 1030, 508, 190)
    kit.label(r, f, '6 × 3, however it leans', f.body, 15, kit.INK_SOFT, 1125, 606, 0.5)
end

local function drawStep4(g: G, r: Renderer)
    local f = g.fonts
    local P = kit.toPx({ Vector.xy(0, 4), Vector.xy(7, 4), Vector.xy(10, 0), Vector.xy(3, 0) }, F4X, F4Y, U4)
    Art.piece(r, P, 0, 0, U4, Vector.xy(F4X, F4Y), 0)
    local hx = F4X + 7 * U4
    r:drawPath(kit.dashed(hx, F4Y, hx, F4Y + 4 * U4, 9, 7), kit.stroke(kit.SURFACE, 3))
    r:drawPath(kit.corner(Vector.xy(hx, F4Y + 4 * U4), -1, 0, 0, -1, 13), kit.stroke(kit.SURFACE, 2.5))
    kit.halo(r, f, 'height 4 m', f.body, 19, kit.INK, hx - 14, F4Y + 2 * U4, 1)
    kit.halo(r, f, 'slanted side 5 m', f.body, 19, kit.ORANGE, F4X + 8.5 * U4 + 24, F4Y + 2 * U4, 0)
    kit.halo(r, f, 'base 7 m', f.body, 19, kit.INK, F4X + 3.5 * U4, F4Y + 4 * U4 + 40, 0.5)
    if S.solvedAt >= 0 then
        local k = kit.clamp((g.t - S.solvedAt) * 1.5, 0, 1)
        r:drawPath(kit.line(F4X, F4Y + 4 * U4, F4X + 7 * U4, F4Y + 4 * U4), Paint.with({ style = 'stroke', thickness = 9, color = kit.alpha(kit.ACCENT, k), cap = 'round' }))
        r:drawPath(kit.line(hx, F4Y, hx, F4Y + 4 * U4), Paint.with({ style = 'stroke', thickness = 9, color = kit.alpha(kit.ACCENT, k), cap = 'round' }))
        Art.rule(r, f, 'area = base × height', '7 × 4 = 28 square metres', k, 560, 166, 28)
    end
    kit.keypadDraw(r, f, S.kp, 'Floor in square metres', 'sq m', g.t)
end

function L.draw(g: G, r: Renderer)
    Art.street(r, g.t, STREET)
    if g.step == 2 then
        -- the piece can be carried past Kavin and Paati, so it passes in front of them
        people.draw(r, g.fonts, kavin, g.t)
        people.draw(r, g.fonts, paati, g.t)
        drawStep2(g, r)
        return
    end
    if g.step == 1 then
        drawStep1(g, r)
    elseif g.step == 3 then
        drawStep3(g, r)
    else
        drawStep4(g, r)
    end
    people.draw(r, g.fonts, kavin, g.t)
    people.draw(r, g.fonts, paati, g.t)
end

local function checkAnswer(g: G)
    local v = tonumber(S.kp.value) or -1
    local right = v == 28
    g.report('l3s4', right, S.kp.value, if v == 35 then 'slant' else nil)
    if right then
        S.kp.okT = 3
        S.solvedAt = g.t
        g.done()
        g.burst(1070, 300, 40)
        g.say('l3s4done')
        paatiUntil = 0
    else
        S.wrongAt = g.t
        g.sfx('oops')
        kit.keypadWrong(S.kp, 'Not quite. Have another go.')
        g.say(if v == 35 then 'l3n35' elseif v == 11 then 'l3n11' else 'l3nx')
        if v == 35 then
            paatiSays(g, 'Measure straight up,', 'not along the slant.', 5)
        end
    end
end

local function inPiece(p: Vector): boolean
    local P = kit.offset(sqs(pieceL()), S.px, S.py)
    local x0, y0, x1, y1 = kit.bbox(P)
    return p.x > x0 - 20 and p.x < x1 + 20 and p.y > y0 - 20 and p.y < y1 + 20
end

function L.down(g: G, p: Vector): boolean
    if g.step == 1 and S.cutX < 0 then
        if p.x > FX - 60 and p.x < FX + 8 * U + 60 and p.y > FY - 80 and p.y < FY + 4 * U + 80 then
            S.knifeA, S.knifeB, S.knifeState = p, p, 0
            return true
        end
    elseif g.step == 2 and not S.snapped and not S.flying then
        if inPiece(p) then
            S.dragging = true
            S.grabDX, S.grabDY = p.x - S.px, p.y - S.py
            S.lastX = S.px
            g.sfx('pickup')
            return true
        end
    elseif g.step == 3 then
        if kit.dist(p, Vector.xy(F2X + (3 + S.lean) * U2, F2Y)) < 44 then
            S.dragging = true
            g.sfx('pickup')
            return true
        end
    elseif g.step == 4 and S.solvedAt < 0 then
        local res = kit.keypadDown(S.kp, p)
        if res == 'ok' then
            checkAnswer(g)
        elseif res == 'key' then
            g.sfx('tick3')
        end
        return res ~= ''
    end
    return false
end

function L.move(g: G, p: Vector)
    if g.step == 1 and S.knifeA ~= nil then
        S.knifeB = p
        local a = S.knifeA :: Vector
        S.knifeState = judge(a, p)
    elseif g.step == 2 and S.dragging then
        local nx: number = kit.clamp(p.x - S.grabDX, -FX + 60, 7 * U)
        local ny: number = kit.clamp(p.y - S.grabDY, -60, 2 * U)
        -- a gentle magnet near the slot
        if math.sqrt((nx - 6 * U) ^ 2 + ny ^ 2) < 0.75 * U then
            nx = kit.lerp(nx, 6 * U, 0.6)
            ny = kit.lerp(ny, 0, 0.6)
        end
        S.px = nx
        S.py = ny
    elseif g.step == 3 and S.dragging then
        local l = kit.clamp((p.x - F2X) / U2 - 3, -2.5, 3.5)
        local tickBefore = math.floor(S.leanTarget * 2)
        S.leanTarget = l
        if math.floor(l * 2) ~= tickBefore then
            g.tick(math.floor(l * 2) + 6)
        end
    end
end

function L.up(g: G, p: Vector)
    if g.step == 1 and S.knifeA ~= nil then
        local a = S.knifeA :: Vector
        local j = judge(a, p)
        if j == 1 then
            doCut(g, math.floor((a.x + p.x) / 2 / U - FX / U + 0.5))
        else
            S.misses += 1
            S.knifeA, S.knifeB = nil, nil
            if kit.dist(a, p) > 20 then
                g.sfx('oops')
                g.say(if j == 2 then 'l3slant' else 'l3short')
                if j == 2 then
                    -- the dots are Paati's guide for every straight line in a kolam
                    paatiSays(g, 'Follow the dots,', 'straight down.', 4)
                end
                if S.misses >= 2 then
                    g.hint('Press space for a clean cut')
                end
            end
        end
    elseif g.step == 2 and S.dragging then
        S.dragging = false
        local dd = math.sqrt((S.px - 6 * U) ^ 2 + S.py ^ 2)
        if dd < 1.6 * U then
            S.flying = true
            S.flyFrom = Vector.xy(S.px, S.py)
            S.flyT = 0
        else
            g.sfx('oops')
            S.px, S.py = -16, 0
            if math.abs(p.x - S.grabDX + 16) > 24 then
                g.say('l3notthere')
                g.hint('Or press space to slide it in')
            end
        end
    elseif g.step == 3 and S.dragging then
        S.dragging = false
        g.sfx('drop')
    end
end

function L.key(g: G, k: number): boolean
    if g.step == 1 and S.cutX < 0 and k == 32 then
        doCut(g, 4)
        return true
    elseif g.step == 2 and not S.snapped and not S.flying and k == 32 then
        S.flying = true
        S.flyFrom = Vector.xy(S.px, S.py)
        S.flyT = 0
        return true
    elseif g.step == 3 and (k == 262 or k == 263) then
        S.leanTarget = kit.clamp(S.leanTarget + (if k == 262 then 0.5 else -0.5), -2.5, 3.5)
        g.tick(math.floor(S.leanTarget * 2) + 6)
        return true
    elseif g.step == 4 and S.solvedAt < 0 then
        local res = kit.keypadKey(S.kp, k)
        if res == 'ok' then
            checkAnswer(g)
            return true
        end
        return res ~= ''
    end
    return false
end

function L.thumb(g: G, r: Renderer, x: number, y: number, w: number, h: number)
    Art.thumbOpen(r, x, y, w, h, g.t, STREET)
    -- the cut-off piece lifts across the leaning patch, over and over
    local k = kit.smooth(((g.t * 0.4) % 1) * 1.6)
    local u = 60
    local ox, oy = 600, 360
    local R = kit.toPx({ Vector.xy(4, 4), Vector.xy(6, 4), Vector.xy(8, 0), Vector.xy(4, 0) }, ox, oy, u)
    Art.piece(r, R, 0, 0, u, Vector.xy(ox, oy), 0)
    local Lp = kit.toPx({ Vector.xy(0, 4), Vector.xy(4, 4), Vector.xy(4, 0), Vector.xy(2, 0) }, ox + k * 6 * u, oy - math.sin(k * math.pi) * 40, u)
    Art.piece(r, Lp, math.sin(k * math.pi), 1, u, Vector.xy(ox + k * 6 * u, oy - math.sin(k * math.pi) * 40), 0)
    thumbKavin.x, thumbKavin.y, thumbKavin.s = 300, 600, 1.9
    thumbKavin.mood = 'think'
    people.advance(thumbKavin, 1 / 60, g.t)
    people.draw(r, g.fonts, thumbKavin, g.t)
    r:restore()
end

return L
