-- Lesson 1 · Area is counting squares
--   1. drag across an empty floor to lay tiles: they drop in, bounce and tick; 24 covers it
--   2. tap each row to count it: 6, 12, 18, 24, and 4 rows of 6 becomes 6 × 4
--   3. drag a gold corner to build rectangles; find two different ones with an area of 12

local kit = require('kit')
type G = kit.G

type Tile = { at: number, glow: number } -- at: the time it was laid

type St = {
    tiles: { [number]: Tile }, -- by cell index (row * COLS + col)
    count: number,
    painting: boolean,
    last: Vector?,
    doneAt: number,
    rows: { [number]: number }, -- step 2: row -> time it was tapped
    rowCount: number,
    countShown: number,
    hop: { [number]: number },
    -- step 3
    w: number,
    h: number,
    dragging: boolean,
    held: number,
    found: { [string]: boolean },
    foundList: { string },
    flash: number,
    sign: number,
    bornAt: { [number]: number },
}

local COLS, ROWS, U = 6, 4, 60
local FX, FY = 230, 214 -- floor top-left
local GX, GY, GU, GCOLS, GROWS = 150, 196, 46, 10, 6 -- step 3 grid

local S: St = {
    tiles = {}, count = 0, painting = false, last = nil, doneAt = -1,
    rows = {}, rowCount = 0, countShown = 0, hop = {},
    w = 2, h = 2, dragging = false, held = 0, found = {}, foundList = {}, flash = 0, sign = 0, bornAt = {},
}

local L = {}

local function cellAt(p: Vector): number?
    local c = math.floor((p.x - FX) / U)
    local r = math.floor((p.y - FY) / U)
    if c < 0 or c >= COLS or r < 0 or r >= ROWS then
        return nil
    end
    return r * COLS + c
end

local function lay(g: G, i: number)
    if S.tiles[i] ~= nil then
        return
    end
    S.tiles[i] = { at = g.t, glow = 0 }
    S.count += 1
    S.sign = 1
    g.tick(S.count - 1)
    if S.count == 12 then
        g.sayNext('keepgoing')
    end
    if S.count == COLS * ROWS then
        S.doneAt = g.t
        S.painting = false
        g.done()
        g.burst(FX + COLS * U / 2, FY + ROWS * U / 2, 50)
        g.say('l1s1done')
    end
end

local function paintTo(g: G, p: Vector)
    local a = S.last or p
    local n = math.max(1, math.ceil(kit.dist(a, p) / (U / 4)))
    for k = 0, n do
        local q = Vector.xy(a.x + (p.x - a.x) * k / n, a.y + (p.y - a.y) * k / n)
        local i = cellAt(q)
        if i ~= nil then
            lay(g, i)
        end
    end
    S.last = p
end

local function fillAll(g: G)
    for i = 0, COLS * ROWS - 1 do
        S.tiles[i] = { at = g.t - 2, glow = 0 }
    end
    S.count = COLS * ROWS
end

-- step 3 ------------------------------------------------------------------------------

local function handlePos(): Vector
    return Vector.xy(GX + S.w * GU, GY + S.h * GU)
end

local function setSize(g: G, w: number, h: number)
    local nw, nh = kit.clamp(w, 1, GCOLS), kit.clamp(h, 1, GROWS)
    if nw == S.w and nh == S.h then
        return
    end
    -- new cells are born now (they pop in)
    for r = 0, nh - 1 do
        for c = 0, nw - 1 do
            if c >= S.w or r >= S.h then
                S.bornAt[r * 100 + c] = g.t
            end
        end
    end
    S.w, S.h = nw, nh
    S.sign = 1
    g.tick(nw * nh - 1)
end

local function judge(g: G)
    if S.w * S.h ~= 12 then
        return
    end
    local a, b = math.min(S.w, S.h), math.max(S.w, S.h)
    local id = a .. '×' .. b
    if S.found[id] then
        if not g.isDone() then
            g.sfx('oops')
            g.say('l1s3same')
        end
        return
    end
    S.found[id] = true
    table.insert(S.foundList, S.w .. ' × ' .. S.h)
    S.flash = 1
    g.sfx('sparkle')
    g.burst(GX + S.w * GU / 2, GY + S.h * GU / 2, 30)
    if #S.foundList >= 2 then
        g.done()
        g.say('l1s3done')
    else
        g.say('l1s3one')
    end
end

-- protocol ---------------------------------------------------------------------------------

L.id = 'squares'
L.tag = 'COUNTING SQUARES'
L.title = 'Area is counting squares'
L.blurb = 'Tile a floor, count the rows.'
L.steps = {
    { title = 'Cover the floor with tiles', line = 'l1s1', task = 'Drag across the floor to lay all the tiles' },
    { title = 'Count it row by row', line = 'l1s2', task = 'Tap each row to count it' },
    { title = 'Make an area of 12', line = 'l1s3', task = 'Make two different rectangles with area 12' },
}

function L.enter(g: G, step: number)
    S.tiles, S.count, S.painting, S.last, S.doneAt = {}, 0, false, nil, -1
    S.rows, S.rowCount, S.countShown, S.hop = {}, 0, 0, {}
    S.w, S.h, S.dragging, S.held, S.found, S.foundList, S.flash, S.sign, S.bornAt = 2, 2, false, 0, {}, {}, 0, 0, {}
    if step == 2 then
        fillAll(g)
    end
end

function L.advance(g: G, dt: number)
    S.sign = math.max(0, S.sign - dt * 3)
    S.flash = math.max(0, S.flash - dt * 1.2)
    S.held = kit.follow(S.held, if S.dragging then 1 else 0, 18, dt)
    -- step 2: the count climbs one square at a time behind the taps
    if g.step == 2 and S.countShown < S.rowCount * COLS then
        local before = math.floor(S.countShown)
        S.countShown = math.min(S.rowCount * COLS, S.countShown + dt * 22)
        if math.floor(S.countShown) > before then
            g.tick(math.floor(S.countShown) - 1)
            S.sign = 1
        end
    end
end

local function drawRoom(g: G, r: Renderer)
    local x, y, w, h = FX, FY, COLS * U, ROWS * U
    -- floor
    r:drawPath(kit.rect(x, y, w, h), kit.fill(Color.rgb(226, 222, 212)))
    -- faint marks where tiles go
    local dots = Path.new()
    for c = 0, COLS do
        for rr = 0, ROWS do
            dots:moveTo(Vector.xy(x + c * U - 4, y + rr * U))
            dots:lineTo(Vector.xy(x + c * U + 4, y + rr * U))
            dots:moveTo(Vector.xy(x + c * U, y + rr * U - 4))
            dots:lineTo(Vector.xy(x + c * U, y + rr * U + 4))
        end
    end
    r:drawPath(dots, kit.stroke(kit.alpha(kit.INK, 0.18), 1.5))
    -- walls with a door gap at the bottom right
    local t = 16
    local wall = kit.fill(Color.rgb(96, 110, 102))
    r:drawPath(kit.rect(x - t, y - t, w + 2 * t, t), wall)
    r:drawPath(kit.rect(x - t, y, t, h + t), wall)
    r:drawPath(kit.rect(x + w, y, t, h + t), wall)
    r:drawPath(kit.rect(x - t, y + h, w - 70 + t, t), wall)
    r:drawPath(kit.rect(x + w - 10, y + h, 10 + t, t), wall)
    -- the door, swung open
    r:drawPath(kit.arc(x + w - 10, y + h, 60, math.pi, math.pi * 1.5), kit.stroke(kit.alpha(kit.INK, 0.25), 1.5))
    r:drawPath(kit.line(x + w - 10, y + h, x + w - 10, y + h - 60), kit.stroke(Color.rgb(150, 110, 60), 5))
end

local function drawTiles(g: G, r: Renderer, highlightRow: number)
    for i = 0, COLS * ROWS - 1 do
        local tl = S.tiles[i]
        if tl ~= nil then
            local c, row = i % COLS, math.floor(i / COLS)
            local drop = kit.clamp((g.t - tl.at) / 0.5, 0, 1)
            local glow = 0
            if S.doneAt >= 0 then
                local wave = g.t - S.doneAt - (c + row) * 0.05
                glow = if wave > 0 and wave < 0.6 then math.sin(wave / 0.6 * math.pi) else 0
            end
            local rt = S.rows[row]
            local hopY = 0
            if rt ~= nil then
                local k = g.t - rt - c * 0.07
                if k > 0 and k < 0.35 then
                    hopY = -math.sin(k / 0.35 * math.pi) * 14
                end
                glow = math.max(glow, 0.85)
            elseif highlightRow == row then
                glow = 0.35
            end
            r:save()
            r:transform(Mat2D.withTranslation(0, hopY))
            kit.tile(r, FX + c * U, FY + row * U, U, drop, glow)
            r:restore()
        end
    end
end

local function hoverRow(p: Vector): number
    if p.x < FX - 20 or p.x > FX + COLS * U + 90 then
        return -1
    end
    local row = math.floor((p.y - FY) / U)
    if row < 0 or row >= ROWS then
        return -1
    end
    return row
end

local lastHover = Vector.xy(-100, -100)

local function drawStep12(g: G, r: Renderer)
    local f = g.fonts
    drawRoom(g, r)
    local hr = if g.step == 2 and S.rows[hoverRow(lastHover)] == nil then hoverRow(lastHover) else -1
    drawTiles(g, r, hr)
    if g.step == 1 then
        kit.sign(r, f, 'TILES LAID', tostring(S.count), S.sign, 900, 200)
        -- ghost finger shows the sweep until the first tile
        if S.count == 0 and g.age > 2.5 then
            local k = ((g.age - 2.5) % 2.4) / 2.4
            local a = if k < 0.1 then k / 0.1 elseif k > 0.8 then (1 - k) / 0.2 else 1
            local x = FX + 20 + kit.smooth((k - 0.1) / 0.7) * (COLS * U - 40)
            kit.finger(r, x, FY + U / 2, a, true)
        end
        -- progress bar under the room
        local pw = COLS * U
        r:drawPath(kit.rrect(FX, FY + ROWS * U + 40, pw, 10, 5), kit.fill(kit.LINE))
        r:drawPath(kit.rrect(FX, FY + ROWS * U + 40, pw * S.count / (COLS * ROWS), 10, 5), kit.fill(kit.GOLD))
        kit.label(r, f, S.count .. ' of ?', f.body, 15, kit.INK_SOFT, FX + pw, FY + ROWS * U + 66, 1)
    else
        kit.sign(r, f, 'COUNTED', tostring(math.floor(S.countShown)), S.sign, 900, 200)
        -- running totals beside each tapped row
        for row = 0, ROWS - 1 do
            local y = FY + row * U + U / 2
            local rt = S.rows[row]
            if rt ~= nil then
                local k = kit.back((g.t - rt) * 3)
                r:save()
                r:modulateOpacity(kit.clamp(k, 0, 1))
                kit.halo(r, f, '+6', f.display, 24, kit.GOLD_DEEP, FX + COLS * U + 46, y, 0)
                r:restore()
            else
                -- a tap target
                local pulse = 0.5 + 0.5 * math.sin(g.t * 4 + row)
                r:drawPath(kit.circle(FX + COLS * U + 60, y, 14 + pulse * 3), kit.stroke(kit.alpha(kit.GOLD, 0.6), 2.5))
                r:drawPath(kit.circle(FX + COLS * U + 60, y, 5), kit.fill(kit.GOLD))
            end
        end
        if S.rowCount == ROWS then
            local k = g.age
            local x0, x1, y0, y1 = FX, FX + COLS * U, FY, FY + ROWS * U
            kit.bracket(r, f, Vector.xy(x0, y0 - 34), Vector.xy(x1, y0 - 34), 0, -1, '6', kit.clamp((g.t - (S.rows[ROWS - 1] or 0) - 0.6) * 1.5, 0, 1), kit.INK)
            kit.bracket(r, f, Vector.xy(x0 - 40, y0), Vector.xy(x0 - 40, y1), -1, 0, '4', kit.clamp((g.t - (S.rows[ROWS - 1] or 0) - 1.3) * 1.5, 0, 1), kit.INK)
            kit.rule(r, f, 'area = length × breadth', '6 × 4 = 24 square units', kit.clamp((g.t - (S.rows[ROWS - 1] or 0) - 2.2) * 1.5, 0, 1), 1005, 330)
            local _ = k
        end
    end
end

local function drawStep3(g: G, r: Renderer)
    local f = g.fonts
    -- the grid
    local gp = Path.new()
    for c = 0, GCOLS do
        gp:moveTo(Vector.xy(GX + c * GU, GY))
        gp:lineTo(Vector.xy(GX + c * GU, GY + GROWS * GU))
    end
    for rr = 0, GROWS do
        gp:moveTo(Vector.xy(GX, GY + rr * GU))
        gp:lineTo(Vector.xy(GX + GCOLS * GU, GY + rr * GU))
    end
    r:drawPath(kit.rect(GX, GY, GCOLS * GU, GROWS * GU), kit.fill(kit.PAGE))
    r:drawPath(gp, kit.stroke(kit.LINE, 1.5))
    -- the rectangle's tiles
    local is12 = S.w * S.h == 12
    for rr = 0, S.h - 1 do
        for c = 0, S.w - 1 do
            local born = S.bornAt[rr * 100 + c] or -9
            local k = kit.clamp((g.t - born) / 0.3, 0, 1)
            local glow = if is12 then 0.6 + 0.4 * S.flash else 0
            if k < 1 then
                local s = kit.back(k)
                r:save()
                local cx, cy = GX + c * GU + GU / 2, GY + rr * GU + GU / 2
                r:transform(Mat2D.withTranslation(cx, cy) * Mat2D.withScale(s, s) * Mat2D.withTranslation(-cx, -cy))
                kit.tile(r, GX + c * GU, GY + rr * GU, GU, 1, glow)
                r:restore()
            else
                kit.tile(r, GX + c * GU, GY + rr * GU, GU, 1, glow)
            end
        end
    end
    -- outline and dimensions
    local x1, y1 = GX + S.w * GU, GY + S.h * GU
    r:drawPath(kit.rect(GX, GY, S.w * GU, S.h * GU), kit.stroke(if is12 then kit.ACCENT else kit.GOLD, 3.5))
    kit.halo(r, f, tostring(S.w), f.display, 22, kit.INK, (GX + x1) / 2, GY - 22, 0.5)
    kit.halo(r, f, tostring(S.h), f.display, 22, kit.INK, GX - 24, (GY + y1) / 2, 0.5)
    -- the handle
    local hp = handlePos()
    kit.knob(r, g.t, hp.x, hp.y, 'slide', S.held, not S.dragging and #S.foundList == 0)
    -- readout
    local A = S.w * S.h
    local bx = 700
    r:drawPath(kit.rrect(bx, 196, 460, 140, 22), kit.fill(if is12 then kit.ACCENT_WASH else kit.PAGE))
    r:drawPath(kit.rrect(bx, 196, 460, 140, 22), kit.stroke(if is12 then kit.ACCENT else kit.LINE, 2))
    kit.label(r, f, 'AREA', f.mono, 12, kit.INK_SOFT, bx + 24, 222, 0)
    local sc = 1 + 0.1 * math.sin(kit.clamp(S.sign, 0, 1) * math.pi)
    r:save()
    r:transform(Mat2D.withTranslation(bx + 24, 276) * Mat2D.withScale(sc, sc) * Mat2D.withTranslation(-(bx + 24), -276))
    kit.label(r, f, S.w .. ' × ' .. S.h .. ' = ' .. A, f.display, 46, if is12 then kit.ACCENT_DEEP else kit.INK, bx + 24, 276, 0)
    r:restore()
    kit.label(r, f, if is12 then 'Exactly 12!' else (if A < 12 then 'Too small: ' .. (12 - A) .. ' short' else 'Too big: ' .. (A - 12) .. ' over'), f.body, 16, if is12 then kit.ACCENT_DEEP else kit.INK_SOFT, bx + 24, 318, 0)
    -- found so far
    kit.label(r, f, 'FOUND', f.mono, 12, kit.INK_SOFT, bx, 372, 0)
    for i = 1, 2 do
        local s = S.foundList[i]
        local y = 392 + (i - 1) * 62
        r:drawPath(kit.rrect(bx, y, 220, 50, 16), kit.fill(if s ~= nil then kit.SURFACE else kit.PAGE))
        r:drawPath(kit.rrect(bx, y, 220, 50, 16), kit.stroke(if s ~= nil then kit.ACCENT else kit.LINE, if s ~= nil then 2 else 1.5))
        if s ~= nil then
            r:drawPath(kit.circle(bx + 28, y + 25, 12), kit.fill(kit.ACCENT))
            r:drawPath(kit.check(bx + 28, y + 25, 12), kit.stroke(kit.SURFACE, 2.4))
            kit.label(r, f, s .. ' = 12', f.display, 22, kit.INK, bx + 52, y + 25, 0)
        else
            kit.label(r, f, '? × ? = 12', f.display, 22, kit.INK_FAINT, bx + 24, y + 25, 0)
        end
    end
end

function L.draw(g: G, r: Renderer)
    if g.step <= 2 then
        drawStep12(g, r)
    else
        drawStep3(g, r)
    end
end

function L.down(g: G, p: Vector): boolean
    lastHover = p
    if g.step == 1 then
        if cellAt(p) ~= nil and S.count < COLS * ROWS then
            S.painting = true
            S.last = p
            g.sfx('pickup')
            paintTo(g, p)
            return true
        end
    elseif g.step == 2 then
        local row = hoverRow(p)
        if row >= 0 and S.rows[row] == nil then
            S.rows[row] = g.t
            S.rowCount += 1
            g.sfx('pop')
            if S.rowCount == ROWS then
                g.done()
                g.say('l1s2done')
            end
            return true
        end
    else
        if kit.dist(p, handlePos()) < 40 then
            S.dragging = true
            g.sfx('pickup')
            return true
        end
    end
    return false
end

function L.move(g: G, p: Vector)
    lastHover = p
    if g.step == 1 and S.painting then
        paintTo(g, p)
    elseif g.step == 3 and S.dragging then
        setSize(g, math.floor((p.x - GX) / GU + 0.5), math.floor((p.y - GY) / GU + 0.5))
    end
end

function L.up(g: G, p: Vector)
    if S.painting then
        S.painting = false
        S.last = nil
    end
    if S.dragging then
        S.dragging = false
        g.sfx('drop')
        judge(g)
    end
end

function L.key(g: G, k: number): boolean
    if g.step == 1 and k == 32 then
        -- space lays the next row
        for i = 0, COLS * ROWS - 1 do
            if S.tiles[i] == nil then
                local row = math.floor(i / COLS)
                for c = 0, COLS - 1 do
                    lay(g, row * COLS + c)
                end
                return true
            end
        end
    elseif g.step == 2 and k == 32 then
        for row = 0, ROWS - 1 do
            if S.rows[row] == nil then
                L.down(g, Vector.xy(FX + 10, FY + row * U + 10))
                return true
            end
        end
    elseif g.step == 3 then
        local dw = if k == 262 then 1 elseif k == 263 then -1 else 0
        local dh = if k == 264 then 1 elseif k == 265 then -1 else 0
        if dw ~= 0 or dh ~= 0 then
            setSize(g, S.w + dw, S.h + dh)
            judge(g)
            return true
        end
    end
    return false
end

function L.thumb(g: G, r: Renderer, x: number, y: number, w: number, h: number)
    local u = 18
    local cols, rows = 8, 4
    local ox, oy = x + (w - cols * u) / 2, y + (h - rows * u) / 2
    local n = math.floor((g.t * 6) % (cols * rows + 14))
    for i = 0, cols * rows - 1 do
        local c, rr = i % cols, math.floor(i / cols)
        if i < n then
            kit.tile(r, ox + c * u, oy + rr * u, u, kit.clamp((n - i) / 2, 0, 1), 0)
        else
            r:drawPath(kit.rect(ox + c * u + 1, oy + rr * u + 1, u - 2, u - 2), kit.stroke(kit.LINE, 1))
        end
    end
end

return L
