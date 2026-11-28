-- Lesson 1 · Reading coordinates, and points on the axes (syllabus skills GR_COORDS, GR_AXES)
--   1. a drone hovers over a 3D grid city: drag it to any crossing and its route draws itself, across (blue) then up
--      (orange), and its coordinates read (across, up). After four crossings the city turns to face you: a graph.
--   2. deliveries: fly the drone to P(4, 2) and Q(2, 6); each one lands as a tower. (2, 4) for P is the swapped slip.
--   3. your turn: R(0, 5). It sits on the y-axis; (5, 0) is the "zero puts it on the x-axis" slip.
-- Drag empty board to turn the city round; it settles back on its own.

local kit = require('kit')
local lab = require('lab')
local world = require('world')
type G = kit.G
type Cam = world.Cam
type Orbit = world.Orbit

type Tower = { x: number, y: number, born: number, name: string, col: Color }

type St = {
    gx: number, gy: number, -- the crossing the drone is over
    px: number, py: number, -- where it is drawn (follows gx, gy)
    dragging: boolean,
    held: number,
    moved: boolean,
    visited: { [number]: boolean },
    nVisited: number,
    revealAt: number,
    towers: { Tower },
    target: number, -- step 2: which delivery (1 P, 2 Q, 3 finished)
    ghostAt: number, -- a wrong drop: the right route replays
    gtx: number, gty: number,
    glowX: number, glowY: number,
    solvedAt: number,
    downAt: Vector,
    orbiting: boolean,
}

local W = 7 -- the city is 7 × 7
local TARGETS = { { 4, 2, 'P' }, { 2, 6, 'Q' } }
local TOWER_H = 1.7

-- Where things go. place() sets these for the frame the shell gives (wide board, or the upright phone frame).
local CX, CY, CU = 372, 404, 54
local RX, RY, RW = 716, 190, 474
local SMALL = 12

local function place()
    if lab.portrait then
        local st, pn = lab.stage, lab.panel
        CX, CY, CU = st.x + st.w / 2 + 6, st.y + st.h / 2 + 14, 32
        RX, RY, RW = pn.x, pn.y, pn.w
        SMALL = 14
    else
        CX, CY, CU = 372, 404, 54
        RX, RY, RW = 716, 190, 474
        SMALL = 12
    end
end

local cam: Cam = world.cam(CX, CY, CU, W / 2, W / 2)
local orb: Orbit = world.orbit(0.95, -0.2)

local S: St = {
    gx = 0, gy = 0, px = 0, py = 0, dragging = false, held = 0, moved = false,
    visited = {}, nVisited = 0, revealAt = -1,
    towers = {}, target = 1, ghostAt = -1, gtx = 0, gty = 0, glowX = 0, glowY = 0, solvedAt = -1,
    downAt = Vector.xy(0, 0), orbiting = false,
}

local L = {}

-- (x, y) with x in the across colour and y in the up colour; returns the width drawn
local function coord(r: Renderer, f: kit.Fonts, xs: string, ys: string, size: number, x: number, y: number, anchor: number, font: Font?)
    local fnt = font or f.display
    local parts = { { '(', kit.INK }, { xs, world.XCOL }, { ', ', kit.INK }, { ys, world.YCOL }, { ')', kit.INK } }
    local w = 0
    for _, p in parts do
        w += kit.width(f, p[1] :: string, fnt, size)
    end
    local cx = x - w * anchor
    for _, p in parts do
        cx += kit.label(r, f, p[1] :: string, fnt, size, p[2] :: Color, cx, y, 0)
    end
    return w
end

local function droneZ(): number
    for _, tw in S.towers do
        if math.abs(tw.x - S.px) < 0.6 and math.abs(tw.y - S.py) < 0.6 then
            return TOWER_H + 0.55
        end
    end
    return 0.95
end

local function dronePos(): Vector
    return world.pt(cam, S.px, S.py, droneZ())
end

-- the drone ---------------------------------------------------------------------------

local function drawDrone(g: G, r: Renderer)
    local bob = math.sin(g.t * 3) * 0.06
    local z = droneZ() + bob + S.held * 0.25
    world.shadow(r, cam, S.px, S.py, 0.32 - S.held * 0.06, 0.22)
    r:drawPath(world.dashed(cam, S.px, S.py, 0.02, S.px, S.py, z, 4, 5, 0), kit.stroke(kit.alpha(kit.INK, 0.35), 1.6))
    local p = world.pt(cam, S.px, S.py, z)
    local rad = 0.34 * world.scale(cam, S.px, S.py, z) * (1 + S.held * 0.12)
    -- glow, then a gold ball lit from the top left, with a spinning ring
    r:drawPath(kit.circle(p.x, p.y, rad * 1.7), kit.soft(kit.alpha(kit.GOLD, 0.35), rad))
    local gr = Gradient.radial(Vector.xy(p.x - rad * 0.35, p.y - rad * 0.4), rad * 1.4, {
        { position = 0, color = Color.rgb(255, 236, 170) },
        { position = 0.55, color = kit.GOLD },
        { position = 1, color = kit.mix(kit.GOLD, kit.GOLD_DEEP, 0.6) },
    })
    r:drawPath(kit.circle(p.x, p.y, rad), Paint.with({ gradient = gr }))
    r:drawPath(kit.circle(p.x, p.y, rad), kit.stroke(kit.SURFACE, 2.5))
    local spin = g.t * 4
    r:drawPath(kit.ellipse(p.x, p.y, rad * 1.45, rad * 0.42), kit.stroke(kit.alpha(kit.GOLD_DEEP, 0.55), 2))
    for i = 0, 1 do
        local a = spin + i * math.pi
        r:drawPath(kit.circle(p.x + math.cos(a) * rad * 1.45, p.y + math.sin(a) * rad * 0.42, 3.2), kit.fill(kit.GOLD_DEEP))
    end
    -- pulse rings while it waits to be picked up
    if not S.dragging and S.nVisited == 0 and g.step == 1 then
        local k = (g.t * 0.6) % 1
        r:drawPath(kit.circle(p.x, p.y, rad + 6 + k * 20), kit.stroke(kit.alpha(kit.GOLD, 0.7 * (1 - k)), 3))
    end
end

-- the route from the origin: across first (blue), then up (orange)
local function drawRoute(g: G, r: Renderer, x: number, y: number, a: number, labels: boolean)
    if x == 0 and y == 0 or a <= 0 then
        return
    end
    local f = g.fonts
    r:save()
    r:modulateOpacity(a)
    local ph = -g.t * 30
    if x ~= 0 then
        r:drawPath(world.line(cam, 0, 0, 0.03, x, 0, 0.03), kit.stroke(kit.alpha(world.XCOL, 0.25), 9))
        r:drawPath(world.dashed(cam, 0, 0, 0.03, x, 0, 0.03, 10, 8, ph), kit.stroke(world.XCOL, 4))
    end
    if y ~= 0 then
        r:drawPath(world.line(cam, x, 0, 0.03, x, y, 0.03), kit.stroke(kit.alpha(world.YCOL, 0.25), 9))
        r:drawPath(world.dashed(cam, x, 0, 0.03, x, y, 0.03, 10, 8, ph), kit.stroke(world.YCOL, 4))
    end
    if labels then
        if x ~= 0 then
            local m = world.pt(cam, x / 2, -0.75, 0)
            kit.halo(r, f, x .. ' across', f.body, 16, world.XCOL, m.x, m.y, 0.5)
        end
        if y ~= 0 then
            local m = world.pt(cam, x + 0.25, y / 2, 0.05)
            kit.halo(r, f, y .. ' up', f.body, 16, world.YCOL, m.x + 10, m.y, 0)
        end
    end
    r:restore()
end

local function drawTower(g: G, r: Renderer, tw: Tower)
    local k = kit.back(kit.clamp((g.t - tw.born) / 0.7, 0, 1))
    local h = TOWER_H * k
    local s = 0.34
    world.shadow(r, cam, tw.x + 0.1, tw.y - 0.1, 0.45, 0.18)
    world.box(r, cam, tw.x - s, tw.y - s, tw.x + s, tw.y + s, 0, math.max(0.02, h), tw.col, nil)
    -- windows on the front face light up one by one
    for i = 1, 3 do
        local wz = h * i / 4
        if h > wz + 0.05 then
            local lit = (g.t * 1.3 + i * 0.7 + tw.x) % 3 < 2
            local a = world.pt(cam, tw.x - 0.12, tw.y - s - 0.001, wz - 0.1)
            local b = world.pt(cam, tw.x + 0.12, tw.y - s - 0.001, wz + 0.08)
            r:drawPath(kit.rect(math.min(a.x, b.x), math.min(a.y, b.y), math.abs(b.x - a.x), math.abs(b.y - a.y)), kit.fill(if lit then Color.rgb(255, 236, 170) else kit.alpha(kit.SURFACE, 0.5)))
        end
    end
end

local function drawTag(g: G, r: Renderer, tw: Tower)
    local k = kit.clamp((g.t - tw.born - 0.35) * 2.5, 0, 1)
    if k <= 0 then
        return
    end
    local top = world.pt(cam, tw.x, tw.y, TOWER_H + 0.25)
    local dx = if tw.x == 0 then -40 else 0 -- on the y-axis: lean left, clear of the city
    kit.tag(r, g.fonts, tw.name .. ' (' .. tw.x .. ', ' .. tw.y .. ')', top.x + dx, top.y - 16, k)
end

-- the ghost: after a wrong drop, a pale drone flies the right route, across then up
local function drawGhost(g: G, r: Renderer)
    if S.ghostAt < 0 then
        return
    end
    local age = g.t - S.ghostAt
    if age > 4 then
        return
    end
    local tx, ty = S.gtx, S.gty
    local fade = if age > 3.4 then (4 - age) / 0.6 else 1
    local k1 = kit.smooth(age / 1.1)
    local k2 = kit.smooth((age - 1.2) / 1.1)
    local gx, gy = tx * k1, ty * k2
    drawRoute(g, r, tx, ty, fade * 0.9, true)
    local p = world.pt(cam, gx, gy, 0.95)
    local rad = 0.3 * world.scale(cam, gx, gy, 0.95)
    r:save()
    r:modulateOpacity(fade)
    r:drawPath(kit.circle(p.x, p.y, rad), kit.fill(kit.alpha(kit.SURFACE, 0.75)))
    r:drawPath(kit.circle(p.x, p.y, rad), kit.stroke(kit.ACCENT, 3))
    if age > 2.3 then
        local q = world.pt(cam, tx, ty, 0.02)
        local k = ((age - 2.3) * 1.2) % 1
        r:drawPath(kit.circle(q.x, q.y, 10 + k * 26), kit.stroke(kit.alpha(kit.ACCENT, 1 - k), 3))
    end
    r:restore()
end

-- the city ----------------------------------------------------------------------------------

local function drawCity(g: G, r: Renderer)
    local f = g.fonts
    world.sheet(r, cam, W, W, 0.6, 1)
    world.axes(r, cam, W, W, S.glowX, S.glowY)
    -- numbers along the axes
    for i = 0, W do
        local a = world.pt(cam, i, -0.42, 0)
        kit.label(r, f, tostring(i), f.display, 17, world.XCOL, a.x, a.y, 0.5)
        if i > 0 then
            local b = world.pt(cam, -0.42, i, 0)
            kit.label(r, f, tostring(i), f.display, 17, world.YCOL, b.x, b.y, 0.5)
        end
    end
    local xa = world.pt(cam, W + 0.5, -0.55, 0)
    kit.label(r, f, 'x', f.math, 22, world.XCOL, xa.x + 8, xa.y, 0)
    local ya = world.pt(cam, -0.55, W + 0.5, 0)
    kit.label(r, f, 'y', f.math, 22, world.YCOL, ya.x, ya.y - 6, 1)
    -- crossings: tiny studs, the one under the drone ringed
    for i = 0, W do
        for j = 0, W do
            local p = world.pt(cam, i, j, 0)
            local on = i == S.gx and j == S.gy
            local seen = S.visited[j * 10 + i] == true
            r:drawPath(kit.circle(p.x, p.y, if on then 6 else 3.2), kit.fill(if on then kit.GOLD elseif seen then kit.ACCENT else kit.alpha(kit.INK, 0.25)))
        end
    end
    -- the route to the drone
    if g.step == 1 or S.dragging or S.ghostAt < 0 then
        drawRoute(g, r, S.gx, S.gy, 1, true)
    end
    drawGhost(g, r)
    -- towers and the drone, far to near
    type Thing = { d: number, tw: Tower? }
    local things: { Thing } = {}
    for _, tw in S.towers do
        table.insert(things, { d = world.near(cam, tw.x, tw.y, 0), tw = tw })
    end
    table.insert(things, { d = world.near(cam, S.px, S.py, 0), tw = nil })
    table.sort(things, function(a: Thing, b: Thing): boolean
        return a.d < b.d
    end)
    for _, th in things do
        local tw = th.tw
        if tw ~= nil then
            drawTower(g, r, tw)
        else
            drawDrone(g, r)
        end
    end
    for _, tw in S.towers do
        drawTag(g, r, tw)
    end
    -- a ghost finger shows the drag until the first move
    if g.step == 1 and S.nVisited == 0 and not S.dragging and g.age > 3 then
        local k = ((g.age - 3) % 2.6) / 2.6
        local a = if k < 0.1 then k / 0.1 elseif k > 0.8 then (1 - k) / 0.2 else 1
        local e = kit.smooth((k - 0.1) / 0.7)
        local q = world.pt(cam, 3 * e, 2 * e, 0.95)
        kit.finger(r, q.x, q.y, a, true)
    end
end

-- the readouts ------------------------------------------------------------------------------

local function card(r: Renderer, x: number, y: number, w: number, h: number, on: boolean)
    r:drawPath(kit.rrect(x, y, w, h, 22), kit.fill(if on then kit.ACCENT_WASH else kit.PAGE))
    r:drawPath(kit.rrect(x, y, w, h, 22), kit.stroke(if on then kit.ACCENT else kit.LINE, 2))
end

local function drawPanel(g: G, r: Renderer)
    local f = g.fonts
    local x, y, w = RX, RY, RW
    local h1 = if lab.portrait then 124 else 150
    card(r, x, y, w, h1, false)
    kit.label(r, f, 'THE DRONE IS AT', f.mono, SMALL, kit.INK_SOFT, x + 24, y + 26, 0)
    coord(r, f, tostring(S.gx), tostring(S.gy), if lab.portrait then 44 else 54, x + 24, y + (if lab.portrait then 70 else 80), 0, nil)
    local how = if S.gx == 0 and S.gy == 0 then 'the origin: no steps yet'
        elseif S.gy == 0 then S.gx .. ' across, 0 up: on the x-axis'
        elseif S.gx == 0 then '0 across, ' .. S.gy .. ' up: on the y-axis'
        else S.gx .. ' across, then ' .. S.gy .. ' up'
    kit.label(r, f, how, f.body, 17, kit.INK_SOFT, x + 24, y + h1 - 26, 0)

    local y2 = y + h1 + (if lab.portrait then 22 else 34)
    if g.step == 1 then
        kit.label(r, f, 'CROSSINGS VISITED', f.mono, SMALL, kit.INK_SOFT, x, y2, 0)
        local n = math.min(4, S.nVisited)
        local cw = (w - 3 * 12) / 4
        for i = 1, 4 do
            local cx = x + (i - 1) * (cw + 12)
            local on = i <= n
            r:drawPath(kit.rrect(cx, y2 + 18, cw, 54, 16), kit.fill(if on then kit.SURFACE else kit.PAGE))
            r:drawPath(kit.rrect(cx, y2 + 18, cw, 54, 16), kit.stroke(if on then kit.ACCENT else kit.LINE, if on then 2 else 1.5))
            if on then
                r:drawPath(kit.check(cx + cw / 2, y2 + 45, 22), kit.stroke(kit.ACCENT, 4))
            else
                kit.label(r, f, '?', f.display, 24, kit.INK_FAINT, cx + cw / 2, y2 + 45, 0.5)
            end
        end
        if not lab.portrait then
            kit.paragraph(r, f, 'Across first, then up. The first number says how far across; the second, how far up.', 17, kit.INK_SOFT, x, y2 + 100, w)
        end
    else
        kit.label(r, f, if g.step == 2 then 'DELIVERIES' else 'YOUR TURN', f.mono, SMALL, kit.INK_SOFT, x, y2, 0)
        local list = if g.step == 2 then TARGETS else { { 0, 5, 'R' } }
        local cw = if g.step == 2 then (w - 12) / 2 else w
        for i, t in list do
            local cx = x + (i - 1) * (cw + 12)
            local done = (g.step == 2 and i < S.target) or (g.step == 3 and S.solvedAt >= 0)
            local cur = (g.step == 2 and i == S.target) or (g.step == 3 and S.solvedAt < 0)
            r:drawPath(kit.rrect(cx, y2 + 18, cw, 70, 18), kit.fill(if done then kit.ACCENT_WASH else kit.SURFACE))
            r:drawPath(kit.rrect(cx, y2 + 18, cw, 70, 18), kit.stroke(if done then kit.ACCENT elseif cur then kit.GOLD else kit.LINE, if cur then 3 else 2))
            local lw = kit.label(r, f, (t[3] :: string) .. ' ', f.display, 32, kit.INK, cx + 20, y2 + 53, 0)
            coord(r, f, tostring(t[1]), tostring(t[2]), 32, cx + 20 + lw, y2 + 53, 0, nil)
            if done then
                r:drawPath(kit.check(cx + cw - 30, y2 + 53, 24), kit.stroke(kit.ACCENT, 4))
            end
        end
        if not lab.portrait then
            local note = if g.step == 2 then 'Drag the drone to the crossing, or tap the crossing.' else 'Where does a point go when its first number is 0?'
            kit.label(r, f, note, f.body, 17, kit.INK_SOFT, x, y2 + 120, 0)
        end
    end
end

-- checking a drop ----------------------------------------------------------------------------

local function ghost(g: G, tx: number, ty: number)
    S.ghostAt, S.gtx, S.gty = g.t, tx, ty
end

local function tower(g: G, x: number, y: number, name: string, col: Color)
    table.insert(S.towers, { x = x, y = y, born = g.t, name = name, col = col })
    local p = world.pt(cam, x, y, 1)
    g.burst(p.x, p.y, 36)
    g.sfx('sparkle')
end

local function drop(g: G)
    local x, y = S.gx, S.gy
    if x == 0 and y == 0 then
        return
    end
    local said = '(' .. x .. ', ' .. y .. ')'
    if g.step == 2 and S.target <= #TARGETS then
        local t = TARGETS[S.target]
        local tx, ty = t[1] :: number, t[2] :: number
        if x == tx and y == ty then
            lab.answer(said, true, '')
            tower(g, x, y, t[3] :: string, if S.target == 1 then kit.ACCENT else kit.BLUE)
            S.ghostAt = -1
            S.target += 1
            if S.target > #TARGETS then
                g.done()
                g.say('l1s2done')
            else
                g.say('l1s2p')
            end
        else
            local swapped = x == ty and y == tx
            lab.answer(said, false, if swapped then 'COORDS_SWAPPED' else '')
            g.sfx('oops')
            g.shake(4)
            ghost(g, tx, ty)
            g.say(if swapped then (if S.target == 1 then 'l1s2swap' else 'l1s2swapq') else 'l1s2x')
        end
    elseif g.step == 3 and S.solvedAt < 0 then
        if x == 0 and y == 5 then
            lab.answer(said, true, '')
            S.solvedAt = g.t
            S.ghostAt = -1
            tower(g, 0, 5, 'R', kit.ORANGE)
            g.done()
            g.say('l1s3done')
        else
            local axis = x == 5 and y == 0
            lab.answer(said, false, if axis then 'ZERO_COORD_WRONG_AXIS' else '')
            g.sfx('oops')
            g.shake(4)
            ghost(g, 0, 5)
            if axis then
                S.glowX = 1
            end
            g.say(if axis then 'l1n50' else 'l1nx')
        end
    end
end

local function moveTo(g: G, x: number, y: number)
    local nx, ny = kit.clamp(x, 0, W), kit.clamp(y, 0, W)
    if nx == S.gx and ny == S.gy then
        return
    end
    S.gx, S.gy = nx, ny
    S.moved = true
    g.tick(math.min(11, nx + ny))
    if g.step == 1 and not (nx == 0 and ny == 0) then
        local key = ny * 10 + nx
        if not S.visited[key] then
            S.visited[key] = true
            S.nVisited += 1
            if S.nVisited == 4 and S.revealAt < 0 then
                -- the city turns to face you: seen straight on, it is a graph
                S.revealAt = g.t
                orb.restTilt, orb.restYaw = 0, 0
                g.sfx('whoosh')
                g.done()
                g.say('l1s1done')
                g.hint('Seen straight on, the city is a graph')
            end
        end
    end
end

-- protocol ---------------------------------------------------------------------------------

L.id = 'GR_COORDS'
lab.upright[L.id] = true
L.tag = 'COORDINATES'
L.title = 'Across, then up'
L.blurb = 'Fly a drone over a 3D city and read where it is.'
L.steps = {
    { title = 'Fly the drone', line = 'l1s1', task = 'Drag the drone to four different crossings' },
    { title = 'Deliveries', line = 'l1s2', task = 'Fly the drone to P (4, 2), then to Q (2, 6)' },
    { title = 'Your turn', line = 'l1s3', task = 'Put R at (0, 5)' },
}

function L.enter(g: G, step: number)
    place()
    cam = world.cam(CX, CY, CU, W / 2, W / 2)
    -- each step swoops in from low and to the side
    orb = world.orbit(0.95, -0.2)
    orb.tilt, orb.yaw = 0.25, -0.85
    S.gx, S.gy, S.px, S.py = 0, 0, 0, 0
    S.dragging, S.held, S.moved = false, 0, false
    S.visited, S.nVisited, S.revealAt = {}, 0, -1
    S.towers, S.target, S.ghostAt = {}, 1, -1
    S.glowX, S.glowY, S.solvedAt = 0, 0, -1
    S.orbiting = false
    if step == 3 then
        -- the two deliveries stay standing
        table.insert(S.towers, { x = 4, y = 2, born = -10, name = 'P', col = kit.ACCENT })
        table.insert(S.towers, { x = 2, y = 6, born = -10, name = 'Q', col = kit.BLUE })
    end
end

function L.advance(g: G, dt: number)
    S.px = kit.follow(S.px, S.gx, 16, dt)
    S.py = kit.follow(S.py, S.gy, 16, dt)
    S.held = kit.follow(S.held, if S.dragging then 1 else 0, 18, dt)
    S.glowX = math.max(0, S.glowX - dt * 0.4)
    S.glowY = if g.step == 3 and S.solvedAt >= 0 then kit.follow(S.glowY, 0.6 + 0.4 * math.sin(g.t * 3), 8, dt) else math.max(0, S.glowY - dt)
    world.orbitAdvance(orb, cam, g.t, dt)
    if lab.portrait then
        world.fit(cam, CU, CY, CU * 1.12, CY + 10)
    else
        world.fit(cam, 46, 384, 54, 418)
    end
end

function L.draw(g: G, r: Renderer)
    drawCity(g, r)
    drawPanel(g, r)
end

function L.down(g: G, p: Vector): boolean
    S.downAt = p
    if kit.dist(p, dronePos()) < 46 then
        S.dragging = true
        S.moved = false
        g.sfx('pickup')
        return true
    end
    -- anywhere else on the city turns it
    if p.x < RX - 20 or lab.portrait and p.y < RY - 10 then
        S.orbiting = true
        world.orbitDown(orb, p)
        return true
    end
    return false
end

function L.move(g: G, p: Vector)
    if S.dragging then
        local x, y = world.pick(cam, p, W, W, 80)
        if x ~= nil and y ~= nil then
            moveTo(g, x, y)
        end
    elseif S.orbiting then
        world.orbitMove(orb, p)
    end
end

function L.up(g: G, p: Vector)
    if S.dragging then
        S.dragging = false
        g.sfx('drop')
        if S.moved then
            drop(g)
        end
    elseif S.orbiting then
        S.orbiting = false
        world.orbitUp(orb)
        -- a tap (no drag) on a crossing flies the drone there
        if kit.dist(p, S.downAt) < 8 then
            local x, y = world.pick(cam, p, W, W, 26)
            if x ~= nil and y ~= nil then
                moveTo(g, x, y)
                if g.step > 1 then
                    drop(g)
                end
            end
        end
    end
end

function L.key(g: G, k: number): boolean
    local dx = if k == 262 then 1 elseif k == 263 then -1 else 0
    local dy = if k == 265 then 1 elseif k == 264 then -1 else 0
    if dx ~= 0 or dy ~= 0 then
        moveTo(g, S.gx + dx, S.gy + dy)
        return true
    end
    if (k == 32 or k == 257) and g.step > 1 then
        drop(g)
        return true
    end
    return false
end

function L.thumb(g: G, r: Renderer, x: number, y: number, w: number, h: number)
    local c = world.cam(x + w / 2, y + h / 2 + 8, (h - 10) / 5.2, 2, 2)
    c.tilt, c.yaw = 0.95, -0.3 + math.sin(g.t * 0.6) * 0.12
    local save = cam
    cam = c
    world.sheet(r, c, 4, 4, 0.4, 1)
    world.axes(r, c, 4, 4, 0, 0)
    local k = kit.back(kit.clamp(((g.t * 0.5) % 2) - 0.2, 0, 1))
    world.box(r, c, 2.7, 1.7, 3.3, 2.3, 0, 0.02 + 1.4 * k, kit.ACCENT, nil)
    local p = world.pt(c, 3, 2, 1.9 + math.sin(g.t * 3) * 0.08)
    r:drawPath(kit.circle(p.x, p.y, 7), kit.fill(kit.GOLD))
    r:drawPath(kit.circle(p.x, p.y, 7), kit.stroke(kit.SURFACE, 2))
    cam = save
end

return L
