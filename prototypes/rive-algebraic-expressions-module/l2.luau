-- Lesson 2 · Two brackets: (a + b)(c + d) = ac + ad + bc + bd
--   1. a 13 × 12 field with gold marks at 10: cut it down at 10 and across at 10 (either order) -> four pieces
--   2. tap each piece: its product drops into the grid on the right and joins the sum: 100 + 30 + 20 + 6 = 156
--   3. 14 × 12 on the keypad, as (10 + 4)(10 + 2) -> 168

local kit = require('kit')
type G = kit.G
type Keypad = kit.Keypad

type Piece = { x: number, y: number, w: number, h: number, sx: number, sy: number, copy: boolean }

type St = {
    v: boolean, -- cut down at 10
    h: boolean, -- cut across at 10
    bothAt: number,
    a: Vector?,
    b: Vector?,
    live: string, -- what the stroke would do: '' · 'v' · 'h' · 'bad'
    gx: kit.Spring,
    gy: kit.Spring,
    -- step 2
    tapped: { [number]: number }, -- piece -> when it was tapped
    order: { number },
    -- step 3
    kp: Keypad,
    solvedAt: number,
}

local COLS, ROWS, CUT, U = 13, 12, 10, 26
local FX, FY = 160, 232
local GAP = 16
local C3, R3, U3 = 14, 12, 20 -- step 3
local F3X, F3Y = 150, 232
local TX, TY = 790, 232 -- step 2: the grid of products

local S: St = {
    v = false, h = false, bothAt = -1, a = nil, b = nil, live = '',
    gx = { x = 0, v = 0 }, gy = { x = 0, v = 0 },
    tapped = {}, order = {},
    kp = kit.keypad(860, 172), solvedAt = -1,
}

local L = {}

-- the field as it is cut so far: 1, 2 or 4 rectangles (in squares), each knowing which way it slides
local function parts(cols: number, rows: number, v: boolean, h: boolean): { Piece }
    local xs: { { number } } = if v then { { 0, CUT, -1 }, { CUT, cols - CUT, 1 } } else { { 0, cols, 0 } }
    local ys: { { number } } = if h then { { 0, CUT, -1 }, { CUT, rows - CUT, 1 } } else { { 0, rows, 0 } }
    local out: { Piece } = {}
    for j, yy in ys do
        for i, xx in xs do
            table.insert(out, { x = xx[1], y = yy[1], w = xx[2], h = yy[2], sx = xx[3], sy = yy[3], copy = (i + j) % 2 == 1 })
        end
    end
    return out
end

-- a piece's rectangle on screen: x, y, w, h
local function rectOf(pc: Piece, ox: number, oy: number, u: number, gx: number, gy: number): (number, number, number, number)
    return ox + pc.x * u + pc.sx * gx / 2, oy + pc.y * u + pc.sy * gy / 2, pc.w * u, pc.h * u
end

local function drawPieces(r: Renderer, ps: { Piece }, ox: number, oy: number, u: number, gx: number, gy: number, lit: { [number]: number })
    for i, pc in ps do
        local x, y, w, h = rectOf(pc, ox, oy, u, gx, gy)
        local st = kit.style(u, Vector.xy(ox + pc.sx * gx / 2, oy + pc.sy * gy / 2))
        st.copy = pc.copy
        st.edge = if lit[i] ~= nil then 1 else 0
        kit.land(r, { Vector.xy(x, y), Vector.xy(x + w, y), Vector.xy(x + w, y + h), Vector.xy(x, y + h) }, st)
    end
end

-- both sides, measured in their two parts: 10 and the rest
local function drawDims(g: G, r: Renderer, ox: number, oy: number, u: number, cols: number, rows: number, gx: number, gy: number)
    local f = g.fonts
    local top, left = oy - 26 - gy / 2, ox - 26 - gx / 2
    kit.bracket(r, f, Vector.xy(ox - gx / 2, top), Vector.xy(ox + CUT * u - gx / 2, top), 0, -1, tostring(CUT), 1, kit.INK)
    kit.bracket(r, f, Vector.xy(ox + CUT * u + gx / 2, top), Vector.xy(ox + cols * u + gx / 2, top), 0, -1, tostring(cols - CUT), 1, kit.INK)
    kit.bracket(r, f, Vector.xy(left, oy - gy / 2), Vector.xy(left, oy + CUT * u - gy / 2), -1, 0, tostring(CUT), 1, kit.INK)
    kit.bracket(r, f, Vector.xy(left, oy + CUT * u + gy / 2), Vector.xy(left, oy + rows * u + gy / 2), -1, 0, tostring(rows - CUT), 1, kit.INK)
end

local function drawProducts(g: G, r: Renderer, ps: { Piece }, ox: number, oy: number, u: number, gx: number, gy: number, since: (i: number) -> number)
    local f = g.fonts
    for i, pc in ps do
        local k = kit.clamp(since(i) * 3, 0, 1)
        if k > 0 then
            local x, y, w, h = rectOf(pc, ox, oy, u, gx, gy)
            r:save()
            r:modulateOpacity(k)
            kit.halo(r, f, tostring(pc.w * pc.h), f.display, if w < 70 then 20 else 24, kit.INK, x + w / 2, y + h / 2, 0.5)
            r:restore()
        end
    end
end

-- which cut a stroke from a to b makes: only the lines at the gold marks count
local function judge(a: Vector, b: Vector): string
    local dx, dy = math.abs(b.x - a.x), math.abs(b.y - a.y)
    if math.max(dx, dy) < 2.4 * U then
        return ''
    end
    if dy > dx then
        if dx > 1.4 * U then
            return 'bad'
        end
        return if math.abs(((a.x + b.x) / 2 - FX) / U - CUT) <= 0.9 then 'v' else 'bad'
    end
    if dy > 1.4 * U then
        return 'bad'
    end
    return if math.abs(((a.y + b.y) / 2 - FY) / U - CUT) <= 0.9 then 'h' else 'bad'
end

L.id = 'AE_BINOMIAL_BINOMIAL'
L.tag = 'MULTIPLYING TWO BINOMIALS'
L.title = 'Two binomials, four pieces'
L.blurb = 'Cut both ways: four pieces to add.'
L.steps = {
    { title = 'Cut it both ways', line = 'l2s1', task = 'Cut down at 10, then across at 10' },
    { title = 'Add the four pieces', line = 'l2s2', task = 'Tap each of the four pieces' },
    { title = 'Your turn', line = 'l2s3', task = 'Work out 14 × 12 on the keypad' },
}

function L.enter(g: G, step: number)
    S.v, S.h, S.bothAt, S.a, S.b, S.live = false, false, -1, nil, nil, ''
    S.gx, S.gy = { x = 0, v = 0 }, { x = 0, v = 0 }
    S.tapped, S.order = {}, {}
    S.kp = kit.keypad(860, 172)
    S.solvedAt = -1
    if step == 2 then
        S.v, S.h = true, true
        S.gx, S.gy = { x = GAP, v = 0 }, { x = GAP, v = 0 }
    end
end

function L.advance(g: G, dt: number)
    kit.spring(S.gx, if S.v then GAP else 0, 260, 13, dt)
    kit.spring(S.gy, if S.h then GAP else 0, 260, 13, dt)
    kit.keypadAdvance(S.kp, dt)
end

-- drawing ----------------------------------------------------------------------------------

-- a gold arrowhead at a 10 mark, pointing at the field
local function mark(r: Renderer, t: number, x: number, y: number, down: boolean)
    local k = (t * 0.8) % 1
    r:drawPath(kit.circle(x, y, 6 + k * 14), kit.stroke(kit.alpha(kit.GOLD, 0.7 * (1 - k)), 2.5))
    local P: { Vector } = if down
        then { Vector.xy(x - 8, y - 12), Vector.xy(x + 8, y - 12), Vector.xy(x, y) }
        else { Vector.xy(x - 12, y - 8), Vector.xy(x, y), Vector.xy(x - 12, y + 8) }
    r:drawPath(kit.poly(P), kit.fill(kit.GOLD))
    r:drawPath(kit.poly(P), kit.stroke(kit.GOLD_DEEP, 1.5))
end

local function drawStroke(r: Renderer)
    local a, b = S.a, S.b
    if a == nil or b == nil then
        return
    end
    if S.live == 'v' and not S.v then
        r:drawPath(kit.line(FX + CUT * U, FY - 20, FX + CUT * U, FY + ROWS * U + 20), kit.stroke(kit.GOLD, 6))
    elseif S.live == 'h' and not S.h then
        r:drawPath(kit.line(FX - 20, FY + CUT * U, FX + COLS * U + 20, FY + CUT * U), kit.stroke(kit.GOLD, 6))
    else
        r:drawPath(kit.dashed(a.x, a.y, b.x, b.y, 12, 9), kit.stroke(if S.live == '' then kit.INK else kit.RED, 4))
    end
end

local function drawStep1(g: G, r: Renderer)
    local f = g.fonts
    drawPieces(r, parts(COLS, ROWS, S.v, S.h), FX, FY, U, S.gx.x, S.gy.x, {})
    drawDims(g, r, FX, FY, U, COLS, ROWS, S.gx.x, S.gy.x)
    -- where to cut: the gold marks, and (after a wait) the lines themselves
    local glow = if g.age > 5 and S.a == nil then 0.3 + 0.3 * math.sin(g.t * 3) else 0
    if not S.v then
        mark(r, g.t, FX + CUT * U, FY - 5, true)
        if glow > 0 then
            r:drawPath(kit.dashed(FX + CUT * U, FY, FX + CUT * U, FY + ROWS * U, 8, 8, g.t * 30), kit.stroke(kit.alpha(kit.GOLD, glow), 4))
        end
    end
    if not S.h then
        mark(r, g.t, FX - 5, FY + CUT * U, false)
        if glow > 0 then
            r:drawPath(kit.dashed(FX, FY + CUT * U, FX + COLS * U, FY + CUT * U, 8, 8, g.t * 30), kit.stroke(kit.alpha(kit.GOLD, glow), 4))
        end
    end
    if not (S.v and S.h) then
        drawStroke(r)
        -- a ghost finger shows the first swipe
        if S.a == nil and not S.v and not S.h and g.age > 3.5 then
            local k = ((g.age - 3.5) % 2.6) / 2.6
            local al = if k < 0.1 then k / 0.1 elseif k > 0.8 then (1 - k) / 0.2 else 1
            kit.finger(r, FX + CUT * U, FY - 16 + kit.smooth((k - 0.1) / 0.7) * (ROWS * U + 32), al, true)
        end
    end
    -- the question, and what the cuts turn it into
    r:drawPath(kit.rrect(770, 236, 400, 124, 22), kit.fill(kit.PAGE))
    r:drawPath(kit.rrect(770, 236, 400, 124, 22), kit.stroke(kit.LINE, 2))
    kit.label(r, f, 'THE WHOLE FIELD', f.mono, 12, kit.INK_SOFT, 794, 264, 0)
    kit.label(r, f, COLS .. ' × ' .. ROWS .. ' = ?', f.display, 44, kit.INK, 794, 316, 0)
    if S.bothAt >= 0 then
        kit.rule(r, f, '(10 + 3) × (10 + 2)', 'the same field, in four pieces', kit.clamp((g.t - S.bothAt - 0.8) * 1.5, 0, 1), 970, 390)
    end
end

-- step 2: the products, laid out like the pieces
local function cell(i: number): (number, number, number, number)
    local col, row = (i - 1) % 2, math.floor((i - 1) / 2)
    return TX + col * 180, TY + row * 94, if col == 0 then 170 else 110, if row == 0 then 84 else 56
end

local SIDES = { '10 × 10', '10 × 3', '2 × 10', '2 × 3' }

local function drawGrid(g: G, r: Renderer, ps: { Piece })
    local f = g.fonts
    kit.label(r, f, '×', f.display, 20, kit.INK_FAINT, TX - 28, TY - 24, 0.5)
    kit.label(r, f, '10', f.display, 22, kit.INK_SOFT, TX + 85, TY - 24, 0.5)
    kit.label(r, f, '3', f.display, 22, kit.INK_SOFT, TX + 235, TY - 24, 0.5)
    kit.label(r, f, '10', f.display, 22, kit.INK_SOFT, TX - 28, TY + 42, 0.5)
    kit.label(r, f, '2', f.display, 22, kit.INK_SOFT, TX - 28, TY + 122, 0.5)
    for i, pc in ps do
        local x, y, w, h = cell(i)
        local at = S.tapped[i]
        if at ~= nil then
            local k = kit.back((g.t - at) * 3)
            r:drawPath(kit.rrect(x, y, w, h, 14), kit.fill(kit.ACCENT_WASH))
            r:drawPath(kit.rrect(x, y, w, h, 14), kit.stroke(kit.ACCENT, 2))
            r:save()
            r:transform(Mat2D.withTranslation(x + w / 2, y + h / 2) * Mat2D.withScale(k, k) * Mat2D.withTranslation(-(x + w / 2), -(y + h / 2)))
            kit.label(r, f, tostring(pc.w * pc.h), f.display, 28, kit.ACCENT_DEEP, x + w / 2, y + h / 2, 0.5)
            r:restore()
        else
            r:drawPath(kit.rrect(x, y, w, h, 14), kit.fill(kit.PAGE))
            r:drawPath(kit.rrect(x, y, w, h, 14), kit.stroke(kit.LINE, 1.5))
            kit.label(r, f, SIDES[i], f.display, 19, kit.INK_FAINT, x + w / 2, y + h / 2, 0.5)
        end
    end
end

local function sumSoFar(ps: { Piece }): (string, number)
    local s, total = '', 0
    for n, i in S.order do
        local v = ps[i].w * ps[i].h
        s ..= (if n > 1 then ' + ' else '') .. v
        total += v
    end
    return s, total
end

local function drawStep2(g: G, r: Renderer)
    local f = g.fonts
    local ps = parts(COLS, ROWS, true, true)
    drawPieces(r, ps, FX, FY, U, S.gx.x, S.gy.x, S.tapped)
    drawDims(g, r, FX, FY, U, COLS, ROWS, S.gx.x, S.gy.x)
    drawProducts(g, r, ps, FX, FY, U, S.gx.x, S.gy.x, function(i: number): number
        local at = S.tapped[i]
        return if at ~= nil then g.t - at else 0
    end)
    -- a tap target on each piece still to do
    for i, pc in ps do
        if S.tapped[i] == nil then
            local x, y, w, h = rectOf(pc, FX, FY, U, S.gx.x, S.gy.x)
            local pulse = 0.5 + 0.5 * math.sin(g.t * 4 + i)
            r:drawPath(kit.circle(x + w / 2, y + h / 2, 12 + pulse * 3), kit.stroke(kit.alpha(kit.GOLD, 0.8), 2.5))
            r:drawPath(kit.circle(x + w / 2, y + h / 2, 5), kit.fill(kit.GOLD))
        end
    end
    if #S.order == 0 and g.age > 4 then
        local k = ((g.age - 4) % 2) / 2
        local x, y, w, h = rectOf(ps[1], FX, FY, U, S.gx.x, S.gy.x)
        kit.finger(r, x + w / 2 + 14, y + h / 2 + 16, math.sin(k * math.pi), k > 0.4 and k < 0.6)
    end
    drawGrid(g, r, ps)
    local s, total = sumSoFar(ps)
    if #S.order == 0 then
        kit.rule(r, f, '13 × 12 = ?', 'tap a piece to work it out', 1, TX + 145, TY + 180)
    elseif #S.order < 4 then
        kit.rule(r, f, if #S.order == 1 then s else s .. ' = ' .. total, (4 - #S.order) .. ' more to add', 1, TX + 145, TY + 180)
    else
        kit.rule(r, f, s .. ' = ' .. total, 'so 13 × 12 = 156', 1, TX + 145, TY + 180)
    end
end

local function drawStep3(g: G, r: Renderer)
    local f = g.fonts
    local ps = parts(C3, R3, true, true)
    drawPieces(r, ps, F3X, F3Y, U3, GAP, GAP, {})
    drawDims(g, r, F3X, F3Y, U3, C3, R3, GAP, GAP)
    kit.label(r, f, '14 × 12', f.display, 40, kit.INK, 668, 300, 0.5)
    kit.label(r, f, '= (10 + 4) × (10 + 2)', f.body, 19, kit.INK_SOFT, 668, 344, 0.5)
    if S.solvedAt >= 0 then
        local age = g.t - S.solvedAt
        drawProducts(g, r, ps, F3X, F3Y, U3, GAP, GAP, function(i: number): number
            return age - (i - 1) * 0.25
        end)
        kit.rule(r, f, '100 + 40 + 20 + 8 = 168', 'every part times every part', kit.clamp((age - 1.2) * 1.5, 0, 1), F3X + C3 * U3 / 2, 516)
    end
    kit.keypadDraw(r, f, S.kp, '14 × 12 = ?', '', g.t)
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

local function makeCut(g: G, c: string)
    if (c == 'v' and S.v) or (c == 'h' and S.h) then
        g.sfx('oops')
        g.say('l2s1one')
        return
    end
    if c == 'v' then
        S.v = true
        S.gx.v = 300
    else
        S.h = true
        S.gy.v = 300
    end
    g.sfx('slice')
    g.shake(4)
    g.hint('')
    if S.v and S.h then
        S.bothAt = g.t
        g.done()
        g.say('l2s1done')
    else
        g.say('l2s1one')
    end
end

local function tap(g: G, i: number)
    if S.tapped[i] ~= nil then
        return
    end
    S.tapped[i] = g.t
    table.insert(S.order, i)
    g.sfx('pop')
    g.tick(#S.order * 2)
    if #S.order == 4 then
        g.done()
        g.burst(TX + 145, TY + 228, 40)
        g.say('l2s2done')
    end
end

local function check(g: G)
    local v = tonumber(S.kp.value) or -1
    if v == 168 then
        S.kp.okT = 3
        S.solvedAt = g.t
        g.done()
        g.burst(1000, 300, 40)
        g.say('l2s3done')
    else
        g.sfx('oops')
        kit.keypadWrong(S.kp, 'Not quite. Have another go.')
        g.say(if v == 108 then 'l2n108' else 'l2nx')
    end
end

function L.down(g: G, p: Vector): boolean
    if g.step == 1 and not (S.v and S.h) then
        if kit.inRect(p, FX - 70, FY - 70, COLS * U + 140, ROWS * U + 140) then
            S.a, S.b, S.live = p, p, ''
            return true
        end
    elseif g.step == 2 then
        for i, pc in parts(COLS, ROWS, true, true) do
            local x, y, w, h = rectOf(pc, FX, FY, U, S.gx.x, S.gy.x)
            if kit.inRect(p, x, y, w, h) then
                tap(g, i)
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
    if g.step == 1 and S.a ~= nil then
        local before = S.live
        S.b = p
        S.live = judge(S.a :: Vector, p)
        if S.live ~= before and ((S.live == 'v' and not S.v) or (S.live == 'h' and not S.h)) then
            g.sfx('pop')
        end
    end
end

function L.up(g: G, p: Vector)
    if g.step == 1 and S.a ~= nil then
        local j = judge(S.a :: Vector, p)
        S.a, S.b, S.live = nil, nil, ''
        if j == 'v' or j == 'h' then
            makeCut(g, j)
        elseif j == 'bad' then
            g.sfx('oops')
            g.say('l2mark')
            g.hint('Cut at the gold marks: 10 along, and 10 down')
        end
    end
end

function L.key(g: G, k: number): boolean
    if g.step == 1 and not (S.v and S.h) and (k == 86 or k == 72 or k == 32) then -- V and H cut; space makes the next cut
        makeCut(g, if k == 86 then 'v' elseif k == 72 then 'h' elseif not S.v then 'v' else 'h')
        return true
    elseif g.step == 2 and k == 32 then -- space taps the next piece
        for i = 1, 4 do
            if S.tapped[i] == nil then
                tap(g, i)
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
    local u = math.min(10, (h - 24) / ROWS)
    local gap = 3 + 6 * (0.5 + 0.5 * math.sin(g.t * 1.6))
    local ox, oy = x + (w - COLS * u) / 2, y + (h - ROWS * u) / 2
    for _, pc in parts(COLS, ROWS, true, true) do
        local px, py, pw, ph = rectOf(pc, ox, oy, u, gap, gap)
        r:drawPath(kit.rect(px, py, pw, ph), kit.fill(if pc.copy then kit.GRASS_COPY else kit.GRASS))
    end
end

return L
