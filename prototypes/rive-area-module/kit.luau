-- kit: everything the Area lessons share.
--   palette · maths · paths · text · the land look · widgets (keypad, choices, knobs, ghost finger)
--   and the two types every lesson is written against: G (what the module gives a lesson) and Lesson.
-- Coordinates are artboard pixels (1280 × 760). The board, where a lesson draws, is BOARD.

local kit = {}

export type Fonts = { display: Font, body: Font, mono: Font, math: Font }

-- What the module hands to a lesson.
export type G = {
    fonts: Fonts,
    t: number, -- seconds since start
    age: number, -- seconds since this step began
    step: number,
    say: (key: string) -> (), -- Kiara says a line now (stops what she was saying)
    sayNext: (key: string) -> (), -- …or once she has finished the current one
    sfx: (name: string) -> (),
    tick: (i: number) -> (), -- a counting tick, climbing in pitch with i
    done: () -> (), -- this step's task is done (Next lights up)
    isDone: () -> boolean,
    talking: () -> boolean,
    burst: (x: number, y: number, n: number) -> (), -- confetti
    shake: (amount: number) -> (), -- jolt the board
    hint: (text: string) -> (), -- a small hint chip on the board
    -- An answer the student gave (keypad, a choice, a tap), for the trail's evidence. qid is stable per question
    -- (e.g. 'l4s4'); mixup is the trail's mix-up id when the wrong answer shows one ('slant', 'perim', 'half', …).
    report: (qid: string, correct: boolean, value: string, mixup: string?) -> (),
}

export type StepDef = { title: string, line: string, task: string }

export type Lesson = {
    id: string,
    tag: string,
    title: string,
    blurb: string,
    steps: { StepDef },
    enter: (g: G, step: number) -> (),
    advance: (g: G, dt: number) -> (),
    draw: (g: G, r: Renderer) -> (),
    down: (g: G, p: Vector) -> boolean,
    move: (g: G, p: Vector) -> (),
    up: (g: G, p: Vector) -> (),
    key: (g: G, k: number) -> boolean,
    thumb: (g: G, r: Renderer, x: number, y: number, w: number, h: number) -> (),
}
-- A lesson may also set L.lines = { key = text }: its own spoken lines, merged into lines.luau at start-up.

-- Board ---------------------------------------------------------------------

kit.BX, kit.BY, kit.BW, kit.BH = 40, 150, 1200, 486

-- Cogna palette ---------------------------------------------------------------

kit.INK = Color.rgb(22, 36, 29)
kit.INK_SOFT = Color.rgb(81, 99, 90)
kit.INK_FAINT = Color.rgb(125, 140, 132)
kit.LINE = Color.rgb(214, 224, 217)
kit.SURFACE = Color.rgb(255, 255, 255)
kit.PAGE = Color.rgb(244, 247, 243)
kit.ACCENT = Color.rgb(14, 107, 84)
kit.ACCENT_DEEP = Color.rgb(8, 70, 58)
kit.ACCENT_WASH = Color.rgb(227, 239, 233)
kit.GOLD = Color.rgb(220, 160, 58)
kit.GOLD_DEEP = Color.rgb(122, 76, 8)
kit.GOLD_WASH = Color.rgb(255, 244, 216)
kit.RED = Color.rgb(180, 64, 12)
kit.BLUE = Color.rgb(37, 99, 235)
kit.ORANGE = Color.rgb(224, 112, 32)
-- land
kit.GRASS = Color.rgb(111, 179, 111)
kit.GRASS_HI = Color.rgb(146, 201, 132)
kit.GRASS_COPY = Color.rgb(156, 207, 138)
kit.GRASS_COPY_HI = Color.rgb(186, 224, 160)
kit.GRASS_EDGE = Color.rgb(60, 130, 72)
kit.SOIL = Color.rgb(141, 92, 15)
kit.SOIL_EDGE = Color.rgb(110, 71, 12)
kit.TILE = Color.rgb(250, 238, 214)
kit.TILE_EDGE = Color.rgb(214, 170, 96)

-- Maths -------------------------------------------------------------------------

function kit.clamp(v: number, lo: number, hi: number): number
    return math.max(lo, math.min(hi, v))
end

function kit.lerp(a: number, b: number, t: number): number
    return a + (b - a) * t
end

function kit.ease(t: number): number -- out-cubic
    local c = kit.clamp(t, 0, 1)
    return 1 - (1 - c) ^ 3
end

function kit.smooth(t: number): number
    local c = kit.clamp(t, 0, 1)
    return c * c * (3 - 2 * c)
end

function kit.back(t: number): number -- overshoots a little, then settles
    local c = kit.clamp(t, 0, 1)
    local c1 = 1.70158
    local c3 = c1 + 1
    return 1 + c3 * (c - 1) ^ 3 + c1 * (c - 1) ^ 2
end

function kit.bounce(t: number): number
    local x = kit.clamp(t, 0, 1)
    local n1, d1 = 7.5625, 2.75
    if x < 1 / d1 then
        return n1 * x * x
    elseif x < 2 / d1 then
        x -= 1.5 / d1
        return n1 * x * x + 0.75
    elseif x < 2.5 / d1 then
        x -= 2.25 / d1
        return n1 * x * x + 0.9375
    end
    x -= 2.625 / d1
    return n1 * x * x + 0.984375
end

-- approach target smoothly, frame-rate independent
function kit.follow(v: number, target: number, rate: number, dt: number): number
    return v + (target - v) * (1 - math.exp(-rate * dt))
end

export type Spring = { x: number, v: number }

function kit.spring(s: Spring, target: number, stiffness: number, damping: number, dt: number)
    local steps = math.max(1, math.ceil(dt / 0.008))
    local h = dt / steps
    for _ = 1, steps do
        local a = -stiffness * (s.x - target) - damping * s.v
        s.v += a * h
        s.x += s.v * h
    end
end

function kit.v(x: number, y: number): Vector
    return Vector.xy(x, y)
end

function kit.dist(a: Vector, b: Vector): number
    local dx, dy = a.x - b.x, a.y - b.y
    return math.sqrt(dx * dx + dy * dy)
end

-- points in "squares" -> pixels: origin o, unit u
function kit.toPx(P: { Vector }, ox: number, oy: number, u: number): { Vector }
    local out: { Vector } = {}
    for _, p in P do
        table.insert(out, Vector.xy(ox + p.x * u, oy + p.y * u))
    end
    return out
end

function kit.offset(P: { Vector }, dx: number, dy: number): { Vector }
    local out: { Vector } = {}
    for _, p in P do
        table.insert(out, Vector.xy(p.x + dx, p.y + dy))
    end
    return out
end

-- rotate points about c by a radians (screen: positive is clockwise)
function kit.rotate(P: { Vector }, c: Vector, a: number): { Vector }
    local cs, sn = math.cos(a), math.sin(a)
    local out: { Vector } = {}
    for _, p in P do
        local x, y = p.x - c.x, p.y - c.y
        table.insert(out, Vector.xy(c.x + x * cs - y * sn, c.y + x * sn + y * cs))
    end
    return out
end

function kit.area(P: { Vector }): number
    local s = 0
    for i = 1, #P do
        local a, b = P[i], P[(i % #P) + 1]
        s += a.x * b.y - b.x * a.y
    end
    return math.abs(s) / 2
end

function kit.centroid(P: { Vector }): Vector
    local x, y = 0, 0
    for _, p in P do
        x += p.x
        y += p.y
    end
    return Vector.xy(x / #P, y / #P)
end

function kit.inside(P: { Vector }, q: Vector): boolean
    local c = false
    local j = #P
    for i = 1, #P do
        local a, b = P[i], P[j]
        if (a.y > q.y) ~= (b.y > q.y) and q.x < (b.x - a.x) * (q.y - a.y) / (b.y - a.y) + a.x then
            c = not c
        end
        j = i
    end
    return c
end

function kit.bbox(P: { Vector }): (number, number, number, number)
    local x0, y0, x1, y1 = math.huge, math.huge, -math.huge, -math.huge
    for _, p in P do
        x0 = math.min(x0, p.x)
        y0 = math.min(y0, p.y)
        x1 = math.max(x1, p.x)
        y1 = math.max(y1, p.y)
    end
    return x0, y0, x1, y1
end

-- convex hull (monotone chain)
function kit.hull(pts: { Vector }): { Vector }
    local p = table.clone(pts)
    table.sort(p, function(a: Vector, b: Vector): boolean
        if a.x == b.x then
            return a.y < b.y
        end
        return a.x < b.x
    end)
    local function cross(o: Vector, a: Vector, b: Vector): number
        return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
    end
    local lo: { Vector } = {}
    for i = 1, #p do
        while #lo >= 2 and cross(lo[#lo - 1], lo[#lo], p[i]) <= 0 do
            table.remove(lo)
        end
        table.insert(lo, p[i])
    end
    local up: { Vector } = {}
    for i = #p, 1, -1 do
        while #up >= 2 and cross(up[#up - 1], up[#up], p[i]) <= 0 do
            table.remove(up)
        end
        table.insert(up, p[i])
    end
    table.remove(lo)
    table.remove(up)
    for _, q in up do
        table.insert(lo, q)
    end
    return lo
end

-- Paint and paths -----------------------------------------------------------------

function kit.fill(c: Color): Paint
    return Paint.with({ color = c })
end

function kit.stroke(c: Color, w: number): Paint
    return Paint.with({ style = 'stroke', thickness = w, color = c, cap = 'round', join = 'round' })
end

function kit.soft(c: Color, feather: number): Paint
    return Paint.with({ color = c, feather = feather })
end

function kit.alpha(c: Color, a: number): Color
    return Color.opacity(c, a) :: Color
end

function kit.mix(a: Color, b: Color, t: number): Color
    return Color.lerp(a, b, kit.clamp(t, 0, 1))
end

local K = 0.5522847498

function kit.circle(cx: number, cy: number, r: number): Path
    local p = Path.new()
    p:moveTo(Vector.xy(cx + r, cy))
    p:cubicTo(Vector.xy(cx + r, cy + r * K), Vector.xy(cx + r * K, cy + r), Vector.xy(cx, cy + r))
    p:cubicTo(Vector.xy(cx - r * K, cy + r), Vector.xy(cx - r, cy + r * K), Vector.xy(cx - r, cy))
    p:cubicTo(Vector.xy(cx - r, cy - r * K), Vector.xy(cx - r * K, cy - r), Vector.xy(cx, cy - r))
    p:cubicTo(Vector.xy(cx + r * K, cy - r), Vector.xy(cx + r, cy - r * K), Vector.xy(cx + r, cy))
    p:close()
    return p
end

function kit.ellipse(cx: number, cy: number, rx: number, ry: number): Path
    local p = Path.new()
    p:moveTo(Vector.xy(cx + rx, cy))
    p:cubicTo(Vector.xy(cx + rx, cy + ry * K), Vector.xy(cx + rx * K, cy + ry), Vector.xy(cx, cy + ry))
    p:cubicTo(Vector.xy(cx - rx * K, cy + ry), Vector.xy(cx - rx, cy + ry * K), Vector.xy(cx - rx, cy))
    p:cubicTo(Vector.xy(cx - rx, cy - ry * K), Vector.xy(cx - rx * K, cy - ry), Vector.xy(cx, cy - ry))
    p:cubicTo(Vector.xy(cx + rx * K, cy - ry), Vector.xy(cx + rx, cy - ry * K), Vector.xy(cx + rx, cy))
    p:close()
    return p
end

function kit.rrect(x: number, y: number, w: number, h: number, r: number): Path
    local rr = math.min(r, w / 2, h / 2)
    local p = Path.new()
    local k = rr * (1 - K)
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

function kit.rect(x: number, y: number, w: number, h: number): Path
    local p = Path.new()
    p:moveTo(Vector.xy(x, y))
    p:lineTo(Vector.xy(x + w, y))
    p:lineTo(Vector.xy(x + w, y + h))
    p:lineTo(Vector.xy(x, y + h))
    p:close()
    return p
end

-- Filled shapes only fill when their corners run clockwise on screen, so a polygon is turned round if it runs the other way.
function kit.poly(P: { Vector }): Path
    local s = 0
    for i = 1, #P do
        local a, b = P[i], P[(i % #P) + 1]
        s += a.x * b.y - b.x * a.y
    end
    local Q = P
    if s < 0 then
        Q = {}
        for i = #P, 1, -1 do
            table.insert(Q, P[i])
        end
    end
    local p = Path.new()
    for i, q in Q do
        if i == 1 then
            p:moveTo(q)
        else
            p:lineTo(q)
        end
    end
    p:close()
    return p
end

function kit.polyline(P: { Vector }): Path
    local p = Path.new()
    for i, q in P do
        if i == 1 then
            p:moveTo(q)
        else
            p:lineTo(q)
        end
    end
    return p
end

function kit.line(x1: number, y1: number, x2: number, y2: number): Path
    local p = Path.new()
    p:moveTo(Vector.xy(x1, y1))
    p:lineTo(Vector.xy(x2, y2))
    return p
end

function kit.dashed(x1: number, y1: number, x2: number, y2: number, dash: number, gap: number, phase: number?): Path
    local p = Path.new()
    local dx, dy = x2 - x1, y2 - y1
    local len = math.sqrt(dx * dx + dy * dy)
    if len < 0.5 then
        return p
    end
    local ux, uy = dx / len, dy / len
    local d = -((phase or 0) % (dash + gap))
    while d < len do
        local s = math.max(d, 0)
        local e = math.min(d + dash, len)
        if e > s then
            p:moveTo(Vector.xy(x1 + ux * s, y1 + uy * s))
            p:lineTo(Vector.xy(x1 + ux * e, y1 + uy * e))
        end
        d += dash + gap
    end
    return p
end

-- the first `frac` of a polygon's outline (for outlines that draw themselves)
function kit.partialOutline(P: { Vector }, frac: number): Path
    local p = Path.new()
    local total = 0
    for i = 1, #P do
        total += kit.dist(P[i], P[(i % #P) + 1])
    end
    local want = total * kit.clamp(frac, 0, 1)
    p:moveTo(P[1])
    for i = 1, #P do
        local a, b = P[i], P[(i % #P) + 1]
        local l = kit.dist(a, b)
        if want >= l then
            p:lineTo(b)
            want -= l
        else
            local t = if l > 0 then want / l else 0
            p:lineTo(Vector.xy(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t))
            break
        end
    end
    return p
end

function kit.arc(cx: number, cy: number, r: number, a0: number, a1: number): Path
    local p = Path.new()
    local n = math.max(2, math.ceil(math.abs(a1 - a0) / 0.05))
    for i = 0, n do
        local a = a0 + (a1 - a0) * i / n
        local q = Vector.xy(cx + r * math.cos(a), cy + r * math.sin(a))
        if i == 0 then
            p:moveTo(q)
        else
            p:lineTo(q)
        end
    end
    return p
end

function kit.check(x: number, y: number, s: number): Path
    local p = Path.new()
    p:moveTo(Vector.xy(x - s * 0.45, y + s * 0.02))
    p:lineTo(Vector.xy(x - s * 0.12, y + s * 0.34))
    p:lineTo(Vector.xy(x + s * 0.5, y - s * 0.32))
    return p
end

-- a square-corner mark at foot f, legs along unit directions a and b
function kit.corner(f: Vector, ax: number, ay: number, bx: number, by: number, s: number): Path
    local p = Path.new()
    p:moveTo(Vector.xy(f.x + ax * s, f.y + ay * s))
    p:lineTo(Vector.xy(f.x + ax * s + bx * s, f.y + ay * s + by * s))
    p:lineTo(Vector.xy(f.x + bx * s, f.y + by * s))
    return p
end

-- Text ------------------------------------------------------------------------------

-- Instrument Sans has no ², ½, ×, −, √: those characters are set in the maths face.
local SUBS = { '²', '½', '×', '−', '√', '÷' }

local function runs(t: Text, s: string, font: Font, fonts: Fonts, size: number, paint: Paint)
    local start = 1
    while start <= #s do
        local bi: number? = nil
        local bj = 0
        local bch = ''
        for _, ch in SUBS do
            local i, j = string.find(s, ch, start, true)
            if i ~= nil and j ~= nil and (bi == nil or i < (bi :: number)) then
                bi, bj, bch = i, j, ch
            end
        end
        if bi == nil then
            t:append(string.sub(s, start), { font = font, size = size, paint = paint })
            break
        end
        local i = bi :: number
        if i > start then
            t:append(string.sub(s, start, i - 1), { font = font, size = size, paint = paint })
        end
        t:append(bch, { font = fonts.math, size = size * 1.02, paint = paint })
        start = bj + 1
    end
end

function kit.text(fonts: Fonts, s: string, font: Font, size: number, c: Color): Text
    local t = Text.new()
    t.sizing = 'autoWidth'
    t.origin = 'top'
    runs(t, s, font, fonts, size, kit.fill(c))
    return t
end

function kit.width(fonts: Fonts, s: string, font: Font, size: number): number
    local mn, mx = kit.text(fonts, s, font, size, kit.INK):bounds()
    return mx.x - mn.x
end

-- One line. anchor 0 = left at x, 0.5 = centred, 1 = right. vy: y is the line's middle.
function kit.label(r: Renderer, fonts: Fonts, s: string, font: Font, size: number, c: Color, x: number, y: number, anchor: number): number
    local t = kit.text(fonts, s, font, size, c)
    local mn, mx = t:bounds()
    local w = mx.x - mn.x
    r:save()
    r:transform(Mat2D.withTranslation(x - w * anchor - mn.x, y - size * 0.62))
    t:draw(r)
    r:restore()
    return w
end

-- a label with a white halo, readable on top of grass or tiles
function kit.halo(r: Renderer, fonts: Fonts, s: string, font: Font, size: number, c: Color, x: number, y: number, anchor: number)
    local w = kit.width(fonts, s, font, size)
    local x0 = x - w * anchor
    r:drawPath(kit.rrect(x0 - 8, y - size * 0.7, w + 16, size * 1.4, size * 0.7), kit.fill(kit.alpha(kit.SURFACE, 0.92)))
    kit.label(r, fonts, s, font, size, c, x, y, anchor)
end

function kit.paragraph(r: Renderer, fonts: Fonts, s: string, size: number, c: Color, x: number, y: number, width: number)
    local t = Text.new()
    t.sizing = 'autoHeight'
    t.origin = 'top'
    t.maxWidth = width
    t.align = 'left'
    runs(t, s, fonts.body, fonts, size, kit.fill(c))
    r:save()
    r:transform(Mat2D.withTranslation(x, y))
    t:draw(r)
    r:restore()
end

function kit.num(v: number): string
    local n = math.floor(v + 0.5)
    if math.abs(v - n) < 1e-6 then
        local s = tostring(n)
        if n >= 10000 then
            s = string.sub(s, 1, #s - 3) .. ',' .. string.sub(s, #s - 2)
        end
        return s
    end
    return string.format('%.1f', v)
end

-- The land look ------------------------------------------------------------------------

export type LandStyle = {
    lift: number, -- 0 on the ground … 1 held up
    copy: boolean, -- the lighter twin
    edge: number, -- 0 plain · 1 gold (you can move me) · 2 red (not that)
    unit: number, -- grid square in px
    gridAt: Vector, -- a grid crossing
    gridRot: number, -- grid turn (radians)
    alpha: number,
}

function kit.style(unit: number, gridAt: Vector): LandStyle
    return { lift = 0, copy = false, edge = 0, unit = unit, gridAt = gridAt, gridRot = 0, alpha = 1 }
end

local SLAB_X, SLAB_Y = 4, 10

-- Grid lines over the patch, in the grid's own frame (it turns with the piece).
local function grid(r: Renderer, P: { Vector }, s: LandStyle, copy: boolean)
    local u = s.unit
    local inv = kit.rotate(kit.offset(P, -s.gridAt.x, -s.gridAt.y), Vector.xy(0, 0), -s.gridRot)
    local x0, y0, x1, y1 = kit.bbox(inv)
    local i0, i1 = math.floor(x0 / u) - 1, math.ceil(x1 / u) + 1
    local j0, j1 = math.floor(y0 / u) - 1, math.ceil(y1 / u) + 1
    r:save()
    r:clipPath(kit.poly(P))
    r:transform(Mat2D.withTranslation(s.gridAt.x, s.gridAt.y) * Mat2D.withRotation(s.gridRot))
    -- mown stripes
    local stripe = kit.fill(kit.alpha(if copy then kit.SURFACE else Color.rgb(46, 125, 60), if copy then 0.16 else 0.13))
    for i = i0, i1 do
        if i % 2 == 0 then
            r:drawPath(kit.rect(i * u, j0 * u, u, (j1 - j0) * u), stripe)
        end
    end
    local gp = Path.new()
    for i = i0, i1 do
        gp:moveTo(Vector.xy(i * u, j0 * u))
        gp:lineTo(Vector.xy(i * u, j1 * u))
    end
    for j = j0, j1 do
        gp:moveTo(Vector.xy(i0 * u, j * u))
        gp:lineTo(Vector.xy(i1 * u, j * u))
    end
    r:drawPath(gp, kit.stroke(kit.alpha(kit.SURFACE, 0.5), 1.6))
    r:restore()
end

-- A piece of land with corners P (px). Held pieces rise, and their shadow spreads and softens.
function kit.land(r: Renderer, P: { Vector }, s: LandStyle)
    if #P < 3 then
        return
    end
    local lift = s.lift
    r:save()
    r:modulateOpacity(s.alpha)
    -- shadow on the ground
    r:drawPath(kit.poly(kit.offset(P, 3 + 10 * lift, 8 + 22 * lift)), kit.soft(kit.alpha(kit.INK, 0.2 + 0.06 * lift), 9 + 16 * lift))
    local Q = kit.offset(P, 0, -13 * lift)
    -- soil: the patch swept down and to the right (each edge sweeps a band), so any shape works, hollow corners too
    local soil = kit.fill(kit.SOIL)
    local QO = kit.offset(Q, SLAB_X, SLAB_Y)
    r:drawPath(kit.poly(QO), soil)
    r:drawPath(kit.poly(QO), kit.stroke(kit.SOIL_EDGE, 1.5))
    for i = 1, #Q do
        local a, b = Q[i], Q[(i % #Q) + 1]
        local band = { a, b, Vector.xy(b.x + SLAB_X, b.y + SLAB_Y), Vector.xy(a.x + SLAB_X, a.y + SLAB_Y) }
        r:drawPath(kit.poly(band), soil)
    end
    -- grass with a soft light from the top left
    local x0, y0, x1, y1 = kit.bbox(Q)
    local base = if s.copy then kit.GRASS_COPY else kit.GRASS
    local hi = if s.copy then kit.GRASS_COPY_HI else kit.GRASS_HI
    local g = Gradient.linear(Vector.xy(x0, y0), Vector.xy(x1, y1), {
        { position = 0, color = hi },
        { position = 0.55, color = base },
        { position = 1, color = kit.mix(base, kit.INK, 0.08) },
    })
    r:drawPath(kit.poly(Q), Paint.with({ gradient = g }))
    local gs: LandStyle = {
        lift = lift, copy = s.copy, edge = s.edge, unit = s.unit,
        gridAt = Vector.xy(s.gridAt.x, s.gridAt.y - 13 * lift), gridRot = s.gridRot, alpha = 1,
    }
    grid(r, Q, gs, s.copy)
    -- edge
    if s.edge == 1 then
        r:drawPath(kit.poly(Q), kit.stroke(kit.GOLD, 5))
    elseif s.edge == 2 then
        r:drawPath(kit.poly(Q), kit.stroke(kit.RED, 5))
    else
        r:drawPath(kit.poly(Q), kit.stroke(if s.copy then Color.rgb(92, 156, 85) else kit.GRASS_EDGE, 2.5))
    end
    r:restore()
end

-- a tile on a floor: cream square with a soft edge; drop 0..1 is how far it has fallen in
function kit.tile(r: Renderer, x: number, y: number, u: number, drop: number, glow: number)
    local k = kit.bounce(drop)
    local lift = (1 - k) * 40
    local sc = 1 + (1 - kit.clamp(drop * 1.4, 0, 1)) * 0.25
    local w = (u - 6) * sc
    local cx, cy = x + u / 2, y + u / 2 - lift
    local rad = math.max(2, u * 0.11)
    r:drawPath(kit.rrect(cx - w / 2 + 2, y + u / 2 - w / 2 + 4, w, w, rad), kit.soft(kit.alpha(kit.INK, 0.18 * k), 5))
    local c = kit.mix(kit.TILE, kit.GOLD_WASH, glow)
    r:drawPath(kit.rrect(cx - w / 2, cy - w / 2, w, w, rad), kit.fill(c))
    r:drawPath(kit.rrect(cx - w / 2, cy - w / 2, w, w, rad), kit.stroke(kit.mix(kit.TILE_EDGE, kit.GOLD, glow), math.min(1.6, u * 0.05) + glow * 1.6))
    if u > 24 then
        r:drawPath(kit.rrect(cx - w / 2 + 4, cy - w / 2 + 3, w - 8, w * 0.28, rad * 0.6), kit.fill(kit.alpha(kit.SURFACE, 0.55)))
    end
end

-- Widgets ------------------------------------------------------------------------------

-- a gold knob: spin (curved arrow) or slide (chevrons). held 0..1, pulse rings while it waits
function kit.knob(r: Renderer, t: number, x: number, y: number, icon: string, held: number, live: boolean)
    if live and held < 0.5 then
        local k = (t * 0.6) % 1
        r:drawPath(kit.circle(x, y, 20 + k * 22), kit.stroke(kit.alpha(kit.GOLD, 0.7 * (1 - k)), 3))
    end
    local rr = 18 * (1 + held * 0.18)
    r:drawPath(kit.circle(x + 2, y + 6 + held * 6, rr), kit.soft(kit.alpha(kit.INK, 0.28), 6 + held * 6))
    r:drawPath(kit.circle(x, y - held * 3, rr), kit.fill(kit.GOLD))
    r:drawPath(kit.circle(x, y - held * 3, rr), kit.stroke(kit.SURFACE, 3.5))
    local cy = y - held * 3
    local w = kit.stroke(kit.SURFACE, 3.2)
    if icon == 'spin' then
        r:drawPath(kit.arc(x, cy, 8, math.pi * 0.85, math.pi * 2.25), w)
        local p = Path.new()
        p:moveTo(Vector.xy(x + 2, cy - 12))
        p:lineTo(Vector.xy(x + 6.5, cy - 7.5))
        p:lineTo(Vector.xy(x + 1, cy - 4))
        r:drawPath(p, w)
    else
        local p = Path.new()
        p:moveTo(Vector.xy(x - 5, cy - 6))
        p:lineTo(Vector.xy(x - 10.5, cy))
        p:lineTo(Vector.xy(x - 5, cy + 6))
        p:moveTo(Vector.xy(x + 5, cy - 6))
        p:lineTo(Vector.xy(x + 10.5, cy))
        p:lineTo(Vector.xy(x + 5, cy + 6))
        r:drawPath(p, w)
    end
end

-- a ghost fingertip, for "do this" demos
function kit.finger(r: Renderer, x: number, y: number, a: number, pressed: boolean)
    if a <= 0.01 then
        return
    end
    r:save()
    r:modulateOpacity(a)
    r:drawPath(kit.circle(x + 3, y + 5, 19), kit.soft(kit.alpha(kit.INK, 0.25), 6))
    r:drawPath(kit.circle(x, y, if pressed then 16 else 19), kit.fill(kit.alpha(kit.SURFACE, 0.9)))
    r:drawPath(kit.circle(x, y, if pressed then 16 else 19), kit.stroke(kit.INK, 2.5))
    r:drawPath(kit.circle(x, y, 5), kit.fill(kit.INK))
    r:restore()
end

-- a gold-edged pill label
function kit.tag(r: Renderer, fonts: Fonts, s: string, x: number, y: number, k: number)
    if k <= 0.01 then
        return
    end
    local w = kit.width(fonts, s, fonts.body, 20) + 32
    local sc = kit.back(k)
    r:save()
    r:transform(Mat2D.withTranslation(x, y) * Mat2D.withScale(sc, sc))
    r:modulateOpacity(kit.clamp(k * 2, 0, 1))
    r:drawPath(kit.rrect(-w / 2 + 2, -17, w, 38, 19), kit.soft(kit.alpha(kit.INK, 0.16), 6))
    r:drawPath(kit.rrect(-w / 2, -19, w, 38, 19), kit.fill(kit.SURFACE))
    r:drawPath(kit.rrect(-w / 2, -19, w, 38, 19), kit.stroke(kit.GOLD, 2.5))
    kit.label(r, fonts, s, fonts.body, 20, kit.GOLD_DEEP, 0, 0, 0.5)
    r:restore()
end

-- a measuring bracket from a to b, with a label off to one side (nx, ny is the outward normal)
function kit.bracket(r: Renderer, fonts: Fonts, a: Vector, b: Vector, nx: number, ny: number, s: string, k: number, c: Color)
    if k <= 0 then
        return
    end
    local e = kit.ease(k)
    local bx, by = a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e
    local p = Path.new()
    p:moveTo(Vector.xy(a.x - nx * 8, a.y - ny * 8))
    p:lineTo(Vector.xy(a.x + nx * 8, a.y + ny * 8))
    p:moveTo(a)
    p:lineTo(Vector.xy(bx, by))
    if e > 0.98 then
        p:moveTo(Vector.xy(b.x - nx * 8, b.y - ny * 8))
        p:lineTo(Vector.xy(b.x + nx * 8, b.y + ny * 8))
    end
    r:drawPath(p, kit.stroke(c, 2.5))
    local lk = kit.clamp((k - 0.6) / 0.4, 0, 1)
    if lk > 0 then
        local mx, my = (a.x + b.x) / 2 + nx * 24, (a.y + b.y) / 2 + ny * 24
        r:save()
        r:modulateOpacity(lk)
        kit.label(r, fonts, s, fonts.display, 26, c, mx, my, 0.5)
        r:restore()
    end
end

-- Keypad: a number pad for "your turn" ---------------------------------------------------

export type Keypad = { value: string, x: number, y: number, msg: string, shakeT: number, okT: number, press: string, pressT: number }

local KEYS = { '1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok' }
local KW, KH, KG = 78, 50, 10

function kit.keypad(x: number, y: number): Keypad
    return { value = '', x = x, y = y, msg = '', shakeT = 0, okT = 0, press = '', pressT = 0 }
end

local function keyRect(kp: Keypad, i: number): (number, number)
    local col = (i - 1) % 3
    local row = math.floor((i - 1) / 3)
    return kp.x + 16 + col * (KW + KG), kp.y + 118 + row * (KH + KG)
end

function kit.keypadAdvance(kp: Keypad, dt: number)
    kp.shakeT = math.max(0, kp.shakeT - dt)
    kp.okT = math.max(0, kp.okT - dt * 0.7)
    kp.pressT = math.max(0, kp.pressT - dt * 6)
end

-- returns 'ok' when Check was pressed, '' otherwise
function kit.keypadDown(kp: Keypad, p: Vector): string
    for i, k in KEYS do
        local x, y = keyRect(kp, i)
        if p.x >= x and p.x <= x + KW and p.y >= y and p.y <= y + KH then
            kp.press, kp.pressT = k, 1
            if k == 'del' then
                kp.value = string.sub(kp.value, 1, math.max(0, #kp.value - 1))
            elseif k == 'ok' then
                return if #kp.value > 0 then 'ok' else ''
            elseif #kp.value < 6 then
                kp.value ..= k
            end
            kp.msg = ''
            return 'key'
        end
    end
    return ''
end

-- keyboard: digits, backspace, enter
function kit.keypadKey(kp: Keypad, code: number): string
    if code >= 320 and code <= 329 then
        code -= 272 -- the number pad's digits type like the top row's
    end
    if code >= 48 and code <= 57 then
        if #kp.value < 6 then
            kp.value ..= tostring(code - 48)
        end
        kp.msg = ''
        kp.press, kp.pressT = tostring(code - 48), 1
        return 'key'
    elseif code == 259 then
        kp.value = string.sub(kp.value, 1, math.max(0, #kp.value - 1))
        return 'key'
    elseif code == 257 or code == 335 then
        return if #kp.value > 0 then 'ok' else ''
    end
    return ''
end

function kit.keypadWrong(kp: Keypad, msg: string)
    kp.shakeT = 0.45
    kp.msg = msg
    kp.value = ''
end

function kit.keypadDraw(r: Renderer, fonts: Fonts, kp: Keypad, prompt: string, unit: string, t: number)
    local w, h = 16 * 2 + 3 * KW + 2 * KG, 118 + 4 * (KH + KG) + 6
    local sx = if kp.shakeT > 0 then math.sin(kp.shakeT * 60) * 9 * kp.shakeT / 0.45 else 0
    r:save()
    r:transform(Mat2D.withTranslation(sx, 0))
    r:drawPath(kit.rrect(kp.x + 3, kp.y + 8, w, h, 22), kit.soft(kit.alpha(kit.INK, 0.14), 18))
    r:drawPath(kit.rrect(kp.x, kp.y, w, h, 22), kit.fill(kit.SURFACE))
    r:drawPath(kit.rrect(kp.x, kp.y, w, h, 22), kit.stroke(kit.LINE, 1.5))
    kit.label(r, fonts, prompt, fonts.body, 15, kit.INK_SOFT, kp.x + 18, kp.y + 24, 0)
    -- the display
    local ok = kp.okT > 0
    local dc = if ok then kit.ACCENT_WASH elseif kp.shakeT > 0 then Color.rgb(253, 236, 228) else kit.PAGE
    r:drawPath(kit.rrect(kp.x + 16, kp.y + 42, w - 32, 60, 14), kit.fill(dc))
    r:drawPath(kit.rrect(kp.x + 16, kp.y + 42, w - 32, 60, 14), kit.stroke(if ok then kit.ACCENT elseif kp.shakeT > 0 then kit.RED else kit.LINE, 2))
    local shown = if #kp.value > 0 then kp.value else '?'
    local vw = kit.label(r, fonts, shown, fonts.display, 34, if #kp.value > 0 then kit.INK else kit.INK_FAINT, kp.x + w - 34 - kit.width(fonts, unit, fonts.body, 17) - 8, kp.y + 72, 1)
    kit.label(r, fonts, unit, fonts.body, 17, kit.INK_SOFT, kp.x + w - 32, kp.y + 74, 1)
    if #kp.value > 0 and not ok then
        local cx = kp.x + w - 34 - kit.width(fonts, unit, fonts.body, 17) - 4
        local blink = (math.floor(t * 2) % 2 == 0)
        if blink then
            r:drawPath(kit.line(cx, kp.y + 56, cx, kp.y + 88), kit.stroke(kit.ACCENT, 2))
        end
    end
    local _ = vw
    for i, k in KEYS do
        local x, y = keyRect(kp, i)
        local down = kp.press == k and kp.pressT > 0
        local dy = if down then 2 else 0
        local primary = k == 'ok'
        r:drawPath(kit.rrect(x, y + 3, KW, KH, 14), kit.fill(kit.alpha(kit.INK, if primary then 0.2 else 0.08)))
        r:drawPath(kit.rrect(x, y + dy, KW, KH, 14), kit.fill(if primary then kit.ACCENT else (if down then kit.ACCENT_WASH else kit.PAGE)))
        if k == 'del' then
            local cx, cy = x + KW / 2, y + KH / 2 + dy
            local p = Path.new()
            p:moveTo(Vector.xy(cx - 14, cy))
            p:lineTo(Vector.xy(cx - 6, cy - 9))
            p:lineTo(Vector.xy(cx + 13, cy - 9))
            p:lineTo(Vector.xy(cx + 13, cy + 9))
            p:lineTo(Vector.xy(cx - 6, cy + 9))
            p:close()
            r:drawPath(p, kit.stroke(kit.INK_SOFT, 2.2))
            r:drawPath(kit.line(cx - 1, cy - 4, cx + 7, cy + 4), kit.stroke(kit.INK_SOFT, 2.2))
            r:drawPath(kit.line(cx + 7, cy - 4, cx - 1, cy + 4), kit.stroke(kit.INK_SOFT, 2.2))
        elseif k == 'ok' then
            kit.label(r, fonts, 'Check', fonts.body, 18, kit.SURFACE, x + KW / 2, y + KH / 2 + dy, 0.5)
        else
            kit.label(r, fonts, k, fonts.display, 24, kit.INK, x + KW / 2, y + KH / 2 + dy, 0.5)
        end
    end
    if kp.msg ~= '' then
        kit.label(r, fonts, kp.msg, fonts.body, 15, kit.RED, kp.x + w / 2, kp.y + h + 18, 0.5)
    end
    r:restore()
end

-- Choices: a row of answer buttons ------------------------------------------------------------

export type Choice = { label: string, value: number, out: boolean, x: number, y: number, w: number }

function kit.choices(fonts: Fonts, labels: { string }, values: { number }, cx: number, y: number): { Choice }
    local list: { Choice } = {}
    local total = 0
    for i, s in labels do
        local w = kit.width(fonts, s, fonts.display, 24) + 56
        table.insert(list, { label = s, value = values[i], out = false, x = 0, y = y, w = w })
        total += w
    end
    total += (#list - 1) * 16
    local x = cx - total / 2
    for _, c in list do
        c.x = x
        x += c.w + 16
    end
    return list
end

function kit.choiceHit(list: { Choice }, p: Vector): Choice?
    for _, c in list do
        if not c.out and p.x >= c.x and p.x <= c.x + c.w and p.y >= c.y and p.y <= c.y + 56 then
            return c
        end
    end
    return nil
end

function kit.choicesDraw(r: Renderer, fonts: Fonts, list: { Choice }, hover: Vector, picked: number, t: number)
    for i, c in list do
        local over = hover.x >= c.x and hover.x <= c.x + c.w and hover.y >= c.y and hover.y <= c.y + 56 and not c.out
        local isPick = picked == c.value
        local float = if c.out then 0 else math.sin(t * 2.2 + i) * 2
        local y = c.y + float - (if over then 3 else 0)
        r:save()
        r:modulateOpacity(if c.out then 0.35 else 1)
        r:drawPath(kit.rrect(c.x + 2, y + 6, c.w, 56, 28), kit.soft(kit.alpha(kit.INK, 0.16), 8))
        local bg = if isPick then kit.ACCENT elseif over then kit.GOLD_WASH else kit.SURFACE
        r:drawPath(kit.rrect(c.x, y, c.w, 56, 28), kit.fill(bg))
        r:drawPath(kit.rrect(c.x, y, c.w, 56, 28), kit.stroke(if isPick then kit.ACCENT else (if over then kit.GOLD else kit.LINE), 2))
        kit.label(r, fonts, c.label, fonts.display, 24, if isPick then kit.SURFACE else kit.INK, c.x + c.w / 2, y + 28, 0.5)
        if c.out then
            r:drawPath(kit.line(c.x + 18, y + 28, c.x + c.w - 18, y + 28), kit.stroke(kit.RED, 2.5))
        end
        r:restore()
    end
end

-- The land sign: a counter in a gold-edged board, top right of the board -------------------------

function kit.sign(r: Renderer, fonts: Fonts, title: string, value: string, pop: number, x: number, y: number)
    local sc = 1 + 0.12 * math.sin(kit.clamp(pop, 0, 1) * math.pi)
    local w, h = 210, 84
    r:save()
    r:transform(Mat2D.withTranslation(x + w / 2, y + h / 2) * Mat2D.withScale(sc, sc) * Mat2D.withTranslation(-w / 2, -h / 2))
    r:drawPath(kit.rrect(3, 8, w, h, 16), kit.soft(kit.alpha(kit.INK, 0.16), 12))
    r:drawPath(kit.rrect(0, 0, w, h, 16), kit.fill(kit.SURFACE))
    r:drawPath(kit.rrect(0, 0, w, h, 16), kit.stroke(kit.GOLD, 3))
    kit.label(r, fonts, title, fonts.mono, 12, kit.INK_SOFT, w / 2, 22, 0.5)
    kit.label(r, fonts, value, fonts.display, 30, kit.INK, w / 2, 56, 0.5)
    r:restore()
end

-- a rule card ("area = base × height") that rises in
function kit.rule(r: Renderer, fonts: Fonts, rule: string, note: string, k: number, cx: number, y: number)
    if k <= 0 then
        return
    end
    local e = kit.back(k)
    local w = math.max(kit.width(fonts, rule, fonts.display, 34), kit.width(fonts, note, fonts.body, 17)) + 64
    r:save()
    r:modulateOpacity(kit.clamp(k * 2, 0, 1))
    r:transform(Mat2D.withTranslation(0, (1 - e) * 24))
    r:drawPath(kit.rrect(cx - w / 2 + 3, y + 8, w, 96, 20), kit.soft(kit.alpha(kit.INK, 0.14), 14))
    r:drawPath(kit.rrect(cx - w / 2, y, w, 96, 20), kit.fill(kit.ACCENT_WASH))
    r:drawPath(kit.rrect(cx - w / 2, y, w, 96, 20), kit.stroke(kit.alpha(kit.ACCENT, 0.4), 2))
    kit.label(r, fonts, rule, fonts.display, 34, kit.ACCENT_DEEP, cx, y + 38, 0.5)
    kit.label(r, fonts, note, fonts.body, 17, kit.INK_SOFT, cx, y + 74, 0.5)
    r:restore()
end

-- a tree that sways
function kit.tree(r: Renderer, x: number, y: number, s: number, t: number)
    r:drawPath(kit.ellipse(x + 8 * s, y + 1, 34 * s, 7 * s), kit.fill(kit.alpha(kit.INK, 0.1)))
    r:drawPath(kit.rrect(x - 5 * s, y - 36 * s, 10 * s, 37 * s, 4 * s), kit.fill(kit.SOIL))
    r:save()
    r:transform(Mat2D.withTranslation(x, y - 34 * s) * Mat2D.withRotation(math.sin(t * 1.3 + x) * 0.03) * Mat2D.withTranslation(-x, -(y - 34 * s)))
    r:drawPath(kit.circle(x - 19 * s, y - 46 * s, 21 * s), kit.fill(kit.ACCENT))
    r:drawPath(kit.circle(x + 19 * s, y - 48 * s, 22 * s), kit.fill(kit.ACCENT))
    r:drawPath(kit.circle(x, y - 64 * s, 28 * s), kit.fill(Color.rgb(46, 125, 60)))
    r:drawPath(kit.circle(x - 9 * s, y - 73 * s, 12 * s), kit.fill(kit.alpha(kit.SURFACE, 0.16)))
    r:restore()
end

-- hit test for a rectangle
function kit.inRect(p: Vector, x: number, y: number, w: number, h: number): boolean
    return p.x >= x and p.x <= x + w and p.y >= y and p.y <= y + h
end

return kit
