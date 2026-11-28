-- Lesson 2 · Rope or space? (area or perimeter)
-- Day 3 · Kavin's kolam patch, part 2. The street's Margazhi kolam contest gives every house exactly 20 metres of
-- rope to mark its patch. The rope is the perimeter; the floor inside, where the kolam goes, is the area.
--   1. a rope is laid round Kavin's practice patch, knot by knot (16 m), then the floor inside fills square by square
--      (15); the student says which number is the floor
--   2. exactly 20 m of rope. The student bets first: can the space inside change if the rope stays the same? Then they
--      drag the corner to reshape the patch; a live chart plots every patch tried; find the biggest (5 × 5 = 25)
--   3. the other way: squeeze the same rope into the smallest patch (9 × 1 = 9), next to the outline of the 25 square
--   4. Kavin's verandah, 8 m by 3 m: how many one-metre tiles cover it? (24; 22 is the rope round the edge; 11 adds)
-- The street, the rope and the flour come from lesson 1 (require('l1').art).

local kit = require('kit')
local people = require('people')
local l1 = require('l1')
local Art = l1.art
type G = kit.G
type Choice = kit.Choice
type Keypad = kit.Keypad
type StreetOpts = l1.StreetOpts

type St = {
    choices: { Choice },
    picked: number,
    answered: boolean,
    answerAt: number,
    asked: boolean,
    wrongAt: number,
    -- steps 2 and 3
    bet: number, -- step 2: -1 not yet, 0 'stays the same', 1 'it changes'
    w: number, -- target width (whole metres)
    shown: kit.Spring, -- the width as drawn (springs toward w)
    dragging: boolean,
    held: number,
    tried: { [number]: number }, -- width -> time first tried
    pop: number,
    won: boolean,
    winAt: number,
    -- step 4
    kp: Keypad,
    misses: number,
    solvedAt: number,
}

local L = {}

local GROUND = Art.GROUND
local STREET: StreetOpts = { ground = GROUND, tower = 196, palm = 84, bare = 0, corner = false }
-- step 1: Kavin's practice patch
local U1, W1, H1 = 64, 5, 3
local F1X, F1Y = 300, 340
-- steps 2 and 3: 20 m of rope, so width + height = 10
local U2, P2 = 30, 10
local F2X, F2Y = 130, 336
-- the chart card
local CX, CY, CW, CH = 660, 166, 560, 434
-- step 4: the verandah floor
local U3 = 50
local F3X, F3Y = 150, 372

local S: St = {
    choices = {}, picked = -1, answered = false, answerAt = -1, asked = false, wrongAt = -9,
    bet = -1, w = 2, shown = { x = 2, v = 0 }, dragging = false, held = 0, tried = {}, pop = 0, won = false, winAt = -1,
    kp = kit.keypad(900, 170), misses = 0, solvedAt = -1,
}

local kavin = people.new(people.CAST.kavin, -100)
local paati = people.new(people.CAST.paati, -100)
local kavinUntil, paatiUntil = 0, 0
local tipDone = false
local thumbKavin = people.new(people.CAST.kavin, 0)

-- one of them speaks at a time
local function kavinSays(g: G, a: string, b: string?, dur: number)
    people.speak(kavin, a, b)
    kavinUntil = g.t + dur
    paatiUntil = 0
end

local function paatiSays(g: G, a: string, b: string?, dur: number)
    people.speak(paati, a, b)
    paatiUntil = g.t + dur
    kavinUntil = 0
end

L.lines = {
    l2s1 = "Kavin is practising for the street's kolam contest. A rope marks his patch, and the kolam goes on the floor inside. Watch both get counted.",
    l2s1ask = 'So, how much floor is there for the kolam?',
    l2s1wrong = 'Sixteen metres is the rope, all the way round the edge. The kolam needs the squares inside.',
    l2s1done = 'Yes! The rope is measured in metres, round the edge. The floor inside is counted in square metres.',
    l2s2 = "For the contest, every house gets exactly the same rope. Before you touch it, bet: can the space inside change if the rope doesn't?",
    l2s2same = 'You bet it stays the same. Test it now: pull the gold corner around and hunt for the biggest patch.',
    l2s2changes = 'You bet it changes. Test it now: pull the gold corner around and hunt for the biggest patch.',
    l2s2done = 'You called it. The rope never changed, but the space did, and a square shape holds the most.',
    l2s2doneno = 'Surprise! The rope never changed, but the space inside did. A square shape holds the most.',
    l2s3 = 'Same rope again. This time, squeeze it into the thinnest patch you can, and watch the space shrink.',
    l2s3done = 'Hardly room for a kolam! Moments ago, this very rope held far more. Rope tells you the edge, never the space inside.',
    l2s4 = "Kavin's verandah is getting new tiles, each one metre square. How many tiles will cover the whole floor?",
    l2s4w22 = "That's the rope you'd need to go round the edge. Tiles fill the space inside.",
    l2s4w11 = 'That adds two sides together. Tiles come in rows, so multiply instead.',
    l2s4wx = 'Think in rows: how many rows of tiles, and how many in each row?',
    l2s4done = "Spot on! The tiles fill the inside, so that's the area. The rope round the edge is the perimeter.",
}

L.id = 'perimeter'
L.tag = 'AREA OR PERIMETER'
L.title = 'Rope or space?'
L.blurb = 'Same rope, different space.'
L.steps = {
    { title = 'Round the edge, or inside?', line = 'l2s1', task = 'Watch, then say how much floor there is' },
    { title = 'Same rope, different patches', line = 'l2s2', task = 'Bet first, then find the biggest patch 20 m of rope can hold' },
    { title = 'Now squeeze it', line = 'l2s3', task = 'Same 20 m of rope: make the smallest patch you can' },
    { title = 'Tiles or rope?', line = 'l2s4', task = 'Work out the tiles on the keypad' },
}

-- points round the edge of a w × h patch, one per metre, from the top-left, clockwise, pushed out onto the rope
local function knotPoints(x: number, y: number, w: number, h: number, u: number, out: number): { Vector }
    local pts: { Vector } = {}
    for i = 0, w - 1 do
        table.insert(pts, Vector.xy(x + i * u, y - out))
    end
    for i = 0, h - 1 do
        table.insert(pts, Vector.xy(x + w * u + out, y + i * u))
    end
    for i = 0, w - 1 do
        table.insert(pts, Vector.xy(x + (w - i) * u, y + h * u + out))
    end
    for i = 0, h - 1 do
        table.insert(pts, Vector.xy(x - out, y + (h - i) * u))
    end
    return pts
end

local function ropeAround(x: number, y: number, w: number, h: number, out: number): { Vector }
    return { Vector.xy(x - out, y - out), Vector.xy(x + w + out, y - out), Vector.xy(x + w + out, y + h + out), Vector.xy(x - out, y + h + out) }
end

-- each step has its own spot for them; they are simply there (walking across would cross the cards)
local function place(who: people.Person, x: number)
    who.y = 606
    who.x = x
    who.tx = x
end

-- step 1 ------------------------------------------------------------------------

local ROPE_T0, KNOT_DT = 1.2, 0.22
local CELL_T0 = ROPE_T0 + 16 * KNOT_DT + 0.9
local CELL_DT = 0.2
local ASK_T = CELL_T0 + 15 * CELL_DT + 0.6

local function knotsShown(age: number): number
    return kit.clamp(math.floor((age - ROPE_T0) / KNOT_DT) + 1, 0, 16)
end

local function cellsShown(age: number): number
    return kit.clamp(math.floor((age - CELL_T0) / CELL_DT) + 1, 0, W1 * H1)
end

local lastKnots, lastCells = 0, 0
local hover = Vector.xy(-100, -100)

local function drawStep1(g: G, r: Renderer)
    local f = g.fonts
    local x, y, w, h = F1X, F1Y, W1 * U1, H1 * U1
    local ks = knotsShown(g.age)
    local cs = cellsShown(g.age)
    Art.wet(r, x - 4, y - 4, w + 8, h + 8)
    Art.dots(r, x, y, W1, H1, U1, 0.9)
    -- the floor inside, square by square
    for i = 0, cs - 1 do
        local c, rr = i % W1, math.floor(i / W1)
        local born = CELL_T0 + i * CELL_DT
        local age = g.age - born
        Art.flour(r, x + c * U1, y + rr * U1, U1, kit.clamp(age / 0.45, 0, 1), nil, 0)
        if age > 0.35 then
            kit.label(r, f, tostring(i + 1), f.display, 19, kit.INK_SOFT, x + c * U1 + U1 / 2, y + rr * U1 + U1 / 2, 0.5)
        end
    end
    -- the rope, knot by knot
    local out = 12
    Art.rope(r, ropeAround(x, y, w, h, out), ks / 16)
    local knots = knotPoints(x, y, W1, H1, U1, out)
    for i, q in knots do
        if i <= ks then
            Art.knot(r, q.x, q.y, kit.clamp((g.age - ROPE_T0 - (i - 1) * KNOT_DT) * 5, 0, 1))
        end
    end
    if ks > 0 and ks < 16 then
        local q = knots[ks]
        local dx = if q.x <= x then -34 elseif q.x >= x + w then 34 else 0
        local dy = if q.y <= y then -30 elseif q.y >= y + h then 30 else 0
        kit.halo(r, f, ks .. ' m', f.body, 16, Art.ROPE_DK, q.x + dx, q.y + dy, 0.5)
    end
    -- the two counts, each with a swatch of what it counts
    local sx = 770
    r:drawPath(kit.line(sx - 46, 356, sx - 16, 356), kit.stroke(Art.ROPE_DK, 7.5))
    r:drawPath(kit.line(sx - 46, 356, sx - 16, 356), kit.stroke(Art.ROPE, 4.6))
    Art.counter(r, f, 'ROPE', if ks > 0 then ks .. ' m' else '? m', if ks > 0 and ks < 16 then 0.5 else 0, sx, 316, 200)
    r:drawPath(kit.rrect(sx - 48, 432, 34, 34, 8), kit.fill(Art.WET))
    Art.flour(r, sx - 48, 432, 34, 1, nil, 0)
    Art.counter(r, f, 'FLOOR INSIDE', if cs > 0 then cs .. ' sq m' else '? sq m', if cs > 0 and cs < 15 then 0.5 else 0, sx, 410, 200)
    if #S.choices > 0 then
        kit.label(r, f, 'Floor for the kolam:', f.body, 18, kit.INK_SOFT, 870, 520, 0.5)
        kit.choicesDraw(r, f, S.choices, hover, S.picked, g.t)
    end
end

-- steps 2 and 3 ------------------------------------------------------------------------

local function areaFor(w: number): number
    return w * (P2 - w)
end

local function drawPatch(g: G, r: Renderer)
    local f = g.fonts
    local wv = S.shown.x
    local hv = P2 - wv
    local x, y, w, h = F2X, F2Y, wv * U2, hv * U2
    if g.step == 3 then
        -- where the biggest patch was, to compare against
        local q = 5 * U2
        local G0 = { Vector.xy(F2X, F2Y), Vector.xy(F2X + q, F2Y), Vector.xy(F2X + q, F2Y + q), Vector.xy(F2X, F2Y + q) }
        for i = 1, 4 do
            local a, b = G0[i], G0[(i % 4) + 1]
            r:drawPath(kit.dashed(a.x, a.y, b.x, b.y, 9, 7), kit.stroke(kit.alpha(kit.ACCENT_DEEP, 0.75), 2.5))
        end
        if S.w ~= 5 then
            kit.halo(r, f, 'the 25 sq m patch', f.body, 15, kit.ACCENT_DEEP, F2X + q + 14, F2Y + q - 12, 0)
        end
    end
    Art.wet(r, x, y, w, h)
    r:save()
    r:clipPath(kit.rect(x, y, w, h))
    for rr = 0, P2 - 1 do
        for c = 0, P2 - 1 do
            if c + 1 <= wv + 0.3 and rr + 1 <= hv + 0.3 then
                Art.flour(r, x + c * U2, y + rr * U2, U2, 1, nil, if S.won then 0.5 else 0)
            end
        end
    end
    r:restore()
    Art.rope(r, ropeAround(x, y, w, h, 8), 1)
    kit.halo(r, f, S.w .. ' m', f.body, 17, kit.INK, x + w / 2, y - 28, 0.5)
    kit.halo(r, f, (P2 - S.w) .. ' m', f.body, 17, kit.INK, x + w + 22, y + h / 2, 0)
    local canDrag = g.step == 3 or S.bet >= 0
    local nudge = not S.dragging and not S.won and ((g.step == 2 and next(S.tried) == nil) or (g.step == 3 and S.w == 5))
    if canDrag then
        kit.knob(r, g.t, x + w, y + h, 'slide', S.held, nudge)
    end
end

local function drawChart(g: G, r: Renderer)
    local f = g.fonts
    Art.card(r, CX, CY, CW, CH, kit.LINE)
    local A = areaFor(S.w)
    kit.label(r, f, 'ROPE, ALWAYS', f.mono, 12, kit.INK_SOFT, CX + 30, CY + 30, 0)
    kit.label(r, f, '20 m', f.display, 30, Art.ROPE_DK, CX + 30, CY + 64, 0)
    kit.label(r, f, 'SPACE INSIDE', f.mono, 12, kit.INK_SOFT, CX + 210, CY + 30, 0)
    local sc = 1 + 0.12 * math.sin(kit.clamp(S.pop, 0, 1) * math.pi)
    r:save()
    r:transform(Mat2D.withTranslation(CX + 210, CY + 64) * Mat2D.withScale(sc, sc) * Mat2D.withTranslation(-(CX + 210), -(CY + 64)))
    kit.label(r, f, A .. ' sq m', f.display, 30, kit.ACCENT_DEEP, CX + 210, CY + 64, 0)
    r:restore()
    r:drawPath(kit.line(CX + 24, CY + 96, CX + CW - 24, CY + 96), kit.stroke(kit.LINE, 1.5))
    local midX = CX + CW / 2
    if g.step == 2 and S.bet < 0 then
        -- the bet comes first: nothing can be dragged until the student has committed
        kit.label(r, f, 'YOUR BET', f.mono, 12, kit.INK_SOFT, midX, CY + 140, 0.5)
        kit.label(r, f, 'The rope stays 20 m.', f.display, 26, kit.INK, midX, CY + 190, 0.5)
        kit.label(r, f, 'Can the space inside change?', f.display, 26, kit.INK, midX, CY + 226, 0.5)
        kit.choicesDraw(r, f, S.choices, hover, S.picked, g.t)
        return
    end
    kit.label(r, f, 'SPACE INSIDE EACH PATCH YOU TRY', f.mono, 12, kit.INK_SOFT, CX + 30, CY + 124, 0)
    local x0, bw = CX + 30, CW - 60
    local base = CY + 350
    local tall = 180
    r:drawPath(kit.line(x0, base, x0 + bw, base), kit.stroke(kit.LINE, 2))
    for wi = 1, 9 do
        local bx = x0 + (wi - 0.5) * (bw / 9)
        local tt = S.tried[wi]
        local a = areaFor(wi)
        if tt ~= nil then
            local k = kit.back((g.t - tt) * 3)
            local bh = (a / 25) * tall * k
            local isNow = wi == S.w
            local smallest = g.step == 3 and S.won and (wi == 1 or wi == 9)
            local biggest = wi == 5 and (S.won or g.step == 3)
            local col = if smallest then kit.ORANGE elseif biggest then kit.ACCENT_DEEP elseif isNow then kit.ACCENT else Color.rgb(170, 204, 186)
            r:drawPath(kit.rrect(bx - 18, base - bh, 36, bh, 8), kit.fill(col))
            kit.label(r, f, tostring(a), f.display, 18, if isNow then kit.ACCENT_DEEP else kit.INK_SOFT, bx, base - bh - 16, 0.5)
        else
            r:drawPath(kit.rrect(bx - 18, base - 6, 36, 6, 3), kit.fill(kit.LINE))
        end
        kit.label(r, f, wi .. '×' .. (P2 - wi), f.mono, 12, kit.INK_FAINT, bx, base + 18, 0.5)
    end
    local fy = CY + CH - 26
    if S.won then
        local k = kit.clamp((g.t - S.winAt) * 2, 0, 1)
        if g.step == 3 then
            Art.pill(r, f, 'same rope: 25 sq m, or just 9', midX, fy - 4, k, kit.ORANGE, kit.INK)
        else
            Art.pill(r, f, 'a square holds the most!', midX, fy - 4, k, kit.ACCENT, kit.ACCENT_DEEP)
        end
    elseif g.step == 2 then
        kit.label(r, f, if S.bet == 1 then 'your bet: the space can change' else 'your bet: the space stays the same', f.mono, 12, kit.INK_FAINT, midX, fy, 0.5)
    end
end

-- step 4 ------------------------------------------------------------------------

-- a handmade floor tile: cream, with a red and green flower at its middle
local function tile(r: Renderer, x: number, y: number, u: number, drop: number)
    local k = kit.bounce(drop)
    local lift = (1 - k) * 40
    local sc = 1 + (1 - kit.clamp(drop * 1.4, 0, 1)) * 0.25
    local w = (u - 4) * sc
    local cx, cy = x + u / 2, y + u / 2 - lift
    r:drawPath(kit.rrect(cx - w / 2 + 2, y + u / 2 - w / 2 + 4, w, w, 4), kit.soft(kit.alpha(kit.INK, 0.2 * k), 5))
    r:drawPath(kit.rrect(cx - w / 2, cy - w / 2, w, w, 4), kit.fill(Color.rgb(244, 232, 206)))
    r:drawPath(kit.rrect(cx - w / 2, cy - w / 2, w, w, 4), kit.stroke(Color.rgb(196, 170, 130), 1.4))
    local s = w / 50
    local p = Path.new()
    for i = 0, 3 do
        local a = i * math.pi / 2 + math.pi / 4
        local px, py = cx + math.cos(a) * 9 * s, cy + math.sin(a) * 9 * s
        p:moveTo(Vector.xy(px + 6 * s, py))
        p:cubicTo(Vector.xy(px + 6 * s, py + 3.3 * s), Vector.xy(px + 3.3 * s, py + 6 * s), Vector.xy(px, py + 6 * s))
        p:cubicTo(Vector.xy(px - 3.3 * s, py + 6 * s), Vector.xy(px - 6 * s, py + 3.3 * s), Vector.xy(px - 6 * s, py))
        p:cubicTo(Vector.xy(px - 6 * s, py - 3.3 * s), Vector.xy(px - 3.3 * s, py - 6 * s), Vector.xy(px, py - 6 * s))
        p:cubicTo(Vector.xy(px + 3.3 * s, py - 6 * s), Vector.xy(px + 6 * s, py - 3.3 * s), Vector.xy(px + 6 * s, py))
        p:close()
    end
    r:drawPath(p, kit.fill(Color.rgb(184, 72, 54)))
    r:drawPath(kit.circle(cx, cy, 4.5 * s), kit.fill(Color.rgb(36, 122, 118)))
    -- corner quarter-circles join into rings across the floor
    local q = Path.new()
    for i = 0, 3 do
        local ax = cx + (if i % 2 == 0 then -w / 2 else w / 2)
        local ay = cy + (if i < 2 then -w / 2 else w / 2)
        q:moveTo(Vector.xy(ax + (if i % 2 == 0 then 8 * s else -8 * s), ay))
        q:lineTo(Vector.xy(ax, ay + (if i < 2 then 8 * s else -8 * s)))
    end
    r:drawPath(q, kit.stroke(Color.rgb(36, 122, 118), 2))
end

-- a measuring line from a to b with end ticks; its label sits on a white halo off to one side (nx, ny outward)
local function measure(r: Renderer, f: kit.Fonts, a: Vector, b: Vector, nx: number, ny: number, s: string)
    local p = Path.new()
    p:moveTo(a)
    p:lineTo(b)
    p:moveTo(Vector.xy(a.x - (if nx == 0 then 0 else 8), a.y - (if ny == 0 then 0 else 8)))
    p:lineTo(Vector.xy(a.x + (if nx == 0 then 0 else 8), a.y + (if ny == 0 then 0 else 8)))
    p:moveTo(Vector.xy(b.x - (if nx == 0 then 0 else 8), b.y - (if ny == 0 then 0 else 8)))
    p:lineTo(Vector.xy(b.x + (if nx == 0 then 0 else 8), b.y + (if ny == 0 then 0 else 8)))
    r:drawPath(p, kit.stroke(kit.INK, 2.5))
    kit.halo(r, f, s, f.display, 24, kit.INK, (a.x + b.x) / 2 + nx * 30, (a.y + b.y) / 2 + ny * 22, 0.5)
end

local function drawStep4(g: G, r: Renderer)
    local f = g.fonts
    local x, y, w, h = F3X, F3Y, 8 * U3, 3 * U3
    -- the verandah: a raised floor of polished red oxide, its front edge showing
    r:drawPath(kit.rrect(x - 12 + 4, y - 12 + 10, w + 24, h + 34, 6), kit.soft(kit.alpha(kit.INK, 0.22), 10))
    r:drawPath(kit.rect(x - 12, y - 12, w + 24, h + 34), kit.fill(Color.rgb(146, 58, 44)))
    r:drawPath(kit.rect(x - 12, y - 12, w + 24, h + 34), kit.stroke(Art.OUT, 2.4))
    r:drawPath(kit.rect(x, y, w, h), kit.fill(Color.rgb(186, 78, 58)))
    r:drawPath(kit.rect(x + 10, y + 8, w - 20, 10), kit.fill(kit.alpha(kit.SURFACE, 0.12)))
    r:drawPath(kit.line(x - 12, y + h + 12, x + w + 12, y + h + 12), kit.stroke(Art.OUT, 2))
    measure(r, f, Vector.xy(x, y - 36), Vector.xy(x + w, y - 36), 0, -1, '8 m')
    measure(r, f, Vector.xy(x - 38, y), Vector.xy(x - 38, y + h), -1, 0, '3 m')
    if S.solvedAt >= 0 then
        local age = g.t - S.solvedAt
        -- the tiles drop in, then a rope runs round the edge
        for i = 0, 23 do
            local c, rr = i % 8, math.floor(i / 8)
            local drop = kit.clamp((age - i * 0.05) / 0.45, 0, 1)
            if drop > 0 then
                tile(r, x + c * U3, y + rr * U3, U3, drop)
            end
        end
        local sk = kit.clamp((age - 1.8) / 1.4, 0, 1)
        Art.rope(r, ropeAround(x, y, w, h, 2), sk)
        if age > 1.2 then
            Art.pill(r, f, '24 tiles = area', x + 80, y + h + 66, kit.clamp((age - 1.2) * 2, 0, 1), kit.ACCENT, kit.ACCENT_DEEP)
        end
        if age > 3.3 then
            Art.pill(r, f, '22 m of rope = perimeter', x + w - 116, y + h + 66, kit.clamp((age - 3.3) * 2, 0, 1), Art.ROPE_DK, kit.INK)
        end
    end
    kit.keypadDraw(r, f, S.kp, 'Tiles for the verandah floor', 'tiles', g.t)
end

-- protocol ---------------------------------------------------------------------------

function L.enter(g: G, step: number)
    S.choices, S.picked, S.answered, S.answerAt, S.asked, S.wrongAt = {}, -1, false, -1, false, -9
    -- the squeeze step keeps the chart the student built while finding the biggest patch
    local tried: { [number]: number } = if step == 3 then S.tried else {}
    S.w, S.shown, S.dragging, S.held, S.tried, S.pop, S.won, S.winAt = 2, { x = 2, v = 0 }, false, 0, tried, 0, false, -1
    S.bet = -1
    S.kp, S.misses, S.solvedAt = kit.keypad(900, 170), 0, -1
    lastKnots, lastCells = 0, 0
    tipDone = false
    if step == 2 then
        S.choices = kit.choices(g.fonts, { 'It stays the same', 'It can change' }, { 0, 1 }, CX + CW / 2, CY + 262)
    elseif step == 3 then
        S.w, S.shown = 5, { x = 5, v = 0 }
        if S.tried[5] == nil then
            S.tried[5] = g.t
        end
    end
    people.hush(kavin)
    people.hush(paati)
    kavinUntil, paatiUntil = 0, 0
    if step == 1 then
        place(kavin, 170)
        place(paati, 1120)
    elseif step == 4 then
        place(kavin, 610)
        place(paati, 730)
    else
        place(kavin, 480)
        place(paati, 575)
    end
    kavin.mood, paati.mood = 'idle', 'idle'
end

local function feel(g: G)
    local km, pm = 'watch', 'watch'
    local lx, ly = 640, 420
    if g.step == 1 then
        lx, ly = F1X + W1 * U1 / 2, F1Y + H1 * U1 / 2
        if not tipDone and g.age > 0.8 then
            tipDone = true
            paatiSays(g, 'First the rope,', 'then the kolam.', 4)
        end
        if S.answered then
            km = if g.t - S.answerAt < 2.6 then 'cheer' else 'idle'
            pm = if g.t - S.answerAt < 2 then 'wave' else 'idle'
        elseif g.t - S.wrongAt < 1.8 then
            km = 'puzzled'
        elseif #S.choices > 0 then
            km = 'think'
        end
    elseif g.step == 2 or g.step == 3 then
        lx, ly = F2X + S.shown.x * U2 / 2, F2Y + (P2 - S.shown.x) * U2 / 2
        if g.step == 2 and not tipDone and g.age > 1 and not S.won then
            tipDone = true
            kavinSays(g, 'I want the', 'biggest patch!', 4)
        end
        if S.won then
            local since = g.t - S.winAt
            if g.step == 2 then
                km = if since < 2.6 then 'cheer' else 'idle'
                pm = if since < 2 then 'wave' else 'idle'
            else
                km = if since < 4 then 'puzzled' else 'idle'
                pm = 'idle'
            end
        elseif g.step == 2 and S.bet < 0 then
            km, pm = 'think', 'idle'
        end
    else
        lx, ly = F3X + 4 * U3, F3Y + 1.5 * U3
        if not tipDone and g.age > 1 and S.solvedAt < 0 then
            tipDone = true
            kavinSays(g, 'New tiles for', 'our verandah!', 3.5)
        end
        if S.solvedAt >= 0 then
            km = if g.t - S.solvedAt < 2.6 then 'cheer' else 'idle'
            pm = if g.t - S.solvedAt < 2 then 'wave' else 'idle'
        elseif g.t - S.wrongAt < 1.8 then
            km = 'puzzled'
        else
            km = 'think'
        end
    end
    kavin.lookX, kavin.lookY = lx, ly
    paati.lookX, paati.lookY = lx, ly
    kavin.mood, paati.mood = km, pm
end

function L.advance(g: G, dt: number)
    S.held = kit.follow(S.held, if S.dragging then 1 else 0, 18, dt)
    S.pop = math.max(0, S.pop - dt * 3)
    if g.step == 1 then
        local ks, cs = knotsShown(g.age), cellsShown(g.age)
        if ks > lastKnots then
            lastKnots = ks
            g.tick(ks - 1)
        end
        if cs > lastCells then
            lastCells = cs
            g.tick(cs + 2)
            if cs == W1 * H1 then
                g.sfx('chime')
            end
        end
        if cs == W1 * H1 and #S.choices == 0 and g.age > ASK_T then
            S.choices = kit.choices(g.fonts, { '16 sq m', '15 sq m' }, { 16, 15 }, 870, 540)
            g.sfx('pop')
            if not S.asked then
                S.asked = true
                g.sayNext('l2s1ask')
            end
        end
    elseif g.step == 2 or g.step == 3 then
        kit.spring(S.shown, S.w, 220, 18, dt)
        S.shown.x = kit.clamp(S.shown.x, 0.6, 9.4)
    end
    kit.keypadAdvance(S.kp, dt)
    feel(g)
    if g.t > kavinUntil then
        people.hush(kavin)
    end
    if g.t > paatiUntil then
        people.hush(paati)
    end
    people.advance(kavin, dt, g.t)
    people.advance(paati, dt, g.t)
end

function L.draw(g: G, r: Renderer)
    Art.street(r, g.t, STREET)
    if g.step == 1 then
        drawStep1(g, r)
    elseif g.step == 2 or g.step == 3 then
        drawPatch(g, r)
        drawChart(g, r)
    else
        drawStep4(g, r)
    end
    people.draw(r, g.fonts, kavin, g.t)
    people.draw(r, g.fonts, paati, g.t)
end

-- step 1's answer: which number is the floor?
local function pickFloor(g: G, c: Choice)
    local right = c.value == 15
    g.report('l2s1', right, tostring(c.value), if c.value == 16 then 'perim' else nil)
    if right then
        S.picked = 15
        S.answered = true
        S.answerAt = g.t
        for _, o in S.choices do
            if o.value ~= 15 then
                o.out = true
            end
        end
        g.done()
        g.burst(c.x + c.w / 2, c.y, 30)
        g.say('l2s1done')
    else
        c.out = true
        S.wrongAt = g.t
        g.sfx('oops')
        g.shake(6)
        g.say('l2s1wrong')
    end
end

local function checkTiles(g: G)
    local v = tonumber(S.kp.value) or -1
    local right = v == 24
    g.report('l2s4', right, S.kp.value, if v == 22 then 'perim' else nil)
    if right then
        S.kp.okT = 3
        S.solvedAt = g.t
        g.done()
        g.burst(1040, 300, 40)
        g.say('l2s4done')
        paatiUntil = 0
    else
        S.misses += 1
        S.wrongAt = g.t
        g.sfx('oops')
        kit.keypadWrong(S.kp, 'Not quite. Have another go.')
        g.say(if v == 22 then 'l2s4w22' elseif v == 11 then 'l2s4w11' else 'l2s4wx')
        if S.misses >= 2 then
            paatiSays(g, 'Three rows,', 'eight in each.', 5)
        end
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
        kavinUntil = 0
    elseif g.step == 3 and (S.w == 1 or S.w == 9) then
        S.won = true
        S.winAt = g.t
        g.done()
        g.burst(F2X + S.w * U2 / 2, F2Y + (P2 - S.w) * U2 / 2, 40)
        g.say('l2s3done')
        kavinSays(g, 'Too thin', 'for a kolam!', 4)
    end
end

function L.down(g: G, p: Vector): boolean
    hover = p
    if g.step == 1 and not S.answered then
        local c = kit.choiceHit(S.choices, p)
        if c ~= nil then
            pickFloor(g, c)
            return true
        end
    elseif g.step == 2 and S.bet < 0 then
        -- a bet has no wrong answer: it is tested by hand next
        local c = kit.choiceHit(S.choices, p)
        if c ~= nil then
            S.bet = c.value
            S.choices = {}
            g.sfx('pop')
            g.report('l2s2', true, if c.value == 0 then 'same' else 'changes', nil)
            g.say(if c.value == 0 then 'l2s2same' else 'l2s2changes')
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
    elseif g.step == 4 and S.solvedAt < 0 then
        local res = kit.keypadDown(S.kp, p)
        if res == 'ok' then
            checkTiles(g)
        elseif res == 'key' then
            g.sfx('tick3')
        end
        return res ~= ''
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
    if g.step == 1 then
        if k >= 49 and k <= 50 and #S.choices > 0 and not S.answered then
            local c = S.choices[k - 48]
            if c ~= nil and not c.out then
                pickFloor(g, c)
            end
            return true
        end
        return false
    end
    if g.step == 2 and S.bet < 0 then
        if k == 49 or k == 50 then
            local c = S.choices[k - 48]
            if c ~= nil then
                L.down(g, Vector.xy(c.x + c.w / 2, c.y + 20))
            end
            return true
        elseif k == 262 or k == 263 then
            -- the arrows will move the corner, but only once the bet is in (they don't skip the step)
            g.hint('Make your bet first: press 1 or 2')
            return true
        end
        return false
    end
    if (g.step == 2 or g.step == 3) and (k == 262 or k == 263) then
        tryWidth(g, S.w) -- the patch it starts from goes on the chart too, as it does when dragged
        tryWidth(g, S.w + (if k == 262 then 1 else -1))
        release(g)
        return true
    end
    if g.step == 4 and S.solvedAt < 0 then
        local res = kit.keypadKey(S.kp, k)
        if res == 'ok' then
            checkTiles(g)
            return true
        end
        return res ~= ''
    end
    return false
end

function L.thumb(g: G, r: Renderer, x: number, y: number, w: number, h: number)
    Art.thumbOpen(r, x, y, w, h, g.t, STREET)
    -- the same rope, pulled into one patch after another
    local wv = 5 + 3 * math.sin(g.t * 0.9)
    local hv = P2 - wv
    local u = 40
    local px, py = 720 - wv * u / 2, 460 - hv * u / 2
    Art.wet(r, px, py, wv * u, hv * u)
    r:save()
    r:clipPath(kit.rect(px, py, wv * u, hv * u))
    for rr = 0, 9 do
        for c = 0, 9 do
            if c + 1 <= wv + 0.3 and rr + 1 <= hv + 0.3 then
                Art.flour(r, px + c * u, py + rr * u, u, 1, nil, 0)
            end
        end
    end
    r:restore()
    Art.rope(r, ropeAround(px, py, wv * u, hv * u, 9), 1)
    thumbKavin.x, thumbKavin.y, thumbKavin.s = 300, 600, 1.9
    thumbKavin.mood = 'point'
    people.advance(thumbKavin, 1 / 60, g.t)
    people.draw(r, g.fonts, thumbKavin, g.t)
    r:restore()
end

return L
