-- Lesson 2 · Square patterns: the first n odd numbers add up to n² (syllabus skill SQ_PATTERNS)
--   1. tap the gold border round a square: 3, 5, 7, 9 tiles drop in, each border its own colour, and 1 + 3 + 5 + 7 + 9 = 25
--   2. why always odd: drag two strips of 4 and one corner tile onto a 4 by 4 square -> 4 + 4 + 1
--   3. 1 + 3 + 5 + 7 + 9 + 11 on the keypad -> 36 (six borders, 6 × 6)

local kit = require('kit')
type G = kit.G
type Keypad = kit.Keypad

type Piece = { w: number, h: number, hx: number, hy: number, sx: number, sy: number, x: number, y: number, placed: boolean, at: number }

type St = {
    n: number,
    bornAt: { [number]: number }, -- cell (row * 100 + col) -> when it lands
    addAt: number,
    landed: number,
    sign: number,
    doneAt: number,
    -- step 2
    pieces: { Piece },
    drag: number, -- index of the piece in hand, 0 for none
    grabX: number,
    grabY: number,
    held: number,
    order: { number }, -- tiles in each piece, in the order they went on
    allAt: number,
    -- step 3
    kp: Keypad,
    solvedAt: number,
}

local GX, GY, U, MAXN = 170, 204, 60, 5
local BX, BY, BU = 170, 204, 56 -- step 2: the 4 by 4 square
local CX, CY, CU = 170, 252, 46 -- step 3: the 6 by 6 square
local GAP = 0.07 -- seconds between one tile of a border and the next

-- one colour for each border, and a darker one for its number in the sum
local TINT: { Color } = { kit.TILE, Color.rgb(196, 228, 202), Color.rgb(250, 222, 160), Color.rgb(198, 218, 248), Color.rgb(250, 206, 178), Color.rgb(190, 224, 218) }
local TERM: { Color } = { kit.INK, kit.ACCENT, kit.GOLD_DEEP, kit.BLUE, kit.RED, kit.ACCENT_DEEP }

local function newPieces(): { Piece }
    return {
        { w = 1, h = 4, hx = 540, hy = 204, sx = BX + 4 * BU, sy = BY, x = 540, y = 204, placed = false, at = -1 },
        { w = 4, h = 1, hx = 630, hy = 204, sx = BX, sy = BY + 4 * BU, x = 630, y = 204, placed = false, at = -1 },
        { w = 1, h = 1, hx = 630, hy = 300, sx = BX + 4 * BU, sy = BY + 4 * BU, x = 630, y = 300, placed = false, at = -1 },
    }
end

local S: St = {
    n = 1, bornAt = {}, addAt = -9, landed = 0, sign = 0, doneAt = -1,
    pieces = newPieces(), drag = 0, grabX = 0, grabY = 0, held = 0, order = {}, allAt = -1,
    kp = kit.keypad(860, 172), solvedAt = -1,
}

local L = {}

-- a tile in its border's colour (it follows kit.tile's own drop, so the colour falls in with it)
local function ctile(r: Renderer, x: number, y: number, u: number, drop: number, layer: number, glow: number)
    kit.tile(r, x, y, u, drop, glow)
    if layer <= 1 then
        return
    end
    local lift = (1 - kit.bounce(drop)) * 40
    local sc = 1 + (1 - kit.clamp(drop * 1.4, 0, 1)) * 0.25
    local w = (u - 6) * sc
    local cx, cy = x + u / 2, y + u / 2 - lift
    local rad = math.max(2, u * 0.11)
    local c = TINT[math.min(layer, #TINT)]
    r:drawPath(kit.rrect(cx - w / 2, cy - w / 2, w, w, rad), kit.fill(kit.alpha(c, 0.86 * (1 - glow * 0.6))))
    r:drawPath(kit.rrect(cx - w / 2, cy - w / 2, w, w, rad), kit.stroke(kit.mix(c, kit.INK, 0.28), math.min(1.6, u * 0.05)))
    if u > 24 then
        r:drawPath(kit.rrect(cx - w / 2 + 4, cy - w / 2 + 3, w - 8, w * 0.28, rad * 0.6), kit.fill(kit.alpha(kit.SURFACE, 0.5)))
    end
end

-- the sum so far, each number in its border's colour; returns where it ends
local function drawSum(r: Renderer, f: kit.Fonts, terms: number, x: number, y: number, size: number, pop: number): number
    local cx = x
    for i = 1, terms do
        if i > 1 then
            cx += kit.label(r, f, ' + ', f.display, size, kit.INK_FAINT, cx, y, 0)
        end
        local s = tostring(2 * i - 1)
        if i == terms and pop > 0 then
            local w = kit.width(f, s, f.display, size)
            local sc = 1 + 0.25 * math.sin(kit.clamp(pop, 0, 1) * math.pi)
            r:save()
            r:transform(Mat2D.withTranslation(cx + w / 2, y) * Mat2D.withScale(sc, sc) * Mat2D.withTranslation(-(cx + w / 2), -y))
            kit.label(r, f, s, f.display, size, TERM[i], cx, y, 0)
            r:restore()
            cx += w
        else
            cx += kit.label(r, f, s, f.display, size, TERM[i], cx, y, 0)
        end
    end
    return cx
end

-- step 1 ------------------------------------------------------------------------------

local function addBorder(g: G)
    if S.n >= MAXN then
        return
    end
    local n = S.n
    local i = 0
    for row = 0, n - 1 do -- down the side
        S.bornAt[row * 100 + n] = g.t + i * GAP
        i += 1
    end
    S.bornAt[n * 100 + n] = g.t + i * GAP -- the corner
    i += 1
    for c = n - 1, 0, -1 do -- back along the bottom
        S.bornAt[n * 100 + c] = g.t + i * GAP
        i += 1
    end
    S.n = n + 1
    S.addAt = g.t
    S.landed = 0
    g.sfx('pickup')
end

local function drawStep1(g: G, r: Renderer)
    local f = g.fonts
    local n = S.n
    local settled = g.t - S.addAt > (2 * n - 1) * GAP + 0.35
    for row = 0, n - 1 do
        for c = 0, n - 1 do
            local born = S.bornAt[row * 100 + c] or -9
            local drop = kit.clamp((g.t - born) / 0.45, 0, 1)
            if drop > 0 then
                local glow = 0
                if S.doneAt >= 0 then
                    local wave = g.t - S.doneAt - (c + row) * 0.06
                    glow = if wave > 0 and wave < 0.6 then math.sin(wave / 0.6 * math.pi) else 0
                end
                ctile(r, GX + c * U, GY + row * U, U, drop, math.max(row, c) + 1, glow)
            end
        end
    end
    -- the next border, waiting to be tapped
    if n < MAXN and settled then
        local k = 0.5 + 0.5 * math.sin(g.t * 4)
        local P = {
            Vector.xy(GX + n * U, GY), Vector.xy(GX + (n + 1) * U, GY), Vector.xy(GX + (n + 1) * U, GY + (n + 1) * U),
            Vector.xy(GX, GY + (n + 1) * U), Vector.xy(GX, GY + n * U), Vector.xy(GX + n * U, GY + n * U),
        }
        r:drawPath(kit.poly(P), kit.fill(kit.alpha(kit.GOLD_WASH, 0.45 + 0.35 * k)))
        for i = 1, #P do
            local a, b = P[i], P[(i % #P) + 1]
            r:drawPath(kit.dashed(a.x, a.y, b.x, b.y, 10, 8, g.t * 24), kit.stroke(kit.alpha(kit.GOLD, 0.6 + 0.4 * k), 3))
        end
        kit.label(r, f, 'tap', f.mono, 13, kit.GOLD_DEEP, GX + (n + 0.5) * U, GY + (n + 0.5) * U, 0.5)
        if n == 1 and g.age > 3.5 then
            local ph = ((g.age - 3.5) % 1.6) / 1.6
            kit.finger(r, GX + 1.5 * U + 14, GY + 1.5 * U + 18, if ph < 0.7 then 1 else (1 - ph) / 0.3, ph > 0.25 and ph < 0.5)
        end
    end
    -- how many the last border added
    if n > 1 then
        kit.tag(r, f, '+ ' .. (2 * n - 1) .. ' tiles', GX + math.min(n + 1, MAXN) * U + 76, GY + n * U - U / 2, kit.clamp((g.t - S.addAt - (2 * n - 1) * GAP) * 3, 0, 1))
    end

    -- the sum
    local bx = 660
    local full = S.doneAt >= 0
    r:drawPath(kit.rrect(bx, 196, 500, 168, 22), kit.fill(if full then kit.ACCENT_WASH else kit.PAGE))
    r:drawPath(kit.rrect(bx, 196, 500, 168, 22), kit.stroke(if full then kit.ACCENT else kit.LINE, 2))
    kit.label(r, f, 'TILES SO FAR', f.mono, 12, kit.INK_SOFT, bx + 24, 222, 0)
    drawSum(r, f, n, bx + 24, 268, 40, S.sign)
    local total = if settled then n * n else (n - 1) * (n - 1) + S.landed
    kit.label(r, f, '= ' .. total, f.display, 34, kit.INK, bx + 24, 326, 0)
    if settled then
        local w = kit.width(f, '= ' .. total, f.display, 34)
        kit.label(r, f, '= ' .. n .. ' × ' .. n, f.display, 34, kit.ACCENT_DEEP, bx + 24 + w + 18, 326, 0)
    end
    kit.label(r, f, 'Each border has its own colour, in the square and in the sum.', f.body, 15, kit.INK_SOFT, bx, 392, 0)
    if full then
        kit.rule(r, f, '1 + 3 + 5 + 7 + 9 = 5 × 5', 'five odd numbers make a 5 by 5 square', kit.clamp((g.t - S.doneAt - 0.6) * 1.5, 0, 1), 910, 428)
    end
end

-- step 2 ------------------------------------------------------------------------------

local function pieceAt(p: Vector): number
    for i, pc in S.pieces do
        if not pc.placed and kit.inRect(p, pc.x - 12, pc.y - 12, pc.w * BU + 24, pc.h * BU + 24) then
            return i
        end
    end
    return 0
end

local function place(g: G, i: number)
    local pc = S.pieces[i]
    pc.x, pc.y, pc.placed, pc.at = pc.sx, pc.sy, true, g.t
    table.insert(S.order, pc.w * pc.h)
    S.sign = 1
    g.sfx('snap')
    g.shake(3)
    if #S.order == 3 then
        S.allAt = g.t
        g.done()
        g.sfx('sparkle')
        g.burst(BX + 2.5 * BU, BY + 2.5 * BU, 40)
        g.say('l2s2done')
    end
end

local function drawPiece(g: G, r: Renderer, pc: Piece, held: number)
    local bob = if not pc.placed and held < 0.1 then math.sin(g.t * 3 + pc.hx) * 2.5 else 0
    if not pc.placed then
        r:drawPath(kit.rrect(pc.x + 4 + 8 * held, pc.y + 8 + 16 * held, pc.w * BU, pc.h * BU, 8), kit.soft(kit.alpha(kit.INK, 0.18), 8 + 12 * held))
    end
    local glow = if pc.placed then kit.clamp(1.2 - (g.t - pc.at), 0.55, 1) else 1
    for row = 0, pc.h - 1 do
        for c = 0, pc.w - 1 do
            kit.tile(r, pc.x + c * BU, pc.y + row * BU - 10 * held + bob, BU, 1, glow)
        end
    end
    if not pc.placed then
        local cx, cy = pc.x + pc.w * BU / 2, pc.y + pc.h * BU / 2 - 10 * held + bob
        kit.halo(r, g.fonts, tostring(pc.w * pc.h), g.fonts.display, 20, kit.GOLD_DEEP, cx, cy, 0.5)
    end
end

local function drawStep2(g: G, r: Renderer)
    local f = g.fonts
    -- the 4 by 4 square
    for row = 0, 3 do
        for c = 0, 3 do
            kit.tile(r, BX + c * BU, BY + row * BU, BU, kit.clamp((g.age - (row * 4 + c) * 0.02) / 0.4, 0, 1), 0)
        end
    end
    -- the three gaps
    for i, pc in S.pieces do
        if not pc.placed then
            local near = S.drag == i and kit.dist(Vector.xy(pc.x, pc.y), Vector.xy(pc.sx, pc.sy)) < 2 * BU
            local x, y, w, h = pc.sx + 3, pc.sy + 3, pc.w * BU - 6, pc.h * BU - 6
            r:drawPath(kit.rrect(x, y, w, h, 8), kit.fill(kit.alpha(kit.GOLD_WASH, if near then 0.9 else 0.45)))
            r:drawPath(kit.dashed(x, y, x + w, y, 9, 7), kit.stroke(kit.alpha(kit.GOLD, 0.8), 2.5))
            r:drawPath(kit.dashed(x + w, y, x + w, y + h, 9, 7), kit.stroke(kit.alpha(kit.GOLD, 0.8), 2.5))
            r:drawPath(kit.dashed(x + w, y + h, x, y + h, 9, 7), kit.stroke(kit.alpha(kit.GOLD, 0.8), 2.5))
            r:drawPath(kit.dashed(x, y + h, x, y, 9, 7), kit.stroke(kit.alpha(kit.GOLD, 0.8), 2.5))
        end
    end
    local sd = if S.allAt >= 0 then 5 else 4
    kit.halo(r, f, tostring(sd), f.display, 22, kit.INK, BX + sd * BU / 2, BY - 26, 0.5)
    kit.halo(r, f, tostring(sd), f.display, 22, kit.INK, BX - 30, BY + sd * BU / 2, 0.5)
    -- pieces: placed ones first, the one in hand last
    for i, pc in S.pieces do
        if i ~= S.drag then
            drawPiece(g, r, pc, 0)
        end
    end
    if S.drag > 0 then
        drawPiece(g, r, S.pieces[S.drag], S.held)
    end
    -- a ghost finger drags the tall strip across until the first one is placed
    if #S.order == 0 and S.drag == 0 and g.age > 4 then
        local k = ((g.age - 4) % 2.8) / 2.8
        local a = if k < 0.1 then k / 0.1 elseif k > 0.8 then (1 - k) / 0.2 else 1
        local e = kit.smooth((k - 0.15) / 0.6)
        local pc = S.pieces[1]
        kit.finger(r, kit.lerp(pc.hx, pc.sx, e) + BU / 2, pc.hy + 2 * BU, a, true)
    end

    -- the border, counted
    local text = '?'
    if #S.order > 0 then
        text = ''
        for i, v in S.order do
            text ..= (if i > 1 then ' + ' else '') .. v
        end
        if #S.order == 3 then
            text ..= ' = 9'
        end
    end
    kit.sign(r, f, 'TILES IN THE BORDER', text, S.sign, 920, 200)
    if S.allAt >= 0 then
        local age = g.t - S.allAt
        local big = { Vector.xy(BX, BY), Vector.xy(BX + 5 * BU, BY), Vector.xy(BX + 5 * BU, BY + 5 * BU), Vector.xy(BX, BY + 5 * BU) }
        r:drawPath(kit.partialOutline(big, (age - 0.2) / 1.0), kit.stroke(kit.ACCENT, 4))
        kit.rule(r, f, '16 + 9 = 25', 'the 4 by 4 square and its border make 5 by 5', kit.clamp((age - 1.2) * 1.5, 0, 1), 900, 316)
        kit.rule(r, f, 'side + side + 1', 'two equal strips and a corner: always odd', kit.clamp((age - 2.6) * 1.5, 0, 1), 900, 436)
    end
end

-- step 3 ------------------------------------------------------------------------------

local function drawStep3(g: G, r: Renderer)
    local f = g.fonts
    drawSum(r, f, 6, CX, 206, 30, 0)
    for row = 0, 5 do
        for c = 0, 5 do
            local layer = math.max(row, c) + 1
            local glow = 0
            if S.solvedAt >= 0 then
                local wave = g.t - S.solvedAt - (layer - 1) * 0.12
                glow = if wave > 0 and wave < 0.6 then math.sin(wave / 0.6 * math.pi) else 0
            end
            ctile(r, CX + c * CU, CY + row * CU, CU, kit.clamp((g.age - 0.2 - (layer - 1) * 0.22) / 0.45, 0, 1), layer, glow)
        end
    end
    if S.solvedAt >= 0 then
        kit.rule(r, f, '6 × 6 = 36', 'six borders build a 6 by 6 square', kit.clamp((g.t - S.solvedAt) * 1.5, 0, 1), 668, 330)
    end
    kit.keypadDraw(r, f, S.kp, '1 + 3 + 5 + 7 + 9 + 11', 'tiles', g.t)
end

local function check(g: G)
    local v = tonumber(S.kp.value) or -1
    if v == 36 then
        S.kp.okT = 3
        S.solvedAt = g.t
        g.done()
        g.burst(1000, 300, 40)
        g.say('l2s3done')
    else
        g.sfx('oops')
        kit.keypadWrong(S.kp, 'Not quite. Have another go.')
        g.say(if v == 12 then 'l2n12' else 'l2nx')
    end
end

-- protocol ---------------------------------------------------------------------------------

L.id = 'SQ_PATTERNS'
L.tag = 'SQUARE PATTERNS'
L.title = 'Odd numbers build squares'
L.blurb = 'Wrap a border round it: 3, 5, 7, 9.'
L.steps = {
    { title = 'Wrap a border round it', line = 'l2s1', task = 'Tap the gold border until the square is 5 by 5' },
    { title = 'Why is it always odd?', line = 'l2s2', task = 'Drag the three gold pieces onto the square' },
    { title = 'Your turn', line = 'l2s3', task = 'Add the first six odd numbers' },
}

function L.enter(g: G, step: number)
    S.n, S.bornAt, S.addAt, S.landed, S.sign, S.doneAt = 1, { [0] = g.t }, -9, 0, 0, -1
    S.pieces, S.drag, S.held, S.order, S.allAt = newPieces(), 0, 0, {}, -1
    S.kp = kit.keypad(860, 172)
    S.solvedAt = -1
end

function L.advance(g: G, dt: number)
    S.sign = math.max(0, S.sign - dt * 3)
    S.held = kit.follow(S.held, if S.drag > 0 then 1 else 0, 18, dt)
    kit.keypadAdvance(S.kp, dt)
    if g.step == 1 and S.n > 1 then
        -- a tick as each tile of the new border lands
        local count = 2 * S.n - 1
        local landed = kit.clamp(math.floor((g.t - S.addAt - 0.25) / GAP) + 1, 0, count)
        if landed > S.landed then
            S.landed = landed
            g.tick(landed - 1)
            if landed == count then
                S.sign = 1
                if S.n == MAXN and S.doneAt < 0 then
                    S.doneAt = g.t
                    g.done()
                    g.burst(GX + MAXN * U / 2, GY + MAXN * U / 2, 50)
                    g.say('l2s1done')
                end
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
    if g.step == 1 then
        local e = (S.n + 1) * U
        if S.n < MAXN and kit.inRect(p, GX - 20, GY - 20, e + 40, e + 40) then
            addBorder(g)
            return true
        end
    elseif g.step == 2 then
        local i = pieceAt(p)
        if i > 0 then
            S.drag = i
            S.grabX, S.grabY = p.x - S.pieces[i].x, p.y - S.pieces[i].y
            g.sfx('pickup')
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
    if g.step == 2 and S.drag > 0 then
        local pc = S.pieces[S.drag]
        local nx: number = p.x - S.grabX
        local ny: number = p.y - S.grabY
        -- its own gap pulls it in
        if kit.dist(Vector.xy(nx, ny), Vector.xy(pc.sx, pc.sy)) < 0.7 * BU then
            nx = kit.lerp(nx, pc.sx, 0.6)
            ny = kit.lerp(ny, pc.sy, 0.6)
        end
        pc.x, pc.y = nx, ny
    end
end

function L.up(g: G, p: Vector)
    if g.step == 2 and S.drag > 0 then
        local i = S.drag
        local pc = S.pieces[i]
        S.drag = 0
        if kit.dist(Vector.xy(pc.x, pc.y), Vector.xy(pc.sx, pc.sy)) < 1.3 * BU then
            place(g, i)
        else
            -- dropped on the square but in the wrong gap: say so; dropped anywhere else: it just goes home
            if kit.inRect(Vector.xy(pc.x + pc.w * BU / 2, pc.y + pc.h * BU / 2), BX, BY, 5 * BU, 5 * BU) then
                g.sfx('oops')
                g.say('l2s2miss')
                g.hint('Match the shape of the piece to the shape of the gap')
            else
                g.sfx('drop')
            end
            pc.x, pc.y = pc.hx, pc.hy
        end
    end
end

function L.key(g: G, k: number): boolean
    if g.step == 1 and k == 32 then
        addBorder(g)
        return true
    elseif g.step == 2 and k == 32 then
        for i, pc in S.pieces do
            if not pc.placed then
                place(g, i)
                return true
            end
        end
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
    local cyc = (g.t * 0.9) % 7
    local n = math.min(5, 1 + math.floor(cyc))
    for row = 0, n - 1 do
        for c = 0, n - 1 do
            local layer = math.max(row, c) + 1
            local fresh = layer == n and cyc < 5
            ctile(r, ox + c * u, oy + row * u, u, if fresh then kit.clamp((cyc % 1) * 2.5, 0.05, 1) else 1, layer, 0)
        end
    end
end

return L
