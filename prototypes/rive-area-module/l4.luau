-- Lesson 4 · The triangle: half of base × height
--   1. tap the field for a copy; spin the copy by dragging its gold knob round, slide it in: a parallelogram.
--      It is 6 × 4 = 24, then the copy lifts away and the sign counts down to 12
--   2. drag the top corner along a line parallel to the base, even past the end of the base:
--      the slanted sides change, the area stays 12 (faint ghosts of where it has been)
--   3. tap the real height (the slanted side is the trap)
--   4. work it out on the keypad: base 10, height 4, slanted side 5 -> 20

local kit = require('kit')
type G = kit.G
type Keypad = kit.Keypad

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
    countFrom: number,
    lastCount: number,
    -- step 2
    apex: number,
    apexTarget: number,
    ghosts: { number },
    ghostT: number,
    outside: boolean,
    -- step 3
    picked: string,
    wrong: string,
    wrongAt: number,
    hoverLine: string,
    -- step 4
    kp: Keypad,
    solvedAt: number,
}

local L = {}

local U = 52
local FX, FY = 110, 236
local T = { Vector.xy(0, 4), Vector.xy(6, 4), Vector.xy(2, 0) }
local PIVOT = Vector.xy(3, 2)
local KNOB = Vector.xy(4.3, 3.05)
local STAGE = 7.6 * U
local TARGET = 2 * U
local U2, F2X, F2Y = 50, 340, 250
local U3, F3X, F3Y = 44, 200, 262

local S: St = {
    phase = 'tap', phaseAt = 0, tx = 0, ty = 0, rot = 0, rotTarget = 0, spinning = false, spinA = 0, dragging = false,
    grabX = 0, grabY = 0, held = 0, flyFrom = Vector.xy(0, 0), misses = 0, countFrom = 0, lastCount = 0,
    apex = 2, apexTarget = 2, ghosts = {}, ghostT = 0, outside = false,
    picked = '', wrong = '', wrongAt = -9, hoverLine = '',
    kp = kit.keypad(860, 172), solvedAt = -1,
}

local function px(P: { Vector }, ox: number, oy: number, u: number): { Vector }
    return kit.toPx(P, ox, oy, u)
end

-- the copy's corners right now (px)
local function copyShape(): { Vector }
    local P = kit.rotate(T, PIVOT, S.rot)
    return px(P, FX + S.tx / U * U, FY + S.ty, U)
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

-- step 3 lines (px)
local function lines3(): { [string]: { Vector } }
    local function q(x: number, y: number): Vector
        return Vector.xy(F3X + x * U3, F3Y + y * U3)
    end
    return {
        slant = { q(0, 4), q(3, 0) },
        drop = { q(3, 0), q(3, 4) },
        right = { q(10, 4), q(3, 0) },
        base = { q(0, 4), q(10, 4) },
    }
end

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
L.title = 'Two triangles, one field'
L.blurb = 'Copy, spin, join: half of base × height.'
L.steps = {
    { title = 'Copy it, spin it, join them', line = 'l4s1', task = 'Make a parallelogram from two triangles' },
    { title = 'Slide the top corner', line = 'l4s2', task = 'Drag the top corner past the end of the base' },
    { title = 'Which line is the height?', line = 'l4s3', task = 'Tap the height' },
    { title = 'Your turn', line = 'l4s4', task = 'Work out the land on the keypad' },
}

function L.enter(g: G, step: number)
    S.phase, S.phaseAt, S.tx, S.ty, S.rot, S.rotTarget = 'tap', g.t, 0, 0, 0, 0
    S.spinning, S.dragging, S.held, S.misses, S.lastCount = false, false, 0, 0, 0
    S.apex, S.apexTarget, S.ghosts, S.ghostT, S.outside = 2, 2, {}, 0, false
    S.picked, S.wrong, S.wrongAt, S.hoverLine = '', '', -9, ''
    S.kp = kit.keypad(860, 172)
    S.solvedAt = -1
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
                g.sayNext('spin')
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
    end
    kit.keypadAdvance(S.kp, dt)
end

-- drawing ------------------------------------------------------------------------------

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
    local st = kit.style(U, Vector.xy(FX, FY - bob))
    st.edge = if S.phase == 'tap' then 1 else 0
    kit.land(r, kit.offset(orig, 0, -bob), st)
    -- the copy
    if S.phase ~= 'tap' then
        local P = copyShape()
        local cst = kit.style(U, pivotPos())
        cst.copy = true
        cst.gridRot = S.rot
        cst.gridAt = kit.rotate({ Vector.xy(FX + S.tx, FY + S.ty) }, pivotPos(), S.rot)[1]
        cst.lift = if S.phase == 'appear' then 0.8 else S.held + away
        cst.edge = if S.phase == 'fit' then 1 else 0
        cst.alpha = 1 - away
        local Q = kit.offset(P, away * 3 * U, -away * 60)
        cst.gridAt = Vector.xy(cst.gridAt.x + away * 3 * U, cst.gridAt.y - away * 60)
        kit.land(r, Q, cst)
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
        r:drawPath(kit.partialOutline(para, (age - 0.3) / 0.9), kit.stroke(kit.GOLD, 5))
        r:restore()
        kit.bracket(r, f, Vector.xy(FX, FY + 4 * U + 28), Vector.xy(FX + 6 * U, FY + 4 * U + 28), 0, 1, '6', kit.clamp((age - 1.3) * 1.5, 0, 1), kit.INK)
        local hk = kit.clamp((age - 1.9) * 1.5, 0, 1)
        if hk > 0 then
            local hx = FX + 2 * U
            r:drawPath(kit.dashed(hx, FY, hx, FY + 4 * U * kit.ease(hk), 9, 7), kit.stroke(kit.INK, 3))
            r:drawPath(kit.corner(Vector.xy(hx, FY + 4 * U), 1, 0, 0, -1, 13), kit.stroke(kit.alpha(kit.INK, hk), 2.5))
            kit.halo(r, f, '4', f.display, 24, kit.INK, hx - 14, FY + 2 * U, 1)
        end
        local n = if S.lastCount > 0 then tostring(S.lastCount) .. ' squares' else '? squares'
        kit.sign(r, f, if away > 0 then 'TRIANGLE' else 'PARALLELOGRAM', n, 0, 1000, 176)
        if age > 6 then
            kit.tag(r, f, 'half', FX + 2.9 * U, FY + 2.9 * U, kit.clamp((age - 6) * 2, 0, 1))
            kit.rule(r, f, 'area = ½ × base × height', '½ × 6 × 4 = 12 squares', kit.clamp((age - 6.6) * 1.5, 0, 1), 1000, 330)
        end
    else
        kit.sign(r, f, 'LAND', '? squares', 0, 1000, 176)
    end
    -- a hint finger for the tap
    if S.phase == 'tap' and g.age > 5 then
        local k = (g.age % 1.6) / 1.6
        local c = kit.centroid(orig)
        kit.finger(r, c.x, c.y, if k < 0.7 then 1 else (1 - k) / 0.3, k > 0.3 and k < 0.55)
    end
end

local function drawStep2(g: G, r: Renderer)
    local f = g.fonts
    local a = S.apex
    -- the line the top corner moves along
    r:drawPath(kit.dashed(F2X - 5 * U2, F2Y, F2X + 10.8 * U2, F2Y, 10, 9, g.t * 20), kit.stroke(kit.alpha(kit.GOLD, 0.8), 3))
    kit.label(r, f, 'the top slides along here', f.body, 15, kit.GOLD_DEEP, F2X - 5 * U2, F2Y - 22, 0)
    -- base line, extended when the foot of the height falls outside it
    local footX = F2X + a * U2
    local bx0, bx1 = math.min(F2X, footX), math.max(F2X + 6 * U2, footX)
    r:drawPath(kit.dashed(bx0 - 10, F2Y + 4 * U2, bx1 + 10, F2Y + 4 * U2, 8, 8), kit.stroke(kit.INK_FAINT, 2))
    -- ghosts of where it has been
    for i, gx in S.ghosts do
        local P = px({ Vector.xy(0, 4), Vector.xy(6, 4), Vector.xy(gx, 0) }, F2X, F2Y, U2)
        r:drawPath(kit.poly(P), kit.stroke(kit.alpha(kit.GRASS_EDGE, 0.08 * i), 2))
    end
    local P = px({ Vector.xy(0, 4), Vector.xy(6, 4), Vector.xy(a, 0) }, F2X, F2Y, U2)
    kit.land(r, P, kit.style(U2, Vector.xy(F2X, F2Y)))
    -- the height: straight down from the top corner
    r:drawPath(kit.dashed(footX, F2Y, footX, F2Y + 4 * U2, 9, 7), kit.stroke(kit.INK, 3))
    local side = if a > 5 then -1 else 1
    r:drawPath(kit.corner(Vector.xy(footX, F2Y + 4 * U2), side, 0, 0, -1, 13), kit.stroke(kit.INK, 2.5))
    kit.halo(r, f, 'height 4', f.body, 18, kit.INK, footX + side * 16, F2Y + 2.3 * U2, if side > 0 then 0 else 1)
    kit.halo(r, f, 'base 6', f.body, 18, kit.INK, F2X + 3 * U2, F2Y + 4 * U2 + 40, 0.5)
    if S.outside then
        kit.tag(r, f, 'the height can fall outside!', footX, F2Y + 4 * U2 + 86, 1)
    end
    kit.knob(r, g.t, F2X + a * U2, F2Y, 'slide', S.held, not S.dragging and #S.ghosts == 0)
    -- the readout never changes
    local la = math.sqrt(a * a + 16)
    local lb = math.sqrt((6 - a) ^ 2 + 16)
    r:drawPath(kit.rrect(900, 176, 300, 186, 22), kit.fill(kit.ACCENT_WASH))
    kit.label(r, f, 'AREA', f.mono, 12, kit.INK_SOFT, 924, 202, 0)
    kit.label(r, f, '½ × 6 × 4 = 12', f.display, 32, kit.ACCENT_DEEP, 924, 244, 0)
    kit.label(r, f, 'left side   ' .. string.format('%.1f', la), f.mono, 15, kit.ORANGE, 924, 296, 0)
    kit.label(r, f, 'right side  ' .. string.format('%.1f', lb), f.mono, 15, kit.ORANGE, 924, 324, 0)
end

local function drawTri3(g: G, r: Renderer, showHeight: boolean, labels: boolean)
    local f = g.fonts
    local P = px({ Vector.xy(0, 4), Vector.xy(10, 4), Vector.xy(3, 0) }, F3X, F3Y, U3)
    kit.land(r, P, kit.style(U3, Vector.xy(F3X, F3Y)))
    local ls = lines3()
    local d = ls.drop
    r:drawPath(kit.dashed(d[1].x, d[1].y, d[2].x, d[2].y, 9, 7), kit.stroke(kit.INK, 3))
    if labels then
        kit.halo(r, f, '5 m', f.body, 19, kit.ORANGE, F3X + 1.5 * U3 - 22, F3Y + 2 * U3 - 10, 1)
        kit.halo(r, f, '10 m', f.body, 19, kit.INK, F3X + 5 * U3, F3Y + 4 * U3 + 40, 0.5)
    end
    if showHeight then
        r:drawPath(kit.line(d[1].x, d[1].y, d[2].x, d[2].y), kit.stroke(kit.GOLD, 7))
        r:drawPath(kit.corner(d[2], 1, 0, 0, -1, 14), kit.stroke(kit.GOLD, 4))
        kit.halo(r, f, '4 m', f.body, 19, kit.GOLD_DEEP, d[1].x + 14, F3Y + 2.4 * U3, 0)
    end
end

local function drawStep3(g: G, r: Renderer)
    drawTri3(g, r, S.picked == 'drop', true)
    if S.picked == '' then
        for k, ab in lines3() do
            local c: Color? = nil
            local w = 7
            if S.wrong == k and g.t - S.wrongAt < 0.9 then
                c = kit.RED
            elseif S.hoverLine == k then
                c = kit.GOLD
            end
            if c ~= nil then
                r:drawPath(kit.line(ab[1].x, ab[1].y, ab[2].x, ab[2].y), kit.stroke(c, w))
            end
        end
        if S.wrong ~= '' and g.t - S.wrongAt > 2 then
            -- after a miss, the right one blinks gently
            local d = lines3().drop
            local k = 0.5 + 0.5 * math.sin(g.t * 6)
            r:drawPath(kit.line(d[1].x, d[1].y, d[2].x, d[2].y), kit.stroke(kit.alpha(kit.GOLD, k), 6))
        end
    end
    local f = g.fonts
    kit.label(r, f, 'Tap a line', f.body, 16, kit.INK_SOFT, 1000, 300, 0.5)
end

local function drawStep4(g: G, r: Renderer)
    local f = g.fonts
    r:save()
    r:transform(Mat2D.withTranslation(-90, 0))
    drawTri3(g, r, true, true)
    r:restore()
    if S.solvedAt >= 0 then
        kit.rule(r, f, 'area = ½ × base × height', '½ × 10 × 4 = 20 square metres', kit.clamp((g.t - S.solvedAt) * 1.5, 0, 1), 420, 486)
    end
    kit.keypadDraw(r, f, S.kp, 'Land in square metres', 'sq m', g.t)
end

function L.draw(g: G, r: Renderer)
    if g.step == 1 then
        drawStep1(g, r)
    elseif g.step == 2 then
        drawStep2(g, r)
    elseif g.step == 3 then
        drawStep3(g, r)
    else
        drawStep4(g, r)
    end
end

-- input ----------------------------------------------------------------------------------

local function checkAnswer(g: G)
    local v = tonumber(S.kp.value) or -1
    if v == 20 then
        S.kp.okT = 3
        S.solvedAt = g.t
        g.done()
        g.burst(1000, 300, 40)
        g.say('l4s4done')
    else
        g.sfx('oops')
        kit.keypadWrong(S.kp, 'Not quite. Have another go.')
        g.say(if v == 40 then 'l4n40' elseif v == 25 then 'l4n25' else 'l4nx')
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
            g.sfx('pickup')
            return true
        end
    elseif g.step == 3 and S.picked == '' then
        local k = lineAt(p)
        if k == 'drop' then
            S.picked = 'drop'
            g.sfx('snap')
            g.sfx('chime')
            g.done()
            g.say('l4s3done')
        elseif k ~= '' then
            S.wrong, S.wrongAt = k, g.t
            g.sfx('oops')
            g.say(if k == 'base' then 'l4base' else 'l4slant')
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
                goHome(g, 'wrongway')
            end
        elseif math.abs(S.tx - STAGE) > 24 or math.abs(S.ty) > 24 then
            goHome(g, if rightWay() then 'notthere' else 'wrongway')
        end
    elseif g.step == 2 and S.dragging then
        S.dragging = false
        g.sfx('drop')
        if (S.apexTarget < -0.6 or S.apexTarget > 6.6) and not S.outside then
            S.outside = true
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
        S.apexTarget = kit.clamp(S.apexTarget + (if k == 262 then 1 else -1), -4.5, 10.5)
        S.ghostT = 1
        L.up(g, Vector.xy(0, 0))
        return true
    elseif g.step == 3 and k == 32 and S.picked == '' then
        local d = lines3().drop
        L.down(g, Vector.xy(d[1].x, (d[1].y + d[2].y) / 2))
        return true
    elseif g.step == 4 and S.solvedAt < 0 then
        local res = kit.keypadKey(S.kp, k)
        if res == 'ok' then
            checkAnswer(g)
            return true
        end
        return res ~= ''
    end
    return false
end

function L.thumb(g: G, r: Renderer, x: number, y: number, w: number, h: number)
    local u = 16
    local ox, oy = x + w / 2 - 4 * u, y + h / 2 - 2 * u
    local k = kit.smooth(((g.t * 0.35) % 1) * 1.5)
    local T0 = kit.toPx(T, ox, oy, u)
    r:drawPath(kit.poly(T0), kit.fill(kit.GRASS))
    local C = kit.rotate(T, PIVOT, math.pi * k)
    local Q = kit.toPx(C, ox + (1 - k) * 4 * u + k * 2 * u, oy - math.sin(k * math.pi) * 8, u)
    r:drawPath(kit.poly(Q), kit.fill(kit.GRASS_COPY))
    r:drawPath(kit.poly(Q), kit.stroke(kit.GOLD, 2))
end

return L
