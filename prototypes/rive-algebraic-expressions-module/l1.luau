-- Lesson 1 · Split a multiplication: a(b + c) = ab + ac
--   1. a 6 × 14 field: swipe straight down along a grid line to cut it; each piece is worked out, then added: 84
--   2. slide the cut with the gold knob: the two pieces change, the total stays 84; leave it at 10
--   3. 7 × 12 on the keypad, already cut at 10 -> 84

local kit = require('kit')
local lab = require('lab')
type G = kit.G
type Keypad = kit.Keypad

type St = {
    cut: number, -- the column the field is cut at (0: not cut yet)
    shown: number, -- where the cut is drawn (it glides to `cut`)
    cutAt: number,
    a: Vector?,
    b: Vector?,
    live: number, -- what the stroke would do: 0 nothing yet · -1 not a cut · else the column
    gap: kit.Spring,
    -- step 2
    dragging: boolean,
    held: number,
    seen: { [number]: boolean },
    nSeen: number,
    tagAt: number,
    told: boolean,
    -- step 3
    kp: Keypad,
    solvedAt: number,
}

local ROWS, COLS = 6, 14
local R3, C3 = 7, 12 -- step 3
local GAP = 18
-- Where things go. place() sets these for the frame the shell gives: the wide board, or the upright one on a phone
-- (figure in lab.stage, readouts underneath in lab.panel).
local FX, FY, U = 110, 250, 40 -- steps 1 and 2: the field
local PX, PY, PW = 770, 200, 400 -- the working-out (beside the field, or under it): a card per piece
local HY, SY, TY = 236, 366, 500 -- …the whole field's card before the cut, the sum, and step 2's "always 84" tag
local F3X, F3Y, U3 = 130, 228, 36 -- step 3: the field
local QX, QY = 718, 300 -- step 3: the question
local KX, KY = 860, 172 -- step 3: the keypad
local WX, WY = 346, 512 -- step 3: the rule card, once solved
local SMALL = 12 -- the small capital labels

local function place()
    if lab.portrait then
        local st, pn = lab.stage, lab.panel
        U = 26
        FX, FY = st.x + (st.w - COLS * U) / 2 + 29, st.y + 100 -- 29: the bracket down the left side takes room too
        PX, PY, PW = pn.x, pn.y, pn.w
        HY, SY, TY = pn.y, pn.y + 154, pn.y + 278
        U3 = 28
        F3X, F3Y = st.x + (st.w - C3 * U3) / 2 + 29, st.y + 56
        QX, QY = lab.PW / 2, 304
        KX, KY = (lab.PW - 286) / 2, 340
        WX, WY = lab.PW / 2, pn.y
        SMALL = 14
    else
        FX, FY, U = 110, 250, 40
        PX, PY, PW = 770, 200, 400
        HY, SY, TY = 236, 366, 500
        F3X, F3Y, U3 = 130, 228, 36
        QX, QY = 718, 300
        KX, KY = 860, 172
        WX, WY = 346, 512
        SMALL = 12
    end
end

local S: St = {
    cut = 0, shown = 7, cutAt = -1, a = nil, b = nil, live = 0, gap = { x = 0, v = 0 },
    dragging = false, held = 0, seen = {}, nSeen = 0, tagAt = -1, told = false,
    kp = kit.keypad(KX, KY), solvedAt = -1,
}

local L = {}

local function box(x: number, y: number, w: number, h: number): { Vector }
    return { Vector.xy(x, y), Vector.xy(x + w, y), Vector.xy(x + w, y + h), Vector.xy(x, y + h) }
end

-- which cut a stroke from a to b makes: any grid line inside the field, as long as the stroke runs straight down
local function judge(a: Vector, b: Vector): number
    local dx, dy = math.abs(b.x - a.x), math.abs(b.y - a.y)
    if math.max(dx, dy) < 1.6 * U then
        return 0
    end
    if dy <= dx or dx > 0.9 * U then
        return -1
    end
    local at = ((a.x + b.x) / 2 - FX) / U
    if at < 0.4 or at > COLS - 0.4 then
        return -1
    end
    return kit.clamp(math.floor(at + 0.5), 1, COLS - 1)
end

L.id = 'AE_MONO_POLY'
lab.upright[L.id] = true
L.tag = 'MULTIPLYING A MONOMIAL BY A POLYNOMIAL'
L.title = 'Split a multiplication'
L.blurb = 'Cut a field in two: a(b + c) = ab + ac.'
L.steps = {
    { title = 'Cut the field in two', line = 'l1s1', task = 'Swipe straight down across the field to cut it' },
    { title = 'Slide the cut', line = 'l1s2', task = 'Drag the gold knob, then leave the cut at 10' },
    { title = 'Your turn', line = 'l1s3', task = 'Work out 7 × 12 on the keypad' },
}

function L.enter(g: G, step: number)
    place()
    S.cut, S.shown, S.cutAt, S.a, S.b, S.live = 0, 7, -1, nil, nil, 0
    S.gap = { x = 0, v = 0 }
    S.dragging, S.held, S.seen, S.nSeen, S.tagAt, S.told = false, 0, {}, 0, -1, false
    S.kp = kit.keypad(KX, KY)
    S.solvedAt = -1
    if step == 2 then
        -- the field arrives cut down the middle
        S.cut, S.shown = 7, 7
        S.seen[7] = true
        S.nSeen = 1
        S.gap = { x = GAP, v = 0 }
    end
end

function L.advance(g: G, dt: number)
    S.held = kit.follow(S.held, if S.dragging then 1 else 0, 18, dt)
    kit.spring(S.gap, if S.cut > 0 then GAP else 0, 260, 13, dt)
    if S.cut > 0 then
        S.shown = kit.follow(S.shown, S.cut, 24, dt)
    end
    kit.keypadAdvance(S.kp, dt)
end

-- drawing ----------------------------------------------------------------------------------

-- the field, in one piece (cut 0) or two, pushed apart along the cut
local function drawField(r: Renderer, ox: number, oy: number, u: number, rows: number, cols: number, cut: number, gapPx: number)
    if cut <= 0 then
        kit.land(r, box(ox, oy, cols * u, rows * u), kit.style(u, Vector.xy(ox, oy)))
        return
    end
    kit.land(r, box(ox - gapPx / 2, oy, cut * u, rows * u), kit.style(u, Vector.xy(ox - gapPx / 2, oy)))
    local s2 = kit.style(u, Vector.xy(ox + gapPx / 2, oy))
    s2.copy = true
    kit.land(r, box(ox + cut * u + gapPx / 2, oy, (cols - cut) * u, rows * u), s2)
end

-- how long each side is: along the top (one bracket per piece) and down the left
local function drawDims(g: G, r: Renderer, ox: number, oy: number, u: number, rows: number, cols: number, cut: number, at: number, gapPx: number)
    local f = g.fonts
    local top = oy - 26
    if cut <= 0 then
        kit.bracket(r, f, Vector.xy(ox, top), Vector.xy(ox + cols * u, top), 0, -1, tostring(cols), 1, kit.INK)
    else
        kit.bracket(r, f, Vector.xy(ox - gapPx / 2, top), Vector.xy(ox + at * u - gapPx / 2, top), 0, -1, tostring(cut), 1, kit.INK)
        kit.bracket(r, f, Vector.xy(ox + at * u + gapPx / 2, top), Vector.xy(ox + cols * u + gapPx / 2, top), 0, -1, tostring(cols - cut), 1, kit.INK)
    end
    local lx = ox - 26 - gapPx / 2
    kit.bracket(r, f, Vector.xy(lx, oy), Vector.xy(lx, oy + rows * u), -1, 0, tostring(rows), 1, kit.INK)
end

-- the product, written on each piece
local function drawProducts(g: G, r: Renderer, ox: number, oy: number, u: number, rows: number, cols: number, cut: number, at: number, gapPx: number, k1: number, k2: number)
    local f = g.fonts
    local cy = oy + rows * u / 2
    r:save()
    r:modulateOpacity(k1)
    kit.halo(r, f, tostring(rows * cut), f.display, 24, kit.INK, ox - gapPx / 2 + at * u / 2, cy, 0.5)
    r:restore()
    r:save()
    r:modulateOpacity(k2)
    kit.halo(r, f, tostring(rows * (cols - cut)), f.display, 24, kit.INK, ox + gapPx / 2 + (at + cols) * u / 2, cy, 0.5)
    r:restore()
end

local function pieceCard(g: G, r: Renderer, y: number, copy: boolean, text: string, k: number)
    if k <= 0 then
        return
    end
    local f = g.fonts
    r:save()
    r:modulateOpacity(k)
    r:transform(Mat2D.withTranslation(0, (1 - kit.ease(k)) * 12))
    r:drawPath(kit.rrect(PX + 2, y + 5, PW, 64, 18), kit.soft(kit.alpha(kit.INK, 0.1), 10))
    r:drawPath(kit.rrect(PX, y, PW, 64, 18), kit.fill(kit.SURFACE))
    r:drawPath(kit.rrect(PX, y, PW, 64, 18), kit.stroke(kit.LINE, 1.5))
    r:drawPath(kit.rrect(PX + 18, y + 16, 32, 32, 7), kit.fill(if copy then kit.GRASS_COPY else kit.GRASS))
    r:drawPath(kit.rrect(PX + 18, y + 16, 32, 32, 7), kit.stroke(kit.GRASS_EDGE, 2))
    kit.label(r, f, text, f.display, 30, kit.INK, PX + 68, y + 33, 0)
    r:restore()
end

-- the working-out: one card per piece, then the two added
local function drawWorking(g: G, r: Renderer, age: number)
    local f = g.fonts
    if S.cut <= 0 then
        r:drawPath(kit.rrect(PX, HY, PW, 124, 22), kit.fill(kit.PAGE))
        r:drawPath(kit.rrect(PX, HY, PW, 124, 22), kit.stroke(kit.LINE, 2))
        kit.label(r, f, 'THE WHOLE FIELD', f.mono, SMALL, kit.INK_SOFT, PX + 24, HY + 28, 0)
        kit.label(r, f, ROWS .. ' × ' .. COLS .. ' = ?', f.display, 44, kit.INK, PX + 24, HY + 80, 0)
        return
    end
    local a, b = ROWS * S.cut, ROWS * (COLS - S.cut)
    pieceCard(g, r, PY, false, ROWS .. ' × ' .. S.cut .. ' = ' .. a, kit.clamp((age - 0.5) * 2, 0, 1))
    pieceCard(g, r, PY + 76, true, ROWS .. ' × ' .. (COLS - S.cut) .. ' = ' .. b, kit.clamp((age - 1.3) * 2, 0, 1))
    kit.rule(r, f, a .. ' + ' .. b .. ' = ' .. (a + b), 'the whole field, ' .. ROWS .. ' × ' .. COLS, kit.clamp((age - 2.2) * 1.5, 0, 1), PX + PW / 2, SY)
end

local function drawStroke(r: Renderer)
    local a, b = S.a, S.b
    if a == nil or b == nil then
        return
    end
    if S.live > 0 then
        local x = FX + S.live * U
        r:drawPath(kit.line(x, FY - 20, x, FY + ROWS * U + 20), kit.stroke(kit.GOLD, 6))
    else
        r:drawPath(kit.dashed(a.x, a.y, b.x, b.y, 12, 9), kit.stroke(if S.live < 0 then kit.RED else kit.INK, 4))
    end
end

local function knobPos(): Vector
    return Vector.xy(FX + S.shown * U, FY + ROWS * U + 46)
end

local function drawStep1(g: G, r: Renderer)
    local age = if S.cutAt >= 0 then g.t - S.cutAt else 0
    drawField(r, FX, FY, U, ROWS, COLS, S.cut, S.gap.x)
    drawDims(g, r, FX, FY, U, ROWS, COLS, S.cut, S.cut, S.gap.x)
    if S.cut > 0 then
        drawProducts(g, r, FX, FY, U, ROWS, COLS, S.cut, S.cut, S.gap.x, kit.clamp((age - 0.5) * 2, 0, 1), kit.clamp((age - 1.3) * 2, 0, 1))
    else
        drawStroke(r)
        -- a ghost finger shows the swipe until the first try
        if S.a == nil and g.age > 3.5 then
            local k = ((g.age - 3.5) % 2.6) / 2.6
            local al = if k < 0.1 then k / 0.1 elseif k > 0.8 then (1 - k) / 0.2 else 1
            local y = FY - 16 + kit.smooth((k - 0.1) / 0.7) * (ROWS * U + 32)
            kit.finger(r, FX + 10 * U, y, al, true)
        end
    end
    drawWorking(g, r, age)
end

local function drawStep2(g: G, r: Renderer)
    local f = g.fonts
    drawField(r, FX, FY, U, ROWS, COLS, S.shown, S.gap.x)
    drawDims(g, r, FX, FY, U, ROWS, COLS, S.cut, S.shown, S.gap.x)
    drawProducts(g, r, FX, FY, U, ROWS, COLS, S.cut, S.shown, S.gap.x, 1, 1)
    -- the cut, with its knob below the field
    local kp = knobPos()
    r:drawPath(kit.line(kp.x, FY - 12, kp.x, kp.y), kit.stroke(kit.alpha(kit.GOLD, 0.9), 3))
    kit.knob(r, g.t, kp.x, kp.y, 'slide', S.held, not S.dragging and not g.isDone())
    if not S.dragging and S.nSeen <= 1 and g.age > 3.5 then
        local k = ((g.age - 3.5) % 3) / 3
        local al = if k < 0.1 then k / 0.1 elseif k > 0.85 then (1 - k) / 0.15 else 1
        kit.finger(r, kp.x + math.sin(k * math.pi * 2) * 90, kp.y + 4, al, true)
    end
    drawWorking(g, r, 99)
    if S.tagAt >= 0 then
        kit.tag(r, f, 'the total is always 84', PX + PW / 2, TY, kit.clamp((g.t - S.tagAt) * 3, 0, 1))
    end
end

local function drawStep3(g: G, r: Renderer)
    local f = g.fonts
    local age = if S.solvedAt >= 0 then g.t - S.solvedAt else 0
    local k = kit.clamp((age - 1) * 1.5, 0, 1) -- the rule card, rising in once it is solved
    drawField(r, F3X, F3Y, U3, R3, C3, 10, GAP)
    drawDims(g, r, F3X, F3Y, U3, R3, C3, 10, 10, GAP)
    if lab.portrait then -- one line, under the field
        kit.label(r, f, '7 × 12 = 7 × (10 + 2)', f.display, 24, kit.INK, QX, QY, 0.5)
    else
        kit.label(r, f, '7 × 12', f.display, 40, kit.INK, QX, QY, 0.5)
        kit.label(r, f, '= 7 × (10 + 2)', f.body, 19, kit.INK_SOFT, QX, QY + 44, 0.5)
    end
    if S.solvedAt >= 0 then
        drawProducts(g, r, F3X, F3Y, U3, R3, C3, 10, 10, GAP, kit.clamp(age * 2, 0, 1), kit.clamp((age - 0.5) * 2, 0, 1))
    end
    -- upright there is no room for both: the keypad makes way for the rule card
    r:save()
    r:modulateOpacity(if lab.portrait then 1 - k else 1)
    kit.keypadDraw(r, f, S.kp, '7 × 12 = ?', '', g.t)
    r:restore()
    kit.rule(r, f, '7 × 10 + 7 × 2 = 84', 'a(b + c) = ab + ac', k, WX, WY)
end

function L.draw(g: G, r: Renderer)
    if g.step == 1 then
        drawStep1(g, r)
    elseif g.step == 2 then
        drawStep2(g, r)
    else
        drawStep3(g, r)
    end
end

-- input -------------------------------------------------------------------------------------

local function makeCut(g: G, c: number)
    S.cut, S.shown = c, c
    S.cutAt = g.t
    S.gap.v = 300
    g.sfx('slice')
    g.shake(4)
    g.hint('')
    g.done()
    g.sayNext('l1s1done')
end

local function slideTo(g: G, c: number)
    local n = kit.clamp(c, 1, COLS - 1)
    if n == S.cut then
        return
    end
    S.cut = n
    g.tick(n)
    if not S.seen[n] then
        S.seen[n] = true
        S.nSeen += 1
        if S.nSeen == 3 then
            S.tagAt = g.t
        end
    end
end

-- the cut has been let go: 10 is the place to leave it
local function settle(g: G)
    if S.cut == 10 then
        if not g.isDone() then
            g.hint('')
            g.done()
            g.burst(FX + COLS * U / 2, FY + ROWS * U / 2, 40)
            g.say('l1s2done')
        end
    elseif not S.told and not g.isDone() then
        S.told = true
        g.say('l1s2keep')
        g.hint('Leave the cut at 10: 6 × 10 and 6 × 4')
    end
end

local function check(g: G)
    local typed = S.kp.value
    local v = tonumber(typed) or -1
    if v == 84 then
        S.kp.okT = 3
        lab.answer(typed, true, '')
        S.solvedAt = g.t
        g.done()
        g.burst(KX + 140, KY + 128, 40)
        g.say('l1s3done')
    else
        lab.answer(typed, false, if v == 70 then 'FIRST_TERM_ONLY' else '') -- the syllabus mistake this answer shows, if it is a known one
        g.sfx('oops')
        kit.keypadWrong(S.kp, 'Not quite. Have another go.')
        g.say(if v == 70 then 'l1n70' elseif v == 14 then 'l1n14' else 'l1nx')
    end
end

function L.down(g: G, p: Vector): boolean
    if g.step == 1 and S.cut == 0 then
        if kit.inRect(p, FX - 60, FY - 70, COLS * U + 120, ROWS * U + 140) then
            S.a, S.b, S.live = p, p, 0
            return true
        end
    elseif g.step == 2 then
        local cx = FX + S.shown * U
        if kit.dist(p, knobPos()) < 44 or (math.abs(p.x - cx) < 22 and p.y > FY - 20 and p.y < FY + ROWS * U + 20) then
            S.dragging = true
            g.sfx('pickup')
            return true
        end
    elseif g.step == 3 and S.solvedAt < 0 then
        local res = kit.keypadDown(S.kp, p)
        if res == 'ok' then
            check(g)
        elseif res == 'key' then
            g.sfx('tick3')
        end
        return res ~= ''
    end
    return false
end

function L.move(g: G, p: Vector)
    if g.step == 1 and S.a ~= nil and S.cut == 0 then
        local before = S.live
        S.b = p
        S.live = judge(S.a :: Vector, p)
        if S.live ~= before and S.live > 0 then
            g.sfx('pop')
        end
    elseif g.step == 2 and S.dragging then
        slideTo(g, math.floor((p.x - FX) / U + 0.5))
    end
end

function L.up(g: G, p: Vector)
    if g.step == 1 and S.a ~= nil and S.cut == 0 then
        local j = judge(S.a :: Vector, p)
        S.a, S.b, S.live = nil, nil, 0
        if j > 0 then
            makeCut(g, j)
        elseif j < 0 then
            g.sfx('oops')
            g.say('l1slant')
            g.hint('Swipe from the top edge to the bottom edge')
        end
    elseif g.step == 2 and S.dragging then
        S.dragging = false
        g.sfx('drop')
        settle(g)
    end
end

function L.key(g: G, k: number): boolean
    if g.step == 1 and S.cut == 0 and k == 32 then -- space cuts at 10
        makeCut(g, 10)
        return true
    elseif g.step == 2 and (k == 262 or k == 263) then -- arrows slide the cut
        slideTo(g, S.cut + (if k == 262 then 1 else -1))
        settle(g)
        return true
    elseif g.step == 3 and S.solvedAt < 0 then
        local res = kit.keypadKey(S.kp, k)
        if res == 'ok' then
            check(g)
            return true
        end
        return res ~= ''
    end
    return false
end

function L.thumb(g: G, r: Renderer, x: number, y: number, w: number, h: number)
    local u = math.min(15, (h - 30) / ROWS)
    local ox, oy = x + (w - COLS * u) / 2, y + (h - ROWS * u) / 2 - 6
    local c = 7 + 3 * math.sin(g.t * 1.1)
    local gap = 8
    r:drawPath(kit.rect(ox - gap / 2, oy, c * u, ROWS * u), kit.fill(kit.GRASS))
    r:drawPath(kit.rect(ox + c * u + gap / 2, oy, (COLS - c) * u, ROWS * u), kit.fill(kit.GRASS_COPY))
    r:drawPath(kit.line(ox + c * u, oy - 6, ox + c * u, oy + ROWS * u + 10), kit.stroke(kit.GOLD, 2.5))
    r:drawPath(kit.circle(ox + c * u, oy + ROWS * u + 12, 6), kit.fill(kit.GOLD))
end

return L
