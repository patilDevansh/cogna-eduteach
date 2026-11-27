-- Lesson 2 · Area or perimeter?
--   1. a fence is built post by post round a field (16 m), then the land inside fills square by square (15);
--      the student says which number is the land
--   2. exactly 20 m of fence. The student bets first: can the land change if the fence stays the same?
--      Then they drag the corner to reshape the field. A live chart plots every field tried; find the biggest (5 × 5 = 25)
--   3. the other way: squeeze the same fence into the smallest field (9 × 1 = 9), next to the ghost of the 25 square
--   4. a room 8 m by 3 m: how many 1 m tiles cover the floor? (24; 22 is the skirting round the edge)

local kit = require('kit')
type G = kit.G
type Choice = kit.Choice

type St = {
    choices: { Choice },
    picked: number,
    answered: boolean,
    answerAt: number,
    -- steps 2 and 3
    bet: number, -- step 2: -1 not yet, 0 'stays the same', 1 'it changes'
    w: number, -- target width (whole metres)
    shown: kit.Spring, -- the width as drawn (springs toward w)
    dragging: boolean,
    held: number,
    tried: { [number]: number }, -- width -> time first tried
    best: number,
    pop: number,
    won: boolean,
    winAt: number,
}

local L = {}

-- step 1 field
local U1, W1, H1 = 64, 5, 3
local F1X, F1Y = 250, 250
-- step 2 field
local U2, P2 = 34, 10 -- half the fence: w + h = 10
local F2X, F2Y = 120, 192
-- step 4 room
local U3 = 50
local F3X, F3Y = 140, 250

local S: St = {
    choices = {}, picked = -1, answered = false, answerAt = -1, bet = -1,
    w = 2, shown = { x = 2, v = 0 }, dragging = false, held = 0, tried = {}, best = 0, pop = 0, won = false, winAt = -1,
}

-- the points round the edge of a w × h rectangle, one per metre, starting top-left, clockwise
local function perimeterPoints(x: number, y: number, w: number, h: number, u: number): { Vector }
    local pts: { Vector } = {}
    for i = 0, w - 1 do
        table.insert(pts, Vector.xy(x + i * u, y))
    end
    for i = 0, h - 1 do
        table.insert(pts, Vector.xy(x + w * u, y + i * u))
    end
    for i = 0, w - 1 do
        table.insert(pts, Vector.xy(x + (w - i) * u, y + h * u))
    end
    for i = 0, h - 1 do
        table.insert(pts, Vector.xy(x, y + (h - i) * u))
    end
    return pts
end

local function fence(r: Renderer, x: number, y: number, w: number, h: number, frac: number, posts: { Vector }, shown: number, t: number)
    -- rails: the outline, drawn as far as the fence has got
    local out = 9
    local P = { Vector.xy(x - out, y - out), Vector.xy(x + w + out, y - out), Vector.xy(x + w + out, y + h + out), Vector.xy(x - out, y + h + out) }
    if frac > 0 then
        r:drawPath(kit.partialOutline(P, frac), kit.stroke(Color.rgb(150, 104, 44), 4))
        r:drawPath(kit.partialOutline(kit.offset(P, 0, -6), frac), kit.stroke(Color.rgb(186, 136, 66), 3))
    end
    for i, q in posts do
        if i <= shown then
            -- posts sit on the rail line, nudged out
            local px, py = q.x, q.y
            if py <= y + 0.5 then
                py -= out
            elseif py >= y + h - 0.5 then
                py += out
            end
            if px <= x + 0.5 then
                px -= out
            elseif px >= x + w - 0.5 then
                px += out
            end
            r:drawPath(kit.rrect(px - 3, py - 12 + 4, 8, 18, 2), kit.soft(kit.alpha(kit.INK, 0.2), 3))
            r:drawPath(kit.rrect(px - 4, py - 13, 8, 18, 2), kit.fill(Color.rgb(122, 82, 30)))
            r:drawPath(kit.rrect(px - 4, py - 13, 8, 5, 2), kit.fill(Color.rgb(170, 120, 52)))
        end
    end
    local _ = t
end

-- step 1 ------------------------------------------------------------------------

local FENCE_T0, POST_DT = 1.0, 0.22
local LAND_T0 = FENCE_T0 + 16 * POST_DT + 0.9
local CELL_DT = 0.2

local function postsShown(age: number): number
    return kit.clamp(math.floor((age - FENCE_T0) / POST_DT) + 1, 0, 16)
end

local function cellsShown(age: number): number
    return kit.clamp(math.floor((age - LAND_T0) / CELL_DT) + 1, 0, W1 * H1)
end

local lastPosts, lastCells = 0, 0
local hover = Vector.xy(-100, -100)

local function drawStep1(g: G, r: Renderer)
    local f = g.fonts
    local x, y, w, h = F1X, F1Y, W1 * U1, H1 * U1
    local ps = postsShown(g.age)
    local cs = cellsShown(g.age)
    -- bare earth
    r:drawPath(kit.rect(x, y, w, h), kit.fill(Color.rgb(222, 206, 172)))
    -- the land, square by square
    for i = 0, cs - 1 do
        local c, rr = i % W1, math.floor(i / W1)
        local born = LAND_T0 + i * CELL_DT
        local k = kit.back((g.age - born) * 4)
        local cx, cy = x + c * U1 + U1 / 2, y + rr * U1 + U1 / 2
        local s = (U1 - 6) * k
        r:drawPath(kit.rrect(cx - s / 2, cy - s / 2, s, s, 8), kit.fill(kit.GRASS))
        r:drawPath(kit.rrect(cx - s / 2, cy - s / 2, s, s * 0.35, 8), kit.fill(kit.alpha(kit.GRASS_HI, 0.7)))
        if k > 0.9 then
            kit.label(r, f, tostring(i + 1), f.display, 18, kit.alpha(kit.SURFACE, 0.95), cx, cy, 0.5)
        end
    end
    local posts = perimeterPoints(x, y, W1, H1, U1)
    fence(r, x, y, w, h, ps / 16, posts, ps, g.t)
    -- the numbers on the posts as they are counted
    if ps > 0 and ps < 16 then
        local q = posts[ps]
        kit.halo(r, f, ps .. ' m', f.body, 15, Color.rgb(150, 90, 20), q.x, q.y - 30, 0.5)
    end
    -- two signs
    kit.sign(r, f, 'FENCE', if ps > 0 then ps .. ' m' else '? m', if ps > 0 and ps < 16 then 0.5 else 0, 760, 210)
    kit.sign(r, f, 'LAND', if cs > 0 then cs .. ' sq m' else '? sq m', if cs > 0 and cs < 15 then 0.5 else 0, 760, 320)
    r:drawPath(kit.rrect(752, 238, 8, 30, 4), kit.fill(Color.rgb(150, 104, 44)))
    r:drawPath(kit.rrect(752, 348, 8, 30, 4), kit.fill(kit.GRASS))
    if #S.choices > 0 then
        kit.label(r, f, 'How much land is there?', f.body, 18, kit.INK_SOFT, 865, 440, 0.5)
        kit.choicesDraw(r, f, S.choices, hover, S.picked, g.t)
    end
end

-- step 2 ------------------------------------------------------------------------

local function areaFor(w: number): number
    return w * (P2 - w)
end

local function drawStep2(g: G, r: Renderer)
    local f = g.fonts
    local wv = S.shown.x
    local hv = P2 - wv
    local x, y, w, h = F2X, F2Y, wv * U2, hv * U2
    local P = { Vector.xy(x, y), Vector.xy(x + w, y), Vector.xy(x + w, y + h), Vector.xy(x, y + h) }
    local st = kit.style(U2, Vector.xy(x, y))
    kit.land(r, P, st)
    -- the fence hugs it
    local out = 8
    local FP = { Vector.xy(x - out, y - out), Vector.xy(x + w + out, y - out), Vector.xy(x + w + out, y + h + out), Vector.xy(x - out, y + h + out) }
    r:drawPath(kit.poly(FP), kit.stroke(Color.rgb(150, 104, 44), 4))
    r:drawPath(kit.poly(kit.offset(FP, 0, -6)), kit.stroke(Color.rgb(186, 136, 66), 3))
    kit.halo(r, f, kit.num(wv) .. ' m', f.body, 17, kit.INK, x + w / 2, y - 30, 0.5)
    if g.step == 3 then
        -- on the left here, clear of the ghost square
        kit.halo(r, f, kit.num(hv) .. ' m', f.body, 17, kit.INK, x - 22, y + h / 2, 1)
    else
        kit.halo(r, f, kit.num(hv) .. ' m', f.body, 17, kit.INK, x + w + 32, y + h / 2, 0)
    end
    -- handle on the bottom-right corner
    if g.step == 3 then
        -- the ghost of the biggest field, to compare against
        local q = 5 * U2
        r:drawPath(kit.rrect(F2X, F2Y, q, q, 4), kit.stroke(kit.alpha(kit.GOLD, 0.75), 2.5))
        if S.w ~= 5 then
            kit.halo(r, f, '25 sq m', f.body, 15, Color.rgb(150, 90, 20), F2X + q + 12, F2Y + q - 14, 0)
        end
    end
    local canDrag = g.step == 3 or S.bet >= 0
    local nudge = not S.dragging and not S.won and ((g.step == 2 and next(S.tried) == nil) or (g.step == 3 and S.w == 5))
    if canDrag then
        kit.knob(r, g.t, x + w, y + h, 'slide', S.held, nudge)
    end
    -- readouts
    local A = areaFor(S.w)
    kit.sign(r, f, 'FENCE (ALWAYS)', '20 m', 0, 520, 176)
    kit.sign(r, f, 'LAND', A .. ' sq m', S.pop, 520, 276)
    -- the chart: land for every width tried
    local cx0, cy0, cw, ch = 790, 186, 400, 300
    r:drawPath(kit.rrect(cx0 - 20, cy0 - 20, cw + 40, ch + 90, 20), kit.fill(kit.PAGE))
    if g.step == 2 and S.bet < 0 then
        -- the bet comes first: nothing can be dragged until the student has committed
        kit.label(r, f, 'YOUR BET', f.mono, 12, kit.INK_SOFT, cx0 + cw / 2, cy0 + 40, 0.5)
        kit.label(r, f, 'The fence stays 20 m.', f.display, 24, kit.INK, cx0 + cw / 2, cy0 + 84, 0.5)
        kit.label(r, f, 'Can the land change?', f.display, 24, kit.INK, cx0 + cw / 2, cy0 + 116, 0.5)
        kit.choicesDraw(r, f, S.choices, hover, S.picked, g.t)
        return
    end
    kit.label(r, f, 'LAND FOR EACH SHAPE YOU TRY', f.mono, 12, kit.INK_SOFT, cx0, cy0, 0)
    local base = cy0 + ch
    r:drawPath(kit.line(cx0, base, cx0 + cw, base), kit.stroke(kit.LINE, 2))
    for wi = 1, 9 do
        local bx = cx0 + (wi - 0.5) * (cw / 9)
        local tt = S.tried[wi]
        local a = areaFor(wi)
        if tt ~= nil then
            local k = kit.back((g.t - tt) * 3)
            local bh = (a / 25) * (ch - 50) * k
            local isNow = wi == S.w
            local smallest = g.step == 3 and S.won and (wi == 1 or wi == 9)
            local col = if smallest then kit.ORANGE elseif wi == 5 and (S.won or g.step == 3) then kit.GOLD elseif isNow then kit.ACCENT else kit.alpha(kit.GRASS, 0.8)
            r:drawPath(kit.rrect(bx - 16, base - bh, 32, bh, 8), kit.fill(col))
            kit.label(r, f, tostring(a), f.display, 17, if isNow then kit.ACCENT_DEEP else kit.INK_SOFT, bx, base - bh - 16, 0.5)
        else
            r:drawPath(kit.rrect(bx - 16, base - 6, 32, 6, 3), kit.fill(kit.LINE))
        end
        kit.label(r, f, wi .. '×' .. (P2 - wi), f.mono, 11, kit.INK_FAINT, bx, base + 18, 0.5)
    end
    if g.step == 2 and not S.won then
        kit.label(r, f, if S.bet == 1 then 'your bet: the land changes' else 'your bet: the land stays the same', f.mono, 12, kit.INK_FAINT, cx0 + cw / 2, cy0 + ch + 50, 0.5)
    end
    if S.won then
        local k = kit.clamp((g.t - S.winAt) * 2, 0, 1)
        kit.tag(r, f, if g.step == 3 then 'same fence: 25 or just 9' else 'a square holds the most!', cx0 + cw / 2, cy0 + ch + 50, k)
    end
end

-- step 4 ------------------------------------------------------------------------

local function drawStep4(g: G, r: Renderer)
    local f = g.fonts
    local x, y, w, h = F3X, F3Y, 8 * U3, 3 * U3
    r:drawPath(kit.rect(x, y, w, h), kit.fill(Color.rgb(226, 222, 212)))
    local t = 14
    local wall = kit.fill(Color.rgb(96, 110, 102))
    r:drawPath(kit.rect(x - t, y - t, w + 2 * t, t), wall)
    r:drawPath(kit.rect(x - t, y, t, h + t), wall)
    r:drawPath(kit.rect(x + w, y, t, h + t), wall)
    r:drawPath(kit.rect(x - t, y + h, w + 2 * t, t), wall)
    kit.bracket(r, f, Vector.xy(x, y - 40), Vector.xy(x + w, y - 40), 0, -1, '8 m', 1, kit.INK)
    kit.bracket(r, f, Vector.xy(x - 44, y), Vector.xy(x - 44, y + h), -1, 0, '3 m', 1, kit.INK)
    if S.answered then
        local age = g.t - S.answerAt
        -- the tiles drop in, then the skirting runs round the edge
        for i = 0, 23 do
            local c, rr = i % 8, math.floor(i / 8)
            local drop = kit.clamp((age - i * 0.05) / 0.45, 0, 1)
            if drop > 0 then
                kit.tile(r, x + c * U3, y + rr * U3, U3, drop, 0)
            end
        end
        local sk = kit.clamp((age - 1.8) / 1.4, 0, 1)
        if sk > 0 then
            local P = { Vector.xy(x + 3, y + 3), Vector.xy(x + w - 3, y + 3), Vector.xy(x + w - 3, y + h - 3), Vector.xy(x + 3, y + h - 3) }
            r:drawPath(kit.partialOutline(P, sk), kit.stroke(kit.ORANGE, 6))
        end
        if age > 1.2 then
            kit.tag(r, f, 'floor: 24 tiles (area)', x + w / 2, y + h + 50, kit.clamp((age - 1.2) * 2, 0, 1))
        end
        if age > 3.3 then
            kit.tag(r, f, 'skirting: 22 m (perimeter)', x + w / 2, y + h + 100, kit.clamp((age - 3.3) * 2, 0, 1))
        end
    end
    if #S.choices > 0 then
        kit.label(r, f, 'Tiles to cover the floor:', f.body, 18, kit.INK_SOFT, 930, 300, 0.5)
        kit.choicesDraw(r, f, S.choices, hover, S.picked, g.t)
    end
end

-- protocol ---------------------------------------------------------------------------

L.id = 'perimeter'
L.tag = 'AREA OR PERIMETER'
L.title = 'Fence or land?'
L.blurb = 'Same fence, different land.'
L.steps = {
    { title = 'Round the edge, or inside?', line = 'l2s1', task = 'Watch, then say how much land there is' },
    { title = 'Same fence, different fields', line = 'l2s2', task = 'Make your bet, then find the biggest field 20 m of fence can hold' },
    { title = 'Now squeeze it', line = 'l2s3', task = 'Same 20 m of fence: make the smallest field you can' },
    { title = 'Tiles or skirting?', line = 'l2s4', task = 'How many tiles cover the floor?' },
}

function L.enter(g: G, step: number)
    S.choices, S.picked, S.answered, S.answerAt = {}, -1, false, -1
    -- the squeeze step keeps the chart the student built while finding the biggest field
    local tried: { [number]: number } = if step == 3 then S.tried else {}
    S.w, S.shown, S.dragging, S.held, S.tried, S.best, S.pop, S.won, S.winAt = 2, { x = 2, v = 0 }, false, 0, tried, 0, 0, false, -1
    S.bet = -1
    lastPosts, lastCells = 0, 0
    if step == 2 then
        S.choices = kit.choices(g.fonts, { 'No, same land', 'Yes, it changes' }, { 0, 1 }, 990, 350)
    elseif step == 3 then
        S.w, S.shown = 5, { x = 5, v = 0 }
        if S.tried[5] == nil then
            S.tried[5] = g.t
        end
    elseif step == 4 then
        S.choices = kit.choices(g.fonts, { '22', '24', '11' }, { 22, 24, 11 }, 930, 330)
    end
end

function L.advance(g: G, dt: number)
    S.held = kit.follow(S.held, if S.dragging then 1 else 0, 18, dt)
    S.pop = math.max(0, S.pop - dt * 3)
    if g.step == 1 then
        local ps, cs = postsShown(g.age), cellsShown(g.age)
        if ps > lastPosts then
            lastPosts = ps
            g.tick(ps - 1)
        end
        if cs > lastCells then
            lastCells = cs
            g.tick(cs + 2)
            if cs == W1 * H1 then
                g.sfx('chime')
            end
        end
        if cs == W1 * H1 and #S.choices == 0 and g.age > LAND_T0 + 15 * CELL_DT + 0.6 then
            S.choices = kit.choices(g.fonts, { '16 sq m', '15 sq m' }, { 16, 15 }, 865, 470)
            g.sfx('pop')
        end
    elseif g.step == 2 or g.step == 3 then
        kit.spring(S.shown, S.w, 220, 18, dt)
        S.shown.x = kit.clamp(S.shown.x, 0.6, 9.4)
    end
end

function L.draw(g: G, r: Renderer)
    if g.step == 1 then
        drawStep1(g, r)
    elseif g.step == 2 or g.step == 3 then
        drawStep2(g, r)
    else
        drawStep4(g, r)
    end
end

local function pick(g: G, c: Choice, right: number, wrongLine: { [number]: string }, rightLine: string)
    if c.value == right then
        S.picked = right
        S.answered = true
        S.answerAt = g.t
        for _, o in S.choices do
            if o.value ~= right then
                o.out = true
            end
        end
        g.done()
        g.burst(c.x + c.w / 2, c.y, 30)
        g.say(rightLine)
    else
        c.out = true
        g.sfx('oops')
        g.shake(6)
        g.say(wrongLine[c.value] or wrongLine[0])
    end
end

local function tryWidth(g: G, w: number)
    local nw = kit.clamp(w, 1, 9)
    if nw ~= S.w then
        S.w = nw
        S.pop = 1
        g.tick(areaFor(nw) // 3)
    end
    if S.tried[nw] == nil then
        S.tried[nw] = g.t
    end
end

local function release(g: G)
    if S.won then
        return
    end
    if g.step == 2 and S.w == 5 then
        S.won = true
        S.winAt = g.t
        g.done()
        g.burst(F2X + 5 * U2 / 2, F2Y + 5 * U2 / 2, 40)
        g.say(if S.bet == 0 then 'l2s2doneno' else 'l2s2done')
    elseif g.step == 3 and (S.w == 1 or S.w == 9) then
        S.won = true
        S.winAt = g.t
        g.done()
        g.burst(F2X + S.w * U2 / 2, F2Y + (P2 - S.w) * U2 / 2, 40)
        g.say('l2s3done')
    end
end

function L.down(g: G, p: Vector): boolean
    hover = p
    if (g.step == 1 or g.step == 4) and not S.answered then
        local c = kit.choiceHit(S.choices, p)
        if c ~= nil then
            if g.step == 1 then
                pick(g, c, 15, { [16] = 'l2s1wrong', [0] = 'l2s1wrong' }, 'l2s1done')
            else
                pick(g, c, 24, { [22] = 'l2s4w22', [11] = 'l2s4w11', [0] = 'l2s4w22' }, 'l2s4done')
            end
            return true
        end
    elseif g.step == 2 and S.bet < 0 then
        -- a bet has no wrong answer: it is tested by hand next
        local c = kit.choiceHit(S.choices, p)
        if c ~= nil then
            S.bet = c.value
            S.choices = {}
            g.sfx('pop')
            g.say(if c.value == 0 then 'l2s2no' else 'l2s2yes')
            return true
        end
    elseif g.step == 2 or g.step == 3 then
        local corner = Vector.xy(F2X + S.shown.x * U2, F2Y + (P2 - S.shown.x) * U2)
        if kit.dist(p, corner) < 44 then
            S.dragging = true
            g.sfx('pickup')
            tryWidth(g, S.w)
            return true
        end
    end
    return false
end

function L.move(g: G, p: Vector)
    hover = p
    if (g.step == 2 or g.step == 3) and S.dragging then
        -- the corner moves along the line x + y = const, so project the pointer onto it
        local wx = (p.x - F2X) / U2
        local hy = (p.y - F2Y) / U2
        local w = (wx + (P2 - hy)) / 2
        tryWidth(g, math.floor(w + 0.5))
    end
end

function L.up(g: G, p: Vector)
    if S.dragging then
        S.dragging = false
        g.sfx('drop')
        release(g)
    end
end

function L.key(g: G, k: number): boolean
    if g.step == 2 and S.bet < 0 then
        if k == 49 or k == 50 then
            local c = S.choices[k - 48]
            if c ~= nil then
                L.down(g, Vector.xy(c.x + c.w / 2, c.y + 20))
            end
            return true
        end
        return false
    end
    if (g.step == 2 or g.step == 3) and (k == 262 or k == 263) then
        tryWidth(g, S.w + (if k == 262 then 1 else -1))
        release(g)
        return true
    end
    if (g.step == 1 or g.step == 4) and k >= 49 and k <= 51 and #S.choices > 0 and not S.answered then
        local c = S.choices[k - 48]
        if c ~= nil and not c.out then
            local mid = Vector.xy(c.x + c.w / 2, c.y + 20)
            L.down(g, mid)
        end
        return true
    end
    return false
end

function L.thumb(g: G, r: Renderer, x: number, y: number, w: number, h: number)
    local u = 16
    local wv = 5 + 3 * math.sin(g.t * 0.9)
    local hv = 10 - wv
    local fx, fy = x + w / 2 - wv * u / 2, y + h / 2 - hv * u / 2
    local P = { Vector.xy(fx, fy), Vector.xy(fx + wv * u, fy), Vector.xy(fx + wv * u, fy + hv * u), Vector.xy(fx, fy + hv * u) }
    r:drawPath(kit.poly(P), kit.fill(kit.GRASS))
    r:drawPath(kit.poly({ Vector.xy(fx - 4, fy - 4), Vector.xy(fx + wv * u + 4, fy - 4), Vector.xy(fx + wv * u + 4, fy + hv * u + 4), Vector.xy(fx - 4, fy + hv * u + 4) }), kit.stroke(Color.rgb(150, 104, 44), 3))
end

return L
