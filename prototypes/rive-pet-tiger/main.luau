-- Sheru, Cogna's pixel tiger cub. An original character drawn on a 32 x 32 pixel grid,
-- redrawn every frame from a pose, with an automatic dark outline like a classic pixel pet.
-- Moods (view model number "mood", so the app can switch them):
--   0 idle      breathes, blinks, looks around, slow tail
--   1 excited   hops with paws up, big open smile, sparkles
--   2 playful   bats a little green ball, tail going fast
--   3 thinking  head tilted, paw on chin, a question mark ("oops, let me think")
-- In the preview: the buttons switch mood, tapping Sheru makes him excited, keys 1-4 too.

type Pose = {
    dy: number, hd: number, hx: number,
    eyes: string, mouth: string, paws: string, tail: number, ears: string,
    sparkle: boolean, ball: Vector?, question: boolean,
}

type Pet = {
    fonts: { body: Font, display: Font }?,
    moodProp: Property<number>?,
    mood: number,
    burst: number, -- seconds of excitement left after a tap
    t: number,
    size: Vector,
}

local N = 32
local CELL = 11
local OX, OY = 64, 52

local PAL: { [string]: Color } = {
    O = Color.rgb(240, 138, 36), -- orange fur
    D = Color.rgb(200, 97, 26), -- shaded fur
    S = Color.rgb(43, 29, 20), -- stripes and outline
    C = Color.rgb(255, 241, 214), -- cream
    P = Color.rgb(244, 154, 166), -- pink
    W = Color.rgb(255, 255, 255),
    G = Color.rgb(14, 107, 84), -- Cogna green ball
    L = Color.rgb(111, 211, 174), -- ball highlight
    Y = Color.rgb(242, 201, 76), -- sparkle
}
local MOODS = { 'idle', 'excited', 'playful', 'thinking' }

-- the pixel grid ------------------------------------------------------------

type Grid = { [number]: string }

local function key(x: number, y: number): number
    return y * N + x
end

local function put(g: Grid, x: number, y: number, c: string)
    if x >= 0 and x < N and y >= 0 and y < N then
        g[key(x, y)] = c
    end
end

local function rect(g: Grid, x0: number, y0: number, x1: number, y1: number, c: string)
    for y = y0, y1 do
        for x = x0, x1 do
            put(g, x, y, c)
        end
    end
end

local function cells(g: Grid, list: { { number } }, c: string, dx: number, dy: number)
    for _, p in list do
        put(g, p[1] + dx, p[2] + dy, c)
    end
end

-- Sheru, piece by piece -----------------------------------------------------

local TAILS = {
    { { 22, 24 }, { 23, 24 }, { 24, 23 }, { 25, 23 }, { 26, 22 }, { 26, 21 }, { 27, 20 }, { 27, 19 }, { 27, 18 } },
    { { 22, 24 }, { 23, 24 }, { 24, 24 }, { 25, 23 }, { 26, 23 }, { 27, 22 }, { 28, 21 }, { 28, 20 }, { 28, 19 } },
    { { 22, 24 }, { 23, 23 }, { 24, 23 }, { 25, 22 }, { 25, 21 }, { 26, 20 }, { 26, 19 }, { 26, 18 }, { 25, 17 } },
}

local function drawTiger(g: Grid, p: Pose)
    local hd, hx = p.hd, p.hx

    -- tail, two pixels thick, striped, dark tip
    local tail = TAILS[p.tail + 1]
    for i, c in tail do
        local col = if i >= #tail - 1 then 'S' elseif i % 3 == 0 then 'S' else 'O'
        put(g, c[1], c[2], col)
        put(g, c[1], c[2] + 1, if col == 'S' then 'S' else 'D')
    end

    -- body
    rect(g, 11, 17, 20, 17, 'O')
    rect(g, 10, 18, 21, 26, 'O')
    rect(g, 13, 19, 18, 25, 'C')
    cells(g, { { 10, 19 }, { 11, 19 }, { 10, 22 }, { 11, 22 }, { 20, 19 }, { 21, 19 }, { 20, 22 }, { 21, 22 } }, 'S', 0, 0)
    rect(g, 10, 26, 21, 26, 'D')

    -- front paws
    if p.paws == 'up' then
        cells(g, { { 9, 18 }, { 8, 17 }, { 8, 16 } }, 'O', 0, 0)
        cells(g, { { 7, 15 }, { 8, 15 }, { 7, 14 } }, 'C', 0, 0)
        cells(g, { { 22, 18 }, { 23, 17 }, { 23, 16 } }, 'O', 0, 0)
        cells(g, { { 24, 15 }, { 23, 15 }, { 24, 14 } }, 'C', 0, 0)
    elseif p.paws == 'bat' then
        cells(g, { { 9, 22 }, { 8, 22 }, { 7, 21 } }, 'O', 0, 0)
        cells(g, { { 6, 21 }, { 6, 20 }, { 5, 21 } }, 'C', 0, 0)
        rect(g, 18, 25, 19, 26, 'C')
    else
        rect(g, 12, 25, 13, 26, 'C')
        rect(g, 18, 25, 19, 26, 'C')
        put(g, 12, 26, 'D'); put(g, 19, 26, 'D')
    end

    -- ears
    local le = if p.ears == 'tilt' then 1 else 0
    cells(g, { { 9, 3 }, { 9, 4 }, { 10, 4 }, { 9, 5 }, { 10, 5 }, { 11, 5 } }, 'O', hx, hd + le)
    put(g, 10 + hx, 5 + hd + le, 'P')
    cells(g, { { 22, 3 }, { 22, 4 }, { 21, 4 }, { 22, 5 }, { 21, 5 }, { 20, 5 } }, 'O', hx, hd)
    put(g, 21 + hx, 5 + hd, 'P')

    -- head (rounded)
    rect(g, 10 + hx, 6 + hd, 21 + hx, 6 + hd, 'O')
    rect(g, 9 + hx, 7 + hd, 22 + hx, 7 + hd, 'O')
    rect(g, 8 + hx, 8 + hd, 23 + hx, 15 + hd, 'O')
    rect(g, 9 + hx, 16 + hd, 22 + hx, 16 + hd, 'O')
    -- stripes: forehead and cheeks
    cells(g, { { 15, 6 }, { 16, 6 }, { 15, 7 }, { 16, 7 }, { 12, 6 }, { 12, 7 }, { 19, 6 }, { 19, 7 },
        { 8, 11 }, { 9, 11 }, { 8, 13 }, { 9, 13 }, { 22, 11 }, { 23, 11 }, { 22, 13 }, { 23, 13 } }, 'S', hx, hd)
    -- muzzle
    rect(g, 12 + hx, 12 + hd, 19 + hx, 15 + hd, 'C')
    rect(g, 13 + hx, 16 + hd, 18 + hx, 16 + hd, 'C')
    -- nose
    put(g, 15 + hx, 12 + hd, 'P'); put(g, 16 + hx, 12 + hd, 'P')

    -- eyes
    local ex, ey = hx, hd
    if p.eyes == 'left' then ex -= 1 elseif p.eyes == 'up' then ey -= 1 end
    if p.eyes == 'blink' then
        cells(g, { { 11, 10 }, { 12, 10 }, { 19, 10 }, { 20, 10 } }, 'S', hx, hd)
    elseif p.eyes == 'happy' then
        cells(g, { { 10, 10 }, { 11, 9 }, { 12, 9 }, { 13, 10 }, { 18, 10 }, { 19, 9 }, { 20, 9 }, { 21, 10 } }, 'S', hx, hd)
    else
        rect(g, 11 + ex, 9 + ey, 12 + ex, 10 + ey, 'S')
        rect(g, 19 + ex, 9 + ey, 20 + ex, 10 + ey, 'S')
        put(g, 11 + ex, 9 + ey, 'W'); put(g, 19 + ex, 9 + ey, 'W')
    end

    -- mouth
    if p.mouth == 'open' then
        cells(g, { { 14, 13 }, { 17, 13 }, { 14, 14 }, { 17, 14 }, { 15, 15 }, { 16, 15 } }, 'S', hx, hd)
        cells(g, { { 15, 14 }, { 16, 14 } }, 'P', hx, hd)
        cells(g, { { 15, 13 }, { 16, 13 } }, 'S', hx, hd)
    elseif p.mouth == 'o' then
        cells(g, { { 15, 14 }, { 16, 14 }, { 15, 15 }, { 16, 15 } }, 'S', hx, hd)
    else
        cells(g, { { 13, 14 }, { 14, 15 }, { 15, 14 }, { 16, 14 }, { 17, 15 }, { 18, 14 } }, 'S', hx, hd)
    end

    -- paw on chin while thinking (drawn over the muzzle)
    if p.paws == 'chin' then
        -- a paw resting under his chin: dark knuckle line, cream toes, orange paw
        cells(g, { { 16, 16 }, { 17, 16 }, { 18, 16 }, { 19, 16 } }, 'S', hx, hd)
        cells(g, { { 16, 17 }, { 17, 17 }, { 18, 17 }, { 19, 17 } }, 'C', hx, hd)
        put(g, 17 + hx, 17 + hd, 'D')
        cells(g, { { 17, 18 }, { 18, 18 }, { 19, 18 }, { 20, 18 }, { 20, 17 } }, 'O', hx, hd)
        cells(g, { { 20, 18 }, { 21, 18 }, { 21, 17 } }, 'O', 0, 0)
    end
end

-- an outline wherever an empty pixel touches Sheru
local function _outline(g: Grid): Grid
    local out: Grid = {}
    for y = 0, N - 1 do
        for x = 0, N - 1 do
            if g[key(x, y)] == nil then
                local near = (x > 0 and g[key(x - 1, y)] ~= nil) or (x < N - 1 and g[key(x + 1, y)] ~= nil)
                    or (y > 0 and g[key(x, y - 1)] ~= nil) or (y < N - 1 and g[key(x, y + 1)] ~= nil)
                if near then
                    out[key(x, y)] = 'S'
                end
            end
        end
    end
    for k, c in out do
        g[k] = c
    end
    return g
end

local function extras(g: Grid, p: Pose, t: number)
    if p.sparkle then
        local on = math.floor(t * 6) % 2 == 0
        local spots = if on then { { 4, 6 }, { 27, 5 }, { 3, 16 } } else { { 5, 3 }, { 28, 13 }, { 26, 1 } }
        for _, s in spots do
            cells(g, { { s[1], s[2] }, { s[1] - 1, s[2] }, { s[1] + 1, s[2] }, { s[1], s[2] - 1 }, { s[1], s[2] + 1 } }, 'Y', 0, 0)
        end
    end
    local b = p.ball
    if b ~= nil then
        rect(g, b.x, b.y, b.x + 2, b.y + 2, 'G')
        put(g, b.x, b.y, 'L')
    end
    if p.question and math.floor(t * 2) % 3 ~= 2 then
        cells(g, { { 26, 0 }, { 27, 0 }, { 28, 1 }, { 28, 2 }, { 27, 3 }, { 26, 4 }, { 26, 6 } }, 'G', 0, 0)
    end
end

-- poses for each mood ----------------------------------------------------------

local function poseFor(mood: number, t: number): Pose
    local p: Pose = { dy = 0, hd = 0, hx = 0, eyes = 'open', mouth = 'smile', paws = 'down', tail = 0, ears = 'up',
        sparkle = false, ball = nil, question = false }
    if mood == 1 then
        local hop = { 0, -1, -3, -4, -3, -1 }
        p.dy = hop[math.floor(t * 10) % 6 + 1]
        p.eyes = 'happy'; p.mouth = 'open'; p.paws = 'up'; p.sparkle = true
        p.tail = math.floor(t * 8) % 3
    elseif mood == 2 then
        local ph = (t % 1.4) / 1.4 -- one bounce of the ball
        local bx = math.floor(1 + 5 * (0.5 - 0.5 * math.cos(ph * math.pi * 2)))
        local by = math.floor(26 - 7 * math.abs(math.sin(ph * math.pi * 2)))
        p.ball = Vector.xy(bx, by)
        p.eyes = 'left'
        p.paws = if bx >= 4 then 'bat' else 'down'
        p.hx = if bx >= 4 then -1 else 0
        p.mouth = if bx >= 4 then 'open' else 'smile'
        p.tail = math.floor(t * 10) % 3
        p.hd = if math.floor(t * 5) % 2 == 0 then 0 else 1
    elseif mood == 3 then
        p.ears = 'tilt'; p.eyes = if t % 4 < 0.15 then 'blink' else 'up'
        p.mouth = 'o'; p.paws = 'chin'; p.question = true; p.hx = -1
        p.tail = math.floor(t * 1.5) % 2
    else
        p.hd = if math.floor(t * 1.6) % 2 == 0 then 0 else 1
        p.eyes = if t % 3.4 < 0.14 then 'blink' elseif t % 7 > 4.5 and t % 7 < 5.6 then 'left' else 'open'
        p.tail = math.floor(t * 2) % 2
    end
    return p
end

-- smoothing: a classic pixel-art upscaler (Scale2x), run twice, rounds off the
-- stair-steps so he reads as a smooth sticker rather than chunky pixels ----------

local function scale2x(src: Grid, w: number): Grid
    local dst: Grid = {}
    local w2 = w * 2
    for y = 0, w - 1 do
        for x = 0, w - 1 do
            local P = src[y * w + x]
            local A: string? = if y > 0 then src[(y - 1) * w + x] else nil
            local B: string? = if x < w - 1 then src[y * w + x + 1] else nil
            local L: string? = if x > 0 then src[y * w + x - 1] else nil
            local D: string? = if y < w - 1 then src[(y + 1) * w + x] else nil
            local e0, e1, e2, e3 = P, P, P, P
            if L == A and L ~= D and A ~= B then e0 = A end
            if A == B and A ~= L and B ~= D then e1 = B end
            if D == L and D ~= B and L ~= A then e2 = L end
            if B == D and B ~= A and D ~= L then e3 = D end
            local base = (2 * y) * w2 + 2 * x
            if e0 then dst[base] = e0 end
            if e1 then dst[base + 1] = e1 end
            if e2 then dst[base + w2] = e2 end
            if e3 then dst[base + w2 + 1] = e3 end
        end
    end
    return dst
end

local function outlineW(g: Grid, w: number)
    local out: Grid = {}
    for y = 0, w - 1 do
        for x = 0, w - 1 do
            local k = y * w + x
            if g[k] == nil then
                if (x > 0 and g[k - 1] ~= nil) or (x < w - 1 and g[k + 1] ~= nil) or (y > 0 and g[k - w] ~= nil) or (y < w - 1 and g[k + w] ~= nil) then
                    out[k] = 'S'
                end
            end
        end
    end
    for k, c in out do
        g[k] = c
    end
end

-- drawing ----------------------------------------------------------------------

local function label(r: Renderer, s: string, font: Font, size: number, c: Color, x: number, y: number)
    local tx = Text.new()
    tx.sizing = 'autoWidth'
    tx.origin = 'top'
    tx:append(s, { font = font, size = size, paint = Paint.with({ color = c }) })
    local mn, mx = tx:bounds()
    r:save()
    r:transform(Mat2D.withTranslation(x - (mx.x - mn.x) / 2 - mn.x, y))
    tx:draw(r)
    r:restore()
end

local function roundRect(x: number, y: number, w: number, h: number, rr: number): Path
    local p = Path.new()
    local k = rr * 0.4477
    p:moveTo(Vector.xy(x + rr, y))
    p:lineTo(Vector.xy(x + w - rr, y))
    p:cubicTo(Vector.xy(x + w - k, y), Vector.xy(x + w, y + k), Vector.xy(x + w, y + rr))
    p:lineTo(Vector.xy(x + w, y + h - rr))
    p:cubicTo(Vector.xy(x + w, y + h - k), Vector.xy(x + w - k, y + h), Vector.xy(x + w - rr, y + h))
    p:lineTo(Vector.xy(x + rr, y + h))
    p:cubicTo(Vector.xy(x + k, y + h), Vector.xy(x, y + h - k), Vector.xy(x, y + h - rr))
    p:lineTo(Vector.xy(x, y + rr))
    p:cubicTo(Vector.xy(x, y + k), Vector.xy(x + k, y), Vector.xy(x + rr, y))
    p:close()
    return p
end

local BTN_Y, BTN_W, BTN_H = 474, 98, 40

local function btnX(i: number): number
    return 240 - (4 * BTN_W + 3 * 10) / 2 + (i - 1) * (BTN_W + 10)
end

local function currentMood(self: Pet): number
    if self.burst > 0 then
        return 1
    end
    return self.mood
end

function draw(self: Pet, r: Renderer)
    local fonts = self.fonts
    if fonts == nil then
        return
    end
    local mood = currentMood(self)
    local p = poseFor(mood, self.t)

    -- a soft pixel shadow that shrinks as he hops
    local sw = 12 + p.dy
    local shadow = Path.new()
    local sx0 = OX + (16 - sw / 2) * CELL
    shadow:moveTo(Vector.xy(sx0, OY + 28 * CELL))
    shadow:lineTo(Vector.xy(sx0 + sw * CELL, OY + 28 * CELL))
    shadow:lineTo(Vector.xy(sx0 + sw * CELL, OY + 29 * CELL))
    shadow:lineTo(Vector.xy(sx0, OY + 29 * CELL))
    shadow:close()
    r:drawPath(shadow, Paint.with({ color = Color.rgba(22, 36, 29, 40) }))

    -- draw on the 32 grid, smooth up to 128, then a two-step outline at the fine size
    local g: Grid = {}
    drawTiger(g, p)
    extras(g, p, self.t)
    local W = N
    for _ = 1, 2 do
        g = scale2x(g, W)
        W *= 2
    end
    outlineW(g, W)
    outlineW(g, W)
    local cs = CELL * N / W

    -- one path per colour; each row's runs of one colour become a single rectangle
    local paths: { [string]: Path } = {}
    for y = 0, W - 1 do
        local x = 0
        while x < W do
            local c = g[y * W + x]
            if c == nil then
                x += 1
            else
                local x1 = x
                while x1 + 1 < W and g[y * W + x1 + 1] == c do
                    x1 += 1
                end
                local path = paths[c]
                if path == nil then
                    path = Path.new()
                    paths[c] = path
                end
                local px, py = OX + x * cs, OY + y * cs + p.dy * CELL
                local pw = (x1 - x + 1) * cs
                path:moveTo(Vector.xy(px, py))
                path:lineTo(Vector.xy(px + pw, py))
                path:lineTo(Vector.xy(px + pw, py + cs + 0.4))
                path:lineTo(Vector.xy(px, py + cs + 0.4))
                path:close()
                x = x1 + 1
            end
        end
    end
    for c, path in paths do
        r:drawPath(path, Paint.with({ color = PAL[c] }))
    end

    local ink = Color.rgb(22, 36, 29)
    label(r, 'Sheru', fonts.display, 30, ink, 240, 392)
    label(r, 'feeling ' .. MOODS[mood + 1], fonts.body, 16, Color.rgb(81, 99, 90), 240, 432)
    for i, name in MOODS do
        local x = btnX(i)
        local on = (i - 1) == mood
        r:drawPath(roundRect(x, BTN_Y, BTN_W, BTN_H, BTN_H / 2), Paint.with({ color = if on then Color.rgb(14, 107, 84) else Color.rgb(255, 255, 255) }))
        if not on then
            r:drawPath(roundRect(x, BTN_Y, BTN_W, BTN_H, BTN_H / 2), Paint.with({ style = 'stroke', thickness = 1.5, color = Color.rgb(214, 224, 217) }))
        end
        label(r, name, fonts.body, 15, if on then Color.rgb(255, 255, 255) else ink, x + BTN_W / 2, BTN_Y + 10)
    end
end

-- life cycle -------------------------------------------------------------------

local function setMood(self: Pet, m: number)
    self.mood = math.clamp(math.floor(m), 0, 3)
    self.burst = 0
    local prop = self.moodProp
    if prop ~= nil then
        prop.value = self.mood
    end
end

function init(self: Pet, context: Context): boolean
    local body = context:font('Body')
    local display = context:font('Display')
    if body == nil or display == nil then
        print('font missing')
        return false
    end
    self.fonts = { body = body, display = display:withOptions({ wght = 700 }) }
    local vm = context:viewModel()
    if vm ~= nil then
        self.moodProp = vm:getNumber('mood')
    end
    return true
end

function resize(self: Pet, size: Vector)
    self.size = size
end

function advance(self: Pet, seconds: number): boolean
    self.t += seconds
    self.burst = math.max(0, self.burst - seconds)
    -- the app may change the mood at any time
    local prop = self.moodProp
    if prop ~= nil then
        local m = math.clamp(math.floor(prop.value), 0, 3)
        if m ~= self.mood then
            self.mood = m
            self.burst = 0
        end
    end
    return true
end

function pointerDown(self: Pet, event: PointerEvent)
    local q = event.position
    for i = 1, 4 do
        local x = btnX(i)
        if q.x >= x and q.x <= x + BTN_W and q.y >= BTN_Y and q.y <= BTN_Y + BTN_H then
            setMood(self, i - 1)
            event:hit()
            return
        end
    end
    -- tap Sheru: a burst of excitement, then back to his mood
    if q.x >= OX and q.x <= OX + N * CELL and q.y >= OY and q.y <= OY + 29 * CELL then
        self.burst = 2.4
        event:hit()
    end
end

function keyboardEvent(self: Pet, event: KeyboardEvent): boolean
    if event.phase == 'up' then
        return false
    end
    if event.key >= 49 and event.key <= 52 then -- keys 1-4
        setMood(self, event.key - 49)
        return true
    end
    return false
end

return function(context: Context): Layout<Pet>
    return {
        fonts = nil,
        moodProp = nil,
        mood = 0,
        burst = 0,
        t = 0,
        size = Vector.xy(480, 540),
        init = init,
        resize = resize,
        advance = advance,
        draw = draw,
        pointerDown = pointerDown,
        keyboardEvent = keyboardEvent,
    }
end
