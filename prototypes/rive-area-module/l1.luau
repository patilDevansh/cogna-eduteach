-- Lesson 1 · Area is counting squares
-- Day 3 · Kavin's kolam patch, part 1 (see prototypes/school-pilot-student-trail/CAST_AND_STORIES.md).
-- A street in Mylapore, Chennai, early on a Margazhi morning. Kavin Raj (13) and his grandmother Meenakshi Paati
-- draw a kolam on a grid of dots outside their door every day.
--   1. sweep across Paati's dot grid to sprinkle rice-flour squares: they fall, settle and tick; 24 cover it
--   2. tap each row to count it: 6, 12, 18, 24, and 4 rows of 6 becomes 6 × 4
--   3. drag the gold corner to shape a patch; find two different ones that take exactly 12 squares of flour
--
-- L.art is the Day 3 street and its kolam things (dot grid, flour squares, rope, cards). Lessons 2 and 3 draw
-- with it too, so the three lessons share one street.

local kit = require('kit')
local people = require('people')
type G = kit.G
type Fonts = kit.Fonts
type Person = people.Person

-- The street ------------------------------------------------------------------------------------------------

local Art = {}

local OUT = Color.rgb(74, 44, 18) -- the brown that people and houses are outlined in
local FLOUR = Color.rgb(253, 251, 244)
local WET = Color.rgb(84, 75, 70) -- a patch swept and sprinkled with water before the kolam
local WET_HI = Color.rgb(120, 108, 100)
local ROPE = Color.rgb(204, 150, 80)
local ROPE_DK = Color.rgb(118, 76, 32)
local STONE = Color.rgb(206, 198, 186)

Art.OUT = OUT
Art.FLOUR = FLOUR
Art.WET = WET
Art.ROPE = ROPE
Art.ROPE_DK = ROPE_DK
-- the coloured powders that fill a kolam in Margazhi
Art.POWDER = { Color.rgb(230, 92, 138), Color.rgb(240, 138, 46), Color.rgb(30, 160, 164), Color.rgb(132, 96, 204) }
Art.GROUND = 290 -- where the house fronts meet the street

local K = 0.5522847498

-- A quadratic curve from a through control c to b, written as a cubic.
local function quad(p: Path, a: Vector, c: Vector, b: Vector)
    p:cubicTo(Vector.xy(a.x + (c.x - a.x) * 2 / 3, a.y + (c.y - a.y) * 2 / 3), Vector.xy(b.x + (c.x - b.x) * 2 / 3, b.y + (c.y - b.y) * 2 / 3), b)
end

-- a circle added to a path (clockwise, like kit.circle), so many dots fill as one
local function addCircle(p: Path, cx: number, cy: number, rr: number)
    p:moveTo(Vector.xy(cx + rr, cy))
    p:cubicTo(Vector.xy(cx + rr, cy + rr * K), Vector.xy(cx + rr * K, cy + rr), Vector.xy(cx, cy + rr))
    p:cubicTo(Vector.xy(cx - rr * K, cy + rr), Vector.xy(cx - rr, cy + rr * K), Vector.xy(cx - rr, cy))
    p:cubicTo(Vector.xy(cx - rr, cy - rr * K), Vector.xy(cx - rr * K, cy - rr), Vector.xy(cx, cy - rr))
    p:cubicTo(Vector.xy(cx + rr * K, cy - rr), Vector.xy(cx + rr, cy - rr * K), Vector.xy(cx + rr, cy))
    p:close()
end

local function outlined(r: Renderer, path: Path, c: Color, w: number)
    r:drawPath(path, kit.fill(c))
    r:drawPath(path, kit.stroke(OUT, w))
end

-- k < 1 darkens, k > 1 lightens, keeping the hue
local function shade(c: Color, k: number): Color
    local function ch(v: number): number
        return if k <= 1 then v * k else v + (255 - v) * (k - 1)
    end
    return Color.rgb(math.floor(ch(Color.red(c) :: number)), math.floor(ch(Color.green(c) :: number)), math.floor(ch(Color.blue(c) :: number)))
end

-- a pale pink-gold dawn, a low sun and thin drifting cloud
local function sky(r: Renderer, ground: number, t: number)
    local bx, by, bw = kit.BX, kit.BY, kit.BW
    local g = Gradient.linear(Vector.xy(0, by), Vector.xy(0, ground), {
        { position = 0, color = Color.rgb(241, 203, 208) },
        { position = 0.55, color = Color.rgb(249, 221, 210) },
        { position = 1, color = Color.rgb(254, 237, 204) },
    })
    r:drawPath(kit.rect(bx, by, bw, ground - by + 2), Paint.with({ gradient = g }))
    local sx, sy = bx + bw * 0.66, ground - 100
    r:drawPath(kit.circle(sx, sy, 96), kit.soft(kit.alpha(Color.rgb(255, 228, 170), 0.6), 50))
    r:drawPath(kit.circle(sx, sy, 25), kit.fill(Color.rgb(255, 238, 196)))
    local span = bw + 320
    for i = 0, 2 do
        local cx = bx - 160 + ((i * 470 + t * (5 + i * 2)) % span)
        local cy = by + 20 + i * 15
        r:drawPath(kit.rrect(cx - 70 + i * 12, cy, 150 - i * 26, 8, 4), kit.fill(kit.alpha(kit.SURFACE, 0.5)))
        r:drawPath(kit.rrect(cx - 24, cy - 6, 84 - i * 10, 7, 3.5), kit.fill(kit.alpha(kit.SURFACE, 0.38)))
    end
end

-- A temple tower far off in the morning haze: tiers narrowing to a barrel roof with a row of finials.
local function gopuram(r: Renderer, cx: number, base: number, h: number)
    local c = Color.rgb(224, 176, 170)
    local ln = Color.rgb(208, 156, 152)
    local bwid, twid = h * 0.6, h * 0.3
    local bodyH = h * 0.82
    local top = base - bodyH
    r:drawPath(kit.poly({ Vector.xy(cx - bwid / 2, base), Vector.xy(cx + bwid / 2, base), Vector.xy(cx + twid / 2, top), Vector.xy(cx - twid / 2, top) }), kit.fill(c))
    local n = 6
    for i = 1, n do
        local y = base - bodyH * i / n
        local wy = kit.lerp(bwid, twid, i / n)
        r:drawPath(kit.rect(cx - wy / 2 - 3, y - 2, wy + 6, 4), kit.fill(ln))
        local nh = math.max(3, bodyH / n - 10)
        for k = -1, 1 do
            r:drawPath(kit.rrect(cx + k * wy * 0.26 - 2.5, y + 5, 5, nh, 2), kit.fill(ln))
        end
    end
    local rw, rh = twid * 1.2, h * 0.12
    r:drawPath(kit.rrect(cx - rw / 2, top - rh, rw, rh + 2, rh * 0.5), kit.fill(c))
    for k = -2, 2 do
        local fx = cx + k * rw * 0.19
        r:drawPath(kit.ellipse(fx, top - rh - 4, 3, 4.5), kit.fill(c))
        r:drawPath(kit.rect(fx - 0.8, top - rh - 12, 1.6, 8), kit.fill(c))
    end
end

-- one palm frond from the crown: a drooping leaf with a jagged edge (the leaflets) and a midrib
local function frond(r: Renderer, a: number, len: number, droop: number, col: Color)
    local tip = Vector.xy(math.cos(a) * len, math.sin(a) * len + droop)
    local ctl = Vector.xy(math.cos(a) * len * 0.55, math.sin(a) * len * 0.55 - len * 0.2)
    local N = 12
    local up: { Vector } = {}
    local dn: { Vector } = {}
    for i = 0, N do
        local s = i / N
        local mx = 2 * (1 - s) * s * ctl.x + s * s * tip.x
        local my = 2 * (1 - s) * s * ctl.y + s * s * tip.y
        local tx = 2 * (1 - s) * ctl.x + 2 * s * (tip.x - ctl.x)
        local ty = 2 * (1 - s) * ctl.y + 2 * s * (tip.y - ctl.y)
        local tl = math.max(0.001, math.sqrt(tx * tx + ty * ty))
        local nx, ny = -ty / tl, tx / tl
        local w = len * 0.16 * math.sin(math.pi * math.min(1, s * 1.1)) * (1 - s * 0.35)
        local jag = if i % 2 == 0 then 1 else 0.45
        table.insert(up, Vector.xy(mx + nx * w * jag, my + ny * w * jag))
        table.insert(dn, Vector.xy(mx - nx * w * jag, my - ny * w * jag))
    end
    local P: { Vector } = {}
    for _, q in up do
        table.insert(P, q)
    end
    for i = #dn, 1, -1 do
        table.insert(P, dn[i])
    end
    outlined(r, kit.poly(P), col, 2)
    local rib = Path.new()
    rib:moveTo(Vector.xy(0, 0))
    quad(rib, Vector.xy(0, 0), ctl, tip)
    r:drawPath(rib, kit.stroke(shade(col, 0.68), 1.6))
end

-- A coconut palm. (x, base) is where the trunk leaves the ground; lean bends it; the crown sways a little.
function Art.palm(r: Renderer, x: number, base: number, h: number, lean: number, t: number)
    local top = Vector.xy(x + lean, base - h)
    local ctl = Vector.xy(x + lean * 0.1, base - h * 0.55)
    local trunk = Path.new()
    trunk:moveTo(Vector.xy(x, base))
    quad(trunk, Vector.xy(x, base), ctl, top)
    r:drawPath(trunk, kit.stroke(OUT, 14))
    r:drawPath(trunk, kit.stroke(Color.rgb(160, 120, 80), 9.5))
    local rings = Path.new()
    for i = 1, 11 do
        local s = i / 12
        local px = (1 - s) * (1 - s) * x + 2 * (1 - s) * s * ctl.x + s * s * top.x
        local py = (1 - s) * (1 - s) * base + 2 * (1 - s) * s * ctl.y + s * s * top.y
        rings:moveTo(Vector.xy(px - 4.5, py))
        rings:lineTo(Vector.xy(px + 4.5, py - 1.5))
    end
    r:drawPath(rings, kit.stroke(Color.rgb(116, 82, 50), 1.6))
    r:save()
    r:transform(Mat2D.withTranslation(top.x, top.y) * Mat2D.withRotation(math.sin(t * 0.8 + x) * 0.035))
    local green, deep = Color.rgb(104, 158, 82), Color.rgb(78, 134, 66)
    for i = 0, 6 do
        local a = math.pi * (1.06 + i * 0.148)
        frond(r, a, 62 + (i % 2) * 10, 14 + math.abs(i - 3) * 9, if i % 2 == 0 then green else deep)
    end
    outlined(r, kit.circle(-7, 6, 6), Color.rgb(140, 150, 62), 1.8)
    outlined(r, kit.circle(6, 7, 6), Color.rgb(124, 138, 56), 1.8)
    outlined(r, kit.circle(0, 12, 6), Color.rgb(150, 112, 52), 1.8)
    r:restore()
end

-- The houses along the street: plinth, a door up two steps, barred windows, a tiled roof or a parapet.
type House = { x: number, w: number, h: number, wall: Color, roof: string, door: number, doorC: Color, win: { number }, kolam: number }

local HOUSES: { House } = {
    { x = 40, w = 196, h = 70, wall = Color.rgb(246, 224, 160), roof = 'flat', door = 0.62, doorC = Color.rgb(36, 120, 122), win = { 0.25 }, kolam = 2 },
    { x = 236, w = 224, h = 74, wall = Color.rgb(176, 212, 228), roof = 'tile', door = 0.3, doorC = Color.rgb(128, 76, 40), win = { 0.72 }, kolam = 3 },
    -- Kavin and Paati's house: the patch in lesson 1 is in front of this door
    { x = 460, w = 360, h = 78, wall = Color.rgb(242, 198, 190), roof = 'tile', door = 0.5, doorC = Color.rgb(118, 68, 34), win = { 0.2, 0.8 }, kolam = 1 },
    { x = 820, w = 206, h = 66, wall = Color.rgb(188, 224, 198), roof = 'flat', door = 0.36, doorC = Color.rgb(150, 54, 60), win = { 0.76 }, kolam = 2 },
    { x = 1026, w = 214, h = 72, wall = Color.rgb(250, 236, 214), roof = 'tile', door = 0.6, doorC = Color.rgb(46, 98, 150), win = { 0.22 }, kolam = 3 },
}

local function petal(p: Path, a: number, L: number, wdt: number)
    local cx, cy = math.cos(a), math.sin(a)
    local nx, ny = -cy, cx
    p:moveTo(Vector.xy(0, 0))
    p:cubicTo(Vector.xy(cx * L * 0.3 + nx * wdt, cy * L * 0.3 + ny * wdt), Vector.xy(cx * L * 0.85 + nx * wdt, cy * L * 0.85 + ny * wdt), Vector.xy(cx * L, cy * L))
    p:cubicTo(Vector.xy(cx * L * 0.85 - nx * wdt, cy * L * 0.85 - ny * wdt), Vector.xy(cx * L * 0.3 - nx * wdt, cy * L * 0.3 - ny * wdt), Vector.xy(0, 0))
end

-- A small finished kolam. kind 1 a lotus, 2 a star, 3 loops round a square of dots.
-- squash < 1 lays it on the ground, seen at a slant.
function Art.kolam(r: Renderer, cx: number, cy: number, s: number, squash: number, kind: number)
    r:save()
    r:transform(Mat2D.withTranslation(cx, cy) * Mat2D.withScale(1, squash))
    local lw = math.max(1.3, s * 0.06)
    local p = Path.new()
    local dots = Path.new()
    if kind == 1 then
        for i = 0, 3 do
            petal(p, i * math.pi / 2, s * 0.52, s * 0.16)
            petal(p, i * math.pi / 2 + math.pi / 4, s * 0.32, s * 0.09)
            addCircle(dots, math.cos(i * math.pi / 2 + math.pi / 4) * s * 0.5, math.sin(i * math.pi / 2 + math.pi / 4) * s * 0.5, lw * 0.9)
        end
        addCircle(p, 0, 0, s * 0.66)
    elseif kind == 2 then
        for i = 0, 7 do
            petal(p, i * math.pi / 4, s * 0.6, s * 0.12)
        end
        addCircle(p, 0, 0, s * 0.18)
        for i = 0, 7 do
            local a = i * math.pi / 4 + math.pi / 8
            addCircle(dots, math.cos(a) * s * 0.46, math.sin(a) * s * 0.46, lw * 0.85)
        end
    else
        local d = s * 0.3
        for i = -1, 1 do
            for j = -1, 1 do
                addCircle(dots, i * d, j * d, lw * 0.9)
            end
        end
        for i = -1, 1, 2 do
            for j = -1, 1, 2 do
                addCircle(p, i * d * 0.5, j * d * 0.5, d * 0.62)
            end
        end
        p:moveTo(Vector.xy(0, -s * 0.62))
        p:lineTo(Vector.xy(s * 0.62, 0))
        p:lineTo(Vector.xy(0, s * 0.62))
        p:lineTo(Vector.xy(-s * 0.62, 0))
        p:close()
    end
    r:drawPath(p, kit.stroke(FLOUR, lw))
    r:drawPath(dots, kit.fill(FLOUR))
    r:restore()
end

local function house(r: Renderer, hs: House, ground: number, kolamOn: boolean)
    local x, w, h = hs.x, hs.w, hs.h
    local top = ground - h
    local trim = Color.rgb(252, 248, 238)
    outlined(r, kit.rect(x, top, w, h), hs.wall, 2.4)
    if hs.roof == 'tile' then
        local P = { Vector.xy(x - 12, top + 3), Vector.xy(x + w + 12, top + 3), Vector.xy(x + w - 8, top - 24), Vector.xy(x + 8, top - 24) }
        outlined(r, kit.poly(P), Color.rgb(198, 100, 66), 2.4)
        local tp = Path.new()
        for k = 1, 2 do
            local y = top + 3 - k * 9
            local inset = 12 - (20 * k * 9 / 27)
            tp:moveTo(Vector.xy(x - inset, y))
            tp:lineTo(Vector.xy(x + w + inset, y))
        end
        local xx = x
        while xx < x + w do
            tp:moveTo(Vector.xy(xx, top + 2))
            tp:lineTo(Vector.xy(xx + 2, top - 22))
            xx += 15
        end
        r:drawPath(tp, kit.stroke(Color.rgb(160, 74, 46), 1.5))
    else
        outlined(r, kit.rect(x - 4, top - 14, w + 8, 16), shade(hs.wall, 1.15), 2.4)
        local xx = x + 10
        while xx < x + w - 20 do
            r:drawPath(kit.rrect(xx, top - 10, 12, 7, 2), kit.fill(shade(hs.wall, 0.8)))
            xx += 24
        end
    end
    -- the raised plinth
    outlined(r, kit.rect(x, ground - 12, w, 12), shade(hs.wall, 0.8), 2.4)
    for _, fx in hs.win do
        local wx, wy = x + w * fx - 15, top + math.max(10, h - 64)
        outlined(r, kit.rect(wx - 9, wy, 9, 30), hs.doorC, 2)
        outlined(r, kit.rect(wx + 30, wy, 9, 30), hs.doorC, 2)
        outlined(r, kit.rect(wx, wy, 30, 30), Color.rgb(74, 62, 58), 2.2)
        local bars = Path.new()
        for k = 1, 3 do
            bars:moveTo(Vector.xy(wx + k * 7.5, wy + 2))
            bars:lineTo(Vector.xy(wx + k * 7.5, wy + 28))
        end
        r:drawPath(bars, kit.stroke(trim, 1.8))
        outlined(r, kit.rect(wx - 4, wy + 30, 38, 5), trim, 1.8)
    end
    local dw, dh = 34, math.min(52, h - 22)
    local dx = x + w * hs.door - dw / 2
    outlined(r, kit.rect(dx - 6, ground - 12 - dh - 6, dw + 12, dh + 6), trim, 2.2)
    outlined(r, kit.rect(dx, ground - 12 - dh, dw, dh), hs.doorC, 2.2)
    local dp = Path.new()
    dp:moveTo(Vector.xy(dx + dw / 2, ground - 12 - dh))
    dp:lineTo(Vector.xy(dx + dw / 2, ground - 12))
    r:drawPath(dp, kit.stroke(shade(hs.doorC, 0.62), 1.8))
    r:drawPath(kit.rect(dx + 4, ground - 12 - dh + 6, dw / 2 - 8, 16), kit.stroke(shade(hs.doorC, 1.3), 1.4))
    r:drawPath(kit.rect(dx + dw / 2 + 4, ground - 12 - dh + 6, dw / 2 - 8, 16), kit.stroke(shade(hs.doorC, 1.3), 1.4))
    -- a string of mango leaves over the door
    local lv = Path.new()
    for k = 0, 4 do
        local lx = dx - 2 + k * (dw + 4) / 4
        lv:moveTo(Vector.xy(lx - 2, ground - 12 - dh - 5))
        lv:lineTo(Vector.xy(lx, ground - 12 - dh + 4))
        lv:lineTo(Vector.xy(lx + 2, ground - 12 - dh - 5))
        lv:close()
    end
    r:drawPath(lv, kit.fill(Color.rgb(82, 146, 70)))
    -- two steps down to the street
    outlined(r, kit.rect(dx - 10, ground - 12, dw + 20, 12), STONE, 2.2)
    outlined(r, kit.rect(dx - 16, ground - 1, dw + 32, 9), shade(STONE, 0.92), 2.2)
    if kolamOn then
        Art.kolam(r, dx + dw / 2, ground + 27, 36, 0.38, hs.kolam)
    end
end

export type StreetOpts = {
    ground: number,
    tower: number, -- x of the temple tower (off the board for none)
    palm: number, -- x of the coconut palm (off the board for none)
    bare: number, -- the house whose doorstep has no kolam yet (0 for none)
    corner: boolean, -- lesson 3: the street bends at the far end
}

-- the street itself: dusty, swept, with the shade of the houses along its edge
local function streetFloor(r: Renderer, ground: number)
    local bx, by, bw, bh = kit.BX, kit.BY, kit.BW, kit.BH
    local g = Gradient.linear(Vector.xy(0, ground), Vector.xy(0, by + bh), {
        { position = 0, color = Color.rgb(222, 210, 192) },
        { position = 1, color = Color.rgb(206, 193, 175) },
    })
    r:drawPath(kit.rect(bx, ground, bw, by + bh - ground), Paint.with({ gradient = g }))
    r:drawPath(kit.rect(bx, ground, bw, 10), kit.soft(kit.alpha(kit.INK, 0.12), 6))
    -- grit, here and there
    local grit = Path.new()
    for i = 0, 40 do
        local gx = bx + 20 + ((i * 263) % (bw - 40))
        local gy = ground + 40 + ((i * 151) % (by + bh - ground - 50))
        addCircle(grit, gx, gy, 1.2 + (i % 3) * 0.5)
    end
    r:drawPath(grit, kit.fill(kit.alpha(Color.rgb(150, 134, 116), 0.35)))
end

-- The corner where the street bends (lesson 3): from x = 820 the houses turn away, so the corner house shows its
-- front at a slant, lower as it goes, and the street runs on round the bend.
local CORNER_X = 820

local function corner(r: Renderer, ground: number)
    local x0, x1 = CORNER_X, kit.BX + kit.BW + 30
    local rise = 50
    local h0, h1 = 80, 64
    local span = x1 - x0
    local function at(fx: number, up: number): Vector
        local k = kit.lerp(h0, h1, fx) / h0
        return Vector.xy(kit.lerp(x0, x1, fx), kit.lerp(ground, ground - rise, fx) - up * k)
    end
    local function face(f0: number, f1: number, u0: number, u1: number): Path
        return kit.poly({ at(f0, u0), at(f1, u0), at(f1, u1), at(f0, u1) })
    end
    -- the street, running on round the bend
    r:drawPath(kit.poly({ Vector.xy(x0, ground), Vector.xy(x1, ground - rise), Vector.xy(x1, ground + 4), Vector.xy(x0, ground + 4) }), kit.fill(Color.rgb(222, 210, 192)))
    local wallC = Color.rgb(250, 230, 196)
    outlined(r, face(0, 1, 0, h0), wallC, 2.4)
    outlined(r, kit.poly({ at(-0.03, h0 - 3), at(1.02, h0 - 3), at(1.0, h0 + 26), at(0.0, h0 + 26) }), Color.rgb(198, 100, 66), 2.4)
    local tp = Path.new()
    local f = 0.02
    while f < 1 do
        local a, b = at(f, h0 - 2), at(f + 0.004, h0 + 24)
        tp:moveTo(a)
        tp:lineTo(b)
        f += 18 / span
    end
    for k = 1, 2 do
        tp:moveTo(at(-0.01, h0 - 3 + k * 9))
        tp:lineTo(at(1.01, h0 - 3 + k * 9))
    end
    r:drawPath(tp, kit.stroke(Color.rgb(160, 74, 46), 1.5))
    outlined(r, face(0, 1, 0, 12), shade(wallC, 0.8), 2.4)
    -- windows with bars, a door up two steps
    local trim = Color.rgb(252, 248, 238)
    for _, fw in { 0.1, 0.62, 0.84 } do
        local wf = 30 / span
        outlined(r, face(fw - 9 / span, fw, 22, 52), Color.rgb(36, 120, 122), 2)
        outlined(r, face(fw + wf, fw + wf + 9 / span, 22, 52), Color.rgb(36, 120, 122), 2)
        outlined(r, face(fw, fw + wf, 22, 52), Color.rgb(74, 62, 58), 2.2)
        local bars = Path.new()
        for k = 1, 3 do
            bars:moveTo(at(fw + wf * k / 4, 24))
            bars:lineTo(at(fw + wf * k / 4, 50))
        end
        r:drawPath(bars, kit.stroke(trim, 1.8))
    end
    local df, dw = 0.34, 34 / span
    outlined(r, face(df - 6 / span, df + dw + 6 / span, 12, 70), trim, 2.2)
    outlined(r, face(df, df + dw, 12, 64), Color.rgb(36, 120, 122), 2.2)
    outlined(r, face(df - 10 / span, df + dw + 10 / span, 0, 12), STONE, 2.2)
    outlined(r, kit.poly({ at(df - 16 / span, 1), at(df + dw + 16 / span, 1), at(df + dw + 16 / span, -9), at(df - 16 / span, -9) }), shade(STONE, 0.92), 2.2)
    -- the kerb turns with the street
    local kerb = Path.new()
    kerb:moveTo(Vector.xy(x0, ground + 1))
    kerb:lineTo(Vector.xy(x1, ground - rise + 1))
    r:drawPath(kerb, kit.stroke(kit.alpha(kit.INK, 0.16), 3))
    local kp = at(df + dw / 2, -28)
    Art.kolam(r, kp.x, kp.y, 34, 0.38, 1)
end

function Art.street(r: Renderer, t: number, o: StreetOpts)
    local ground = o.ground
    sky(r, ground, t)
    gopuram(r, o.tower, ground - 50, 76)
    streetFloor(r, ground)
    for i, hs in HOUSES do
        if not (o.corner and hs.x >= CORNER_X) then
            house(r, hs, ground, i ~= o.bare)
        end
    end
    if o.corner then
        corner(r, ground)
    end
    -- the palm stands at the edge of the street, in front of the houses
    if o.palm > kit.BX and o.palm < kit.BX + kit.BW then
        Art.palm(r, o.palm, ground + 30, 134, 18, t)
    end
end

-- The patch in front of a door, swept and sprinkled with water at dawn: darker than the street, with broom marks.
function Art.wet(r: Renderer, x: number, y: number, w: number, h: number)
    r:drawPath(kit.rrect(x - 8, y - 5, w + 16, h + 14, 22), kit.soft(kit.alpha(WET, 0.5), 12))
    r:drawPath(kit.rrect(x, y, w, h, 14), kit.fill(WET))
    local p = Path.new()
    local n = math.floor(h / 24)
    for i = 0, n do
        local yy = y + 12 + i * 24
        local x0 = x + 12 + (i * 37) % 44
        local x1 = math.min(x + w - 12, x0 + w * 0.6)
        p:moveTo(Vector.xy(x0, yy + 4))
        quad(p, Vector.xy(x0, yy + 4), Vector.xy((x0 + x1) / 2, yy - 5), Vector.xy(x1, yy + 3))
    end
    r:save()
    r:clipPath(kit.rrect(x, y, w, h, 14))
    r:drawPath(p, kit.stroke(kit.alpha(WET_HI, 0.6), 1.5))
    r:restore()
end

-- The pulli: rice-flour dots at every corner of a cols × rows grid of u-sized squares.
function Art.dots(r: Renderer, x: number, y: number, cols: number, rows: number, u: number, a: number)
    local p = Path.new()
    local rad = math.max(2, u * 0.055)
    for i = 0, cols do
        for j = 0, rows do
            addCircle(p, x + i * u, y + j * u, rad)
        end
    end
    r:drawPath(p, kit.fill(kit.alpha(FLOUR, a)))
end

-- One square of rice flour on the cell at (x, y), u wide. drop 0..1 is how far it has fallen in (it bounces as it
-- lands); tint is a coloured powder in it, or nil; glow 0..1 rims it in green.
function Art.flour(r: Renderer, x: number, y: number, u: number, drop: number, tint: Color?, glow: number)
    local k = kit.bounce(drop)
    local lift = (1 - k) * u * 0.6
    local sc = 1 + (1 - kit.clamp(drop * 1.4, 0, 1)) * 0.22
    local m = math.max(3, u * 0.1)
    local w = (u - 2 * m) * sc
    local cx, cy = x + u / 2, y + u / 2 - lift
    local rad = math.max(2, u * 0.1)
    if drop < 1 then
        r:drawPath(kit.rrect(x + u / 2 - w / 2 + 2, y + u / 2 - w / 2 + 3, w, w, rad), kit.soft(kit.alpha(kit.INK, 0.3 * k), 5))
    end
    r:drawPath(kit.rrect(cx - w / 2 - 2, cy - w / 2 - 2, w + 4, w + 4, rad + 1), kit.soft(kit.alpha(FLOUR, 0.45), 3))
    r:drawPath(kit.rrect(cx - w / 2, cy - w / 2, w, w, rad), kit.fill(FLOUR))
    if tint ~= nil then
        local i = w * 0.18
        r:drawPath(kit.rrect(cx - w / 2 + i, cy - w / 2 + i, w - 2 * i, w - 2 * i, rad * 0.7), kit.fill(tint))
    end
    if glow > 0 then
        r:drawPath(kit.rrect(cx - w / 2, cy - w / 2, w, w, rad), kit.stroke(kit.alpha(kit.ACCENT, glow), 2.5))
    end
    if u > 30 then
        local hsh = math.abs(math.sin(x * 0.137 + y * 0.291)) -- grains in a different place on every square
        local gp = Path.new()
        addCircle(gp, cx - w * (0.2 + 0.2 * hsh), cy - w * 0.56, 1.3)
        addCircle(gp, cx + w * 0.57, cy + w * (0.3 * hsh - 0.1), 1.1)
        addCircle(gp, cx + w * (0.1 + 0.25 * hsh), cy + w * 0.58, 1.2)
        r:drawPath(gp, kit.fill(kit.alpha(FLOUR, 0.75)))
    end
end

-- a puff of flour where a square has just landed (age in seconds since it landed)
function Art.puff(r: Renderer, cx: number, cy: number, u: number, age: number)
    if age <= 0 or age > 0.45 then
        return
    end
    local k = age / 0.45
    local p = Path.new()
    for i = 0, 7 do
        local a = i * math.pi / 4 + 0.3
        local d = u * (0.42 + 0.35 * kit.ease(k))
        addCircle(p, cx + math.cos(a) * d, cy + math.sin(a) * d * 0.8, 2.6 * (1 - k) + 0.6)
    end
    r:drawPath(p, kit.fill(kit.alpha(FLOUR, 0.8 * (1 - k))))
end

-- A rope along the closed outline P, laid frac of the way round: a twisted cord with a shadow.
function Art.rope(r: Renderer, P: { Vector }, frac: number)
    if frac <= 0 or #P < 2 then
        return
    end
    local path = if frac >= 1 then kit.poly(P) else kit.partialOutline(P, frac)
    r:save()
    r:transform(Mat2D.withTranslation(1.5, 3))
    r:drawPath(path, Paint.with({ style = 'stroke', thickness = 7, color = kit.alpha(kit.INK, 0.22), cap = 'round', join = 'round', feather = 3 }))
    r:restore()
    r:drawPath(path, kit.stroke(ROPE_DK, 7.5))
    r:drawPath(path, kit.stroke(ROPE, 4.6))
    local total = 0
    for i = 1, #P do
        total += kit.dist(P[i], P[(i % #P) + 1])
    end
    local want = total * kit.clamp(frac, 0, 1)
    local tw = Path.new()
    local used = 0
    for i = 1, #P do
        local a, b = P[i], P[(i % #P) + 1]
        local l = kit.dist(a, b)
        if l > 0.5 then
            local ux, uy = (b.x - a.x) / l, (b.y - a.y) / l
            local nx, ny = -uy, ux
            local s = 3.5
            while s < l - 1 and used + s <= want do
                local px, py = a.x + ux * s, a.y + uy * s
                tw:moveTo(Vector.xy(px - ux * 2.2 + nx * 2.4, py - uy * 2.2 + ny * 2.4))
                tw:lineTo(Vector.xy(px + ux * 2.2 - nx * 2.4, py + uy * 2.2 - ny * 2.4))
                s += 6.5
            end
            used += l
            if used >= want then
                break
            end
        end
    end
    r:drawPath(tw, kit.stroke(ROPE_DK, 1.3))
end

-- a small knot on the rope, one at every metre
function Art.knot(r: Renderer, x: number, y: number, k: number)
    if k <= 0 then
        return
    end
    local s = kit.back(k)
    r:drawPath(kit.circle(x + 1, y + 2, 5.5 * s), kit.soft(kit.alpha(kit.INK, 0.25), 3))
    r:drawPath(kit.circle(x, y, 5.5 * s), kit.fill(ROPE_DK))
    r:drawPath(kit.circle(x - 1, y - 1, 2.4 * s), kit.fill(ROPE))
end

-- A score card: a small title over a big number. pop 0..1 makes it jump.
function Art.counter(r: Renderer, f: Fonts, title: string, value: string, pop: number, x: number, y: number, w: number)
    local h = 80
    local sc = 1 + 0.12 * math.sin(kit.clamp(pop, 0, 1) * math.pi)
    r:save()
    r:transform(Mat2D.withTranslation(x + w / 2, y + h / 2) * Mat2D.withScale(sc, sc) * Mat2D.withTranslation(-w / 2, -h / 2))
    r:drawPath(kit.rrect(3, 7, w, h, 18), kit.soft(kit.alpha(kit.INK, 0.18), 12))
    r:drawPath(kit.rrect(0, 0, w, h, 18), kit.fill(kit.SURFACE))
    r:drawPath(kit.rrect(0, 0, w, h, 18), kit.stroke(kit.LINE, 1.5))
    kit.label(r, f, title, f.mono, 12, kit.INK_SOFT, w / 2, 21, 0.5)
    kit.label(r, f, value, f.display, 30, kit.INK, w / 2, 53, 0.5)
    r:restore()
end

-- A white card behind things that must stay readable over the street.
function Art.card(r: Renderer, x: number, y: number, w: number, h: number, edge: Color)
    r:drawPath(kit.rrect(x + 3, y + 8, w, h, 20), kit.soft(kit.alpha(kit.INK, 0.16), 14))
    r:drawPath(kit.rrect(x, y, w, h, 20), kit.fill(kit.SURFACE))
    r:drawPath(kit.rrect(x, y, w, h, 20), kit.stroke(edge, 1.5))
end

-- A pill-shaped label that pops in (k 0..1), edged in its own colour (gold is kept for what moves).
function Art.pill(r: Renderer, f: Fonts, s: string, x: number, y: number, k: number, edge: Color, ink: Color)
    if k <= 0.01 then
        return
    end
    local w = kit.width(f, s, f.body, 19) + 32
    local sc = kit.back(k)
    r:save()
    r:transform(Mat2D.withTranslation(x, y) * Mat2D.withScale(sc, sc))
    r:modulateOpacity(kit.clamp(k * 2, 0, 1))
    r:drawPath(kit.rrect(-w / 2 + 2, -16, w, 36, 18), kit.soft(kit.alpha(kit.INK, 0.16), 6))
    r:drawPath(kit.rrect(-w / 2, -18, w, 36, 18), kit.fill(kit.SURFACE))
    r:drawPath(kit.rrect(-w / 2, -18, w, 36, 18), kit.stroke(edge, 2.5))
    kit.label(r, f, s, f.body, 19, ink, 0, 0, 0.5)
    r:restore()
end

-- A rule card that rises in: the rule, and a note under it.
function Art.rule(r: Renderer, f: Fonts, rule: string, note: string, k: number, cx: number, y: number, size: number)
    if k <= 0 then
        return
    end
    local e = kit.back(k)
    local w = math.max(kit.width(f, rule, f.display, size), kit.width(f, note, f.body, 16)) + 48
    local h = size + 54
    r:save()
    r:modulateOpacity(kit.clamp(k * 2, 0, 1))
    r:transform(Mat2D.withTranslation(0, (1 - e) * 20))
    r:drawPath(kit.rrect(cx - w / 2 + 3, y + 8, w, h, 18), kit.soft(kit.alpha(kit.INK, 0.16), 14))
    r:drawPath(kit.rrect(cx - w / 2, y, w, h, 18), kit.fill(kit.ACCENT_WASH))
    r:drawPath(kit.rrect(cx - w / 2, y, w, h, 18), kit.stroke(kit.alpha(kit.ACCENT, 0.45), 2))
    kit.label(r, f, rule, f.display, size, kit.ACCENT_DEEP, cx, y + 14 + size * 0.6, 0.5)
    kit.label(r, f, note, f.body, 16, kit.INK_SOFT, cx, y + h - 19, 0.5)
    r:restore()
end

-- Grid lines (and dots at the crossings) inside the polygon Q, in a grid frame at `at`, turned by rot.
local function gridIn(r: Renderer, Q: { Vector }, u: number, at: Vector, rot: number)
    local inv = kit.rotate(kit.offset(Q, -at.x, -at.y), Vector.xy(0, 0), -rot)
    local x0, y0, x1, y1 = kit.bbox(inv)
    local i0, i1 = math.floor(x0 / u) - 1, math.ceil(x1 / u) + 1
    local j0, j1 = math.floor(y0 / u) - 1, math.ceil(y1 / u) + 1
    r:save()
    r:clipPath(kit.poly(Q))
    r:transform(Mat2D.withTranslation(at.x, at.y) * Mat2D.withRotation(rot))
    local gp = Path.new()
    for i = i0, i1 do
        gp:moveTo(Vector.xy(i * u, j0 * u))
        gp:lineTo(Vector.xy(i * u, j1 * u))
    end
    for j = j0, j1 do
        gp:moveTo(Vector.xy(i0 * u, j * u))
        gp:lineTo(Vector.xy(i1 * u, j * u))
    end
    r:drawPath(gp, kit.stroke(kit.alpha(FLOUR, 0.3), 1.5))
    local dp = Path.new()
    local rad = math.max(2, u * 0.055)
    for i = i0, i1 do
        for j = j0, j1 do
            addCircle(dp, i * u, j * u, rad)
        end
    end
    r:drawPath(dp, kit.fill(kit.alpha(FLOUR, 0.95)))
    r:restore()
end

-- A piece of a kolam patch with corners P: swept floor, its squares marked by the dot grid. Held pieces rise and
-- their shadow spreads. edge: 0 plain · 1 gold (it moves) · 2 red (not that).
function Art.piece(r: Renderer, P: { Vector }, lift: number, edge: number, u: number, gridAt: Vector, gridRot: number)
    if #P < 3 then
        return
    end
    r:drawPath(kit.poly(kit.offset(P, 3 + 8 * lift, 5 + 20 * lift)), kit.soft(kit.alpha(kit.INK, 0.2 + 0.1 * lift), 6 + 14 * lift))
    local Q = kit.offset(P, 0, -12 * lift)
    r:drawPath(kit.poly(Q), kit.fill(WET))
    gridIn(r, Q, u, Vector.xy(gridAt.x, gridAt.y - 12 * lift), gridRot)
    if edge == 1 then
        r:drawPath(kit.poly(Q), kit.stroke(kit.GOLD, 4.5))
    elseif edge == 2 then
        r:drawPath(kit.poly(Q), kit.stroke(kit.RED, 4.5))
    else
        r:drawPath(kit.poly(Q), kit.stroke(Color.rgb(58, 50, 46), 2))
    end
end

-- Home-card thumbnails: the whole street in miniature. Call, draw in board coordinates, then r:restore().
function Art.thumbOpen(r: Renderer, x: number, y: number, w: number, h: number, t: number, o: StreetOpts)
    local s = math.max(w / kit.BW, h / kit.BH)
    r:save()
    r:transform(Mat2D.withTranslation(x + w / 2, y + h / 2) * Mat2D.withScale(s, s) * Mat2D.withTranslation(-(kit.BX + kit.BW / 2), -(kit.BY + kit.BH / 2)))
    Art.street(r, t, o)
end

-- Lesson 1 -------------------------------------------------------------------------------------------------

type Tile = { at: number } -- when it was sprinkled

type St = {
    tiles: { [number]: Tile }, -- by cell index (row * COLS + col)
    count: number,
    painting: boolean,
    last: Vector?,
    doneAt: number,
    tipDone: boolean,
    -- step 2
    rows: { [number]: number }, -- row -> time it was tapped
    rowCount: number,
    countShown: number,
    pop: number,
    -- step 3
    w: number,
    h: number,
    dragging: boolean,
    held: number,
    found: { [string]: boolean },
    foundList: { string },
    foundAt: number,
    flash: number,
    bornAt: { [number]: number },
}

local COLS, ROWS, U = 6, 4, 60
local FX, FY = 460, 330 -- Paati's patch, in front of the door
local GX, GY, GU, GCOLS, GROWS = 250, 330, 44, 8, 6 -- step 3 grid
local GROUND = Art.GROUND
local STREET: StreetOpts = { ground = GROUND, tower = 196, palm = 84, bare = 3, corner = false }

local S: St = {
    tiles = {}, count = 0, painting = false, last = nil, doneAt = -1, tipDone = false,
    rows = {}, rowCount = 0, countShown = 0, pop = 0,
    w = 2, h = 2, dragging = false, held = 0, found = {}, foundList = {}, foundAt = -1, flash = 0, bornAt = {},
}

-- Kavin and Paati, on the street with the student
local kavin = people.new(people.CAST.kavin, -100)
local paati = people.new(people.CAST.paati, -100)
local kavinUntil, paatiUntil = 0, 0
local greeted = false
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

local L = {}

L.art = Art

L.lines = {
    l1s1 = 'Meet Kavin and his Paati in Mylapore. Every Margazhi morning they draw a kolam here. Sweep across the dots to sprinkle rice flour.',
    l1s1half = 'Lovely and even. Keep going, right to the edges.',
    l1s1done = 'Covered, with no gaps and no overlaps. The number of squares it takes to cover a space is its area.',
    l1s2 = 'Counting one square at a time is slow. Tap a row, and the whole row is counted at once.',
    l1s2done = 'Rows times the squares in each row. For any rectangle, that is length times breadth.',
    l1s3 = 'Paati has flour for exactly 12 squares. Drag the gold corner to shape a patch that uses every bit of it.',
    l1s3one = 'One patch found. Now shape a different patch that takes the same flour.',
    l1s3same = "That's the same patch, just turned round. Try a new shape.",
    l1s3done = 'Two shapes, the same flour. Area is the space inside, whatever the shape.',
}

L.id = 'squares'
L.tag = 'COUNTING SQUARES'
L.title = 'Area is counting squares'
L.blurb = "Fill Paati's kolam patch, row by row."
L.steps = {
    { title = 'Sprinkle the kolam patch', line = 'l1s1', task = 'Cover the whole patch with flour squares' },
    { title = 'Count it row by row', line = 'l1s2', task = 'Tap each row to count it' },
    { title = 'Twelve squares of flour', line = 'l1s3', task = 'Make two different patches of 12 squares' },
}

local function cellAt(p: Vector): number?
    local c = math.floor((p.x - FX) / U)
    local rr = math.floor((p.y - FY) / U)
    if c < 0 or c >= COLS or rr < 0 or rr >= ROWS then
        return nil
    end
    return rr * COLS + c
end

local function lay(g: G, i: number)
    if S.tiles[i] ~= nil then
        return
    end
    S.tiles[i] = { at = g.t }
    S.count += 1
    S.pop = 1
    g.tick(S.count - 1)
    if S.count == 12 then
        g.sayNext('l1s1half')
    end
    if S.count == COLS * ROWS then
        S.doneAt = g.t
        S.painting = false
        g.done()
        g.burst(FX + COLS * U / 2, FY + ROWS * U / 2, 50)
        g.say('l1s1done')
        kavinSays(g, 'Done, Paati!', nil, 3)
        paatiUntil = 0
    end
end

local function paintTo(g: G, p: Vector)
    local a = S.last or p
    local n = math.max(1, math.ceil(kit.dist(a, p) / (U / 4)))
    for k = 0, n do
        local q = Vector.xy(a.x + (p.x - a.x) * k / n, a.y + (p.y - a.y) * k / n)
        local i = cellAt(q)
        if i ~= nil then
            lay(g, i)
        end
    end
    S.last = p
end

local function fillAll(g: G)
    for i = 0, COLS * ROWS - 1 do
        S.tiles[i] = { at = g.t - 2 }
    end
    S.count = COLS * ROWS
end

-- step 3 ------------------------------------------------------------------------------

local function handlePos(): Vector
    return Vector.xy(GX + S.w * GU, GY + S.h * GU)
end

local function setSize(g: G, w: number, h: number)
    local nw, nh = kit.clamp(w, 1, GCOLS), kit.clamp(h, 1, GROWS)
    if nw == S.w and nh == S.h then
        return
    end
    for rr = 0, nh - 1 do
        for c = 0, nw - 1 do
            if c >= S.w or rr >= S.h then
                S.bornAt[rr * 100 + c] = g.t
            end
        end
    end
    S.w, S.h = nw, nh
    S.pop = 1
    g.tick(nw * nh - 1)
end

local function judge(g: G)
    if S.w * S.h ~= 12 then
        return
    end
    local a, b = math.min(S.w, S.h), math.max(S.w, S.h)
    local id = a .. 'x' .. b
    if S.found[id] then
        if not g.isDone() then
            g.sfx('oops')
            g.say('l1s3same')
        end
        return
    end
    S.found[id] = true
    table.insert(S.foundList, S.w .. ' × ' .. S.h)
    S.flash = 1
    S.foundAt = g.t
    g.sfx('sparkle')
    g.burst(GX + S.w * GU / 2, GY + S.h * GU / 2, 30)
    if #S.foundList >= 2 then
        g.done()
        g.say('l1s3done')
        paatiUntil = 0
    else
        g.say('l1s3one')
        -- Paati, who has shaped a kolam to every doorstep on this street, nudges toward the other kind of patch
        if a == 2 then
            paatiSays(g, 'Try a squarer', 'one, kanna.', 4.5)
        else
            paatiSays(g, 'A long, thin one', 'works too.', 4.5)
        end
    end
end

-- protocol ---------------------------------------------------------------------------------

-- Kavin walks on the first time; after that each step has its own spot, and they are simply there
-- (walking over would cross the patch or a card)
local function place(p: Person, x: number, walkIn: boolean)
    p.y = 606
    p.x = if p.x < kit.BX - 40 and walkIn then -60 else x
    p.tx = x
end

function L.enter(g: G, step: number)
    S.tiles, S.count, S.painting, S.last, S.doneAt, S.tipDone = {}, 0, false, nil, -1, false
    S.rows, S.rowCount, S.countShown, S.pop = {}, 0, 0, 0
    S.w, S.h, S.dragging, S.held, S.found, S.foundList, S.foundAt, S.flash, S.bornAt = 2, 2, false, 0, {}, {}, -1, 0, {}
    if step == 2 then
        fillAll(g)
    end
    people.hush(kavin)
    people.hush(paati)
    kavinUntil, paatiUntil = 0, 0
    if step == 1 then
        place(kavin, 320, true)
        place(paati, 960, false)
    elseif step == 2 then
        place(kavin, 320, false)
        place(paati, 990, false)
    else
        place(kavin, 140, false)
        place(paati, 1110, false)
    end
    kavin.mood, paati.mood = 'idle', 'idle'
end

-- how Kavin and Paati take what is happening on the patch
local function feel(g: G)
    local km, pm = 'watch', 'watch'
    local lx, ly = FX + COLS * U / 2, FY + ROWS * U / 2
    if g.step == 1 then
        if not greeted and g.age > 1.3 then
            greeted = true
            kavinSays(g, 'Vanakkam!', nil, 3)
        end
        if S.count >= 6 and not S.tipDone then
            S.tipDone = true
            paatiSays(g, 'Edge to edge,', 'no gaps!', 4)
        end
        if S.doneAt >= 0 then
            km = if g.t - S.doneAt < 2.6 then 'cheer' else 'idle'
            pm = if g.t - S.doneAt < 2.2 then 'wave' else 'idle'
        elseif g.t < kavinUntil and kavin.line1 == 'Vanakkam!' then
            km = 'wave'
            pm = 'idle'
        elseif S.count == 0 then
            km = if g.age > 4.5 then 'point' else 'idle'
            pm = 'idle'
        end
    elseif g.step == 2 then
        if g.age > 1.2 and not S.tipDone and S.rowCount < ROWS then
            S.tipDone = true
            paatiSays(g, 'I count my', 'dots in rows!', 4.5)
        end
        if S.rowCount == ROWS then
            local since = g.t - (S.rows[ROWS - 1] or g.t)
            km = if since < 2.4 then 'cheer' else 'idle'
            pm = if since < 2 then 'wave' else 'idle'
        elseif S.rowCount == 0 then
            km = 'think'
        end
    else
        lx, ly = GX + S.w * GU / 2, GY + S.h * GU / 2
        if g.isDone() and g.t - S.foundAt < 2.6 then
            km, pm = 'cheer', 'wave'
        elseif S.foundAt >= 0 and g.t - S.foundAt < 1.6 then
            km = 'cheer'
        elseif not S.dragging and #S.foundList == 0 then
            km = 'think'
        end
    end
    kavin.lookX, kavin.lookY = lx, ly
    paati.lookX, paati.lookY = lx, ly
    kavin.mood, paati.mood = km, pm
end

function L.advance(g: G, dt: number)
    S.pop = math.max(0, S.pop - dt * 3)
    S.flash = math.max(0, S.flash - dt * 1.2)
    S.held = kit.follow(S.held, if S.dragging then 1 else 0, 18, dt)
    -- step 2: the count climbs one square at a time behind the taps
    if g.step == 2 and S.countShown < S.rowCount * COLS then
        local before = math.floor(S.countShown)
        S.countShown = math.min(S.rowCount * COLS, S.countShown + dt * 22)
        if math.floor(S.countShown) > before then
            g.tick(math.floor(S.countShown) - 1)
            S.pop = 1
        end
    end
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

local function drawTiles(g: G, r: Renderer, highlightRow: number)
    for i = 0, COLS * ROWS - 1 do
        local tl = S.tiles[i]
        if tl ~= nil then
            local c, row = i % COLS, math.floor(i / COLS)
            local age = g.t - tl.at
            local drop = kit.clamp(age / 0.5, 0, 1)
            local glow = 0
            if S.doneAt >= 0 then
                local wave = g.t - S.doneAt - (c + row) * 0.05
                glow = if wave > 0 and wave < 0.6 then math.sin(wave / 0.6 * math.pi) else 0
            end
            local rt = S.rows[row]
            local hopY = 0
            local tint: Color? = nil
            if rt ~= nil then
                local k = g.t - rt - c * 0.07
                if k > 0 and k < 0.35 then
                    hopY = -math.sin(k / 0.35 * math.pi) * 14
                end
                if k > 0 then
                    tint = Art.POWDER[(row % #Art.POWDER) + 1]
                end
            elseif highlightRow == row then
                glow = 0.6
            end
            r:save()
            r:transform(Mat2D.withTranslation(0, hopY))
            Art.flour(r, FX + c * U, FY + row * U, U, drop, tint, glow)
            r:restore()
            Art.puff(r, FX + c * U + U / 2, FY + row * U + U / 2, U, age - 0.42)
        end
    end
end

local function hoverRow(p: Vector): number
    if p.x < FX - 20 or p.x > FX + COLS * U + 80 then
        return -1
    end
    local row = math.floor((p.y - FY) / U)
    if row < 0 or row >= ROWS then
        return -1
    end
    return row
end

local lastHover = Vector.xy(-100, -100)

local function drawPatch(g: G, r: Renderer)
    Art.wet(r, FX - 22, FY - 22, COLS * U + 44, ROWS * U + 44)
    Art.dots(r, FX, FY, COLS, ROWS, U, 0.95)
end

local function drawStep12(g: G, r: Renderer)
    local f = g.fonts
    drawPatch(g, r)
    local hr = if g.step == 2 and S.rows[hoverRow(lastHover)] == nil then hoverRow(lastHover) else -1
    drawTiles(g, r, hr)
    if g.step == 1 then
        Art.counter(r, f, 'SQUARES OF FLOUR', tostring(S.count), S.pop, 1016, 168, 196)
        -- the bar under the patch fills, but the total stays a question
        local pw = COLS * U
        local by = FY + ROWS * U + 30
        r:drawPath(kit.rrect(FX, by, pw, 8, 4), kit.fill(kit.alpha(kit.INK, 0.12)))
        if S.count > 0 then
            r:drawPath(kit.rrect(FX, by, pw * S.count / (COLS * ROWS), 8, 4), kit.fill(kit.ACCENT))
        end
        if S.doneAt >= 0 then
            kit.label(r, f, 'the whole patch', f.body, 15, kit.ACCENT_DEEP, FX + pw, by + 24, 1)
        else
            kit.label(r, f, S.count .. ' of ?', f.body, 15, kit.INK_SOFT, FX + pw, by + 24, 1)
        end
    else
        local all = S.rowCount == ROWS
        local tRule = (S.rows[ROWS - 1] or 0) + 2.2
        if not all or g.t < tRule then
            Art.counter(r, f, 'COUNTED', tostring(math.floor(S.countShown)), S.pop, 1016, 168, 196)
        end
        for row = 0, ROWS - 1 do
            local y = FY + row * U + U / 2
            local rt = S.rows[row]
            local tx = FX + COLS * U + 44
            if rt ~= nil then
                local k = kit.back((g.t - rt) * 3)
                r:save()
                r:modulateOpacity(kit.clamp(k, 0, 1))
                kit.halo(r, f, '+6', f.display, 24, kit.ACCENT_DEEP, tx - 16, y, 0)
                r:restore()
            else
                local pulse = 0.5 + 0.5 * math.sin(g.t * 4 + row)
                r:drawPath(kit.circle(tx, y, 15 + pulse * 3), kit.stroke(kit.alpha(kit.ACCENT, 0.7), 2.5))
                r:drawPath(kit.circle(tx, y, 6), kit.fill(kit.ACCENT))
            end
        end
        if all then
            local t0 = S.rows[ROWS - 1] or 0
            local x0, x1, y0, y1 = FX, FX + COLS * U, FY, FY + ROWS * U
            kit.bracket(r, f, Vector.xy(x0, y1 + 30), Vector.xy(x1, y1 + 30), 0, 1, '6', kit.clamp((g.t - t0 - 0.6) * 1.5, 0, 1), kit.INK)
            kit.bracket(r, f, Vector.xy(x0 - 34, y0), Vector.xy(x0 - 34, y1), -1, 0, '4', kit.clamp((g.t - t0 - 1.3) * 1.5, 0, 1), kit.INK)
            Art.rule(r, f, 'area = length × breadth', '6 × 4 = 24 square units', kit.clamp((g.t - tRule) * 1.5, 0, 1), 1040, 166, 24)
        end
    end
end

local function drawStep3(g: G, r: Renderer)
    local f = g.fonts
    Art.wet(r, GX - 20, GY - 20, GCOLS * GU + 40, GROWS * GU + 40)
    Art.dots(r, GX, GY, GCOLS, GROWS, GU, 0.9)
    local is12 = S.w * S.h == 12
    for rr = 0, S.h - 1 do
        for c = 0, S.w - 1 do
            local born = S.bornAt[rr * 100 + c] or -9
            local k = kit.clamp((g.t - born) / 0.3, 0, 1)
            local glow = if is12 then 0.55 + 0.45 * S.flash else 0
            local cx, cy = GX + c * GU + GU / 2, GY + rr * GU + GU / 2
            if k < 1 then
                local s = kit.back(k)
                r:save()
                r:transform(Mat2D.withTranslation(cx, cy) * Mat2D.withScale(s, s) * Mat2D.withTranslation(-cx, -cy))
                Art.flour(r, GX + c * GU, GY + rr * GU, GU, 1, nil, glow)
                r:restore()
            else
                Art.flour(r, GX + c * GU, GY + rr * GU, GU, 1, nil, glow)
            end
        end
    end
    -- outline and sizes
    local x1, y1 = GX + S.w * GU, GY + S.h * GU
    r:drawPath(kit.rect(GX, GY, S.w * GU, S.h * GU), kit.stroke(if is12 then kit.ACCENT else kit.alpha(FLOUR, 0.9), if is12 then 4 else 2.5))
    kit.halo(r, f, tostring(S.w), f.display, 22, kit.INK, (GX + x1) / 2, GY - 20, 0.5)
    kit.halo(r, f, tostring(S.h), f.display, 22, kit.INK, GX - 26, (GY + y1) / 2, 0.5)
    local hp = handlePos()
    kit.knob(r, g.t, hp.x, hp.y, 'slide', S.held, not S.dragging and #S.foundList == 0)
    -- the readout
    local A = S.w * S.h
    local bx, by, bw = 680, 330, 330
    Art.card(r, bx, by, bw, 136, if is12 then kit.ACCENT else kit.LINE)
    if is12 then
        r:drawPath(kit.rrect(bx, by, bw, 136, 20), kit.fill(kit.alpha(kit.ACCENT_WASH, 0.8)))
    end
    kit.label(r, f, 'SQUARES OF FLOUR', f.mono, 12, kit.INK_SOFT, bx + 24, by + 26, 0)
    local sc = 1 + 0.1 * math.sin(kit.clamp(S.pop, 0, 1) * math.pi)
    r:save()
    r:transform(Mat2D.withTranslation(bx + 24, by + 72) * Mat2D.withScale(sc, sc) * Mat2D.withTranslation(-(bx + 24), -(by + 72)))
    kit.label(r, f, S.w .. ' × ' .. S.h .. ' = ' .. A, f.display, 44, if is12 then kit.ACCENT_DEEP else kit.INK, bx + 24, by + 72, 0)
    r:restore()
    local status = if is12 then 'Exactly 12: all the flour!' elseif A < 12 then (12 - A) .. ' squares of flour left over' else (A - 12) .. ' more than Paati has'
    kit.label(r, f, status, f.body, 16, if is12 then kit.ACCENT_DEEP else kit.INK_SOFT, bx + 24, by + 112, 0)
    -- found so far
    kit.label(r, f, 'FOUND', f.mono, 12, kit.INK_SOFT, bx + 4, by + 166, 0)
    for i = 1, 2 do
        local s = S.foundList[i]
        local x = bx + (i - 1) * 170
        local y = by + 182
        r:drawPath(kit.rrect(x, y, 160, 50, 16), kit.fill(if s ~= nil then kit.SURFACE else kit.alpha(kit.SURFACE, 0.7)))
        r:drawPath(kit.rrect(x, y, 160, 50, 16), kit.stroke(if s ~= nil then kit.ACCENT else kit.LINE, if s ~= nil then 2 else 1.5))
        if s ~= nil then
            r:drawPath(kit.circle(x + 26, y + 25, 12), kit.fill(kit.ACCENT))
            r:drawPath(kit.check(x + 26, y + 25, 12), kit.stroke(kit.SURFACE, 2.4))
            kit.label(r, f, s, f.display, 22, kit.INK, x + 48, y + 25, 0)
        else
            kit.label(r, f, '? × ?', f.display, 22, kit.INK_FAINT, x + 80, y + 25, 0.5)
        end
    end
end

function L.draw(g: G, r: Renderer)
    Art.street(r, g.t, STREET)
    if g.step <= 2 then
        drawStep12(g, r)
    else
        drawStep3(g, r)
    end
    people.draw(r, g.fonts, kavin, g.t)
    people.draw(r, g.fonts, paati, g.t)
    -- a ghost finger shows the sweep until the first square
    if g.step == 1 and S.count == 0 and g.age > 3 then
        local k = ((g.age - 3) % 2.4) / 2.4
        local a = if k < 0.1 then k / 0.1 elseif k > 0.8 then (1 - k) / 0.2 else 1
        local x = FX + 20 + kit.smooth((k - 0.1) / 0.7) * (COLS * U - 40)
        kit.finger(r, x, FY + U / 2, a, true)
    end
end

function L.down(g: G, p: Vector): boolean
    lastHover = p
    if g.step == 1 then
        if cellAt(p) ~= nil and S.count < COLS * ROWS then
            S.painting = true
            S.last = p
            g.sfx('pickup')
            paintTo(g, p)
            return true
        end
    elseif g.step == 2 then
        local row = hoverRow(p)
        if row >= 0 and S.rows[row] == nil then
            S.rows[row] = g.t
            S.rowCount += 1
            g.sfx('pop')
            if S.rowCount == ROWS then
                g.done()
                g.say('l1s2done')
            end
            return true
        end
    else
        if kit.dist(p, handlePos()) < 40 then
            S.dragging = true
            g.sfx('pickup')
            return true
        end
    end
    return false
end

function L.move(g: G, p: Vector)
    lastHover = p
    if g.step == 1 and S.painting then
        paintTo(g, p)
    elseif g.step == 3 and S.dragging then
        setSize(g, math.floor((p.x - GX) / GU + 0.5), math.floor((p.y - GY) / GU + 0.5))
    end
end

function L.up(g: G, p: Vector)
    if S.painting then
        S.painting = false
        S.last = nil
    end
    if S.dragging then
        S.dragging = false
        g.sfx('drop')
        judge(g)
    end
end

function L.key(g: G, k: number): boolean
    if g.step == 1 and k == 32 then
        -- space sprinkles the next row
        for i = 0, COLS * ROWS - 1 do
            if S.tiles[i] == nil then
                local row = math.floor(i / COLS)
                for c = 0, COLS - 1 do
                    lay(g, row * COLS + c)
                end
                return true
            end
        end
    elseif g.step == 2 and k == 32 then
        for row = 0, ROWS - 1 do
            if S.rows[row] == nil then
                L.down(g, Vector.xy(FX + 10, FY + row * U + 10))
                return true
            end
        end
    elseif g.step == 3 then
        local dw = if k == 262 then 1 elseif k == 263 then -1 else 0
        local dh = if k == 264 then 1 elseif k == 265 then -1 else 0
        if dw ~= 0 or dh ~= 0 then
            setSize(g, S.w + dw, S.h + dh)
            judge(g)
            return true
        end
    end
    return false
end

function L.thumb(g: G, r: Renderer, x: number, y: number, w: number, h: number)
    Art.thumbOpen(r, x, y, w, h, g.t, STREET)
    -- Paati's patch filling with flour, over and over
    Art.wet(r, FX - 22, FY - 22, COLS * U + 44, ROWS * U + 44)
    Art.dots(r, FX, FY, COLS, ROWS, U, 0.95)
    local n = math.floor((g.t * 5) % (COLS * ROWS + 12))
    for i = 0, math.min(n, COLS * ROWS) - 1 do
        local c, rr = i % COLS, math.floor(i / COLS)
        Art.flour(r, FX + c * U, FY + rr * U, U, kit.clamp((n - i) / 2, 0, 1), nil, 0)
    end
    thumbKavin.x, thumbKavin.y, thumbKavin.s = 300, 600, 1.9
    thumbKavin.mood = 'wave'
    people.advance(thumbKavin, 1 / 60, g.t)
    people.draw(r, g.fonts, thumbKavin, g.t)
    r:restore()
end

return L
