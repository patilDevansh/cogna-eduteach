-- Lesson 7 · The kitchen floor (real rooms and units) · Ranchi, Jharkhand
--   A new community kitchen is going up: fresh plaster, a window onto sal trees, stacks of floor tiles, a bag of
--   cement, a spirit level. Phulmani Oraon runs her own crew of women masons; her son Birsa, 13, helps at weekends
--   with her measuring tape. The tiles are measured in centimetres, the room in metres.
--   1. one square metre of floor and a zoom slider: zoom into its corner until decimetres, then centimetres
--      appear, the tape counting 0 … 100 cm. 100 × 100 = 10,000 square centimetres
--   2. drag a corner to scale a square patch of 50 cm tiles: twice as wide holds 4, three times holds 9 (k × k)
--   3. keypad: one square metre in square centimetres -> 10,000 (100 is one side, 200 the sides added: 'units')

local kit = require('kit')
local people = require('people')
type G = kit.G
type Keypad = kit.Keypad
type Person = people.Person
type Cue = { at: number, who: string, mood: string, l1: string, l2: string }

type St = {
    s: number, -- slider 0..1 (zoom = 100^s)
    sShown: number,
    dragging: boolean,
    held: number,
    maxZ: number,
    zoomDone: boolean,
    tipped: boolean, -- Phulmani's tape tip has been given
    -- step 2
    k: number,
    kShown: number,
    seen: { [number]: number },
    bornAt: { [number]: number },
    said2: boolean,
    -- step 3
    kp: Keypad,
    solvedAt: number,
    greeted: boolean, -- Birsa says Johar once
}

local L = {}

local OUT = Color.rgb(74, 44, 18) -- the outline brown the people are drawn with
local FLOOR_Y = 570

local VX, VY, VW, VH = 330, 168, 520, 384 -- step 1: the close-up of the floor
local S0 = 300 -- a metre on screen at zoom 1
local SLX0, SLX1, SLY = 406, 774, 598
local PX, PY, PW, PH = 300, 168, 420, 384 -- steps 2 and 3: the floor seen from above
local U2, F2X, F2Y = 64, 410, 206 -- one 50 cm tile is U2 px; the patch grows from (F2X, F2Y)
local TX, TY = 744, 186 -- the table of widths and tiles
local SQX, SQY, SQS = 384, 226, 258 -- step 3: one square metre (its tape's case still on the panel)
local KPX, KPY = 914, 176

-- the site's colours
local PLASTER = Color.rgb(236, 229, 216)
local PLASTER_DAMP = Color.rgb(220, 210, 194)
local SCREED = Color.rgb(184, 178, 168)
local SCREED_DK = Color.rgb(146, 140, 130)
local SCREED_TOP = Color.rgb(198, 194, 186) -- the floor seen from above
local METRE = Color.rgb(232, 228, 218) -- the square metre, trowelled smooth
local CHALK = Color.rgb(66, 118, 206) -- a mason's blue chalk line
local DM_LINE = Color.rgb(186, 104, 64)
local CM_LINE = Color.rgb(168, 146, 118)
local TAPE = Color.rgb(252, 250, 240)
local TAPE_RED = Color.rgb(200, 52, 40)
local TERRACOTTA = Color.rgb(206, 118, 80)
local WOOD = Color.rgb(156, 106, 64)

local S: St = {
    s = 0, sShown = 0, dragging = false, held = 0, maxZ = 1, zoomDone = false, tipped = false,
    k = 1, kShown = 1, seen = {}, bornAt = {}, said2 = false,
    kp = kit.keypad(KPX, KPY), solvedAt = -1, greeted = false,
}

-- Phulmani and Birsa stand by the window, the floor to their right (they point and lean that way)
local phulmani: Person = people.new(people.CAST.phulmani, 118)
phulmani.y = 626
local birsa: Person = people.new(people.CAST.birsa, 234)
birsa.y = 626
for _, p in { phulmani, birsa } do
    p.lookX, p.lookY = 600, 360
    p.mood = 'watch'
end
local thumbP: Person = people.new(people.CAST.phulmani, 0)
thumbP.s = 0.46
local thumbB: Person = people.new(people.CAST.birsa, 0)
thumbB.s = 0.4

local cues: { Cue } = {}

-- after `after` seconds, 'p' (Phulmani) or 'b' (Birsa) changes mood and says l1 / l2 ('' hushes, '=' keeps the bubble)
local function cue(g: G, after: number, who: string, mood: string, l1: string, l2: string?)
    table.insert(cues, { at = g.t + after, who = who, mood = mood, l1 = l1, l2 = l2 or '' })
end

local function forget(who: string)
    local keep: { Cue } = {}
    for _, c in cues do
        if c.who ~= who then
            table.insert(keep, c)
        end
    end
    cues = keep
end

local function runCues(g: G)
    local keep: { Cue } = {}
    for _, c in cues do
        if g.t >= c.at then
            local p = if c.who == 'b' then birsa else phulmani
            p.mood = c.mood
            if c.l1 == '' then
                people.hush(p)
            elseif c.l1 ~= '=' then
                -- one bubble at a time: the other one goes quiet
                people.hush(if c.who == 'b' then phulmani else birsa)
                people.speak(p, c.l1, if c.l2 ~= '' then c.l2 else nil)
            end
        else
            table.insert(keep, c)
        end
    end
    cues = keep
end

local function zoom(): number
    return 100 ^ S.sShown
end

L.id = 'units'
L.tag = 'REAL ROOMS AND UNITS'
L.title = 'The kitchen floor'
L.blurb = 'Zoom in: 1 m² = 10,000 cm².'
L.steps = {
    { title = 'Zoom into one square metre', line = 'l7s1', task = 'Drag the slider to zoom right in' },
    { title = 'Tiles on a bigger patch', line = 'l7s2', task = 'Stretch the patch until 9 tiles fit' },
    { title = "Phulmani's question", line = 'l7s3', task = 'How many square centimetres in a square metre?' },
}

-- What the voice says in this lesson (merged into lines.luau by main).
L.lines = {
    l7s1 = "Phulmani Oraon's crew of women masons is building a community kitchen in Ranchi. Her son Birsa holds the tape. Zoom into one square metre of floor.",
    l7s1done = "Most people guess a square metre holds a hundred square centimetres. That's only the top row!",
    l7s2 = "Each of Phulmani's tiles is 50 centimetres wide. Stretch the patch with the gold corner until nine tiles fit inside.",
    l7s2two = 'This patch is one whole square metre. The crew measures every room in square metres, then orders four tiles for each one.',
    l7s2done = 'Three times as wide is also three times as deep, so the area grows both ways at once.',
    l7s3 = 'Phulmani asks every new mason this. How many square centimetres fit in one square metre?',
    l7n100 = 'A hundred centimetres runs along just one edge. The square has a hundred rows like that.',
    l7n200 = 'Adding two edges measures the way round, not the floor inside. For area, the edges multiply.',
    l7nx = 'Picture the tape along the top edge, then count how many rows fill the square.',
    l7s3done = 'Exactly right. You can switch between square metres and square centimetres like a real mason now.',
}

function L.enter(g: G, step: number)
    S.s, S.sShown, S.dragging, S.held, S.maxZ, S.zoomDone, S.tipped = 0, 0, false, 0, 1, false, false
    S.k, S.kShown, S.seen, S.bornAt, S.said2 = 1, 1, { [1] = g.t }, {}, false
    S.kp = kit.keypad(KPX, KPY)
    S.solvedAt = -1
    cues = {}
    people.hush(phulmani)
    people.hush(birsa)
    phulmani.mood, birsa.mood = 'watch', 'watch'
    if step == 1 then
        if not S.greeted then
            S.greeted = true
            birsa.mood = 'wave'
            people.speak(birsa, 'Johar!')
            cue(g, 2.0, 'b', 'watch', '')
            cue(g, 2.2, 'p', 'point', 'Rooms in metres,', 'tiles in centimetres.')
        else
            cue(g, 0.4, 'p', 'point', 'Rooms in metres,', 'tiles in centimetres.')
        end
        cue(g, 7.5, 'p', 'watch', '')
    elseif step == 2 then
        cue(g, 0.4, 'p', 'point', 'Start from', 'a corner.')
        cue(g, 6, 'p', 'watch', '')
    else
        cue(g, 0.4, 'p', 'think', 'Your turn,', 'crew member!')
        cue(g, 5.5, 'p', 'watch', '')
    end
end

function L.advance(g: G, dt: number)
    S.held = kit.follow(S.held, if S.dragging then 1 else 0, 18, dt)
    S.sShown = kit.follow(S.sShown, S.s, 9, dt)
    S.kShown = kit.follow(S.kShown, S.k, 14, dt)
    if g.step == 1 then
        local z = zoom()
        if z > S.maxZ then
            -- a tick each time the zoom passes another step
            if math.floor(math.log(z) * 4) > math.floor(math.log(S.maxZ) * 4) then
                g.tick(math.floor(math.log(z) * 2))
            end
            S.maxZ = z
        end
        if not S.tipped and not S.zoomDone and z > 2.5 then
            S.tipped = true
            forget('p')
            cue(g, 0, 'p', 'point', 'Always start', 'the tape at zero.')
            cue(g, 4, 'p', 'watch', '')
        end
        if not S.zoomDone and z > 55 then
            S.zoomDone = true
            g.done()
            g.sfx('sparkle')
            g.say('l7s1done')
            cues = {}
            cue(g, 0, 'p', 'cheer', "That's why I", 'check units twice.')
            cue(g, 0, 'b', 'cheer', '=')
            cue(g, 3.4, 'b', 'watch', '=')
            cue(g, 4.2, 'p', 'watch', '')
        end
    end
    kit.keypadAdvance(S.kp, dt)
    runCues(g)
    people.advance(phulmani, dt, g.t)
    people.advance(birsa, dt, g.t)
end

-- the room --------------------------------------------------------------------------------------------

local function outlined(r: Renderer, path: Path, c: Color, w: number)
    r:drawPath(path, kit.fill(c))
    r:drawPath(path, kit.stroke(OUT, w))
end

-- the window in the new wall, onto sal trees
local function window(r: Renderer, t: number, wx: number, wy: number, ww: number, wh: number)
    r:drawPath(kit.rrect(wx + 4, wy + 8, ww, wh, 6), kit.soft(kit.alpha(kit.INK, 0.16), 10))
    outlined(r, kit.rrect(wx, wy, ww, wh, 6), WOOD, 3)
    local gx, gy, gw, gh = wx + 12, wy + 12, ww - 24, wh - 24
    r:save()
    r:clipPath(kit.rect(gx, gy, gw, gh))
    local sky = Gradient.linear(Vector.xy(0, gy), Vector.xy(0, gy + gh), {
        { position = 0, color = Color.rgb(184, 222, 240) },
        { position = 1, color = Color.rgb(234, 244, 232) },
    })
    r:drawPath(kit.rect(gx, gy, gw, gh), Paint.with({ gradient = sky }))
    -- the forest beyond
    for k = 0, 6 do
        r:drawPath(kit.circle(gx + k * 30 + 6, gy + gh - 22 + (k % 2) * 6, 22), kit.fill(Color.rgb(170, 206, 146)))
    end
    -- sal trees: tall straight trunks, high crowns of broad leaves
    local function sal(x: number, top: number, s: number, ph: number)
        local sw = math.sin(t * 1.1 + ph) * 2
        outlined(r, kit.rect(x - 4 * s, top + 26 * s, 8 * s, gy + gh - top), Color.rgb(118, 90, 68), 2)
        local c1, c2 = Color.rgb(84, 148, 72), Color.rgb(116, 176, 86)
        outlined(r, kit.ellipse(x - 14 * s + sw, top + 22 * s, 18 * s, 15 * s), c1, 2)
        outlined(r, kit.ellipse(x + 14 * s + sw, top + 20 * s, 18 * s, 15 * s), c1, 2)
        outlined(r, kit.ellipse(x + sw, top + 8 * s, 20 * s, 17 * s), c2, 2)
        r:drawPath(kit.ellipse(x - 6 * s + sw, top + 2 * s, 7 * s, 4 * s), kit.fill(kit.alpha(kit.SURFACE, 0.22)))
    end
    sal(gx + 30, gy + 10, 1, 0)
    sal(gx + 98, gy + 22, 0.85, 1.7)
    sal(gx + 150, gy + 4, 1.05, 3.1)
    r:restore()
    -- the grill and the sill
    for k = 1, 3 do
        local bx = gx + gw * k / 4
        r:drawPath(kit.line(bx, gy, bx, gy + gh), kit.stroke(Color.rgb(70, 76, 84), 3))
    end
    outlined(r, kit.rrect(wx - 8, wy + wh - 4, ww + 16, 11, 4), PLASTER, 2.5)
end

-- terracotta floor tiles, stacked: each one seen edge-on
local function tileStack(r: Renderer, x: number, base: number, n: number)
    for k = 0, n - 1 do
        local y = base - (k + 1) * 8
        outlined(r, kit.rrect(x, y, 64, 8, 2), TERRACOTTA, 1.8)
        r:drawPath(kit.line(x + 4, y + 2.5, x + 60, y + 2.5), kit.stroke(kit.alpha(kit.SURFACE, 0.35), 1.5))
    end
end

local function room(g: G, r: Renderer)
    local t = g.t
    local bx, by, bw, bh = kit.BX, kit.BY, kit.BW, kit.BH
    -- fresh plaster, still drying in patches, the trowel's sweeps showing
    r:drawPath(kit.rect(bx, by, bw, FLOOR_Y - by), kit.fill(PLASTER))
    r:drawPath(kit.ellipse(560, 230, 160, 70), kit.soft(kit.alpha(PLASTER_DAMP, 0.7), 40))
    r:drawPath(kit.ellipse(1010, 520, 180, 60), kit.soft(kit.alpha(PLASTER_DAMP, 0.6), 40))
    r:drawPath(kit.ellipse(140, 470, 120, 80), kit.soft(kit.alpha(PLASTER_DAMP, 0.5), 40))
    -- the trowel's sweeps: short fans of arcs, faint
    local function sweeps(cx: number, cy: number, rad: number, a0: number, a1: number)
        for k = 0, 2 do
            r:drawPath(kit.arc(cx, cy, rad + k * 7, a0, a1), kit.stroke(kit.alpha(kit.SURFACE, 0.32 - k * 0.07), 3))
            r:drawPath(kit.arc(cx + 1, cy + 2, rad + k * 7, a0, a1), kit.stroke(kit.alpha(PLASTER_DAMP, 0.55 - k * 0.12), 1.2))
        end
    end
    sweeps(1000, 640, 92, 3.95, 4.6)
    sweeps(1236, 300, 60, 2.3, 3.0)
    -- the floor: fresh screed
    r:drawPath(kit.rect(bx, FLOOR_Y, bw, by + bh - FLOOR_Y), kit.fill(SCREED))
    r:drawPath(kit.line(bx, FLOOR_Y, bx + bw, FLOOR_Y), kit.stroke(SCREED_DK, 3))
    window(r, t, 66, 172, 204, 150)
    -- the site, on the floor to the right: a bag of cement, stacks of tiles, a spirit level
    r:drawPath(kit.ellipse(1136, 630, 110, 8), kit.fill(kit.alpha(kit.INK, 0.12)))
    tileStack(r, 1028, 628, 4)
    tileStack(r, 1170, 628, 7)
    local bag = kit.rrect(1094, 584, 74, 44, 14)
    outlined(r, bag, Color.rgb(226, 224, 216), 2.5)
    r:save()
    r:clipPath(bag)
    r:drawPath(kit.rect(1094, 598, 74, 13), kit.fill(Color.rgb(78, 116, 172)))
    r:restore()
    kit.label(r, g.fonts, '50 kg', g.fonts.mono, 10, kit.SURFACE, 1131, 605, 0.5)
    r:drawPath(kit.line(1100, 590, 1110, 586), kit.stroke(kit.alpha(OUT, 0.5), 1.5))
    outlined(r, kit.rrect(1030, 616, 154, 13, 4), Color.rgb(200, 206, 212), 2.2)
    r:drawPath(kit.rect(1030, 616, 10, 13), kit.fill(Color.rgb(60, 64, 72)))
    r:drawPath(kit.rect(1174, 616, 10, 13), kit.fill(Color.rgb(60, 64, 72)))
    outlined(r, kit.rrect(1098, 618, 24, 9, 4), Color.rgb(176, 228, 112), 1.5)
    r:drawPath(kit.circle(1110 + math.sin(t * 0.8) * 1.5, 622.5, 2.6), kit.fill(kit.alpha(kit.SURFACE, 0.95)))
end

-- a close-up of the floor, seen from above
local function floorPanel(r: Renderer, x: number, y: number, w: number, h: number)
    r:drawPath(kit.rrect(x + 3, y + 10, w, h, 20), kit.soft(kit.alpha(kit.INK, 0.18), 18))
    r:drawPath(kit.rrect(x - 6, y - 6, w + 12, h + 12, 24), kit.fill(kit.SURFACE))
    r:drawPath(kit.rrect(x - 6, y - 6, w + 12, h + 12, 24), kit.stroke(kit.LINE, 1.5))
    r:drawPath(kit.rrect(x, y, w, h, 18), kit.fill(SCREED_TOP))
end

-- the tape along the top edge of a square at (ox, oy), side px: hooked at 0, its case beyond 100.
-- Only the part between x0 and x1 is drawn.
local function tape(g: G, r: Renderer, ox: number, oy: number, side: number, x0: number, x1: number)
    local f = g.fonts
    local cm, dm = side / 100, side / 10
    local y0, y1 = oy - 40, oy - 6
    local xa, xb = math.max(ox - 4, x0 - 4), math.min(ox + side + 10, x1 + 4)
    if xb > xa then
        r:drawPath(kit.rect(xa, y0, xb - xa, y1 - y0), kit.fill(TAPE))
        r:drawPath(kit.line(xa, y0, xb, y0), kit.stroke(kit.alpha(OUT, 0.6), 1.5))
        r:drawPath(kit.line(xa, y1, xb, y1), kit.stroke(kit.alpha(OUT, 0.6), 1.5))
    end
    local ticks = Path.new()
    local i0 = math.max(0, math.floor((x0 - ox) / cm) - 1)
    local i1 = math.min(100, math.ceil((x1 - ox) / cm) + 1)
    for i = i0, i1 do
        local x = ox + i * cm
        local major = i % 10 == 0
        local h = if major then 14 elseif i % 5 == 0 then 9 else 5
        if major or cm > 4 then
            ticks:moveTo(Vector.xy(x, y1))
            ticks:lineTo(Vector.xy(x, y1 - h))
        end
    end
    r:drawPath(ticks, kit.stroke(kit.INK, 1.5))
    for i = 0, 10 do
        local x = ox + i * dm
        if x >= x0 + 8 and x <= x1 - 8 and (dm > 34 or i == 0 or i == 10) then
            -- 0 sits just after the hook, 100 just before the case
            local ax, an = if i == 0 then x + 4 elseif i == 10 then x - 4 else x, if i == 0 then 0 elseif i == 10 then 1 else 0.5
            kit.label(r, f, tostring(i * 10), f.mono, 12, TAPE_RED, ax, y0 + 11, an)
        end
    end
    if cm > 26 then
        for i = 1, 9 do
            local x = ox + i * cm
            if x >= x0 + 8 and x <= x1 - 8 then
                kit.label(r, f, tostring(i), f.mono, 11, kit.INK_SOFT, x, y0 + 11, 0.5)
            end
        end
    end
    -- the hook at zero, and the case past the end
    if ox >= x0 - 8 then
        outlined(r, kit.rect(ox - 7, y0 - 3, 6, y1 - y0 + 12), Color.rgb(170, 176, 184), 1.8)
    end
    local cx = ox + side + 12
    if cx < x1 then
        outlined(r, kit.rrect(cx, y0 - 10, 48, 48, 12), Color.rgb(204, 66, 46), 2.5)
        r:drawPath(kit.circle(cx + 24, y0 + 14, 9), kit.fill(Color.rgb(150, 40, 30)))
        r:drawPath(kit.circle(cx + 24, y0 + 14, 9), kit.stroke(OUT, 1.8))
    end
end

-- step 1 ---------------------------------------------------------------------------------------

local function drawZoom(g: G, r: Renderer)
    local f = g.fonts
    local z = zoom()
    -- the square's corner moves to the window's top-left as we zoom in
    local t = kit.smooth(math.log(z) / math.log(5))
    local ox = kit.lerp(VX + (VW - S0) / 2, VX + 64, t)
    local oy = kit.lerp(VY + (VH - S0) / 2 + 12, VY + 64, t)
    local side = S0 * z
    local cm, dm = side / 100, side / 10
    floorPanel(r, VX, VY, VW, VH)
    r:save()
    r:clipPath(kit.rrect(VX, VY, VW, VH, 18))
    -- the square metre, chalked out on the new floor
    r:drawPath(kit.rect(ox, oy, side, side), kit.fill(METRE))
    -- decimetres, then centimetres, appear as they grow big enough to see
    local function gridLevel(n: number, col: Color, w: number, a: number)
        if a <= 0 then
            return
        end
        local cell = side / n
        local p = Path.new()
        local i0 = math.max(0, math.floor((VX - ox) / cell))
        local i1 = math.min(n, math.ceil((VX + VW - ox) / cell))
        local j0 = math.max(0, math.floor((VY - oy) / cell))
        local j1 = math.min(n, math.ceil((VY + VH - oy) / cell))
        local yTop, yBot = math.max(oy, VY), math.min(oy + side, VY + VH)
        local xL, xR = math.max(ox, VX), math.min(ox + side, VX + VW)
        for i = i0, i1 do
            p:moveTo(Vector.xy(ox + i * cell, yTop))
            p:lineTo(Vector.xy(ox + i * cell, yBot))
        end
        for j = j0, j1 do
            p:moveTo(Vector.xy(xL, oy + j * cell))
            p:lineTo(Vector.xy(xR, oy + j * cell))
        end
        r:drawPath(p, kit.stroke(kit.alpha(col, a), w))
    end
    gridLevel(100, CM_LINE, 1, kit.clamp((cm - 6) / 14, 0, 1))
    gridLevel(10, DM_LINE, 2.5, kit.clamp((dm - 40) / 40, 0, 1))
    -- the first ten-centimetre square, named while it fits the window
    local da = kit.clamp((dm - 50) / 40, 0, 1) * kit.clamp((560 - dm) / 160, 0, 1)
    if da > 0 then
        r:drawPath(kit.rect(ox, oy, dm, dm), kit.fill(kit.alpha(DM_LINE, 0.14 * da)))
        if dm > 130 then
            r:save()
            r:modulateOpacity(da * kit.clamp((dm - 130) / 40, 0, 1))
            kit.halo(r, f, '10 cm by 10 cm', f.body, 15, kit.INK, ox + dm / 2, oy + dm * 0.62, 0.5)
            r:restore()
        end
    end
    -- one square centimetre, once it can be seen
    if cm > 14 then
        local k = kit.clamp((cm - 14) / 20, 0, 1)
        r:drawPath(kit.rect(ox, oy, cm, cm), kit.fill(kit.alpha(kit.ACCENT, 0.55 * k)))
        r:save()
        r:modulateOpacity(k)
        kit.halo(r, f, '1 cm²', f.body, 16, kit.ACCENT_DEEP, ox + cm + 12, oy + math.min(cm / 2, 150), 0)
        r:restore()
    end
    r:drawPath(kit.rect(ox, oy, side, side), kit.stroke(CHALK, 4))
    tape(g, r, ox, oy, side, VX, VX + VW)
    r:restore()
    -- how far in we are
    r:drawPath(kit.rrect(VX + 16, VY + VH - 50, 128, 34, 17), kit.fill(kit.alpha(kit.SURFACE, 0.94)))
    kit.label(r, f, '× ' .. kit.num(math.floor(z + 0.5)) .. ' zoom', f.mono, 13, kit.INK, VX + 80, VY + VH - 33, 0.5)
    -- the slider
    r:drawPath(kit.rrect(VX + 2, SLY - 20, VW, 44, 22), kit.soft(kit.alpha(kit.INK, 0.12), 8))
    r:drawPath(kit.rrect(VX, SLY - 22, VW, 44, 22), kit.fill(kit.SURFACE))
    r:drawPath(kit.rrect(VX, SLY - 22, VW, 44, 22), kit.stroke(kit.LINE, 1.5))
    r:drawPath(kit.rrect(SLX0, SLY - 5, SLX1 - SLX0, 10, 5), kit.fill(kit.LINE))
    r:drawPath(kit.rrect(SLX0, SLY - 5, (SLX1 - SLX0) * S.sShown, 10, 5), kit.fill(kit.GOLD))
    kit.label(r, f, '1 m', f.body, 14, kit.INK_SOFT, SLX0 - 28, SLY, 1)
    kit.label(r, f, '1 cm', f.body, 14, kit.INK_SOFT, SLX1 + 28, SLY, 0)
    kit.knob(r, g.t, SLX0 + (SLX1 - SLX0) * S.sShown, SLY, 'slide', S.held, not S.dragging and S.s < 0.05)
    -- what we have found so far, on the wall to the right
    local x = 884
    local function fact(at: number, big: string, small: string, y: number)
        local k = kit.clamp((math.log(z) - math.log(at)) * 2, 0, 1)
        if k <= 0 then
            return
        end
        r:save()
        r:modulateOpacity(k)
        r:transform(Mat2D.withTranslation(0, (1 - k) * 12))
        kit.label(r, f, big, f.display, 30, kit.INK, x, y, 0)
        kit.label(r, f, small, f.body, 16, kit.INK_SOFT, x, y + 32, 0)
        r:restore()
    end
    fact(0.5, '1 m²', 'one metre each way', 204)
    fact(4, '1 m = 100 cm', 'along the tape: 100 centimetres', 294)
    fact(14, '100 rows of 100', 'down the side: 100 rows', 384)
    fact(40, '100 × 100 = 10,000', 'so 1 m² = 10,000 cm²', 474)
end

-- step 2 ---------------------------------------------------------------------------------------

-- a 50 cm floor tile seen from above
local function floorTile(r: Renderer, x: number, y: number, u: number)
    r:drawPath(kit.rrect(x + 5, y + 7, u - 8, u - 8, 5), kit.fill(kit.alpha(kit.INK, 0.16)))
    r:drawPath(kit.rrect(x + 4, y + 4, u - 8, u - 8, 5), kit.fill(TERRACOTTA))
    r:drawPath(kit.rrect(x + 9, y + 8, u - 18, (u - 8) * 0.26, 3), kit.fill(kit.alpha(kit.SURFACE, 0.26)))
    r:drawPath(kit.rrect(x + 4, y + 4, u - 8, u - 8, 5), kit.stroke(OUT, 2))
end

local function sideLabel(n: number): string
    local s = (n * 50) .. ' cm'
    if n == 2 then
        return s .. ' = 1 m'
    elseif n == 4 then
        return s .. ' = 2 m'
    end
    return s
end

local function drawScale(g: G, r: Renderer)
    local f = g.fonts
    local k = S.kShown
    local side = k * U2
    floorPanel(r, PX, PY, PW, PH)
    -- copies of the first tile fill the bigger patch
    local n = S.k
    for j = 0, 3 do
        for i = 0, 3 do
            if i < n and j < n then
                local born = S.bornAt[j * 10 + i] or (g.t - 5)
                local e = kit.back((g.t - born) * 4)
                local x, y = F2X + i * U2, F2Y + j * U2
                local cx, cy = x + U2 / 2, y + U2 / 2
                r:save()
                r:transform(Mat2D.withTranslation(cx, cy) * Mat2D.withScale(e, e) * Mat2D.withTranslation(-cx, -cy))
                floorTile(r, x, y, U2)
                r:restore()
            end
        end
    end
    r:drawPath(kit.rect(F2X, F2Y, side, side), kit.stroke(kit.INK, 3))
    local shown = math.floor(k + 0.5)
    kit.halo(r, f, sideLabel(shown), f.body, 18, kit.INK, F2X + side / 2, F2Y - 22, 0.5)
    kit.halo(r, f, (shown * 50) .. ' cm', f.body, 18, kit.INK, F2X - 16, F2Y + side / 2, 1)
    kit.knob(r, g.t, F2X + side, F2Y + side, 'slide', S.held, not S.dragging and S.k == 1)
    -- the table of what has been tried
    r:drawPath(kit.rrect(TX + 3, TY + 8, 300, 280, 20), kit.soft(kit.alpha(kit.INK, 0.14), 14))
    r:drawPath(kit.rrect(TX, TY, 300, 280, 20), kit.fill(kit.SURFACE))
    r:drawPath(kit.rrect(TX, TY, 300, 280, 20), kit.stroke(kit.LINE, 1.5))
    kit.label(r, f, 'WIDTH', f.mono, 12, kit.INK_SOFT, TX + 30, TY + 30, 0)
    kit.label(r, f, 'TILES', f.mono, 12, kit.INK_SOFT, TX + 170, TY + 30, 0)
    for i = 1, 4 do
        local y = TY + 30 + i * 54
        local seen = S.seen[i]
        if S.k == i then
            r:drawPath(kit.rrect(TX + 10, y - 22, 280, 44, 14), kit.fill(kit.ACCENT_WASH))
        end
        kit.label(r, f, '× ' .. i, f.display, 24, if seen ~= nil then kit.INK else kit.INK_FAINT, TX + 30, y, 0)
        kit.label(r, f, if seen ~= nil then tostring(i * i) else '?', f.display, 24, if seen ~= nil then kit.ACCENT_DEEP else kit.INK_FAINT, TX + 170, y, 0)
    end
    local s3 = S.seen[3]
    kit.rule(r, f, 'width × 3  →  area × 9', 'three rows of three tiles', if s3 ~= nil then kit.clamp((g.t - s3) * 1.5, 0, 1) else 0, 920, 486)
end

-- step 3 ---------------------------------------------------------------------------------------

local function drawStep3(g: G, r: Renderer)
    local f = g.fonts
    floorPanel(r, PX, PY, PW, PH)
    r:drawPath(kit.rect(SQX + 4, SQY + 8, SQS, SQS), kit.soft(kit.alpha(kit.INK, 0.14), 10))
    r:drawPath(kit.rect(SQX, SQY, SQS, SQS), kit.fill(METRE))
    local k = if S.solvedAt >= 0 then kit.clamp((g.t - S.solvedAt) / 1.5, 0, 1) else 0
    if k > 0 then
        -- every square centimetre, drawn in
        local p = Path.new()
        for i = 1, 99 do
            p:moveTo(Vector.xy(SQX + i * SQS / 100, SQY))
            p:lineTo(Vector.xy(SQX + i * SQS / 100, SQY + SQS * k))
            p:moveTo(Vector.xy(SQX, SQY + i * SQS / 100))
            p:lineTo(Vector.xy(SQX + SQS * k, SQY + i * SQS / 100))
        end
        r:drawPath(p, kit.stroke(kit.alpha(CM_LINE, 0.75), 0.8))
    end
    r:drawPath(kit.rect(SQX, SQY, SQS, SQS), kit.stroke(CHALK, 4))
    tape(g, r, SQX, SQY, SQS, PX, PX + PW)
    kit.bracket(r, f, Vector.xy(SQX - 24, SQY), Vector.xy(SQX - 24, SQY + SQS), -1, 0, '1 m', 1, kit.INK)
    kit.label(r, f, '1 m²', f.display, 30, kit.alpha(kit.INK_SOFT, 1 - k), SQX + SQS / 2, SQY + SQS / 2, 0.5)
    if k > 0 then
        kit.rule(r, f, '1 m² = 10,000 cm²', '100 rows of 100 square centimetres', k, SQX + SQS / 2, 498)
    end
    if S.kp.msg ~= '' then
        local kw = 16 * 2 + 3 * 78 + 2 * 10
        r:drawPath(kit.rrect(KPX + kw / 2 - 118, KPY + 368, 236, 28, 14), kit.fill(kit.alpha(kit.SURFACE, 0.96)))
    end
    kit.keypadDraw(r, f, S.kp, 'Square centimetres in 1 m²', 'cm²', g.t)
end

function L.draw(g: G, r: Renderer)
    room(g, r)
    if g.step == 1 then
        drawZoom(g, r)
    elseif g.step == 2 then
        drawScale(g, r)
    else
        drawStep3(g, r)
    end
    people.draw(r, g.fonts, phulmani, g.t)
    people.draw(r, g.fonts, birsa, g.t)
end

-- input --------------------------------------------------------------------------------------------

local function setK(g: G, k: number)
    local n = kit.clamp(k, 1, 4)
    if n == S.k then
        return
    end
    for j = 0, n - 1 do
        for i = 0, n - 1 do
            if i >= S.k or j >= S.k then
                S.bornAt[j * 10 + i] = g.t + (i + j) * 0.03
            end
        end
    end
    S.k = n
    g.tick(n * n - 1)
    if S.seen[n] == nil then
        S.seen[n] = g.t
    end
end

local function releaseK(g: G)
    if S.k == 2 and not S.said2 then
        S.said2 = true
        g.say('l7s2two')
        cues = {}
        cue(g, 0, 'p', 'point', 'Always order', 'a few spares!')
        cue(g, 4.5, 'p', 'watch', '')
    elseif S.k == 3 and not g.isDone() then
        g.done()
        g.burst(F2X + 1.5 * U2, F2Y + 1.5 * U2, 40)
        g.say('l7s2done')
        cues = {}
        cue(g, 0, 'p', 'cheer', 'Measure both', 'sides, always.')
        cue(g, 0, 'b', 'cheer', '=')
        cue(g, 3, 'b', 'watch', '=')
        cue(g, 4, 'p', 'watch', '')
    end
end

local function check(g: G)
    local typed = S.kp.value
    local v = tonumber(typed) or -1
    cues = {}
    if v == 10000 then
        S.kp.okT = 3
        S.solvedAt = g.t
        g.done()
        g.burst(1050, 300, 60)
        g.say('l7s3done')
        g.report('l7s3', true, typed)
        cue(g, 0, 'p', 'cheer', 'Welcome to', 'the crew!')
        cue(g, 0, 'b', 'cheer', '=')
        cue(g, 4, 'b', 'watch', '=')
        cue(g, 5, 'p', 'watch', '')
    else
        g.sfx('oops')
        kit.keypadWrong(S.kp, 'Not quite. Have another go.')
        if v == 100 then
            g.say('l7n100')
            g.report('l7s3', false, typed, 'units')
            cue(g, 0, 'p', 'think', 'Count the rows', 'going down too.')
        elseif v == 200 then
            g.say('l7n200')
            g.report('l7s3', false, typed, 'units')
            cue(g, 0, 'p', 'think', 'Edges add,', 'floors multiply.')
        else
            g.say('l7nx')
            g.report('l7s3', false, typed)
            cue(g, 0, 'p', 'think', 'Tape first,', 'then the rows.')
        end
        cue(g, 4.5, 'p', 'watch', '')
    end
end

function L.down(g: G, p: Vector): boolean
    if g.step == 1 then
        if p.y > SLY - 30 and p.y < SLY + 30 and p.x > SLX0 - 30 and p.x < SLX1 + 30 then
            S.dragging = true
            S.s = kit.clamp((p.x - SLX0) / (SLX1 - SLX0), 0, 1)
            g.sfx('pickup')
            return true
        end
    elseif g.step == 2 then
        local c = Vector.xy(F2X + S.kShown * U2, F2Y + S.kShown * U2)
        if kit.dist(p, c) < 44 then
            S.dragging = true
            g.sfx('pickup')
            return true
        end
    elseif g.step == 3 and S.solvedAt < 0 then
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
    if g.step == 1 and S.dragging then
        S.s = kit.clamp((p.x - SLX0) / (SLX1 - SLX0), 0, 1)
    elseif g.step == 2 and S.dragging then
        local d = ((p.x - F2X) + (p.y - F2Y)) / 2 / U2
        setK(g, math.floor(d + 0.5))
    end
end

function L.up(g: G, p: Vector)
    if S.dragging then
        S.dragging = false
        g.sfx('drop')
        if g.step == 2 then
            releaseK(g)
        end
    end
end

function L.key(g: G, k: number): boolean
    if g.step == 1 and (k == 262 or k == 263) then -- → / ← zoom
        S.s = kit.clamp(S.s + (if k == 262 then 0.1 else -0.1), 0, 1)
        return true
    elseif g.step == 2 and (k == 262 or k == 263) then -- → / ← grow and shrink the patch
        setK(g, S.k + (if k == 262 then 1 else -1))
        releaseK(g)
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

-- the lesson card: the kitchen going up, a tiled patch with its tape, Phulmani and Birsa
function L.thumb(g: G, r: Renderer, x: number, y: number, w: number, h: number)
    local fy = y + h - 22
    r:drawPath(kit.rect(x, y, w, h), kit.fill(PLASTER))
    r:drawPath(kit.rect(x, fy, w, h), kit.fill(SCREED))
    r:drawPath(kit.line(x, fy, x + w, fy), kit.stroke(SCREED_DK, 2))
    -- the window and its sal trees
    local wx, wy = x + 8, y + 10
    r:drawPath(kit.rrect(wx, wy, 70, 48, 4), kit.fill(WOOD))
    r:drawPath(kit.rect(wx + 5, wy + 5, 60, 38), kit.fill(Color.rgb(196, 228, 240)))
    for k = 0, 2 do
        local tx = wx + 16 + k * 19
        r:drawPath(kit.rect(tx - 1.5, wy + 18, 3, 25), kit.fill(Color.rgb(118, 90, 68)))
        r:drawPath(kit.ellipse(tx, wy + 16, 9, 8), kit.fill(Color.rgb(96, 158, 78)))
    end
    -- a square metre of tiles, its grid counting in
    local sx, sy, ss = x + 128, y + 14, 70
    r:drawPath(kit.rect(sx + 2, sy + 4, ss, ss), kit.fill(kit.alpha(kit.INK, 0.12)))
    r:drawPath(kit.rect(sx, sy, ss, ss), kit.fill(METRE))
    local n = 2 + math.floor((g.t * 1.2) % 5) * 2
    local p = Path.new()
    for i = 1, n - 1 do
        p:moveTo(Vector.xy(sx + i * ss / n, sy))
        p:lineTo(Vector.xy(sx + i * ss / n, sy + ss))
        p:moveTo(Vector.xy(sx, sy + i * ss / n))
        p:lineTo(Vector.xy(sx + ss, sy + i * ss / n))
    end
    r:drawPath(p, kit.stroke(kit.alpha(DM_LINE, 0.8), 1))
    r:drawPath(kit.rect(sx, sy, ss, ss), kit.stroke(CHALK, 2.5))
    r:drawPath(kit.rect(sx, sy - 9, ss, 7), kit.fill(TAPE))
    r:drawPath(kit.rect(sx, sy - 9, ss, 7), kit.stroke(kit.alpha(OUT, 0.5), 1))
    for k = 0, 2 do
        r:drawPath(kit.rrect(x + 214, fy - 6 - k * 5, 30, 5, 1), kit.fill(TERRACOTTA))
    end
    thumbP.x, thumbP.tx, thumbP.y = x + 96, x + 96, y + h - 8
    thumbB.x, thumbB.tx, thumbB.y = x + 40, x + 40, y + h - 6
    thumbB.mood = if (g.t % 6) < 1.6 then 'wave' else 'watch'
    thumbP.mood = 'watch'
    thumbP.lookX, thumbP.lookY = sx + ss / 2, sy + ss / 2
    thumbB.lookX, thumbB.lookY = sx + ss / 2, sy + ss / 2
    people.advance(thumbP, 1 / 60, g.t)
    people.advance(thumbB, 1 / 60, g.t)
    people.draw(r, g.fonts, thumbB, g.t)
    people.draw(r, g.fonts, thumbP, g.t)
end

return L
