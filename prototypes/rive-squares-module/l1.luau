-- Lesson 1 · Square numbers
--   1. drag a gold corner along the diagonal: the square grows a border at a time, and 1, 4, 9, 16, 25, 36 are collected
--   2. three piles of tiles (12, 16, 20): pick one and it tries to build a square; only 16 leaves nothing over
--   3. 7² on the keypad -> 49 (14 is the "doubled, not squared" slip)

local kit = require('kit')
type G = kit.G
type Keypad = kit.Keypad
type Choice = kit.Choice

type St = {
    n: number,
    maxN: number,
    dragging: boolean,
    held: number,
    sign: number,
    bornAt: { [number]: number }, -- cell (row * 100 + col) -> when it appeared
    doneAt: number,
    -- step 2
    piles: { Choice },
    pile: number, -- the pile being tried (0: none yet)
    pileAt: number,
    landed: number,
    judged: boolean,
    solved: boolean,
    -- step 3
    kp: Keypad,
    solvedAt: number,
}

local GX, GY, GU, MAXN = 150, 200, 56, 6
local PX, PY, PU = 190, 210, 60 -- step 2: where a pile builds its square
local QX, QY, QU = 170, 226, 44 -- step 3: the 7 by 7 square
local DROP_GAP = 0.05 -- seconds between one tile of a pile and the next

local S: St = {
    n = 1, maxN = 1, dragging = false, held = 0, sign = 0, bornAt = {}, doneAt = -1,
    piles = {}, pile = 0, pileAt = 0, landed = 0, judged = false, solved = false,
    kp = kit.keypad(860, 172), solvedAt = -1,
}

local L = {}
local lastHover = Vector.xy(-100, -100)

-- step 1 ------------------------------------------------------------------------------

local function handlePos(): Vector
    return Vector.xy(GX + S.n * GU, GY + S.n * GU)
end

local function setSize(g: G, n: number)
    local nn = kit.clamp(n, 1, MAXN)
    if nn == S.n then
        return
    end
    for row = 0, nn - 1 do
        for c = 0, nn - 1 do
            if c >= S.n or row >= S.n then
                S.bornAt[row * 100 + c] = g.t
            end
        end
    end
    S.n = nn
    S.sign = 1
    g.tick(nn * 2 - 1)
    if nn > S.maxN then
        S.maxN = nn
        if nn == MAXN and S.doneAt < 0 then
            S.doneAt = g.t
            g.done()
            g.burst(GX + MAXN * GU / 2, GY + MAXN * GU / 2, 50)
            g.say('l1s1done')
        end
    end
end

local function drawStep1(g: G, r: Renderer)
    local f = g.fonts
    local side = MAXN * GU
    -- the floor the square can grow over
    r:drawPath(kit.rrect(GX - 10, GY - 10, side + 20, side + 20, 14), kit.fill(kit.PAGE))
    local gp = Path.new()
    for i = 0, MAXN do
        gp:moveTo(Vector.xy(GX + i * GU, GY))
        gp:lineTo(Vector.xy(GX + i * GU, GY + side))
        gp:moveTo(Vector.xy(GX, GY + i * GU))
        gp:lineTo(Vector.xy(GX + side, GY + i * GU))
    end
    r:drawPath(gp, kit.stroke(kit.LINE, 1.5))
    -- the diagonal the corner runs along
    r:drawPath(kit.dashed(GX, GY, GX + side, GY + side, 6, 8), kit.stroke(kit.alpha(kit.GOLD, 0.6), 2))

    local full = S.n == MAXN
    for row = 0, S.n - 1 do
        for c = 0, S.n - 1 do
            local k = kit.clamp((g.t - (S.bornAt[row * 100 + c] or -9)) / 0.3, 0, 1)
            local glow = 0
            if S.doneAt >= 0 then
                local wave = g.t - S.doneAt - (c + row) * 0.05
                glow = if wave > 0 and wave < 0.6 then math.sin(wave / 0.6 * math.pi) else 0
            end
            local x, y = GX + c * GU, GY + row * GU
            if k < 1 then
                local s = kit.back(k)
                r:save()
                r:transform(Mat2D.withTranslation(x + GU / 2, y + GU / 2) * Mat2D.withScale(s, s) * Mat2D.withTranslation(-(x + GU / 2), -(y + GU / 2)))
                kit.tile(r, x, y, GU, 1, glow)
                r:restore()
            else
                kit.tile(r, x, y, GU, 1, glow)
            end
        end
    end
    local e = S.n * GU
    r:drawPath(kit.rect(GX, GY, e, e), kit.stroke(if full then kit.ACCENT else kit.GOLD, 3.5))
    kit.halo(r, f, tostring(S.n), f.display, 22, kit.INK, GX + e / 2, GY - 26, 0.5)
    kit.halo(r, f, tostring(S.n), f.display, 22, kit.INK, GX - 30, GY + e / 2, 0.5)
    local hp = handlePos()
    kit.knob(r, g.t, hp.x, hp.y, 'slide', S.held, not S.dragging and S.maxN == 1)
    -- a ghost finger shows the drag until the first move
    if S.maxN == 1 and not S.dragging and g.age > 3 then
        local k = ((g.age - 3) % 2.6) / 2.6
        local a = if k < 0.1 then k / 0.1 elseif k > 0.8 then (1 - k) / 0.2 else 1
        local d = GU + kit.smooth((k - 0.1) / 0.7) * 3 * GU
        kit.finger(r, GX + d, GY + d, a, true)
    end

    -- readout
    local bx = 660
    local N = S.n * S.n
    r:drawPath(kit.rrect(bx, 196, 500, 140, 22), kit.fill(if full then kit.ACCENT_WASH else kit.PAGE))
    r:drawPath(kit.rrect(bx, 196, 500, 140, 22), kit.stroke(if full then kit.ACCENT else kit.LINE, 2))
    kit.label(r, f, 'TILES IN THE SQUARE', f.mono, 12, kit.INK_SOFT, bx + 24, 222, 0)
    local sc = 1 + 0.1 * math.sin(kit.clamp(S.sign, 0, 1) * math.pi)
    r:save()
    r:transform(Mat2D.withTranslation(bx + 24, 274) * Mat2D.withScale(sc, sc) * Mat2D.withTranslation(-(bx + 24), -274))
    kit.label(r, f, S.n .. ' × ' .. S.n .. ' = ' .. N, f.display, 46, if full then kit.ACCENT_DEEP else kit.INK, bx + 24, 274, 0)
    r:restore()
    kit.label(r, f, 'We write ' .. S.n .. '² = ' .. N .. ' and say ' .. S.n .. ' squared.', f.body, 16, kit.INK_SOFT, bx + 24, 316, 0)

    -- the square numbers met so far
    kit.label(r, f, 'SQUARE NUMBERS SO FAR', f.mono, 12, kit.INK_SOFT, bx, 378, 0)
    for i = 1, MAXN do
        local x, y = bx + (i - 1) * 85, 396
        local on = i <= S.maxN
        local cur = i == S.n
        r:drawPath(kit.rrect(x, y, 75, 54, 16), kit.fill(if on then kit.SURFACE else kit.PAGE))
        r:drawPath(kit.rrect(x, y, 75, 54, 16), kit.stroke(if cur then kit.GOLD elseif on then kit.ACCENT else kit.LINE, if cur then 3 elseif on then 2 else 1.5))
        kit.label(r, f, if on then tostring(i * i) else '?', f.display, 24, if on then kit.INK else kit.INK_FAINT, x + 37.5, y + 27, 0.5)
        kit.label(r, f, i .. '²', f.mono, 14, kit.INK_SOFT, x + 37.5, y + 74, 0.5)
    end
end

-- step 2 ------------------------------------------------------------------------------

local function sideFor(n: number): number
    return math.floor(math.sqrt(n) + 1e-6)
end

local function tryPile(g: G, n: number)
    S.pile, S.pileAt, S.landed, S.judged = n, g.t, 0, false
    g.sfx('whoosh')
end

local function drawStep2(g: G, r: Renderer)
    local f = g.fonts
    local n = S.pile
    local s = if n > 0 then sideFor(n) else 4
    local side = s * PU
    -- where the square goes
    for i = 0, 3 do
        local a = Vector.xy(PX + (if i == 1 or i == 2 then side else 0), PY + (if i >= 2 then side else 0))
        local b = Vector.xy(PX + (if i == 0 or i == 1 then side else 0), PY + (if i == 1 or i == 2 then side else 0))
        r:drawPath(kit.dashed(a.x, a.y, b.x, b.y, 10, 8), kit.stroke(kit.alpha(kit.INK, 0.22), 2))
    end
    if n == 0 then
        kit.label(r, f, 'Pick a pile of tiles', f.body, 18, kit.INK_FAINT, PX + side / 2, PY + side / 2, 0.5)
    end
    local over = n - s * s
    local age = g.t - S.pileAt
    for i = 0, n - 1 do
        local drop = kit.clamp((age - i * DROP_GAP) / 0.45, 0, 1)
        if drop > 0 then
            if i < s * s then
                local glow = if S.solved then 0.5 + 0.3 * math.sin(g.t * 3 + i * 0.4) else 0
                kit.tile(r, PX + (i % s) * PU, PY + math.floor(i / s) * PU, PU, drop, glow)
            else
                -- the ones that do not fit wait in a row underneath
                local x, y = PX + (i - s * s) * PU, PY + side + 24
                kit.tile(r, x, y, PU, drop, 0)
                if drop >= 1 then
                    r:drawPath(kit.rrect(x + 3, y + 3, PU - 6, PU - 6, 6), kit.fill(kit.alpha(kit.RED, 0.14)))
                    r:drawPath(kit.rrect(x + 3, y + 3, PU - 6, PU - 6, 6), kit.stroke(kit.RED, 2.5))
                end
            end
        end
    end
    if S.judged then
        local k = kit.clamp((age - n * DROP_GAP - 0.7) * 2, 0, 1)
        kit.bracket(r, f, Vector.xy(PX, PY - 22), Vector.xy(PX + side, PY - 22), 0, -1, tostring(s), k, kit.INK)
        kit.bracket(r, f, Vector.xy(PX - 24, PY), Vector.xy(PX - 24, PY + side), -1, 0, tostring(s), k, kit.INK)
        if over > 0 then
            r:save()
            r:modulateOpacity(k)
            kit.label(r, f, over .. ' left over', f.display, 22, kit.RED, PX + over * PU + 18, PY + side + 24 + PU / 2, 0)
            r:restore()
        end
    end

    -- the piles
    kit.label(r, f, 'HOW MANY TILES IN THE PILE?', f.mono, 12, kit.INK_SOFT, 950, 214, 0.5)
    kit.choicesDraw(r, f, S.piles, lastHover, if S.solved then 16 else -1, g.t)
    if S.judged then
        local k = kit.clamp((age - n * DROP_GAP - 0.9) * 1.5, 0, 1)
        if over > 0 then
            kit.rule(r, f, n .. ' = ' .. s .. ' × ' .. s .. ' + ' .. over, over .. ' left over, so not a square number', k, 950, 340)
        else
            kit.rule(r, f, n .. ' = ' .. s .. ' × ' .. s, 'none left over: a square number', k, 950, 340)
        end
    end
end

-- step 3 ------------------------------------------------------------------------------

local function drawStep3(g: G, r: Renderer)
    local f = g.fonts
    local side = 7 * QU
    for row = 0, 6 do
        for c = 0, 6 do
            local glow = 0
            if S.solvedAt >= 0 then
                local wave = g.t - S.solvedAt - (c + row) * 0.05
                glow = if wave > 0 and wave < 0.6 then math.sin(wave / 0.6 * math.pi) else 0
            end
            kit.tile(r, QX + c * QU, QY + row * QU, QU, kit.clamp((g.age - (row * 7 + c) * 0.012) / 0.4, 0, 1), glow)
        end
    end
    local k = kit.clamp((g.age - 0.9) * 1.5, 0, 1)
    kit.bracket(r, f, Vector.xy(QX, QY - 24), Vector.xy(QX + side, QY - 24), 0, -1, '7', k, kit.INK)
    kit.bracket(r, f, Vector.xy(QX - 26, QY), Vector.xy(QX - 26, QY + side), -1, 0, '7', k, kit.INK)
    if S.solvedAt >= 0 then
        kit.rule(r, f, '7² = 7 × 7 = 49', 'seven rows of seven', kit.clamp((g.t - S.solvedAt) * 1.5, 0, 1), 668, 320)
    end
    kit.keypadDraw(r, f, S.kp, 'Tiles in the square: 7²', 'tiles', g.t)
end

local function check(g: G)
    local v = tonumber(S.kp.value) or -1
    if v == 49 then
        S.kp.okT = 3
        S.solvedAt = g.t
        g.done()
        g.burst(1000, 300, 40)
        g.say('l1s3done')
    else
        g.sfx('oops')
        kit.keypadWrong(S.kp, 'Not quite. Have another go.')
        g.say(if v == 14 then 'l1n14' else 'l1nx')
    end
end

-- protocol ---------------------------------------------------------------------------------

L.id = 'square-numbers'
L.tag = 'SQUARE NUMBERS'
L.title = 'A number times itself'
L.blurb = 'Grow a square and count its tiles.'
L.steps = {
    { title = 'Grow a square', line = 'l1s1', task = 'Drag the gold corner out to a 6 by 6 square' },
    { title = 'Square or not?', line = 'l1s2', task = 'Find the pile that makes a perfect square' },
    { title = 'Your turn', line = 'l1s3', task = 'Work out 7² on the keypad' },
}

function L.enter(g: G, step: number)
    S.n, S.maxN, S.dragging, S.held, S.sign, S.bornAt, S.doneAt = 1, 1, false, 0, 0, {}, -1
    S.piles = kit.choices(g.fonts, { '12', '16', '20' }, { 12, 16, 20 }, 950, 236)
    S.pile, S.pileAt, S.landed, S.judged, S.solved = 0, 0, 0, false, false
    S.kp = kit.keypad(860, 172)
    S.solvedAt = -1
end

function L.advance(g: G, dt: number)
    S.sign = math.max(0, S.sign - dt * 3)
    S.held = kit.follow(S.held, if S.dragging then 1 else 0, 18, dt)
    kit.keypadAdvance(S.kp, dt)
    if g.step == 2 and S.pile > 0 and not S.judged then
        local age = g.t - S.pileAt
        -- a tick as each tile lands
        local landed = math.min(S.pile, math.floor((age - 0.3) / DROP_GAP) + 1)
        if landed > S.landed then
            S.landed = landed
            g.tick(landed - 1)
        end
        if age > S.pile * DROP_GAP + 0.7 then
            S.judged = true
            if S.pile == 16 then
                S.solved = true
                g.done()
                g.sfx('sparkle')
                g.burst(PX + 2 * PU, PY + 2 * PU, 40)
                g.say('l1s2done')
            else
                g.sfx('oops')
                for _, c in S.piles do
                    if c.value == S.pile then
                        c.out = true
                    end
                end
                g.say(if S.pile == 12 then 'l1s2n12' else 'l1s2n20')
            end
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

function L.down(g: G, p: Vector): boolean
    lastHover = p
    if g.step == 1 then
        if kit.dist(p, handlePos()) < 40 then
            S.dragging = true
            g.sfx('pickup')
            return true
        end
    elseif g.step == 2 then
        local c = kit.choiceHit(S.piles, p)
        if c ~= nil and not S.solved then
            tryPile(g, c.value)
            return true
        end
    elseif S.solvedAt < 0 then
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
    lastHover = p
    if g.step == 1 and S.dragging then
        -- the corner stays on the diagonal: its distance along it sets the side
        setSize(g, math.floor(((p.x - GX) + (p.y - GY)) / 2 / GU + 0.5))
    end
end

function L.up(g: G, p: Vector)
    if S.dragging then
        S.dragging = false
        g.sfx('drop')
    end
end

function L.key(g: G, k: number): boolean
    if g.step == 1 then
        local d = if k == 32 or k == 262 or k == 264 then 1 elseif k == 263 or k == 265 then -1 else 0
        if d ~= 0 then
            setSize(g, S.n + d)
            return true
        end
    elseif g.step == 2 and k >= 49 and k <= 51 and not S.solved then
        tryPile(g, ({ 12, 16, 20 })[k - 48])
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
    local u = math.floor((h - 22) / 5)
    local ox, oy = x + (w - 5 * u) / 2, y + (h - 5 * u) / 2
    local cyc = (g.t * 1.1) % 7
    local n = math.min(5, 1 + math.floor(cyc))
    for row = 0, 4 do
        for c = 0, 4 do
            if c < n and row < n then
                local fresh = (c == n - 1 or row == n - 1) and cyc < 5
                kit.tile(r, ox + c * u, oy + row * u, u, if fresh then kit.clamp((cyc % 1) * 3, 0, 1) else 1, 0)
            else
                r:drawPath(kit.rect(ox + c * u + 1, oy + row * u + 1, u - 2, u - 2), kit.stroke(kit.LINE, 1))
            end
        end
    end
    r:drawPath(kit.circle(ox + n * u, oy + n * u, 6), kit.fill(kit.GOLD))
    r:drawPath(kit.circle(ox + n * u, oy + n * u, 6), kit.stroke(kit.SURFACE, 2))
end

return L
