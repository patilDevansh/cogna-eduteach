-- Lesson 4 · Your answer, as a field. It opens on the child's own answer to a diagnostic item (x + n)²,
-- drawn as the pieces of a square field, so the part their answer left out shows as empty land.
--   1. the field of (x + n)² with only the pieces their answer has; tap each empty gap to see its size
--   2. fill the gaps. How much help depends on `help` (the page sets it from the child's evidence):
--        1 watch     the strips slide in by themselves
--        2 together  the child drags them in
--        3 solo      no dragging: the child types what the two strips make together
--   3. a fresh (x + m)² on the keypad: x² + ?x + m². With help 1 or 2 its field stays on screen; solo, it does not.
--
-- The page puts the child's item in the Lab view model before it opens this lesson:
--   mineV        the letter ('x')          mineN  the number (1 … 7)
--   mineSaid     their answer, as shown ('x² + 9')
--   mineMistake  SQUARE_DISTRIBUTES (x² + n²) or MIDDLE_NOT_DOUBLED (x² + nx + n²)
--   help         1, 2 or 3
-- The page only sends an item whose answer it has checked really is that mistake. Without one (the lesson map,
-- a preview) the lesson shows a sample child: (x + 3)² = x² + 9, help 2.

local kit = require('kit')
local lab = require('lab')
local lines = require('lines')
type G = kit.G
type Keypad = kit.Keypad

type Piece = { c: number, r: number, w: number, h: number } -- in units: column, row, width, height
type Strip = { i: number, x: number, y: number, hx: number, hy: number, held: number, placed: boolean, at: number }

type Mine = { v: string, n: number, said: string, mistake: string, help: number }

type St = {
    mine: Mine,
    XL: number, -- how many units long x is drawn (x is not a number: it is just drawn longer than n)
    m: number, -- step 3's number
    had: { boolean }, -- which of the four pieces their answer has
    seen: { boolean }, -- step 1: gaps tapped open
    strips: { Strip },
    drag: number,
    grabX: number,
    grabY: number,
    filledAt: number,
    pop: number,
    kp: Keypad,
    solvedAt: number,
}

local MID = 'MIDDLE_NOT_DOUBLED'

-- layout, set by place() for the wide board or the upright phone frame
local SIDE = 300 -- the field's side in px
local FX, FY = 140, 214 -- the field
local PX, PY, PW = 560, 200, 600 -- the card beside (or under) it
local HX, HY = 520, 214 -- where the strips wait in step 2
local RX, RY = 860, 430 -- the rule card
local KX, KY = 860, 160 -- the keypad
local TX, TY = 420, 300 -- step 3's question, when the field is not shown
local SMALL = 12

local function sample(): Mine
    return { v = 'x', n = 3, said = '', mistake = 'SQUARE_DISTRIBUTES', help = 2 }
end

-- What the page sent, checked. Anything out of range falls back to the sample child.
local function readMine(): Mine
    local m = sample()
    local vm = lab.vm
    if vm == nil then
        return m
    end
    local pv, pn, ps, pm, ph = vm:getString('mineV'), vm:getNumber('mineN'), vm:getString('mineSaid'), vm:getString('mineMistake'), vm:getNumber('help')
    local v = if pv ~= nil then pv.value else ''
    local n = if pn ~= nil then math.floor(pn.value + 0.5) else 0
    local mistake = if pm ~= nil then pm.value else ''
    if string.match(v, '^%a$') ~= nil and n >= 1 and n <= 7 and (mistake == 'SQUARE_DISTRIBUTES' or mistake == MID) then
        m.v, m.n, m.mistake = v, n, mistake
        m.said = if ps ~= nil then ps.value else ''
    end
    if ph ~= nil and ph.value >= 1 then
        m.help = kit.clamp(math.floor(ph.value + 0.5), 1, 3)
    end
    return m
end

local function sq(v: string): string
    return v .. '²'
end

-- what their answer says, when the page did not send it as they wrote it
local function said(m: Mine): string
    if m.said ~= '' then
        return m.said
    end
    if m.mistake == MID then
        return sq(m.v) .. ' + ' .. m.n .. m.v .. ' + ' .. m.n * m.n
    end
    return sq(m.v) .. ' + ' .. m.n * m.n
end

local function bracketOf(v: string, n: number): string
    return '(' .. v .. ' + ' .. n .. ')²'
end

-- the four pieces of (x + n)²: the big square, the tall strip, the wide strip, the corner
local function pieces(XL: number, n: number): { Piece }
    return {
        { c = 0, r = 0, w = XL, h = XL },
        { c = XL, r = 0, w = n, h = XL },
        { c = 0, r = XL, w = XL, h = n },
        { c = XL, r = XL, w = n, h = n },
    }
end

local function writeLines(m: Mine, k: number)
    local v, n = m.v, m.n
    local nx, nn = n .. v, tostring(n * n)
    local mid = m.mistake == MID
    lines.l4s1 = 'You wrote ' .. bracketOf(v, n) .. ' = ' .. said(m) .. '. Here is ' .. bracketOf(v, n) .. ' as a square field, '
        .. v .. ' + ' .. n .. ' along every side. Your ' .. sq(v) .. (if mid then ', your ' .. nx else '') .. ' and your ' .. nn
        .. ' are all here, but some of the field is empty. ' .. (if m.help == 1 then 'Watch the empty part.' else 'Tap the empty part.')
    lines.l4s1done = if mid
        then 'That gap is ' .. v .. ' long and ' .. n .. ' wide, so it is ' .. nx .. '. Your answer has one ' .. nx .. ', but the field has two.'
        else 'Two gaps, each ' .. v .. ' long and ' .. n .. ' wide. Each one is ' .. nx .. ', and your answer left both of them out.'
    lines.l4s2 = if m.help == 1 then (if mid then 'Watch the missing strip slide in.' else 'Watch the two strips slide into the gaps.')
        elseif m.help == 2 then (if mid then 'Drag the missing strip into its gap.' else 'Drag the two strips into the gaps.')
        else 'Each strip is ' .. v .. ' long and ' .. n .. ' wide. How much do the two strips make together?'
    lines.l4s2one = 'One strip in. Now the other one.'
    lines.l4s2done = 'The field is full: ' .. sq(v) .. ' + ' .. nx .. ' + ' .. nx .. ' + ' .. nn .. '. So ' .. bracketOf(v, n) .. ' = '
        .. sq(v) .. ' + ' .. 2 * n .. v .. ' + ' .. nn .. '. The middle is always two strips.'
    lines.l4s2n = "That's one strip. There are two strips, and each one is " .. nx .. '.'
    lines.l4s2nx = 'Each strip is ' .. v .. ' long and ' .. n .. ' wide, so ' .. nx .. '. Add the two strips.'
    lines.l4s3 = 'Your turn. ' .. bracketOf(v, k) .. ' = ' .. sq(v) .. ' + ?' .. v .. ' + ' .. k * k .. '. What goes in the middle?'
    lines.l4n1 = "That's only one strip, " .. k .. v .. '. There are two strips.'
    lines.l4n0 = "The middle can't be empty. The two strips are part of the field."
    lines.l4nx = 'Two strips, each ' .. v .. ' long and ' .. k .. ' wide. Add them.'
    lines.l4s3done = 2 * k .. v .. '! ' .. bracketOf(v, k) .. ' = ' .. sq(v) .. ' + ' .. 2 * k .. v .. ' + ' .. k * k .. '. Two strips, every time.'
end

local function place(S: St)
    if lab.portrait then
        local st, pn = lab.stage, lab.panel
        SIDE = 296
        FX, FY = st.x + (st.w - SIDE) / 2 + 14, st.y + 52
        PX, PY, PW = pn.x, pn.y, pn.w
        local U = SIDE / (S.XL + S.mine.n)
        HX, HY = (lab.PW - (S.mine.n + S.XL) * U - 40) / 2, pn.y + 146
        RX, RY = lab.PW / 2, pn.y + 150
        KX, KY = (lab.PW - 286) / 2, 388
        TX, TY = lab.PW / 2, 200
        SMALL = 14
    else
        SIDE = 300
        FX, FY = 140, 214
        PX, PY, PW = 540, 200, 620
        HX, HY = 520, 214
        RX, RY = 930, 440
        KX, KY = 860, 160
        TX, TY = 420, 300
        SMALL = 12
    end
end

local function unit(S: St): number
    return SIDE / (S.XL + S.mine.n)
end

local function newStrips(S: St): { Strip }
    local U = unit(S)
    local out: { Strip } = {}
    local x = HX
    for _, i in { 2, 3 } do
        if not S.had[i] then
            local p = pieces(S.XL, S.mine.n)[i]
            local y = if lab.portrait then HY else HY + (if i == 3 then S.XL * U + 40 else 0)
            local sx = if lab.portrait then x else HX
            table.insert(out, { i = i, x = sx, y = y, hx = sx, hy = y, held = 0, placed = false, at = -1 })
            x += p.w * U + 40
        end
    end
    return out
end

local S: St = {
    mine = sample(), XL = 6, m = 4, had = { true, false, false, true }, seen = { true, false, false, true },
    strips = {}, drag = 0, grabX = 0, grabY = 0, filledAt = -1, pop = 0, kp = kit.keypad(KX, KY), solvedAt = -1,
}

local L = {}

L.id = 'AE_IDENTITY_SQ_PLUS'
lab.upright[L.id] = true
L.tag = 'YOUR ANSWER, AS A FIELD'
L.title = 'Your answer, as a field'
L.blurb = 'Your own answer, drawn as land.'
L.steps = {
    { title = 'Your answer, as a field', line = 'l4s1', task = 'Tap the empty part of the field' },
    { title = 'Fill the gaps', line = 'l4s2', task = 'Drag the strips into the gaps' },
    { title = 'Your turn', line = 'l4s3', task = 'Type the middle term on the keypad' },
}

function L.enter(g: G, step: number)
    local m = readMine()
    S.mine = m
    S.XL = math.max(m.n + 3, 6)
    S.m = if m.n < 7 then m.n + 1 else m.n - 1
    S.had = { true, m.mistake == MID, false, true }
    S.seen = { true, S.had[2], false, true }
    place(S)
    S.strips = newStrips(S)
    S.drag, S.filledAt, S.pop, S.solvedAt = 0, -1, 0, -1
    S.kp = kit.keypad(KX, KY)
    writeLines(m, S.m)
    L.steps[1].task = if m.help == 1 then 'Watch the empty part of the field' else 'Tap the empty part of the field'
    L.steps[2].task = if m.help == 1 then 'Watch the strips fill the gaps'
        elseif m.help == 2 then 'Drag the strips into the gaps'
        else 'Type what the two strips make together'
    if step == 1 then
        g.hint('')
    end
end

-- step 2 counts what is in the field now
local function filled(): number
    local n = 0
    for _, st in S.strips do
        if st.placed then
            n += 1
        end
    end
    return n
end

local function stripTarget(i: number): (number, number)
    local p = pieces(S.XL, S.mine.n)[i]
    local U = unit(S)
    return FX + p.c * U, FY + p.r * U
end

local function placeStrip(g: G, st: Strip)
    st.x, st.y = stripTarget(st.i)
    st.placed = true
    st.at = g.t
    S.pop = 1
    g.sfx('snap')
    g.sfx('sparkle')
    g.shake(3)
    g.hint('')
    if filled() == #S.strips then
        S.filledAt = g.t
        g.done()
        g.burst(FX + SIDE / 2, FY + SIDE / 2, 40)
        g.say('l4s2done')
    else
        g.say('l4s2one')
    end
end

local function reveal(g: G, i: number)
    if S.seen[i] then
        return
    end
    S.seen[i] = true
    S.pop = 1
    g.sfx('pop')
    local all = true
    for k = 1, 4 do
        all = all and S.seen[k]
    end
    if all and not g.isDone() then
        g.done()
        g.say('l4s1done')
    end
end

function L.advance(g: G, dt: number)
    S.pop = math.max(0, S.pop - dt * 3)
    kit.keypadAdvance(S.kp, dt)
    local help = S.mine.help
    if g.step == 1 and help == 1 then -- watch: the gaps open by themselves, one after another
        local k = 0
        for i = 2, 3 do
            if not S.had[i] then
                k += 1
                if g.age > 3 + 1.4 * k then
                    reveal(g, i)
                end
            end
        end
    elseif g.step == 2 then
        for k, st in S.strips do
            if not st.placed then
                if help == 1 and g.age > 2.5 + 1.8 * (k - 1) then -- watch: it glides in by itself
                    local tx, ty = stripTarget(st.i)
                    st.x = kit.follow(st.x, tx, 5, dt)
                    st.y = kit.follow(st.y, ty, 5, dt)
                    if math.abs(st.x - tx) + math.abs(st.y - ty) < 2 then
                        placeStrip(g, st)
                    end
                elseif S.drag ~= k then
                    st.x = kit.follow(st.x, st.hx, 14, dt)
                    st.y = kit.follow(st.y, st.hy, 14, dt)
                end
            end
            st.held = kit.follow(st.held, if S.drag == k then 1 else 0, 18, dt)
        end
    end
end

-- drawing ----------------------------------------------------------------------------------

local function box(x: number, y: number, w: number, h: number): { Vector }
    return { Vector.xy(x, y), Vector.xy(x + w, y), Vector.xy(x + w, y + h), Vector.xy(x, y + h) }
end

local function dashedBox(r: Renderer, b: { Vector }, c: Color, w: number)
    for i = 1, 4 do
        local p, q = b[i], b[(i % 4) + 1]
        r:drawPath(kit.dashed(p.x, p.y, q.x, q.y, 10, 8), kit.stroke(c, w))
    end
end

local function pieceName(i: number, v: string, n: number): string
    if i == 1 then
        return sq(v)
    elseif i == 4 then
        return tostring(n * n)
    end
    return n .. v
end

-- A piece of land. x parts get no grid (x is not a count of squares); the n × n corner shows its n² squares.
local function patch(r: Renderer, x: number, y: number, w: number, h: number, i: number, U: number, held: number)
    local ls = kit.style(if i == 4 then U else 1000, Vector.xy(x, y))
    ls.copy = i == 2 or i == 3
    ls.lift = held
    kit.land(r, box(x, y, w, h), ls)
end

-- the field of (v + n)²: `have` says which pieces are down; gaps are gold and dashed, with '?' until `seen`
local function field(g: G, r: Renderer, ox: number, oy: number, side: number, v: string, n: number, XL: number, have: { boolean }, seen: { boolean }, label: (i: number) -> string)
    local f = g.fonts
    local U = side / (XL + n)
    local P = pieces(XL, n)
    r:drawPath(kit.rect(ox, oy, side, side), kit.fill(kit.alpha(kit.PAGE, 0.9)))
    dashedBox(r, box(ox, oy, side, side), kit.INK_SOFT, 2.5)
    kit.bracket(r, f, Vector.xy(ox, oy - 26), Vector.xy(ox + XL * U, oy - 26), 0, -1, v, 1, kit.INK)
    kit.bracket(r, f, Vector.xy(ox + XL * U, oy - 26), Vector.xy(ox + side, oy - 26), 0, -1, tostring(n), 1, kit.INK)
    kit.bracket(r, f, Vector.xy(ox - 26, oy), Vector.xy(ox - 26, oy + XL * U), -1, 0, v, 1, kit.INK)
    kit.bracket(r, f, Vector.xy(ox - 26, oy + XL * U), Vector.xy(ox - 26, oy + side), -1, 0, tostring(n), 1, kit.INK)
    for i, p in P do
        local x, y, w, h = ox + p.c * U, oy + p.r * U, p.w * U, p.h * U
        if have[i] then
            patch(r, x, y, w, h, i, U, 0)
            kit.halo(r, f, label(i), f.display, if i == 1 then 26 else 20, kit.INK, x + w / 2, y + h / 2, 0.5)
        else
            local pulse = 0.5 + 0.5 * math.sin(g.t * 3 + i)
            r:drawPath(kit.poly(box(x, y, w, h)), kit.fill(kit.alpha(kit.GOLD_WASH, 0.55 + 0.25 * pulse)))
            dashedBox(r, box(x, y, w, h), kit.alpha(kit.GOLD, 0.6 + 0.4 * pulse), 3)
            if seen[i] then
                kit.label(r, f, n .. v, f.display, 22, kit.GOLD_DEEP, x + w / 2, y + h / 2 - 10, 0.5)
                kit.label(r, f, v .. ' by ' .. n, f.body, 14, kit.GOLD_DEEP, x + w / 2, y + h / 2 + 14, 0.5)
            else
                kit.label(r, f, '?', f.display, 30, kit.alpha(kit.GOLD_DEEP, 0.6), x + w / 2, y + h / 2, 0.5)
            end
        end
    end
end

-- a card: a small capital heading over one big line, and a note under it
local function card(r: Renderer, g: G, head: string, big: string, note: string, noteColor: Color, x: number, y: number, w: number, live: boolean)
    local f = g.fonts
    r:drawPath(kit.rrect(x + 3, y + 8, w, 128, 22), kit.soft(kit.alpha(kit.INK, 0.12), 14))
    r:drawPath(kit.rrect(x, y, w, 128, 22), kit.fill(if live then kit.SURFACE else kit.PAGE))
    r:drawPath(kit.rrect(x, y, w, 128, 22), kit.stroke(kit.LINE, 2))
    kit.label(r, f, head, f.mono, SMALL, kit.INK_SOFT, x + 24, y + 26, 0)
    local size = math.min(34, 34 * (w - 48) / math.max(1, kit.width(f, big, f.display, 34)))
    local sc = 1 + 0.06 * math.sin(kit.clamp(S.pop, 0, 1) * math.pi)
    r:save()
    r:transform(Mat2D.withTranslation(x + 24, y + 68) * Mat2D.withScale(sc, sc) * Mat2D.withTranslation(-(x + 24), -(y + 68)))
    kit.label(r, f, big, f.display, size, kit.INK, x + 24, y + 68, 0)
    r:restore()
    kit.label(r, f, note, f.body, 17, noteColor, x + 24, y + 106, 0)
end

local function drawStep1(g: G, r: Renderer)
    local m = S.mine
    local v, n = m.v, m.n
    field(g, r, FX, FY, SIDE, v, n, S.XL, S.had, S.seen, function(i: number): string
        return pieceName(i, v, n)
    end)
    local open = 0
    for i = 1, 4 do
        if not S.seen[i] then
            open += 1
        end
    end
    local mid = m.mistake == MID
    local note = if open > 0 then 'Your pieces: ' .. sq(v) .. (if mid then ', ' .. n .. v else '') .. ' and ' .. n * n
        elseif mid then 'Missing: one more ' .. n .. v
        else 'Missing: two strips of ' .. n .. v
    card(r, g, 'YOU WROTE', bracketOf(v, n) .. ' = ' .. said(m), note, if open > 0 then kit.INK_SOFT else kit.RED, PX, PY, PW, true)
    -- point at the first gap still shut
    if m.help > 1 and open > 0 and g.age > 4.5 then
        for i = 2, 3 do
            if not S.seen[i] then
                local p = pieces(S.XL, n)[i]
                local U = unit(S)
                local k = ((g.age - 4.5) % 1.6) / 1.6
                kit.finger(r, FX + (p.c + p.w / 2) * U, FY + (p.r + p.h / 2) * U + 20, if k < 0.8 then 1 else (1 - k) / 0.2, k > 0.3 and k < 0.6)
                break
            end
        end
    end
end

local function tally(): string
    local m = S.mine
    local strips = (if S.had[2] then 1 else 0) + filled()
    local mid = if strips == 0 then '' elseif strips == 1 then ' + ' .. m.n .. m.v else ' + ' .. m.n .. m.v .. ' + ' .. m.n .. m.v
    return sq(m.v) .. mid .. ' + ' .. m.n * m.n
end

local function drawStep2(g: G, r: Renderer)
    local m = S.mine
    local v, n = m.v, m.n
    local U = unit(S)
    local have = { true, S.had[2], S.had[3], true }
    field(g, r, FX, FY, SIDE, v, n, S.XL, have, { true, true, true, true }, function(i: number): string
        return pieceName(i, v, n)
    end)
    local done = S.filledAt >= 0
    if m.help ~= 3 then -- solo, the keypad stands where the card and the strips would be
        card(r, g, 'IN THE FIELD SO FAR', tally(), if done then 'the whole of ' .. bracketOf(v, n) else 'is that all of ' .. bracketOf(v, n) .. '?', kit.INK_SOFT,
            if lab.portrait then PX else PX + 220, PY, if lab.portrait then PW else PW - 220, not done)
    end
    -- the strips: placed ones lie in the field, the held one is on top
    for pass = 1, 2 do
        for k, st in S.strips do
            if (pass == 1) == (S.drag ~= k) then
                local p = pieces(S.XL, n)[st.i]
                local waiting = not st.placed and m.help ~= 3
                local shown = st.placed or waiting
                if shown then
                    local bob = if waiting and S.drag ~= k then math.sin(g.t * 4 + k) * 3 else 0
                    local ls = kit.style(1000, Vector.xy(st.x, st.y - bob))
                    ls.copy = true
                    ls.lift = st.held
                    ls.edge = if st.placed or m.help == 1 then 0 else 1
                    kit.land(r, box(st.x, st.y - bob, p.w * U, p.h * U), ls)
                    kit.halo(r, g.fonts, n .. v, g.fonts.display, 20, kit.INK, st.x + p.w * U / 2, st.y - bob + p.h * U / 2 - 13 * st.held, 0.5)
                end
            end
        end
    end
    if m.help == 3 and not done then
        kit.keypadDraw(r, g.fonts, S.kp, 'the two strips together = ?', v, g.t)
    end
    if m.help == 2 and S.drag == 0 and filled() == 0 and g.age > 4.5 and #S.strips > 0 then
        local st = S.strips[1]
        local tx, ty = stripTarget(st.i)
        local p = pieces(S.XL, n)[st.i]
        local k = ((g.age - 4.5) % 2.8) / 2.8
        local al = if k < 0.1 then k / 0.1 elseif k > 0.8 then (1 - k) / 0.2 else 1
        local e = kit.smooth((k - 0.1) / 0.7)
        kit.finger(r, kit.lerp(st.hx, tx, e) + p.w * U / 2, kit.lerp(st.hy, ty, e) + p.h * U / 2 + 30, al, true)
    end
    if done then
        kit.rule(r, g.fonts, bracketOf(v, n) .. ' = ' .. sq(v) .. ' + ' .. 2 * n .. v .. ' + ' .. n * n,
            'two strips of ' .. n .. v .. ' make the middle, ' .. 2 * n .. v, kit.clamp((g.t - S.filledAt - 0.6) * 1.5, 0, 1), RX, RY)
    end
end

local function drawStep3(g: G, r: Renderer)
    local m = S.mine
    local v, k = m.v, S.m
    local q = bracketOf(v, k) .. ' = ' .. sq(v) .. ' + ?' .. v .. ' + ' .. k * k
    local solved = S.solvedAt >= 0
    if m.help < 3 or solved then
        -- the field of the new square: help 1 names each strip, help 2 gives only its sides
        local side = if lab.portrait then SIDE else 280
        local XL = math.max(k + 3, 6)
        field(g, r, FX, FY, side, v, k, XL, { true, true, true, true }, { true, true, true, true }, function(i: number): string
            if i == 2 or i == 3 then
                return if m.help == 1 or solved then k .. v else v .. ' by ' .. k
            end
            return pieceName(i, v, k)
        end)
    else
        kit.label(r, g.fonts, q, g.fonts.display, if lab.portrait then 30 else 40, kit.INK, TX, TY, 0.5)
        kit.label(r, g.fonts, 'no field this time: you have got it', g.fonts.body, 17, kit.INK_SOFT, TX, TY + 44, 0.5)
    end
    local age = if solved then g.t - S.solvedAt else 0
    local rk = kit.clamp((age - 1.2) * 1.5, 0, 1)
    r:save()
    r:modulateOpacity(if solved then 1 - rk else 1)
    kit.keypadDraw(r, g.fonts, S.kp, q, v, g.t)
    r:restore()
    kit.rule(r, g.fonts, bracketOf(v, k) .. ' = ' .. sq(v) .. ' + ' .. 2 * k .. v .. ' + ' .. k * k, '(a + b)² = a² + 2ab + b²', rk, RX, RY - 140)
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

-- input -------------------------------------------------------------------------------------

local function checkStrips(g: G)
    local typed = S.kp.value
    local v = tonumber(typed) or -1
    local n = S.mine.n
    if v == 2 * n then
        S.kp.okT = 3
        lab.answer(typed, true, '')
        for _, st in S.strips do
            if not st.placed then
                placeStrip(g, st)
            end
        end
    else
        lab.answer(typed, false, if v == n then MID else '')
        g.sfx('oops')
        kit.keypadWrong(S.kp, 'Not quite. Have another go.')
        g.say(if v == n then 'l4s2n' else 'l4s2nx')
    end
end

local function checkTurn(g: G)
    local typed = S.kp.value
    local v = tonumber(typed) or -1
    local k = S.m
    if v == 2 * k then
        S.kp.okT = 3
        lab.answer(typed, true, '')
        S.solvedAt = g.t
        g.done()
        g.burst(KX + 140, KY + 128, 40)
        g.say('l4s3done')
    else
        -- the syllabus mistake this answer shows, if it is a known one
        lab.answer(typed, false, if v == k then MID elseif v == 0 then 'SQUARE_DISTRIBUTES' else '')
        g.sfx('oops')
        kit.keypadWrong(S.kp, 'Not quite. Have another go.')
        g.say(if v == k then 'l4n1' elseif v == 0 then 'l4n0' else 'l4nx')
    end
end

local function keypadTap(g: G, p: Vector, check: (g: G) -> ()): boolean
    local res = kit.keypadDown(S.kp, p)
    if res == 'ok' then
        check(g)
    elseif res == 'key' then
        g.sfx('tick3')
    end
    return res ~= ''
end

function L.down(g: G, p: Vector): boolean
    local U = unit(S)
    local help = S.mine.help
    if g.step == 1 and help > 1 then
        for i = 2, 3 do
            local q = pieces(S.XL, S.mine.n)[i]
            if not S.seen[i] and kit.inRect(p, FX + q.c * U, FY + q.r * U, q.w * U, q.h * U) then
                reveal(g, i)
                return true
            end
        end
    elseif g.step == 2 and help == 2 then
        for k, st in S.strips do
            local q = pieces(S.XL, S.mine.n)[st.i]
            if not st.placed and kit.inRect(p, st.x - 10, st.y - 10, q.w * U + 20, q.h * U + 20) then
                S.drag = k
                S.grabX, S.grabY = p.x - st.x, p.y - st.y
                g.sfx('pickup')
                return true
            end
        end
    elseif g.step == 2 and help == 3 and S.filledAt < 0 then
        return keypadTap(g, p, checkStrips)
    elseif g.step == 3 and S.solvedAt < 0 then
        return keypadTap(g, p, checkTurn)
    end
    return false
end

function L.move(g: G, p: Vector)
    if g.step == 2 and S.drag > 0 then
        local st = S.strips[S.drag]
        local tx, ty = stripTarget(st.i)
        local nx: number = p.x - S.grabX
        local ny: number = p.y - S.grabY
        if math.sqrt((nx - tx) ^ 2 + (ny - ty) ^ 2) < 0.7 * unit(S) then
            nx = kit.lerp(nx, tx, 0.6)
            ny = kit.lerp(ny, ty, 0.6)
        end
        st.x, st.y = nx, ny
    end
end

function L.up(g: G, p: Vector)
    if g.step == 2 and S.drag > 0 then
        local st = S.strips[S.drag]
        S.drag = 0
        local tx, ty = stripTarget(st.i)
        if math.sqrt((st.x - tx) ^ 2 + (st.y - ty) ^ 2) < 1.5 * unit(S) then
            placeStrip(g, st)
        else
            -- the other gap? a tall strip does not lie down in the wide gap
            local other = if st.i == 2 then 3 else 2
            local ox, oy = stripTarget(other)
            if not S.had[other] and math.sqrt((st.x - ox) ^ 2 + (st.y - oy) ^ 2) < 1.5 * unit(S) then
                g.sfx('oops')
                g.hint(if st.i == 2 then 'The tall strip fits the tall gap, top right' else 'The wide strip fits the wide gap, bottom left')
            else
                g.sfx('drop')
            end
        end
    end
end

function L.key(g: G, k: number): boolean
    if k == 32 and g.step == 1 then -- space opens the next gap
        for i = 2, 3 do
            if not S.seen[i] then
                reveal(g, i)
                return true
            end
        end
    elseif k == 32 and g.step == 2 and S.mine.help ~= 3 then -- …or places the next strip
        for _, st in S.strips do
            if not st.placed then
                placeStrip(g, st)
                return true
            end
        end
    elseif (g.step == 2 and S.mine.help == 3 and S.filledAt < 0) or (g.step == 3 and S.solvedAt < 0) then
        local res = kit.keypadKey(S.kp, k)
        if res == 'ok' then
            if g.step == 2 then
                checkStrips(g)
            else
                checkTurn(g)
            end
            return true
        end
        return res ~= ''
    end
    return false
end

function L.thumb(g: G, r: Renderer, x: number, y: number, w: number, h: number)
    local u = math.min(13, (h - 16) / 9)
    local ox, oy = x + (w - 9 * u) / 2, y + (h - 9 * u) / 2
    r:drawPath(kit.rect(ox, oy, 6 * u, 6 * u), kit.fill(kit.GRASS))
    r:drawPath(kit.rect(ox + 6 * u + 2, oy + 6 * u + 2, 3 * u, 3 * u), kit.fill(kit.GRASS))
    local k = 0.5 + 0.5 * math.sin(g.t * 2)
    r:drawPath(kit.rect(ox + 6 * u + 2, oy, 3 * u, 6 * u), kit.fill(kit.alpha(kit.GOLD, 0.25 + 0.4 * k)))
    r:drawPath(kit.rect(ox, oy + 6 * u + 2, 6 * u, 3 * u), kit.fill(kit.alpha(kit.GOLD, 0.25 + 0.4 * k)))
end

return L
