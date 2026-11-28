-- Lesson 3 · Distance–time graphs: stopping, speed as steepness, and matching a story to a graph
--   (syllabus skills GR_SHAPE, GR_RATE, GR_LINEAR_READ)
-- The road runs beside the distance axis, so how far along it the rider is IS the height of the graph.
--   1. hold to ride Arjun's scooter, let go to stop; the clock runs and the graph draws itself. A stop is flat.
--      ("flat means moving steadily" is the slip this answers)
--   2. Riya cycles slowly up a hill and fast down it. The road really goes over a hill here. Pick a graph and watch
--      her ride it: the hill-shaped graph sends her back home (the "graph is a picture" slip).
--   3. your turn: a straight line from (0 h, 0 km) to (3 h, 150 km). How far in 1 hour? 50.

local kit = require('kit')
local lab = require('lab')
local world = require('world')
type G = kit.G
type Cam = world.Cam
type Orbit = world.Orbit
type Keypad = kit.Keypad

type Pt = { t: number, d: number }

type St = {
    -- step 1: a ride
    clock: number, -- hours
    dist: number, -- km
    riding: boolean,
    started: boolean,
    ended: boolean,
    trail: { Pt },
    stopFrom: number, -- when the current stop began (-1 while riding)
    longest: number, -- the longest stop so far, in hours
    flatSaid: boolean,
    pedalDown: boolean,
    -- step 2
    pick: number, -- 0 none, 1 slow then fast, 2 hill-shaped, 3 fast then slow
    pickAt: number,
    tried: { [number]: boolean },
    solved: boolean,
    -- step 3
    kp: Keypad,
    solvedAt: number,
    downAt: Vector,
    orbiting: boolean,
}

local W, H = 9, 8 -- 6 hours across (1.5 units an hour), 160 km up (20 km a unit)
local HOURS = 6
local SPEED = 25 -- km/h while the throttle is held
local ROADX = -1.75 -- the road's centre line, beside the distance axis
local ROADW = 0.55 -- half its width

local function gx(hours: number): number
    return hours * W / HOURS
end

local function gy(km: number): number
    return km / 20
end

-- Where things go
local CX, CY, CU = 372, 404, 34
local SKX, SKY, SKW, SKH = 56, 166, 628, 454
local RX, RY, RW = 716, 190, 474
local KX, KY = 810, 172
local WX, WY = 372, 182
local SMALL = 12

local function place()
    if lab.portrait then
        local st, pn = lab.stage, lab.panel
        SKX, SKY, SKW, SKH = st.x, st.y, st.w, st.h
        CX, CY, CU = st.x + st.w / 2, st.y + st.h / 2 + 14, 23
        RX, RY, RW = pn.x, pn.y, pn.w
        KX, KY = (lab.PW - 286) / 2, 372
        WX, WY = lab.PW / 2, 250
        SMALL = 14
    else
        SKX, SKY, SKW, SKH = 56, 166, 628, 454
        CX, CY, CU = 372, 404, 34
        RX, RY, RW = 716, 190, 474
        KX, KY = 810, 172
        WX, WY = 372, 182
        SMALL = 12
    end
end

local cam: Cam = world.cam(CX, CY, CU, W / 2 - 1.4, H / 2)
local orb: Orbit = world.orbit(0.95, -0.2)

local S: St = {
    clock = 0, dist = 0, riding = false, started = false, ended = false, trail = {}, stopFrom = -1, longest = 0,
    flatSaid = false, pedalDown = false,
    pick = 0, pickAt = 0, tried = {}, solved = false,
    kp = kit.keypad(KX, KY), solvedAt = -1, downAt = Vector.xy(0, 0), orbiting = false,
}

local L = {}
local lastHover = Vector.xy(-100, -100)

-- the three stories of step 2, as distance (0..1 of 120 km) against time (0..1 of 6 h)
local STORY_KM = 120
local function story(i: number, u: number): number
    if i == 1 then
        return if u < 0.6 then 0.35 * u / 0.6 else 0.35 + 0.65 * (u - 0.6) / 0.4
    elseif i == 2 then
        return if u < 0.5 then 0.8 * u / 0.5 else 0.8 - 0.8 * (u - 0.5) / 0.5
    end
    return if u < 0.4 then 0.65 * u / 0.4 else 0.65 + 0.35 * (u - 0.4) / 0.6
end

-- step 2's road goes over a hill: its top is where the slow climb ends
local HILL_END = STORY_KM * 0.7
local function roadZ(g: G, km: number): number
    if g.step ~= 2 or km <= 0 or km >= HILL_END then
        return 0
    end
    return 1.5 * math.sin(math.pi * km / HILL_END)
end

-- the road --------------------------------------------------------------------------------------

local function drawRoad(g: G, r: Renderer)
    local f = g.fonts
    local x0, x1 = ROADX - ROADW, ROADX + ROADW
    local top = H + 0.3
    local n = 40
    -- far to near: the road runs away from us as y grows, so draw from the top end down
    for i = n - 1, 0, -1 do
        local ya, yb = top * i / n, top * (i + 1) / n
        local za, zb = roadZ(g, ya * 20), roadZ(g, yb * 20)
        -- the near side of the road: a wall down to the ground
        local side = world.face(cam, { { x1, ya, 0 }, { x1, yb, 0 }, { x1, yb, zb }, { x1, ya, za } })
        r:drawPath(kit.poly(side), kit.fill(Color.rgb(120, 128, 124)))
        local front = world.face(cam, { { x0, ya, -0.2 }, { x1, ya, -0.2 }, { x1, ya, za }, { x0, ya, za } })
        if i == 0 then
            r:drawPath(kit.poly(front), kit.fill(Color.rgb(104, 112, 108)))
        end
        local surf = world.face(cam, { { x0, ya, za }, { x1, ya, za }, { x1, yb, zb }, { x0, yb, zb } })
        local up = zb - za
        r:drawPath(kit.poly(surf), kit.fill(kit.mix(Color.rgb(84, 92, 88), kit.SURFACE, kit.clamp(0.08 + up * 0.8, 0, 0.35))))
        if i % 2 == 0 then
            r:drawPath(world.line(cam, ROADX, ya, za + 0.01, ROADX, yb, zb + 0.01), kit.stroke(Color.rgb(250, 240, 200), 2))
        end
    end
    -- distance posts every 40 km
    for km = 0, 160, 40 do
        local p = world.pt(cam, x0 - 0.15, gy(km), roadZ(g, km) + 0.05)
        kit.label(r, f, km .. ' km', f.mono, 11, kit.INK_SOFT, p.x - 6, p.y, 1)
    end
    -- home at the start
    world.box(r, cam, x0 - 0.1, -1.2, x1 + 0.1, -0.5, 0, 0.7, Color.rgb(240, 200, 150), nil)
    local roof = world.face(cam, { { x0 - 0.2, -1.3, 0.7 }, { x1 + 0.2, -1.3, 0.7 }, { x1 + 0.2, -0.85, 1.1 }, { x0 - 0.2, -0.85, 1.1 } })
    r:drawPath(kit.poly(roof), kit.fill(kit.RED))
    local hp = world.pt(cam, ROADX, -0.85, 1.3)
    kit.label(r, f, 'home', f.body, 13, kit.INK_SOFT, hp.x, hp.y - 6, 0.5)
end

-- a rider seen from above, pointing along the road: scooter (gold) or bicycle (blue)
local function rider(g: G, r: Renderer, km: number, bike: boolean, backwards: boolean)
    local y = gy(km)
    local z = roadZ(g, km) + 0.05
    local p = world.pt(cam, ROADX, y, z)
    local q = world.pt(cam, ROADX, y + (if backwards then -0.3 else 0.3), roadZ(g, km + (if backwards then -6 else 6)) + 0.05)
    local ang = math.atan2(q.y - p.y, q.x - p.x)
    local s = world.scale(cam, ROADX, y, z) / 40
    world.shadow(r, cam, ROADX + 0.08, y - 0.08, 0.3, 0.2)
    r:save()
    r:transform(Mat2D.withTranslation(p.x, p.y) * Mat2D.withRotation(ang) * Mat2D.withScale(s, s))
    local body = if bike then kit.BLUE else kit.GOLD
    -- wheels, body, handlebar, rider's helmet
    r:drawPath(kit.rrect(-24, -4, 12, 8, 4), kit.fill(kit.INK))
    r:drawPath(kit.rrect(12, -4, 12, 8, 4), kit.fill(kit.INK))
    r:drawPath(kit.ellipse(0, 0, 20, 9), kit.fill(body))
    r:drawPath(kit.ellipse(0, 0, 20, 9), kit.stroke(kit.SURFACE, 2))
    r:drawPath(kit.line(12, -13, 12, 13), kit.stroke(kit.INK, 3.5))
    r:drawPath(kit.circle(-2, 0, 9), kit.fill(if bike then kit.ORANGE else kit.ACCENT))
    r:drawPath(kit.circle(-2, 0, 9), kit.stroke(kit.SURFACE, 2))
    r:drawPath(kit.ellipse(1, 0, 4, 6), kit.fill(kit.alpha(kit.SURFACE, 0.5)))
    r:restore()
end

-- the link between the rider on the road and the pen on the graph: the same height
local function link(g: G, r: Renderer, hours: number, km: number)
    local y = gy(km)
    r:drawPath(world.dashed(cam, ROADX + ROADW, y, 0.04, gx(hours), y, 0.04, 7, 6, -g.t * 20), kit.stroke(kit.alpha(world.YCOL, 0.8), 2.5))
    local p = world.pt(cam, gx(hours), y, 0.3)
    r:drawPath(kit.circle(p.x, p.y, 12), kit.soft(kit.alpha(kit.GOLD, 0.5), 8))
    r:drawPath(kit.circle(p.x, p.y, 6.5), kit.fill(kit.GOLD))
    r:drawPath(kit.circle(p.x, p.y, 6.5), kit.stroke(kit.SURFACE, 2))
end

-- a graph drawn as a low wall standing up from the sheet; flat parts in gold
local function wallGraph(r: Renderer, pts: { Pt }, col: Color, markFlat: boolean)
    if #pts < 2 then
        return
    end
    local h = 0.3
    for i = 1, #pts - 1 do
        local a, b = pts[i], pts[i + 1]
        local ax, ay, bx, by = gx(a.t), gy(a.d), gx(b.t), gy(b.d)
        local flat = markFlat and math.abs(b.d - a.d) < 1e-6
        local c = if flat then kit.GOLD else col
        local Q = world.face(cam, { { ax, ay, 0 }, { bx, by, 0 }, { bx, by, h }, { ax, ay, h } })
        r:drawPath(kit.poly(Q), kit.fill(kit.alpha(c, 0.35)))
        r:drawPath(world.line(cam, ax, ay, h, bx, by, h), kit.stroke(c, 4.5))
    end
end

-- the sheet ----------------------------------------------------------------------------------------

local function drawSheet(g: G, r: Renderer)
    local f = g.fonts
    world.sheet(r, cam, W, H, 0.6, 1)
    world.axes(r, cam, W, H, 0, 0)
    for hr = 0, HOURS do
        local p = world.pt(cam, gx(hr), -0.5, 0)
        kit.label(r, f, tostring(hr), f.display, 15, world.XCOL, p.x, p.y, 0.5)
    end
    local xa = world.pt(cam, W + 0.6, -0.4, 0)
    kit.label(r, f, 'time (h)', f.body, 14, world.XCOL, xa.x + 4, xa.y, 0)
    for km = 40, 160, 40 do
        local p = world.pt(cam, -0.3, gy(km), 0)
        kit.label(r, f, tostring(km), f.display, 14, world.YCOL, p.x, p.y, 1)
    end
    local ya = world.pt(cam, 0.2, H + 0.75, 0)
    kit.label(r, f, 'distance (km)', f.body, 14, world.YCOL, ya.x, ya.y - 4, 0)
end

local function drawWindow(g: G, r: Renderer)
    local gr = Gradient.linear(Vector.xy(0, SKY), Vector.xy(0, SKY + SKH), {
        { position = 0, color = Color.rgb(206, 232, 222) },
        { position = 1, color = Color.rgb(240, 248, 244) },
    })
    r:drawPath(kit.rrect(SKX, SKY, SKW, SKH, 22), Paint.with({ gradient = gr }))
end

-- step 1 ------------------------------------------------------------------------------------------------

local function pedal(): (number, number, number, number)
    if lab.portrait then
        return RX + 40, RY + 150, RW - 80, 72
    end
    return RX, RY + 200, RW, 84
end

local function resetRide()
    S.clock, S.dist, S.riding, S.started, S.ended = 0, 0, false, false, false
    S.trail = { { t = 0, d = 0 } }
    S.stopFrom, S.longest = -1, 0
end

local function drawStep1(g: G, r: Renderer)
    local f = g.fonts
    drawWindow(g, r)
    r:save()
    r:clipPath(kit.rrect(SKX, SKY, SKW, SKH, 22))
    drawSheet(g, r)
    drawRoad(g, r)
    wallGraph(r, S.trail, kit.ACCENT_DEEP, true)
    -- the longest stop gets a tag
    if S.longest >= 0.75 then
        local best, bt0, bd = 0, 0, 0
        local i = 1
        while i < #S.trail do
            local j = i
            while j < #S.trail and math.abs(S.trail[j + 1].d - S.trail[i].d) < 1e-6 do
                j += 1
            end
            if S.trail[j].t - S.trail[i].t > best then
                best, bt0, bd = S.trail[j].t - S.trail[i].t, S.trail[i].t, S.trail[i].d
            end
            i = j + 1
        end
        if best > 0 then
            local p = world.pt(cam, gx(bt0 + best / 2), gy(bd), 0.3)
            kit.tag(r, f, 'stopped', p.x, p.y - 26, 1)
        end
    end
    link(g, r, S.clock, S.dist)
    rider(g, r, S.dist, false, false)
    r:restore()

    -- readouts
    local x, y, w = RX, RY, RW
    local h1 = if lab.portrait then 110 else 150
    r:drawPath(kit.rrect(x, y, w, h1, 22), kit.fill(kit.PAGE))
    r:drawPath(kit.rrect(x, y, w, h1, 22), kit.stroke(kit.LINE, 2))
    kit.label(r, f, 'TIME', f.mono, SMALL, kit.INK_SOFT, x + 24, y + 26, 0)
    kit.label(r, f, 'DISTANCE FROM HOME', f.mono, SMALL, kit.INK_SOFT, x + w / 2 + 8, y + 26, 0)
    local big = if lab.portrait then 36 else 46
    kit.label(r, f, string.format('%.1f h', S.clock), f.display, big, world.XCOL, x + 24, y + h1 / 2 + 8, 0)
    kit.label(r, f, kit.num(math.floor(S.dist + 0.5)) .. ' km', f.display, big, world.YCOL, x + w / 2 + 8, y + h1 / 2 + 8, 0)
    local state = if not S.started then 'Ready' elseif S.ended then 'Ride over' elseif S.riding then 'Riding at ' .. SPEED .. ' km/h' else 'Stopped: the clock still runs'
    kit.label(r, f, state, f.body, 16, if S.riding then kit.ACCENT else kit.INK_SOFT, x + 24, y + h1 - 22, 0)
    -- the throttle
    local px, py, pw, ph = pedal()
    local down = S.pedalDown and not S.ended
    local glow = not S.started and math.floor(g.t * 1.5) % 2 == 0
    r:drawPath(kit.rrect(px + 2, py + 6, pw, ph, ph / 2), kit.soft(kit.alpha(kit.INK, 0.18), 8))
    r:drawPath(kit.rrect(px, py + (if down then 3 else 0), pw, ph, ph / 2), kit.fill(if down then kit.ACCENT_DEEP else kit.ACCENT))
    if glow then
        r:drawPath(kit.rrect(px - 5, py - 5, pw + 10, ph + 10, ph / 2 + 5), kit.stroke(kit.alpha(kit.GOLD, 0.8), 3))
    end
    local label = if S.ended then 'Ride again' elseif down then 'Riding… let go to stop' else 'Hold to ride'
    kit.label(r, f, label, f.display, 26, kit.SURFACE, px + pw / 2, py + ph / 2 + (if down then 3 else 0), 0.5)
    if not lab.portrait then
        kit.paragraph(r, f, 'Hold to ride, let go to stop. Make a graph with a stop in it.', 17, kit.INK_SOFT, x, py + ph + 30, w)
    end
end

local function finishRide(g: G)
    S.ended = true
    S.riding = false
    if S.dist < 5 then
        g.say('l3s1still')
    elseif S.longest < 0.75 then
        g.say('l3s1again')
    elseif not g.isDone() then
        g.done()
        g.sfx('fanfare')
        local p = world.pt(cam, gx(HOURS), gy(S.dist), 0.3)
        g.burst(p.x, p.y, 40)
        g.say('l3s1done')
    else
        g.sfx('chime')
    end
end

local function advanceRide(g: G, dt: number)
    if not S.started or S.ended then
        return
    end
    local step = dt * 0.5 -- half an hour of ride each second
    S.clock = math.min(HOURS, S.clock + step)
    if S.riding then
        S.dist = math.min(160, S.dist + SPEED * step)
        S.stopFrom = -1
    else
        if S.stopFrom < 0 then
            S.stopFrom = S.clock - step
        end
        local len = S.clock - S.stopFrom
        if S.dist > 0 and len > S.longest then
            S.longest = len
            if len >= 0.75 and not S.flatSaid then
                S.flatSaid = true
                g.say('l3s1flat')
                g.sfx('chime')
            end
        end
    end
    local last = S.trail[#S.trail]
    if S.clock - last.t >= 0.05 or S.clock >= HOURS then
        table.insert(S.trail, { t = S.clock, d = S.dist })
    end
    if S.clock >= HOURS then
        finishRide(g)
    end
end

-- step 2 ------------------------------------------------------------------------------------------------

local function cardRect(i: number): (number, number, number, number)
    local gap = 14
    local w = (RW - 2 * gap) / 3
    local h = if lab.portrait then 140 else 160
    return RX + (i - 1) * (w + gap), RY + (if lab.portrait then 96 else 110), w, h
end

local function miniGraph(r: Renderer, i: number, x: number, y: number, w: number, h: number, col: Color)
    local ox, oy = x + 16, y + h - 16
    local gw, gh = w - 34, h - 50
    r:drawPath(kit.line(ox, oy, ox + gw, oy), kit.stroke(world.XCOL, 2.5))
    r:drawPath(kit.line(ox, oy, ox, oy - gh), kit.stroke(world.YCOL, 2.5))
    local P: { Vector } = {}
    for k = 0, 20 do
        local u = k / 20
        table.insert(P, Vector.xy(ox + u * gw, oy - story(i, u) * gh))
    end
    r:drawPath(kit.polyline(P), kit.stroke(col, 4))
end

local function drawStep2(g: G, r: Renderer)
    local f = g.fonts
    drawWindow(g, r)
    r:save()
    r:clipPath(kit.rrect(SKX, SKY, SKW, SKH, 22))
    drawSheet(g, r)
    drawRoad(g, r)
    local km = 0
    if S.pick > 0 then
        local u = kit.clamp((g.t - S.pickAt) / 4.5, 0, 1)
        local pts: { Pt } = {}
        for k = 0, math.floor(u * 40) do
            local uu = k / 40
            table.insert(pts, { t = uu * HOURS, d = story(S.pick, uu) * STORY_KM })
        end
        table.insert(pts, { t = u * HOURS, d = story(S.pick, u) * STORY_KM })
        wallGraph(r, pts, if S.pick == 1 then kit.ACCENT_DEEP elseif S.pick == 2 then kit.RED else kit.BLUE, false)
        km = story(S.pick, u) * STORY_KM
        local back = S.pick == 2 and u > 0.5 and u < 1
        link(g, r, u * HOURS, km)
        rider(g, r, km, true, back)
    else
        rider(g, r, 0, true, false)
    end
    -- the hill's top
    local tp = world.pt(cam, ROADX, gy(HILL_END / 2), roadZ(g, HILL_END / 2) + 0.4)
    kit.halo(r, f, 'hill top', f.body, 13, kit.INK_SOFT, tp.x + 44, tp.y - 12, 0)
    r:restore()

    -- the story and the three graphs
    kit.paragraph(r, f, 'Riya cycles slowly up a hill, then fast down the other side. Which graph is hers?', if lab.portrait then 16 else 18, kit.INK, RX, RY, RW)
    for i = 1, 3 do
        local x, y, w, h = cardRect(i)
        local out = S.tried[i] and not (S.solved and i == 1)
        local on = S.pick == i
        local over = kit.inRect(lastHover, x, y, w, h)
        r:save()
        r:modulateOpacity(if out then 0.4 else 1)
        r:drawPath(kit.rrect(x + 2, y + 6, w, h, 18), kit.soft(kit.alpha(kit.INK, 0.14), 8))
        r:drawPath(kit.rrect(x, y - (if over and not out then 3 else 0), w, h, 18), kit.fill(if S.solved and i == 1 then kit.ACCENT_WASH else kit.SURFACE))
        r:drawPath(kit.rrect(x, y - (if over and not out then 3 else 0), w, h, 18), kit.stroke(if S.solved and i == 1 then kit.ACCENT elseif on then kit.GOLD elseif over then kit.GOLD else kit.LINE, if on then 3 else 2))
        miniGraph(r, i, x, y - (if over and not out then 3 else 0), w, h, if i == 1 then kit.ACCENT_DEEP elseif i == 2 then kit.RED else kit.BLUE)
        kit.label(r, f, ({ 'A', 'B', 'C' })[i], f.display, 18, kit.INK_SOFT, x + w - 20, y + 18 - (if over and not out then 3 else 0), 0.5)
        if out then
            r:drawPath(kit.line(x + 14, y + 14, x + w - 14, y + h - 14), kit.stroke(kit.RED, 3))
        end
        r:restore()
    end
    if S.solved and not lab.portrait then
        local _, y, _, h = cardRect(1)
        kit.paragraph(r, f, 'Gentle while she climbs slowly, steep when she races down. It never goes down: she never turns back.', 17, kit.INK_SOFT, RX, y + h + 30, RW)
    end
end

local function choose(g: G, i: number)
    if S.solved or (S.pick > 0 and g.t - S.pickAt < 4.6) then
        return
    end
    S.pick, S.pickAt = i, g.t
    g.sfx('whoosh')
end

-- step 3 ------------------------------------------------------------------------------------------------

local function drawStep3(g: G, r: Renderer)
    local f = g.fonts
    drawWindow(g, r)
    r:save()
    r:clipPath(kit.rrect(SKX, SKY, SKW, SKH, 22))
    drawSheet(g, r)
    drawRoad(g, r)
    -- the car's line, drawing itself again and again
    local u = kit.clamp(((g.age * 0.3) % 1.4), 0, 1)
    local pts: { Pt } = { { t = 0, d = 0 }, { t = 3 * u, d = 150 * u } }
    wallGraph(r, pts, kit.ACCENT_DEEP, false)
    -- the end of the line
    local e = world.pt(cam, gx(3), gy(150), 0.3)
    kit.halo(r, f, '(3 h, 150 km)', f.display, 16, kit.INK, e.x + 12, e.y - 18, 0)
    if S.solvedAt >= 0 then
        -- the staircase: each hour, 50 km more
        local k = g.t - S.solvedAt
        for i = 1, 3 do
            local a = kit.clamp((k - (i - 1) * 0.5) / 0.5, 0, 1)
            if a > 0 then
                local t0, t1 = i - 1, i
                local d0, d1 = (i - 1) * 50, i * 50
                r:drawPath(world.line(cam, gx(t0), gy(d0), 0.32, gx(t0 + a), gy(d0), 0.32), kit.stroke(world.XCOL, 4))
                if a >= 1 then
                    r:drawPath(world.line(cam, gx(t1), gy(d0), 0.32, gx(t1), gy(d1), 0.32), kit.stroke(world.YCOL, 4))
                    local m = world.pt(cam, gx(t1), gy((d0 + d1) / 2), 0.32)
                    kit.halo(r, f, '+50', f.display, 15, world.YCOL, m.x + 8, m.y, 0)
                end
            end
        end
    end
    link(g, r, 3 * u, 150 * u)
    rider(g, r, 150 * u, false, false)
    r:restore()
    if S.solvedAt >= 0 then
        kit.rule(r, f, '150 ÷ 3 = 50 km in each hour', 'speed = distance ÷ time = 50 km/h', kit.clamp((g.t - S.solvedAt) * 1.5, 0, 1), WX, WY)
    end
    kit.keypadDraw(r, f, S.kp, 'Distance in 1 hour', 'km', g.t)
end

local function check(g: G)
    local typed = S.kp.value
    local v = tonumber(typed) or -1
    if v == 50 then
        S.kp.okT = 3
        lab.answer(typed, true, '')
        S.solvedAt = g.t
        g.done()
        g.burst(KX + 143, KY + 130, 40)
        g.say('l3s3done')
    else
        lab.answer(typed, false, '')
        g.sfx('oops')
        kit.keypadWrong(S.kp, 'Not quite. Have another go.')
        g.say(if v == 150 then 'l3n150' elseif v == 450 then 'l3n450' else 'l3nx')
    end
end

-- protocol ----------------------------------------------------------------------------------------------

L.id = 'GR_SHAPE'
lab.upright[L.id] = true
L.tag = 'DISTANCE AND TIME'
L.title = 'Ride the graph'
L.blurb = 'Ride a scooter and watch its graph draw itself.'
L.steps = {
    { title = 'Ride and stop', line = 'l3s1', task = 'Ride, stop for a while, and ride again' },
    { title = 'Which graph?', line = 'l3s2', task = 'Find the graph of Riya’s ride' },
    { title = 'Your turn', line = 'l3s3', task = 'How far does the car go in 1 hour?' },
}

function L.enter(g: G, step: number)
    place()
    cam = world.cam(CX, CY, CU, W / 2 - 1.4, H / 2)
    orb = world.orbit(0.95, -0.2)
    orb.tilt, orb.yaw = 0.35, 0.75
    if step == 2 then
        -- turned further, so the hill on the road is seen from the side
        orb.restYaw, orb.restTilt = -0.55, 0.9
    end
    resetRide()
    S.flatSaid, S.pedalDown = false, false
    S.pick, S.pickAt, S.tried, S.solved = 0, 0, {}, false
    S.kp = kit.keypad(KX, KY)
    S.solvedAt = -1
    S.orbiting = false
end

function L.advance(g: G, dt: number)
    kit.keypadAdvance(S.kp, dt)
    world.orbitAdvance(orb, cam, g.t, dt)
    if lab.portrait then
        world.fit(cam, CU * 0.85, CY - 6, CU, CY)
    else
        world.fit(cam, 30, 392, 34, 404)
    end
    if g.step == 1 then
        S.riding = S.pedalDown and S.started and not S.ended
        advanceRide(g, dt)
    elseif g.step == 2 and S.pick > 0 and not S.tried[S.pick] and g.t - S.pickAt > 4.6 then
        S.tried[S.pick] = true
        if S.pick == 1 then
            S.solved = true
            lab.answer('A', true, '')
            g.done()
            g.sfx('sparkle')
            g.burst(RX + RW / 6, RY + 180, 40)
            g.say('l3s2done')
        else
            lab.answer(if S.pick == 2 then 'B' else 'C', false, if S.pick == 2 then 'GRAPH_AS_PICTURE' else '')
            g.sfx('oops')
            g.say(if S.pick == 2 then 'l3nhill' else 'l3nfast')
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

local function throttle(g: G, on: boolean)
    if on then
        if S.ended then
            resetRide()
        end
        if not S.started then
            S.started = true
        end
        S.pedalDown = true
        g.sfx('pickup')
    else
        S.pedalDown = false
    end
end

function L.down(g: G, p: Vector): boolean
    lastHover = p
    S.downAt = p
    if g.step == 1 then
        local px, py, pw, ph = pedal()
        if kit.inRect(p, px, py, pw, ph) then
            throttle(g, true)
            return true
        end
    elseif g.step == 2 then
        for i = 1, 3 do
            local x, y, w, h = cardRect(i)
            if kit.inRect(p, x, y, w, h) and not S.tried[i] then
                choose(g, i)
                return true
            end
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
    if S.orbiting then
        world.orbitMove(orb, p)
    end
end

function L.up(g: G, p: Vector)
    if S.pedalDown then
        throttle(g, false)
    end
    if S.orbiting then
        S.orbiting = false
        world.orbitUp(orb)
    end
end

function L.key(g: G, k: number): boolean
    if g.step == 1 and (k == 32 or k == 257) then
        -- the keyboard toggles the throttle (key-up never reaches a lesson)
        throttle(g, not S.pedalDown or S.ended)
        return true
    elseif g.step == 2 and k >= 49 and k <= 51 then
        choose(g, k - 48)
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
    local ox, oy = x + 18, y + h - 12
    local gw, gh = w - 36, h - 26
    r:drawPath(kit.line(ox, oy, ox + gw, oy), kit.stroke(world.XCOL, 2.5))
    r:drawPath(kit.line(ox, oy, ox, oy - gh), kit.stroke(world.YCOL, 2.5))
    local u = (g.t * 0.35) % 1
    local P: { Vector } = {}
    local function d(v: number): number
        return if v < 0.35 then v / 0.35 * 0.45 elseif v < 0.6 then 0.45 else 0.45 + (v - 0.6) / 0.4 * 0.55
    end
    for k = 0, 30 do
        local v = k / 30 * u
        table.insert(P, Vector.xy(ox + v * gw, oy - d(v) * gh))
    end
    r:drawPath(kit.polyline(P), kit.stroke(kit.ACCENT_DEEP, 3.5))
    r:drawPath(kit.circle(ox + u * gw, oy - d(u) * gh, 5), kit.fill(kit.GOLD))
end

return L
