-- Lesson 8 · Hidden heights · Fiza's kites (trail Day 9)
--
-- A rooftop workshop in Ahmedabad's old city, a few days before Uttarayan. Fiza (13) is designing her own kite;
-- her Nani has made kites for forty years and finds a height with a plumb line: a thread with a small weight.
-- Kite paper is cut in triangles, and some lean so far that the height falls outside the shape.
--   1. tap the real height of an ordinary kite triangle (the slanted sides are the trap); Nani's thread drops along it
--   2. a triangle leans so far that the thread from its top misses the base: stretch the base line with the gold
--      handle until it runs under the thread; the thread drops, swings and settles at a square corner, outside
--   3. slide the top corner along a line parallel to the base: the slanted sides change, the paper stays ½ × 5 × 4 = 10
--   4. keypad: base 6, height 4 (outside the shape), slanted sides 5 and 9 -> 12
-- Answers go to the trail as l8s1 (the tap) and l8s4 (the keypad), with the mix-up a wrong answer shows.

local kit = require('kit')
local people = require('people')
type G = kit.G
type Keypad = kit.Keypad
type Fonts = kit.Fonts

local L = {}

-- Look ---------------------------------------------------------------------------------------

local OUT = Color.rgb(74, 44, 18) -- the outline brown the people are drawn with
local THREAD = Color.rgb(58, 44, 62)
local STEEL = Color.rgb(162, 172, 184)
local PIN = Color.rgb(212, 60, 56)
local BAMBOO = Color.rgb(218, 184, 120)
local BAMBOO_DK = Color.rgb(150, 110, 56)
local WOOD = Color.rgb(246, 232, 204)
local WOOD_GRAIN = Color.rgb(228, 204, 162)
local PLASTER = Color.rgb(238, 222, 194)
local COPING = Color.rgb(216, 192, 154)
local FLOOR = Color.rgb(230, 214, 188)
local FLOOR_LINE = Color.rgb(206, 182, 146)
local TANK = Color.rgb(50, 54, 60)

-- tissue paper: one colour per step, and the colours of the finished kites
local PAPER: { Color } = {
    Color.rgb(234, 70, 132), -- rani pink
    Color.rgb(126, 92, 212), -- violet
    Color.rgb(20, 156, 152), -- peacock
    Color.rgb(38, 130, 210), -- blue
}
local KITE: { Color } = {
    Color.rgb(234, 70, 132),
    Color.rgb(126, 92, 212),
    Color.rgb(20, 156, 152),
    Color.rgb(38, 130, 210),
    Color.rgb(230, 72, 58),
    Color.rgb(62, 166, 94),
    Color.rgb(252, 250, 244),
    Color.rgb(240, 128, 40),
}

-- Layout -------------------------------------------------------------------------------------

local BASE_Y = 500 -- every triangle's base sits on this line
local WBX, WBY, WBW, WBH = 336, 236, 560, 364 -- Nani's work board, standing against the parapet
local FEET = 612
local NANI_X, FIZA_X = 112, 232
local BOB = 17 -- the weight: from where the thread ties on to its point

-- step 1: an ordinary triangle, base 7, its top over 2.5: the height is inside
local U1, O1X = 54, 427
-- step 2: base 5; the top leans so far that its drop lands 3.5 past the end of the base
local U2, O2X, B2, C2, EXT_MAX = 50, 366, 5, 8.5, 10
-- step 3: base 5, height 4; the top slides from -2.6 to 8
local U3, O3X, B3, A3_MIN, A3_MAX = 46, 490, 5, -2.6, 8
-- step 4: base 6, the top 3 past its end, height 4
local U4, O4X = 46, 409

-- a point of a step's triangle: x along the base line, y = 0 at the top, 4 on the base line
local function at(ox: number, u: number, x: number, y: number): Vector
    return Vector.xy(ox + x * u, BASE_Y - (4 - y) * u)
end

-- The plumb line ------------------------------------------------------------------------------

type Plumb = {
    th: number, -- swing angle (radians; + swings right)
    om: number, -- how fast it swings
    len: number, -- from the pin to the point of the weight (px)
    target: number, -- how long it will be once dropped
    vlen: number, -- how fast it is falling
    falling: boolean,
    landedAt: number,
    settledAt: number,
    lastX: number, -- the pin last frame, to feel how hard it is pushed sideways
    lastV: number,
}

local function plumb(len: number): Plumb
    return {
        th = 0, om = 0, len = len, target = len, vlen = 0, falling = false,
        landedAt = -1, settledAt = -1, lastX = -9999, lastV = 0,
    }
end

-- the pin's sideways push (px/s²), from where it is now
local function push(pl: Plumb, x: number, dt: number): number
    if pl.lastX < -9000 or dt <= 0 then
        pl.lastX, pl.lastV = x, 0
        return 0
    end
    local v = (x - pl.lastX) / dt
    local a = (v - pl.lastV) / dt
    pl.lastX, pl.lastV = x, v
    return kit.clamp(a * 0.18, -1200, 1200)
end

local GRAV = 2600

-- one frame of falling and swinging; ax pushes the pin sideways. True on the frame it lands.
local function swing(pl: Plumb, dt: number, ax: number, damp: number): boolean
    local landed = false
    if pl.falling then
        pl.vlen += 3200 * dt
        pl.len = math.min(pl.target, pl.len + pl.vlen * dt)
        if pl.len >= pl.target then
            pl.falling = false
            landed = true
        end
    end
    local n = math.max(1, math.ceil(dt / 0.004))
    local h = dt / n
    local len = math.max(pl.len, 14)
    for _ = 1, n do
        local a = -(GRAV / len) * math.sin(pl.th) - (ax / len) * math.cos(pl.th) - damp * pl.om
        pl.om += a * h
        pl.th += pl.om * h
    end
    pl.th = kit.clamp(pl.th, -0.75, 0.75)
    return landed
end

-- the thread from its pin at (x, y), and the little steel weight on the end
local function plumbDraw(r: Renderer, pl: Plumb, x: number, y: number)
    local len = pl.len
    r:save()
    r:transform(Mat2D.withTranslation(x, y) * Mat2D.withRotation(-pl.th))
    if len - BOB > 1 then
        r:drawPath(kit.line(0, 0, 0, len - BOB), kit.stroke(THREAD, 2))
    end
    local b = Path.new()
    b:moveTo(Vector.xy(0, len))
    b:lineTo(Vector.xy(-7, len - 8))
    b:cubicTo(Vector.xy(-8, len - 13), Vector.xy(-5, len - BOB), Vector.xy(0, len - BOB))
    b:cubicTo(Vector.xy(5, len - BOB), Vector.xy(8, len - 13), Vector.xy(7, len - 8))
    b:close()
    r:drawPath(b, kit.fill(STEEL))
    r:drawPath(b, kit.stroke(OUT, 2))
    r:drawPath(kit.line(-3, len - 13, -1.5, len - 7), kit.stroke(kit.alpha(kit.SURFACE, 0.8), 1.8))
    r:restore()
    r:drawPath(kit.circle(x, y, 5.5), kit.fill(PIN))
    r:drawPath(kit.circle(x, y, 5.5), kit.stroke(OUT, 2))
    r:drawPath(kit.circle(x - 1.6, y - 1.8, 1.6), kit.fill(kit.alpha(kit.SURFACE, 0.75)))
end

-- Paper and kites -----------------------------------------------------------------------------

-- a triangle of tissue paper: bright, with a grain, a folded-over edge and a brown outline
local function tissue(r: Renderer, P: { Vector }, c: Color, lift: number)
    local x0, y0, x1, y1 = kit.bbox(P)
    r:drawPath(kit.poly(kit.offset(P, 3 + 6 * lift, 8 + 12 * lift)), kit.soft(kit.alpha(kit.INK, 0.15 + 0.06 * lift), 8 + 10 * lift))
    local shape = kit.poly(P)
    local grad = Gradient.linear(Vector.xy(x0, y0), Vector.xy(x1, y1), {
        { position = 0, color = kit.mix(c, kit.SURFACE, 0.3) },
        { position = 0.55, color = c },
        { position = 1, color = kit.mix(c, kit.INK, 0.12) },
    })
    r:drawPath(shape, Paint.with({ gradient = grad }))
    r:save()
    r:clipPath(shape)
    local grain = kit.stroke(kit.alpha(kit.SURFACE, 0.13), 2)
    local hgt = y1 - y0
    for i = 0, 13 do
        local x = x0 - hgt + (x1 - x0 + hgt) * i / 13
        r:drawPath(kit.line(x, y1, x + hgt * 0.8, y0), grain)
    end
    r:drawPath(shape, kit.stroke(kit.mix(c, kit.INK, 0.2), 8))
    r:restore()
    r:drawPath(shape, kit.stroke(OUT, 3))
end

-- a patang: tissue paper on its corner, a bamboo spine, a bow bent across it, a little tail.
-- (x, y) is its middle; style 0 one colour · 1 two halves · 2 a cap of the second colour
local function kite(r: Renderer, x: number, y: number, s: number, rot: number, c: Color, c2: Color, style: number)
    r:save()
    r:transform(Mat2D.withTranslation(x, y) * Mat2D.withRotation(rot) * Mat2D.withScale(s, s))
    local W, H = 24, 25
    local top, right, bot, left = Vector.xy(0, -H), Vector.xy(W, 0), Vector.xy(0, H), Vector.xy(-W, 0)
    local tail = { Vector.xy(0, H - 4), Vector.xy(9, H + 12), Vector.xy(-9, H + 12) }
    r:drawPath(kit.poly(tail), kit.fill(c2))
    r:drawPath(kit.poly(tail), kit.stroke(OUT, 2.4))
    local body = { top, right, bot, left }
    r:drawPath(kit.poly(body), kit.fill(c))
    if style == 1 then
        r:drawPath(kit.poly({ top, bot, left }), kit.fill(c2))
    elseif style == 2 then
        r:drawPath(kit.poly({ top, Vector.xy(W * 0.42, -H * 0.58), Vector.xy(-W * 0.42, -H * 0.58) }), kit.fill(c2))
    end
    r:drawPath(kit.poly(body), kit.stroke(OUT, 2.6))
    local stick = kit.stroke(BAMBOO_DK, 1.8)
    r:drawPath(kit.line(0, -H, 0, H), stick)
    local bow = Path.new()
    bow:moveTo(Vector.xy(-W, 0))
    bow:cubicTo(Vector.xy(-W * 0.45, -H * 0.62), Vector.xy(W * 0.45, -H * 0.62), Vector.xy(W, 0))
    r:drawPath(bow, stick)
    r:restore()
end

-- The rooftop ---------------------------------------------------------------------------------

type House = { x: number, w: number, top: number, wall: Color, tank: boolean, balcony: boolean, room: boolean }

-- the nearer houses of the pol across the lane; the work board hides the middle of the view
local HOUSES: { House } = {
    { x = 34, w = 96, top = 408, wall = Color.rgb(246, 232, 200), tank = true, balcony = true, room = false },
    { x = 128, w = 80, top = 438, wall = Color.rgb(238, 204, 178), tank = false, balcony = false, room = true },
    { x = 206, w = 104, top = 398, wall = Color.rgb(212, 228, 216), tank = false, balcony = true, room = false },
    { x = 306, w = 80, top = 428, wall = Color.rgb(224, 212, 236), tank = true, balcony = false, room = false },
    { x = 884, w = 96, top = 420, wall = Color.rgb(238, 214, 184), tank = true, balcony = false, room = false },
    { x = 978, w = 88, top = 392, wall = Color.rgb(208, 224, 236), tank = false, balcony = true, room = false },
    { x = 1064, w = 100, top = 434, wall = Color.rgb(240, 206, 182), tank = false, balcony = false, room = true },
    { x = 1162, w = 90, top = 404, wall = Color.rgb(246, 232, 200), tank = true, balcony = true, room = false },
}

-- the far skyline: x, top pairs
local FAR = { 40, 382, 96, 364, 150, 390, 196, 356, 248, 378, 300, 366, 360, 380, 880, 372, 940, 352, 1004, 384, 1060, 360, 1130, 376, 1196, 358, 1240, 358 }

type Flyer = { x: number, y: number, s: number, c: number, c2: number, ph: number }

-- kites already up over the old city, days before the festival
local FLYERS: { Flyer } = {
    { x = 84, y = 300, s = 0.42, c = 1, c2 = 6, ph = 0 },
    { x = 176, y = 248, s = 0.5, c = 3, c2 = 5, ph = 1.7 },
    { x = 958, y = 296, s = 0.44, c = 2, c2 = 8, ph = 3.1 },
    { x = 1070, y = 250, s = 0.52, c = 5, c2 = 4, ph = 4.4 },
    { x = 1196, y = 306, s = 0.38, c = 6, c2 = 1, ph = 2.3 },
}

local function house(r: Renderer, h: House)
    local x, w, top = h.x, h.w, h.top
    local edge = kit.stroke(kit.alpha(OUT, 0.45), 2)
    if h.room then
        -- the little room over the stairs
        r:drawPath(kit.rect(x + 12, top - 24, 32, 26), kit.fill(kit.mix(h.wall, OUT, 0.08)))
        r:drawPath(kit.rect(x + 12, top - 24, 32, 26), edge)
        r:drawPath(kit.rect(x + 21, top - 16, 13, 18), kit.fill(kit.alpha(OUT, 0.35)))
    end
    if h.tank then
        -- a black water tank on the roof
        local tx = x + w - 38
        r:drawPath(kit.rrect(tx, top - 30, 25, 31, 5), kit.fill(TANK))
        r:drawPath(kit.rrect(tx, top - 30, 25, 31, 5), kit.stroke(kit.alpha(OUT, 0.6), 2))
        for k = 1, 2 do
            r:drawPath(kit.line(tx + 3, top - 30 + k * 10, tx + 22, top - 30 + k * 10), kit.stroke(Color.rgb(84, 90, 98), 1.6))
        end
        r:drawPath(kit.rrect(tx + 7, top - 35, 11, 6, 2), kit.fill(TANK))
    end
    r:drawPath(kit.rect(x, top, w, 520 - top), kit.fill(h.wall))
    r:drawPath(kit.rect(x, top, w, 520 - top), edge)
    r:drawPath(kit.rect(x - 3, top - 6, w + 6, 8), kit.fill(kit.mix(h.wall, OUT, 0.12)))
    r:drawPath(kit.rect(x - 3, top - 6, w + 6, 8), edge)
    -- windows with arched tops
    local cols = math.max(1, math.floor((w - 16) / 28))
    local gap = (w - cols * 14) / (cols + 1)
    for row = 0, 2 do
        local wy = top + 18 + row * 34
        if wy + 18 < 506 then
            for c = 0, cols - 1 do
                local wx = x + gap + c * (14 + gap)
                r:drawPath(kit.rrect(wx, wy, 14, 18, 6), kit.fill(kit.alpha(Color.rgb(72, 60, 70), 0.42)))
            end
        end
    end
    if h.balcony then
        -- a carved wooden balcony
        local yb = top + 44
        r:drawPath(kit.rect(x + 6, yb, w - 12, 13), kit.fill(Color.rgb(158, 100, 62)))
        r:drawPath(kit.rect(x + 6, yb, w - 12, 13), edge)
        for k = 0, math.floor((w - 16) / 8) do
            r:drawPath(kit.line(x + 10 + k * 8, yb + 3, x + 10 + k * 8, yb + 10), kit.stroke(Color.rgb(118, 70, 40), 1.6))
        end
    end
end

-- a chabutro: the tall bird-feeder in the middle of a pol, with pigeons
local function chabutro(r: Renderer, x: number, t: number)
    local top = 312
    local col = Color.rgb(236, 222, 200)
    local edge = kit.stroke(kit.alpha(OUT, 0.55), 2)
    r:drawPath(kit.rect(x - 5, top + 22, 10, 470 - top - 22), kit.fill(col))
    r:drawPath(kit.rect(x - 5, top + 22, 10, 470 - top - 22), edge)
    r:drawPath(kit.rect(x - 24, top + 14, 48, 9), kit.fill(kit.mix(col, OUT, 0.1)))
    r:drawPath(kit.rect(x - 24, top + 14, 48, 9), edge)
    r:drawPath(kit.rect(x - 17, top - 6, 34, 20), kit.fill(col))
    r:drawPath(kit.rect(x - 17, top - 6, 34, 20), edge)
    for k = -1, 1 do
        r:drawPath(kit.rrect(x + k * 11 - 3, top - 1, 6, 11, 3), kit.fill(kit.alpha(OUT, 0.4)))
    end
    local dome = Path.new()
    dome:moveTo(Vector.xy(x - 22, top - 5))
    dome:cubicTo(Vector.xy(x - 22, top - 22), Vector.xy(x - 8, top - 30), Vector.xy(x, top - 33))
    dome:cubicTo(Vector.xy(x + 8, top - 30), Vector.xy(x + 22, top - 22), Vector.xy(x + 22, top - 5))
    dome:close()
    r:drawPath(dome, kit.fill(Color.rgb(222, 150, 110)))
    r:drawPath(dome, edge)
    r:drawPath(kit.line(x, top - 33, x, top - 42), kit.stroke(kit.alpha(OUT, 0.6), 2))
    -- pigeons circling it
    for i = 0, 2 do
        local a = t * 0.8 + i * 2.1
        local px, py = x + math.cos(a) * 46, top - 24 + math.sin(a) * 14
        local flap = 0.5 + 0.5 * math.sin(t * 9 + i)
        local w, up = 8, 3 + 4 * flap
        local p = Path.new()
        p:moveTo(Vector.xy(px - w, py - up))
        p:lineTo(Vector.xy(px, py))
        p:lineTo(Vector.xy(px + w, py - up))
        r:drawPath(p, kit.stroke(kit.alpha(Color.rgb(90, 96, 110), 0.7), 2))
    end
end

local function stringY(x: number): number
    local u = (x - 640) / 600
    return 162 + 20 * (1 - u * u)
end

-- a string of finished kites hung across the roof
local function bunting(r: Renderer, t: number)
    local p = Path.new()
    for i = 0, 24 do
        local x = kit.BX + kit.BW * i / 24
        if i == 0 then
            p:moveTo(Vector.xy(x, stringY(x)))
        else
            p:lineTo(Vector.xy(x, stringY(x)))
        end
    end
    r:drawPath(p, kit.stroke(kit.alpha(OUT, 0.7), 2))
    for i = 0, 10 do
        local x = 92 + i * 110
        local y = stringY(x)
        local c = KITE[(i % #KITE) + 1]
        local c2 = KITE[((i * 3 + 2) % #KITE) + 1]
        r:save()
        r:transform(Mat2D.withTranslation(x, y) * Mat2D.withRotation(math.sin(t * 1.3 + i * 1.7) * 0.06))
        kite(r, 0, 17, 0.6, 0, c, c2, i % 3)
        r:drawPath(kit.rrect(-2.5, -6, 5, 12, 2), kit.fill(BAMBOO_DK))
        r:drawPath(kit.rrect(-2.5, -6, 5, 12, 2), kit.stroke(OUT, 1.4))
        r:restore()
    end
end

-- paper held down by a stone, a spool of string, a bundle of bamboo against the parapet
local function props(r: Renderer)
    local x, y = 924, 612
    r:drawPath(kit.ellipse(x + 66, y + 2, 76, 7), kit.soft(kit.alpha(kit.INK, 0.2), 6))
    local order = { 2, 6, 1, 3, 5, 4, 8 }
    for i, ci in order do
        local yy = y - i * 5
        local dx = ((i * 5) % 9) - 4
        r:drawPath(kit.rect(x + dx, yy, 128, 5), kit.fill(KITE[ci]))
        r:drawPath(kit.rect(x + dx, yy, 128, 5), kit.stroke(OUT, 1.4))
    end
    r:drawPath(kit.ellipse(x + 70, y - 42, 18, 9), kit.fill(Color.rgb(150, 144, 136)))
    r:drawPath(kit.ellipse(x + 70, y - 42, 18, 9), kit.stroke(OUT, 2))
    r:drawPath(kit.ellipse(x + 65, y - 45, 7, 3), kit.fill(kit.alpha(kit.SURFACE, 0.35)))
    -- the spool (firki), wound with pink string
    local fx, fy = 1086, 594
    r:drawPath(kit.ellipse(fx + 22, fy + 18, 34, 5), kit.soft(kit.alpha(kit.INK, 0.2), 5))
    r:drawPath(kit.rect(fx, fy - 4, 44, 20), kit.fill(KITE[1]))
    for k = 0, 4 do
        r:drawPath(kit.line(fx + 4 + k * 9, fy - 3, fx + 8 + k * 9, fy + 15), kit.stroke(kit.mix(KITE[1], kit.INK, 0.2), 1.6))
    end
    r:drawPath(kit.rect(fx, fy - 4, 44, 20), kit.stroke(OUT, 2))
    for k = 0, 1 do
        local ex = fx + k * 44
        r:drawPath(kit.ellipse(ex, fy + 6, 5, 17), kit.fill(BAMBOO))
        r:drawPath(kit.ellipse(ex, fy + 6, 5, 17), kit.stroke(OUT, 2))
    end
    -- bamboo sticks for the spines and bows
    for i = 0, 5 do
        local x0, x1 = 1170 + i * 5, 1198 + i * 4
        r:drawPath(kit.line(x0, 612, x1, 434), kit.stroke(OUT, 6))
        r:drawPath(kit.line(x0, 612, x1, 434), kit.stroke(BAMBOO, 3.2))
    end
    for _, yy in { 560, 486 } do
        local k = (612 - yy) / 178
        r:drawPath(kit.line(1166 + k * 28, yy, 1200 + k * 24, yy + 2), kit.stroke(PIN, 3))
    end
end

local function scene(g: G, r: Renderer)
    local t = g.t
    local bx, by, bw, bh = kit.BX, kit.BY, kit.BW, kit.BH
    -- a clear January morning, hazy over the city
    local sky = Gradient.linear(Vector.xy(0, by), Vector.xy(0, 500), {
        { position = 0, color = Color.rgb(170, 210, 236) },
        { position = 1, color = Color.rgb(252, 238, 214) },
    })
    r:drawPath(kit.rect(bx, by, bw, 520 - by), Paint.with({ gradient = sky }))
    r:drawPath(kit.circle(1150, 252, 84), kit.soft(kit.alpha(Color.rgb(255, 226, 160), 0.5), 40))
    r:drawPath(kit.circle(1150, 252, 24), kit.fill(Color.rgb(255, 238, 196)))
    for _, k in FLYERS do
        local dx, dy = math.sin(t * 0.7 + k.ph) * 6, math.cos(t * 0.9 + k.ph) * 4
        local kx, ky = k.x + dx, k.y + dy
        local sp = Path.new()
        sp:moveTo(Vector.xy(kx, ky + 8 * k.s))
        sp:cubicTo(Vector.xy(kx - 10, ky + 70), Vector.xy(kx - 50, ky + 130), Vector.xy(kx - 70, 470))
        r:drawPath(sp, kit.stroke(kit.alpha(OUT, 0.3), 1.2))
        kite(r, kx, ky, k.s, math.sin(t * 1.1 + k.ph) * 0.14, KITE[k.c], KITE[k.c2], k.c % 3)
    end
    -- the old city across the lane: a far skyline, a chabutro, the nearer houses
    for i = 1, #FAR - 2, 2 do
        local x0, top, x1 = FAR[i], FAR[i + 1], FAR[i + 2]
        r:drawPath(kit.rect(x0, top, x1 - x0, 520 - top), kit.fill(Color.rgb(214, 222, 228)))
    end
    chabutro(r, 268, t)
    for _, h in HOUSES do
        house(r, h)
    end
    -- haze, so the city sits far behind
    r:drawPath(kit.rect(bx, 300, bw, 220), kit.fill(kit.alpha(Color.rgb(250, 240, 224), 0.32)))
    -- our own roof: the parapet, then the floor
    r:drawPath(kit.rect(bx, 504, bw, 40), kit.fill(PLASTER))
    for i = 0, 11 do
        local px = bx + 50 + i * 100
        r:drawPath(kit.rrect(px, 516, 26, 16, 5), kit.fill(kit.alpha(OUT, 0.1)))
    end
    r:drawPath(kit.rect(bx - 4, 496, bw + 8, 10), kit.fill(COPING))
    r:drawPath(kit.rect(bx - 4, 496, bw + 8, 10), kit.stroke(kit.alpha(OUT, 0.6), 2))
    r:drawPath(kit.rect(bx, 544, bw, by + bh - 544), kit.fill(FLOOR))
    r:drawPath(kit.line(bx, 544, bx + bw, 544), kit.stroke(kit.alpha(OUT, 0.45), 2))
    local tile = kit.stroke(kit.alpha(FLOOR_LINE, 0.7), 1.6)
    for _, yy in { 566, 596, 630 } do
        r:drawPath(kit.line(bx, yy, bx + bw, yy), tile)
    end
    for i = 0, 15 do
        local x = bx + 30 + i * 80
        r:drawPath(kit.line(x, 544, x - 6, 566), tile)
        r:drawPath(kit.line(x + 40, 566, x + 32, 596), tile)
        r:drawPath(kit.line(x + 4, 596, x - 6, 630), tile)
    end
    bunting(r, t)
    props(r)
end

-- Nani's work board: a big wooden board the paper is cut on
local function workBoard(r: Renderer)
    local x, y, w, h = WBX, WBY, WBW, WBH
    r:drawPath(kit.ellipse(x + w / 2 + 10, y + h + 2, w / 2 + 10, 10), kit.soft(kit.alpha(kit.INK, 0.22), 10))
    r:drawPath(kit.rrect(x + 6, y + 10, w, h, 14), kit.soft(kit.alpha(kit.INK, 0.16), 14))
    local shape = kit.rrect(x, y, w, h, 14)
    r:drawPath(shape, kit.fill(WOOD))
    r:save()
    r:clipPath(shape)
    local grain = kit.stroke(kit.alpha(WOOD_GRAIN, 0.85), 2)
    for i = 0, 9 do
        local yy = y + 20 + i * 37 + (i % 3) * 5
        local p = Path.new()
        p:moveTo(Vector.xy(x - 4, yy))
        p:cubicTo(Vector.xy(x + w * 0.3, yy - 7), Vector.xy(x + w * 0.62, yy + 8), Vector.xy(x + w + 4, yy - 3))
        r:drawPath(p, grain)
    end
    r:drawPath(kit.ellipse(x + w - 70, y + 52, 13, 6), kit.stroke(kit.alpha(WOOD_GRAIN, 0.9), 2))
    r:drawPath(kit.ellipse(x + w - 70, y + 52, 6, 2.5), kit.fill(kit.alpha(WOOD_GRAIN, 0.9)))
    r:restore()
    r:drawPath(shape, kit.stroke(OUT, 3))
end

-- a white pill with a coloured edge, popping in with k
local function pill(r: Renderer, f: Fonts, s: string, x: number, y: number, k: number, c: Color)
    if k <= 0.01 then
        return
    end
    local w = kit.width(f, s, f.body, 16) + 28
    local sc = kit.back(k)
    r:save()
    r:transform(Mat2D.withTranslation(x, y) * Mat2D.withScale(sc, sc))
    r:modulateOpacity(kit.clamp(k * 2, 0, 1))
    r:drawPath(kit.rrect(-w / 2 + 2, -13, w, 30, 15), kit.soft(kit.alpha(kit.INK, 0.14), 6))
    r:drawPath(kit.rrect(-w / 2, -15, w, 30, 15), kit.fill(kit.SURFACE))
    r:drawPath(kit.rrect(-w / 2, -15, w, 30, 15), kit.stroke(c, 2))
    kit.label(r, f, s, f.body, 16, c, 0, 0, 0.5)
    r:restore()
end

-- State --------------------------------------------------------------------------------------------

type St = {
    lastTick: number,
    greetAt: number,
    followed: boolean,
    tip1: string,
    tip2: string,
    tipAt: number,
    tipFor: number,
    fizaMood: string,
    fizaUntil: number,
    naniMood: string,
    naniUntil: number,
    pl: Plumb,
    held: number,
    dragging: boolean,
    grabDX: number,
    -- step 1
    picked: string,
    wrong: string,
    wrongAt: number,
    misses: number,
    slants: number,
    hoverLine: string,
    kb: number,
    -- step 2
    ext: number,
    extTarget: number,
    moved: boolean,
    dropped: boolean,
    droppedAt: number,
    shorts: number,
    -- step 3
    apex: number,
    apexTarget: number,
    ghosts: { number },
    ghostT: number,
    ghostFade: number,
    touched: boolean,
    outDone: boolean,
    -- step 4
    kp: Keypad,
    solvedAt: number,
    others: number, -- wrong answers that show no particular mix-up
}

local S: St = {
    lastTick = -99, greetAt = -99, followed = false,
    tip1 = '', tip2 = '', tipAt = -99, tipFor = 0,
    fizaMood = 'idle', fizaUntil = -1, naniMood = 'idle', naniUntil = -1,
    pl = plumb(0), held = 0, dragging = false, grabDX = 0,
    picked = '', wrong = '', wrongAt = -99, misses = 0, slants = 0, hoverLine = '', kb = 0,
    ext = B2, extTarget = B2, moved = false, dropped = false, droppedAt = -1, shorts = 0,
    apex = 2, apexTarget = 2, ghosts = {}, ghostT = 0, ghostFade = 1, touched = false, outDone = false,
    kp = kit.keypad(900, 172), solvedAt = -1, others = 0,
}

local nani = people.new(people.CAST.nani, NANI_X)
local fiza = people.new(people.CAST.fiza, FIZA_X)
local thumbFiza = people.new(people.CAST.fiza, 0)
local thumbT = -1

-- Nani says something short in her bubble
local function tip(g: G, a: string, b: string, dur: number)
    S.tip1, S.tip2, S.tipAt, S.tipFor = a, b, g.t, dur
end

local function fizaFeels(g: G, mood: string, dur: number)
    S.fizaMood, S.fizaUntil = mood, g.t + dur
end

local function naniFeels(g: G, mood: string, dur: number)
    S.naniMood, S.naniUntil = mood, g.t + dur
end

-- step 1: the four lines you can tap
local KB = { 'left', 'drop', 'right', 'base' }

local function segs1(): { [string]: { Vector } }
    local A, B, C, F = at(O1X, U1, 0, 4), at(O1X, U1, 7, 4), at(O1X, U1, 2.5, 0), at(O1X, U1, 2.5, 4)
    return { left = { A, C }, right = { B, C }, base = { A, B }, drop = { C, F } }
end

local function segDist(p: Vector, a: Vector, b: Vector): number
    local dx, dy = b.x - a.x, b.y - a.y
    local len2 = dx * dx + dy * dy
    local t = if len2 > 0 then kit.clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1) else 0
    return kit.dist(p, Vector.xy(a.x + dx * t, a.y + dy * t))
end

local function lineAt(p: Vector): string
    local best, bestD = '', 20
    for k, ab in segs1() do
        local d = segDist(p, ab[1], ab[2])
        if d < bestD then
            best, bestD = k, d
        end
    end
    return best
end

-- Protocol ------------------------------------------------------------------------------------------

L.id = 'heights'
L.tag = 'HIDDEN HEIGHTS'
L.title = 'Hidden heights'
L.blurb = 'When the height falls outside.'
L.steps = {
    { title = 'The height inside', line = 'l8s1', task = 'Tap the height of the triangle' },
    { title = 'The leaning triangle', line = 'l8s2', task = 'Stretch the base line under the thread' },
    { title = 'Same base, same height', line = 'l8s3', task = 'Slide the top until the height falls outside' },
    { title = 'Your turn', line = 'l8s4', task = 'Work out the paper on the keypad' },
}

L.lines = {
    l8s1 = 'Fiza and her Nani make kites on their rooftop in old Ahmedabad. This year, Fiza is designing her own kite for Uttarayan.',
    l8s1b = "Her kite is built from paper triangles, and she needs each one's height. Which line is the height of this one? Tap it.",
    l8s1slant = 'That edge leans over. A height never leans: it drops straight down from the top corner.',
    l8s1slant2 = "Not that one either. Look for the line that falls straight down, the way Nani's thread would.",
    l8s1base = "That's the base, the side the triangle sits on. The height stands up from it at a square corner.",
    l8s1done = "Yes! Nani's thread falls right along it and meets the base at a square corner. This time, the height is inside.",
    l8s2 = "For a sharper kite, Fiza leans this triangle right over. Now Nani's thread has nowhere to land.",
    l8s2b = 'Drag the gold handle to stretch the base line out, until it runs under the thread.',
    l8s2short = 'Not far enough yet. The line has to pass right under the weight.',
    l8s2short2 = 'Keep going, all the way under the thread.',
    l8s2land = "There's the height: straight down to the stretched line, at a square corner. It sits outside the triangle.",
    l8s3 = 'Fiza can put the top corner anywhere along this dotted line. Drag it, and keep an eye on how much paper it needs.',
    l8s3done = 'The slanted sides keep changing, but the paper never does. Same base, same height, same area, even with the height outside.',
    l8s4 = "Fiza's last triangle leans a long way. How many square centimetres of paper will Nani cut for it?",
    l8n24 = "That's base times height: two triangles' worth. Fiza needs just one, so take half.",
    l8nslant = 'That used a slanted edge. Use the height instead: the dashed thread, straight down from the top.',
    l8nperim = "That's the distance all the way round the edge. Nani cuts the paper inside it.",
    l8nx = "Half of the base, multiplied by the height. You won't need the slanted edges for this one.",
    l8nx2 = 'Multiply the base by the straight-down height, then halve it.',
    l8s4done = '12 square centimetres, spot on! Even with the height outside the triangle, half of base times height still works.',
}

function L.enter(g: G, step: number)
    local fresh = g.t - S.lastTick > 0.3 -- opened from outside the lesson, not a step change
    S.lastTick = g.t
    S.followed = false
    S.tip1, S.tip2, S.tipAt, S.tipFor = '', '', -99, 0
    S.fizaUntil, S.naniUntil = -1, -1
    S.held, S.dragging, S.grabDX = 0, false, 0
    S.picked, S.wrong, S.wrongAt, S.misses, S.slants, S.hoverLine, S.kb = '', '', -99, 0, 0, '', 0
    S.ext, S.extTarget, S.moved, S.dropped, S.droppedAt, S.shorts = B2, B2, false, false, -1, 0
    S.apex, S.apexTarget, S.ghosts, S.ghostT, S.ghostFade, S.touched, S.outDone = 2, 2, {}, 0, 1, false, false
    S.kp = kit.keypad(900, 172)
    S.solvedAt, S.others = -1, 0
    if step == 1 then
        S.pl = plumb(0)
    elseif step == 2 then
        S.pl = plumb(44)
    elseif step == 3 then
        S.pl = plumb(4 * U3)
    else
        S.pl = plumb(4 * U4)
    end
    nani.y, fiza.y = FEET, FEET
    people.hush(nani)
    people.hush(fiza)
    if fresh then
        if step == 1 then
            -- Fiza comes up the stairs first, Nani behind her; one hello, then work
            fiza.x, nani.x = -70, -170
            S.greetAt = g.t + 1.45
        else
            fiza.x, nani.x = FIZA_X, NANI_X
        end
    elseif S.greetAt > g.t then
        S.greetAt = -99 -- moved on before she said hello: no hello later
    end
    fiza.tx, nani.tx = FIZA_X, NANI_X
end

-- what Fiza and Nani do and say, from what is happening on the board
local function feel(g: G)
    local fm, nm = 'idle', 'idle'
    local look = Vector.xy(600, 400)
    if g.step == 1 then
        look = at(O1X, U1, 2.5, 2)
        fm = 'watch'
    elseif g.step == 2 then
        if S.dragging then
            look = at(O2X, U2, S.ext, 4)
            fm, nm = 'watch', 'watch'
        elseif S.dropped then
            look = at(O2X, U2, C2, 3)
            fm = 'watch'
        else
            look = at(O2X, U2, C2, 1)
            fm = 'think'
        end
    elseif g.step == 3 then
        look = at(O3X, U3, S.apex, 0)
        fm = 'watch'
        if S.dragging then
            nm = 'watch'
        end
    else
        look = Vector.xy(1040, 330)
        fm = if S.solvedAt >= 0 then 'idle' else 'think'
    end
    if g.t < S.fizaUntil then
        fm = S.fizaMood
    end
    if g.t < S.naniUntil then
        nm = S.naniMood
    end
    local ga = g.t - S.greetAt
    local greeting = g.step == 1 and ga >= 0 and ga < 2.4
    if greeting then
        people.speak(fiza, 'Kem cho!')
        fm = 'wave'
    else
        people.hush(fiza)
    end
    if not greeting and g.t - S.tipAt < S.tipFor then
        people.speak(nani, S.tip1, S.tip2)
        if g.t >= S.naniUntil then
            nm = 'point'
        end
    else
        people.hush(nani)
    end
    fiza.mood, nani.mood = fm, nm
    fiza.lookX, fiza.lookY = look.x, look.y
    nani.lookX, nani.lookY = look.x, look.y
    if greeting then
        -- she says hello to you
        fiza.lookX, fiza.lookY = fiza.x, fiza.y - 125 * fiza.s
    end
end

local function advance1(g: G, dt: number)
    if not S.followed and S.picked == '' and S.misses == 0 and g.age > 0.4 and not g.talking() then
        S.followed = true
        g.say('l8s1b')
    end
    if S.picked == '' and S.misses == 0 and g.age > 12 and S.tipAt < -50 then
        tip(g, 'Straight down from', 'the top, like my thread.', 4.5)
    end
    if S.picked == 'drop' then
        local pl = S.pl
        if swing(pl, dt, 0, if pl.settledAt >= 0 then 7 else 2.6) then
            pl.landedAt = g.t
            pl.om += 0.55
            g.sfx('thud')
        end
        if pl.landedAt >= 0 and pl.settledAt < 0 and g.t - pl.landedAt > 1.5 then
            pl.settledAt = g.t
            g.sfx('sparkle')
            tip(g, "That's how I check", 'every kite I make.', 4)
        end
        if pl.settledAt >= 0 then
            pl.th = kit.follow(pl.th, 0, 8, dt)
        end
    end
end

local function advance2(g: G, dt: number)
    if not S.followed and not S.moved and not S.dropped and g.age > 0.4 and not g.talking() then
        S.followed = true
        g.say('l8s2b')
    end
    if not S.moved and not S.dropped and not S.dragging and g.age > 2.2 and S.tipAt < -50 then
        tip(g, 'My thread needs', 'a line to land on.', 6)
    end
    S.ext = kit.follow(S.ext, S.extTarget, 20, dt)
    local pl = S.pl
    -- a little rooftop breeze until it drops
    local breeze = if S.dropped then 0 else 240 * math.sin(g.t * 1.4)
    local damp = if pl.settledAt >= 0 then 7 elseif S.dropped then 1.9 else 1.4
    if swing(pl, dt, breeze, damp) then
        pl.landedAt = g.t
        pl.om += 0.8
        g.sfx('thud')
        g.shake(2)
    end
    if pl.landedAt >= 0 and pl.settledAt < 0 and g.t - pl.landedAt > 2.1 then
        pl.settledAt = g.t
        g.done()
        g.sfx('snap')
        g.sfx('sparkle')
        g.say('l8s2land')
        fizaFeels(g, 'cheer', 2.2)
        tip(g, 'The base is the same.', 'Only its line grew.', 4.5)
    end
    if pl.settledAt >= 0 then
        pl.th = kit.follow(pl.th, 0, 8, dt)
    end
end

local function advance3(g: G, dt: number)
    S.apex = kit.follow(S.apex, S.apexTarget, 16, dt)
    local c = at(O3X, U3, S.apex, 0)
    swing(S.pl, dt, push(S.pl, c.x, dt), 3)
    S.ghostFade = kit.follow(S.ghostFade, if S.dragging then 1 else 0.3, if S.dragging then 12 else 1.5, dt)
    S.ghostT += dt
    if S.dragging and S.ghostT > 0.12 then
        S.ghostT = 0
        table.insert(S.ghosts, S.apex)
        if #S.ghosts > 7 then
            table.remove(S.ghosts, 1)
        end
    end
end

function L.advance(g: G, dt: number)
    S.lastTick = g.t
    S.held = kit.follow(S.held, if S.dragging then 1 else 0, 18, dt)
    if g.step == 1 then
        advance1(g, dt)
    elseif g.step == 2 then
        advance2(g, dt)
    elseif g.step == 3 then
        advance3(g, dt)
    else
        kit.keypadAdvance(S.kp, dt)
        if S.solvedAt < 0 and g.age > 1.6 and S.tipAt < -50 then
            tip(g, 'Work it out,', "and I'll cut it.", 3.6)
        end
    end
    feel(g)
    people.advance(nani, dt, g.t)
    people.advance(fiza, dt, g.t)
end

-- Drawing -------------------------------------------------------------------------------------------

local function drawStep1(g: G, r: Renderer)
    local f = g.fonts
    local sg = segs1()
    local A, B, C = sg.base[1], sg.base[2], sg.drop[1]
    local F = sg.drop[2]
    tissue(r, { A, B, C }, PAPER[1], 0)
    if S.picked == '' then
        -- what the pointer is over, what was just tapped wrongly, and the keyboard's choice
        for k, ab in sg do
            local c: Color? = nil
            local w = 9
            if S.wrong == k and g.t - S.wrongAt < 0.9 then
                c, w = kit.RED, 8
            elseif S.kb > 0 and KB[S.kb] == k then
                c, w = kit.alpha(kit.BLUE, 0.45), 12 -- the keyboard's choice
            elseif S.hoverLine == k then
                c = kit.alpha(kit.INK, 0.22)
            end
            if c ~= nil then
                r:drawPath(kit.line(ab[1].x, ab[1].y, ab[2].x, ab[2].y), kit.stroke(c, w))
            end
        end
        if S.misses > 0 and g.t - S.wrongAt > 2.5 then
            -- after a miss, the height glows gently
            local k = 0.3 + 0.3 * math.sin(g.t * 5)
            r:drawPath(kit.line(C.x, C.y, F.x, F.y), kit.stroke(kit.alpha(kit.ACCENT, 0.15 + k), 11))
        end
        r:drawPath(kit.dashed(C.x, C.y, F.x, F.y, 9, 7), kit.stroke(kit.INK, 3))
        kit.label(r, f, 'Tap a line', f.body, 16, kit.INK_SOFT, (A.x + B.x) / 2, A.y + 44, 0.5)
    else
        -- the chosen height, and Nani's thread falling along it
        local pl = S.pl
        r:drawPath(kit.line(C.x, C.y, F.x, F.y), kit.stroke(kit.alpha(kit.ACCENT, 0.45), 9))
        r:drawPath(kit.dashed(C.x, C.y, F.x, F.y, 9, 7), kit.stroke(kit.INK, 3))
        plumbDraw(r, pl, C.x, C.y)
        if pl.landedAt >= 0 then
            local k = kit.back(kit.clamp((g.t - pl.landedAt - 0.3) * 2.5, 0, 1))
            if k > 0 then
                r:drawPath(kit.corner(F, 1, 0, 0, -1, 22 * k), kit.stroke(kit.ACCENT, 3))
            end
            kit.halo(r, f, 'height', f.body, 18, kit.INK, F.x + 16, C.y + 1.9 * U1, 0)
        end
    end
end

local function drawStep2(g: G, r: Renderer)
    local f = g.fonts
    local A, B, C, F = at(O2X, U2, 0, 4), at(O2X, U2, B2, 4), at(O2X, U2, C2, 0), at(O2X, U2, C2, 4)
    local E = at(O2X, U2, S.ext, 4)
    local pl = S.pl
    local settled = pl.settledAt >= 0
    if not S.dropped then
        -- where the thread would land, and the gold spot the line has to reach
        local ready = S.ext >= C2 + 0.2
        local pulse = 0.5 + 0.5 * math.sin(g.t * 4)
        r:drawPath(kit.dashed(F.x, C.y + pl.len + 10, F.x, F.y - 14, 3, 8), kit.stroke(kit.alpha(kit.INK, 0.3), 2))
        r:drawPath(kit.circle(F.x, F.y, 11 + pulse * 3), kit.stroke(kit.alpha(kit.GOLD, if ready then 1 else 0.5 + 0.45 * pulse), 3))
        r:drawPath(kit.circle(F.x, F.y, 4), kit.fill(kit.GOLD))
    end
    -- the base line, stretched past the end of the base
    if S.ext > B2 + 0.02 then
        r:drawPath(kit.dashed(B.x, B.y, E.x, E.y, 11, 8), kit.stroke(kit.INK, 3))
    end
    tissue(r, { A, B, C }, PAPER[2], 0)
    if settled then
        local k = kit.clamp((g.t - pl.settledAt) * 2.5, 0, 1)
        r:drawPath(kit.dashed(C.x, C.y, F.x, F.y - BOB, 9, 7), kit.stroke(kit.alpha(kit.INK, k), 3))
    end
    plumbDraw(r, pl, C.x, C.y)
    if settled then
        local k = kit.clamp((g.t - pl.settledAt) * 2.5, 0, 1)
        r:drawPath(kit.corner(F, -1, 0, 0, -1, 22 * kit.back(k)), kit.stroke(kit.ACCENT, 3))
        r:save()
        r:modulateOpacity(k)
        kit.halo(r, f, 'height', f.body, 18, kit.INK, F.x + 16, C.y + 2 * U2, 0)
        kit.halo(r, f, 'base', f.body, 18, kit.INK, (A.x + B.x) / 2, A.y + 34, 0.5)
        kit.label(r, f, 'its line, stretched', f.body, 15, kit.INK_SOFT, (B.x + F.x) / 2, A.y + 34, 0.5)
        r:restore()
    end
    -- the handle, until the thread drops
    local fade = if S.dropped then 1 - kit.clamp((g.t - S.droppedAt) / 0.3, 0, 1) else 1
    if fade > 0 then
        r:save()
        r:modulateOpacity(fade)
        kit.knob(r, g.t, E.x, E.y, 'slide', S.held, not S.dragging and not S.moved)
        r:restore()
    end
    -- a ghost finger shows the stretch if nothing has happened for a while
    if not S.moved and not S.dragging and not S.dropped and g.age > 7 then
        local k = ((g.age - 7) % 2.6) / 2.6
        local a = if k < 0.12 then k / 0.12 elseif k > 0.8 then math.max(0, (0.95 - k) / 0.15) else 1
        local x = kit.lerp(B.x, F.x + 0.5 * U2, kit.smooth((k - 0.15) / 0.55))
        kit.finger(r, x, B.y + 4, a, k > 0.12 and k < 0.75)
    end
end

local function readout(g: G, r: Renderer, a: number)
    local f = g.fonts
    local x, y, w, h = 920, 250, 296, 198
    r:drawPath(kit.rrect(x + 3, y + 8, w, h, 22), kit.soft(kit.alpha(kit.INK, 0.16), 16))
    r:drawPath(kit.rrect(x, y, w, h, 22), kit.fill(kit.SURFACE))
    r:drawPath(kit.rrect(x, y, w, h, 22), kit.stroke(kit.LINE, 1.5))
    kit.label(r, f, 'PAPER IN THE TRIANGLE', f.mono, 12, kit.INK_SOFT, x + 22, y + 28, 0)
    if S.held > 0.02 then
        -- while the top moves, the area lights up: watch it not change
        r:drawPath(kit.rrect(x + 10, y + 44, w - 20, 50, 14), kit.fill(kit.alpha(kit.ACCENT_WASH, S.held)))
    end
    kit.label(r, f, '½ × 5 × 4 = 10', f.display, 32, kit.ACCENT_DEEP, x + 22, y + 70, 0)
    kit.label(r, f, 'square centimetres', f.body, 15, kit.INK_SOFT, x + 22, y + 102, 0)
    r:drawPath(kit.line(x + 22, y + 124, x + w - 22, y + 124), kit.stroke(kit.LINE, 1.5))
    local la = math.sqrt(a * a + 16)
    local lb = math.sqrt((B3 - a) ^ 2 + 16)
    kit.label(r, f, 'left side    ' .. string.format('%.1f cm', la), f.mono, 15, kit.ORANGE, x + 22, y + 148, 0)
    kit.label(r, f, 'right side   ' .. string.format('%.1f cm', lb), f.mono, 15, kit.ORANGE, x + 22, y + 174, 0)
end

local function drawStep3(g: G, r: Renderer)
    local f = g.fonts
    local a = S.apex
    local pl = S.pl
    local A, B = at(O3X, U3, 0, 4), at(O3X, U3, B3, 4)
    local C, F = at(O3X, U3, a, 0), at(O3X, U3, a, 4)
    -- the line the top slides along, parallel to the base
    local t0, t1 = at(O3X, U3, A3_MIN - 0.35, 0), at(O3X, U3, A3_MAX + 0.35, 0)
    r:drawPath(kit.dashed(t0.x, t0.y, t1.x, t1.y, 10, 9, g.t * 18), kit.stroke(kit.alpha(kit.GOLD, 0.85), 3))
    -- the base line, stretched when the height falls outside
    if F.x < A.x - 2 or F.x > B.x + 2 then
        local x0, x1 = math.min(A.x, F.x), math.max(B.x, F.x)
        r:drawPath(kit.dashed(x0 - 10, A.y, x1 + 10, A.y, 9, 8), kit.stroke(kit.INK_SOFT, 2.5))
    end
    -- faint ghosts of where the top has been
    for i, gx in S.ghosts do
        local ga = 0.07 * i * S.ghostFade
        r:drawPath(kit.poly({ A, B, at(O3X, U3, gx, 0) }), kit.stroke(kit.alpha(kit.mix(PAPER[3], kit.INK, 0.2), ga), 2.5))
    end
    tissue(r, { A, B, C }, PAPER[3], S.held * 0.4)
    -- the height: Nani's thread, dashed once it hangs still
    local still = 1 - kit.clamp(math.abs(pl.th) * 14 + math.abs(pl.om) * 0.8, 0, 1)
    if still > 0.02 then
        r:drawPath(kit.dashed(C.x, C.y, F.x, F.y - BOB, 9, 7), kit.stroke(kit.alpha(kit.INK, still), 3))
        local side = if a > B3 then -1 else 1
        r:drawPath(kit.corner(F, side, 0, 0, -1, 14), kit.stroke(kit.alpha(kit.ACCENT, still), 2.6))
    end
    plumbDraw(r, pl, C.x, C.y)
    -- labels sit on the side of the thread nearer the middle of the base, so they stay on the board
    local toRight = a < B3 / 2
    kit.halo(r, f, 'height 4 cm', f.body, 17, kit.INK, F.x + (if toRight then 16 else -16), C.y + 2.1 * U3, if toRight then 0 else 1)
    kit.halo(r, f, 'base 5 cm', f.body, 17, kit.INK, (A.x + B.x) / 2, A.y + 32, 0.5)
    local outside = a < -0.05 or a > B3 + 0.05
    local px = kit.clamp(F.x, WBX + 100, WBX + WBW - 100)
    pill(r, f, if outside then 'outside the paper' else 'inside the paper', px, A.y + 72, 1, if outside then kit.ACCENT_DEEP else kit.INK_SOFT)
    kit.knob(r, g.t, C.x, C.y, 'slide', S.held, not S.dragging and not S.touched)
    if not S.touched and not S.dragging and g.age > 6 then
        local k = ((g.age - 6) % 2.8) / 2.8
        local fa = if k < 0.12 then k / 0.12 elseif k > 0.8 then math.max(0, (0.95 - k) / 0.15) else 1
        local x = kit.lerp(C.x, C.x + 3.4 * U3, kit.smooth((k - 0.15) / 0.55))
        kit.finger(r, x, C.y + 4, fa, k > 0.12 and k < 0.75)
    end
    readout(g, r, a)
end

local function drawStep4(g: G, r: Renderer)
    local f = g.fonts
    local A, B, C, F = at(O4X, U4, 0, 4), at(O4X, U4, 6, 4), at(O4X, U4, 9, 0), at(O4X, U4, 9, 4)
    local solved = S.solvedAt >= 0
    local k = if solved then kit.clamp((g.t - S.solvedAt) * 1.5, 0, 1) else 0
    r:drawPath(kit.dashed(B.x, B.y, F.x + 18, F.y, 11, 8), kit.stroke(kit.INK, 2.5))
    tissue(r, { A, B, C }, PAPER[4], 0)
    if solved then
        local glow = Paint.with({ style = 'stroke', thickness = 9, color = kit.alpha(kit.ACCENT, 0.6 * k), cap = 'round' })
        r:drawPath(kit.line(A.x, A.y, B.x, B.y), glow)
        r:drawPath(kit.line(C.x, C.y, F.x, F.y), glow)
    end
    r:drawPath(kit.dashed(C.x, C.y, F.x, F.y - BOB, 9, 7), kit.stroke(kit.INK, 3))
    plumbDraw(r, S.pl, C.x, C.y)
    r:drawPath(kit.corner(F, -1, 0, 0, -1, 15), kit.stroke(kit.INK, 2.5))
    if k < 1 then
        -- the rule card rises over this one
        r:save()
        r:modulateOpacity(1 - k)
        kit.halo(r, f, '6 cm', f.body, 19, kit.INK, (A.x + B.x) / 2, A.y + 34, 0.5)
        r:restore()
    end
    kit.halo(r, f, '4 cm', f.body, 19, kit.INK, F.x + 16, C.y + 2 * U4, 0)
    -- the long slanted side is √97 (about 9.8 cm): not labelled, since only whole, true lengths go on the board
    kit.halo(r, f, '5 cm', f.body, 19, kit.ORANGE, 728, 396, 0.5)
    kit.keypadDraw(r, f, S.kp, 'Paper in square centimetres', 'sq cm', g.t)
    if solved then
        kit.rule(r, f, 'area = ½ × base × height', '½ × 6 × 4 = 12 square centimetres', k, 616, 530)
    end
end

function L.draw(g: G, r: Renderer)
    scene(g, r)
    workBoard(r)
    if g.step == 1 then
        drawStep1(g, r)
    elseif g.step == 2 then
        drawStep2(g, r)
    elseif g.step == 3 then
        drawStep3(g, r)
    else
        drawStep4(g, r)
    end
    people.draw(r, g.fonts, nani, g.t)
    people.draw(r, g.fonts, fiza, g.t)
end

-- Input ---------------------------------------------------------------------------------------------

local function pick1(g: G, k: string)
    S.followed = true
    if k == 'drop' then
        S.picked = 'drop'
        S.pl = plumb(0)
        S.pl.target = 4 * U1
        S.pl.falling = true
        g.sfx('snap')
        g.sfx('chime')
        g.report('l8s1', true, 'height')
        g.done()
        g.say('l8s1done')
        fizaFeels(g, 'cheer', 2.2)
        naniFeels(g, 'watch', 1.6)
        S.tipFor = 0
        return
    end
    S.wrong, S.wrongAt = k, g.t
    S.misses += 1
    g.sfx('oops')
    g.shake(4)
    fizaFeels(g, 'puzzled', 1.6)
    if k == 'base' then
        g.report('l8s1', false, 'base')
        g.say('l8s1base')
    else
        S.slants += 1
        g.report('l8s1', false, if k == 'left' then 'left side' else 'right side', 'slant')
        g.say(if S.slants == 1 then 'l8s1slant' else 'l8s1slant2')
    end
    tip(g, 'Straight down from', 'the top, like my thread.', 4.5)
end

-- step 2: let go of the handle
local function release2(g: G, fromPointer: boolean)
    if S.dropped then
        return
    end
    if S.extTarget >= C2 + 0.2 then
        S.dropped = true
        S.droppedAt = g.t
        S.pl.target = 4 * U2
        S.pl.falling = true
        S.pl.vlen = 0
        g.sfx('whoosh')
        tip(g, 'Now it can land.', '', 1.8)
        naniFeels(g, 'watch', 2.6)
    elseif fromPointer and S.moved then
        g.sfx('drop')
        S.shorts += 1
        g.say(if S.shorts == 1 then 'l8s2short' else 'l8s2short2')
        fizaFeels(g, 'puzzled', 1.4)
    else
        g.sfx('drop')
    end
end

-- step 3: has the height gone outside?
local function check3(g: G)
    if S.outDone then
        return
    end
    if S.apexTarget < -0.5 or S.apexTarget > B3 + 0.5 then
        S.outDone = true
        g.done()
        g.sfx('sparkle')
        g.say('l8s3done')
        fizaFeels(g, 'cheer', 2)
        tip(g, 'Same base, same height:', 'same paper.', 4.5)
    end
end

local function check4(g: G)
    local raw = S.kp.value
    local v = tonumber(raw) or -1
    if v == 12 then
        S.kp.okT = 3
        S.solvedAt = g.t
        g.report('l8s4', true, raw)
        g.done()
        g.burst(1040, 300, 40)
        g.say('l8s4done')
        fizaFeels(g, 'cheer', 3)
        naniFeels(g, 'wave', 2.4)
        tip(g, 'Just right.', 'Cutting it now!', 4)
        return
    end
    local mix: string? = nil
    S.others += 1
    local line, a, b = if S.others % 2 == 1 then 'l8nx' else 'l8nx2', 'Half of base', 'times height.'
    if v == 24 then
        mix, line, a, b = 'half', 'l8n24', 'Two of these make', 'a parallelogram.'
    elseif v == 15 or v == 27 or v == 30 or v == 54 then
        mix, line, a, b = 'slant', 'l8nslant', 'Use my thread,', 'not the edges.'
    elseif v == 20 then
        mix, line, a, b = 'perim', 'l8nperim', 'The paper inside,', 'not round the edge.'
    end
    g.report('l8s4', false, raw, mix)
    g.sfx('oops')
    kit.keypadWrong(S.kp, 'Not quite. Have another go.')
    g.say(line)
    fizaFeels(g, 'puzzled', 1.5)
    tip(g, a, b, 4.5)
end

function L.down(g: G, p: Vector): boolean
    if g.step == 1 and S.picked == '' then
        local k = lineAt(p)
        if k ~= '' then
            pick1(g, k)
            return true
        end
    elseif g.step == 2 and not S.dropped then
        local E = at(O2X, U2, S.ext, 4)
        if kit.dist(p, E) < 44 then
            S.dragging = true
            S.grabDX = p.x - E.x
            S.tipFor = 0
            g.sfx('pickup')
            return true
        end
    elseif g.step == 3 then
        local C = at(O3X, U3, S.apex, 0)
        if kit.dist(p, C) < 46 then
            S.dragging = true
            S.touched = true
            S.grabDX = p.x - C.x
            g.sfx('pickup')
            return true
        end
    elseif g.step == 4 and S.solvedAt < 0 then
        local res = kit.keypadDown(S.kp, p)
        if res == 'ok' then
            check4(g)
        elseif res == 'key' then
            g.sfx('tick3')
        end
        return res ~= ''
    end
    return false
end

function L.move(g: G, p: Vector)
    if g.step == 1 then
        S.hoverLine = if S.picked == '' then lineAt(p) else ''
    elseif g.step == 2 and S.dragging then
        local e = kit.clamp((p.x - S.grabDX - O2X) / U2, B2, EXT_MAX)
        if math.floor(e) ~= math.floor(S.extTarget) then
            g.tick(math.floor(e))
        end
        S.extTarget = e
        if e > B2 + 0.3 then
            S.moved = true
        end
    elseif g.step == 3 and S.dragging then
        local a = kit.clamp((p.x - S.grabDX - O3X) / U3, A3_MIN, A3_MAX)
        if math.floor(a) ~= math.floor(S.apexTarget) then
            g.tick(math.floor(a) + 3)
        end
        S.apexTarget = a
    end
end

function L.up(g: G, p: Vector)
    if g.step == 2 and S.dragging then
        S.dragging = false
        release2(g, true)
    elseif g.step == 3 and S.dragging then
        S.dragging = false
        g.sfx('drop')
        check3(g)
    end
end

-- Keys: step 1 ↑ ↓ choose a line, Space or Enter taps it · step 2 → ← stretch the base line, Space all the way ·
-- step 3 → ← slide the top · step 4 digits, Backspace, Enter. Once a step is done, → and ← change step again.
function L.key(g: G, k: number): boolean
    local enter = k == 32 or k == 257 or k == 335
    if g.step == 1 and S.picked == '' then
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
                pick1(g, KB[S.kb])
            end
            return true
        end
    elseif g.step == 2 and S.pl.settledAt < 0 then
        if S.dropped then
            -- the thread is still falling and swinging
            return k == 262 or k == 263 or enter
        end
        if k == 262 or k == 263 then
            local e = if k == 262 then math.floor(S.extTarget + 1e-6) + 1 else math.ceil(S.extTarget - 1e-6) - 1
            S.extTarget = kit.clamp(e, B2, EXT_MAX)
            S.moved = S.extTarget > B2
            S.tipFor = 0
            g.tick(math.floor(S.extTarget))
            release2(g, false)
            return true
        elseif enter then
            S.extTarget = C2 + 0.9
            S.moved = true
            release2(g, false)
            return true
        end
    elseif g.step == 3 and not S.outDone then
        if k == 262 or k == 263 then
            S.touched = true
            table.insert(S.ghosts, S.apex)
            if #S.ghosts > 7 then
                table.remove(S.ghosts, 1)
            end
            S.apexTarget = kit.clamp(math.floor(S.apexTarget + 0.5) + (if k == 262 then 1 else -1), A3_MIN, A3_MAX)
            g.tick(math.floor(S.apexTarget) + 3)
            check3(g)
            return true
        end
    elseif g.step == 4 and S.solvedAt < 0 then
        local res = kit.keypadKey(S.kp, k)
        if res == 'ok' then
            check4(g)
            return true
        elseif res == 'key' then
            g.sfx('tick3')
        end
        return res ~= ''
    end
    return false
end

-- the home card: Fiza on the roof, flying a kite
function L.thumb(g: G, r: Renderer, x: number, y: number, w: number, h: number)
    local t = g.t
    local dt = if thumbT < 0 then 1 / 60 else kit.clamp(t - thumbT, 0, 0.1)
    thumbT = t
    local sky = Gradient.linear(Vector.xy(0, y), Vector.xy(0, y + h), {
        { position = 0, color = Color.rgb(170, 210, 236) },
        { position = 1, color = Color.rgb(252, 238, 214) },
    })
    r:drawPath(kit.rect(x, y, w, h), Paint.with({ gradient = sky }))
    kite(r, x + 120 + math.sin(t * 0.8) * 3, y + 22, 0.3, math.sin(t * 1.2) * 0.15, KITE[3], KITE[5], 2)
    kite(r, x + 150 + math.sin(t * 0.7 + 2) * 3, y + 46, 0.24, math.sin(t * 1.1 + 1) * 0.15, KITE[2], KITE[6], 0)
    local tops = { 62, 52, 70, 58, 48, 66, 56 }
    for i, tp in tops do
        local hx = x - 6 + (i - 1) * 38
        local wall = HOUSES[((i - 1) % #HOUSES) + 1].wall
        r:drawPath(kit.rect(hx, y + tp, 40, h - tp), kit.fill(wall))
        r:drawPath(kit.rect(hx, y + tp, 40, h - tp), kit.stroke(kit.alpha(OUT, 0.35), 1.2))
        r:drawPath(kit.rrect(hx + 13, y + tp + 9, 7, 10, 3), kit.fill(kit.alpha(Color.rgb(72, 60, 70), 0.35)))
    end
    r:drawPath(kit.rect(x, y + h - 26, w, 9), kit.fill(COPING))
    r:drawPath(kit.rect(x, y + h - 17, w, 17), kit.fill(FLOOR))
    r:drawPath(kit.line(x, y + h - 17, x + w, y + h - 17), kit.stroke(kit.alpha(OUT, 0.4), 1.2))
    thumbFiza.x, thumbFiza.y, thumbFiza.s = x + 72, y + h - 7, 0.36
    thumbFiza.mood = 'idle'
    thumbFiza.lookX, thumbFiza.lookY = x + w - 50, y + 10
    people.advance(thumbFiza, dt, t)
    -- her right arm up, holding the string
    thumbFiza.armR, thumbFiza.bendR, thumbFiza.mouth = 2.3, 0.3, 1
    local hx, hy = thumbFiza.x + 50 * thumbFiza.s, thumbFiza.y - 117 * thumbFiza.s
    local kx, ky = x + w - 58 + math.sin(t * 0.9) * 6, y + 34 + math.cos(t * 1.2) * 4
    local sp = Path.new()
    sp:moveTo(Vector.xy(hx, hy))
    sp:cubicTo(Vector.xy(hx + 50, hy - 4), Vector.xy(kx - 40, ky + 40), Vector.xy(kx, ky + 10))
    r:drawPath(sp, kit.stroke(kit.alpha(OUT, 0.6), 1.2))
    kite(r, kx, ky, 0.78, math.sin(t * 1.3) * 0.12, PAPER[1], KITE[7], 1)
    people.draw(r, g.fonts, thumbFiza, t)
end

return L
