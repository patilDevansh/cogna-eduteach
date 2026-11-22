-- Lesson 3 · The square of a sum: (a + b)² = a² + 2ab + b²
--   1. a 5 × 5 square field: drag its gold corner out until every side is 3 longer; two strips and a small
--      corner grow with it: 25 + 15 + 15 + 9 = 64
--   2. the trap: 5² + 3² only fills 34 of the 8 × 8 square; drag the two strips into the gaps: 34, 49, 64
--   3. (10 + 2)² on the keypad -> 144

local kit = require('kit')
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

local A, B, U = 5, 3, 42
local FX, FY = 170, 220
local PX, PW = 720, 440 -- the working-out, on the right
local U2, F2X, F2Y = 36, 120, 232 -- step 2
local A3, B3, U3, GAP3 = 10, 2, 20, 14 -- step 3
local F3X, F3Y = 160, 236
local SQUARES = kit.ACCENT_DEEP -- the colour of the two squares in the sums
local STRIPS = Color.rgb(74, 150, 70) -- …and of the two strips

local function newStrips(): { Strip }
    local hx = F2X + (A + B) * U2 + 62
    return {
        -- the tall one fits the gap top right, the wide one the gap bottom left
        { x = hx, y = F2Y, hx = hx, hy = F2Y, tx = F2X + A * U2, ty = F2Y, w = B, h = A, placed = false, held = 0 },
        { x = hx, y = F2Y + A * U2 + 30, hx = hx, hy = F2Y + A * U2 + 30, tx = F2X, ty = F2Y + A * U2, w = A, h = B, placed = false, held = 0 },
    }
end

local S: St = {
    b = 0, bs = 0, dragging = false, held = 0, sign = 0, grownAt = -1,
    strips = newStrips(), drag = 0, grabX = 0, grabY = 0, nPlaced = 0, fullAt = -1,
    kp = kit.keypad(860, 172), solvedAt = -1,
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
L.tag = 'THE IDENTITY (a + b)² = a² + 2ab + b²'
L.title = 'The square of a sum'
L.blurb = 'Grow a square: (a + b)² has two strips.'
L.steps = {
    { title = 'Grow the square', line = 'l3s1', task = 'Drag the gold corner until each side is 8' },
    { title = 'The trap', line = 'l3s2', task = 'Drag both strips into the gaps' },
    { title = 'Your turn', line = 'l3s3', task = 'Work out (10 + 2)² on the keypad' },
}

function L.enter(g: G, step: number)
    S.b, S.bs, S.dragging, S.held, S.sign, S.grownAt = 0, 0, false, 0, 0, -1
    S.strips, S.drag, S.nPlaced, S.fullAt = newStrips(), 0, 0, -1
    S.kp = kit.keypad(860, 172)
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
    r:drawPath(kit.rrect(PX, 200, PW, 136, 22), kit.fill(if done then kit.ACCENT_WASH else kit.PAGE))
    r:drawPath(kit.rrect(PX, 200, PW, 136, 22), kit.stroke(if done then kit.ACCENT else kit.LINE, 2))
    kit.label(r, f, 'AREA OF THE SQUARE NOW', f.mono, 12, kit.INK_SOFT, PX + 24, 226, 0)
    local sc = 1 + 0.06 * math.sin(kit.clamp(S.sign, 0, 1) * math.pi)
    r:save()
    r:transform(Mat2D.withTranslation(PX + 24, 272) * Mat2D.withScale(sc, sc) * Mat2D.withTranslation(-(PX + 24), -272))
    if b == 0 then
        sum(r, f, { { s = '25', c = SQUARES } }, PX + 24, 272, 34)
    else
        sum(r, f, {
            { s = '25', c = SQUARES }, { s = '+', c = kit.INK_SOFT }, { s = tostring(A * b), c = STRIPS }, { s = '+', c = kit.INK_SOFT },
            { s = tostring(A * b), c = STRIPS }, { s = '+', c = kit.INK_SOFT }, { s = tostring(b * b), c = SQUARES },
            { s = '=', c = kit.INK }, { s = tostring(side * side), c = kit.INK },
        }, PX + 24, 272, 34)
    end
    r:restore()
    kit.label(r, f, if b == 0 then '5 × 5' else '(5 + ' .. b .. ') × (5 + ' .. b .. ') = ' .. side .. ' × ' .. side, f.body, 17, kit.INK_SOFT, PX + 24, 312, 0)
    -- which piece is which
    if b > 0 then
        local rows = {
            { s = 'the old square, 5 × 5', c = kit.GRASS },
            { s = 'two strips, 5 × ' .. b .. ' each', c = kit.GRASS_COPY },
            { s = 'the new corner, ' .. b .. ' × ' .. b, c = kit.GRASS },
        }
        for i, row in rows do
            local y = 372 + (i - 1) * 30
            r:drawPath(kit.rrect(PX + 24, y - 9, 18, 18, 4), kit.fill(row.c))
            r:drawPath(kit.rrect(PX + 24, y - 9, 18, 18, 4), kit.stroke(kit.GRASS_EDGE, 1.5))
            kit.label(r, f, row.s, f.body, 16, kit.INK_SOFT, PX + 54, y, 0)
        end
    end
    if S.grownAt >= 0 then
        kit.rule(r, f, '8 × 8 = 64', '(5 + 3)² = 5² + 2 × 15 + 3²', kit.clamp((g.t - S.grownAt - 0.6) * 1.5, 0, 1), PX + PW / 2, 470)
    end
end

local function near(st: Strip): number
    return math.sqrt((st.x - st.tx) ^ 2 + (st.y - st.ty) ^ 2)
end

local function drawStep2(g: G, r: Renderer)
    local f = g.fonts
    local e, s3 = A * U2, B * U2
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

    -- the working-out
    local total = 34 + 15 * S.nPlaced
    kit.rule(r, f, '5² + 3² = 34', 'is that all of (5 + 3)²?', 1, PX + PW / 2, 196)
    kit.sign(r, f, 'FILLED SO FAR', total .. ' of 64', S.sign, PX + PW / 2 - 105, 322)
    if S.fullAt >= 0 then
        kit.rule(r, f, '25 + 15 + 15 + 9 = 64', '(5 + 3)² = 5² + 2 × 15 + 3²', kit.clamp((g.t - S.fullAt - 0.6) * 1.5, 0, 1), PX + PW / 2, 436)
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
    kit.label(r, f, '(10 + 2)²', f.display, 40, kit.INK, 668, 300, 0.5)
    kit.label(r, f, '= (10 + 2) × (10 + 2)', f.body, 19, kit.INK_SOFT, 668, 344, 0.5)
    if S.solvedAt >= 0 then
        local age = g.t - S.solvedAt
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
        kit.rule(r, f, '100 + 20 + 20 + 4 = 144', '(a + b)² = a² + 2ab + b²', kit.clamp((age - 1.2) * 1.5, 0, 1), F3X + (A3 + B3) * U3 / 2, 516)
    end
    kit.keypadDraw(r, f, S.kp, '(10 + 2)² = ?', '', g.t)
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

local function place(g: G, i: number)
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
    local v = tonumber(S.kp.value) or -1
    if v == 144 then
        S.kp.okT = 3
        S.solvedAt = g.t
        g.done()
        g.burst(1000, 300, 40)
        g.say('l3s3done')
    else
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
            place(g, i)
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
                place(g, i)
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
