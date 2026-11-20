-- Lesson 7 · Units of area
--   1. one square metre, and a zoom slider: zoom into its corner until decimetres, then centimetres appear,
--      with a ruler counting 0 … 100 cm. 100 × 100 = 10,000 square centimetres
--   2. drag a corner to scale a square: twice as wide holds 4 copies, three times holds 9 (k × k)
--   3. on the keypad: 1 square metre in square centimetres -> 10,000

local kit = require('kit')
type G = kit.G
type Keypad = kit.Keypad

type St = {
    s: number, -- slider 0..1 (zoom = 100^s)
    sShown: number,
    dragging: boolean,
    held: number,
    maxZ: number,
    zoomDone: boolean,
    -- step 2
    k: number,
    kShown: number,
    seen: { [number]: number },
    bornAt: { [number]: number },
    said2: boolean,
    -- step 3
    kp: Keypad,
    solvedAt: number,
}

local L = {}

local VX, VY, VW, VH = 80, 172, 640, 400 -- the zoom window
local S0 = 330 -- a metre on screen at zoom 1
local SLX0, SLX1, SLY = 140, 660, 606
local U2, F2X, F2Y = 64, 150, 206

local S: St = {
    s = 0, sShown = 0, dragging = false, held = 0, maxZ = 1, zoomDone = false,
    k = 1, kShown = 1, seen = {}, bornAt = {}, said2 = false,
    kp = kit.keypad(860, 172), solvedAt = -1,
}

local function zoom(): number
    return 100 ^ S.sShown
end

L.id = 'units'
L.tag = 'UNITS OF AREA'
L.title = 'Square metres, square centimetres'
L.blurb = 'Zoom in: 1 m² = 10,000 cm².'
L.steps = {
    { title = 'Zoom into one square metre', line = 'l7s1', task = 'Drag the slider to zoom right in' },
    { title = 'Make it bigger', line = 'l7s2', task = 'Make a square with 9 times the area' },
    { title = 'Your turn', line = 'l7s3', task = 'How many square centimetres in a square metre?' },
}

function L.enter(g: G, step: number)
    S.s, S.sShown, S.dragging, S.held, S.maxZ, S.zoomDone = 0, 0, false, 0, 1, false
    S.k, S.kShown, S.seen, S.bornAt, S.said2 = 1, 1, { [1] = g.t }, {}, false
    S.kp = kit.keypad(860, 172)
    S.solvedAt = -1
end

function L.advance(g: G, dt: number)
    S.held = kit.follow(S.held, if S.dragging then 1 else 0, 18, dt)
    S.sShown = kit.follow(S.sShown, S.s, 9, dt)
    S.kShown = kit.follow(S.kShown, S.k, 14, dt)
    if g.step == 1 then
        local z = zoom()
        if z > S.maxZ then
            -- a tick each time a new power of ten-ish is passed
            if math.floor(math.log(z) * 4) > math.floor(math.log(S.maxZ) * 4) then
                g.tick(math.floor(math.log(z) * 2))
            end
            S.maxZ = z
        end
        if not S.zoomDone and z > 55 then
            S.zoomDone = true
            g.done()
            g.sfx('sparkle')
            g.say('l7s1done')
        end
    end
    kit.keypadAdvance(S.kp, dt)
end

-- step 1 ---------------------------------------------------------------------------------------

local function drawZoom(g: G, r: Renderer)
    local f = g.fonts
    local z = zoom()
    -- the square's corner moves to the window's top-left as we zoom in
    local t = kit.smooth(math.log(z) / math.log(5))
    local ox = kit.lerp(VX + (VW - S0) / 2, VX + 60, t)
    local oy = kit.lerp(VY + (VH - S0) / 2, VY + 54, t)
    local side = S0 * z
    r:drawPath(kit.rrect(VX, VY, VW, VH, 20), kit.fill(kit.PAGE))
    r:save()
    r:clipPath(kit.rrect(VX, VY, VW, VH, 20))
    -- the square metre
    r:drawPath(kit.rect(ox, oy, side, side), kit.fill(kit.TILE))
    -- grid levels fade in as they get big enough to see
    local function gridLevel(n: number, col: Color, w: number)
        local cell = side / n
        local a = kit.clamp((cell - 5) / 18, 0, 1)
        if a <= 0 then
            return
        end
        local p = Path.new()
        local i0 = math.max(0, math.floor((VX - ox) / cell))
        local i1 = math.min(n, math.ceil((VX + VW - ox) / cell))
        local j0 = math.max(0, math.floor((VY - oy) / cell))
        local j1 = math.min(n, math.ceil((VY + VH - oy) / cell))
        local yTop, yBot = math.max(oy, VY), math.min(oy + side, VY + VH)
        local xL, xR = math.max(ox, VX), math.min(ox + side, VX + VW)
        for i = i0, i1 do
            p:moveTo(Vector.xy(ox + i * cell, yTop))
            p:lineTo(Vector.xy(ox + i * cell, yBot))
        end
        for j = j0, j1 do
            p:moveTo(Vector.xy(xL, oy + j * cell))
            p:lineTo(Vector.xy(xR, oy + j * cell))
        end
        r:drawPath(p, kit.stroke(kit.alpha(col, a), w))
    end
    gridLevel(100, kit.TILE_EDGE, 1)
    gridLevel(10, kit.GOLD, 2.5)
    r:drawPath(kit.rect(ox, oy, side, side), kit.stroke(kit.GOLD_DEEP, 4))
    -- one centimetre square, picked out once it can be seen
    local cm = side / 100
    if cm > 14 then
        local k = kit.clamp((cm - 14) / 20, 0, 1)
        r:drawPath(kit.rect(ox, oy, cm, cm), kit.fill(kit.alpha(kit.ACCENT, 0.55 * k)))
        kit.halo(r, f, '1 cm²', f.body, 16, kit.ACCENT_DEEP, ox + cm + 10, oy + cm / 2, 0)
    end
    -- the ruler along the top edge
    local dm = side / 10
    local rp = Path.new()
    for i = 0, 100 do
        local x = ox + i * cm
        if x >= VX - 2 and x <= VX + VW + 2 then
            local major = i % 10 == 0
            local h = if major then 14 elseif i % 5 == 0 then 9 else 5
            if major or cm > 4 then
                rp:moveTo(Vector.xy(x, oy - 4))
                rp:lineTo(Vector.xy(x, oy - 4 - h))
            end
        end
    end
    r:drawPath(rp, kit.stroke(kit.INK, 1.5))
    for i = 0, 10 do
        local x = ox + i * dm
        if x >= VX + 10 and x <= VX + VW - 10 and (dm > 34 or i == 0 or i == 10) then
            kit.label(r, f, tostring(i * 10), f.mono, 12, kit.INK_SOFT, x, oy - 30, 0.5)
        end
    end
    if cm > 26 then
        for i = 1, 9 do
            local x = ox + i * cm
            if x <= VX + VW - 10 then
                kit.label(r, f, tostring(i), f.mono, 11, kit.INK_FAINT, x, oy - 30, 0.5)
            end
        end
    end
    r:restore()
    kit.label(r, f, 'cm', f.mono, 12, kit.INK_SOFT, VX + VW - 14, VY + 18, 1)
    -- zoom badge
    r:drawPath(kit.rrect(VX + 16, VY + VH - 50, 120, 34, 17), kit.fill(kit.alpha(kit.SURFACE, 0.92)))
    kit.label(r, f, '× ' .. kit.num(math.floor(z + 0.5)) .. ' zoom', f.mono, 13, kit.INK, VX + 76, VY + VH - 33, 0.5)
    -- slider
    r:drawPath(kit.rrect(SLX0, SLY - 5, SLX1 - SLX0, 10, 5), kit.fill(kit.LINE))
    r:drawPath(kit.rrect(SLX0, SLY - 5, (SLX1 - SLX0) * S.sShown, 10, 5), kit.fill(kit.GOLD))
    kit.label(r, f, '1 m', f.body, 14, kit.INK_SOFT, SLX0 - 16, SLY, 1)
    kit.label(r, f, '1 cm', f.body, 14, kit.INK_SOFT, SLX1 + 16, SLY, 0)
    kit.knob(r, g.t, SLX0 + (SLX1 - SLX0) * S.sShown, SLY, 'slide', S.held, not S.dragging and S.s < 0.05)
    -- what we have learnt so far, on the right
    local x = 770
    local function fact(at: number, big: string, small: string, y: number)
        local k = kit.clamp((math.log(z) - math.log(at)) * 2, 0, 1)
        if k <= 0 then
            return
        end
        r:save()
        r:modulateOpacity(k)
        r:transform(Mat2D.withTranslation(0, (1 - k) * 12))
        kit.label(r, f, big, f.display, 30, kit.INK, x, y, 0)
        kit.label(r, f, small, f.body, 16, kit.INK_SOFT, x, y + 32, 0)
        r:restore()
    end
    fact(1, '1 m²', 'one metre each way', 200)
    fact(4, '1 m = 100 cm', 'along the top: 100 centimetres', 290)
    fact(14, '100 rows of 100', 'down the side: 100 rows', 380)
    fact(40, '100 × 100 = 10,000', 'so 1 m² = 10,000 cm²', 470)
end

-- step 2 ---------------------------------------------------------------------------------------

local function drawScale(g: G, r: Renderer)
    local f = g.fonts
    local k = S.kShown
    local side = k * U2
    -- copies of the first square fill the bigger one
    local n = S.k
    for j = 0, 3 do
        for i = 0, 3 do
            if i < n and j < n then
                local born = S.bornAt[j * 10 + i] or (g.t - 5)
                local e = kit.back((g.t - born) * 4)
                local x, y = F2X + i * U2, F2Y + j * U2
                local cx, cy = x + U2 / 2, y + U2 / 2
                r:save()
                r:transform(Mat2D.withTranslation(cx, cy) * Mat2D.withScale(e, e) * Mat2D.withTranslation(-cx, -cy))
                kit.tile(r, x, y, U2, 1, if i == 0 and j == 0 then 0.9 else 0)
                r:restore()
            end
        end
    end
    r:drawPath(kit.rect(F2X, F2Y, side, side), kit.stroke(kit.GOLD_DEEP, 3.5))
    kit.halo(r, f, kit.num(math.floor(k + 0.5)) .. ' m', f.body, 18, kit.INK, F2X + side / 2, F2Y - 24, 0.5)
    kit.halo(r, f, kit.num(math.floor(k + 0.5)) .. ' m', f.body, 18, kit.INK, F2X - 18, F2Y + side / 2, 1)
    kit.knob(r, g.t, F2X + side, F2Y + side, 'slide', S.held, not S.dragging and S.k == 1)
    -- the table of what has been tried
    local tx, ty = 560, 190
    r:drawPath(kit.rrect(tx, ty, 300, 280, 20), kit.fill(kit.PAGE))
    kit.label(r, f, 'WIDTH', f.mono, 12, kit.INK_SOFT, tx + 30, ty + 30, 0)
    kit.label(r, f, 'AREA', f.mono, 12, kit.INK_SOFT, tx + 170, ty + 30, 0)
    for i = 1, 4 do
        local y = ty + 30 + i * 54
        local seen = S.seen[i]
        local on = S.k == i
        if on then
            r:drawPath(kit.rrect(tx + 10, y - 22, 280, 44, 14), kit.fill(kit.ACCENT_WASH))
        end
        kit.label(r, f, '× ' .. i, f.display, 24, if seen ~= nil then kit.INK else kit.INK_FAINT, tx + 30, y, 0)
        kit.label(r, f, if seen ~= nil then '× ' .. (i * i) else '?', f.display, 24, if seen ~= nil then (if i == 3 then kit.GOLD_DEEP else kit.ACCENT_DEEP) else kit.INK_FAINT, tx + 170, y, 0)
    end
    kit.rule(r, f, 'width × 3  →  area × 9', 'it grows in both directions: 3 × 3', if S.seen[3] ~= nil then kit.clamp((g.t - (S.seen[3] or g.t)) * 1.5, 0, 1) else 0, 710, 492)
end

-- step 3 ---------------------------------------------------------------------------------------

local function drawStep3(g: G, r: Renderer)
    local f = g.fonts
    local x, y, s = 180, 196, 300
    r:drawPath(kit.rrect(x + 4, y + 10, s, s, 10), kit.soft(kit.alpha(kit.INK, 0.15), 14))
    r:drawPath(kit.rrect(x, y, s, s, 10), kit.fill(kit.TILE))
    r:drawPath(kit.rrect(x, y, s, s, 10), kit.stroke(kit.TILE_EDGE, 3))
    if S.solvedAt >= 0 then
        local k = kit.clamp((g.t - S.solvedAt) / 1.5, 0, 1)
        local p = Path.new()
        for i = 1, 99 do
            p:moveTo(Vector.xy(x + i * s / 100, y))
            p:lineTo(Vector.xy(x + i * s / 100, y + s * k))
            p:moveTo(Vector.xy(x, y + i * s / 100))
            p:lineTo(Vector.xy(x + s * k, y + i * s / 100))
        end
        r:drawPath(p, kit.stroke(kit.alpha(kit.TILE_EDGE, 0.7), 0.8))
        kit.rule(r, f, '1 m² = 10,000 cm²', '100 cm × 100 cm', k, 600, 486)
    end
    kit.bracket(r, f, Vector.xy(x, y + s + 24), Vector.xy(x + s, y + s + 24), 0, 1, '1 m = 100 cm', 1, kit.INK)
    kit.bracket(r, f, Vector.xy(x - 24, y), Vector.xy(x - 24, y + s), -1, 0, '1 m', 1, kit.INK)
    kit.keypadDraw(r, f, S.kp, 'Square centimetres', 'cm²', g.t)
end

function L.draw(g: G, r: Renderer)
    if g.step == 1 then
        drawZoom(g, r)
    elseif g.step == 2 then
        drawScale(g, r)
    else
        drawStep3(g, r)
    end
end

-- input --------------------------------------------------------------------------------------------

local function setK(g: G, k: number)
    local n = kit.clamp(k, 1, 4)
    if n == S.k then
        return
    end
    for j = 0, n - 1 do
        for i = 0, n - 1 do
            if i >= S.k or j >= S.k then
                S.bornAt[j * 10 + i] = g.t + (i + j) * 0.03
            end
        end
    end
    S.k = n
    g.tick(n * n - 1)
    if S.seen[n] == nil then
        S.seen[n] = g.t
    end
end

local function releaseK(g: G)
    if S.k == 2 and not S.said2 then
        S.said2 = true
        g.say('l7s2two')
    elseif S.k == 3 and not g.isDone() then
        g.done()
        g.burst(F2X + 1.5 * U2, F2Y + 1.5 * U2, 40)
        g.say('l7s2done')
    end
end

local function check(g: G)
    local v = tonumber(S.kp.value) or -1
    if v == 10000 then
        S.kp.okT = 3
        S.solvedAt = g.t
        g.done()
        g.burst(1000, 300, 60)
        g.say('l7s3done')
    else
        g.sfx('oops')
        kit.keypadWrong(S.kp, 'Not quite. Have another go.')
        g.say(if v == 100 then 'l7n100' elseif v == 200 then 'l7n200' else 'l7nx')
    end
end

function L.down(g: G, p: Vector): boolean
    if g.step == 1 then
        if p.y > SLY - 30 and p.y < SLY + 30 and p.x > SLX0 - 30 and p.x < SLX1 + 30 then
            S.dragging = true
            S.s = kit.clamp((p.x - SLX0) / (SLX1 - SLX0), 0, 1)
            g.sfx('pickup')
            return true
        end
    elseif g.step == 2 then
        local c = Vector.xy(F2X + S.kShown * U2, F2Y + S.kShown * U2)
        if kit.dist(p, c) < 44 then
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
    if g.step == 1 and S.dragging then
        S.s = kit.clamp((p.x - SLX0) / (SLX1 - SLX0), 0, 1)
    elseif g.step == 2 and S.dragging then
        local d = ((p.x - F2X) + (p.y - F2Y)) / 2 / U2
        setK(g, math.floor(d + 0.5))
    end
end

function L.up(g: G, p: Vector)
    if S.dragging then
        S.dragging = false
        g.sfx('drop')
        if g.step == 2 then
            releaseK(g)
        end
    end
end

function L.key(g: G, k: number): boolean
    if g.step == 1 and (k == 262 or k == 263) then
        S.s = kit.clamp(S.s + (if k == 262 then 0.1 else -0.1), 0, 1)
        return true
    elseif g.step == 2 and (k == 262 or k == 263) then
        setK(g, S.k + (if k == 262 then 1 else -1))
        releaseK(g)
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
    local z = 1 + 6 * (0.5 + 0.5 * math.sin(g.t * 0.8))
    local side = 70 * z
    local ox, oy = x + w / 2 - 35 * (1 / z) - 30 * (z - 1) / 6, y + h / 2 - 35
    r:save()
    r:clipPath(kit.rect(x, y, w, h))
    r:drawPath(kit.rect(ox, oy, side, side), kit.fill(kit.TILE))
    local p = Path.new()
    for i = 0, 10 do
        p:moveTo(Vector.xy(ox + i * side / 10, oy))
        p:lineTo(Vector.xy(ox + i * side / 10, oy + side))
        p:moveTo(Vector.xy(ox, oy + i * side / 10))
        p:lineTo(Vector.xy(ox + side, oy + i * side / 10))
    end
    r:drawPath(p, kit.stroke(kit.alpha(kit.GOLD, 0.7), 1))
    r:drawPath(kit.rect(ox, oy, side, side), kit.stroke(kit.GOLD_DEEP, 2))
    r:restore()
end

return L
