-- Lesson 6 · Imran's island (any shape: split it up) · Pune
--   Imran Sheikh, 13, codes a phone game in the evenings. His islands are awkward shapes on a tile grid, and every
--   tile gets one coin: so how many tiles is an island? The board is his game screen (a pixel-art sea, sand and
--   grass tiles, a palm on an islet, coins that drop in as tiles are counted). He sits beside it at his desk, in
--   his wheelchair, reacting like the game designer he is.
--   1. drag along a grid line to split the L-shaped island into two rectangles; each lights up, coins drop in
--      row by row, it shows its own count, and the two counts are added
--   2. split it the other way: the same total
--   3. drag the gold block into the empty corner: one big rectangle, 8 × 6 = 48; then the gold tiles come off
--      again: 48 − 12 = 36
--   4. keypad: a U-shaped island round a bay -> 26 (30, the coastline, is reported as the 'perim' mix-up)

local kit = require('kit')
local people = require('people')
type G = kit.G
type Keypad = kit.Keypad
type Person = people.Person

type Tile = { i: number, j: number, n: boolean, e: boolean, s: boolean, w: boolean }
type Piece = { x: number, y: number, w: number, h: number, dx: number, dy: number }
type Cue = { at: number, mood: string, l1: string, l2: string }

type St = {
    cut: string, -- '' · 'v' · 'h'
    firstCut: string,
    cutAt: number,
    a: Vector?,
    b: Vector?,
    judge: string, -- live: '' · 'v' · 'h' · 'bad'
    gap: kit.Spring,
    ticks: number, -- counting ticks already played for the current count
    said: boolean, -- a line timed to the count has been said
    -- step 3
    gx: number,
    gy: number,
    dragging: boolean,
    grabX: number,
    grabY: number,
    held: number,
    snapped: boolean,
    snapAt: number,
    tookAway: boolean,
    -- step 4
    kp: Keypad,
    solvedAt: number,
    -- the coin counter
    hudVal: number,
    hudPop: number,
    greeted: boolean, -- Imran says hello once
}

local L = {}

local OUT = Color.rgb(74, 44, 18) -- the outline brown the people are drawn with

-- the game screen, inside the monitor on Imran's desk
local SX, SY, SW, SH = 292, 170, 918, 396
local U = 46
local FX, FY = 360, 214 -- the L-shaped island's top-left grid crossing: 8 × 6 tiles, its top-right 4 × 3 is sea
local GOLD0 = Vector.xy(9.6, -0.2) -- where the gold block waits (tiles)
local U4, F4X, F4Y = 44, 370, 246 -- the bay island: 7 × 5 tiles round a 3 × 3 bay, open at the top
local KPX, KPY = 900, 178

-- the count's timing (seconds after the cut, the snap or the right answer)
local ROW = 0.17
local T1 = 0.7
local SNAP_COINS, RULE48, TAKE, RULE36 = 1.2, 2.3, 3.6, 4.3
local SOLVE_COINS = 0.35

-- pixel palette
local SEA = Color.rgb(44, 126, 202)
local SEA_B = Color.rgb(52, 138, 212)
local SEA_HI = Color.rgb(140, 210, 244)
local FOAM = Color.rgb(206, 240, 250)
local GROUT = Color.rgb(46, 104, 56)
local GRASS = Color.rgb(98, 178, 86)
local GRASS_HI = Color.rgb(142, 208, 110)
local GRASS_DK = Color.rgb(68, 142, 66)
local SAND = Color.rgb(242, 216, 150)
local SAND_DK = Color.rgb(212, 178, 108)
local CLIFF = Color.rgb(156, 108, 62)
local CLIFF_DK = Color.rgb(112, 74, 40)
local COIN = Color.rgb(255, 212, 72)
local COIN_HI = Color.rgb(255, 247, 200)
local COIN_DK = Color.rgb(208, 136, 34)
local HUD = Color.rgb(16, 34, 62)
local GOLD_HI = Color.rgb(250, 214, 140)

-- the island's tiles, and which of their edges face the sea
local function makeTiles(w: number, h: number, inside: (number, number) -> boolean): { Tile }
    local list: { Tile } = {}
    local function out(a: number, b: number): boolean
        return a < 0 or b < 0 or a >= w or b >= h or not inside(a, b)
    end
    for j = 0, h - 1 do
        for i = 0, w - 1 do
            if inside(i, j) then
                table.insert(list, { i = i, j = j, n = out(i, j - 1), e = out(i + 1, j), s = out(i, j + 1), w = out(i - 1, j) })
            end
        end
    end
    return list
end

local LT = makeTiles(8, 6, function(i: number, j: number): boolean
    return not (i >= 4 and j < 3)
end)
local UT = makeTiles(7, 5, function(i: number, j: number): boolean
    return not (i >= 2 and i <= 4 and j < 3)
end)
local function whole(i: number, j: number): boolean
    return true
end
local THUMB_L = makeTiles(4, 6, whole) -- the card's island, split in two
local THUMB_R = makeTiles(4, 3, whole)

local S: St = {
    cut = '', firstCut = '', cutAt = -1, a = nil, b = nil, judge = '', gap = { x = 0, v = 0 }, ticks = 0, said = false,
    gx = GOLD0.x * U, gy = GOLD0.y * U, dragging = false, grabX = 0, grabY = 0, held = 0, snapped = false, snapAt = -1,
    tookAway = false, kp = kit.keypad(KPX, KPY), solvedAt = -1, hudVal = -1, hudPop = 0, greeted = false,
}

-- Imran, at his desk beside the screen (he points and leans toward it: it is on his right)
local imran: Person = people.new(people.CAST.imran, 168)
imran.y = 622
imran.lookX, imran.lookY = 560, 360
local thumbImran: Person = people.new(people.CAST.imran, 0)
thumbImran.s = 0.4

local cues: { Cue } = {}

-- after `after` seconds Imran changes mood and says l1 / l2 in a bubble ('' hushes him, '=' keeps the bubble)
local function cue(g: G, after: number, mood: string, l1: string, l2: string?)
    table.insert(cues, { at = g.t + after, mood = mood, l1 = l1, l2 = l2 or '' })
end

local function react(g: G, mood: string, l1: string, l2: string?)
    cues = {}
    cue(g, 0, mood, l1, l2)
end

local function runCues(g: G)
    local keep: { Cue } = {}
    for _, c in cues do
        if g.t >= c.at then
            imran.mood = c.mood
            if c.l1 == '' then
                people.hush(imran)
            elseif c.l1 ~= '=' then
                people.speak(imran, c.l1, if c.l2 ~= '' then c.l2 else nil)
            end
        else
            table.insert(keep, c)
        end
    end
    cues = keep
end

L.id = 'island'
L.tag = 'ANY SHAPE: SPLIT IT UP'
L.title = "Imran's island"
L.blurb = 'Split it up, or fill it and take away.'
L.steps = {
    { title = 'Split the island', line = 'l6s1', task = 'Drag along a grid line to split the island' },
    { title = 'Split it the other way', line = 'l6s2', task = 'Cut the other way and compare the coins' },
    { title = 'Fill the corner, then take away', line = 'l6s3', task = 'Drag the gold block into the empty corner' },
    { title = 'Your turn: the bay island', line = 'l6s4', task = 'How many tiles? Use the keypad' },
}

-- What the voice says in this lesson (merged into lines.luau by main).
L.lines = {
    l6s1 = 'Imran in Pune makes phone games, with one coin on every tile. This island is awkward to count. Cut it along a grid line.',
    l6bad = "That line leaves a piece that isn't a rectangle. Follow one grid line straight across, from coast to coast.",
    l6s1done = 'Rectangles are quick: tiles in a row, times the number of rows. Watch the coins drop in.',
    l6s2 = 'Would a different cut give Imran a different number of coins? Try the other direction and find out.',
    l6s2same = "You've made that cut already. This time, go the other way.",
    l6s2done = 'Different pieces, same coins. However you split a shape, no tile gets lost and none gets counted twice.',
    l6s3 = 'Game designers have another trick. Drag the gold block into the empty corner, and the island becomes one big rectangle.',
    l6s3done = "Filled! But the gold tiles were never part of Imran's island, so off they come again.",
    l6s4 = "Imran's last level is a horseshoe island around a bay. How many coins does it need? Split it, or fill it and take away.",
    l6nperim = 'That counts the edges along the coast. Coins sit on the tiles themselves, so count the squares inside.',
    l6n35 = 'The bay is sea, and the sea gets no coins. Take those tiles away.',
    l6nx = 'Break it into rectangles: two tall sides and a strip along the bottom. Or fill the bay, then take it back out.',
    l6s4done = 'Spot on! Split it or fill it: both roads lead to the same count.',
}

local function q(x: number, y: number): Vector
    return Vector.xy(FX + x * U, FY + y * U)
end

local function rectPx(x: number, y: number, w: number, h: number, dx: number, dy: number): { Vector }
    return { Vector.xy(FX + x * U + dx, FY + y * U + dy), Vector.xy(FX + (x + w) * U + dx, FY + y * U + dy), Vector.xy(FX + (x + w) * U + dx, FY + (y + h) * U + dy), Vector.xy(FX + x * U + dx, FY + (y + h) * U + dy) }
end

-- the two rectangles a cut makes, pushed apart along the cut
local function pieces(cut: string, gapPx: number): { Piece }
    if cut == 'v' then
        return { { x = 0, y = 0, w = 4, h = 6, dx = -gapPx / 2, dy = 0 }, { x = 4, y = 3, w = 4, h = 3, dx = gapPx / 2, dy = 0 } }
    end
    return { { x = 0, y = 0, w = 4, h = 3, dx = 0, dy = -gapPx / 2 }, { x = 0, y = 3, w = 8, h = 3, dx = 0, dy = gapPx / 2 } }
end

-- when each piece starts counting, and when the count is over (seconds after the cut)
local function splitTimes(cut: string): (number, number, number)
    local P = pieces(cut, 0)
    local t2 = T1 + P[1].h * ROW + 0.35
    return T1, t2, t2 + P[2].h * ROW
end

-- which cut a stroke from a to b makes (snapped to the grid)
local function judge(a: Vector, b: Vector): string
    local dx, dy = math.abs(b.x - a.x), math.abs(b.y - a.y)
    if math.max(dx, dy) < 1.6 * U then
        return ''
    end
    if dy > dx then
        local x = math.floor(((a.x + b.x) / 2 - FX) / U + 0.5)
        if math.abs(((a.x + b.x) / 2 - FX) / U - x) > 0.4 or dx > 0.8 * U then
            return 'bad'
        end
        return if x == 4 then 'v' else 'bad'
    end
    local y = math.floor(((a.y + b.y) / 2 - FY) / U + 0.5)
    if math.abs(((a.y + b.y) / 2 - FY) / U - y) > 0.4 or dy > 0.8 * U then
        return 'bad'
    end
    return if y == 3 then 'h' else 'bad'
end

-- seconds since the thing being counted happened (the cut, the snap, the right answer), or -1
local function eventAge(g: G): number
    if g.step <= 2 then
        return if S.cut ~= '' then g.t - S.cutAt else -1
    elseif g.step == 3 then
        return if S.snapped then g.t - S.snapAt else -1
    end
    return if S.solvedAt >= 0 then g.t - S.solvedAt else -1
end

-- the moments a row of coins drops in, for the counting ticks
local function rowTimes(g: G): { number }
    local list: { number } = {}
    if g.step <= 2 and S.cut ~= '' then
        local P = pieces(S.cut, 0)
        local t1, t2 = splitTimes(S.cut)
        for rr = 0, P[1].h - 1 do
            table.insert(list, t1 + rr * ROW)
        end
        for rr = 0, P[2].h - 1 do
            table.insert(list, t2 + rr * ROW)
        end
    elseif g.step == 3 and S.snapped then
        for rr = 0, 5 do
            table.insert(list, SNAP_COINS + rr * ROW)
        end
    elseif g.step == 4 and S.solvedAt >= 0 then
        for rr = 0, 4 do
            table.insert(list, SOLVE_COINS + rr * ROW)
        end
    end
    return list
end

function L.enter(g: G, step: number)
    if step == 1 then
        S.firstCut = ''
    elseif step == 2 and S.firstCut == '' then
        S.firstCut = 'v'
    end
    S.cut, S.cutAt, S.a, S.b, S.judge = '', -1, nil, nil, ''
    S.gap = { x = 0, v = 0 }
    S.ticks, S.said = 0, false
    S.gx, S.gy, S.dragging, S.held, S.snapped, S.snapAt, S.tookAway = GOLD0.x * U, GOLD0.y * U, false, 0, false, -1, false
    S.kp = kit.keypad(KPX, KPY)
    S.solvedAt = -1
    S.hudVal, S.hudPop = -1, 0
    cues = {}
    people.hush(imran)
    imran.mood = 'watch'
    if step == 1 then
        if not S.greeted then
            S.greeted = true
            imran.mood = 'wave'
            people.speak(imran, 'Hi!')
            cue(g, 1.9, 'think', 'This level needs', 'its coin count.')
        else
            cue(g, 0.4, 'think', 'This level needs', 'its coin count.')
        end
        cue(g, 7, 'watch', '')
    elseif step == 2 then
        cue(g, 0.5, 'think', "Let's playtest it!")
        cue(g, 6, 'watch', '')
    elseif step == 3 then
        cue(g, 0.5, 'point', 'My editor has', 'a fill tool!')
        cue(g, 5.5, 'watch', '')
    else
        cue(g, 0.5, 'think', 'My hardest', 'level yet!')
        cue(g, 5.5, 'watch', '')
    end
end

function L.advance(g: G, dt: number)
    S.held = kit.follow(S.held, if S.dragging then 1 else 0, 18, dt)
    kit.spring(S.gap, if S.cut ~= '' then 20 else 0, 260, 13, dt)
    kit.keypadAdvance(S.kp, dt)
    S.hudPop = math.max(0, S.hudPop - dt * 4)
    -- a tick for every row of coins that drops in, climbing as the count grows
    local age = eventAge(g)
    if age >= 0 then
        local times = rowTimes(g)
        while S.ticks < #times and age >= times[S.ticks + 1] do
            S.ticks += 1
            g.tick(S.ticks + 1)
        end
        if g.step == 2 and not S.said then
            local _, _, tEnd = splitTimes(S.cut)
            if age >= tEnd + 0.45 then
                S.said = true
                g.say('l6s2done')
            end
        elseif g.step == 3 and not S.tookAway and age >= TAKE then
            S.tookAway = true
            g.sfx('whoosh')
        end
    end
    runCues(g)
    people.advance(imran, dt, g.t)
end

-- drawing: the room ----------------------------------------------------------------------------------

local function addRect(p: Path, x: number, y: number, w: number, h: number)
    p:moveTo(Vector.xy(x, y))
    p:lineTo(Vector.xy(x + w, y))
    p:lineTo(Vector.xy(x + w, y + h))
    p:lineTo(Vector.xy(x, y + h))
    p:close()
end

local function outlined(r: Renderer, path: Path, c: Color, w: number)
    r:drawPath(path, kit.fill(c))
    r:drawPath(path, kit.stroke(OUT, w))
end

-- Pune at dusk through Imran's window: the hills, Parvati's temple on its hill, the city lighting up
local function window(r: Renderer, t: number, wx: number, wy: number, ww: number, wh: number)
    r:drawPath(kit.rrect(wx + 4, wy + 8, ww, wh, 8), kit.soft(kit.alpha(kit.INK, 0.16), 10))
    outlined(r, kit.rrect(wx, wy, ww, wh, 8), Color.rgb(246, 242, 234), 3)
    local gx, gy, gw, gh = wx + 10, wy + 10, ww - 20, wh - 20
    r:save()
    r:clipPath(kit.rect(gx, gy, gw, gh))
    local sky = Gradient.linear(Vector.xy(0, gy), Vector.xy(0, gy + gh), {
        { position = 0, color = Color.rgb(84, 86, 164) },
        { position = 0.55, color = Color.rgb(206, 128, 150) },
        { position = 1, color = Color.rgb(252, 182, 116) },
    })
    r:drawPath(kit.rect(gx, gy, gw, gh), Paint.with({ gradient = sky }))
    -- a thin moon and a first star
    r:drawPath(kit.circle(gx + gw - 30, gy + 22, 9), kit.fill(Color.rgb(252, 244, 214)))
    r:drawPath(kit.circle(gx + gw - 26, gy + 19, 8), kit.fill(Color.rgb(92, 92, 168)))
    local tw = 0.5 + 0.5 * math.sin(t * 2.3)
    r:drawPath(kit.circle(gx + 34, gy + 18, 1.8 + tw), kit.fill(kit.alpha(Color.rgb(255, 250, 230), 0.8)))
    -- far hills, then Parvati hill with its temple
    local far = Path.new()
    far:moveTo(Vector.xy(gx, gy + gh))
    far:lineTo(Vector.xy(gx, gy + 70))
    far:cubicTo(Vector.xy(gx + 40, gy + 56), Vector.xy(gx + 70, gy + 64), Vector.xy(gx + 100, gy + 72))
    far:cubicTo(Vector.xy(gx + 130, gy + 78), Vector.xy(gx + 150, gy + 60), Vector.xy(gx + gw, gy + 66))
    far:lineTo(Vector.xy(gx + gw, gy + gh))
    far:close()
    r:drawPath(far, kit.fill(Color.rgb(132, 96, 140)))
    local hx = gx + 58
    local hill = Path.new()
    hill:moveTo(Vector.xy(gx - 10, gy + gh))
    hill:cubicTo(Vector.xy(gx + 10, gy + 92), Vector.xy(hx - 22, gy + 74), Vector.xy(hx, gy + 74))
    hill:cubicTo(Vector.xy(hx + 22, gy + 74), Vector.xy(hx + 50, gy + 96), Vector.xy(hx + 90, gy + gh))
    hill:close()
    local DUSK = Color.rgb(86, 62, 108)
    r:drawPath(hill, kit.fill(DUSK))
    -- the temple: a hall, a dome and a spire on the hilltop
    r:drawPath(kit.rect(hx - 12, gy + 64, 24, 11), kit.fill(DUSK))
    r:drawPath(kit.circle(hx, gy + 64, 8), kit.fill(DUSK))
    r:drawPath(kit.poly({ Vector.xy(hx - 3, gy + 58), Vector.xy(hx, gy + 46), Vector.xy(hx + 3, gy + 58) }), kit.fill(DUSK))
    -- the city: rooftops and windows lighting up
    local city = Color.rgb(70, 52, 92)
    local x = gx + 92
    local k = 0
    while x < gx + gw do
        local bh = 16 + ((k * 37) % 4) * 7
        r:drawPath(kit.rect(x, gy + gh - bh, 20, bh), kit.fill(city))
        for wi = 0, 1 do
            local on = math.sin(t * 0.9 + k * 1.7 + wi * 2.3) > -0.2
            if on then
                r:drawPath(kit.rect(x + 4 + wi * 8, gy + gh - bh + 5, 4, 4), kit.fill(Color.rgb(255, 214, 120)))
            end
        end
        x += 22
        k += 1
    end
    r:restore()
    -- the window's middle bar and its sill
    r:drawPath(kit.line(wx + ww / 2, gy, wx + ww / 2, gy + gh), kit.stroke(OUT, 3))
    r:drawPath(kit.line(gx, gy + gh * 0.42, gx + gw, gy + gh * 0.42), kit.stroke(kit.alpha(OUT, 0.55), 2))
    outlined(r, kit.rrect(wx - 8, wy + wh - 4, ww + 16, 11, 4), Color.rgb(246, 242, 234), 2.5)
end

-- sticky notes with level sketches, on the wall by his desk
local function notes(r: Renderer)
    local function note(x: number, y: number, a: number, c: Color, sketch: number)
        r:save()
        r:transform(Mat2D.withTranslation(x, y) * Mat2D.withRotation(a))
        r:drawPath(kit.rect(-17, -15, 36, 36), kit.soft(kit.alpha(kit.INK, 0.14), 4))
        outlined(r, kit.rect(-18, -18, 36, 36), c, 2)
        if sketch == 1 then
            -- a tiny island, in squares
            local p = Path.new()
            addRect(p, -10, -6, 6, 6)
            addRect(p, -4, -6, 6, 6)
            addRect(p, -10, 0, 6, 6)
            addRect(p, -4, 0, 6, 6)
            addRect(p, 2, 0, 6, 6)
            r:drawPath(p, kit.fill(Color.rgb(98, 178, 86)))
            r:drawPath(p, kit.stroke(kit.alpha(OUT, 0.6), 1))
        else
            r:drawPath(kit.line(-11, -8, 10, -8), kit.stroke(kit.alpha(kit.INK_SOFT, 0.8), 2))
            r:drawPath(kit.line(-11, -1, 6, -1), kit.stroke(kit.alpha(kit.INK_SOFT, 0.8), 2))
            r:drawPath(kit.line(-11, 6, 8, 6), kit.stroke(kit.alpha(kit.INK_SOFT, 0.8), 2))
        end
        r:restore()
    end
    note(92, 352, -0.06, Color.rgb(255, 238, 156), 1)
    note(140, 346, 0.05, Color.rgb(255, 202, 212), 0)
    note(188, 354, -0.03, Color.rgb(196, 234, 204), 0)
end

local function room(r: Renderer, t: number)
    local bx, by, bw, bh = kit.BX, kit.BY, kit.BW, kit.BH
    local wall = Gradient.linear(Vector.xy(0, by), Vector.xy(0, by + bh), {
        { position = 0, color = Color.rgb(242, 228, 208) },
        { position = 1, color = Color.rgb(232, 212, 186) },
    })
    r:drawPath(kit.rect(bx, by, bw, bh), Paint.with({ gradient = wall }))
    window(r, t, 64, 170, 196, 146)
    notes(r)
    -- the floor by the desk
    r:drawPath(kit.rect(bx, 598, 240, 40), kit.fill(Color.rgb(198, 154, 110)))
    r:drawPath(kit.line(bx, 598, bx + 240, 598), kit.stroke(Color.rgb(160, 116, 76), 3))
    r:drawPath(kit.line(bx, 618, bx + 240, 618), kit.stroke(kit.alpha(Color.rgb(160, 116, 76), 0.5), 1.5))
    -- the desk, and the monitor on it
    r:drawPath(kit.rect(268, 598, 980, 44), kit.fill(Color.rgb(160, 110, 68)))
    r:drawPath(kit.rect(268, 598, 980, 44), kit.stroke(OUT, 2.5))
    r:drawPath(kit.line(700, 606, 700, 640), kit.stroke(kit.alpha(OUT, 0.5), 2))
    outlined(r, kit.rrect(256, 586, 1000, 14, 5), Color.rgb(192, 140, 90), 2.5)
    outlined(r, kit.rect(724, 578, 52, 10), Color.rgb(58, 62, 72), 2.5)
    outlined(r, kit.rrect(690, 582, 120, 8, 4), Color.rgb(58, 62, 72), 2.5)
    r:drawPath(kit.rrect(SX - 10, SY - 6, SW + 28, SH + 28, 16), kit.soft(kit.alpha(kit.INK, 0.2), 16))
    outlined(r, kit.rrect(SX - 14, SY - 14, SW + 28, SH + 28, 16), Color.rgb(40, 44, 54), 3)
    r:drawPath(kit.circle(SX + SW / 2, SY + SH + 7, 2.5), kit.fill(Color.rgb(96, 210, 140)))
end

-- drawing: the game ----------------------------------------------------------------------------------

-- the sea: checked blue tiles, a slow shimmer drifting across, little waves that come and go
-- (never on the tiles from (calmX0, calmY0) to (calmX1, calmY1), round the island, where the labels go)
local function sea(r: Renderer, t: number, ox: number, oy: number, u: number, calmX0: number, calmY0: number, calmX1: number, calmY1: number)
    r:drawPath(kit.rect(SX, SY, SW, SH), kit.fill(SEA))
    local i0, i1 = math.floor((SX - ox) / u), math.ceil((SX + SW - ox) / u)
    local j0, j1 = math.floor((SY - oy) / u), math.ceil((SY + SH - oy) / u)
    local checker, glint1, glint2, waves = Path.new(), Path.new(), Path.new(), Path.new()
    for j = j0, j1 do
        for i = i0, i1 do
            local x, y = ox + i * u, oy + j * u
            if (i + j) % 2 == 0 then
                addRect(checker, x, y, u, u)
            end
            local s = math.sin(t * 1.3 - i * 0.5 + j * 0.35)
            if s > 0.9 then
                addRect(glint2, x, y, u, u)
            elseif s > 0.65 then
                addRect(glint1, x, y, u, u)
            end
            local calm = i >= calmX0 and i < calmX1 and j >= calmY0 and j < calmY1
            if (i * 7 + j * 13) % 5 == 0 and not calm then
                local ph = (t * 0.7 + i * 0.37 + j * 0.53) % 1
                if ph < 0.6 then
                    local wx, wy = x + 10 + math.floor(ph * 4) * 3, y + math.floor(u * 0.45)
                    addRect(waves, wx, wy, 6, 3)
                    addRect(waves, wx + 6, wy - 3, 6, 3)
                    addRect(waves, wx + 12, wy, 6, 3)
                end
            end
        end
    end
    r:drawPath(checker, kit.fill(SEA_B))
    r:drawPath(glint1, kit.fill(kit.alpha(SEA_HI, 0.12)))
    r:drawPath(glint2, kit.fill(kit.alpha(SEA_HI, 0.24)))
    r:drawPath(waves, kit.fill(kit.alpha(kit.SURFACE, 0.6)))
end

-- island tiles at grid crossing (ox, oy): grass with sandy beaches on the sea-facing edges, a cliff below,
-- foam round the shore. lit 0..1 brightens them while they are being counted.
local function island(r: Renderer, tiles: { Tile }, ox: number, oy: number, u: number, t: number)
    local B = math.floor(u * 0.2)
    local CL = math.floor(u * 0.2)
    local foam, cliff, cliffDk, base = Path.new(), Path.new(), Path.new(), Path.new()
    local grass, grassHi, grassDk, tuft, sand, speck = Path.new(), Path.new(), Path.new(), Path.new(), Path.new(), Path.new()
    for _, tl in tiles do
        local x, y = ox + tl.i * u, oy + tl.j * u
        local low = if tl.s then CL else 0
        if tl.n then
            addRect(foam, x - 3, y - 6, u + 6, 4)
        end
        if tl.s then
            addRect(foam, x - 3, y + u + CL + 2, u + 6, 4)
            addRect(cliff, x, y + u, u, CL)
            addRect(cliffDk, x, y + u + CL - 3, u, 3)
        end
        if tl.w then
            addRect(foam, x - 6, y - 3, 4, u + 6 + low)
        end
        if tl.e then
            addRect(foam, x + u + 2, y - 3, 4, u + 6 + low)
        end
        addRect(base, x, y, u, u)
        addRect(grass, x + 1, y + 1, u - 2, u - 2)
        addRect(grassHi, x + 1, y + 1, u - 2, 3)
        addRect(grassDk, x + 1, y + u - 4, u - 2, 3)
        local hs = (tl.i * 31 + tl.j * 17) % 5
        local big = u >= 24 -- tufts and sand specks only where a tile is big enough to hold them
        if big then
            local tx, ty = x + B + 3 + hs * 3, y + B + 4 + (hs % 3) * 4
            addRect(tuft, tx, ty, 3, 5)
            addRect(tuft, tx + 4, ty - 3, 3, 8)
        end
        if tl.n then
            addRect(sand, x + 1, y + 1, u - 2, B)
            if big then
                addRect(speck, x + 8 + hs * 4, y + 4, 2, 2)
            end
        end
        if tl.s then
            addRect(sand, x + 1, y + u - 1 - B, u - 2, B)
            if big then
                addRect(speck, x + 26 - hs * 3, y + u - 6, 2, 2)
            end
        end
        if tl.w then
            addRect(sand, x + 1, y + 1, B, u - 2)
            if big then
                addRect(speck, x + 4, y + 14 + hs * 4, 2, 2)
            end
        end
        if tl.e then
            addRect(sand, x + u - 1 - B, y + 1, B, u - 2)
            if big then
                addRect(speck, x + u - 7, y + 30 - hs * 3, 2, 2)
            end
        end
    end
    r:drawPath(foam, kit.fill(kit.alpha(FOAM, 0.55 + 0.2 * math.sin(t * 2.2))))
    r:drawPath(cliff, kit.fill(CLIFF))
    r:drawPath(cliffDk, kit.fill(CLIFF_DK))
    r:drawPath(base, kit.fill(GROUT))
    r:drawPath(grass, kit.fill(GRASS))
    r:drawPath(grassHi, kit.fill(GRASS_HI))
    r:drawPath(grassDk, kit.fill(GRASS_DK))
    r:drawPath(tuft, kit.fill(GRASS_DK))
    r:drawPath(sand, kit.fill(SAND))
    r:drawPath(speck, kit.fill(SAND_DK))
end

-- a little islet with a pixel palm: scenery, well away from anything that moves
local function islet(r: Renderer, t: number, x: number, y: number, u: number)
    local B = math.floor(u * 0.2)
    local foam, cliff, sand, speck = Path.new(), Path.new(), Path.new(), Path.new()
    addRect(foam, x - 6, y - 6, 2 * u + 12, u + B + 14)
    addRect(cliff, x, y + u, 2 * u, B)
    addRect(sand, x, y, 2 * u, u)
    addRect(speck, x + 12, y + 12, 3, 3)
    addRect(speck, x + u + 20, y + 26, 3, 3)
    addRect(speck, x + 30, y + u - 10, 3, 3)
    r:drawPath(foam, kit.fill(kit.alpha(FOAM, 0.45 + 0.2 * math.sin(t * 2.2 + 1))))
    r:drawPath(cliff, kit.fill(CLIFF))
    r:drawPath(kit.rect(x, y + u + B - 3, 2 * u, 3), kit.fill(CLIFF_DK))
    r:drawPath(sand, kit.fill(SAND))
    r:drawPath(kit.rect(x, y, 2 * u, 3), kit.fill(Color.rgb(252, 234, 184)))
    r:drawPath(speck, kit.fill(SAND_DK))
    -- the palm: a ringed trunk leaning a little, four arching fronds that sway a pixel at a time, coconuts
    local P = 3
    local bx, by = x + math.floor(u * 0.55), y + u - 12
    r:drawPath(kit.rect(bx - 4, by + 4, 30, 5), kit.fill(kit.alpha(Color.rgb(150, 120, 70), 0.4)))
    local lean = { 0, 0, 0, 1, 1, 1, 2, 2, 3, 4 }
    local trunk, rings = Path.new(), Path.new()
    for k, l in lean do
        local tx, ty = bx + l * P, by - (k - 1) * 2 * P
        addRect(trunk, tx, ty, 2 * P + 1, 2 * P)
        if k % 2 == 1 then
            addRect(rings, tx, ty + 2 * P - 2, 2 * P + 1, 2)
        end
    end
    r:drawPath(trunk, kit.fill(Color.rgb(160, 110, 60)))
    r:drawPath(rings, kit.fill(Color.rgb(116, 76, 40)))
    local sway = math.floor(math.sin(t * 1.4) * 1.2 + 0.5) * P
    local cx, cy = bx + 5 * P + sway, by - #lean * 2 * P + P
    -- each frond is a run of blocks in pixel units { x, y, w, h } from the crown, drooping toward its tip
    local FRONDS: { { number } } = {
        { 1, -2, 4, 2 }, { 5, -1, 3, 2 }, { 8, 1, 2, 2 }, { 10, 3, 1, 2 },
        { -5, -2, 4, 2 }, { -8, -1, 3, 2 }, { -10, 1, 2, 2 }, { -11, 3, 1, 2 },
        { 0, -4, 3, 2 }, { 3, -6, 3, 2 }, { 6, -6, 2, 2 }, { 8, -5, 1, 2 },
        { -3, -4, 3, 2 }, { -6, -6, 3, 2 }, { -8, -6, 2, 2 }, { -9, -5, 1, 2 },
    }
    local fr, frDk = Path.new(), Path.new()
    for _, b in FRONDS do
        addRect(fr, cx + b[1] * P, cy + b[2] * P, b[3] * P, b[4] * P)
        addRect(frDk, cx + b[1] * P, cy + (b[2] + b[4]) * P - 2, b[3] * P, 2)
    end
    r:drawPath(fr, kit.fill(Color.rgb(70, 170, 76)))
    r:drawPath(frDk, kit.fill(Color.rgb(38, 118, 56)))
    local nuts = Path.new()
    addRect(nuts, cx - 2 * P, cy, 2 * P, 2 * P)
    addRect(nuts, cx, cy + P, 2 * P, 2 * P)
    r:drawPath(nuts, kit.fill(Color.rgb(112, 72, 36)))
end

-- a pixel coin, 8 × 8 pixels round its centre. Its shapes are built once (one pixel = 1) and drawn scaled.
local COIN_SHAPE: { { number } } = {
    { -2, -4 }, { 2, -4 }, { 2, -3 }, { 3, -3 }, { 3, -2 }, { 4, -2 }, { 4, 2 }, { 3, 2 }, { 3, 3 }, { 2, 3 },
    { 2, 4 }, { -2, 4 }, { -2, 3 }, { -3, 3 }, { -3, 2 }, { -4, 2 }, { -4, -2 }, { -3, -2 }, { -3, -3 }, { -2, -3 },
}
type CoinArt = { body: Path, shadow: Path, shade: Path, shine: Path, fill: Paint, fillShadow: Paint, fillShade: Paint, fillShine: Paint, edge: Paint }
local coinArt: CoinArt? = nil

local function getCoinArt(): CoinArt
    local made = coinArt
    if made ~= nil then
        return made
    end
    local P: { Vector } = {}
    for _, c in COIN_SHAPE do
        table.insert(P, Vector.xy(c[1], c[2]))
    end
    local shade, shine = Path.new(), Path.new()
    addRect(shade, 2, -2, 1, 4)
    addRect(shade, -2, 2, 4, 1)
    addRect(shade, -0.5, -1.5, 1, 3)
    addRect(shine, -3, -1, 1, 2)
    addRect(shine, -2, -3, 2, 1)
    local art: CoinArt = {
        body = kit.poly(P), shadow = kit.poly(kit.offset(P, 0.6, 1.1)), shade = shade, shine = shine,
        fill = kit.fill(COIN), fillShadow = kit.fill(kit.alpha(kit.INK, 0.28)), fillShade = kit.fill(COIN_DK),
        fillShine = kit.fill(COIN_HI), edge = Paint.with({ style = 'stroke', thickness = 0.64, color = OUT, join = 'miter' }),
    }
    coinArt = art
    return art
end

-- a coin centred on (cx, cy); px is the size of one of its pixels
local function coin(r: Renderer, cx: number, cy: number, px: number)
    local a = getCoinArt()
    r:save()
    r:transform(Mat2D.withTranslation(cx, cy) * Mat2D.withScale(px, px))
    r:drawPath(a.shadow, a.fillShadow)
    r:drawPath(a.body, a.fill)
    r:drawPath(a.shade, a.fillShade)
    r:drawPath(a.shine, a.fillShine)
    r:drawPath(a.body, a.edge)
    r:restore()
end

-- a coin dropping onto the tile at (x, y): k 0..1 since it started to fall
local function dropCoin(r: Renderer, x: number, y: number, u: number, k: number)
    if k <= 0 then
        return
    end
    coin(r, x + u / 2, y + u / 2 - (1 - kit.ease(k)) * 16, u * 0.055 * kit.back(k))
end

-- a game label: white text on a dark pill
local function chip(r: Renderer, f: kit.Fonts, s: string, cx: number, cy: number, size: number, k: number)
    if k <= 0.01 then
        return
    end
    local w = kit.width(f, s, f.display, size) + 26
    local h = size * 1.55
    local sc = kit.back(k)
    r:save()
    r:modulateOpacity(kit.clamp(k * 2, 0, 1))
    r:transform(Mat2D.withTranslation(cx, cy) * Mat2D.withScale(sc, sc))
    r:drawPath(kit.rrect(-w / 2 + 2, -h / 2 + 3, w, h, 8), kit.fill(kit.alpha(kit.INK, 0.3)))
    r:drawPath(kit.rrect(-w / 2, -h / 2, w, h, 8), kit.fill(kit.alpha(HUD, 0.88)))
    r:drawPath(kit.rrect(-w / 2, -h / 2, w, h, 8), kit.stroke(kit.alpha(kit.SURFACE, 0.4), 2))
    kit.label(r, f, s, f.display, size, kit.SURFACE, 0, 1, 0.5)
    r:restore()
end

-- the coin counter, bottom right of the screen
local function hud(r: Renderer, f: kit.Fonts, n: number)
    if n ~= S.hudVal then
        if S.hudVal >= 0 or n >= 0 then
            S.hudPop = 1
        end
        S.hudVal = n
    end
    local w, h = 172, 46
    local x, y = SX + SW - w - 14, SY + SH - h - 12
    local sc = 1 + 0.1 * math.sin(kit.clamp(S.hudPop, 0, 1) * math.pi)
    r:save()
    r:transform(Mat2D.withTranslation(x + w / 2, y + h / 2) * Mat2D.withScale(sc, sc) * Mat2D.withTranslation(-(x + w / 2), -(y + h / 2)))
    r:drawPath(kit.rrect(x + 2, y + 4, w, h, 10), kit.fill(kit.alpha(kit.INK, 0.25)))
    r:drawPath(kit.rrect(x, y, w, h, 10), kit.fill(kit.alpha(HUD, 0.86)))
    r:drawPath(kit.rrect(x, y, w, h, 10), kit.stroke(kit.alpha(kit.SURFACE, 0.4), 2))
    coin(r, x + 25, y + h / 2, 2.5)
    kit.label(r, f, 'COINS', f.mono, 12, kit.alpha(kit.SURFACE, 0.75), x + 46, y + h / 2 + 1, 0)
    kit.label(r, f, if n >= 0 then tostring(n) else '?', f.display, 26, kit.SURFACE, x + w - 16, y + h / 2 + 1, 1)
    r:restore()
end

local function levelTag(r: Renderer, f: kit.Fonts, s: string)
    local w = kit.width(f, s, f.mono, 12) + 20
    r:drawPath(kit.rrect(SX + 8, SY + 8, w, 22, 6), kit.fill(kit.alpha(HUD, 0.7)))
    kit.label(r, f, s, f.mono, 12, kit.alpha(kit.SURFACE, 0.9), SX + 18, SY + 19, 0)
end

-- steps 1 and 2: the cut ---------------------------------------------------------------------------

local function tilesIn(pc: Piece): { Tile }
    local out: { Tile } = {}
    for _, tl in LT do
        if tl.i >= pc.x and tl.i < pc.x + pc.w and tl.j >= pc.y and tl.j < pc.y + pc.h then
            table.insert(out, tl)
        end
    end
    return out
end

local function drawCutStroke(r: Renderer)
    local a, b = S.a, S.b
    if a == nil or b == nil then
        return
    end
    local j = judge(a, b)
    if j == 'v' then
        r:drawPath(kit.line(FX + 4 * U, FY - 20, FX + 4 * U, FY + 6 * U + 20), kit.stroke(kit.GOLD, 6))
    elseif j == 'h' then
        r:drawPath(kit.line(FX - 20, FY + 3 * U, FX + 4 * U + 20, FY + 3 * U), kit.stroke(kit.GOLD, 6))
    else
        r:drawPath(kit.dashed(a.x, a.y, b.x, b.y, 12, 9), kit.stroke(if j == 'bad' then kit.RED else kit.SURFACE, 4))
    end
end

local function drawStep12(g: G, r: Renderer)
    local f = g.fonts
    local age = eventAge(g)
    local coins = -1
    if S.cut == '' then
        island(r, LT, FX, FY, U, g.t)
        drawCutStroke(r)
        -- after a while, the grid lines that work glow softly
        if g.age > 4 and S.a == nil then
            local k = kit.clamp((g.age - 4) * 2, 0, 1) * (0.55 + 0.45 * math.sin(g.t * 3))
            local want = if g.step == 2 and S.firstCut == 'v' then 'h' elseif g.step == 2 then 'v' else ''
            local function glow(x1: number, y1: number, x2: number, y2: number)
                r:drawPath(kit.line(x1, y1, x2, y2), kit.stroke(kit.alpha(kit.SURFACE, 0.55 * k), 9))
                r:drawPath(kit.dashed(x1, y1, x2, y2, 10, 7, g.t * 30), kit.stroke(kit.alpha(kit.GOLD, k), 5))
            end
            if want ~= 'h' then
                glow(FX + 4 * U, FY - 10, FX + 4 * U, FY + 6 * U + 10)
            end
            if want ~= 'v' then
                glow(FX - 10, FY + 3 * U, FX + 4 * U + 10, FY + 3 * U)
            end
        end
    else
        coins = 0
        local P = pieces(S.cut, S.gap.x)
        local t1, t2, tEnd = splitTimes(S.cut)
        local starts = { t1, t2 }
        for k, pc in P do
            local ox, oy = FX + pc.dx, FY + pc.dy
            island(r, tilesIn(pc), ox, oy, U, g.t)
            -- lit while it is counted, and a soft glow after
            local st = starts[k]
            local fin = st + pc.h * ROW
            local lit = if age < st - 0.15 then 0 elseif age < fin + 0.2 then 1 else 0.45
            if lit > 0 then
                local x0, y0 = ox + pc.x * U, oy + pc.y * U
                r:drawPath(kit.rect(x0, y0, pc.w * U, pc.h * U), kit.fill(kit.alpha(kit.SURFACE, 0.12 * lit)))
                r:drawPath(kit.rect(x0 - 2, y0 - 2, pc.w * U + 4, pc.h * U + 4), Paint.with({ style = 'stroke', thickness = 4, color = kit.alpha(kit.SURFACE, 0.9 * lit), join = 'miter' }))
            end
        end
        -- the coins drop in, row by row
        for k, pc in P do
            local ox, oy = FX + pc.dx, FY + pc.dy
            for _, tl in tilesIn(pc) do
                local at = starts[k] + (tl.j - pc.y) * ROW + (tl.i - pc.x) * 0.02
                local ck = kit.clamp((age - at) / 0.28, 0, 1)
                if age >= at then
                    coins += 1
                end
                dropCoin(r, ox + tl.i * U, oy + tl.j * U, U, ck)
            end
        end
        -- each piece's own count
        for k, pc in P do
            local cx, cy = FX + (pc.x + pc.w / 2) * U + pc.dx, FY + (pc.y + pc.h / 2) * U + pc.dy
            local lk = kit.clamp((age - (starts[k] + pc.h * ROW + 0.15)) * 3, 0, 1)
            chip(r, f, pc.w .. ' × ' .. pc.h .. ' = ' .. (pc.w * pc.h), cx, cy, 24, lk)
        end
        local sum = if S.cut == 'v' then '24 + 12 = 36' else '12 + 24 = 36'
        kit.rule(r, f, sum, if S.cut == 'v' then 'split down the middle' else 'split across', kit.clamp((age - tEnd - 0.45) * 1.5, 0, 1), 1000, if g.step == 2 then 326 else 236)
    end
    if g.step == 2 then
        -- the first split, to compare with
        kit.rule(r, f, if S.firstCut == 'v' then '24 + 12 = 36' else '12 + 24 = 36', 'your first split', 1, 1000, 196)
    end
    hud(r, f, coins)
end

-- step 3: fill the corner, then take it away ---------------------------------------------------------

-- the gold block: 4 × 3 shiny gold tiles. edge: it can be moved (a white-and-gold rim, pulsing while it waits)
local function goldBlock(r: Renderer, t: number, x: number, y: number, held: number, edge: boolean)
    local W, H = 4 * U, 3 * U
    local P = { Vector.xy(x, y), Vector.xy(x + W, y), Vector.xy(x + W, y + H), Vector.xy(x, y + H) }
    r:drawPath(kit.poly(kit.offset(P, 3 + 10 * held, 8 + 20 * held)), kit.soft(kit.alpha(kit.INK, 0.25), 9 + 14 * held))
    local yy = y - 12 * held
    if edge and held < 0.5 then
        local k = (t * 0.6) % 1
        local gg = 4 + k * 16
        r:drawPath(kit.rrect(x - gg, yy - gg, W + 2 * gg, H + 2 * gg, 6 + gg * 0.5), kit.stroke(kit.alpha(kit.GOLD, 0.7 * (1 - k)), 3))
    end
    local base, hi, dk, shine = Path.new(), Path.new(), Path.new(), Path.new()
    for j = 0, 2 do
        for i = 0, 3 do
            local tx, ty = x + i * U, yy + j * U
            addRect(base, tx + 1, ty + 1, U - 2, U - 2)
            addRect(hi, tx + 1, ty + 1, U - 2, 3)
            addRect(hi, tx + 1, ty + 4, 3, U - 5)
            addRect(dk, tx + 4, ty + U - 4, U - 5, 3)
            addRect(dk, tx + U - 4, ty + 4, 3, U - 8)
            addRect(shine, tx + 7, ty + 7, 9, 3)
            addRect(shine, tx + 7, ty + 10, 3, 6)
        end
    end
    r:drawPath(kit.rect(x, yy, W, H), kit.fill(kit.GOLD_DEEP))
    r:drawPath(base, kit.fill(kit.GOLD))
    r:drawPath(hi, kit.fill(GOLD_HI))
    r:drawPath(dk, kit.fill(kit.alpha(kit.GOLD_DEEP, 0.4)))
    r:drawPath(shine, kit.fill(kit.alpha(kit.SURFACE, 0.75)))
    if edge then
        r:drawPath(kit.rect(x - 3, yy - 3, W + 6, H + 6), Paint.with({ style = 'stroke', thickness = 5, color = kit.GOLD, join = 'miter' }))
        r:drawPath(kit.rect(x, yy, W, H), Paint.with({ style = 'stroke', thickness = 2.5, color = kit.SURFACE, join = 'miter' }))
    end
end

local function drawStep3(g: G, r: Renderer)
    local f = g.fonts
    local age = eventAge(g)
    -- the empty corner: where the block goes
    if not S.snapped then
        local slot = rectPx(4, 0, 4, 3, 0, 0)
        local d = math.sqrt((S.gx - 4 * U) ^ 2 + S.gy ^ 2)
        local gk = if d < 4 * U then kit.clamp(1.4 - d / (3 * U), 0.2, 1) else 0.2
        r:drawPath(kit.poly(slot), kit.fill(kit.alpha(kit.GOLD_WASH, 0.25 * gk + 0.1)))
        for i = 1, 4 do
            local a, b = slot[i], slot[(i % 4) + 1]
            r:drawPath(kit.dashed(a.x, a.y, b.x, b.y, 10, 8, g.t * 20), kit.stroke(kit.alpha(kit.GOLD, 0.6 + 0.4 * gk), 3))
        end
    end
    island(r, LT, FX, FY, U, g.t)
    local coins = -1
    if not S.snapped then
        if not S.dragging then
            local bob = math.sin(g.t * 4) * 3
            goldBlock(r, g.t, FX + S.gx, FY + S.gy - bob, S.held, true)
            chip(r, f, '4 × 3', FX + S.gx + 2 * U, FY + S.gy - bob + 1.5 * U - 12 * S.held, 22, 1)
        end
    else
        coins = 0
        -- the coins drop onto the whole rectangle, the gold tiles too
        for _, tl in LT do
            local at = SNAP_COINS + tl.j * ROW + tl.i * 0.02
            if age >= at then
                coins += 1
            end
            dropCoin(r, FX + tl.i * U, FY + tl.j * U, U, kit.clamp((age - at) / 0.28, 0, 1))
        end
        -- then the gold block, with its coins, comes off again
        local tk = kit.clamp((age - TAKE) / 0.8, 0, 1)
        local lift = kit.ease(tk) * 46
        if tk > 0 then
            local ghost = rectPx(4, 0, 4, 3, 0, 0)
            for i = 1, 4 do
                local a, b = ghost[i], ghost[(i % 4) + 1]
                r:drawPath(kit.dashed(a.x, a.y, b.x, b.y, 8, 8), kit.stroke(kit.alpha(kit.SURFACE, 0.7 * tk), 2.5))
            end
        end
        if tk < 1 then
            r:save()
            r:modulateOpacity(1 - tk)
            goldBlock(r, g.t, FX + 4 * U, FY - lift, 0, false)
            for j = 0, 2 do
                for i = 0, 3 do
                    local at = SNAP_COINS + j * ROW + (i + 4) * 0.02
                    if age >= at then
                        coins += 1
                    end
                    dropCoin(r, FX + (i + 4) * U, FY + j * U - lift, U, kit.clamp((age - at) / 0.28, 0, 1))
                end
            end
            if tk > 0 then
                chip(r, f, '− 12', FX + 6 * U, FY + 1.5 * U - lift, 24, kit.clamp(tk * 4, 0, 1))
            end
            r:restore()
        end
        if tk > 0 and tk < 1 then
            coins -= math.floor(12 * tk + 0.0001) -- the counter runs down as they go
        end
        -- one big rectangle: its outline, its sides, its count
        local big = rectPx(0, 0, 8, 6, 0, 0)
        r:drawPath(kit.partialOutline(big, (age - 0.2) / 1.0), Paint.with({ style = 'stroke', thickness = 4, color = kit.alpha(kit.SURFACE, 0.95), join = 'miter' }))
        local CL = math.floor(U * 0.2)
        kit.bracket(r, f, q(0, 6.3 + CL / U), q(8, 6.3 + CL / U), 0, 1, '8', kit.clamp((age - 1.0) * 1.5, 0, 1), kit.SURFACE)
        kit.bracket(r, f, q(-0.5, 0), q(-0.5, 6), -1, 0, '6', kit.clamp((age - 1.5) * 1.5, 0, 1), kit.SURFACE)
        kit.rule(r, f, '8 × 6 = 48', 'the big rectangle', kit.clamp((age - RULE48) * 1.5, 0, 1), 1000, 230)
        kit.rule(r, f, '48 − 12 = 36', 'take away the gold tiles', kit.clamp((age - RULE36) * 1.5, 0, 1), 1000, 360)
    end
    -- the block while it is held goes over everything
    if not S.snapped and S.dragging then
        goldBlock(r, g.t, FX + S.gx, FY + S.gy, S.held, true)
        chip(r, f, '4 × 3', FX + S.gx + 2 * U, FY + S.gy + 1.5 * U - 12 * S.held, 22, 1)
    end
    hud(r, f, coins)
end

-- step 4: the bay island --------------------------------------------------------------------------------

local function drawStep4(g: G, r: Renderer)
    local f = g.fonts
    local age = eventAge(g)
    island(r, UT, F4X, F4Y, U4, g.t)
    local function at(x: number, y: number): Vector
        return Vector.xy(F4X + x * U4, F4Y + y * U4)
    end
    if S.solvedAt >= 0 then
        for _, tl in UT do
            local t0 = SOLVE_COINS + tl.j * ROW + tl.i * 0.02
            dropCoin(r, F4X + tl.i * U4, F4Y + tl.j * U4, U4, kit.clamp((age - t0) / 0.28, 0, 1))
        end
    end
    -- the measurements fade once it is solved
    local mk = if S.solvedAt >= 0 then 1 - kit.clamp(age * 2.5, 0, 1) else 1
    if mk > 0 then
        r:save()
        r:modulateOpacity(mk)
        local CL = math.floor(U4 * 0.2)
        local W = kit.SURFACE
        kit.bracket(r, f, at(0, 5.3 + CL / U4), at(7, 5.3 + CL / U4), 0, 1, '7', 1, W)
        kit.bracket(r, f, at(-0.5, 0), at(-0.5, 5), -1, 0, '5', 1, W)
        kit.label(r, f, '2', f.display, 22, W, F4X + U4, F4Y - 20, 0.5)
        kit.label(r, f, '2', f.display, 22, W, F4X + 6 * U4, F4Y - 20, 0.5)
        r:drawPath(kit.dashed(F4X + 2 * U4 + 10, F4Y + 6, F4X + 2 * U4 + 10, F4Y + 3 * U4 - 8, 6, 6), kit.stroke(kit.alpha(W, 0.85), 2.5))
        kit.label(r, f, '3 deep', f.body, 18, W, F4X + 3.6 * U4, F4Y + 1.3 * U4, 0.5)
        kit.label(r, f, '3 wide', f.body, 18, W, F4X + 3.5 * U4, F4Y + 3 * U4 - 18, 0.5)
        r:restore()
    end
    if S.solvedAt >= 0 then
        kit.rule(r, f, '7 × 5 − 3 × 3 = 26', 'or split it: 2 × 5 + 3 × 2 + 2 × 5 = 26', kit.clamp(age * 1.5, 0, 1), 524, 468)
    end
end

-- the keypad sits on the screen; its message may run onto the bezel, so it is drawn outside the screen's clip
local function drawKeypad(g: G, r: Renderer)
    if S.kp.msg ~= '' then
        local kw = 16 * 2 + 3 * 78 + 2 * 10
        r:drawPath(kit.rrect(KPX + kw / 2 - 118, KPY + 368, 236, 28, 14), kit.fill(kit.alpha(kit.SURFACE, 0.96)))
    end
    kit.keypadDraw(r, g.fonts, S.kp, 'Tiles on this island', 'tiles', g.t)
end

function L.draw(g: G, r: Renderer)
    local f = g.fonts
    room(r, g.t)
    r:save()
    r:clipPath(kit.rrect(SX, SY, SW, SH, 6))
    if g.step <= 3 then
        sea(r, g.t, FX, FY, U, -2, -1, 9, 8)
        islet(r, g.t, FX + 9 * U, FY + 6 * U, U)
        levelTag(r, f, 'LEVEL 3')
        if g.step <= 2 then
            drawStep12(g, r)
        else
            drawStep3(g, r)
        end
    else
        sea(r, g.t, F4X, F4Y, U4, -2, -2, 8, 7)
        islet(r, g.t, F4X + 9 * U4, F4Y + 6 * U4, U4)
        levelTag(r, f, 'LEVEL 4')
        drawStep4(g, r)
    end
    -- the screen's glass
    r:drawPath(kit.poly({ Vector.xy(SX + SW - 260, SY), Vector.xy(SX + SW - 170, SY), Vector.xy(SX + SW - 330, SY + SH), Vector.xy(SX + SW - 420, SY + SH) }), kit.fill(kit.alpha(kit.SURFACE, 0.04)))
    r:restore()
    if g.step == 4 then
        drawKeypad(g, r)
    end
    people.draw(r, f, imran, g.t)
end

-- input -------------------------------------------------------------------------------------

local function makeCut(g: G, c: string)
    if g.step == 2 and c == S.firstCut then
        g.sfx('oops')
        g.say('l6s2same')
        react(g, 'point', 'Rotate the cut!')
        cue(g, 2.2, 'watch', '')
        return
    end
    S.cut = c
    S.cutAt = g.t
    S.gap.v = 300
    S.ticks, S.said = 0, false
    g.sfx('slice')
    g.shake(4)
    g.done()
    local _, _, tEnd = splitTimes(c)
    react(g, 'cheer', 'Clean cut!')
    cue(g, 1.4, 'watch', '')
    if g.step == 1 then
        S.firstCut = c
        g.say('l6s1done')
        cue(g, tEnd + 0.6, 'point', 'Coins placed!')
    else
        cue(g, tEnd + 0.6, 'cheer', 'Playtest passed.', 'No bugs!')
    end
    cue(g, tEnd + 3.4, 'watch', '')
end

local function check(g: G)
    local typed = S.kp.value
    local v = tonumber(typed) or -1
    if v == 26 then
        S.kp.okT = 3
        S.solvedAt = g.t
        S.ticks = 0
        g.done()
        g.burst(1040, 300, 40)
        g.say('l6s4done')
        g.report('l6s4', true, typed)
        react(g, 'cheer', 'Shipping it', 'tonight!')
        cue(g, 4.5, 'idle', '')
    else
        g.sfx('oops')
        kit.keypadWrong(S.kp, 'Not quite. Have another go.')
        if v == 30 then
            g.say('l6nperim')
            g.report('l6s4', false, typed, 'perim')
        elseif v == 35 then
            g.say('l6n35')
            g.report('l6s4', false, typed)
        else
            g.say('l6nx')
            g.report('l6s4', false, typed)
        end
        react(g, 'puzzled', '')
        cue(g, 2.6, 'watch', '')
    end
end

function L.down(g: G, p: Vector): boolean
    if g.step <= 2 and S.cut == '' then
        if p.x > FX - 60 and p.x < FX + 8 * U + 60 and p.y > FY - 60 and p.y < FY + 6 * U + 60 then
            S.a, S.b = p, p
            return true
        end
    elseif g.step == 3 and not S.snapped then
        local x0, y0 = FX + S.gx, FY + S.gy
        if p.x > x0 - 10 and p.x < x0 + 4 * U + 10 and p.y > y0 - 10 and p.y < y0 + 3 * U + 10 then
            S.dragging = true
            S.grabX, S.grabY = p.x - S.gx, p.y - S.gy
            g.sfx('pickup')
            return true
        end
    elseif g.step == 4 and S.solvedAt < 0 then
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
    if g.step <= 2 and S.a ~= nil and S.cut == '' then
        local before = S.judge
        S.b = p
        S.judge = judge(S.a :: Vector, p)
        if S.judge ~= before and (S.judge == 'v' or S.judge == 'h') then
            g.sfx('pop')
        end
    elseif g.step == 3 and S.dragging then
        local nx: number = p.x - S.grabX
        local ny: number = p.y - S.grabY
        if math.sqrt((nx - 4 * U) ^ 2 + ny ^ 2) < 0.7 * U then
            nx = kit.lerp(nx, 4 * U, 0.6)
            ny = kit.lerp(ny, 0, 0.6)
        end
        S.gx = nx
        S.gy = ny
    end
end

function L.up(g: G, p: Vector)
    if g.step <= 2 and S.a ~= nil and S.cut == '' then
        local j = judge(S.a :: Vector, p)
        S.a, S.b, S.judge = nil, nil, ''
        if j == 'v' or j == 'h' then
            makeCut(g, j)
        elseif j == 'bad' then
            g.sfx('oops')
            g.say('l6bad')
            react(g, 'puzzled', 'Glitchy cut!')
            cue(g, 2.4, 'watch', '')
        end
    elseif g.step == 3 and S.dragging then
        S.dragging = false
        if math.sqrt((S.gx - 4 * U) ^ 2 + S.gy ^ 2) < 1.5 * U then
            S.gx, S.gy = 4 * U, 0
            S.snapped = true
            S.snapAt = g.t
            S.ticks = 0
            g.sfx('snap')
            g.sfx('sparkle')
            g.shake(3)
            g.done()
            g.say('l6s3done')
            react(g, 'watch', '')
            cue(g, TAKE - 0.5, 'point', 'Now delete', 'the gold tiles.')
            cue(g, RULE36 + 0.6, 'cheer', 'Level balanced!')
            cue(g, RULE36 + 3.4, 'watch', '')
        else
            g.sfx('oops')
            S.gx, S.gy = GOLD0.x * U, GOLD0.y * U
            react(g, 'point', 'The empty corner,', 'top right!')
            cue(g, 2.6, 'watch', '')
        end
    end
end

function L.key(g: G, k: number): boolean
    if g.step <= 2 and S.cut == '' and (k == 86 or k == 72) then -- V or H cuts
        makeCut(g, if k == 86 then 'v' else 'h')
        return true
    elseif g.step == 3 and not S.snapped and k == 32 then -- Space drops the block into the corner
        S.dragging = true
        S.gx, S.gy = 4 * U, 0
        L.up(g, Vector.xy(0, 0))
        return true
    elseif g.step == 4 and S.solvedAt < 0 then
        local res = kit.keypadKey(S.kp, k)
        if res == 'ok' then
            check(g)
            return true
        end
        return res ~= ''
    end
    return false
end

-- the lesson card: Imran beside his screen, the island splitting and its coins blinking
function L.thumb(g: G, r: Renderer, x: number, y: number, w: number, h: number)
    r:drawPath(kit.rect(x, y, w, h), kit.fill(Color.rgb(240, 224, 202)))
    r:drawPath(kit.rect(x, y + h - 14, w, 14), kit.fill(Color.rgb(198, 154, 110)))
    local mx, my, mw, mh = x + 78, y + 8, 166, 92
    r:drawPath(kit.rrect(mx - 5, my - 5, mw + 10, mh + 10, 8), kit.fill(Color.rgb(40, 44, 54)))
    r:save()
    r:clipPath(kit.rect(mx, my, mw, mh))
    r:drawPath(kit.rect(mx, my, mw, mh), kit.fill(SEA))
    local u = 10
    local ck = Path.new()
    for j = 0, 9 do
        for i = 0, 17 do
            if (i + j) % 2 == 0 then
                addRect(ck, mx + i * u, my + j * u, u, u)
            end
        end
    end
    r:drawPath(ck, kit.fill(SEA_B))
    local k = 0.5 + 0.5 * math.sin(g.t * 1.6)
    local gap = math.floor(k * 3) * 2
    local ox, oy = mx + 42, my + 16
    island(r, THUMB_L, ox - gap / 2, oy, u, g.t)
    island(r, THUMB_R, ox + 4 * u + gap / 2, oy + 3 * u, u, g.t)
    -- coins, as single bright pixels at this size, dropping in row by row and starting again
    local rows = math.floor((g.t * 3) % 9)
    local pix = Path.new()
    for j = 0, math.min(rows, 6) - 1 do
        for i = 0, 3 do
            addRect(pix, ox - gap / 2 + i * u + 3, oy + j * u + 3, 4, 4)
        end
    end
    r:drawPath(pix, kit.fill(COIN))
    r:restore()
    thumbImran.x, thumbImran.tx, thumbImran.y = x + 40, x + 40, y + h - 6
    thumbImran.mood = if (g.t % 6) < 1.6 then 'wave' else 'watch'
    thumbImran.lookX, thumbImran.lookY = mx + mw / 2, my + mh / 2
    people.advance(thumbImran, 1 / 60, g.t)
    people.draw(r, g.fonts, thumbImran, g.t)
end

return L
