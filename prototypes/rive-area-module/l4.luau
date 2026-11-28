-- Lesson 4 · Triangles and the real height: Tenzin's greenhouse wall
--
-- Leh, Ladakh, late autumn. Tenzin Dolma (13) and her aunt Dolkar, a solar engineer, are building a solar
-- greenhouse so the family can grow spinach through a minus-twenty-degree winter. Its end walls are triangles of
-- polythene sheet: how much sheet does one wall take? (Who they are and why: CAST_AND_STORIES.md in the trail.)
--   1. tap the end wall for a sheet for the other end; spin it by its gold knob and slide it in: a parallelogram,
--      6 × 4 = 24; then the copy lifts away and the sign counts down to 12
--   2. drag the top corner along the ridge line, parallel to the base, even past its end: the sloping sides change,
--      the sheet stays 12 (faint ghosts of where it has been)
--   3. tap the real height. Dolkar's plumb line (a stone on a string) drops straight down from the top corner for
--      the right line, and swings off a sloping side when one of those is tapped: the sloping roof beam is the trap
--   4. keypad: base 10, height 4, sloping beam 5 -> 20 (40 forgot the half; 25 or 50 used the beam)
-- Evidence for the trail: 'l4s3' (the line tapped) and 'l4s4' (the keypad), every answer.

local kit = require('kit')
local people = require('people')
type G = kit.G
type Keypad = kit.Keypad
type Person = people.Person

local L = {}

-- Everything said in this lesson (main.luau merges these into the shared lines).
L.lines = {
    l4s1 = "Tenzin's family wants spinach all winter, so she and her aunt Dolkar are building a solar greenhouse in Leh. Tap its triangle end wall.",
    l4spin = "A sheet for the greenhouse's other end! Turn it with the gold knob, then slide it in beside the first.",
    l4wrongway = "It won't lie flat that way round. Give it a turn with the gold knob first.",
    l4notthere = "Nearly. Slide it so its sloping edge lies along the wall's sloping edge.",
    l4s1done = 'Two end walls make one parallelogram, so each wall takes exactly half of it.',
    l4s2 = 'Tenzin wonders if a lopsided wall needs more sheet. Drag the top corner along the dotted line, even past the end.',
    l4s2done = 'The sloping sides stretched and shrank, but the sheet never changed. Only the base and the height decide it.',
    l4s3 = 'Dolkar finds heights with a plumb line, a stone on a string. Which line on this wall is the real height?',
    l4slant = 'See the stone swing? It never rests along a sloping beam. It settles straight down.',
    l4base = "That one runs along the ground. It's the base, and the height stands up from it.",
    l4s3done = "Yes! The stone drops straight down from the top corner and meets the base at a right angle. That's the real height.",
    l4s4 = "Tenzin's real greenhouse has an end wall like this one. How many square metres of sheet will it need?",
    l4n40 = "Two walls' worth, the whole parallelogram. One wall needs half of it.",
    l4n25 = "The sloping beam crept in there. Use the plumb line's height instead.",
    l4n50 = "The sloping beam crept in, and the half went missing. Use the plumb line's height, then halve.",
    l4nx = 'Multiply the base by the height, then take half.',
    l4s4done = 'Exactly right! Tenzin can cut the sheet now, and the spinach will stay warm all winter.',
}

-- Leh: colours ----------------------------------------------------------------------------

local OUT = Color.rgb(74, 44, 18) -- the outline brown the people are drawn with
local SKY_HI = Color.rgb(24, 78, 168)
local SKY_LO = Color.rgb(118, 172, 228)
local ROCK_FAR = Color.rgb(190, 152, 118)
local ROCK_FAR_SH = Color.rgb(164, 126, 96)
local ROCK = Color.rgb(150, 108, 74)
local ROCK_SH = Color.rgb(128, 90, 62)
local SNOW = Color.rgb(250, 251, 255)
local SNOW_SH = Color.rgb(204, 218, 238)
local EARTH = Color.rgb(214, 188, 146)
local EARTH_LO = Color.rgb(232, 214, 182)
local PEBBLE = Color.rgb(196, 182, 160)
local LEAVES = Color.rgb(226, 206, 118) -- poplars turning in autumn: straw, not the gold of things that move
local LEAVES_SH = Color.rgb(196, 170, 86)
local BARK = Color.rgb(226, 220, 204)
local WHITEWASH = Color.rgb(247, 242, 230)
local WHITEWASH_SH = Color.rgb(224, 216, 200)
local TWIGS = Color.rgb(122, 86, 56)
local TWIGS_DK = Color.rgb(88, 60, 38)
local WINDOW = Color.rgb(46, 38, 34)
local GLASS = Color.rgb(120, 162, 196)
local PANEL = Color.rgb(36, 70, 134)
local PANEL_LINE = Color.rgb(132, 170, 220)
local MUDBRICK = Color.rgb(190, 152, 108)
-- the greenhouse
local SHEET = Color.rgb(222, 238, 247)
local SHEET_HI = Color.rgb(247, 251, 254)
local SHEET_COPY = Color.rgb(226, 244, 232)
local SHEET_GRID = Color.rgb(118, 158, 186)
local SHEET_EDGE = Color.rgb(146, 182, 204)
local WOOD = Color.rgb(178, 124, 72)
local STONE = Color.rgb(150, 144, 136)
local STRING = Color.rgb(70, 58, 50)

-- the ground starts here; the people stand with their feet on FEET
local HZ = 420
local FEET = 624

-- A quadratic curve from a through control c to b, written as a cubic.
local function quad(p: Path, a: Vector, c: Vector, b: Vector)
    p:cubicTo(Vector.xy(a.x + (c.x - a.x) * 2 / 3, a.y + (c.y - a.y) * 2 / 3), Vector.xy(b.x + (c.x - b.x) * 2 / 3, b.y + (c.y - b.y) * 2 / 3), b)
end

local function outlined(r: Renderer, path: Path, c: Color, w: number)
    r:drawPath(path, kit.fill(c))
    r:drawPath(path, kit.stroke(OUT, w))
end

-- Leh: the backdrop -------------------------------------------------------------------------

-- the far range: bare brown peaks with snow on top
local FAR: { Vector } = {
    Vector.xy(40, 330), Vector.xy(118, 272), Vector.xy(196, 304), Vector.xy(318, 236), Vector.xy(420, 298),
    Vector.xy(520, 266), Vector.xy(652, 212), Vector.xy(772, 290), Vector.xy(872, 248), Vector.xy(990, 300),
    Vector.xy(1092, 234), Vector.xy(1180, 286), Vector.xy(1240, 262),
}
-- the nearer hills, lower and darker
local NEAR: { Vector } = {
    Vector.xy(40, 368), Vector.xy(170, 338), Vector.xy(300, 366), Vector.xy(430, 332), Vector.xy(580, 362),
    Vector.xy(720, 330), Vector.xy(860, 358), Vector.xy(1000, 336), Vector.xy(1130, 364), Vector.xy(1240, 342),
}

local function farRange(): Path
    local p = Path.new()
    p:moveTo(Vector.xy(FAR[1].x, HZ))
    for _, q in FAR do
        p:lineTo(q)
    end
    p:lineTo(Vector.xy(FAR[#FAR].x, HZ))
    p:close()
    return p
end

local function nearHills(): Path
    local p = Path.new()
    p:moveTo(Vector.xy(NEAR[1].x, HZ + 4))
    p:lineTo(NEAR[1])
    local prev = NEAR[1]
    for i = 2, #NEAR - 1 do
        local c, nx = NEAR[i], NEAR[i + 1]
        local m = Vector.xy((c.x + nx.x) / 2, (c.y + nx.y) / 2)
        quad(p, prev, c, m)
        prev = m
    end
    p:lineTo(NEAR[#NEAR])
    p:lineTo(Vector.xy(NEAR[#NEAR].x, HZ + 4))
    p:close()
    return p
end

local function mountains(r: Renderer)
    local far = farRange()
    r:drawPath(far, kit.fill(ROCK_FAR))
    r:save()
    r:clipPath(far)
    for i = 2, #FAR - 1 do
        local a, p, b = FAR[i - 1], FAR[i], FAR[i + 1]
        if p.y < a.y and p.y < b.y then
            -- the shaded face, down and to the right of the peak
            r:drawPath(kit.poly({ p, b, Vector.xy(b.x + 10, HZ), Vector.xy(p.x + (b.x - p.x) * 0.2, HZ) }), kit.fill(ROCK_FAR_SH))
            -- snow on top, with a ragged lower edge, and its own shade
            local d = (math.min(a.y, b.y) - p.y) * 0.5
            local snow = kit.poly({
                Vector.xy(p.x - 140, p.y - 40), Vector.xy(p.x + 140, p.y - 40),
                Vector.xy(p.x + 140, p.y + d), Vector.xy(p.x + 70, p.y + d * 0.8 + 6), Vector.xy(p.x + 34, p.y + d * 1.05),
                Vector.xy(p.x, p.y + d * 0.7), Vector.xy(p.x - 34, p.y + d * 1.1), Vector.xy(p.x - 70, p.y + d * 0.75), Vector.xy(p.x - 140, p.y + d),
            })
            r:drawPath(snow, kit.fill(SNOW))
            r:save()
            r:clipPath(snow)
            r:drawPath(kit.poly({ p, b, Vector.xy(b.x + 10, HZ), Vector.xy(p.x + (b.x - p.x) * 0.2, HZ) }), kit.fill(SNOW_SH))
            r:restore()
        end
    end
    r:restore()
    r:drawPath(far, kit.stroke(kit.alpha(OUT, 0.45), 2.2))
    local near = nearHills()
    r:drawPath(near, kit.fill(ROCK))
    r:save()
    r:clipPath(near)
    for i = 2, #NEAR - 1, 2 do
        local p, b = NEAR[i], NEAR[i + 1]
        r:drawPath(kit.poly({ p, Vector.xy(b.x + 30, b.y - 6), Vector.xy(b.x + 40, HZ + 4), Vector.xy(p.x + 20, HZ + 4) }), kit.fill(kit.alpha(ROCK_SH, 0.6)))
    end
    r:restore()
    r:drawPath(near, kit.stroke(kit.alpha(OUT, 0.55), 2.2))
end

-- a Ladakhi poplar in late autumn: pale trunk, a tall narrow crown of turning leaves, swaying a little
local function poplar(r: Renderer, x: number, base: number, h: number, t: number)
    r:drawPath(kit.ellipse(x + 6, base + 2, h * 0.16, 5), kit.soft(kit.alpha(kit.INK, 0.16), 5))
    outlined(r, kit.rrect(x - 3.5, base - h * 0.32, 7, h * 0.32 + 2, 3), BARK, 2)
    r:save()
    r:transform(Mat2D.withTranslation(x, base) * Mat2D.withRotation(math.sin(t * 1.1 + x * 0.01) * 0.018) * Mat2D.withTranslation(-x, -base))
    local w = h * 0.14
    local c = Path.new()
    c:moveTo(Vector.xy(x, base - h))
    c:cubicTo(Vector.xy(x + w * 0.9, base - h * 0.86), Vector.xy(x + w * 1.15, base - h * 0.45), Vector.xy(x + w * 0.5, base - h * 0.26))
    c:cubicTo(Vector.xy(x + w * 0.2, base - h * 0.2), Vector.xy(x - w * 0.2, base - h * 0.2), Vector.xy(x - w * 0.5, base - h * 0.26))
    c:cubicTo(Vector.xy(x - w * 1.15, base - h * 0.45), Vector.xy(x - w * 0.9, base - h * 0.86), Vector.xy(x, base - h))
    c:close()
    r:drawPath(c, kit.fill(LEAVES))
    r:save()
    r:clipPath(c)
    r:drawPath(kit.rect(x + w * 0.1, base - h, w * 1.4, h), kit.fill(LEAVES_SH))
    r:restore()
    r:drawPath(c, kit.stroke(OUT, 2.2))
    r:restore()
end

-- a Ladakhi window: a dark frame, wider at the bottom, round a small window, with a little ledge on top
local function window(r: Renderer, x: number, y: number, s: number)
    r:drawPath(kit.poly({ Vector.xy(x - 13 * s, y - 13 * s), Vector.xy(x + 13 * s, y - 13 * s), Vector.xy(x + 17 * s, y + 13 * s), Vector.xy(x - 17 * s, y + 13 * s) }), kit.fill(WINDOW))
    r:drawPath(kit.rect(x - 8 * s, y - 8 * s, 16 * s, 16 * s), kit.fill(GLASS))
    r:drawPath(kit.line(x, y - 8 * s, x, y + 8 * s), kit.stroke(WINDOW, 1.6))
    r:drawPath(kit.line(x - 8 * s, y, x + 8 * s, y), kit.stroke(WINDOW, 1.6))
    r:drawPath(kit.rect(x - 16 * s, y - 18 * s, 32 * s, 4 * s), kit.fill(TWIGS))
end

-- a whitewashed, flat-roofed house: firewood stacked along the roof edge, solar panels on top
local function house(r: Renderer, cx: number, base: number)
    r:drawPath(kit.ellipse(cx + 10, base + 2, 96, 8), kit.soft(kit.alpha(kit.INK, 0.14), 8))
    -- solar panels, tilted to the winter sun
    for i = 0, 1 do
        local x0, y0 = cx - 62 + i * 64, base - 100
        r:drawPath(kit.line(x0 + 6, y0, x0 + 2, y0 - 18), kit.stroke(Color.rgb(120, 124, 130), 2.4))
        r:drawPath(kit.line(x0 + 44, y0, x0 + 40, y0 - 18), kit.stroke(Color.rgb(120, 124, 130), 2.4))
        local P = { Vector.xy(x0 - 4, y0 - 6), Vector.xy(x0 + 52, y0 - 6), Vector.xy(x0 + 44, y0 - 30), Vector.xy(x0 - 12, y0 - 30) }
        r:drawPath(kit.poly(P), kit.fill(PANEL))
        for k = 1, 2 do
            local f = k / 3
            r:drawPath(kit.line(x0 - 4 + 56 * f, y0 - 6, x0 - 12 + 56 * f, y0 - 30), kit.stroke(kit.alpha(PANEL_LINE, 0.7), 1.3))
        end
        r:drawPath(kit.line(x0 - 8, y0 - 18, x0 + 48, y0 - 18), kit.stroke(kit.alpha(PANEL_LINE, 0.7), 1.3))
        r:drawPath(kit.poly(P), kit.stroke(OUT, 2))
    end
    -- the walls lean in a little as they rise
    local wall = kit.poly({ Vector.xy(cx - 84, base), Vector.xy(cx + 84, base), Vector.xy(cx + 78, base - 92), Vector.xy(cx - 78, base - 92) })
    r:drawPath(wall, kit.fill(WHITEWASH))
    r:save()
    r:clipPath(wall)
    r:drawPath(kit.rect(cx + 40, base - 100, 60, 104), kit.fill(WHITEWASH_SH))
    r:restore()
    r:drawPath(wall, kit.stroke(OUT, 2.4))
    -- firewood stacked along the roof edge
    local roof = kit.rrect(cx - 84, base - 106, 168, 15, 3)
    outlined(r, roof, TWIGS, 2.2)
    for k = 0, 13 do
        local x = cx - 78 + k * 12
        r:drawPath(kit.line(x, base - 103, x + 4, base - 94), kit.stroke(TWIGS_DK, 1.6))
    end
    window(r, cx - 46, base - 62, 1)
    window(r, cx, base - 62, 1)
    window(r, cx + 46, base - 62, 1)
    window(r, cx - 46, base - 22, 0.9)
    window(r, cx + 46, base - 22, 0.9)
    -- the door
    outlined(r, kit.rrect(cx - 11, base - 34, 22, 34, 3), Color.rgb(140, 92, 54), 2)
    r:drawPath(kit.circle(cx + 5, base - 17, 1.8), kit.fill(WINDOW))
end

-- a few stones on the ground, away from where the lesson happens
local function pebbles(r: Renderer, spots: { Vector })
    for i, q in spots do
        local w = 7 + (i * 5) % 7
        r:drawPath(kit.ellipse(q.x + 2, q.y + 3, w, w * 0.45), kit.soft(kit.alpha(kit.INK, 0.14), 3))
        outlined(r, kit.ellipse(q.x, q.y, w, w * 0.55), PEBBLE, 1.8)
    end
end

type Scene = { house: number?, poplars: { number }, pebbles: { Vector } }

local function leh(r: Renderer, t: number, sc: Scene)
    local bx, by, bw, bh = kit.BX, kit.BY, kit.BW, kit.BH
    -- the deep blue sky of the high desert, paler down by the mountains
    local sky = Gradient.linear(Vector.xy(0, by), Vector.xy(0, HZ), {
        { position = 0, color = SKY_HI },
        { position = 1, color = SKY_LO },
    })
    r:drawPath(kit.rect(bx, by, bw, HZ - by + 6), Paint.with({ gradient = sky }))
    mountains(r)
    -- the dusty ground
    local ground = Gradient.linear(Vector.xy(0, HZ), Vector.xy(0, by + bh), {
        { position = 0, color = EARTH },
        { position = 1, color = EARTH_LO },
    })
    r:drawPath(kit.rect(bx, HZ, bw, by + bh - HZ), Paint.with({ gradient = ground }))
    r:drawPath(kit.line(bx, HZ, bx + bw, HZ), kit.stroke(kit.alpha(OUT, 0.35), 2))
    for i, x in sc.poplars do
        poplar(r, x, HZ + 12, 150 + (i % 3) * 18, t)
    end
    local hx = sc.house
    if hx ~= nil then
        house(r, hx, HZ + 8)
    end
    pebbles(r, sc.pebbles)
end

-- a roll of polythene sheet and a stack of mud bricks (the greenhouse's thick back wall), for step 1
local function buildingSite(r: Renderer, x: number, y: number)
    -- mud bricks
    for row = 0, 2 do
        for k = 0, 2 - (if row == 2 then 1 else 0) do
            local bxp = x + 70 + k * 40 + (if row % 2 == 1 then 20 else 0)
            local byp = y - 22 - row * 18
            outlined(r, kit.rrect(bxp, byp, 38, 17, 3), MUDBRICK, 2)
        end
    end
    -- the roll
    r:drawPath(kit.ellipse(x + 64, y + 26, 74, 8), kit.soft(kit.alpha(kit.INK, 0.18), 6))
    outlined(r, kit.rrect(x, y, 136, 30, 15), SHEET, 2.4)
    r:drawPath(kit.line(x + 14, y + 8, x + 118, y + 8), kit.stroke(kit.alpha(kit.SURFACE, 0.8), 3))
    r:drawPath(kit.line(x + 36, y + 3, x + 36, y + 27), kit.stroke(kit.alpha(SHEET_EDGE, 0.7), 1.5))
    outlined(r, kit.ellipse(x + 128, y + 15, 9, 15), SHEET_HI, 2.2)
    outlined(r, kit.ellipse(x + 128, y + 15, 3.5, 6), Color.rgb(180, 150, 110), 1.6)
end

-- The greenhouse sheet ---------------------------------------------------------------------------

type Look = {
    lift: number, -- 0 in place … 1 held up
    copy: boolean, -- the freshly cut sheet for the other end
    edge: number, -- 0 plain · 1 gold (tap me, move me) · 2 red (not that)
    frame: boolean, -- the wall's own timber frame round the sheet
    unit: number, -- grid square in px
    gridAt: Vector, -- a grid crossing
    gridRot: number, -- grid turn (radians)
    alpha: number,
}

local function look(unit: number, gridAt: Vector): Look
    return { lift = 0, copy = false, edge = 0, frame = true, unit = unit, gridAt = gridAt, gridRot = 0, alpha = 1 }
end

-- A sheet of greenhouse polythene with corners P (px), marked out in squares. Held sheets rise, their shadow spreads.
local function sheet(r: Renderer, P: { Vector }, s: Look)
    if #P < 3 then
        return
    end
    local lift = s.lift
    r:save()
    r:modulateOpacity(s.alpha)
    r:drawPath(kit.poly(kit.offset(P, 4 + 10 * lift, 9 + 22 * lift)), kit.soft(kit.alpha(kit.INK, 0.22 + 0.06 * lift), 9 + 16 * lift))
    local Q = kit.offset(P, 0, -13 * lift)
    local x0, y0, x1, y1 = kit.bbox(Q)
    local base = if s.copy then SHEET_COPY else SHEET
    local grad = Gradient.linear(Vector.xy(x0, y0), Vector.xy(x1, y1), {
        { position = 0, color = SHEET_HI },
        { position = 0.6, color = base },
        { position = 1, color = kit.mix(base, SHEET_GRID, 0.22) },
    })
    local qp = kit.poly(Q)
    r:drawPath(qp, Paint.with({ gradient = grad }))
    -- the squares, in the sheet's own frame (they turn with it), then the sheen of the plastic
    local u = s.unit
    local at = Vector.xy(s.gridAt.x, s.gridAt.y - 13 * lift)
    local inv = kit.rotate(kit.offset(Q, -at.x, -at.y), Vector.xy(0, 0), -s.gridRot)
    local gx0, gy0, gx1, gy1 = kit.bbox(inv)
    local i0, i1 = math.floor(gx0 / u) - 1, math.ceil(gx1 / u) + 1
    local j0, j1 = math.floor(gy0 / u) - 1, math.ceil(gy1 / u) + 1
    r:save()
    r:clipPath(qp)
    r:save()
    r:transform(Mat2D.withTranslation(at.x, at.y) * Mat2D.withRotation(s.gridRot))
    local gp = Path.new()
    for i = i0, i1 do
        gp:moveTo(Vector.xy(i * u, j0 * u))
        gp:lineTo(Vector.xy(i * u, j1 * u))
    end
    for j = j0, j1 do
        gp:moveTo(Vector.xy(i0 * u, j * u))
        gp:lineTo(Vector.xy(i1 * u, j * u))
    end
    r:drawPath(gp, kit.stroke(kit.alpha(SHEET_GRID, 0.6), 1.6))
    r:restore()
    local h = y1 - y0
    for _, f in { 0.14, 0.52 } do
        local sx = x0 + (x1 - x0) * f
        r:drawPath(kit.poly({ Vector.xy(sx, y1), Vector.xy(sx + 22, y1), Vector.xy(sx + 22 + h * 0.6, y0), Vector.xy(sx + h * 0.6, y0) }), kit.fill(kit.alpha(kit.SURFACE, 0.3)))
    end
    r:restore()
    if s.edge == 1 then
        r:drawPath(qp, kit.stroke(kit.GOLD, 5))
    elseif s.edge == 2 then
        r:drawPath(qp, kit.stroke(kit.RED, 5))
    elseif s.frame then
        r:drawPath(qp, kit.stroke(OUT, 8.5))
        r:drawPath(qp, kit.stroke(WOOD, 4.5))
    else
        r:drawPath(qp, kit.stroke(SHEET_EDGE, 2.5))
    end
    r:restore()
end

-- Dolkar's plumb line: a stone on a string, hanging from top. theta is the swing from straight down (+ toward +x).
local STONE_DROP = 22 -- from the string's end to the bottom of the stone

local function plumbLine(r: Renderer, top: Vector, theta: number, len: number, nail: boolean)
    local ex, ey = top.x + math.sin(theta) * len, top.y + math.cos(theta) * len
    r:drawPath(kit.line(top.x, top.y, ex, ey), kit.stroke(STRING, 2.2))
    if nail then
        r:drawPath(kit.circle(top.x, top.y, 4.5), kit.fill(OUT))
    end
    r:save()
    r:transform(Mat2D.withTranslation(ex, ey) * Mat2D.withRotation(-theta))
    r:drawPath(kit.ellipse(3, 14, 9, 10), kit.soft(kit.alpha(kit.INK, 0.25), 4))
    local st = Path.new()
    st:moveTo(Vector.xy(0, 0))
    st:cubicTo(Vector.xy(8, 0), Vector.xy(10, 10), Vector.xy(8, 15))
    st:cubicTo(Vector.xy(6, 21), Vector.xy(-6, 21), Vector.xy(-8, 15))
    st:cubicTo(Vector.xy(-10, 10), Vector.xy(-8, 0), Vector.xy(0, 0))
    st:close()
    outlined(r, st, STONE, 2.2)
    r:drawPath(kit.ellipse(-3, 8, 2.6, 4), kit.fill(kit.alpha(kit.SURFACE, 0.45)))
    r:drawPath(kit.line(-4, 2.5, 4, 2.5), kit.stroke(STRING, 2.4))
    r:restore()
end

-- where a standing person's right hand is, from the rig in people.luau (shoulder, elbow, hand, and the lean)
local function rightHand(p: Person): Vector
    local a, b = p.armR, p.bendR
    local ex, ey = 22 + math.sin(a) * 23, -84 + math.cos(a) * 23
    local hx, hy = ex + math.sin(a + b) * 21, ey + math.cos(a + b) * 21
    local lean = p.lean * 0.07 * (if p.px >= 0 then 1 else -1)
    local cs, sn = math.cos(lean), math.sin(lean)
    local rx, ry = hx * cs - (hy + 40) * sn, hx * sn + (hy + 40) * cs - 40
    return Vector.xy(p.x + rx * p.s, p.y - p.hop + ry * p.s)
end

-- a pill note with a green edge (gold is kept for things that move)
local function note(r: Renderer, f: kit.Fonts, s: string, x: number, y: number, k: number)
    if k <= 0.01 then
        return
    end
    local w = kit.width(f, s, f.body, 20) + 32
    local sc = kit.back(k)
    r:save()
    r:transform(Mat2D.withTranslation(x, y) * Mat2D.withScale(sc, sc))
    r:modulateOpacity(kit.clamp(k * 2, 0, 1))
    r:drawPath(kit.rrect(-w / 2 + 2, -17, w, 38, 19), kit.soft(kit.alpha(kit.INK, 0.16), 6))
    r:drawPath(kit.rrect(-w / 2, -19, w, 38, 19), kit.fill(kit.SURFACE))
    r:drawPath(kit.rrect(-w / 2, -19, w, 38, 19), kit.stroke(kit.ACCENT, 2.5))
    kit.label(r, f, s, f.body, 20, kit.ACCENT_DEEP, 0, 0, 0.5)
    r:restore()
end

-- The lesson -------------------------------------------------------------------------------

type St = {
    phase: string, -- 'tap' · 'appear' · 'fit' · 'fly' · 'snapped'
    phaseAt: number,
    tx: number, -- copy translation (px)
    ty: number,
    rot: number, -- copy turn (radians)
    rotTarget: number,
    spinning: boolean,
    spinA: number, -- pointer angle last frame
    dragging: boolean,
    grabX: number,
    grabY: number,
    held: number,
    flyFrom: Vector,
    misses: number,
    lastCount: number,
    -- step 2
    apex: number,
    apexTarget: number,
    ghosts: { number },
    ghostT: number,
    moved: boolean,
    outside: boolean,
    outsideAt: number,
    -- step 3
    picked: string,
    pickedAt: number,
    wrong: string,
    wrongAt: number,
    hoverLine: string,
    plumbOn: boolean, -- hanging from the top corner (otherwise Dolkar holds it)
    plen: kit.Spring, -- string length (px)
    th: number, -- swing (radians from straight down)
    om: number,
    calm: boolean, -- the right line is found: it settles
    -- step 4
    kp: Keypad,
    solvedAt: number,
    wrongKeyAt: number,
    -- the people
    greeted: boolean,
    greetAt: number,
}

-- step 1
local U = 52
local FX, FY = 290, 232
local T = { Vector.xy(0, 4), Vector.xy(6, 4), Vector.xy(2, 0) }
local PIVOT = Vector.xy(3, 2)
local KNOB = Vector.xy(4.3, 3.05)
local STAGE = 7.6 * U
local TARGET = 2 * U
-- step 2
local U2, F2X, F2Y = 50, 340, 250
-- steps 3 and 4: an end wall with base 10, height 4, a sloping beam of 5
local U3, F3X, F3Y = 44, 220, 262
local PLEN = 4 * U3 - STONE_DROP

-- where Tenzin and Dolkar stand in each step
local HOME: { { number } } = {
    { 150, 1085 },
    { 1010, 1150 },
    { 770, 920 },
    { 730, 150 },
}

-- Tenzin walks on from the left, Dolkar from the right, where her building things are
local tenzin = people.new(people.CAST.tenzin, -90)
local dolkar = people.new(people.CAST.dolkar, 1340)

local S: St = {
    phase = 'tap', phaseAt = 0, tx = 0, ty = 0, rot = 0, rotTarget = 0, spinning = false, spinA = 0, dragging = false,
    grabX = 0, grabY = 0, held = 0, flyFrom = Vector.xy(0, 0), misses = 0, lastCount = 0,
    apex = 2, apexTarget = 2, ghosts = {}, ghostT = 0, moved = false, outside = false, outsideAt = -1,
    picked = '', pickedAt = -1, wrong = '', wrongAt = -9, hoverLine = '',
    plumbOn = false, plen = { x = 0, v = 0 }, th = 0, om = 0, calm = false,
    kp = kit.keypad(860, 172), solvedAt = -1, wrongKeyAt = -9,
    greeted = false, greetAt = -1,
}

local function px(P: { Vector }, ox: number, oy: number, u: number): { Vector }
    return kit.toPx(P, ox, oy, u)
end

-- the copy's corners right now (px)
local function copyShape(): { Vector }
    local P = kit.rotate(T, PIVOT, S.rot)
    return px(P, FX + S.tx, FY + S.ty, U)
end

local function knobPos(): Vector
    local k = kit.rotate({ KNOB }, PIVOT, S.rot)[1]
    return Vector.xy(FX + S.tx + k.x * U, FY + S.ty + k.y * U)
end

local function pivotPos(): Vector
    return Vector.xy(FX + S.tx + PIVOT.x * U, FY + S.ty + PIVOT.y * U)
end

local function rightWay(): boolean
    local r = S.rotTarget % (2 * math.pi)
    return math.abs(r - math.pi) < 0.05
end

local function segDist(p: Vector, a: Vector, b: Vector): number
    local dx, dy = b.x - a.x, b.y - a.y
    local len2 = dx * dx + dy * dy
    local t = if len2 > 0 then kit.clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / len2, 0, 1) else 0
    return kit.dist(p, Vector.xy(a.x + dx * t, a.y + dy * t))
end

local function q3(x: number, y: number): Vector
    return Vector.xy(F3X + x * U3, F3Y + y * U3)
end

-- step 3: the lines of the wall (px)
local function lines3(): { [string]: { Vector } }
    return {
        slant = { q3(0, 4), q3(3, 0) }, -- the sloping roof beam, 5 m
        drop = { q3(3, 0), q3(3, 4) }, -- straight down from the top corner
        right = { q3(10, 4), q3(3, 0) }, -- the long sloping side
        base = { q3(0, 4), q3(10, 4) },
    }
end

-- what each line is, for the evidence
local LINE_NAME: { [string]: string } = {
    slant = 'sloping beam 5 m',
    drop = 'height 4 m',
    right = 'long sloping side',
    base = 'base 10 m',
}

local function lineAt(p: Vector): string
    local best, bestD = '', 20
    for k, ab in lines3() do
        local d = segDist(p, ab[1], ab[2])
        if d < bestD then
            best, bestD = k, d
        end
    end
    return best
end

-- protocol -------------------------------------------------------------------------------

L.id = 'triangle'
L.tag = 'TRIANGLE'
L.title = 'Triangles and the real height'
L.blurb = "Tenzin's greenhouse wall in Leh."
L.steps = {
    { title = 'Two end walls, one shape', line = 'l4s1', task = 'Make a parallelogram from two walls' },
    { title = 'Slide the top corner', line = 'l4s2', task = 'Drag the top corner past the end of the base' },
    { title = 'Find the real height', line = 'l4s3', task = 'Tap the real height' },
    { title = 'Your turn', line = 'l4s4', task = 'Work out the sheet on the keypad' },
}

function L.enter(g: G, step: number)
    S.phase, S.phaseAt, S.tx, S.ty, S.rot, S.rotTarget = 'tap', g.t, 0, 0, 0, 0
    S.spinning, S.dragging, S.held, S.misses, S.lastCount = false, false, 0, 0, 0
    S.apex, S.apexTarget, S.ghosts, S.ghostT, S.moved, S.outside, S.outsideAt = 2, 2, {}, 0, false, false, -1
    S.picked, S.pickedAt, S.wrong, S.wrongAt, S.hoverLine = '', -1, '', -9, ''
    S.plumbOn, S.plen, S.th, S.om, S.calm = false, { x = 0, v = 0 }, 0, 0, false
    S.kp = kit.keypad(860, 172)
    S.solvedAt, S.wrongKeyAt = -1, -9
    -- Tenzin and Dolkar walk on in step 1; after that they walk to where each step needs them
    local home = HOME[step]
    for i, p in { tenzin, dolkar } do
        p.y = FEET
        people.hush(p)
        if (p.x < -40 or p.x > 1320) and step > 1 then
            p.x = home[i]
        end
        p.tx = home[i]
        p.mood = 'idle'
    end
end

local function snapNow(g: G)
    S.phase = 'snapped'
    S.phaseAt = g.t
    S.tx, S.ty = TARGET, 0
    S.rot, S.rotTarget = math.pi, math.pi
    g.sfx('snap')
    g.sfx('sparkle')
    g.shake(3)
    g.done()
    g.say('l4s1done')
end

-- how Tenzin and Dolkar react to what is happening on the board
local function feel(g: G)
    local tz, dk = tenzin, dolkar
    local mt, md = 'watch', 'watch'
    local lx, ly = FX + 4 * U, FY + 2 * U
    if g.step == 1 then
        if S.phase ~= 'tap' then
            lx, ly = FX + S.tx + 3 * U, FY + S.ty + 2 * U
        end
        if S.greetAt >= 0 and g.t - S.greetAt < 2.8 and S.phase == 'tap' then
            mt = 'wave'
            people.speak(tz, 'Juley!')
        else
            people.hush(tz)
        end
        if S.phase == 'snapped' then
            local a = g.t - S.phaseAt
            if a < 2.6 then
                mt = 'cheer'
            end
            if a > 1.4 and a < 6.4 then
                people.speak(dk, 'One strip, one cut:', 'both end walls!')
            else
                people.hush(dk)
            end
        else
            people.hush(dk)
            if S.phase == 'tap' and g.age < 1.6 then
                md = 'idle'
            end
        end
    elseif g.step == 2 then
        lx, ly = F2X + S.apex * U2, F2Y + 2 * U2
        if S.outside and g.t - S.outsideAt < 4 then
            mt = if g.t - S.outsideAt < 2.4 then 'cheer' else 'watch'
            people.speak(tz, 'No extra sheet!')
        elseif not S.moved and g.age > 1 and g.age < 7 then
            mt = 'think'
            people.speak(tz, 'A lopsided wall:', 'more sheet?')
        else
            people.hush(tz)
        end
        people.hush(dk)
    elseif g.step == 3 then
        lx, ly = F3X + 3 * U3, F3Y + 2 * U3
        if S.picked == 'drop' then
            local a = g.t - S.pickedAt
            mt = if a < 2.6 then 'cheer' else 'watch'
            md = if a < 1.2 then 'watch' elseif a < 3.6 then 'cheer' else 'watch'
            if a > 1 and a < 6 then
                people.speak(dk, 'Straight down,', 'every time.')
            else
                people.hush(dk)
            end
        else
            mt = if S.wrong ~= '' and g.t - S.wrongAt < 1.6 then 'puzzled' else 'think'
            md = if S.plumbOn then 'watch' else 'point'
            if not S.plumbOn and g.age > 1 and g.age < 5.5 then
                people.speak(dk, 'Watch my', 'plumb line.')
            else
                people.hush(dk)
            end
        end
        people.hush(tz)
    else
        lx, ly = F3X + 5 * U3, F3Y + 2 * U3
        if S.solvedAt >= 0 then
            local a = g.t - S.solvedAt
            mt = if a < 6 then 'cheer' else 'watch'
            md = if a > 0.6 and a < 4 then 'cheer' else 'watch'
            if a > 0.4 and a < 6 then
                people.speak(tz, "Let's cut it!")
            else
                people.hush(tz)
            end
        else
            mt = if g.age < 1.2 then 'idle' elseif g.t - S.wrongKeyAt < 2 then 'puzzled' else 'think'
            if g.age > 1.4 and g.age < 8 then
                people.speak(tz, 'How much sheet', 'for this wall?')
            else
                people.hush(tz)
            end
        end
        people.hush(dk)
    end
    tz.mood, dk.mood = mt, md
    tz.lookX, tz.lookY = lx, ly
    dk.lookX, dk.lookY = lx, ly
end

function L.advance(g: G, dt: number)
    S.held = kit.follow(S.held, if S.dragging or S.spinning then 1 else 0, 18, dt)
    if g.step == 1 then
        local age = g.t - S.phaseAt
        if S.phase == 'appear' then
            local k = kit.smooth(age / 0.95)
            S.tx = STAGE * k
            S.ty = -math.sin(k * math.pi) * 40
            if age >= 1 then
                S.tx, S.ty = STAGE, 0
                S.phase = 'fit'
                S.phaseAt = g.t
                g.sfx('thud')
                g.sayNext('l4spin')
            end
        elseif S.phase == 'fit' then
            if not S.spinning then
                S.rot = kit.follow(S.rot, S.rotTarget, 16, dt)
            end
        elseif S.phase == 'fly' then
            local k = kit.ease(age / 0.22)
            S.tx = kit.lerp(S.flyFrom.x, TARGET, k)
            S.ty = kit.lerp(S.flyFrom.y, 0, k)
            S.rot = kit.follow(S.rot, math.pi, 30, dt)
            if age >= 0.22 then
                snapNow(g)
            end
        elseif S.phase == 'snapped' then
            -- the sign: 24 once measured, then down to 12 as the copy lifts away
            local n = 0
            if age > 2.6 and age < 4.6 then
                n = 24
            elseif age >= 4.6 then
                n = 24 - kit.clamp(math.floor((age - 4.8) / 0.08), 0, 12)
            end
            if n ~= S.lastCount and n > 0 then
                if S.lastCount > 0 and n < S.lastCount then
                    g.tick(24 - n)
                elseif n == 24 then
                    g.sfx('chime')
                end
                if n == 12 and S.lastCount ~= 12 then
                    g.sfx('chime')
                end
                S.lastCount = n
            end
        end
        -- Tenzin says hello once, when she first arrives
        if not S.greeted and math.abs(tenzin.x - tenzin.tx) < 2 then
            S.greeted = true
            S.greetAt = g.t
        end
    elseif g.step == 2 then
        S.apex = kit.follow(S.apex, S.apexTarget, 18, dt)
        S.ghostT += dt
        if S.ghostT > 0.12 and S.dragging then
            S.ghostT = 0
            table.insert(S.ghosts, S.apex)
            if #S.ghosts > 7 then
                table.remove(S.ghosts, 1)
            end
        end
    elseif g.step == 3 then
        if S.plumbOn then
            kit.spring(S.plen, PLEN, 240, 10, dt)
            -- a pendulum: it swings, slows, and comes to rest straight down
            local damp = if S.calm then 7 else 0.9
            local n = math.max(1, math.ceil(dt / 0.008))
            local h = dt / n
            for _ = 1, n do
                S.om += (-14 * math.sin(S.th) - damp * S.om) * h
                S.th += S.om * h
            end
        end
    end
    kit.keypadAdvance(S.kp, dt)
    feel(g)
    people.advance(tenzin, dt, g.t)
    people.advance(dolkar, dt, g.t)
end

-- drawing ------------------------------------------------------------------------------

local function scene(g: G, r: Renderer)
    if g.step == 1 then
        leh(r, g.t, { house = 132, poplars = { 1196, 1226 }, pebbles = { Vector.xy(250, 600), Vector.xy(470, 612), Vector.xy(940, 600) } })
        buildingSite(r, 676, 566)
    elseif g.step == 2 then
        leh(r, g.t, { house = nil, poplars = { 1212 }, pebbles = { Vector.xy(120, 600), Vector.xy(250, 616), Vector.xy(70, 560) } })
    elseif g.step == 3 then
        leh(r, g.t, { house = 1112, poplars = { 70, 104 }, pebbles = { Vector.xy(140, 600), Vector.xy(430, 610), Vector.xy(600, 590) } })
    else
        leh(r, g.t, { house = nil, poplars = { 64 }, pebbles = { Vector.xy(260, 610), Vector.xy(420, 600), Vector.xy(580, 614) } })
    end
end

local function drawStep1(g: G, r: Renderer)
    local f = g.fonts
    local age = g.t - S.phaseAt
    local orig = px(T, FX, FY, U)
    local snapped = S.phase == 'snapped'
    local away = if snapped then kit.clamp((age - 4.4) / 1.0, 0, 1) else 0
    -- the slot, once the copy is out
    if S.phase == 'fit' or S.phase == 'fly' then
        local slot = px({ Vector.xy(8, 0), Vector.xy(2, 0), Vector.xy(6, 4) }, FX, FY, U)
        local d = math.sqrt((S.tx - TARGET) ^ 2 + S.ty ^ 2)
        local near = rightWay() and d < 3 * U
        local gk = if near then kit.clamp(1.3 - d / (2.6 * U), 0.2, 1) elseif S.misses >= 2 then 0.45 else 0.0
        if gk > 0 then
            r:drawPath(kit.poly(slot), kit.fill(kit.alpha(kit.GOLD_WASH, 0.6 * gk)))
            r:drawPath(kit.poly(slot), kit.stroke(kit.alpha(kit.GOLD, gk), 3))
        end
    end
    local bob = if S.phase == 'tap' and g.age > 2 then math.sin(g.t * 4) * 3 else 0
    local st = look(U, Vector.xy(FX, FY - bob))
    st.edge = if S.phase == 'tap' then 1 else 0
    sheet(r, kit.offset(orig, 0, -bob), st)
    -- the copy: a fresh sheet for the other end wall
    if S.phase ~= 'tap' then
        local P = copyShape()
        local cst = look(U, pivotPos())
        cst.copy = true
        cst.frame = false
        cst.gridRot = S.rot
        local ga = kit.rotate({ Vector.xy(FX + S.tx, FY + S.ty) }, pivotPos(), S.rot)[1]
        cst.gridAt = Vector.xy(ga.x + away * 3 * U, ga.y - away * 60)
        cst.lift = if S.phase == 'appear' then 0.8 else S.held + away
        cst.edge = if S.phase == 'fit' then 1 else 0
        cst.alpha = 1 - away
        sheet(r, kit.offset(P, away * 3 * U, -away * 60), cst)
        if S.phase == 'fit' then
            local kp = knobPos()
            kit.knob(r, g.t, kp.x, kp.y, 'spin', if S.spinning then 1 else 0, not S.spinning and not S.dragging)
        end
    end
    if snapped then
        if age < 1.2 then
            local a, b = Vector.xy(FX + 6 * U, FY + 4 * U), Vector.xy(FX + 2 * U, FY)
            r:save()
            r:modulateOpacity(kit.clamp(1.2 - age, 0, 1))
            r:drawPath(kit.line(a.x, a.y, b.x, b.y), Paint.with({ style = 'stroke', thickness = 16, color = kit.alpha(kit.GOLD, 0.55), cap = 'round', feather = 5 }))
            r:drawPath(kit.line(a.x, a.y, b.x, b.y), kit.stroke(kit.SURFACE, 4))
            r:restore()
        end
        local para = px({ Vector.xy(0, 4), Vector.xy(6, 4), Vector.xy(8, 0), Vector.xy(2, 0) }, FX, FY, U)
        r:save()
        r:modulateOpacity(1 - away)
        r:drawPath(kit.partialOutline(para, (age - 0.3) / 0.9), kit.stroke(kit.ACCENT, 5))
        r:restore()
        kit.bracket(r, f, Vector.xy(FX, FY + 4 * U + 30), Vector.xy(FX + 6 * U, FY + 4 * U + 30), 0, 1, '6', kit.clamp((age - 1.3) * 1.5, 0, 1), kit.INK)
        local hk = kit.clamp((age - 1.9) * 1.5, 0, 1)
        if hk > 0 then
            local hx = FX + 2 * U
            r:drawPath(kit.dashed(hx, FY, hx, FY + 4 * U * kit.ease(hk), 9, 7), kit.stroke(kit.INK, 3))
            r:drawPath(kit.corner(Vector.xy(hx, FY + 4 * U), 1, 0, 0, -1, 13), kit.stroke(kit.alpha(kit.INK, hk), 2.5))
            kit.halo(r, f, '4', f.display, 24, kit.INK, hx - 14, FY + 2 * U, 1)
        end
        if age > 6 then
            note(r, f, 'half', FX + 2.9 * U, FY + 2.9 * U, kit.clamp((age - 6) * 2, 0, 1))
        end
    end
    -- a hint finger for the tap
    if S.phase == 'tap' and g.age > 5 then
        local k = (g.age % 1.6) / 1.6
        local c = kit.centroid(orig)
        kit.finger(r, c.x, c.y, if k < 0.7 then 1 else (1 - k) / 0.3, k > 0.3 and k < 0.55)
    end
end

local function uiStep1(g: G, r: Renderer)
    local f = g.fonts
    local age = g.t - S.phaseAt
    if S.phase == 'snapped' then
        local away = kit.clamp((age - 4.4) / 1.0, 0, 1)
        local n = if S.lastCount > 0 then tostring(S.lastCount) .. ' squares' else '? squares'
        kit.sign(r, f, if away > 0 then 'ONE END WALL' else 'PARALLELOGRAM', n, 0, 1000, 176)
        if age > 6.6 then
            kit.rule(r, f, 'area = ½ × base × height', '½ × 6 × 4 = 12 squares of sheet', kit.clamp((age - 6.6) * 1.5, 0, 1), 1000, 316)
        end
    else
        kit.sign(r, f, 'SHEET', '? squares', 0, 1000, 176)
    end
end

local function drawStep2(g: G, r: Renderer)
    local f = g.fonts
    local a = S.apex
    -- the ridge line the top corner moves along
    r:drawPath(kit.dashed(F2X - 5 * U2, F2Y, F2X + 10.8 * U2, F2Y, 10, 9, g.t * 20), kit.stroke(kit.alpha(kit.GOLD, 0.9), 3))
    kit.halo(r, f, 'the top corner slides along here', f.body, 15, kit.GOLD_DEEP, F2X - 5 * U2 + 4, F2Y - 26, 0)
    -- base line, carried on when the foot of the height falls outside it
    local footX = F2X + a * U2
    local bx0, bx1 = math.min(F2X, footX), math.max(F2X + 6 * U2, footX)
    r:drawPath(kit.dashed(bx0 - 10, F2Y + 4 * U2, bx1 + 10, F2Y + 4 * U2, 8, 8), kit.stroke(kit.alpha(OUT, 0.6), 2))
    -- ghosts of where it has been
    for i, gx in S.ghosts do
        local P = px({ Vector.xy(0, 4), Vector.xy(6, 4), Vector.xy(gx, 0) }, F2X, F2Y, U2)
        r:drawPath(kit.poly(P), kit.stroke(kit.alpha(SHEET_HI, 0.1 * i), 2.5))
    end
    local P = px({ Vector.xy(0, 4), Vector.xy(6, 4), Vector.xy(a, 0) }, F2X, F2Y, U2)
    sheet(r, P, look(U2, Vector.xy(F2X, F2Y)))
    -- the height: straight down from the top corner
    r:drawPath(kit.dashed(footX, F2Y, footX, F2Y + 4 * U2, 9, 7), kit.stroke(kit.INK, 3))
    local side = if a > 5 then -1 else 1
    r:drawPath(kit.corner(Vector.xy(footX, F2Y + 4 * U2), side, 0, 0, -1, 13), kit.stroke(kit.INK, 2.5))
    kit.halo(r, f, 'height 4', f.body, 18, kit.INK, footX + side * 16, F2Y + 2.3 * U2, if side > 0 then 0 else 1)
    kit.halo(r, f, 'base 6', f.body, 18, kit.INK, F2X + 3 * U2, F2Y + 4 * U2 + 40, 0.5)
    if S.outside then
        note(r, f, 'the height can fall outside!', kit.clamp(footX, 190, 830), F2Y + 4 * U2 + 86, kit.clamp((g.t - S.outsideAt) * 2, 0, 1))
    end
    kit.knob(r, g.t, F2X + a * U2, F2Y, 'slide', S.held, not S.dragging and #S.ghosts == 0)
end

local function uiStep2(g: G, r: Renderer)
    local f = g.fonts
    local a = S.apex
    -- the readout never changes
    local la = math.sqrt(a * a + 16)
    local lb = math.sqrt((6 - a) ^ 2 + 16)
    r:drawPath(kit.rrect(903, 182, 300, 170, 22), kit.soft(kit.alpha(kit.INK, 0.16), 14))
    r:drawPath(kit.rrect(900, 176, 300, 170, 22), kit.fill(kit.ACCENT_WASH))
    kit.label(r, f, 'SHEET', f.mono, 12, kit.INK_SOFT, 924, 202, 0)
    kit.label(r, f, '½ × 6 × 4 = 12', f.display, 32, kit.ACCENT_DEEP, 924, 244, 0)
    kit.label(r, f, 'left slope   ' .. string.format('%.1f', la), f.mono, 15, kit.ORANGE, 924, 292, 0)
    kit.label(r, f, 'right slope  ' .. string.format('%.1f', lb), f.mono, 15, kit.ORANGE, 924, 320, 0)
end

-- the wall of steps 3 and 4: its sheet, the dashed straight-down line, the sizes
local function drawWall3(g: G, r: Renderer, found: boolean, solved: number)
    local f = g.fonts
    local P = px({ Vector.xy(0, 4), Vector.xy(10, 4), Vector.xy(3, 0) }, F3X, F3Y, U3)
    sheet(r, P, look(U3, Vector.xy(F3X, F3Y)))
    local d = lines3().drop
    if found then
        local k = if solved >= 0 then kit.clamp(solved * 1.5, 0, 1) else 1
        r:drawPath(kit.line(d[1].x, d[1].y, d[2].x, d[2].y), Paint.with({ style = 'stroke', thickness = 7, color = kit.alpha(kit.ACCENT, 0.85 * k), cap = 'round' }))
        r:drawPath(kit.corner(d[2], 1, 0, 0, -1, 22), kit.stroke(kit.ACCENT_DEEP, 3.5))
    else
        r:drawPath(kit.dashed(d[1].x, d[1].y, d[2].x, d[2].y, 9, 7), kit.stroke(kit.INK, 3))
    end
    kit.halo(r, f, '5 m', f.body, 19, kit.ORANGE, F3X + 1.5 * U3 - 22, F3Y + 2 * U3 - 10, 1)
    kit.halo(r, f, '10 m', f.body, 19, kit.INK, F3X + 5 * U3, F3Y + 4 * U3 + 40, 0.5)
    if found then
        kit.halo(r, f, '4 m', f.body, 19, kit.ACCENT_DEEP, d[1].x + 16, F3Y + 2.4 * U3, 0)
    end
end

local function drawStep3(g: G, r: Renderer)
    drawWall3(g, r, S.picked == 'drop', -1)
    if S.picked == '' then
        for k, ab in lines3() do
            local c: Color? = nil
            if S.wrong == k and g.t - S.wrongAt < 0.9 then
                c = kit.RED
            elseif S.hoverLine == k then
                c = kit.GOLD
            end
            if c ~= nil then
                r:drawPath(kit.line(ab[1].x, ab[1].y, ab[2].x, ab[2].y), kit.stroke(c, 7))
            end
        end
        if S.wrong ~= '' and g.t - S.wrongAt > 3 then
            -- after a miss, once the stone has had time to settle, the right line blinks gently
            local d = lines3().drop
            local k = 0.5 + 0.5 * math.sin(g.t * 6)
            r:drawPath(kit.line(d[1].x, d[1].y, d[2].x, d[2].y), kit.stroke(kit.alpha(kit.GOLD, k), 6))
        end
    end
    if S.plumbOn then
        plumbLine(r, q3(3, 0), S.th, math.max(4, S.plen.x), true)
    end
end

local function uiStep3(g: G, r: Renderer)
    local f = g.fonts
    if S.picked == '' then
        kit.halo(r, f, 'Tap a line', f.body, 17, kit.INK_SOFT, 1080, 196, 0.5)
    end
end

local function drawStep4(g: G, r: Renderer)
    local solved = if S.solvedAt >= 0 then g.t - S.solvedAt else -1
    drawWall3(g, r, true, -1)
    -- the plumb line still hangs where it found the height
    plumbLine(r, q3(3, 0), 0, PLEN, true)
    if solved >= 0 then
        local k = kit.clamp(solved * 1.5, 0, 1)
        local a, b = q3(0, 4), q3(10, 4)
        r:drawPath(kit.line(a.x, a.y, b.x, b.y), Paint.with({ style = 'stroke', thickness = 9, color = kit.alpha(kit.ACCENT, k), cap = 'round' }))
    end
end

local function uiStep4(g: G, r: Renderer)
    local f = g.fonts
    if S.solvedAt >= 0 then
        kit.rule(r, f, 'area = ½ × base × height', '½ × 10 × 4 = 20 square metres', kit.clamp((g.t - S.solvedAt) * 1.5, 0, 1), 440, 506)
    end
    kit.keypadDraw(r, f, S.kp, 'Sheet in square metres', 'sq m', g.t)
end

local function drawPeople(g: G, r: Renderer)
    -- whoever stands further back is drawn first
    people.draw(r, g.fonts, dolkar, g.t)
    people.draw(r, g.fonts, tenzin, g.t)
    -- in step 3, until the plumb line goes up, Dolkar holds it out
    if g.step == 3 and not S.plumbOn then
        local h = rightHand(dolkar)
        plumbLine(r, h, math.sin(g.t * 2.4) * 0.1, 40, false)
    end
end

function L.draw(g: G, r: Renderer)
    scene(g, r)
    if g.step == 1 then
        drawStep1(g, r)
    elseif g.step == 2 then
        drawStep2(g, r)
    elseif g.step == 3 then
        drawStep3(g, r)
    else
        drawStep4(g, r)
    end
    drawPeople(g, r)
    if g.step == 1 then
        uiStep1(g, r)
    elseif g.step == 2 then
        uiStep2(g, r)
    elseif g.step == 3 then
        uiStep3(g, r)
    else
        uiStep4(g, r)
    end
end

-- input ----------------------------------------------------------------------------------

local function checkAnswer(g: G)
    local typed = S.kp.value
    local v = tonumber(typed) or -1
    if v == 20 then
        g.report('l4s4', true, typed)
        S.kp.okT = 3
        S.solvedAt = g.t
        g.done()
        g.burst(1000, 300, 40)
        g.say('l4s4done')
    else
        local mix: string? = if v == 40 then 'half' elseif v == 25 or v == 50 then 'slant' else nil
        g.report('l4s4', false, typed, mix)
        S.wrongKeyAt = g.t
        g.sfx('oops')
        kit.keypadWrong(S.kp, 'Not quite. Have another go.')
        g.say(if v == 40 then 'l4n40' elseif v == 25 then 'l4n25' elseif v == 50 then 'l4n50' else 'l4nx')
    end
end

local function goHome(g: G, line: string)
    S.misses += 1
    g.sfx('oops')
    g.shake(4)
    S.tx, S.ty = STAGE, 0
    g.say(line)
    if S.misses >= 2 then
        g.hint('Stuck? Press space and I will do it')
    end
end

-- step 3: a line was tapped
local function pick(g: G, k: string)
    local slanted = k == 'slant' or k == 'right'
    g.report('l4s3', k == 'drop', LINE_NAME[k] or k, if slanted then 'slant' else nil)
    if k == 'drop' then
        S.picked, S.pickedAt = 'drop', g.t
        S.calm = true
        if not S.plumbOn then
            -- the stone drops from the top corner on its string
            S.plumbOn = true
            S.plen = { x = 0, v = 0 }
            S.th, S.om = 0, 0
        end
        g.sfx('snap')
        g.sfx('chime')
        g.done()
        g.say('l4s3done')
    else
        S.wrong, S.wrongAt = k, g.t
        g.sfx('oops')
        if slanted then
            -- hang the stone along the sloping side and let go: it swings, and settles straight down
            local ab = lines3()[k]
            local far = ab[1]
            local top = ab[2]
            S.plumbOn, S.calm = true, false
            S.th = math.atan2(far.x - top.x, far.y - top.y)
            S.om = 0
            S.plen = { x = PLEN, v = 0 }
            g.sfx('whoosh')
            g.say('l4slant')
        else
            g.say('l4base')
        end
    end
end

function L.down(g: G, p: Vector): boolean
    if g.step == 1 then
        if S.phase == 'tap' and kit.inside(px(T, FX, FY, U), p) then
            S.phase = 'appear'
            S.phaseAt = g.t
            g.sfx('pop')
            g.sfx('whoosh')
            return true
        elseif S.phase == 'fit' then
            if kit.dist(p, knobPos()) < 34 then
                S.spinning = true
                local c = pivotPos()
                S.spinA = math.atan2(p.y - c.y, p.x - c.x)
                g.sfx('pickup')
                return true
            elseif kit.inside(copyShape(), p) then
                S.dragging = true
                S.grabX, S.grabY = p.x - S.tx, p.y - S.ty
                g.sfx('pickup')
                return true
            end
        end
    elseif g.step == 2 then
        if kit.dist(p, Vector.xy(F2X + S.apex * U2, F2Y)) < 44 then
            S.dragging = true
            S.moved = true
            g.sfx('pickup')
            return true
        end
    elseif g.step == 3 and S.picked == '' then
        local k = lineAt(p)
        if k ~= '' then
            pick(g, k)
        end
        return k ~= ''
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
    if g.step == 1 and S.spinning then
        local c = pivotPos()
        local a = math.atan2(p.y - c.y, p.x - c.x)
        local da = a - S.spinA
        if da > math.pi then
            da -= 2 * math.pi
        elseif da < -math.pi then
            da += 2 * math.pi
        end
        local before = math.floor(S.rot / (math.pi / 12))
        S.rot += da
        S.spinA = a
        if math.floor(S.rot / (math.pi / 12)) ~= before then
            g.tick(math.floor(S.rot / (math.pi / 12)) % 12)
        end
    elseif g.step == 1 and S.dragging then
        local nx = kit.clamp(p.x - S.grabX, -FX + 10, STAGE + 30)
        local ny = kit.clamp(p.y - S.grabY, -80, 120)
        if rightWay() and math.sqrt((nx - TARGET) ^ 2 + ny ^ 2) < 0.7 * U then
            nx = kit.lerp(nx, TARGET, 0.6)
            ny = kit.lerp(ny, 0, 0.6)
        end
        S.tx = nx
        S.ty = ny
    elseif g.step == 2 and S.dragging then
        local a = kit.clamp((p.x - F2X) / U2, -4.5, 10.3)
        if math.floor(a) ~= math.floor(S.apexTarget) then
            g.tick(math.floor(a) + 5)
        end
        S.apexTarget = a
    elseif g.step == 3 then
        S.hoverLine = lineAt(p)
    end
end

function L.up(g: G, p: Vector)
    if g.step == 1 and S.spinning then
        S.spinning = false
        local q = math.pi / 2
        S.rotTarget = math.floor(S.rot / q + 0.5) * q
        g.sfx('snap')
        if rightWay() then
            g.sfx('sparkle')
            if math.sqrt((S.tx - TARGET) ^ 2 + S.ty ^ 2) < 0.6 * U then
                S.phase = 'fly'
                S.phaseAt = g.t
                S.flyFrom = Vector.xy(S.tx, S.ty)
            end
        end
    elseif g.step == 1 and S.dragging then
        S.dragging = false
        local d = math.sqrt((S.tx - TARGET) ^ 2 + S.ty ^ 2)
        if d < 1.5 * U then
            if rightWay() then
                S.phase = 'fly'
                S.phaseAt = g.t
                S.flyFrom = Vector.xy(S.tx, S.ty)
            else
                goHome(g, 'l4wrongway')
            end
        elseif math.abs(S.tx - STAGE) > 24 or math.abs(S.ty) > 24 then
            goHome(g, if rightWay() then 'l4notthere' else 'l4wrongway')
        end
    elseif g.step == 2 and S.dragging then
        S.dragging = false
        g.sfx('drop')
        if (S.apexTarget < -0.6 or S.apexTarget > 6.6) and not S.outside then
            S.outside = true
            S.outsideAt = g.t
            g.done()
            g.sfx('sparkle')
            g.say('l4s2done')
        end
    end
end

function L.key(g: G, k: number): boolean
    if g.step == 1 and k == 32 then
        if S.phase == 'tap' then
            S.phase = 'appear'
            S.phaseAt = g.t
            g.sfx('whoosh')
        elseif S.phase == 'fit' then
            S.rotTarget = math.pi
            S.phase = 'fly'
            S.phaseAt = g.t
            S.flyFrom = Vector.xy(S.tx, S.ty)
        end
        return true
    elseif g.step == 1 and S.phase == 'fit' and k == 82 then -- R turns the copy a quarter
        S.rotTarget += math.pi / 2
        g.sfx('snap')
        return true
    elseif g.step == 2 and (k == 262 or k == 263) then
        S.dragging = true
        S.moved = true
        S.apexTarget = kit.clamp(S.apexTarget + (if k == 262 then 1 else -1), -4.5, 10.3)
        S.ghostT = 1
        L.up(g, Vector.xy(0, 0))
        return true
    elseif g.step == 3 and k == 32 and S.picked == '' then
        pick(g, 'drop')
        return true
    elseif g.step == 4 and S.solvedAt < 0 then
        -- the number pad's digits type too
        local res = kit.keypadKey(S.kp, if k >= 320 and k <= 329 then k - 272 else k)
        if res == 'ok' then
            checkAnswer(g)
            return true
        end
        return res ~= ''
    end
    return false
end

-- the home card: Tenzin under the Leh sky, beside her greenhouse wall as the second sheet spins in
local thumbTenzin = people.new(people.CAST.tenzin, 0)

function L.thumb(g: G, r: Renderer, x: number, y: number, w: number, h: number)
    local sky = Gradient.linear(Vector.xy(0, y), Vector.xy(0, y + h * 0.7), {
        { position = 0, color = SKY_HI },
        { position = 1, color = SKY_LO },
    })
    r:drawPath(kit.rect(x, y, w, h), Paint.with({ gradient = sky }))
    local gy = y + h - 22
    local m = kit.poly({ Vector.xy(x, gy), Vector.xy(x, y + 58), Vector.xy(x + 40, y + 34), Vector.xy(x + 92, y + 64), Vector.xy(x + 150, y + 22),
        Vector.xy(x + 214, y + 60), Vector.xy(x + w, y + 40), Vector.xy(x + w, gy) })
    r:drawPath(m, kit.fill(ROCK_FAR))
    r:save()
    r:clipPath(m)
    r:drawPath(kit.poly({ Vector.xy(x + 110, y + 14), Vector.xy(x + 190, y + 14), Vector.xy(x + 178, y + 40), Vector.xy(x + 150, y + 34), Vector.xy(x + 126, y + 44) }), kit.fill(SNOW))
    r:drawPath(kit.poly({ Vector.xy(x + 16, y + 26), Vector.xy(x + 64, y + 26), Vector.xy(x + 56, y + 46), Vector.xy(x + 40, y + 42), Vector.xy(x + 24, y + 48) }), kit.fill(SNOW))
    r:restore()
    r:drawPath(m, kit.stroke(kit.alpha(OUT, 0.45), 1.6))
    r:drawPath(kit.rect(x, gy, w, 22), kit.fill(EARTH))
    poplar(r, x + w - 18, gy + 4, 70, g.t)
    -- the wall, and its copy turning in
    local u = 13
    local ox, oy = x + 112, gy - 4 * u - 2
    local k = kit.smooth(((g.t * 0.35) % 1) * 1.5)
    local st = look(u, Vector.xy(ox, oy))
    sheet(r, kit.toPx(T, ox, oy, u), st)
    local C = kit.rotate(T, PIVOT, math.pi * k)
    local cst = look(u, Vector.xy(ox, oy))
    cst.copy, cst.frame = true, false
    cst.edge = if k < 0.99 then 1 else 0
    cst.lift = 0.3 * (1 - k)
    sheet(r, kit.toPx(C, ox + (1 - k) * 5 * u + k * 2 * u, oy - math.sin(k * math.pi) * 8, u), cst)
    -- Tenzin, waving
    local p = thumbTenzin
    p.s, p.x, p.y, p.tx, p.mood = 0.42, x + 46, gy + 12, x + 46, 'wave'
    people.advance(p, 1 / 60, g.t)
    people.draw(r, g.fonts, p, g.t)
end

return L
