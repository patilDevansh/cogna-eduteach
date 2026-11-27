-- Lesson 3 · The square of a sum: (a + b)² = a² + 2ab + b²
--   1. a 5 × 5 square field: drag its gold corner out until every side is 3 longer; two strips and a small
--      corner grow with it: 25 + 15 + 15 + 9 = 64
--   2. the trap: 5² + 3² only fills 34 of the 8 × 8 square; drag the two strips into the gaps: 34, 49, 64
--   3. (10 + 2)² on the keypad -> 144

local kit = require('kit')
local lab = require('lab')
type G = kit.G
type Keypad = kit.Keypad

type Strip = { x: number, y: number, hx: number, hy: number, tx: number, ty: number, w: number, h: number, placed: boolean, held: number }

type St = {
    b: number, -- how much longer each side is (0 … 3)
    bs: number, -- …as drawn (it glides)
    dragging: boolean,
    held: number,
    sign: number,
    grownAt: number,
    -- step 2
    strips: { Strip },
    drag: number, -- which strip is held (0: none)
    grabX: number,
    grabY: number,
    nPlaced: number,
    fullAt: number,
    -- step 3
    kp: Keypad,
    solvedAt: number,
}

local A, B = 5, 3
local A3, B3, GAP3 = 10, 2, 14 -- step 3
local SQUARES = kit.ACCENT_DEEP -- the colour of the two squares in the sums
local STRIPS = Color.rgb(74, 150, 70) -- …and of the two strips
-- Where things go. place() sets these for the frame the shell gives: the wide board, or the upright one on a phone
-- (figure in lab.stage, readouts underneath in lab.panel).
local FX, FY, U = 170, 220, 42 -- step 1: the growing square
local PX, PY, PW = 720, 200, 440 -- step 1: the working-out (beside the square, or under it)
local LY, LP, RY = 372, 30, 470 -- …its key to the pieces (first row, row to row) and its rule card
local F2X, F2Y, U2 = 120, 232, 36 -- step 2: the 8 by 8 square
local H1X, H1Y, H2X, H2Y = 470, 232, 470, 442 -- step 2: where the tall strip and the wide strip wait
local QX, QY = 940, 196 -- step 2: the 5² + 3² card (centre, top)
local NX, NY = 835, 322 -- step 2: the FILLED SO FAR sign
local EX, EY = 940, 436 -- step 2: the rule card, once both strips are in
local F3X, F3Y, U3 = 160, 236, 20 -- step 3: the square
local TX, TY = 668, 300 -- step 3: the question
local KX, KY = 860, 172 -- step 3: the keypad
local WX, WY = 280, 516 -- step 3: the rule card, once solved
local SMALL = 12 -- the small capital labels

local function place()
    if lab.portrait then
        local st, pn = lab.stage, lab.panel
        U = 34
        FX, FY = st.x + (st.w - (A + B) * U) / 2 + 20, st.y + 60 -- 20: the bracket down the left side takes room too
        PX, PY, PW = pn.x, pn.y, pn.w
        LY, LP, RY = pn.y + 158, 26, pn.y + 234
        U2 = 32
        F2X, F2Y = st.x + (st.w - (A + B) * U2) / 2 + 27, st.y + 72
        -- the panel, top to bottom: the 5² + 3² card (230 wide) beside the sign (210 wide), then the strips
        -- waiting side by side; the last rule card takes the strips' place once they are in
        QX, QY = 129, pn.y
        NX, NY = 256, pn.y + 6
        H1X, H1Y = (lab.PW - (A + B) * U2 - 40) / 2, pn.y + 114
        H2X, H2Y = H1X + B * U2 + 40, H1Y + (A - B) * U2 / 2
        EX, EY = lab.PW / 2, H1Y + (A * U2 - 96) / 2
        U3 = 16
        F3X, F3Y = st.x + (st.w - (A3 + B3) * U3) / 2 + 30, st.y + 65
        TX, TY = lab.PW / 2, 314
        KX, KY = (lab.PW - 286) / 2, 340
        WX, WY = lab.PW / 2, pn.y
        SMALL = 14
    else
        FX, FY, U = 170, 220, 42
        PX, PY, PW = 720, 200, 440
        LY, LP, RY = 372, 30, 470
        F2X, F2Y, U2 = 120, 232, 36
        H1X, H1Y, H2X, H2Y = 470, 232, 470, 442
        QX, QY = 940, 196
        NX, NY = 835, 322
        EX, EY = 940, 436
        F3X, F3Y, U3 = 160, 236, 20
        TX, TY = 668, 300
        KX, KY = 860, 172
        WX, WY = 280, 516
        SMALL = 12
    end
end

local function newStrips(): { Strip }
    return {
        -- the tall one fits the gap top right, the wide one the gap bottom left
        { x = H1X, y = H1Y, hx = H1X, hy = H1Y, tx = F2X + A * U2, ty = F2Y, w = B, h = A, placed = false, held = 0 },
        { x = H2X, y = H2Y, hx = H2X, hy = H2Y, tx = F2X, ty = F2Y + A * U2, w = A, h = B, placed = false, held = 0 },
    }
end

local S: St = {
    b = 0, bs = 0, dragging = false, held = 0, sign = 0, grownAt = -1,
    strips = newStrips(), drag = 0, grabX = 0, grabY = 0, nPlaced = 0, fullAt = -1,
    kp = kit.keypad(KX, KY), solvedAt = -1,
}

local L = {}

local function box(x: number, y: number, w: number, h: number): { Vector }
    return { Vector.xy(x, y), Vector.xy(x + w, y), Vector.xy(x + w, y + h), Vector.xy(x, y + h) }
end

-- a sum written term by term, each in its own colour
local function sum(r: Renderer, f: kit.Fonts, terms: { { s: string, c: Color } }, x: number, y: number, size: number)
    local cx = x
    for _, t in terms do
        cx += kit.label(r, f, t.s, f.display, size, t.c, cx, y, 0) + size * 0.3
    end
end

L.id = 'AE_IDENTITY_SQ_PLUS'
lab.upright[L.id] = true
L.tag = 'THE IDENTITY (a + b)² = a² + 2ab + b²'
L.title = 'The square of a sum'
L.blurb = 'Grow a square: (a + b)² has two strips.'
L.steps = {
    { title = 'Grow the square', line = 'l3s1', task = 'Drag the gold corner until each side is 8' },
    { title = 'The trap', line = 'l3s2', task = 'Drag both strips into the gaps' },
    { title = 'Your turn', line = 'l3s3', task = 'Work out (10 + 2)² on the keypad' },
}

function L.enter(g: G, step: number)
    place()
    S.b, S.bs, S.dragging, S.held, S.sign, S.grownAt = 0, 0, false, 0, 0, -1
    S.strips, S.drag, S.nPlaced, S.fullAt = newStrips(), 0, 0, -1
    S.kp = kit.keypad(KX, KY)
    S.solvedAt = -1
end

function L.advance(g: G, dt: number)
    S.held = kit.follow(S.held, if S.dragging then 1 else 0, 18, dt)
    S.sign = math.max(0, S.sign - dt * 3)
    S.bs = kit.follow(S.bs, S.b, 20, dt)
    for i, st in S.strips do
        st.held = kit.follow(st.held, if S.drag == i then 1 else 0, 18, dt)
        if S.drag ~= i and not st.placed then
            -- a strip that was let go drifts back to where it waits
            st.x = kit.follow(st.x, st.hx, 14, dt)
            st.y = kit.follow(st.y, st.hy, 14, dt)
        end
    end
    kit.keypadAdvance(S.kp, dt)
end

-- drawing ----------------------------------------------------------------------------------

local function cornerPos(): Vector
    return Vector.xy(FX + (A + S.bs) * U, FY + (A + S.bs) * U)
end

local function drawStep1(g: G, r: Renderer)
    local f = g.fonts
    local b, bs = S.b, S.bs
    local e = A * U -- the old square's side, in px
    -- where the bigger square will reach
    local full = box(FX, FY, (A + B) * U, (A + B) * U)
    for i = 1, 4 do
        local p, q = full[i], full[(i % 4) + 1]
        r:drawPath(kit.dashed(p.x, p.y, q.x, q.y, 10, 8), kit.stroke(kit.alpha(kit.GOLD, 0.55), 2.5))
    end
    kit.land(r, box(FX, FY, e, e), kit.style(U, Vector.xy(FX, FY)))
    if bs > 0.06 then
        local st = kit.style(U, Vector.xy(FX, FY))
        st.copy = true
        kit.land(r, box(FX + e, FY, bs * U, e), st)
        kit.land(r, box(FX, FY + e, e, bs * U), st)
        kit.land(r, box(FX + e, FY + e, bs * U, bs * U), kit.style(U, Vector.xy(FX, FY)))
    end
    -- sides
    kit.bracket(r, f, Vector.xy(FX, FY - 26), Vector.xy(FX + e, FY - 26), 0, -1, tostring(A), 1, kit.INK)
    kit.bracket(r, f, Vector.xy(FX - 26, FY), Vector.xy(FX - 26, FY + e), -1, 0, tostring(A), 1, kit.INK)
    if b > 0 and bs > 0.3 then
        kit.bracket(r, f, Vector.xy(FX + e, FY - 26), Vector.xy(FX + e + bs * U, FY - 26), 0, -1, tostring(b), 1, kit.GOLD_DEEP)
        kit.bracket(r, f, Vector.xy(FX - 26, FY + e), Vector.xy(FX - 26, FY + e + bs * U), -1, 0, tostring(b), 1, kit.GOLD_DEEP)
    end
    -- what each piece is worth
    kit.halo(r, f, tostring(A * A), f.display, 26, kit.INK, FX + e / 2, FY + e / 2, 0.5)
    if b > 0 and bs > b - 0.3 then
        local m = e + bs * U / 2
        kit.halo(r, f, tostring(A * b), f.display, 20, kit.INK, FX + m, FY + e / 2, 0.5)
        kit.halo(r, f, tostring(A * b), f.display, 20, kit.INK, FX + e / 2, FY + m, 0.5)
        kit.halo(r, f, tostring(b * b), f.display, 20, kit.INK, FX + m, FY + m, 0.5)
    end
    -- the corner to drag
    local cp = cornerPos()
    kit.knob(r, g.t, cp.x, cp.y, 'slide', S.held, not S.dragging and not g.isDone())
    if not S.dragging and b == 0 and g.age > 3.5 then
        local k = ((g.age - 3.5) % 2.6) / 2.6
        local al = if k < 0.1 then k / 0.1 elseif k > 0.8 then (1 - k) / 0.2 else 1
        local d = kit.smooth((k - 0.1) / 0.7) * B * U
        kit.finger(r, cp.x + d + 6, cp.y + d + 8, al, true)
    end

    -- the working-out
    local side = A + b
    local done = b == B
    r:drawPath(kit.rrect(PX, PY, PW, 136, 22), kit.fill(if done then kit.ACCENT_WASH else kit.PAGE))
    r:drawPath(kit.rrect(PX, PY, PW, 136, 22), kit.stroke(if done then kit.ACCENT else kit.LINE, 2))
    kit.label(r, f, 'AREA OF THE SQUARE NOW', f.mono, SMALL, kit.INK_SOFT, PX + 24, PY + 26, 0)
    local sc = 1 + 0.06 * math.sin(kit.clamp(S.sign, 0, 1) * math.pi)
    r:save()
    r:transform(Mat2D.withTranslation(PX + 24, PY + 72) * Mat2D.withScale(sc, sc) * Mat2D.withTranslation(-(PX + 24), -(PY + 72)))
    if b == 0 then
        sum(r, f, { { s = '25', c = SQUARES } }, PX + 24, PY + 72, 34)
    else
        sum(r, f, {
            { s = '25', c = SQUARES }, { s = '+', c = kit.INK_SOFT }, { s = tostring(A * b), c = STRIPS }, { s = '+', c = kit.INK_SOFT },
            { s = tostring(A * b), c = STRIPS }, { s = '+', c = kit.INK_SOFT }, { s = tostring(b * b), c = SQUARES },
            { s = '=', c = kit.INK }, { s = tostring(side * side), c = kit.INK },
        }, PX + 24, PY + 72, 34)
    end
    r:restore()
    kit.label(r, f, if b == 0 then '5 × 5' else '(5 + ' .. b .. ') × (5 + ' .. b .. ') = ' .. side .. ' × ' .. side, f.body, 17, kit.INK_SOFT, PX + 24, PY + 112, 0)
    -- which piece is which
    if b > 0 then
        local rows = {
            { s = 'the old square, 5 × 5', c = kit.GRASS },
            { s = 'two strips, 5 × ' .. b .. ' each', c = kit.GRASS_COPY },
            { s = 'the new corner, ' .. b .. ' × ' .. b, c = kit.GRASS },
        }
        for i, row in rows do
            local y = LY + (i - 1) * LP
            r:drawPath(kit.rrect(PX + 24, y - 9, 18, 18, 4), kit.fill(row.c))
            r:drawPath(kit.rrect(PX + 24, y - 9, 18, 18, 4), kit.stroke(kit.GRASS_EDGE, 1.5))
            kit.label(r, f, row.s, f.body, 16, kit.INK_SOFT, PX + 54, y, 0)
        end
    end
    if S.grownAt >= 0 then
        kit.rule(r, f, '8 × 8 = 64', '(5 + 3)² = 5² + 2 × 15 + 3²', kit.clamp((g.t - S.grownAt - 0.6) * 1.5, 0, 1), PX + PW / 2, RY)
    end
end

local function near(st: Strip): number
    return math.sqrt((st.x - st.tx) ^ 2 + (st.y - st.ty) ^ 2)
end

-- step 2's working-out
local function drawTally(g: G, r: Renderer)
    local f = g.fonts
    local total = 34 + 15 * S.nPlaced
    kit.rule(r, f, '5² + 3² = 34', 'is that all of (5 + 3)²?', 1, QX, QY)
    kit.sign(r, f, 'FILLED SO FAR', total .. ' of 64', S.sign, NX, NY)
    if S.fullAt >= 0 then
        kit.rule(r, f, '25 + 15 + 15 + 9 = 64', '(5 + 3)² = 5² + 2 × 15 + 3²', kit.clamp((g.t - S.fullAt - 0.6) * 1.5, 0, 1), EX, EY)
    end
end

local function drawStep2(g: G, r: Renderer)
    local f = g.fonts
    local e, s3 = A * U2, B * U2
    if lab.portrait then -- upright the strips are carried up across the working-out, so it goes underneath
        drawTally(g, r)
    end
    local side = e + s3
    -- the whole square, (5 + 3) on each side
    r:drawPath(kit.rect(F2X, F2Y, side, side), kit.fill(kit.alpha(kit.PAGE, 0.9)))
    local full = box(F2X, F2Y, side, side)
    for i = 1, 4 do
        local p, q = full[i], full[(i % 4) + 1]
        r:drawPath(kit.dashed(p.x, p.y, q.x, q.y, 10, 8), kit.stroke(kit.INK_SOFT, 2.5))
    end
    kit.bracket(r, f, Vector.xy(F2X, F2Y - 26), Vector.xy(F2X + e, F2Y - 26), 0, -1, '5', 1, kit.INK)
    kit.bracket(r, f, Vector.xy(F2X + e, F2Y - 26), Vector.xy(F2X + side, F2Y - 26), 0, -1, '3', 1, kit.INK)
    kit.bracket(r, f, Vector.xy(F2X - 26, F2Y), Vector.xy(F2X - 26, F2Y + e), -1, 0, '5', 1, kit.INK)
    kit.bracket(r, f, Vector.xy(F2X - 26, F2Y + e), Vector.xy(F2X - 26, F2Y + side), -1, 0, '3', 1, kit.INK)
    -- the gaps still open
    for _, st in S.strips do
        if not st.placed then
            local d = near(st)
            local gk = if d < 5 * U2 then kit.clamp(1.4 - d / (4 * U2), 0.2, 1) else 0.2
            local slot = box(st.tx, st.ty, st.w * U2, st.h * U2)
            r:drawPath(kit.poly(slot), kit.fill(kit.alpha(kit.GOLD_WASH, 0.5 * gk + 0.2)))
            for i = 1, 4 do
                local p, q = slot[i], slot[(i % 4) + 1]
                r:drawPath(kit.dashed(p.x, p.y, q.x, q.y, 10, 8), kit.stroke(kit.alpha(kit.GOLD, 0.5 + 0.5 * gk), 3))
            end
            kit.label(r, f, '?', f.display, 30, kit.alpha(kit.GOLD_DEEP, 0.6), st.tx + st.w * U2 / 2, st.ty + st.h * U2 / 2, 0.5)
        end
    end
    -- the two squares that 5² + 3² counts, and the strips: those in place sit between the squares
    -- (so no soil shows through a join), those still waiting come next, and the held one is on top
    kit.land(r, box(F2X, F2Y, e, e), kit.style(U2, Vector.xy(F2X, F2Y)))
    for pass = 1, 3 do
        if pass == 2 then
            kit.land(r, box(F2X + e, F2Y + e, s3, s3), kit.style(U2, Vector.xy(F2X, F2Y)))
            kit.halo(r, f, '5² = 25', f.display, 22, kit.INK, F2X + e / 2, F2Y + e / 2, 0.5)
            kit.halo(r, f, '3² = 9', f.display, 19, kit.INK, F2X + e + s3 / 2, F2Y + e + s3 / 2, 0.5)
        end
        for i, st in S.strips do
            if pass == (if st.placed then 1 elseif S.drag == i then 3 else 2) then
                local bob = if not st.placed and S.drag ~= i and near(st) > 4 * U2 then math.sin(g.t * 4 + i) * 3 else 0
                local ls = kit.style(U2, Vector.xy(st.x, st.y - bob))
                ls.copy = true
                ls.lift = st.held
                ls.edge = if st.placed then 0 else 1
                kit.land(r, box(st.x, st.y - bob, st.w * U2, st.h * U2), ls)
                kit.halo(r, f, if st.placed then '15' else '5 × 3', f.display, 20, kit.INK, st.x + st.w * U2 / 2, st.y - bob + st.h * U2 / 2 - 13 * st.held, 0.5)
            end
        end
    end
    if S.drag == 0 and S.nPlaced == 0 and g.age > 4.5 then
        local st = S.strips[1]
        local k = ((g.age - 4.5) % 2.8) / 2.8
        local al = if k < 0.1 then k / 0.1 elseif k > 0.8 then (1 - k) / 0.2 else 1
        local m = kit.smooth((k - 0.1) / 0.7)
        kit.finger(r, kit.lerp(st.hx, st.tx, m) + st.w * U2 / 2, kit.lerp(st.hy, st.ty, m) + st.h * U2 / 2 + 30, al, true)
    end
    if not lab.portrait then
        drawTally(g, r)
    end
end

local function drawStep3(g: G, r: Renderer)
    local f = g.fonts
    local e, s = A3 * U3, B3 * U3
    local o = GAP3 / 2
    local st = kit.style(U3, Vector.xy(F3X - o, F3Y - o))
    kit.land(r, box(F3X - o, F3Y - o, e, e), st)
    local st2 = kit.style(U3, Vector.xy(F3X + o, F3Y - o))
    st2.copy = true
    kit.land(r, box(F3X + e + o, F3Y - o, s, e), st2)
    local st3 = kit.style(U3, Vector.xy(F3X - o, F3Y + o))
    st3.copy = true
    kit.land(r, box(F3X - o, F3Y + e + o, e, s), st3)
    kit.land(r, box(F3X + e + o, F3Y + e + o, s, s), kit.style(U3, Vector.xy(F3X + o, F3Y + o)))
    local top, left = F3Y - 26 - o, F3X - 26 - o
    kit.bracket(r, f, Vector.xy(F3X - o, top), Vector.xy(F3X + e - o, top), 0, -1, '10', 1, kit.INK)
    kit.bracket(r, f, Vector.xy(F3X + e + o, top), Vector.xy(F3X + e + s + o, top), 0, -1, '2', 1, kit.INK)
    kit.bracket(r, f, Vector.xy(left, F3Y - o), Vector.xy(left, F3Y + e - o), -1, 0, '10', 1, kit.INK)
    kit.bracket(r, f, Vector.xy(left, F3Y + e + o), Vector.xy(left, F3Y + e + s + o), -1, 0, '2', 1, kit.INK)
    local age = if S.solvedAt >= 0 then g.t - S.solvedAt else 0
    local k = kit.clamp((age - 1.2) * 1.5, 0, 1) -- the rule card, rising in once it is solved
    if lab.portrait then -- one line, under the square
        kit.label(r, f, '(10 + 2)² = (10 + 2) × (10 + 2)', f.display, 24, kit.INK, TX, TY, 0.5)
    else
        kit.label(r, f, '(10 + 2)²', f.display, 40, kit.INK, TX, TY, 0.5)
        kit.label(r, f, '= (10 + 2) × (10 + 2)', f.body, 19, kit.INK_SOFT, TX, TY + 44, 0.5)
    end
    if S.solvedAt >= 0 then
        local function worth(v: number, x: number, y: number, at: number)
            local k = kit.clamp((age - at) * 3, 0, 1)
            if k > 0 then
                r:save()
                r:modulateOpacity(k)
                kit.halo(r, f, tostring(v), f.display, if v < 100 then 18 else 24, kit.INK, x, y, 0.5)
                r:restore()
            end
        end
        worth(100, F3X - o + e / 2, F3Y - o + e / 2, 0)
        worth(20, F3X + e + o + s / 2, F3Y - o + e / 2, 0.25)
        worth(20, F3X - o + e / 2, F3Y + e + o + s / 2, 0.5)
        worth(4, F3X + e + o + s / 2, F3Y + e + o + s / 2, 0.75)
    end
    -- upright there is no room for both: the keypad makes way for the rule card
    r:save()
    r:modulateOpacity(if lab.portrait then 1 - k else 1)
    kit.keypadDraw(r, f, S.kp, '(10 + 2)² = ?', '', g.t)
    r:restore()
    kit.rule(r, f, '100 + 20 + 20 + 4 = 144', '(a + b)² = a² + 2ab + b²', k, WX, WY)
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

local function grow(g: G, b: number)
    local n = kit.clamp(b, 0, B)
    if n == S.b then
        return
    end
    S.b = n
    S.sign = 1
    g.tick(n * 3)
end

local function settle(g: G)
    if S.b == B and not g.isDone() then
        S.grownAt = g.t
        g.hint('')
        g.done()
        g.burst(FX + (A + B) * U / 2, FY + (A + B) * U / 2, 40)
        g.say('l3s1done')
    end
end

local function placeStrip(g: G, i: number)
    local st = S.strips[i]
    st.x, st.y, st.placed = st.tx, st.ty, true
    S.nPlaced += 1
    S.sign = 1
    g.sfx('snap')
    g.sfx('sparkle')
    g.shake(3)
    g.hint('')
    if S.nPlaced == 2 then
        S.fullAt = g.t
        g.done()
        g.burst(F2X + (A + B) * U2 / 2, F2Y + (A + B) * U2 / 2, 40)
        g.say('l3s2done')
    else
        g.say('l3s2one')
    end
end

local function check(g: G)
    local typed = S.kp.value
    local v = tonumber(typed) or -1
    if v == 144 then
        S.kp.okT = 3
        lab.answer(typed, true, '')
        S.solvedAt = g.t
        g.done()
        g.burst(KX + 140, KY + 128, 40)
        g.say('l3s3done')
    else
        lab.answer(typed, false, if v == 104 then 'SQUARE_DISTRIBUTES' elseif v == 124 then 'MIDDLE_NOT_DOUBLED' else '') -- the syllabus mistake this answer shows, if it is a known one
        g.sfx('oops')
        kit.keypadWrong(S.kp, 'Not quite. Have another go.')
        g.say(if v == 104 then 'l3n104' elseif v == 124 then 'l3n124' else 'l3nx')
    end
end

function L.down(g: G, p: Vector): boolean
    if g.step == 1 then
        if kit.dist(p, cornerPos()) < 44 then
            S.dragging = true
            g.sfx('pickup')
            return true
        end
    elseif g.step == 2 then
        for i, st in S.strips do
            if not st.placed and kit.inRect(p, st.x - 10, st.y - 10, st.w * U2 + 20, st.h * U2 + 20) then
                S.drag = i
                S.grabX, S.grabY = p.x - st.x, p.y - st.y
                g.sfx('pickup')
                return true
            end
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
    if g.step == 1 and S.dragging then
        -- the corner runs along the diagonal, so the field stays square
        grow(g, math.floor(((p.x - FX) + (p.y - FY)) / (2 * U) - A + 0.5))
    elseif g.step == 2 and S.drag > 0 then
        local st = S.strips[S.drag]
        local nx: number = p.x - S.grabX
        local ny: number = p.y - S.grabY
        if math.sqrt((nx - st.tx) ^ 2 + (ny - st.ty) ^ 2) < 0.7 * U2 then
            nx = kit.lerp(nx, st.tx, 0.6)
            ny = kit.lerp(ny, st.ty, 0.6)
        end
        st.x, st.y = nx, ny
    end
end

function L.up(g: G, p: Vector)
    if g.step == 1 and S.dragging then
        S.dragging = false
        g.sfx('drop')
        settle(g)
        if S.b > 0 and S.b < B then
            g.hint('Keep going: make each side 8')
        end
    elseif g.step == 2 and S.drag > 0 then
        local i = S.drag
        local st = S.strips[i]
        local other = S.strips[3 - i]
        S.drag = 0
        if near(st) < 1.5 * U2 then
            placeStrip(g, i)
        elseif not other.placed and kit.inRect(Vector.xy(st.x + st.w * U2 / 2, st.y + st.h * U2 / 2), other.tx, other.ty, other.w * U2, other.h * U2) then
            g.sfx('oops')
            g.say('l3s2wrong')
            g.hint(if i == 1 then 'The tall strip fits the tall gap, top right' else 'The wide strip fits the wide gap, bottom left')
        else
            g.sfx('drop')
        end
    end
end

function L.key(g: G, k: number): boolean
    if g.step == 1 and k >= 262 and k <= 265 then -- arrows grow and shrink the square
        grow(g, S.b + (if k == 262 or k == 264 then 1 else -1))
        settle(g)
        return true
    elseif g.step == 2 and k == 32 then -- space places the next strip
        for i, st in S.strips do
            if not st.placed then
                placeStrip(g, i)
                return true
            end
        end
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
    local u = math.min(13, (h - 16) / (A + B))
    local ox, oy = x + (w - (A + B) * u) / 2, y + (h - (A + B) * u) / 2
    local b = (0.5 - 0.5 * math.cos(g.t * 1.4)) * B
    local e = A * u
    r:drawPath(kit.rect(ox, oy, e, e), kit.fill(kit.GRASS))
    if b > 0.05 then
        r:drawPath(kit.rect(ox + e + 2, oy, b * u, e), kit.fill(kit.GRASS_COPY))
        r:drawPath(kit.rect(ox, oy + e + 2, e, b * u), kit.fill(kit.GRASS_COPY))
        r:drawPath(kit.rect(ox + e + 2, oy + e + 2, b * u, b * u), kit.fill(kit.GRASS))
    end
    r:drawPath(kit.circle(ox + e + 2 + b * u, oy + e + 2 + b * u, 6), kit.fill(kit.GOLD))
    r:drawPath(kit.circle(ox + e + 2 + b * u, oy + e + 2 + b * u, 6), kit.stroke(kit.SURFACE, 2))
end

return L
