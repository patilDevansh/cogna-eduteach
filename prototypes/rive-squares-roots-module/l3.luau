-- Lesson 3 · Square roots
--   1. 36 tiles in three long rows: drag a gold handle to change how wide the rows are and the tiles shuffle; 6 wide is a square, so √36 = 6
--   2. 40 tiles: try a side of 6 (4 left over) and a side of 7 (9 short), so √40 is between 6 and 7
--   3. a square garden of 81 sq m on the keypad -> side 9 (40 or 41 is the "halved, not rooted" slip)

local kit = require('kit')
type G = kit.G
type Keypad = kit.Keypad

type St = {
    w: number, -- step 1: tiles in a row
    s: number, -- step 2: the side being tried
    px: { number }, -- where each tile is now (they glide to their places)
    py: { number },
    dragging: boolean,
    held: number,
    sign: number,
    touched: boolean,
    doneAt: number,
    tried6: number, -- when each side was tried (-1: not yet)
    tried7: number,
    kp: Keypad,
    solvedAt: number,
}

local TX, TY, TU, N1 = 150, 206, 34, 36 -- step 1
local OX, OY, OU, N2 = 150, 204, 38, 40 -- step 2
local FX, FY, FU = 170, 226, 34 -- step 3: the garden

local S: St = {
    w = 12, s = 5, px = {}, py = {}, dragging = false, held = 0, sign = 0, touched = false, doneAt = -1,
    tried6 = -1, tried7 = -1, kp = kit.keypad(860, 172), solvedAt = -1,
}

local L = {}

-- where tile i (from 0) belongs
local function target(step: number, i: number): (number, number)
    if step == 1 then
        return TX + (i % S.w) * TU, TY + math.floor(i / S.w) * TU
    end
    local s = S.s
    if i < s * s then
        return OX + (i % s) * OU, OY + math.floor(i / s) * OU
    end
    -- the ones that do not fit stack up beside the square
    local j = i - s * s
    return OX + s * OU + 46 + math.floor(j / s) * OU, OY + (j % s) * OU
end

-- The fonts have no root sign, so it is drawn: a tick, a stroke down, a long stroke up and a bar over the number.
-- x is its left edge and y the middle of the line; returns how wide the sign and its number are.
local function radical(r: Renderer, f: kit.Fonts, x: number, y: number, size: number, n: string, c: Color): number
    local wn = kit.width(f, n, f.display, size)
    local p = Path.new()
    p:moveTo(Vector.xy(x, y + size * 0.06))
    p:lineTo(Vector.xy(x + size * 0.13, y - size * 0.02))
    p:lineTo(Vector.xy(x + size * 0.3, y + size * 0.36))
    p:lineTo(Vector.xy(x + size * 0.5, y - size * 0.5))
    p:lineTo(Vector.xy(x + size * 0.62 + wn, y - size * 0.5))
    r:drawPath(p, kit.stroke(c, size * 0.085))
    kit.label(r, f, n, f.display, size, c, x + size * 0.56, y, 0)
    return size * 0.66 + wn
end

-- kit.rule, with a root sign at the front: "√n rest"
local function rootRule(r: Renderer, f: kit.Fonts, n: string, rest: string, note: string, k: number, cx: number, y: number)
    if k <= 0 then
        return
    end
    local size = 34
    local e = kit.back(k)
    local wroot = size * 0.66 + kit.width(f, n, f.display, size) + size * 0.26
    local total = wroot + kit.width(f, rest, f.display, size)
    local w = math.max(total, kit.width(f, note, f.body, 17)) + 64
    r:save()
    r:modulateOpacity(kit.clamp(k * 2, 0, 1))
    r:transform(Mat2D.withTranslation(0, (1 - e) * 24))
    r:drawPath(kit.rrect(cx - w / 2 + 3, y + 8, w, 96, 20), kit.soft(kit.alpha(kit.INK, 0.14), 14))
    r:drawPath(kit.rrect(cx - w / 2, y, w, 96, 20), kit.fill(kit.ACCENT_WASH))
    r:drawPath(kit.rrect(cx - w / 2, y, w, 96, 20), kit.stroke(kit.alpha(kit.ACCENT, 0.4), 2))
    radical(r, f, cx - total / 2, y + 40, size, n, kit.ACCENT_DEEP)
    kit.label(r, f, rest, f.display, size, kit.ACCENT_DEEP, cx - total / 2 + wroot, y + 40, 0)
    kit.label(r, f, note, f.body, 17, kit.INK_SOFT, cx, y + 76, 0.5)
    r:restore()
end

-- step 1 ------------------------------------------------------------------------------

local function knob1(): Vector
    return Vector.xy(TX + S.w * TU + 28, TY + TU / 2)
end

local function setW(g: G, w: number)
    local nw = kit.clamp(w, 4, 12)
    if nw == S.w then
        return
    end
    S.w = nw
    S.sign = 1
    S.touched = true
    g.tick(12 - nw)
end

local function judge1(g: G)
    if S.w == 6 and S.doneAt < 0 then
        S.doneAt = g.t
        g.done()
        g.sfx('sparkle')
        g.burst(TX + 3 * TU, TY + 3 * TU, 50)
        g.say('l3s1done')
    end
end

local function drawStep1(g: G, r: Renderer)
    local f = g.fonts
    local w = S.w
    local rows = math.ceil(N1 / w)
    local left = N1 % w
    local sq = w == 6
    for i = 0, N1 - 1 do
        local glow = if sq then 0.45 + 0.3 * math.sin(g.t * 3 + i * 0.3) else 0
        kit.tile(r, S.px[i + 1], S.py[i + 1], TU, 1, glow)
    end
    if sq then
        r:drawPath(kit.rect(TX, TY, 6 * TU, 6 * TU), kit.stroke(kit.ACCENT, 3.5))
    end
    -- the gold wall the handle pushes
    r:drawPath(kit.rrect(TX + w * TU + 6, TY - 4, 6, rows * TU + 8, 3), kit.fill(kit.GOLD))
    kit.halo(r, f, tostring(w), f.display, 22, kit.INK, TX + w * TU / 2, TY - 26, 0.5)
    if left == 0 then
        kit.halo(r, f, tostring(rows), f.display, 22, kit.INK, TX - 30, TY + rows * TU / 2, 0.5)
    else
        kit.halo(r, f, tostring(rows - 1), f.display, 22, kit.INK, TX - 30, TY + (rows - 1) * TU / 2, 0.5)
        kit.halo(r, f, '+ ' .. left, f.display, 20, kit.RED, TX + left * TU + 14, TY + (rows - 0.5) * TU, 0)
    end
    local kp = knob1()
    kit.knob(r, g.t, kp.x, kp.y, 'slide', S.held, not S.dragging and not S.touched)
    if not S.touched and not S.dragging and g.age > 3.5 then
        local k = ((g.age - 3.5) % 2.6) / 2.6
        local a = if k < 0.1 then k / 0.1 elseif k > 0.8 then (1 - k) / 0.2 else 1
        kit.finger(r, kp.x - kit.smooth((k - 0.1) / 0.7) * 4 * TU, kp.y + 6, a, true)
    end

    -- readout
    local bx = 660
    r:drawPath(kit.rrect(bx, 196, 500, 140, 22), kit.fill(if sq then kit.ACCENT_WASH else kit.PAGE))
    r:drawPath(kit.rrect(bx, 196, 500, 140, 22), kit.stroke(if sq then kit.ACCENT else kit.LINE, 2))
    kit.label(r, f, 'THE SHAPE OF 36 TILES', f.mono, 12, kit.INK_SOFT, bx + 24, 222, 0)
    local big = if left == 0 then w .. ' × ' .. rows .. ' = 36' else w .. ' × ' .. (rows - 1) .. ' + ' .. left .. ' = 36'
    local sc = 1 + 0.1 * math.sin(kit.clamp(S.sign, 0, 1) * math.pi)
    r:save()
    r:transform(Mat2D.withTranslation(bx + 24, 274) * Mat2D.withScale(sc, sc) * Mat2D.withTranslation(-(bx + 24), -274))
    kit.label(r, f, big, f.display, 46, if sq then kit.ACCENT_DEEP else kit.INK, bx + 24, 274, 0)
    r:restore()
    local note = if sq then 'A perfect square: as wide as it is tall.'
        elseif left == 0 then 'A rectangle: ' .. w .. ' wide and ' .. rows .. ' tall.'
        else 'Not a rectangle: the last row has only ' .. left .. '.'
    kit.label(r, f, note, f.body, 16, if sq then kit.ACCENT_DEEP else kit.INK_SOFT, bx + 24, 316, 0)
    if S.doneAt >= 0 then
        rootRule(r, f, '36', '= 6', 'the side of the square that 36 tiles make', kit.clamp((g.t - S.doneAt - 0.4) * 1.5, 0, 1), 910, 372)
    end
end

-- step 2 ------------------------------------------------------------------------------

local function knob2(): Vector
    return Vector.xy(OX + S.s * OU, OY + S.s * OU)
end

local function setS(g: G, s: number)
    local ns = kit.clamp(s, 5, 8)
    if ns == S.s then
        return
    end
    S.s = ns
    S.sign = 1
    S.touched = true
    g.tick(ns)
end

local function judge2(g: G)
    if S.doneAt >= 0 or (S.s ~= 6 and S.s ~= 7) then
        return
    end
    if S.s == 6 and S.tried6 < 0 then
        S.tried6 = g.t
    elseif S.s == 7 and S.tried7 < 0 then
        S.tried7 = g.t
    else
        return
    end
    if S.tried6 >= 0 and S.tried7 >= 0 then
        S.doneAt = g.t
        g.done()
        g.sfx('sparkle')
        g.burst(910, 420, 40)
        g.say('l3s2done')
    else
        g.sfx('pop')
        g.say(if S.s == 6 then 'l3s2six' else 'l3s2seven')
    end
end

local function attempt(g: G, r: Renderer, y: number, side: number, at: number, verdict: string)
    local f = g.fonts
    local bx = 660
    local on = at >= 0
    r:drawPath(kit.rrect(bx, y, 500, 48, 16), kit.fill(if on then kit.SURFACE else kit.PAGE))
    r:drawPath(kit.rrect(bx, y, 500, 48, 16), kit.stroke(if on then kit.ACCENT else kit.LINE, if on then 2 else 1.5))
    if on then
        r:drawPath(kit.circle(bx + 28, y + 24, 12), kit.fill(kit.ACCENT))
        r:drawPath(kit.check(bx + 28, y + 24, 12), kit.stroke(kit.SURFACE, 2.4))
        kit.label(r, f, side .. ' × ' .. side .. ' = ' .. (side * side), f.display, 22, kit.INK, bx + 52, y + 24, 0)
        kit.label(r, f, verdict, f.body, 16, kit.INK_SOFT, bx + 476, y + 25, 1)
    else
        kit.label(r, f, side .. ' × ' .. side .. ' = ?', f.display, 22, kit.INK_FAINT, bx + 24, y + 24, 0)
        kit.label(r, f, 'try a side of ' .. side, f.body, 16, kit.INK_FAINT, bx + 476, y + 25, 1)
    end
end

local function drawStep2(g: G, r: Renderer)
    local f = g.fonts
    local s = S.s
    local side = s * OU
    local over = N2 - s * s
    -- the square being tried, with a place for every tile it needs
    r:drawPath(kit.rect(OX, OY, side, side), kit.fill(kit.PAGE))
    for i = N2, s * s - 1 do
        local x, y = OX + (i % s) * OU, OY + math.floor(i / s) * OU
        r:drawPath(kit.rrect(x + 4, y + 4, OU - 8, OU - 8, 5), kit.fill(kit.alpha(kit.RED, 0.07)))
        r:drawPath(kit.rrect(x + 4, y + 4, OU - 8, OU - 8, 5), kit.stroke(kit.alpha(kit.RED, 0.55), 1.6))
    end
    for i = 0, N2 - 1 do
        local x, y = S.px[i + 1], S.py[i + 1]
        kit.tile(r, x, y, OU, 1, 0)
        if i >= s * s then
            r:drawPath(kit.rrect(x + 3, y + 3, OU - 6, OU - 6, 5), kit.fill(kit.alpha(kit.RED, 0.14)))
            r:drawPath(kit.rrect(x + 3, y + 3, OU - 6, OU - 6, 5), kit.stroke(kit.RED, 2))
        end
    end
    r:drawPath(kit.rect(OX, OY, side, side), kit.stroke(kit.GOLD, 3.5))
    kit.halo(r, f, tostring(s), f.display, 22, kit.INK, OX + side / 2, OY - 26, 0.5)
    kit.halo(r, f, tostring(s), f.display, 22, kit.INK, OX - 30, OY + side / 2, 0.5)
    if over > 0 then
        kit.label(r, f, over .. ' left over', f.display, 20, kit.RED, OX + side + 46, OY - 24, 0)
    elseif over < 0 then
        kit.label(r, f, -over .. ' short', f.display, 20, kit.RED, OX + side / 2, OY + side + 26, 0.5)
    end
    local kp = knob2()
    kit.knob(r, g.t, kp.x, kp.y, 'slide', S.held, not S.dragging and not S.touched)
    if not S.touched and not S.dragging and g.age > 3.5 then
        local k = ((g.age - 3.5) % 2.6) / 2.6
        local a = if k < 0.1 then k / 0.1 elseif k > 0.8 then (1 - k) / 0.2 else 1
        local d = kit.smooth((k - 0.1) / 0.7) * 1.5 * OU
        kit.finger(r, kp.x + d, kp.y + d, a, true)
    end

    -- readout
    local bx = 660
    r:drawPath(kit.rrect(bx, 196, 500, 124, 22), kit.fill(kit.PAGE))
    r:drawPath(kit.rrect(bx, 196, 500, 124, 22), kit.stroke(kit.LINE, 2))
    kit.label(r, f, '40 TILES, A SIDE OF ' .. s, f.mono, 12, kit.INK_SOFT, bx + 24, 220, 0)
    local sc = 1 + 0.1 * math.sin(kit.clamp(S.sign, 0, 1) * math.pi)
    r:save()
    r:transform(Mat2D.withTranslation(bx + 24, 264) * Mat2D.withScale(sc, sc) * Mat2D.withTranslation(-(bx + 24), -264))
    kit.label(r, f, s .. ' × ' .. s .. ' = ' .. (s * s), f.display, 42, kit.INK, bx + 24, 264, 0)
    r:restore()
    kit.label(r, f, if over > 0 then over .. ' tiles left over: the square is too small.' else -over .. ' tiles short: the square is too big.', f.body, 16, kit.INK_SOFT, bx + 24, 302, 0)
    attempt(g, r, 338, 6, S.tried6, 'too small, 4 left over')
    attempt(g, r, 396, 7, S.tried7, 'too big, 9 short')
    if S.doneAt >= 0 then
        rootRule(r, f, '40', 'is between 6 and 7', 'because 40 is between 36 and 49', kit.clamp((g.t - S.doneAt - 0.4) * 1.5, 0, 1), 910, 464)
    end
end

-- step 3 ------------------------------------------------------------------------------

local function drawStep3(g: G, r: Renderer)
    local f = g.fonts
    local side = 9 * FU
    kit.tree(r, 574, 520, 1, g.t)
    kit.tree(r, 640, 548, 0.7, g.t)
    local P = { Vector.xy(FX, FY), Vector.xy(FX + side, FY), Vector.xy(FX + side, FY + side), Vector.xy(FX, FY + side) }
    kit.land(r, P, kit.style(FU, Vector.xy(FX, FY)))
    kit.halo(r, f, '81 sq m', f.display, 26, kit.INK, FX + side / 2, FY + side / 2, 0.5)
    local label = if S.solvedAt >= 0 then '9 m' else '? m'
    local c = if S.solvedAt >= 0 then kit.ACCENT_DEEP else kit.INK
    kit.bracket(r, f, Vector.xy(FX, FY - 24), Vector.xy(FX + side, FY - 24), 0, -1, label, kit.clamp((g.age - 0.4) * 1.5, 0, 1), c)
    -- the side label sits clear of its bracket (kit.bracket would centre it on top of the line)
    local lk = kit.clamp((g.age - 0.8) * 1.5, 0, 1)
    kit.bracket(r, f, Vector.xy(FX - 26, FY), Vector.xy(FX - 26, FY + side), -1, 0, '', lk, c)
    r:save()
    r:modulateOpacity(kit.clamp((lk - 0.6) / 0.4, 0, 1))
    kit.label(r, f, label, f.display, 26, c, FX - 44, FY + side / 2, 1)
    r:restore()
    if S.solvedAt >= 0 then
        rootRule(r, f, '81', '= 9', 'because 9 × 9 = 81', kit.clamp((g.t - S.solvedAt) * 1.5, 0, 1), 668, 300)
    end
    kit.keypadDraw(r, f, S.kp, 'Side of the square garden', 'm', g.t)
end

local function check(g: G)
    local v = tonumber(S.kp.value) or -1
    if v == 9 then
        S.kp.okT = 3
        S.solvedAt = g.t
        g.done()
        g.burst(1000, 300, 40)
        g.say('l3s3done')
    else
        g.sfx('oops')
        kit.keypadWrong(S.kp, 'Not quite. Have another go.')
        g.say(if v == 40 or v == 41 then 'l3n40' else 'l3nx')
    end
end

-- protocol ---------------------------------------------------------------------------------

L.id = 'square-roots'
L.tag = 'SQUARE ROOTS'
L.title = 'Back from the tiles to the side'
L.blurb = 'Shuffle the tiles into a square.'
L.steps = {
    { title = 'Shuffle 36 tiles into a square', line = 'l3s1', task = 'Drag the gold handle until the tiles make a square' },
    { title = 'Stuck between two squares', line = 'l3s2', task = 'Try a side of 6, then a side of 7' },
    { title = 'Your turn', line = 'l3s3', task = 'Find the side of the garden' },
}

function L.enter(g: G, step: number)
    S.w, S.s = 12, 5
    S.dragging, S.held, S.sign, S.touched, S.doneAt = false, 0, 0, false, -1
    S.tried6, S.tried7 = -1, -1
    S.kp = kit.keypad(860, 172)
    S.solvedAt = -1
    S.px, S.py = {}, {}
    for i = 0, (if step == 1 then N1 else N2) - 1 do
        local x, y = target(step, i)
        S.px[i + 1], S.py[i + 1] = x, y
    end
end

function L.advance(g: G, dt: number)
    S.sign = math.max(0, S.sign - dt * 3)
    S.held = kit.follow(S.held, if S.dragging then 1 else 0, 18, dt)
    kit.keypadAdvance(S.kp, dt)
    if g.step <= 2 then
        -- every tile glides to its place, each at its own pace, so a reshuffle ripples
        for i = 0, #S.px - 1 do
            local x, y = target(g.step, i)
            local rate = 8 + (i % 5) * 1.6
            S.px[i + 1] = kit.follow(S.px[i + 1], x, rate, dt)
            S.py[i + 1] = kit.follow(S.py[i + 1], y, rate, dt)
        end
    end
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

function L.down(g: G, p: Vector): boolean
    if g.step == 1 or g.step == 2 then
        if kit.dist(p, if g.step == 1 then knob1() else knob2()) < 40 then
            S.dragging = true
            g.sfx('pickup')
            return true
        end
    elseif S.solvedAt < 0 then
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
    if not S.dragging then
        return
    end
    if g.step == 1 then
        setW(g, math.floor((p.x - 28 - TX) / TU + 0.5))
    elseif g.step == 2 then
        setS(g, math.floor(((p.x - OX) + (p.y - OY)) / 2 / OU + 0.5))
    end
end

function L.up(g: G, p: Vector)
    if S.dragging then
        S.dragging = false
        g.sfx('drop')
        if g.step == 1 then
            judge1(g)
        else
            judge2(g)
        end
    end
end

function L.key(g: G, k: number): boolean
    local d = if k == 262 or k == 264 then 1 elseif k == 263 or k == 265 then -1 else 0
    if g.step == 1 and d ~= 0 then
        setW(g, S.w + d)
        judge1(g)
        return true
    elseif g.step == 2 and d ~= 0 then
        setS(g, S.s + d)
        judge2(g)
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
    -- sixteen tiles shuffling between two long rows and a square
    local u = math.floor(math.min((w - 40) / 8, (h - 24) / 4))
    local k = kit.smooth(0.5 + 0.9 * math.sin(g.t * 1.1))
    for i = 0, 15 do
        local ax, ay = x + w / 2 - 4 * u + (i % 8) * u, y + h / 2 - u + math.floor(i / 8) * u
        local bx, by = x + w / 2 - 2 * u + (i % 4) * u, y + h / 2 - 2 * u + math.floor(i / 4) * u
        kit.tile(r, kit.lerp(ax, bx, k), kit.lerp(ay, by, k), u, 1, k * 0.6)
    end
end

return L
