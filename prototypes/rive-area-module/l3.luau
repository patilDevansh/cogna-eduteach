-- Lesson 3 · The parallelogram: base × height
--   1. swipe a straight cut down Ramesh uncle's wonky field (a slanted or short swipe gets a reaction)
--   2. pick up the cut-off piece and set it in at the other end: it clicks in, and the rectangle is counted
--   3. lean a field with a gold handle: the slanted side changes, the land stays 18
--   4. work out a field on the keypad (base 7, height 4, slanted side 5)

local kit = require('kit')
type G = kit.G
type Keypad = kit.Keypad

type Bit = { x: number, y: number, vx: number, vy: number, rot: number, spin: number, life: number, light: boolean }

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
    counted: number,
}

local L = {}

local U = 56
local FX, FY = 300, 232
local WONKY = { Vector.xy(0, 4), Vector.xy(6, 4), Vector.xy(8, 0), Vector.xy(2, 0) }
local U2 = 52
local F2X, F2Y = 330, 260
local U4 = 42
local F4X, F4Y = 130, 260

local S: St = {
    cutX = -1, knifeA = nil, knifeB = nil, knifeState = 0, misses = 0, cutAt = -1, bits = {}, split = { x = 0, v = 0 },
    px = 0, py = 0, dragging = false, grabDX = 0, grabDY = 0, held = 0, tilt = 0, lastX = 0, snapped = false, snapAt = -1,
    flying = false, flyFrom = Vector.xy(0, 0), flyT = 0,
    lean = 1.5, leanTarget = 1.5, leanMoved = 0, leanDone = false, leanDoneAt = -1,
    kp = kit.keypad(860, 172), solvedAt = -1, counted = 0,
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

local function clippings(x: number, h: number)
    for i = 1, 22 do
        local side = if i % 2 == 0 then 1 else -1
        table.insert(S.bits, {
            x = x, y = FY + (0.1 + math.random() * (h - 0.2)) * U,
            vx = side * (60 + math.random() * 220), vy = -80 - math.random() * 160,
            rot = math.random() * 3, spin = side * (6 + math.random() * 10), life = 1, light = i % 3 == 0,
        })
    end
end

local function doCut(g: G, x: number)
    S.cutX = kit.clamp(x, 2, 6)
    S.cutAt = g.t
    S.knifeA, S.knifeB = nil, nil
    g.sfx('slice')
    clippings(FX + S.cutX * U, 4)
    S.split.x, S.split.v = 0, 260
    g.shake(5)
    g.done()
    g.sayNext('l3s1done')
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

L.id = 'parallelogram'
L.tag = 'PARALLELOGRAM'
L.title = 'The wonky field'
L.blurb = 'Cut, slide, lean: base × height.'
L.steps = {
    { title = 'Cut the wonky field', line = 'l3s1', task = 'Swipe straight down across the field' },
    { title = 'Slide the piece across', line = 'l3s2', task = 'Drag the cut-off piece to the other end' },
    { title = 'Lean it: does the land change?', line = 'l3s3', task = 'Drag the gold handle both ways' },
    { title = 'Your turn', line = 'l3s4', task = 'Work out the land on the keypad' },
}

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
    S.kp = kit.keypad(860, 172)
    S.solvedAt = -1
    S.counted = 0
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
        -- the count after the snap
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
end

local function drawBits(r: Renderer)
    for _, b in S.bits do
        r:save()
        r:modulateOpacity(kit.clamp(b.life * 2, 0, 1))
        r:transform(Mat2D.withTranslation(b.x, b.y) * Mat2D.withRotation(b.rot))
        r:drawPath(kit.rrect(-3, -7, 6, 14, 3), kit.fill(if b.light then Color.rgb(185, 221, 155) else kit.GRASS_EDGE))
        r:restore()
    end
end

local function drawStep1(g: G, r: Renderer)
    local f = g.fonts
    kit.tree(r, 150, 330, 0.9, g.t)
    kit.tree(r, 1120, 520, 0.7, g.t)
    if S.cutX < 0 then
        local st = kit.style(U, sq(0, 0))
        kit.land(r, sqs(WONKY), st)
        -- broken squares along the slanted edges, until the student starts cutting
        if S.knifeA == nil and g.age > 3 and g.age < 9 then
            local pulse = 0.35 + 0.35 * math.sin(g.age * 5)
            for _, P in { { Vector.xy(0, 4), Vector.xy(2, 0), Vector.xy(2, 4) }, { Vector.xy(6, 4), Vector.xy(8, 0), Vector.xy(6, 0) } } do
                r:drawPath(kit.poly(sqs(P)), kit.fill(kit.alpha(kit.RED, pulse)))
            end
            kit.tag(r, f, 'broken squares', FX + 1 * U, FY - 34, kit.clamp((g.age - 3) * 2, 0, 1))
        end
        -- ghost finger shows the swipe
        if S.knifeA == nil and g.age > 6 then
            local k = ((g.age - 6) % 2.6) / 2.6
            local a = if k < 0.1 then k / 0.1 elseif k > 0.75 then math.max(0, (0.9 - k) / 0.15) else 1
            local y = FY - 30 + kit.smooth((k - 0.1) / 0.6) * (4 * U + 60)
            r:drawPath(kit.dashed(FX + 4 * U, FY - 30, FX + 4 * U, y, 10, 9), kit.stroke(kit.alpha(kit.SURFACE, a), 4))
            kit.finger(r, FX + 4 * U, y, a, true)
        end
        -- the knife being drawn
        local a, b = S.knifeA, S.knifeB
        if a ~= nil and b ~= nil then
            local c = if S.knifeState == 1 then kit.GOLD elseif S.knifeState == 2 then kit.RED else kit.INK
            if S.knifeState == 1 then
                local gx = FX + kit.clamp(math.floor((a.x + b.x) / 2 / U - FX / U + 0.5), 2, 6) * U
                r:drawPath(kit.dashed(gx, FY - 24, gx, FY + 4 * U + 24, 3, 9), kit.stroke(kit.SURFACE, 3))
                r:drawPath(kit.line(a.x, a.y, b.x, b.y), kit.stroke(kit.GOLD, 6))
            else
                r:drawPath(kit.dashed(a.x, a.y, b.x, b.y, 12, 9), kit.stroke(c, if S.knifeState == 2 then 5 else 4))
            end
        end
    else
        -- two pieces, nudged apart
        local sx = S.split.x
        local stL = kit.style(U, sq(-sx / U, 0))
        local stR = kit.style(U, sq(0, 0))
        kit.land(r, kit.offset(sqs(pieceR()), 0, 0), stR)
        kit.land(r, kit.offset(sqs(pieceL()), -sx, 0), stL)
        -- the blade of light that just ran down the cut
        local k = (g.t - S.cutAt) / 0.25
        if k < 1.6 then
            local y = FY - 30 + kit.clamp(k, 0, 1) * (4 * U + 60)
            local x = FX + S.cutX * U
            r:save()
            r:modulateOpacity(kit.clamp(1.6 - k, 0, 1))
            r:drawPath(kit.line(x, y - 60, x, y), Paint.with({ style = 'stroke', thickness = 16, color = kit.alpha(kit.GOLD, 0.5), cap = 'round', feather = 6 }))
            r:drawPath(kit.line(x, y - 60, x, y), kit.stroke(kit.SURFACE, 5))
            r:restore()
        end
    end
    drawBits(r)
end

local function drawStep2(g: G, r: Renderer)
    local f = g.fonts
    kit.tree(r, 150, 330, 0.9, g.t)
    local x = S.cutX
    -- the slot it should go in
    local slot = sqs({ Vector.xy(6, 4), Vector.xy(x + 6, 4), Vector.xy(x + 6, 0), Vector.xy(8, 0) })
    local dd = math.sqrt((S.px - 6 * U) ^ 2 + S.py ^ 2)
    if not S.snapped then
        local gk = if dd < 3 * U then kit.clamp(1.3 - dd / (2.6 * U), 0.15, 1) else 0.12
        r:drawPath(kit.poly(slot), kit.fill(kit.alpha(kit.GOLD_WASH, 0.6 * gk + 0.1)))
        r:drawPath(kit.poly(slot), kit.stroke(kit.alpha(kit.GOLD, 0.4 + 0.6 * gk), if dd < 1.2 * U then 5 else 3))
    end
    local stR = kit.style(U, sq(0, 0))
    kit.land(r, sqs(pieceR()), stR)
    -- the piece: lifts, tilts with the motion, bobs while it waits
    local bob = if not S.dragging and not S.snapped and not S.flying then math.sin(g.t * 4) * 3 else 0
    local P = kit.offset(sqs(pieceL()), S.px, S.py - bob)
    local c = kit.centroid(P)
    P = kit.rotate(P, c, S.tilt)
    local st = kit.style(U, Vector.xy(FX + S.px, FY + S.py - bob))
    st.gridRot = S.tilt
    st.gridAt = kit.rotate({ st.gridAt }, c, S.tilt)[1]
    st.lift = S.held
    st.edge = if S.snapped then 0 else 1
    kit.land(r, P, st)
    if S.snapped then
        local age = g.t - S.snapAt
        -- the seam lights up
        if age < 1.2 then
            local a, b = sq(6, 4), sq(8, 0)
            r:save()
            r:modulateOpacity(kit.clamp(1.2 - age, 0, 1))
            r:drawPath(kit.line(a.x, a.y, b.x, b.y), Paint.with({ style = 'stroke', thickness = 16, color = kit.alpha(kit.GOLD, 0.55), cap = 'round', feather = 5 }))
            r:drawPath(kit.line(a.x, a.y, b.x, b.y), kit.stroke(kit.SURFACE, 4))
            r:restore()
        end
        -- outline draws itself, then the squares are counted
        local R = sqs({ Vector.xy(x, 0), Vector.xy(x + 6, 0), Vector.xy(x + 6, 4), Vector.xy(x, 4) })
        r:drawPath(kit.partialOutline(R, (age - 0.2) / 0.8), kit.stroke(kit.GOLD, 5))
        local n = kit.clamp(math.floor((age - 0.9) / 0.09) + 1, 0, 24)
        for i = 0, n - 1 do
            local col, row = i % 6, 3 - math.floor(i / 6)
            local cx, cy = FX + (x + col + 0.5) * U, FY + (row + 0.5) * U
            local k = kit.back((age - 0.9 - i * 0.09) * 5)
            local s = (U - 12) * k
            r:drawPath(kit.rrect(cx - s / 2, cy - s / 2, s, s, 8), kit.fill(kit.alpha(kit.GOLD_WASH, 0.92)))
            r:drawPath(kit.rrect(cx - s / 2, cy - s / 2, s, s, 8), kit.stroke(kit.GOLD, 2))
            if k > 0.8 then
                kit.label(r, f, tostring(i + 1), f.display, 18, kit.GOLD_DEEP, cx, cy, 0.5)
            end
        end
        kit.sign(r, f, 'LAND', if n > 0 then n .. ' squares' else '? squares', 0, 1000, 176)
        if age > 3.4 then
            kit.bracket(r, f, sq(x, 4.45), sq(x + 6, 4.45), 0, 1, '6', kit.clamp((age - 3.4) * 1.5, 0, 1), kit.INK)
            kit.bracket(r, f, sq(x - 0.5, 4), sq(x - 0.5, 0), -1, 0, '4', kit.clamp((age - 4) * 1.5, 0, 1), kit.INK)
            kit.rule(r, f, '6 × 4 = 24', 'and the wonky field had 24 too', kit.clamp((age - 4.8) * 1.5, 0, 1), 1000, 330)
        end
    else
        kit.sign(r, f, 'LAND', '? squares', 0, 1000, 176)
    end
end

local function drawStep3(g: G, r: Renderer)
    local f = g.fonts
    local l = S.lean
    local P = kit.toPx(leanShape(l), F2X, F2Y, U2)
    -- the rectangle it would be, as a dashed ghost
    local G0 = kit.toPx({ Vector.xy(0, 0), Vector.xy(6, 0), Vector.xy(6, 3), Vector.xy(0, 3) }, F2X, F2Y, U2)
    for i = 1, 4 do
        local a, b = G0[i], G0[(i % 4) + 1]
        r:drawPath(kit.dashed(a.x, a.y, b.x, b.y, 10, 8), kit.stroke(kit.INK_FAINT, 2.5))
    end
    local st = kit.style(U2, Vector.xy(F2X, F2Y))
    st.unit = U2
    kit.land(r, P, st)
    -- the bit that sticks out, and the gap it would fill
    local extra = if l >= 0 then { Vector.xy(6, 0), Vector.xy(6 + l, 0), Vector.xy(6, 3) } else { Vector.xy(l, 0), Vector.xy(0, 0), Vector.xy(0, 3) }
    local gap = if l >= 0 then { Vector.xy(0, 0), Vector.xy(l, 0), Vector.xy(0, 3) } else { Vector.xy(6 + l, 0), Vector.xy(6, 0), Vector.xy(6, 3) }
    r:drawPath(kit.poly(kit.toPx(extra, F2X, F2Y, U2)), kit.fill(kit.alpha(kit.GOLD, 0.35)))
    r:drawPath(kit.poly(kit.toPx(gap, F2X, F2Y, U2)), kit.fill(kit.alpha(kit.GOLD_WASH, 0.7)))
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
        r:drawPath(kit.poly(Q), kit.fill(kit.GRASS_COPY))
        r:drawPath(kit.poly(Q), kit.stroke(kit.GOLD, 3))
        r:restore()
    end
    -- the height and the slanted side
    local hx = F2X + (3 + l / 2) * U2
    r:drawPath(kit.dashed(hx, F2Y, hx, F2Y + 3 * U2, 9, 7), kit.stroke(kit.INK, 3))
    r:drawPath(kit.corner(Vector.xy(hx, F2Y + 3 * U2), 1, 0, 0, -1, 13), kit.stroke(kit.INK, 2.5))
    kit.halo(r, f, 'height 3', f.body, 19, kit.INK, hx - 14, F2Y + 1.5 * U2, 1)
    local slant = math.sqrt(l * l + 9)
    local sx, sy = F2X + (6 + l / 2) * U2, F2Y + 1.5 * U2
    kit.halo(r, f, 'slanted side ' .. string.format('%.1f', slant), f.body, 19, kit.ORANGE, sx + 26, sy, 0)
    kit.halo(r, f, 'base 6', f.body, 19, kit.INK, F2X + 3 * U2, F2Y + 3 * U2 + 44, 0.5)
    -- the handle
    kit.knob(r, g.t, F2X + (3 + l) * U2, F2Y, 'slide', S.held, not S.dragging and S.leanMoved < 0.5)
    kit.sign(r, f, 'LAND', '18 squares', if S.dragging then 0.15 * math.abs(math.sin(g.t * 8)) else 0, 1000, 176)
    kit.label(r, f, '6 × 3 = 18, however it leans', f.body, 16, kit.INK_SOFT, 1105, 290, 0.5)
end

local function drawStep4(g: G, r: Renderer)
    local f = g.fonts
    local P = kit.toPx({ Vector.xy(0, 4), Vector.xy(7, 4), Vector.xy(10, 0), Vector.xy(3, 0) }, F4X, F4Y, U4)
    kit.land(r, P, kit.style(U4, Vector.xy(F4X, F4Y)))
    local hx = F4X + 7 * U4
    r:drawPath(kit.dashed(hx, F4Y, hx, F4Y + 4 * U4, 9, 7), kit.stroke(kit.INK, 3))
    r:drawPath(kit.corner(Vector.xy(hx, F4Y + 4 * U4), -1, 0, 0, -1, 13), kit.stroke(kit.INK, 2.5))
    kit.halo(r, f, 'height 4 m', f.body, 19, kit.INK, hx - 14, F4Y + 2 * U4, 1)
    kit.halo(r, f, 'slanted side 5 m', f.body, 19, kit.ORANGE, F4X + 8.5 * U4 + 26, F4Y + 2 * U4, 0)
    kit.halo(r, f, 'base 7 m', f.body, 19, kit.INK, F4X + 3.5 * U4, F4Y + 4 * U4 + 44, 0.5)
    if S.solvedAt >= 0 then
        local k = kit.clamp((g.t - S.solvedAt) * 1.5, 0, 1)
        r:drawPath(kit.line(F4X, F4Y + 4 * U4, F4X + 7 * U4, F4Y + 4 * U4), Paint.with({ style = 'stroke', thickness = 9, color = kit.alpha(kit.ACCENT, k), cap = 'round' }))
        r:drawPath(kit.line(hx, F4Y, hx, F4Y + 4 * U4), Paint.with({ style = 'stroke', thickness = 9, color = kit.alpha(kit.ACCENT, k), cap = 'round' }))
        kit.rule(r, f, 'area = base × height', '7 × 4 = 28 square metres', k, 420, 486)
    end
    kit.keypadDraw(r, f, S.kp, 'Land in square metres', 'sq m', g.t)
end

function L.draw(g: G, r: Renderer)
    if g.step == 1 then
        drawStep1(g, r)
    elseif g.step == 2 then
        drawStep2(g, r)
    elseif g.step == 3 then
        drawStep3(g, r)
    else
        drawStep4(g, r)
    end
end

local function checkAnswer(g: G)
    local v = tonumber(S.kp.value) or -1
    if v == 28 then
        S.kp.okT = 3
        S.solvedAt = g.t
        g.done()
        g.burst(1000, 300, 40)
        g.say('l3s4done')
    else
        g.sfx('oops')
        kit.keypadWrong(S.kp, 'Not quite. Have another go.')
        g.say(if v == 35 then 'l3n35' elseif v == 11 then 'l3n11' else 'l3nx')
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
        local ny: number = kit.clamp(p.y - S.grabDY, -FY + 170, 2 * U)
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
                if S.misses >= 2 then
                    g.hint('Press space and I will cut it for you')
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
                g.say('notthere')
                g.hint('Look for the matching slanted edge on the right')
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
    elseif g.step == 2 and not S.snapped and k == 32 then
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
    local u = 18
    local k = kit.smooth(((g.t * 0.4) % 1) * 1.6)
    local ox, oy = x + w / 2 - 4 * u, y + h / 2 - 2 * u
    local R = kit.toPx({ Vector.xy(4, 4), Vector.xy(6, 4), Vector.xy(8, 0), Vector.xy(4, 0) }, ox, oy, u)
    local Lp = kit.toPx({ Vector.xy(0, 4), Vector.xy(4, 4), Vector.xy(4, 0), Vector.xy(2, 0) }, ox + k * 6 * u, oy - math.sin(k * math.pi) * 10, u)
    r:drawPath(kit.poly(R), kit.fill(kit.GRASS))
    r:drawPath(kit.poly(Lp), kit.fill(kit.GRASS_COPY))
    r:drawPath(kit.poly(Lp), kit.stroke(kit.GOLD, 2))
end

return L
