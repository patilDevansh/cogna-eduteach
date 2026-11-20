-- Lesson 6 · Splitting shapes
--   1. an L-shaped field: drag along a grid line to split it into two rectangles; each is worked out, then added
--   2. split it the other way: the same total
--   3. fill the empty corner with a gold piece to make one big rectangle, then take the piece away: 48 − 12
--   4. a U-shaped field on the keypad -> 26

local kit = require('kit')
type G = kit.G
type Keypad = kit.Keypad

type St = {
    cut: string, -- '' · 'v' · 'h'
    firstCut: string,
    cutAt: number,
    a: Vector?,
    b: Vector?,
    judge: string, -- live: '' · 'v' · 'h' · 'bad'
    gap: kit.Spring,
    -- step 3
    gx: number,
    gy: number,
    dragging: boolean,
    grabX: number,
    grabY: number,
    held: number,
    snapped: boolean,
    snapAt: number,
    -- step 4
    kp: Keypad,
    solvedAt: number,
}

local L = {}

local U = 46
local FX, FY = 170, 196
local SHAPE = { Vector.xy(0, 0), Vector.xy(4, 0), Vector.xy(4, 3), Vector.xy(8, 3), Vector.xy(8, 6), Vector.xy(0, 6) }
local GOLD0 = Vector.xy(9.6, -0.2) -- where the gold piece waits (squares)
local U4, F4X, F4Y = 44, 150, 230
local USHAPE = { Vector.xy(0, 0), Vector.xy(2, 0), Vector.xy(2, 3), Vector.xy(5, 3), Vector.xy(5, 0), Vector.xy(7, 0), Vector.xy(7, 5), Vector.xy(0, 5) }

local S: St = {
    cut = '', firstCut = '', cutAt = -1, a = nil, b = nil, judge = '', gap = { x = 0, v = 0 },
    gx = GOLD0.x * U, gy = GOLD0.y * U, dragging = false, grabX = 0, grabY = 0, held = 0, snapped = false, snapAt = -1,
    kp = kit.keypad(860, 172), solvedAt = -1,
}

local function q(x: number, y: number): Vector
    return Vector.xy(FX + x * U, FY + y * U)
end

local function rectPx(x: number, y: number, w: number, h: number, dx: number, dy: number): { Vector }
    return { Vector.xy(FX + x * U + dx, FY + y * U + dy), Vector.xy(FX + (x + w) * U + dx, FY + y * U + dy), Vector.xy(FX + (x + w) * U + dx, FY + (y + h) * U + dy), Vector.xy(FX + x * U + dx, FY + (y + h) * U + dy) }
end

-- which cut a stroke from a to b makes (snapped to the grid)
local function judge(a: Vector, b: Vector): string
    local dx, dy = math.abs(b.x - a.x), math.abs(b.y - a.y)
    if math.max(dx, dy) < 1.6 * U then
        return ''
    end
    if dy > dx then
        local x = math.floor(((a.x + b.x) / 2 - FX) / U + 0.5)
        if math.abs(((a.x + b.x) / 2 - FX) / U - x) > 0.4 or dx > 0.8 * U then
            return 'bad'
        end
        return if x == 4 then 'v' else 'bad'
    end
    local y = math.floor(((a.y + b.y) / 2 - FY) / U + 0.5)
    if math.abs(((a.y + b.y) / 2 - FY) / U - y) > 0.4 or dy > 0.8 * U then
        return 'bad'
    end
    return if y == 3 then 'h' else 'bad'
end

L.id = 'split'
L.tag = 'SPLITTING SHAPES'
L.title = 'Awkward corners'
L.blurb = 'Split it, or fill it and take away.'
L.steps = {
    { title = 'Split it into rectangles', line = 'l6s1', task = 'Drag along a grid line to split the field' },
    { title = 'Split it the other way', line = 'l6s2', task = 'Make the other split and compare totals' },
    { title = 'Fill it, then take away', line = 'l6s3', task = 'Drag the gold piece into the empty corner' },
    { title = 'Your turn', line = 'l6s4', task = 'Work out the land on the keypad' },
}

function L.enter(g: G, step: number)
    if step == 1 then
        S.firstCut = ''
    elseif step == 2 and S.firstCut == '' then
        S.firstCut = 'v'
    end
    S.cut, S.cutAt, S.a, S.b, S.judge = '', -1, nil, nil, ''
    S.gap = { x = 0, v = 0 }
    S.gx, S.gy, S.dragging, S.held, S.snapped, S.snapAt = GOLD0.x * U, GOLD0.y * U, false, 0, false, -1
    S.kp = kit.keypad(860, 172)
    S.solvedAt = -1
end

function L.advance(g: G, dt: number)
    S.held = kit.follow(S.held, if S.dragging then 1 else 0, 18, dt)
    kit.spring(S.gap, if S.cut ~= '' then 18 else 0, 260, 13, dt)
    kit.keypadAdvance(S.kp, dt)
end

-- drawing ----------------------------------------------------------------------------------

local function drawPieces(g: G, r: Renderer, cut: string, gapPx: number, age: number)
    local f = g.fonts
    local st = kit.style(U, q(0, 0))
    if cut == '' then
        kit.land(r, kit.toPx(SHAPE, FX, FY, U), st)
        return
    end
    -- two rectangles, pushed apart along the cut
    type Piece = { x: number, y: number, w: number, h: number, dx: number, dy: number }
    local pieces: { Piece } = if cut == 'v'
        then { { x = 0, y = 0, w = 4, h = 6, dx = -gapPx / 2, dy = 0 }, { x = 4, y = 3, w = 4, h = 3, dx = gapPx / 2, dy = 0 } }
        else { { x = 0, y = 0, w = 4, h = 3, dx = 0, dy = -gapPx / 2 }, { x = 0, y = 3, w = 8, h = 3, dx = 0, dy = gapPx / 2 } }
    for i, pc in pieces do
        local s2 = kit.style(U, Vector.xy(FX + pc.dx, FY + pc.dy))
        s2.copy = i == 2
        kit.land(r, rectPx(pc.x, pc.y, pc.w, pc.h, pc.dx, pc.dy), s2)
    end
    for i, pc in pieces do
        local k = kit.clamp((age - 0.6 - (i - 1) * 0.8) * 2, 0, 1)
        if k > 0 then
            local cx, cy = FX + (pc.x + pc.w / 2) * U + pc.dx, FY + (pc.y + pc.h / 2) * U + pc.dy
            r:save()
            r:modulateOpacity(k)
            kit.halo(r, f, pc.w .. ' × ' .. pc.h .. ' = ' .. (pc.w * pc.h), f.display, 24, kit.INK, cx, cy, 0.5)
            r:restore()
        end
    end
end

local function drawCutStroke(g: G, r: Renderer)
    local a, b = S.a, S.b
    if a == nil or b == nil then
        return
    end
    local j = judge(a, b)
    if j == 'v' then
        r:drawPath(kit.line(FX + 4 * U, FY - 20, FX + 4 * U, FY + 6 * U + 20), kit.stroke(kit.GOLD, 6))
    elseif j == 'h' then
        r:drawPath(kit.line(FX - 20, FY + 3 * U, FX + 4 * U + 20, FY + 3 * U), kit.stroke(kit.GOLD, 6))
    else
        r:drawPath(kit.dashed(a.x, a.y, b.x, b.y, 12, 9), kit.stroke(if j == 'bad' then kit.RED else kit.INK, 4))
    end
end

local function drawTotals(g: G, r: Renderer, cut: string, age: number, y: number)
    local f = g.fonts
    local k = kit.clamp((age - 2.2) * 1.5, 0, 1)
    if k <= 0 then
        return
    end
    local sum = if cut == 'v' then '24 + 12 = 36' else '12 + 24 = 36'
    kit.rule(r, f, sum, if cut == 'v' then 'split down the middle' else 'split across', k, 990, y)
end

local function drawStep12(g: G, r: Renderer)
    local f = g.fonts
    local age = if S.cutAt >= 0 then g.t - S.cutAt else 0
    drawPieces(g, r, S.cut, S.gap.x, age)
    if S.cut == '' then
        drawCutStroke(g, r)
        -- hint: the grid lines inside the field glow softly
        if g.age > 4 and S.a == nil then
            local k = 0.35 + 0.35 * math.sin(g.t * 3)
            local want = if g.step == 2 and S.firstCut == 'v' then 'h' elseif g.step == 2 then 'v' else ''
            if want ~= 'h' then
                r:drawPath(kit.dashed(FX + 4 * U, FY, FX + 4 * U, FY + 6 * U, 8, 8, g.t * 30), kit.stroke(kit.alpha(kit.GOLD, k), 4))
            end
            if want ~= 'v' then
                r:drawPath(kit.dashed(FX, FY + 3 * U, FX + 4 * U, FY + 3 * U, 8, 8, g.t * 30), kit.stroke(kit.alpha(kit.GOLD, k), 4))
            end
        end
    else
        drawTotals(g, r, S.cut, age, if g.step == 2 then 330 else 240)
    end
    if g.step == 2 then
        -- the first split, for comparison
        kit.rule(r, f, if S.firstCut == 'v' then '24 + 12 = 36' else '12 + 24 = 36', 'your first split', 1, 990, 200)
    end
    kit.sign(r, f, 'LAND', if S.cut ~= '' and age > 2.2 then '36 sq m' else '? sq m', 0, 885, 470)
end

local function drawStep3(g: G, r: Renderer)
    local f = g.fonts
    local age = if S.snapped then g.t - S.snapAt else 0
    -- the empty corner
    if not S.snapped then
        local slot = rectPx(4, 0, 4, 3, 0, 0)
        local d = math.sqrt((S.gx - 4 * U) ^ 2 + S.gy ^ 2)
        local gk = if d < 4 * U then kit.clamp(1.4 - d / (3 * U), 0.2, 1) else 0.2
        r:drawPath(kit.poly(slot), kit.fill(kit.alpha(kit.GOLD_WASH, 0.5 * gk + 0.15)))
        for i = 1, 4 do
            local a, b = slot[i], slot[(i % 4) + 1]
            r:drawPath(kit.dashed(a.x, a.y, b.x, b.y, 10, 8), kit.stroke(kit.alpha(kit.GOLD, 0.5 + 0.5 * gk), 3))
        end
    end
    kit.land(r, kit.toPx(SHAPE, FX, FY, U), kit.style(U, q(0, 0)))
    -- the gold piece (it fades out again once it has been taken away)
    local takeAway = kit.clamp((age - 3.6) / 0.9, 0, 1)
    local bob = if not S.dragging and not S.snapped then math.sin(g.t * 4) * 3 else 0
    local P = rectPx(0, 0, 4, 3, S.gx + takeAway * 5.2 * U, S.gy - bob)
    r:save()
    r:modulateOpacity(1 - takeAway * 0.6)
    r:drawPath(kit.poly(kit.offset(P, 3 + 10 * S.held, 8 + 20 * S.held)), kit.soft(kit.alpha(kit.INK, 0.2), 9 + 14 * S.held))
    local Q = kit.offset(P, 0, -12 * S.held)
    r:drawPath(kit.poly(Q), kit.fill(kit.GOLD_WASH))
    r:drawPath(kit.poly(Q), kit.fill(kit.alpha(kit.GOLD, 0.45)))
    r:drawPath(kit.poly(Q), kit.stroke(kit.GOLD, if S.snapped then 3 else 5))
    local c = kit.centroid(Q)
    kit.label(r, f, if S.snapped then '− 12' else '4 × 3', f.display, 24, kit.GOLD_DEEP, c.x, c.y, 0.5)
    r:restore()
    if S.snapped then
        local big = rectPx(0, 0, 8, 6, 0, 0)
        r:drawPath(kit.partialOutline(big, (age - 0.2) / 1.0), kit.stroke(kit.ACCENT, 5))
        kit.bracket(r, f, q(0, 6.5), q(8, 6.5), 0, 1, '8', kit.clamp((age - 1.0) * 1.5, 0, 1), kit.INK)
        kit.bracket(r, f, q(-0.6, 0), q(-0.6, 6), -1, 0, '6', kit.clamp((age - 1.6) * 1.5, 0, 1), kit.INK)
        kit.rule(r, f, '8 × 6 = 48', 'the big rectangle', kit.clamp((age - 2.2) * 1.5, 0, 1), 990, 230)
        kit.rule(r, f, '48 − 12 = 36', 'take away the piece we added', kit.clamp((age - 4.2) * 1.5, 0, 1), 990, 360)
    end
end

local function drawStep4(g: G, r: Renderer)
    local f = g.fonts
    kit.land(r, kit.toPx(USHAPE, F4X, F4Y, U4), kit.style(U4, Vector.xy(F4X, F4Y)))
    local function at(x: number, y: number): Vector
        return Vector.xy(F4X + x * U4, F4Y + y * U4)
    end
    kit.bracket(r, f, at(0, 5.5), at(7, 5.5), 0, 1, '7 m', 1, kit.INK)
    kit.bracket(r, f, at(-0.5, 0), at(-0.5, 5), -1, 0, '5 m', 1, kit.INK)
    kit.halo(r, f, '3 m', f.body, 17, kit.INK, F4X + 3.5 * U4, F4Y + 3 * U4 - 22, 0.5)
    kit.halo(r, f, '3 m deep', f.body, 17, kit.INK, F4X + 3.5 * U4, F4Y + 1.5 * U4, 0.5)
    r:drawPath(kit.dashed(F4X + 2.2 * U4, F4Y + 0.1 * U4, F4X + 2.2 * U4, F4Y + 2.9 * U4, 6, 6), kit.stroke(kit.INK_SOFT, 2))
    kit.halo(r, f, '2 m', f.body, 17, kit.INK, F4X + U4, F4Y - 22, 0.5)
    kit.halo(r, f, '2 m', f.body, 17, kit.INK, F4X + 6 * U4, F4Y - 22, 0.5)
    if S.solvedAt >= 0 then
        kit.rule(r, f, '7 × 5 − 3 × 3 = 26', 'or split it: 2 × 5 + 3 × 2 + 2 × 5 = 26', kit.clamp((g.t - S.solvedAt) * 1.5, 0, 1), 420, 486)
    end
    kit.keypadDraw(r, f, S.kp, 'Land in square metres', 'sq m', g.t)
end

function L.draw(g: G, r: Renderer)
    if g.step <= 2 then
        drawStep12(g, r)
    elseif g.step == 3 then
        drawStep3(g, r)
    else
        drawStep4(g, r)
    end
end

-- input -------------------------------------------------------------------------------------

local function makeCut(g: G, c: string)
    if g.step == 2 and c == S.firstCut then
        g.sfx('oops')
        g.say('l6s2same')
        return
    end
    S.cut = c
    S.cutAt = g.t
    S.gap.v = 300
    g.sfx('slice')
    g.shake(4)
    g.done()
    if g.step == 1 then
        S.firstCut = c
        g.sayNext('l6s1done')
    else
        g.sayNext('l6s2done')
    end
end

local function check(g: G)
    local v = tonumber(S.kp.value) or -1
    if v == 26 then
        S.kp.okT = 3
        S.solvedAt = g.t
        g.done()
        g.burst(1000, 300, 40)
        g.say('l6s4done')
    else
        g.sfx('oops')
        kit.keypadWrong(S.kp, 'Not quite. Have another go.')
        g.say(if v == 30 then 'l6nperim' else 'l6nx')
    end
end

function L.down(g: G, p: Vector): boolean
    if g.step <= 2 and S.cut == '' then
        if p.x > FX - 60 and p.x < FX + 8 * U + 60 and p.y > FY - 60 and p.y < FY + 6 * U + 60 then
            S.a, S.b = p, p
            return true
        end
    elseif g.step == 3 and not S.snapped then
        local P = rectPx(0, 0, 4, 3, S.gx, S.gy)
        local x0, y0, x1, y1 = kit.bbox(P)
        if p.x > x0 - 10 and p.x < x1 + 10 and p.y > y0 - 10 and p.y < y1 + 10 then
            S.dragging = true
            S.grabX, S.grabY = p.x - S.gx, p.y - S.gy
            g.sfx('pickup')
            return true
        end
    elseif g.step == 4 and S.solvedAt < 0 then
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
    if g.step <= 2 and S.a ~= nil and S.cut == '' then
        local before = S.judge
        S.b = p
        S.judge = judge(S.a :: Vector, p)
        if S.judge ~= before and (S.judge == 'v' or S.judge == 'h') then
            g.sfx('pop')
        end
    elseif g.step == 3 and S.dragging then
        local nx: number = p.x - S.grabX
        local ny: number = p.y - S.grabY
        if math.sqrt((nx - 4 * U) ^ 2 + ny ^ 2) < 0.7 * U then
            nx = kit.lerp(nx, 4 * U, 0.6)
            ny = kit.lerp(ny, 0, 0.6)
        end
        S.gx = nx
        S.gy = ny
    end
end

function L.up(g: G, p: Vector)
    if g.step <= 2 and S.a ~= nil and S.cut == '' then
        local j = judge(S.a :: Vector, p)
        S.a, S.b, S.judge = nil, nil, ''
        if j == 'v' or j == 'h' then
            makeCut(g, j)
        elseif j == 'bad' then
            g.sfx('oops')
            g.say('l6bad')
            g.hint('Try a line that leaves two rectangles')
        end
    elseif g.step == 3 and S.dragging then
        S.dragging = false
        if math.sqrt((S.gx - 4 * U) ^ 2 + S.gy ^ 2) < 1.5 * U then
            S.gx, S.gy = 4 * U, 0
            S.snapped = true
            S.snapAt = g.t
            g.sfx('snap')
            g.sfx('sparkle')
            g.shake(3)
            g.done()
            g.say('l6s3done')
        else
            g.sfx('oops')
            S.gx, S.gy = GOLD0.x * U, GOLD0.y * U
            g.hint('The gold piece fits the empty corner, top right')
        end
    end
end

function L.key(g: G, k: number): boolean
    if g.step <= 2 and S.cut == '' and (k == 86 or k == 72) then -- V or H cuts
        makeCut(g, if k == 86 then 'v' else 'h')
        return true
    elseif g.step == 3 and not S.snapped and k == 32 then
        S.dragging = true
        S.gx, S.gy = 4 * U, 0
        L.up(g, Vector.xy(0, 0))
        return true
    elseif g.step == 4 and S.solvedAt < 0 then
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
    local u = 13
    local ox, oy = x + w / 2 - 4 * u, y + h / 2 - 3 * u
    local k = 0.5 + 0.5 * math.sin(g.t * 1.6)
    local gap = k * 10
    r:drawPath(kit.poly(kit.toPx({ Vector.xy(0, 0), Vector.xy(4, 0), Vector.xy(4, 6), Vector.xy(0, 6) }, ox - gap / 2, oy, u)), kit.fill(kit.GRASS))
    r:drawPath(kit.poly(kit.toPx({ Vector.xy(4, 3), Vector.xy(8, 3), Vector.xy(8, 6), Vector.xy(4, 6) }, ox + gap / 2, oy, u)), kit.fill(kit.GRASS_COPY))
end

return L
