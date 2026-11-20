-- Lesson 5 · The trapezium: ½ × (a + b) × h
--   1. the triangle trick again: tap for a copy, spin it, slide it in. The base of the parallelogram is
--      the bottom plus the copy's top, 5 + 3 = 8
--   2. work out the whole parallelogram on the keypad (32); then the copy lifts off and the sign counts to 16
--   3. stretch the top with a gold handle: shrink it to nothing (a triangle), or make it 5 (a parallelogram)
--   4. a new field on the keypad: top 4, bottom 8, height 5 -> 30

local kit = require('kit')
type G = kit.G
type Keypad = kit.Keypad

type St = {
    phase: string,
    phaseAt: number,
    tx: number,
    ty: number,
    rot: number,
    rotTarget: number,
    spinning: boolean,
    spinA: number,
    dragging: boolean,
    grabX: number,
    grabY: number,
    held: number,
    flyFrom: Vector,
    misses: number,
    -- step 2
    kp: Keypad,
    solvedAt: number,
    lastCount: number,
    -- step 3
    a: number,
    aShown: number,
    seen0: boolean,
    seen5: boolean,
    seen0At: number,
    seen5At: number,
}

local L = {}

local U = 52
local FX, FY = 80, 240
local P = { Vector.xy(0, 4), Vector.xy(5, 4), Vector.xy(4, 0), Vector.xy(1, 0) }
local PIVOT = Vector.xy(2.5, 2)
local KNOB = Vector.xy(3.5, 2.9)
local STAGE = 6.4 * U
local TARGET = 4 * U
local U3, F3X, F3Y = 60, 420, 250
local U4, F4X, F4Y = 42, 130, 240

local S: St = {
    phase = 'tap', phaseAt = 0, tx = 0, ty = 0, rot = 0, rotTarget = 0, spinning = false, spinA = 0,
    dragging = false, grabX = 0, grabY = 0, held = 0, flyFrom = Vector.xy(0, 0), misses = 0,
    kp = kit.keypad(860, 172), solvedAt = -1, lastCount = 0,
    a = 3, aShown = 3, seen0 = false, seen5 = false, seen0At = -1, seen5At = -1,
}

local function copyShape(): { Vector }
    return kit.toPx(kit.rotate(P, PIVOT, S.rot), FX + S.tx, FY + S.ty, U)
end

local function pivotPos(): Vector
    return Vector.xy(FX + S.tx + PIVOT.x * U, FY + S.ty + PIVOT.y * U)
end

local function knobPos(): Vector
    local k = kit.rotate({ KNOB }, PIVOT, S.rot)[1]
    return Vector.xy(FX + S.tx + k.x * U, FY + S.ty + k.y * U)
end

local function rightWay(): boolean
    return math.abs((S.rotTarget % (2 * math.pi)) - math.pi) < 0.05
end

L.id = 'trapezium'
L.tag = 'TRAPEZIUM'
L.title = 'Two parallel sides'
L.blurb = 'One rule for every shape so far.'
L.steps = {
    { title = 'The same trick, a new shape', line = 'l5s1', task = 'Make a parallelogram from two trapeziums' },
    { title = 'Work out the parallelogram', line = 'l5s2', task = 'Land in the whole parallelogram' },
    { title = 'Stretch the top', line = 'l5s3', task = 'Shrink the top all the way to nothing' },
    { title = 'Your turn', line = 'l5s4', task = 'Work out the land on the keypad' },
}

function L.enter(g: G, step: number)
    S.phase, S.phaseAt, S.tx, S.ty, S.rot, S.rotTarget = 'tap', g.t, 0, 0, 0, 0
    S.spinning, S.dragging, S.held, S.misses = false, false, 0, 0
    S.kp = kit.keypad(860, 172)
    S.solvedAt, S.lastCount = -1, 0
    S.a, S.aShown, S.seen0, S.seen5, S.seen0At, S.seen5At = 3, 3, false, false, -1, -1
    if step == 2 then
        -- already joined
        S.phase, S.phaseAt, S.tx, S.ty, S.rot, S.rotTarget = 'joined', g.t - 10, TARGET, 0, math.pi, math.pi
    end
end

local function snapNow(g: G)
    S.phase = 'snapped'
    S.phaseAt = g.t
    S.tx, S.ty, S.rot, S.rotTarget = TARGET, 0, math.pi, math.pi
    g.sfx('snap')
    g.sfx('sparkle')
    g.shake(3)
    g.done()
    g.say('l5s1done')
end

function L.advance(g: G, dt: number)
    S.held = kit.follow(S.held, if S.dragging or S.spinning then 1 else 0, 18, dt)
    local age = g.t - S.phaseAt
    if g.step == 1 then
        if S.phase == 'appear' then
            local k = kit.smooth(age / 0.95)
            S.tx = STAGE * k
            S.ty = -math.sin(k * math.pi) * 40
            if age >= 1 then
                S.tx, S.ty, S.phase, S.phaseAt = STAGE, 0, 'fit', g.t
                g.sfx('thud')
                g.sayNext('spin')
            end
        elseif S.phase == 'fit' and not S.spinning then
            S.rot = kit.follow(S.rot, S.rotTarget, 16, dt)
        elseif S.phase == 'fly' then
            local k = kit.ease(age / 0.22)
            S.tx = kit.lerp(S.flyFrom.x, TARGET, k)
            S.ty = kit.lerp(S.flyFrom.y, 0, k)
            S.rot = kit.follow(S.rot, math.pi, 30, dt)
            if age >= 0.22 then
                snapNow(g)
            end
        end
    elseif g.step == 2 and S.solvedAt >= 0 then
        local k = g.t - S.solvedAt
        local n = if k < 1.6 then 32 else 32 - kit.clamp(math.floor((k - 1.6) / 0.07), 0, 16)
        if n ~= S.lastCount then
            if S.lastCount > 0 then
                g.tick(32 - n)
            end
            if n == 16 then
                g.sfx('chime')
            end
            S.lastCount = n
        end
    elseif g.step == 3 then
        S.aShown = kit.follow(S.aShown, S.a, 18, dt)
    end
    kit.keypadAdvance(S.kp, dt)
end

-- drawing ------------------------------------------------------------------------------

local function drawPair(g: G, r: Renderer, away: number)
    local orig = kit.toPx(P, FX, FY, U)
    local bob = if S.phase == 'tap' and g.age > 2 then math.sin(g.t * 4) * 3 else 0
    local st = kit.style(U, Vector.xy(FX, FY - bob))
    st.edge = if S.phase == 'tap' then 1 else 0
    kit.land(r, kit.offset(orig, 0, -bob), st)
    if S.phase ~= 'tap' then
        local Q = kit.offset(copyShape(), away * 3 * U, -away * 60)
        local cst = kit.style(U, pivotPos())
        cst.copy = true
        cst.gridRot = S.rot
        local ga = kit.rotate({ Vector.xy(FX + S.tx, FY + S.ty) }, pivotPos(), S.rot)[1]
        cst.gridAt = Vector.xy(ga.x + away * 3 * U, ga.y - away * 60)
        cst.lift = if S.phase == 'appear' then 0.8 else S.held + away
        cst.edge = if S.phase == 'fit' then 1 else 0
        cst.alpha = 1 - away
        kit.land(r, Q, cst)
        if S.phase == 'fit' then
            local kp = knobPos()
            kit.knob(r, g.t, kp.x, kp.y, 'spin', if S.spinning then 1 else 0, not S.spinning and not S.dragging)
        end
    end
end

local function drawStep1(g: G, r: Renderer)
    local f = g.fonts
    local age = g.t - S.phaseAt
    if S.phase == 'fit' or S.phase == 'fly' then
        local slot = kit.toPx({ Vector.xy(9, 0), Vector.xy(4, 0), Vector.xy(5, 4), Vector.xy(8, 4) }, FX, FY, U)
        local d = math.sqrt((S.tx - TARGET) ^ 2 + S.ty ^ 2)
        local gk = if rightWay() and d < 3 * U then kit.clamp(1.3 - d / (2.6 * U), 0.2, 1) elseif S.misses >= 2 then 0.45 else 0
        if gk > 0 then
            r:drawPath(kit.poly(slot), kit.fill(kit.alpha(kit.GOLD_WASH, 0.6 * gk)))
            r:drawPath(kit.poly(slot), kit.stroke(kit.alpha(kit.GOLD, gk), 3))
        end
    end
    drawPair(g, r, 0)
    -- labels for the parallel sides
    if S.phase == 'tap' or S.phase == 'appear' then
        kit.halo(r, f, 'top 3', f.body, 18, kit.INK, FX + 2.5 * U, FY - 24, 0.5)
        kit.halo(r, f, 'bottom 5', f.body, 18, kit.INK, FX + 2.5 * U, FY + 4 * U + 40, 0.5)
        -- parallel arrows
        for _, y in { FY, FY + 4 * U } do
            local x = FX + 2.5 * U
            r:drawPath(kit.polyline({ Vector.xy(x - 8, y - 7), Vector.xy(x, y), Vector.xy(x - 8, y + 7) }), kit.stroke(kit.SURFACE, 3))
        end
    end
    if S.phase == 'snapped' then
        if age < 1.2 then
            local a, b = Vector.xy(FX + 5 * U, FY + 4 * U), Vector.xy(FX + 4 * U, FY)
            r:save()
            r:modulateOpacity(kit.clamp(1.2 - age, 0, 1))
            r:drawPath(kit.line(a.x, a.y, b.x, b.y), Paint.with({ style = 'stroke', thickness = 16, color = kit.alpha(kit.GOLD, 0.55), cap = 'round', feather = 5 }))
            r:drawPath(kit.line(a.x, a.y, b.x, b.y), kit.stroke(kit.SURFACE, 4))
            r:restore()
        end
        local para = kit.toPx({ Vector.xy(0, 4), Vector.xy(8, 4), Vector.xy(9, 0), Vector.xy(1, 0) }, FX, FY, U)
        r:drawPath(kit.partialOutline(para, (age - 0.3) / 0.9), kit.stroke(kit.GOLD, 5))
        local y = FY + 4 * U + 30
        kit.bracket(r, f, Vector.xy(FX, y), Vector.xy(FX + 5 * U, y), 0, 1, '5', kit.clamp((age - 1.4) * 1.5, 0, 1), kit.INK)
        kit.bracket(r, f, Vector.xy(FX + 5 * U, y), Vector.xy(FX + 8 * U, y), 0, 1, '3', kit.clamp((age - 2.4) * 1.5, 0, 1), Color.rgb(63, 122, 57))
        kit.rule(r, f, 'base = 5 + 3 = 8', 'the bottom plus the top', kit.clamp((age - 3.4) * 1.5, 0, 1), 1000, 300)
    end
    kit.sign(r, f, 'LAND', '? squares', 0, 1000, 176)
end

local function drawStep2(g: G, r: Renderer)
    local f = g.fonts
    local k = if S.solvedAt >= 0 then g.t - S.solvedAt else -1
    local away = if k >= 0 then kit.clamp((k - 1.2) / 1.0, 0, 1) else 0
    drawPair(g, r, away)
    local hx = FX + 1 * U
    r:drawPath(kit.dashed(hx, FY, hx, FY + 4 * U, 9, 7), kit.stroke(kit.INK, 3))
    r:drawPath(kit.corner(Vector.xy(hx, FY + 4 * U), 1, 0, 0, -1, 13), kit.stroke(kit.INK, 2.5))
    kit.halo(r, f, 'height 4', f.body, 18, kit.INK, hx + 16, FY + 1.6 * U, 0)
    local y = FY + 4 * U + 30
    kit.bracket(r, f, Vector.xy(FX, y), Vector.xy(FX + 8 * U, y), 0, 1, 'base 8', 1 - away, kit.INK)
    if k > 2.4 then
        kit.tag(r, f, 'half', FX + 2.6 * U, FY + 2.6 * U, kit.clamp((k - 2.4) * 2, 0, 1))
        kit.rule(r, f, 'area = ½ × (a + b) × h', 'a, b: the parallel sides  ·  ½ × (3 + 5) × 4 = 16', kit.clamp((k - 3) * 1.5, 0, 1), 420, 486)
    end
    if S.lastCount > 0 then
        kit.sign(r, f, if away > 0 then 'TRAPEZIUM' else 'PARALLELOGRAM', S.lastCount .. ' squares', 0, 600, 168)
    end
    kit.keypadDraw(r, f, S.kp, 'Land in the parallelogram', 'squares', g.t)
end

local function shapeFor(a: number): { Vector }
    return { Vector.xy(0, 4), Vector.xy(5, 4), Vector.xy(1 + a, 0), Vector.xy(1, 0) }
end

local function drawStep3(g: G, r: Renderer)
    local f = g.fonts
    local a = S.aShown
    local Q = kit.toPx(shapeFor(a), F3X, F3Y, U3)
    kit.land(r, Q, kit.style(U3, Vector.xy(F3X, F3Y)))
    local hx = F3X + U3
    r:drawPath(kit.dashed(hx, F3Y, hx, F3Y + 4 * U3, 9, 7), kit.stroke(kit.INK, 3))
    kit.halo(r, f, 'height 4', f.body, 18, kit.INK, hx - 14, F3Y + 2 * U3, 1)
    kit.halo(r, f, 'top ' .. S.a, f.body, 19, kit.GOLD_DEEP, F3X + (1 + a / 2) * U3, F3Y - 28, 0.5)
    kit.halo(r, f, 'bottom 5', f.body, 19, kit.INK, F3X + 2.5 * U3, F3Y + 4 * U3 + 40, 0.5)
    kit.knob(r, g.t, F3X + (1 + a) * U3, F3Y, 'slide', S.held, not S.dragging and not S.seen0)
    local v = (S.a + 5) * 4 / 2
    r:drawPath(kit.rrect(60, 176, 300, 150, 22), kit.fill(kit.ACCENT_WASH))
    kit.label(r, f, 'AREA', f.mono, 12, kit.INK_SOFT, 84, 202, 0)
    kit.label(r, f, '½ × (' .. S.a .. ' + 5) × 4', f.display, 28, kit.ACCENT_DEEP, 84, 244, 0)
    kit.label(r, f, '= ' .. kit.num(v), f.display, 36, kit.ACCENT_DEEP, 84, 292, 0)
    if S.seen0 then
        kit.tag(r, f, 'top 0: a triangle!', 210, 380, kit.clamp((g.t - S.seen0At) * 2, 0, 1))
    end
    if S.seen5 then
        kit.tag(r, f, 'top 5: a parallelogram!', 210, 440, kit.clamp((g.t - S.seen5At) * 2, 0, 1))
    end
end

local function drawStep4(g: G, r: Renderer)
    local f = g.fonts
    local Q = kit.toPx({ Vector.xy(0, 5), Vector.xy(8, 5), Vector.xy(6, 0), Vector.xy(2, 0) }, F4X, F4Y, U4)
    kit.land(r, Q, kit.style(U4, Vector.xy(F4X, F4Y)))
    local hx = F4X + 2 * U4
    r:drawPath(kit.dashed(hx, F4Y, hx, F4Y + 5 * U4, 9, 7), kit.stroke(kit.INK, 3))
    r:drawPath(kit.corner(Vector.xy(hx, F4Y + 5 * U4), 1, 0, 0, -1, 13), kit.stroke(kit.INK, 2.5))
    kit.halo(r, f, '5 m', f.body, 19, kit.INK, hx + 16, F4Y + 2.5 * U4, 0)
    kit.halo(r, f, '4 m', f.body, 19, kit.INK, F4X + 4 * U4, F4Y - 26, 0.5)
    kit.halo(r, f, '8 m', f.body, 19, kit.INK, F4X + 4 * U4, F4Y + 5 * U4 + 40, 0.5)
    if S.solvedAt >= 0 then
        kit.rule(r, f, '½ × (4 + 8) × 5 = 30', 'add the parallel sides, times the height, halve', kit.clamp((g.t - S.solvedAt) * 1.5, 0, 1), 420, 486)
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

local function check(g: G)
    local v = tonumber(S.kp.value) or -1
    if g.step == 2 then
        if v == 32 then
            S.kp.okT = 3
            S.solvedAt = g.t
            g.done()
            g.burst(1000, 300, 30)
            g.say('l5s2done')
        else
            g.sfx('oops')
            kit.keypadWrong(S.kp, 'Not quite. Have another go.')
            g.say(if v == 20 then 'l5p20' else 'l5px')
        end
    else
        if v == 30 then
            S.kp.okT = 3
            S.solvedAt = g.t
            g.done()
            g.burst(1000, 300, 40)
            g.say('l5s4done')
        else
            g.sfx('oops')
            kit.keypadWrong(S.kp, 'Not quite. Have another go.')
            g.say(if v == 60 then 'l5n60' elseif v == 40 then 'l5n40' else 'l5nx')
        end
    end
end

local function setTop(g: G, a: number)
    local n = kit.clamp(a, 0, 5)
    if n == S.a then
        return
    end
    S.a = n
    g.tick(n * 2 + 2)
    if n == 0 and not S.seen0 then
        S.seen0, S.seen0At = true, g.t
        g.sfx('sparkle')
        g.done()
        g.say('l5tri')
        g.sayNext('l5s3done')
    elseif n == 5 and not S.seen5 then
        S.seen5, S.seen5At = true, g.t
        g.sfx('sparkle')
        g.say('l5para')
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
        if S.phase == 'tap' and kit.inside(kit.toPx(P, FX, FY, U), p) then
            S.phase, S.phaseAt = 'appear', g.t
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
    elseif (g.step == 2 or g.step == 4) and S.solvedAt < 0 then
        local res = kit.keypadDown(S.kp, p)
        if res == 'ok' then
            check(g)
        elseif res == 'key' then
            g.sfx('tick3')
        end
        return res ~= ''
    elseif g.step == 3 then
        if kit.dist(p, Vector.xy(F3X + (1 + S.aShown) * U3, F3Y)) < 44 then
            S.dragging = true
            g.sfx('pickup')
            return true
        end
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
        local nx: number = kit.clamp(p.x - S.grabX, -FX + 10, STAGE + 30)
        local ny: number = kit.clamp(p.y - S.grabY, -80, 120)
        if rightWay() and math.sqrt((nx - TARGET) ^ 2 + ny ^ 2) < 0.7 * U then
            nx = kit.lerp(nx, TARGET, 0.6)
            ny = kit.lerp(ny, 0, 0.6)
        end
        S.tx = nx
        S.ty = ny
    elseif g.step == 3 and S.dragging then
        setTop(g, math.floor((p.x - F3X) / U3 - 1 + 0.5))
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
                S.phase, S.phaseAt, S.flyFrom = 'fly', g.t, Vector.xy(S.tx, S.ty)
            end
        end
    elseif g.step == 1 and S.dragging then
        S.dragging = false
        local d = math.sqrt((S.tx - TARGET) ^ 2 + S.ty ^ 2)
        if d < 1.5 * U then
            if rightWay() then
                S.phase, S.phaseAt, S.flyFrom = 'fly', g.t, Vector.xy(S.tx, S.ty)
            else
                goHome(g, 'wrongway')
            end
        elseif math.abs(S.tx - STAGE) > 24 or math.abs(S.ty) > 24 then
            goHome(g, if rightWay() then 'notthere' else 'wrongway')
        end
    elseif g.step == 3 and S.dragging then
        S.dragging = false
        g.sfx('drop')
    end
end

function L.key(g: G, k: number): boolean
    if g.step == 1 and k == 32 then
        if S.phase == 'tap' then
            S.phase, S.phaseAt = 'appear', g.t
            g.sfx('whoosh')
        elseif S.phase == 'fit' then
            S.rotTarget = math.pi
            S.phase, S.phaseAt, S.flyFrom = 'fly', g.t, Vector.xy(S.tx, S.ty)
        end
        return true
    elseif g.step == 1 and S.phase == 'fit' and k == 82 then
        S.rotTarget += math.pi / 2
        g.sfx('snap')
        return true
    elseif (g.step == 2 or g.step == 4) and S.solvedAt < 0 then
        local res = kit.keypadKey(S.kp, k)
        if res == 'ok' then
            check(g)
            return true
        end
        return res ~= ''
    elseif g.step == 3 and (k == 262 or k == 263) then
        setTop(g, S.a + (if k == 262 then 1 else -1))
        return true
    end
    return false
end

function L.thumb(g: G, r: Renderer, x: number, y: number, w: number, h: number)
    local u = 18
    local a = 2.5 + 2.5 * math.sin(g.t * 1.1)
    local Q = kit.toPx({ Vector.xy(0, 4), Vector.xy(5, 4), Vector.xy(1 + a, 0), Vector.xy(1, 0) }, x + w / 2 - 2.8 * u, y + h / 2 - 2 * u, u)
    r:drawPath(kit.poly(Q), kit.fill(kit.GRASS))
    r:drawPath(kit.poly(Q), kit.stroke(kit.GRASS_EDGE, 2))
    r:drawPath(kit.circle(x + w / 2 - 2.8 * u + (1 + a) * u, y + h / 2 - 2 * u, 6), kit.fill(kit.GOLD))
end

return L
