-- world: a little 3D for the graphs lessons.
-- Points are in graph units: x along the x-axis, y up the y-axis, z standing up out of the graph's sheet.
-- The sheet lies back like a table top, turns a little, and is seen in perspective. It is all ordinary
-- vector paths (no GPU canvas), so it plays in every runtime the chapter labs run in.
-- The student can drag empty board to turn the world; it drifts back to rest when let go.

local kit = require('kit')

local world = {}

export type Cam = {
    cx: number, cy: number, -- where the graph point (ox, oy) lands on screen
    unit: number, -- pixels per graph unit there
    ox: number, oy: number,
    tilt: number, -- 0 faces us flat (an ordinary graph) … 1.2 lies well back like a table
    yaw: number, -- a turn about the upright axis
    depth: number, -- camera distance in graph units: smaller is stronger perspective
}

export type Orbit = {
    tilt: number, yaw: number, -- now
    restTilt: number, restYaw: number, -- where it settles
    dragging: boolean,
    at: Vector,
    vt: number, vy: number,
}

function world.cam(cx: number, cy: number, unit: number, ox: number, oy: number): Cam
    return { cx = cx, cy = cy, unit = unit, ox = ox, oy = oy, tilt = 0.95, yaw = -0.2, depth = 13 }
end

function world.orbit(tilt: number, yaw: number): Orbit
    return { tilt = tilt, yaw = yaw, restTilt = tilt, restYaw = yaw, dragging = false, at = Vector.xy(0, 0), vt = 0, vy = 0 }
end

-- screen point, and how near it is (bigger is nearer)
function world.project(c: Cam, x: number, y: number, z: number): (Vector, number)
    local X, Y, Z = x - c.ox, y - c.oy, z
    local ct, st = math.cos(c.tilt), math.sin(c.tilt)
    local Y1 = Y * ct + Z * st
    local Z1 = -Y * st + Z * ct
    local ca, sa = math.cos(c.yaw), math.sin(c.yaw)
    local X2 = X * ca + Z1 * sa
    local Z2 = -X * sa + Z1 * ca
    local s = c.depth / math.max(1, c.depth - Z2)
    return Vector.xy(c.cx + X2 * s * c.unit, c.cy - Y1 * s * c.unit), Z2
end

function world.pt(c: Cam, x: number, y: number, z: number): Vector
    local p, _ = world.project(c, x, y, z)
    return p
end

function world.near(c: Cam, x: number, y: number, z: number): number
    local _, d = world.project(c, x, y, z)
    return d
end

-- how big one graph unit looks at a point (for sizing dots and labels with distance)
function world.scale(c: Cam, x: number, y: number, z: number): number
    local _, d = world.project(c, x, y, z)
    return c.unit * c.depth / math.max(1, c.depth - d)
end

-- a face given as {x, y, z} corners
function world.face(c: Cam, P: { { number } }): { Vector }
    local out: { Vector } = {}
    for _, q in P do
        table.insert(out, world.pt(c, q[1], q[2], q[3]))
    end
    return out
end

function world.line(c: Cam, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): Path
    local a, b = world.pt(c, x1, y1, z1), world.pt(c, x2, y2, z2)
    local p = Path.new()
    p:moveTo(a)
    p:lineTo(b)
    return p
end

function world.dashed(c: Cam, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, dash: number, gap: number, phase: number): Path
    local a, b = world.pt(c, x1, y1, z1), world.pt(c, x2, y2, z2)
    return kit.dashed(a.x, a.y, b.x, b.y, dash, gap, phase)
end

local function faceDepth(c: Cam, P: { { number } }): number
    local s = 0
    for _, q in P do
        s += world.near(c, q[1], q[2], q[3])
    end
    return s / #P
end

-- a lit box: top lightest, the sides a little darker. Faces are drawn far to near, which is right for one box.
function world.box(r: Renderer, c: Cam, x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, col: Color, edge: Color?)
    type Face = { P: { { number } }, shade: number, d: number }
    local faces: { Face } = {
        { P = { { x0, y0, z1 }, { x1, y0, z1 }, { x1, y1, z1 }, { x0, y1, z1 } }, shade = 0.22, d = 0 }, -- top
        { P = { { x0, y0, z0 }, { x1, y0, z0 }, { x1, y0, z1 }, { x0, y0, z1 } }, shade = -0.04, d = 0 }, -- front (low y)
        { P = { { x0, y1, z0 }, { x1, y1, z0 }, { x1, y1, z1 }, { x0, y1, z1 } }, shade = -0.2, d = 0 }, -- back
        { P = { { x0, y0, z0 }, { x0, y1, z0 }, { x0, y1, z1 }, { x0, y0, z1 } }, shade = -0.14, d = 0 }, -- left
        { P = { { x1, y0, z0 }, { x1, y1, z0 }, { x1, y1, z1 }, { x1, y0, z1 } }, shade = -0.1, d = 0 }, -- right
    }
    for _, f in faces do
        f.d = faceDepth(c, f.P)
    end
    table.sort(faces, function(a: Face, b: Face): boolean
        return a.d < b.d
    end)
    for _, f in faces do
        local Q = world.face(c, f.P)
        local fc = if f.shade > 0 then kit.mix(col, kit.SURFACE, f.shade) else kit.mix(col, kit.INK, -f.shade)
        r:drawPath(kit.poly(Q), kit.fill(fc))
        r:drawPath(kit.poly(Q), kit.stroke(edge or kit.mix(col, kit.INK, 0.25), 1.2))
    end
end

-- a soft shadow on the sheet under something at (x, y)
function world.shadow(r: Renderer, c: Cam, x: number, y: number, rad: number, a: number)
    local P: { Vector } = {}
    for i = 0, 15 do
        local ang = i / 16 * math.pi * 2
        table.insert(P, world.pt(c, x + math.cos(ang) * rad, y + math.sin(ang) * rad, 0))
    end
    r:drawPath(kit.poly(P), kit.soft(kit.alpha(kit.INK, a), 8))
end

-- The sheet: a thick card the graph is printed on, with its grid. w × h graph units from (0, 0).
-- step is the grid spacing in graph units.
function world.sheet(r: Renderer, c: Cam, w: number, h: number, pad: number, step: number)
    local x0, y0, x1, y1 = -pad, -pad, w + pad, h + pad
    -- a soft shadow under the card
    local base = world.face(c, { { x0, y0, -0.35 }, { x1, y0, -0.35 }, { x1, y1, -0.35 }, { x0, y1, -0.35 } })
    r:drawPath(kit.poly(kit.offset(base, 6, 16)), kit.soft(kit.alpha(kit.INK, 0.16), 26))
    world.box(r, c, x0, y0, x1, y1, -0.35, 0, kit.SURFACE, kit.LINE)
    local gp = Path.new()
    local i = 0
    while i <= w + 1e-6 do
        gp:moveTo(world.pt(c, i, 0, 0))
        gp:lineTo(world.pt(c, i, h, 0))
        i += step
    end
    local j = 0
    while j <= h + 1e-6 do
        gp:moveTo(world.pt(c, 0, j, 0))
        gp:lineTo(world.pt(c, w, j, 0))
        j += step
    end
    r:drawPath(gp, kit.stroke(kit.LINE, 1.3))
end

-- the two axes as raised rails, x blue and y orange (the colours the coordinates are written in)
world.XCOL = kit.BLUE
world.YCOL = kit.ORANGE

function world.axes(r: Renderer, c: Cam, w: number, h: number, glowX: number, glowY: number)
    local function rail(x1: number, y1: number, x2: number, y2: number, col: Color, glow: number)
        if glow > 0 then
            r:drawPath(world.line(c, x1, y1, 0.08, x2, y2, 0.08), kit.soft(kit.alpha(col, 0.55 * glow), 10))
        end
        r:drawPath(world.line(c, x1, y1, 0.04, x2, y2, 0.04), kit.stroke(kit.mix(col, kit.INK, 0.35), 6))
        r:drawPath(world.line(c, x1, y1, 0.08, x2, y2, 0.08), kit.stroke(col, 4))
    end
    rail(0, 0, w + 0.45, 0, world.XCOL, glowX)
    rail(0, 0, 0, h + 0.45, world.YCOL, glowY)
    -- arrow heads
    local function head(x: number, y: number, dx: number, dy: number, col: Color)
        local tip = world.pt(c, x + dx * 0.45, y + dy * 0.45, 0.08)
        local a = world.pt(c, x - dy * 0.22, y + dx * 0.22, 0.08)
        local b = world.pt(c, x + dy * 0.22, y - dx * 0.22, 0.08)
        r:drawPath(kit.poly({ tip, a, b }), kit.fill(col))
    end
    head(w + 0.45, 0, 1, 0, world.XCOL)
    head(0, h + 0.45, 0, 1, world.YCOL)
end

-- Turning the world -------------------------------------------------------------------

function world.orbitDown(o: Orbit, p: Vector)
    o.dragging = true
    o.at = p
end

function world.orbitMove(o: Orbit, p: Vector)
    if not o.dragging then
        return
    end
    o.yaw = kit.clamp(o.yaw + (p.x - o.at.x) * 0.0045, -0.75, 0.75)
    o.tilt = kit.clamp(o.tilt - (p.y - o.at.y) * 0.0045, 0, 1.25)
    o.at = p
end

function world.orbitUp(o: Orbit)
    o.dragging = false
end

-- springs back to rest with a slow, small sway so the world always feels alive
function world.orbitAdvance(o: Orbit, c: Cam, t: number, dt: number)
    if not o.dragging then
        local sway = if o.restTilt > 0.05 then math.sin(t * 0.45) * 0.05 else 0
        local s1: kit.Spring = { x = o.tilt, v = o.vt }
        kit.spring(s1, o.restTilt, 30, 9, dt)
        o.tilt, o.vt = s1.x, s1.v
        local s2: kit.Spring = { x = o.yaw, v = o.vy }
        kit.spring(s2, o.restYaw + sway, 30, 9, dt)
        o.yaw, o.vy = s2.x, s2.v
    end
    c.tilt, c.yaw = o.tilt, o.yaw
end

-- A camera that grows as the sheet lies back (it looks shorter then) and shrinks facing us flat.
-- flatUnit, flatY: unit and centre when flat; tiltUnit, tiltY: at the resting tilt of 0.95.
function world.fit(c: Cam, flatUnit: number, flatY: number, tiltUnit: number, tiltY: number)
    local k = kit.clamp(c.tilt / 0.95, 0, 1.3)
    c.unit = kit.lerp(flatUnit, tiltUnit, k)
    c.cy = kit.lerp(flatY, tiltY, k)
end

-- the grid crossing nearest a screen point, within reach (px); nil when none is close
function world.pick(c: Cam, p: Vector, w: number, h: number, reach: number): (number?, number?)
    local best, bx, by = reach, nil :: number?, nil :: number?
    for i = 0, w do
        for j = 0, h do
            local d = kit.dist(p, world.pt(c, i, j, 0))
            if d < best then
                best, bx, by = d, i, j
            end
        end
    end
    return bx, by
end

-- where along the x-axis (0..w) a screen point is, by sampling (the axis is short, so this is plenty)
function world.alongX(c: Cam, p: Vector, w: number, y: number, z: number): number
    local best, bx = math.huge, 0
    for i = 0, 200 do
        local x = w * i / 200
        local d = kit.dist(p, world.pt(c, x, y, z))
        if d < best then
            best, bx = d, x
        end
    end
    return bx
end

return world
