-- Lesson 2 · Reading a line graph, change between two points, where it rises fastest
--   (syllabus skills GR_LINE_GRAPH_READ, GR_CHANGE, GR_STEEPEST)
-- A day in Pune: 6 am 18 °C, 9 am 22 °C, 12 noon 28 °C, 3 pm 26 °C. The line graph stands up as a ridge on the
-- graph's sheet, under a sky that follows the time of day, and a hiker stands on it.
--   1. slide the time along the x-axis: a light goes up to the ridge and across to the temperature; find 12 noon
--   2. which three hours warmed fastest? tap a part of the ridge and the hiker walks it. 12 to 3 pm (the highest
--      part) is the "highest, not steepest" slip.
--   3. your turn: how much warmer at 12 noon than at 6 am? 10; 28 is the "value, not change" slip.

local kit = require('kit')
local lab = require('lab')
local world = require('world')
type G = kit.G
type Cam = world.Cam
type Orbit = world.Orbit
type Keypad = kit.Keypad
type Choice = kit.Choice

type St = {
    x: number, -- the time on the slider, in hours after 6 am (whole hours)
    shown: number, -- where the light is drawn (follows x)
    dragging: boolean,
    held: number,
    touched: boolean,
    reachedAt: number,
    -- step 2
    parts: { Choice },
    part: number, -- the part being walked (0: none)
    partAt: number,
    tried: { [number]: boolean },
    solved: boolean,
    -- step 3
    kp: Keypad,
    solvedAt: number,
    downAt: Vector,
    orbiting: boolean,
}

local TEMPS = { 18, 22, 28, 26 } -- at 0, 3, 6, 9 hours after 6 am
local W, H = 9, 8 -- the sheet: 9 hours across, 10 to 30 °C up
local RIDGE = 0.75 -- how tall the ridge path stands
local HALF = 0.2 -- half its width

local function tempAt(x: number): number
    local i = kit.clamp(math.floor(x / 3), 0, 2)
    local f = (x - i * 3) / 3
    return kit.lerp(TEMPS[i + 1], TEMPS[i + 2], f)
end

local function yOf(temp: number): number
    return (temp - 10) / 2.5
end

local function timeName(x: number): string
    local h = 6 + math.floor(x + 0.5)
    if h < 12 then
        return h .. ' am'
    elseif h == 12 then
        return '12 noon'
    end
    return (h - 12) .. ' pm'
end

-- Where things go
local CX, CY, CU = 372, 404, 42
local SKX, SKY, SKW, SKH = 56, 166, 628, 454 -- the window the day is seen through
local RX, RY, RW = 716, 190, 474
local KX, KY = 810, 172
local WX, WY = 372, 182
local SMALL = 12

local function place()
    if lab.portrait then
        local st, pn = lab.stage, lab.panel
        SKX, SKY, SKW, SKH = st.x, st.y, st.w, st.h
        CX, CY, CU = st.x + st.w / 2 + 8, st.y + st.h / 2 + 16, 27
        RX, RY, RW = pn.x, pn.y, pn.w
        KX, KY = (lab.PW - 286) / 2, 372
        WX, WY = lab.PW / 2, 250
        SMALL = 14
    else
        SKX, SKY, SKW, SKH = 56, 166, 628, 454
        CX, CY, CU = 372, 404, 42
        RX, RY, RW = 716, 190, 474
        KX, KY = 810, 172
        WX, WY = 372, 182
        SMALL = 12
    end
end

local cam: Cam = world.cam(CX, CY, CU, W / 2, H / 2)
local orb: Orbit = world.orbit(0.95, -0.2)

local S: St = {
    x = 0, shown = 0, dragging = false, held = 0, touched = false, reachedAt = -1,
    parts = {}, part = 0, partAt = 0, tried = {}, solved = false,
    kp = kit.keypad(KX, KY), solvedAt = -1, downAt = Vector.xy(0, 0), orbiting = false,
}

local L = {}
local lastHover = Vector.xy(-100, -100)

-- the sky ------------------------------------------------------------------------------------

local function skyColours(x: number): (Color, Color)
    local u = x / W
    local dawnTop, dawnLow = Color.rgb(255, 214, 186), Color.rgb(255, 240, 222)
    local noonTop, noonLow = Color.rgb(150, 205, 245), Color.rgb(226, 242, 252)
    local lateTop, lateLow = Color.rgb(255, 196, 140), Color.rgb(255, 232, 205)
    if u < 0.66 then
        local k = kit.smooth(u / 0.66)
        return kit.mix(dawnTop, noonTop, k), kit.mix(dawnLow, noonLow, k)
    end
    local k = kit.smooth((u - 0.66) / 0.34)
    return kit.mix(noonTop, lateTop, k * 0.8), kit.mix(noonLow, lateLow, k * 0.8)
end

local function drawSky(g: G, r: Renderer)
    local top, low = skyColours(S.shown)
    local gr = Gradient.linear(Vector.xy(0, SKY), Vector.xy(0, SKY + SKH), {
        { position = 0, color = top },
        { position = 1, color = low },
    })
    r:drawPath(kit.rrect(SKX, SKY, SKW, SKH, 22), Paint.with({ gradient = gr }))
    -- the sun climbs and sets with the time
    local u = S.shown / W
    local sx = SKX + 50 + u * (SKW - 100)
    local sy = SKY + SKH * 0.42 - math.sin((0.15 + u * 0.7) * math.pi) * SKH * 0.3
    r:save()
    r:clipPath(kit.rrect(SKX, SKY, SKW, SKH, 22))
    r:drawPath(kit.circle(sx, sy, 46), kit.soft(kit.alpha(Color.rgb(255, 214, 102), 0.55), 26))
    r:drawPath(kit.circle(sx, sy, 24), kit.fill(Color.rgb(255, 205, 80)))
    for i = 0, 7 do
        local a = i / 8 * math.pi * 2 + g.t * 0.3
        r:drawPath(kit.line(sx + math.cos(a) * 32, sy + math.sin(a) * 32, sx + math.cos(a) * 40, sy + math.sin(a) * 40), kit.stroke(Color.rgb(255, 196, 64), 4))
    end
    -- two lazy clouds
    for i = 0, 1 do
        local cx = SKX + ((g.t * (8 + i * 5) + i * 300) % (SKW + 200)) - 100
        local cy = SKY + 46 + i * 34
        r:drawPath(kit.ellipse(cx, cy, 46, 14), kit.fill(kit.alpha(kit.SURFACE, 0.8)))
        r:drawPath(kit.circle(cx - 14, cy - 10, 16), kit.fill(kit.alpha(kit.SURFACE, 0.8)))
        r:drawPath(kit.circle(cx + 12, cy - 13, 20), kit.fill(kit.alpha(kit.SURFACE, 0.8)))
    end
    r:restore()
end

-- the ridge -------------------------------------------------------------------------------------

local function ridgePts(): { { number } }
    local P: { { number } } = { { 0, 0 } }
    for i, tmp in TEMPS do
        table.insert(P, { (i - 1) * 3, yOf(tmp) })
    end
    table.insert(P, { W, 0 })
    return P
end

-- the hiker, standing at a screen point; s is pixels per graph unit, phase swings the legs, lean tips the body
local function hiker(r: Renderer, p: Vector, s: number, phase: number, lean: number)
    local k = s / 60
    local sw = math.sin(phase) * 0.45
    local hip = Vector.xy(p.x, p.y - 26 * k)
    r:drawPath(kit.ellipse(p.x, p.y + 2, 12 * k, 4 * k), kit.fill(kit.alpha(kit.INK, 0.2)))
    r:save()
    r:transform(Mat2D.withTranslation(p.x, p.y) * Mat2D.withRotation(lean) * Mat2D.withTranslation(-p.x, -p.y))
    local legs = kit.stroke(kit.INK, 5 * k)
    r:drawPath(kit.line(hip.x, hip.y, hip.x + math.sin(sw) * 16 * k, p.y), legs)
    r:drawPath(kit.line(hip.x, hip.y, hip.x - math.sin(sw) * 16 * k, p.y), legs)
    -- backpack, body, head
    r:drawPath(kit.rrect(hip.x - 15 * k, hip.y - 30 * k, 11 * k, 20 * k, 4 * k), kit.fill(kit.GOLD))
    r:drawPath(kit.rrect(hip.x - 7 * k, hip.y - 34 * k, 14 * k, 34 * k, 6 * k), kit.fill(kit.ACCENT))
    r:drawPath(kit.circle(hip.x + 1 * k, hip.y - 44 * k, 9 * k), kit.fill(Color.rgb(176, 120, 82)))
    r:drawPath(kit.circle(hip.x + 1 * k, hip.y - 50 * k, 8 * k), kit.fill(kit.INK)) -- hair
    r:drawPath(kit.line(hip.x + 3 * k, hip.y - 26 * k, hip.x + 12 * k, hip.y - 12 * k + math.sin(phase) * 4 * k), kit.stroke(Color.rgb(176, 120, 82), 4 * k))
    r:restore()
end

-- where the hiker is: on the ridge top at x
local function onRidge(x: number): Vector
    return world.pt(cam, x, yOf(tempAt(x)), RIDGE)
end

-- the area under the line, tinted flat on the sheet (so the grid still shows through)
local function drawArea(g: G, r: Renderer)
    local P = ridgePts()
    local flat: { { number } } = {}
    for _, q in P do
        table.insert(flat, { q[1], q[2], 0.01 })
    end
    r:drawPath(kit.poly(world.face(cam, flat)), kit.fill(kit.alpha(kit.GRASS, 0.22)))
    -- step 2: the part being walked glows on the sheet
    local glow = if g.step == 2 and S.part > 0 then S.part else 0
    if glow > 0 then
        local a, b = P[glow + 1], P[glow + 2]
        local band = world.face(cam, { { a[1], 0, 0.02 }, { b[1], 0, 0.02 }, { b[1], b[2], 0.02 }, { a[1], a[2], 0.02 } })
        r:drawPath(kit.poly(band), kit.fill(kit.alpha(if S.solved then kit.GOLD else kit.ACCENT, 0.22)))
    end
end

-- the ridge: the graph's line raised into a path the hiker can walk. Each part is a little wall with a top.
local function drawRidge(g: G, r: Renderer)
    local P = ridgePts()
    type Seg = { a: { number }, b: { number }, i: number, d: number }
    local segs: { Seg } = {}
    for i = 2, #P - 2 do
        local a, b = P[i], P[i + 1]
        table.insert(segs, { a = a, b = b, i = i - 1, d = world.near(cam, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, 0) })
    end
    table.sort(segs, function(u: Seg, v: Seg): boolean
        return u.d < v.d
    end)
    for _, sg in segs do
        local ax, ay, bx, by = sg.a[1], sg.a[2], sg.b[1], sg.b[2]
        local lit = g.step == 2 and S.part == sg.i
        local wall = if lit then kit.mix(kit.GRASS_EDGE, kit.GOLD, if S.solved then 0.6 else 0.3) else kit.GRASS_EDGE
        local front = world.face(cam, { { ax, ay - HALF, 0 }, { bx, by - HALF, 0 }, { bx, by - HALF, RIDGE }, { ax, ay - HALF, RIDGE } })
        r:drawPath(kit.poly(front), kit.fill(wall))
        local topf = world.face(cam, { { ax, ay - HALF, RIDGE }, { bx, by - HALF, RIDGE }, { bx, by + HALF, RIDGE }, { ax, ay + HALF, RIDGE } })
        r:drawPath(kit.poly(topf), kit.fill(if lit then kit.mix(kit.GRASS_HI, kit.GOLD_WASH, 0.6) else kit.GRASS_HI))
        r:drawPath(kit.poly(topf), kit.stroke(kit.mix(kit.GRASS_EDGE, kit.INK, 0.2), 1.2))
    end
    -- the line of the graph runs along the top, with the four readings as posts
    local line: { Vector } = {}
    for i = 2, #P - 1 do
        table.insert(line, world.pt(cam, P[i][1], P[i][2], RIDGE))
    end
    r:drawPath(kit.polyline(line), kit.stroke(kit.ACCENT_DEEP, 4))
    for i = 2, #P - 1 do
        local q = P[i]
        r:drawPath(world.line(cam, q[1], q[2], 0, q[1], q[2], RIDGE), kit.stroke(kit.ACCENT_DEEP, 3))
        local t = world.pt(cam, q[1], q[2], RIDGE)
        r:drawPath(kit.circle(t.x, t.y, 6), kit.fill(kit.SURFACE))
        r:drawPath(kit.circle(t.x, t.y, 6), kit.stroke(kit.ACCENT_DEEP, 3))
    end
end

-- a reading: up from the time to the ridge, across to the temperature axis
local function drawReading(g: G, r: Renderer, x: number, a: number, labelled: boolean)
    if a <= 0 then
        return
    end
    local f = g.fonts
    local y = yOf(tempAt(x))
    r:save()
    r:modulateOpacity(a)
    local ph = -g.t * 24
    r:drawPath(world.line(cam, x, 0, 0.05, x, y, 0.05), kit.stroke(kit.alpha(world.XCOL, 0.25), 10))
    r:drawPath(world.dashed(cam, x, 0, 0.05, x, y, 0.05, 9, 7, ph), kit.stroke(world.XCOL, 3.5))
    r:drawPath(world.line(cam, x, y, 0.05, 0, y, 0.05), kit.stroke(kit.alpha(world.YCOL, 0.25), 10))
    r:drawPath(world.dashed(cam, x, y, 0.05, 0, y, 0.05, 9, 7, ph), kit.stroke(world.YCOL, 3.5))
    if labelled then
        local p = world.pt(cam, -0.45, y, 0.05)
        kit.halo(r, f, kit.num(tempAt(x)) .. ' °C', f.display, 20, world.YCOL, p.x - 12, p.y, 1)
    end
    r:restore()
end

local function drawWorld(g: G, r: Renderer)
    local f = g.fonts
    drawSky(g, r)
    r:save()
    r:clipPath(kit.rrect(SKX, SKY, SKW, SKH, 22))
    world.sheet(r, cam, W, H, 0.6, 1)
    drawArea(g, r)
    world.axes(r, cam, W, H, 0, 0)
    -- the axis is broken below 10 °C: a little zigzag says so
    local zz: { Vector } = {}
    for i = 0, 4 do
        table.insert(zz, world.pt(cam, (if i % 2 == 0 then -0.18 else 0.18), 0.25 + i * 0.12, 0.1))
    end
    r:drawPath(kit.polyline(zz), kit.stroke(kit.SURFACE, 6))
    r:drawPath(kit.polyline(zz), kit.stroke(world.YCOL, 2.5))
    for i = 0, 3 do
        local p = world.pt(cam, i * 3, -0.55, 0)
        kit.label(r, f, timeName(i * 3), f.body, 15, world.XCOL, p.x, p.y, 0.5)
    end
    for v = 10, 30, 5 do
        local p = world.pt(cam, -0.3, yOf(v), 0)
        kit.label(r, f, tostring(v), f.display, 15, world.YCOL, p.x, p.y, 1)
    end
    local xa = world.pt(cam, W + 0.6, -0.4, 0)
    kit.label(r, f, 'time', f.body, 15, world.XCOL, xa.x + 6, xa.y, 0)
    local ya = world.pt(cam, 0, H + 0.7, 0)
    kit.label(r, f, '°C', f.body, 15, world.YCOL, ya.x, ya.y - 6, 0.5)

    -- the reading sits under the ridge, so it is drawn first
    if g.step == 1 then
        drawReading(g, r, S.shown, 1, true)
    elseif g.step == 3 then
        drawReading(g, r, 0, 1, true)
        drawReading(g, r, 6, 1, true)
    end
    drawRidge(g, r)

    -- the hiker
    if g.step == 2 and S.part > 0 then
        local age = g.t - S.partAt
        local k = kit.smooth(age / 2)
        local a, b = (S.part - 1) * 3, S.part * 3
        local x = kit.lerp(a, b, k)
        local slope = (tempAt(b) - tempAt(a)) / 6
        hiker(r, onRidge(x), world.scale(cam, x, 0, RIDGE), age * 9 * (if k < 1 then 1 else 0), -slope * 0.18)
        if age > 1.9 then
            -- the rise for this part, beside the end of the walk
            local d = tempAt(b) - tempAt(a)
            local m = (a + b) / 2
            local p = world.pt(cam, m, yOf(tempAt(m)), RIDGE)
            kit.tag(r, f, (if d > 0 then '+' else '−') .. kit.num(math.abs(d)) .. ' °C in 3 h', p.x, p.y - 74, kit.clamp((age - 1.9) * 3, 0, 1))
        end
    elseif g.step ~= 2 then
        local x = if g.step == 1 then S.shown else 6
        hiker(r, onRidge(x), world.scale(cam, x, 0, RIDGE), 0, 0)
    end
    if g.step == 2 and S.solved then
        -- every part's rise, side by side: the steep one is the fast one
        for i = 1, 3 do
            if i ~= S.part then
                local a, b = (i - 1) * 3, i * 3
                local d = tempAt(b) - tempAt(a)
                local p = world.pt(cam, (a + b) / 2, yOf(tempAt((a + b) / 2)), RIDGE)
                kit.halo(r, f, (if d > 0 then '+' else '−') .. kit.num(math.abs(d)) .. ' °C', f.display, 18, kit.INK_SOFT, p.x, p.y - 34, 0.5)
            end
        end
    end

    if g.step == 3 and S.solvedAt >= 0 then
        local k = kit.ease((g.t - S.solvedAt) / 0.9)
        local y0, y1 = yOf(18), yOf(18) + (yOf(28) - yOf(18)) * k
        local a, b = world.pt(cam, -2.4, y0, 0.3), world.pt(cam, -2.4, y1, 0.3)
        r:drawPath(kit.line(a.x, a.y, b.x, b.y), kit.stroke(kit.GOLD, 7))
        local d = kit.dist(a, b)
        if d > 4 then
            local ux, uy = (b.x - a.x) / d, (b.y - a.y) / d
            r:drawPath(kit.poly({ Vector.xy(b.x + ux * 12, b.y + uy * 12), Vector.xy(b.x - uy * 9, b.y + ux * 9), Vector.xy(b.x + uy * 9, b.y - ux * 9) }), kit.fill(kit.GOLD))
        end
        local m = world.pt(cam, -2.4, (yOf(18) + yOf(28)) / 2, 0.3)
        r:save()
        r:modulateOpacity(k)
        kit.halo(r, f, '+10', f.display, 22, kit.GOLD_DEEP, m.x - 14, m.y, 1)
        r:restore()
    end
    r:restore()
    -- the time slider on the x-axis
    if g.step == 1 then
        local p = world.pt(cam, S.shown, 0, 0.1)
        kit.knob(r, g.t, p.x, p.y, 'slide', S.held, not S.touched)
        if not S.touched and g.age > 3 then
            local k = ((g.age - 3) % 2.6) / 2.6
            local a = if k < 0.1 then k / 0.1 elseif k > 0.8 then (1 - k) / 0.2 else 1
            local q = world.pt(cam, kit.smooth((k - 0.1) / 0.7) * 6, 0, 0.1)
            kit.finger(r, q.x, q.y, a, true)
        end
    end
end

-- the readouts ---------------------------------------------------------------------------------

local function drawPanel(g: G, r: Renderer)
    local f = g.fonts
    local x, y, w = RX, RY, RW
    if g.step == 1 then
        local at = S.reachedAt >= 0
        local h1 = if lab.portrait then 120 else 150
        r:drawPath(kit.rrect(x, y, w, h1, 22), kit.fill(if at then kit.ACCENT_WASH else kit.PAGE))
        r:drawPath(kit.rrect(x, y, w, h1, 22), kit.stroke(if at then kit.ACCENT else kit.LINE, 2))
        kit.label(r, f, 'THE TIME', f.mono, SMALL, kit.INK_SOFT, x + 24, y + 26, 0)
        kit.label(r, f, 'THE TEMPERATURE', f.mono, SMALL, kit.INK_SOFT, x + w / 2 + 8, y + 26, 0)
        local big = if lab.portrait then 38 else 46
        kit.label(r, f, timeName(S.x), f.display, big, world.XCOL, x + 24, y + h1 / 2 + 10, 0)
        kit.label(r, f, kit.num(tempAt(S.x)) .. ' °C', f.display, big, world.YCOL, x + w / 2 + 8, y + h1 / 2 + 10, 0)
        -- a thermometer
        local ty = y + h1 + 30
        local tw = w - 60
        local k = (tempAt(S.shown) - 10) / 20
        r:drawPath(kit.rrect(x + 30, ty, tw, 20, 10), kit.fill(kit.PAGE))
        r:drawPath(kit.rrect(x + 30, ty, math.max(20, tw * k), 20, 10), kit.fill(kit.mix(kit.GOLD, kit.RED, k)))
        r:drawPath(kit.circle(x + 26, ty + 10, 18), kit.fill(kit.mix(kit.GOLD, kit.RED, k)))
        r:drawPath(kit.rrect(x + 30, ty, tw, 20, 10), kit.stroke(kit.LINE, 2))
        kit.label(r, f, '10', f.mono, SMALL, kit.INK_FAINT, x + 34, ty + 38, 0)
        kit.label(r, f, '30 °C', f.mono, SMALL, kit.INK_FAINT, x + 30 + tw, ty + 38, 1)
        if not lab.portrait then
            kit.paragraph(r, f, 'Go up from the time to the line, then across to the temperature axis.', 17, kit.INK_SOFT, x, ty + 70, w)
        end
    elseif g.step == 2 then
        kit.label(r, f, 'WHICH 3 HOURS WARMED FASTEST?', f.mono, SMALL, kit.INK_SOFT, x + w / 2, y + 10, 0.5)
        kit.choicesDraw(r, f, S.parts, lastHover, if S.solved then 2 else -1, g.t)
        if S.solved then
            kit.rule(r, f, '9 am to 12 noon: +6 °C', 'the steepest climb is the fastest change', kit.clamp((g.t - S.partAt - 2) * 1.5, 0, 1), x + w / 2, y + 130)
        elseif not lab.portrait then
            kit.paragraph(r, f, 'Tap a part of the ridge, or a button. The hiker will walk it.', 17, kit.INK_SOFT, x, y + 130, w)
        end
    else
        if S.solvedAt >= 0 then
            kit.rule(r, f, '28 − 18 = 10 °C', 'a change is the difference of two readings', kit.clamp((g.t - S.solvedAt) * 1.5, 0, 1), WX, WY)
        end
        kit.keypadDraw(r, f, S.kp, 'Warmer at 12 noon than at 6 am by', '°C', g.t)
    end
end

-- step 2 ------------------------------------------------------------------------------------------

local function walk(g: G, part: number)
    if S.solved or (S.part > 0 and g.t - S.partAt < 2.2) then
        return
    end
    S.part, S.partAt = part, g.t
    g.sfx('whoosh')
end

local function partNear(p: Vector): number
    local best, bi = 70, 0
    for i = 1, 3 do
        local m = (i - 0.5) * 3
        local d = kit.dist(p, onRidge(m))
        if d < best then
            best, bi = d, i
        end
    end
    return bi
end

-- step 3 ---------------------------------------------------------------------------------------------

local function check(g: G)
    local typed = S.kp.value
    local v = tonumber(typed) or -1
    if v == 10 then
        S.kp.okT = 3
        lab.answer(typed, true, '')
        S.solvedAt = g.t
        g.done()
        g.burst(KX + 143, KY + 130, 40)
        g.say('l2s3done')
    else
        local value = v == 28 or v == 18
        lab.answer(typed, false, if value then 'GAVE_VALUE_NOT_CHANGE' else '')
        g.sfx('oops')
        kit.keypadWrong(S.kp, 'Not quite. Have another go.')
        g.say(if v == 28 then 'l2n28' elseif v == 18 then 'l2n18' else 'l2nx')
    end
end

-- protocol ---------------------------------------------------------------------------------------------

L.id = 'GR_LINE_GRAPH_READ'
lab.upright[L.id] = true
L.tag = 'LINE GRAPHS'
L.title = 'A day you can climb'
L.blurb = 'Read a temperature graph from its 3D ridge.'
L.steps = {
    { title = 'Read the day', line = 'l2s1', task = 'Slide the time to 12 noon and read the temperature' },
    { title = 'Fastest warming', line = 'l2s2', task = 'Find the 3 hours that warmed fastest' },
    { title = 'Your turn', line = 'l2s3', task = 'How much warmer at 12 noon than at 6 am?' },
}

function L.enter(g: G, step: number)
    place()
    cam = world.cam(CX, CY, CU, W / 2, H / 2)
    orb = world.orbit(0.95, -0.2)
    orb.tilt, orb.yaw = 0.3, 0.7
    S.x, S.shown, S.dragging, S.held, S.touched, S.reachedAt = 0, 0, false, 0, false, -1
    local labels = if lab.portrait then { '6–9', '9–12', '12–3' } else { '6 to 9 am', '9 to 12', '12 to 3 pm' }
    S.parts = kit.choices(g.fonts, labels, { 1, 2, 3 }, RX + RW / 2, RY + 34)
    S.part, S.partAt, S.tried, S.solved = 0, 0, {}, false
    S.kp = kit.keypad(KX, KY)
    S.solvedAt = -1
    S.orbiting = false
    if step == 3 then
        S.shown = 6
    end
end

function L.advance(g: G, dt: number)
    S.shown = kit.follow(S.shown, S.x, 14, dt)
    S.held = kit.follow(S.held, if S.dragging then 1 else 0, 18, dt)
    kit.keypadAdvance(S.kp, dt)
    world.orbitAdvance(orb, cam, g.t, dt)
    if lab.portrait then
        world.fit(cam, CU * 0.85, CY - 6, CU, CY)
    else
        world.fit(cam, 34, 392, 42, 400)
    end
    -- step 2: judge a walk once the hiker reaches the end of it
    if g.step == 2 and S.part > 0 and not S.tried[S.part] and g.t - S.partAt > 2 then
        S.tried[S.part] = true
        if S.part == 2 then
            S.solved = true
            lab.answer('9 am to 12 noon', true, '')
            g.done()
            g.sfx('sparkle')
            local p = onRidge(6)
            g.burst(p.x, p.y, 40)
            g.say('l2s2done')
        else
            lab.answer(if S.part == 1 then '6 am to 9 am' else '12 noon to 3 pm', false, if S.part == 3 then 'HIGHEST_AS_STEEPEST' else '')
            g.sfx('oops')
            for _, c in S.parts do
                if c.value == S.part then
                    c.out = true
                end
            end
            g.say(if S.part == 3 then 'l2n15' else 'l2n6')
        end
    end
end

function L.draw(g: G, r: Renderer)
    drawWorld(g, r)
    drawPanel(g, r)
end

local function setX(g: G, x: number)
    local nx = kit.clamp(math.floor(x + 0.5), 0, W)
    if nx == S.x then
        return
    end
    S.x = nx
    S.touched = true
    g.tick(math.min(11, nx))
    if nx == 6 and S.reachedAt < 0 then
        S.reachedAt = g.t
        g.done()
        g.sfx('sparkle')
        local p = onRidge(6)
        g.burst(p.x, p.y, 36)
        g.say('l2s1done')
    end
end

function L.down(g: G, p: Vector): boolean
    lastHover = p
    S.downAt = p
    if g.step == 1 and kit.dist(p, world.pt(cam, S.shown, 0, 0.1)) < 44 then
        S.dragging = true
        g.sfx('pickup')
        return true
    elseif g.step == 2 then
        local c = kit.choiceHit(S.parts, p)
        if c ~= nil then
            walk(g, c.value)
            return true
        end
    elseif g.step == 3 and S.solvedAt < 0 then
        local res = kit.keypadDown(S.kp, p)
        if res == 'ok' then
            check(g)
            return true
        elseif res == 'key' then
            g.sfx('tick3')
            return true
        end
    end
    if kit.inRect(p, SKX, SKY, SKW, SKH) then
        S.orbiting = true
        world.orbitDown(orb, p)
        return true
    end
    return false
end

function L.move(g: G, p: Vector)
    lastHover = p
    if S.dragging then
        setX(g, world.alongX(cam, p, W, 0, 0.1))
    elseif S.orbiting then
        world.orbitMove(orb, p)
    end
end

function L.up(g: G, p: Vector)
    if S.dragging then
        S.dragging = false
        g.sfx('drop')
    elseif S.orbiting then
        S.orbiting = false
        world.orbitUp(orb)
        if kit.dist(p, S.downAt) < 8 then
            if g.step == 2 then
                local i = partNear(p)
                if i > 0 then
                    walk(g, i)
                end
            elseif g.step == 1 then
                -- a tap near the x-axis moves the time there
                local x = world.alongX(cam, p, W, 0, 0.1)
                if kit.dist(p, world.pt(cam, x, 0, 0.1)) < 40 then
                    setX(g, x)
                end
            end
        end
    end
end

function L.key(g: G, k: number): boolean
    if g.step == 1 then
        local d = if k == 262 or k == 265 then 1 elseif k == 263 or k == 264 then -1 else 0
        if d ~= 0 then
            setX(g, S.x + d)
            return true
        end
    elseif g.step == 2 and k >= 49 and k <= 51 then
        walk(g, k - 48)
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
    local save = cam
    local c = world.cam(x + w / 2, y + h / 2 + 6, (h - 10) / 8.5, W / 2, H / 2)
    c.tilt, c.yaw = 0.95, -0.25 + math.sin(g.t * 0.6) * 0.12
    cam = c
    world.sheet(r, c, W, H, 0.4, 3)
    drawArea(g, r)
    drawRidge(g, r)
    local hx = (g.t * 1.5) % W
    local p = onRidge(hx)
    r:drawPath(kit.circle(p.x, p.y - 6, 5), kit.fill(kit.GOLD))
    r:drawPath(kit.circle(p.x, p.y - 6, 5), kit.stroke(kit.SURFACE, 1.5))
    cam = save
end

return L
