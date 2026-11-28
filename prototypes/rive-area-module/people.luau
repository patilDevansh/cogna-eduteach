-- The people in the Area lessons: seven young people and the adults they work with
-- (see prototypes/school-pilot-student-trail/CAST_AND_STORIES.md for who they are and why).
--
--   people.CAST[name] -> Look           how someone looks: skin, hair, clothes, glasses, hearing aid,
--                                       helmet, age, and a wheelchair for Imran
--   people.new(look, x?) -> Person      off stage on the left (or at x); set .tx to move them, .mood to act
--   people.advance(p, dt, t)            every frame
--   people.draw(r, fonts, p, t)         every frame
--   people.speak(p, line1, line2?)      a speech bubble;  people.hush(p) takes it away
--
-- Moods: 'idle' · 'wave' · 'puzzled' (hand to head, a question mark) · 'watch' (leans in, eyes on
-- .lookX/.lookY) · 'point' · 'cheer' (both arms up, hopping) · 'think' (hand to chin).
-- Everyone is drawn front-on from the same rig, so they share one way of moving; what differs is the
-- person. No costume shorthand: everyday clothes, real hair, many skin tones.

local kit = require('kit')

local P = {}

local OUT = Color.rgb(74, 44, 18) -- the outline brown Maji is drawn with
local MOUTH_IN = Color.rgb(150, 54, 44)

export type Look = {
    name: string,
    skin: Color,
    hair: string, -- 'short' · 'wavy' · 'curly' · 'braid' · 'twobraids' · 'ponytail' · 'bob' · 'silverknot' · 'covered'
    hairColor: Color,
    top: string, -- 'tee' · 'jersey' · 'hoodie' · 'puffer' · 'jacket' · 'kurta' · 'saree' · 'shirt'
    topColor: Color,
    trim: Color,
    number: string?, -- on a jersey
    bottom: string, -- 'shorts' · 'trousers' · 'skirt' · 'saree'
    bottomColor: Color,
    shoes: Color,
    scale: number, -- 1 for adults, about 0.86 for 13-year-olds
    kid: boolean,
    elder: boolean?,
    glasses: boolean?,
    hearingAid: boolean?,
    helmet: string?, -- 'skate' · 'hard'
    helmetColor: Color?,
    kneepads: boolean?,
    dupatta: Color?, -- a scarf across the shoulders (or over the head with hair = 'covered')
    wheelchair: boolean?,
    chairColor: Color?,
}

local function look(t: Look): Look
    return t
end

local CAST: { [string]: Look } = {
    -- Day 3 · Mylapore, Chennai
    kavin = look({ name = 'Kavin', skin = Color.rgb(146, 94, 60), hair = 'wavy', hairColor = Color.rgb(30, 22, 18),
        top = 'tee', topColor = Color.rgb(28, 146, 138), trim = Color.rgb(16, 104, 98), bottom = 'shorts',
        bottomColor = Color.rgb(108, 116, 122), shoes = Color.rgb(70, 78, 86), scale = 0.86, kid = true, glasses = true }),
    paati = look({ name = 'Meenakshi Paati', skin = Color.rgb(126, 80, 50), hair = 'silverknot', hairColor = Color.rgb(212, 212, 206),
        top = 'saree', topColor = Color.rgb(204, 132, 40), trim = Color.rgb(226, 178, 70), bottom = 'saree',
        bottomColor = Color.rgb(146, 34, 62), shoes = Color.rgb(120, 74, 30), scale = 0.94, kid = false, elder = true }),
    -- Day 4 · Leh, Ladakh
    tenzin = look({ name = 'Tenzin', skin = Color.rgb(222, 172, 128), hair = 'twobraids', hairColor = Color.rgb(26, 20, 18),
        top = 'puffer', topColor = Color.rgb(196, 58, 52), trim = Color.rgb(150, 36, 34), bottom = 'trousers',
        bottomColor = Color.rgb(46, 56, 92), shoes = Color.rgb(96, 64, 40), scale = 0.86, kid = true }),
    dolkar = look({ name = 'Dolkar', skin = Color.rgb(212, 158, 112), hair = 'ponytail', hairColor = Color.rgb(30, 24, 20),
        top = 'jacket', topColor = Color.rgb(96, 116, 62), trim = Color.rgb(66, 82, 40), bottom = 'trousers',
        bottomColor = Color.rgb(58, 56, 64), shoes = Color.rgb(84, 58, 36), scale = 1, kid = false }),
    -- Day 5 · Aizawl, Mizoram
    remi = look({ name = 'Remi', skin = Color.rgb(232, 190, 148), hair = 'ponytail', hairColor = Color.rgb(34, 24, 20),
        top = 'jersey', topColor = Color.rgb(26, 126, 76), trim = Color.rgb(250, 250, 246), number = '9', bottom = 'shorts',
        bottomColor = Color.rgb(34, 38, 44), shoes = Color.rgb(240, 240, 236), scale = 0.88, kid = true, hearingAid = true }),
    -- Day 6 · a village skatepark in Madhya Pradesh
    kiran = look({ name = 'Kiran', skin = Color.rgb(118, 74, 44), hair = 'short', hairColor = Color.rgb(24, 18, 16),
        top = 'tee', topColor = Color.rgb(242, 194, 62), trim = Color.rgb(196, 146, 30), bottom = 'trousers',
        bottomColor = Color.rgb(138, 126, 94), shoes = Color.rgb(50, 54, 60), scale = 0.86, kid = true,
        helmet = 'skate', helmetColor = Color.rgb(236, 112, 44), kneepads = true }),
    saroj = look({ name = 'Saroj', skin = Color.rgb(138, 90, 58), hair = 'short', hairColor = Color.rgb(64, 60, 58),
        top = 'shirt', topColor = Color.rgb(72, 112, 168), trim = Color.rgb(48, 80, 128), bottom = 'trousers',
        bottomColor = Color.rgb(110, 84, 58), shoes = Color.rgb(70, 50, 34), scale = 1, kid = false }),
    -- Day 7 · Pune
    imran = look({ name = 'Imran', skin = Color.rgb(174, 118, 80), hair = 'curly', hairColor = Color.rgb(28, 20, 18),
        top = 'hoodie', topColor = Color.rgb(108, 74, 168), trim = Color.rgb(78, 50, 128), bottom = 'trousers',
        bottomColor = Color.rgb(52, 80, 130), shoes = Color.rgb(244, 244, 240), scale = 0.86, kid = true,
        wheelchair = true, chairColor = Color.rgb(46, 52, 60) }),
    -- Day 8 · Ranchi, Jharkhand
    birsa = look({ name = 'Birsa', skin = Color.rgb(104, 64, 40), hair = 'short', hairColor = Color.rgb(20, 16, 14),
        top = 'tee', topColor = Color.rgb(228, 118, 48), trim = Color.rgb(176, 80, 28), bottom = 'shorts',
        bottomColor = Color.rgb(46, 84, 64), shoes = Color.rgb(80, 60, 44), scale = 0.86, kid = true }),
    phulmani = look({ name = 'Phulmani Oraon', skin = Color.rgb(98, 60, 38), hair = 'bob', hairColor = Color.rgb(22, 18, 16),
        top = 'saree', topColor = Color.rgb(222, 92, 62), trim = Color.rgb(250, 214, 96), bottom = 'saree',
        bottomColor = Color.rgb(36, 136, 88), shoes = Color.rgb(90, 64, 42), scale = 1, kid = false,
        helmet = 'hard', helmetColor = Color.rgb(250, 202, 46) }),
    -- Day 9 · Ahmedabad
    fiza = look({ name = 'Fiza', skin = Color.rgb(196, 140, 98), hair = 'braid', hairColor = Color.rgb(26, 20, 18),
        top = 'kurta', topColor = Color.rgb(220, 80, 118), trim = Color.rgb(166, 46, 84), bottom = 'trousers',
        bottomColor = Color.rgb(240, 228, 206), shoes = Color.rgb(150, 96, 60), scale = 0.86, kid = true,
        dupatta = Color.rgb(36, 150, 150) }),
    nani = look({ name = 'Nani', skin = Color.rgb(174, 120, 84), hair = 'covered', hairColor = Color.rgb(246, 244, 236),
        top = 'kurta', topColor = Color.rgb(146, 126, 188), trim = Color.rgb(108, 90, 150), bottom = 'trousers',
        bottomColor = Color.rgb(236, 232, 222), shoes = Color.rgb(120, 80, 50), scale = 0.92, kid = false, elder = true,
        glasses = true, dupatta = Color.rgb(246, 244, 236) }),
}
P.CAST = CAST

-- Paths -------------------------------------------------------------------------

-- A quadratic curve from a through control c to b, written as a cubic (quadTo does not draw as a curve here).
local function quad(p: Path, a: Vector, c: Vector, b: Vector)
    p:cubicTo(Vector.xy(a.x + (c.x - a.x) * 2 / 3, a.y + (c.y - a.y) * 2 / 3), Vector.xy(b.x + (c.x - b.x) * 2 / 3, b.y + (c.y - b.y) * 2 / 3), b)
end

local function curve(ax: number, ay: number, cx: number, cy: number, bx: number, by: number): Path
    local p = Path.new()
    p:moveTo(Vector.xy(ax, ay))
    quad(p, Vector.xy(ax, ay), Vector.xy(cx, cy), Vector.xy(bx, by))
    return p
end

local function outlined(r: Renderer, path: Path, c: Color, w: number)
    r:drawPath(path, kit.fill(c))
    r:drawPath(path, kit.stroke(OUT, w))
end

local function shade(c: Color, k: number): Color
    -- k < 1 darkens, k > 1 lightens, keeping the hue
    local function ch(v: number): number
        return if k <= 1 then v * k else v + (255 - v) * (k - 1)
    end
    return Color.rgb(math.floor(ch(Color.red(c) :: number)), math.floor(ch(Color.green(c) :: number)), math.floor(ch(Color.blue(c) :: number)))
end

-- The person ----------------------------------------------------------------------

export type Person = {
    look: Look,
    x: number,
    y: number,
    tx: number, -- where they are heading
    s: number,
    mood: string,
    lookX: number,
    lookY: number,
    -- eased pose
    armL: number,
    armR: number,
    bendL: number,
    bendR: number,
    tilt: number,
    mouth: number, -- -1 puzzled · 0 calm · 1 delighted
    lean: number,
    q: number,
    hop: number,
    hopV: number,
    hopWait: number,
    walk: number,
    walking: number,
    roll: number, -- wheel turn, for the wheelchair
    px: number,
    py: number,
    line1: string,
    line2: string,
    bubble: number,
    bubbleOn: boolean,
}

function P.new(lk: Look, x: number?): Person
    local sx = x or -120
    return {
        look = lk, x = sx, y = 0, tx = sx, s = lk.scale, mood = 'idle', lookX = 640, lookY = 340,
        armL = 0.2, armR = 0.2, bendL = 0.1, bendR = 0.1, tilt = 0, mouth = 0, lean = 0, q = 0,
        hop = 0, hopV = 0, hopWait = 0, walk = 0, walking = 0, roll = 0, px = 0, py = 0,
        line1 = '', line2 = '', bubble = 0, bubbleOn = false,
    }
end

function P.speak(p: Person, a: string, b: string?)
    p.line1 = a
    p.line2 = b or ''
    p.bubbleOn = true
end

function P.hush(p: Person)
    p.bubbleOn = false
end

function P.advance(p: Person, dt: number, t: number)
    local chair = p.look.wheelchair == true
    -- moving: walking on foot, or pushing the wheels
    local dx = p.tx - p.x
    if math.abs(dx) > 1.5 then
        local step = kit.clamp(dx, -210 * dt, 210 * dt)
        p.x += step
        p.walk += dt * (if chair then 7 else 11)
        p.roll += step / 30
        p.walking = kit.follow(p.walking, 1, 14, dt)
    else
        p.x = p.tx
        p.walking = kit.follow(p.walking, 0, 10, dt)
    end

    local aL, aR, bL, bR, tilt, mouth, lean, q = 0.2, 0.2, 0.1, 0.1, 0, 0.25, 0, 0
    if chair then
        aL, aR, bL, bR = 0.55, 0.55, 0.9, 0.9 -- hands resting on the push rims
    end
    local m = if p.walking > 0.5 then 'walk' else p.mood
    if m == 'walk' then
        if chair then
            -- both hands push the rims together
            local push = 0.5 + 0.5 * math.sin(p.walk)
            aL, aR, bL, bR = 0.35 + push * 0.5, 0.35 + push * 0.5, 0.7 + push * 0.4, 0.7 + push * 0.4
        else
            aL = 0.2 + math.sin(p.walk) * 0.5
            aR = 0.2 - math.sin(p.walk) * 0.5
        end
    elseif m == 'wave' then
        aR, bR = 2.5 + math.sin(t * 10) * 0.32, 0.45
        mouth = 1
    elseif m == 'puzzled' then
        aR, bR = 2.15, 1.95
        tilt, mouth, q = 0.12, -1, 1
    elseif m == 'think' then
        aR, bR = 1.1, 2.3
        tilt, mouth = -0.08, 0
    elseif m == 'watch' then
        if not chair then
            aL, aR = 0.3, 0.3
        end
        lean, mouth = 1, 0.35
    elseif m == 'point' then
        aR, bR = 1.4, 0.05
        mouth = 0.5
    elseif m == 'cheer' then
        aL, aR, bL, bR = 2.3 + math.sin(t * 12) * 0.14, 2.3 - math.sin(t * 12) * 0.14, 0.35, 0.35
        mouth = 1
    end
    p.armL = kit.follow(p.armL, aL, 11, dt)
    p.armR = kit.follow(p.armR, aR, 11, dt)
    p.bendL = kit.follow(p.bendL, bL, 11, dt)
    p.bendR = kit.follow(p.bendR, bR, 11, dt)
    p.tilt = kit.follow(p.tilt, tilt, 9, dt)
    p.mouth = kit.follow(p.mouth, mouth, 10, dt)
    p.lean = kit.follow(p.lean, lean, 7, dt)
    p.q = kit.follow(p.q, q, 12, dt)

    -- joy: hopping on foot, a little wheelie bounce in the chair
    p.hopWait -= dt
    if m == 'cheer' and p.hop <= 0 and p.hopWait <= 0 then
        p.hopV = if chair then 150 else 360
        p.hopWait = 0.62
    end
    if p.hop > 0 or p.hopV > 0 then
        p.hop += p.hopV * dt
        p.hopV -= 1700 * dt
        if p.hop <= 0 then
            p.hop, p.hopV = 0, 0
        end
    end

    -- eyes follow what they are looking at
    local ex, ey = p.lookX - p.x, p.lookY - (p.y - 125 * p.s)
    local d = math.max(1, math.sqrt(ex * ex + ey * ey))
    p.px = kit.follow(p.px, ex / d, 8, dt)
    p.py = kit.follow(p.py, ey / d, 8, dt)

    p.bubble = kit.follow(p.bubble, if p.bubbleOn then 1 else 0, 12, dt)
end

-- Parts ----------------------------------------------------------------------------

local function longSleeves(lk: Look): boolean
    return lk.top == 'hoodie' or lk.top == 'puffer' or lk.top == 'jacket' or lk.top == 'kurta'
end

-- One arm: shoulder, elbow, hand. a is the swing from straight down (pi is straight up); bend folds the forearm further.
local function arm(r: Renderer, lk: Look, side: number, a: number, bend: number, top: number)
    local sx, sy = side * 22, top + 12
    local ex, ey = sx + side * math.sin(a) * 23, sy + math.cos(a) * 23
    local a2 = a + bend
    local hx, hy = ex + side * math.sin(a2) * 21, ey + math.cos(a2) * 21
    local whole = kit.polyline({ Vector.xy(sx, sy), Vector.xy(ex, ey), Vector.xy(hx, hy) })
    local thick = if lk.top == 'puffer' then 15 else 10.5
    r:drawPath(whole, kit.stroke(OUT, thick + 5.5))
    if longSleeves(lk) then
        r:drawPath(whole, kit.stroke(lk.topColor, thick))
        -- the cuff
        r:drawPath(kit.circle(hx - side * math.sin(a2) * 4, hy - math.cos(a2) * 4, thick * 0.42), kit.fill(lk.trim))
    else
        r:drawPath(whole, kit.stroke(lk.skin, thick))
        local sleeve = kit.line(sx, sy, sx + (ex - sx) * 0.62, sy + (ey - sy) * 0.62)
        r:drawPath(sleeve, kit.stroke(OUT, 19))
        r:drawPath(sleeve, kit.stroke(if lk.top == 'saree' then lk.topColor else lk.topColor, 13.5))
    end
    outlined(r, kit.circle(hx, hy, 7), lk.skin, 2.6)
end

-- Legs for someone standing: shorts, trousers, a skirt or a saree; shoes.
local function legs(r: Renderer, lk: Look, stride: number)
    for i = -1, 1, 2 do
        local lift = math.max(0, stride * i) * 7
        local fwd = stride * i * 5
        if lk.bottom == 'shorts' then
            outlined(r, kit.rrect(i * 11 - 9 + fwd, -26 - lift, 18, 24, 7), lk.skin, 3)
            if lk.kneepads then
                r:drawPath(kit.ellipse(i * 11 + fwd, -20 - lift, 9, 6), kit.fill(Color.rgb(40, 44, 50)))
            end
        elseif lk.bottom == 'trousers' then
            outlined(r, kit.rrect(i * 11 - 9 + fwd, -44 - lift, 18, 42, 7), lk.bottomColor, 3)
            if lk.kneepads then
                r:drawPath(kit.ellipse(i * 11 + fwd, -22 - lift, 10, 7), kit.fill(Color.rgb(40, 44, 50)))
            end
        end
        outlined(r, kit.ellipse(i * 11 + fwd + 1, -3 - lift, 12, 5.5), lk.shoes, 2.6)
    end
    if lk.bottom == 'shorts' then
        local sh = Path.new()
        sh:moveTo(Vector.xy(-23, -46))
        sh:lineTo(Vector.xy(23, -46))
        sh:lineTo(Vector.xy(24, -24))
        sh:lineTo(Vector.xy(2, -24))
        sh:lineTo(Vector.xy(0, -34))
        sh:lineTo(Vector.xy(-2, -24))
        sh:lineTo(Vector.xy(-24, -24))
        sh:close()
        outlined(r, sh, lk.bottomColor, 3)
    elseif lk.bottom == 'skirt' then
        outlined(r, kit.poly({ Vector.xy(-22, -46), Vector.xy(22, -46), Vector.xy(30, -18), Vector.xy(-30, -18) }), lk.bottomColor, 3)
    elseif lk.bottom == 'saree' then
        local sk = kit.poly({ Vector.xy(-23, -48), Vector.xy(23, -48), Vector.xy(30, -4), Vector.xy(-30, -4) })
        outlined(r, sk, lk.bottomColor, 3)
        -- pleats down the front, and the border at the hem
        for k = -1, 1 do
            r:drawPath(kit.line(k * 6, -40, k * 8, -6), kit.stroke(shade(lk.bottomColor, 0.78), 2.2))
        end
        r:drawPath(kit.line(-29, -8, 29, -8), kit.stroke(lk.trim, 4))
    end
end

-- The torso for each kind of top. top is the y of the shoulders' upper edge.
local function torso(r: Renderer, lk: Look, top: number, fonts: kit.Fonts)
    local c, tr = lk.topColor, lk.trim
    if lk.top == 'kurta' then
        outlined(r, kit.rrect(-26, top, 52, 82, 16), c, 3)
        r:drawPath(kit.line(0, top + 2, 0, top + 30), kit.stroke(tr, 3))
        r:drawPath(kit.line(-26, top + 70, -26, top + 80), kit.stroke(kit.SURFACE, 2))
        r:drawPath(kit.line(-20, top + 77, 20, top + 77), kit.stroke(tr, 3))
    elseif lk.top == 'puffer' then
        outlined(r, kit.rrect(-29, top - 2, 58, 66, 20), c, 3)
        for k = 1, 3 do
            r:drawPath(curve(-27, top + k * 16, 0, top + k * 16 + 4, 27, top + k * 16), kit.stroke(tr, 2.2))
        end
        outlined(r, kit.rrect(-14, top - 8, 28, 12, 6), tr, 2.4) -- a high collar
        r:drawPath(kit.line(0, top + 2, 0, top + 62), kit.stroke(shade(tr, 0.8), 2))
    elseif lk.top == 'jacket' then
        outlined(r, kit.rrect(-26, top, 52, 64, 14), c, 3)
        r:drawPath(kit.polyline({ Vector.xy(-12, top + 1), Vector.xy(0, top + 20), Vector.xy(12, top + 1) }), kit.stroke(tr, 3))
        r:drawPath(kit.line(0, top + 20, 0, top + 62), kit.stroke(tr, 2.4))
        outlined(r, kit.rrect(-20, top + 30, 13, 11, 3), shade(c, 0.9), 2)
        outlined(r, kit.rrect(7, top + 30, 13, 11, 3), shade(c, 0.9), 2)
    elseif lk.top == 'hoodie' then
        outlined(r, kit.rrect(-26, top, 52, 64, 16), c, 3)
        outlined(r, kit.rrect(-15, top + 34, 30, 16, 6), shade(c, 0.88), 2.2) -- pocket
        r:drawPath(kit.line(-5, top + 4, -6, top + 20), kit.stroke(kit.SURFACE, 2.4)) -- drawstrings
        r:drawPath(kit.line(5, top + 4, 6, top + 20), kit.stroke(kit.SURFACE, 2.4))
    elseif lk.top == 'saree' then
        -- the blouse, then the pallu across the chest and over the left shoulder
        outlined(r, kit.rrect(-24, top, 48, 34, 14), c, 3)
        r:drawPath(kit.rrect(-22, top + 32, 44, 18, 6), kit.fill(lk.skin))
        local pallu = kit.poly({ Vector.xy(-25, top - 2), Vector.xy(-6, top - 4), Vector.xy(26, top + 44), Vector.xy(24, top + 54), Vector.xy(6, top + 54) })
        outlined(r, pallu, lk.bottomColor, 3)
        r:drawPath(kit.line(-6, top - 3, 25, top + 47), kit.stroke(tr, 3.4))
    else
        -- tee, jersey, shirt
        outlined(r, kit.rrect(-25, top, 50, 62, 17), c, 3)
        if lk.top == 'shirt' then
            r:drawPath(kit.polyline({ Vector.xy(-11, top + 1), Vector.xy(0, top + 12), Vector.xy(11, top + 1) }), kit.stroke(tr, 3))
            r:drawPath(kit.line(0, top + 12, 0, top + 58), kit.stroke(tr, 2))
            for k = 0, 2 do
                r:drawPath(kit.circle(0, top + 22 + k * 12, 1.8), kit.fill(tr))
            end
        else
            r:drawPath(curve(-10, top + 2, 0, top + 12, 10, top + 2), kit.stroke(tr, 3))
        end
        if lk.top == 'jersey' then
            r:drawPath(kit.line(-23, top + 10, -23, top + 58), kit.stroke(tr, 3))
            r:drawPath(kit.line(23, top + 10, 23, top + 58), kit.stroke(tr, 3))
            if lk.number then
                kit.label(r, fonts, lk.number, fonts.display, 24, tr, 0, top + 34, 0.5)
            end
        end
    end
    if lk.dupatta then
        -- a scarf over both shoulders, ends hanging down the front
        local d = lk.dupatta
        r:drawPath(curve(-26, top + 6, 0, top + 18, 26, top + 6), kit.stroke(OUT, 12))
        r:drawPath(curve(-26, top + 6, 0, top + 18, 26, top + 6), kit.stroke(d, 8))
        outlined(r, kit.rrect(-30, top + 4, 10, 46, 4), d, 2.4)
        outlined(r, kit.rrect(20, top + 4, 10, 46, 4), d, 2.4)
    end
end

-- Hair behind the head (drawn before it)
local function hairBack(r: Renderer, lk: Look, HY: number, t: number)
    local c = lk.hairColor
    if lk.hair == 'curly' then
        outlined(r, kit.circle(0, HY - 4, 40), c, 3)
    elseif lk.hair == 'bob' then
        outlined(r, kit.rrect(-38, HY - 36, 76, 64, 26), c, 3)
    elseif lk.hair == 'ponytail' then
        local sw = math.sin(t * 2.4) * 4
        local tail = Path.new()
        tail:moveTo(Vector.xy(20, HY - 20))
        tail:cubicTo(Vector.xy(52 + sw, HY - 18), Vector.xy(54 + sw, HY + 16), Vector.xy(40 + sw, HY + 34))
        tail:cubicTo(Vector.xy(44 + sw, HY + 10), Vector.xy(36, HY - 6), Vector.xy(20, HY - 6))
        tail:close()
        outlined(r, tail, c, 3)
    elseif lk.hair == 'silverknot' then
        outlined(r, kit.circle(26, HY + 14, 11), c, 2.6) -- a low knot at the nape
    elseif lk.hair == 'covered' then
        -- the scarf falls behind the head to the shoulders
        outlined(r, kit.rrect(-40, HY - 40, 80, 96, 30), c, 3)
    end
end

-- Hair over the head (drawn after it)
local function hairFront(r: Renderer, lk: Look, HY: number)
    local c = lk.hairColor
    if lk.hair == 'covered' then
        local f = Path.new()
        f:moveTo(Vector.xy(-36, HY + 22))
        f:cubicTo(Vector.xy(-42, HY - 44), Vector.xy(42, HY - 44), Vector.xy(36, HY + 22))
        f:cubicTo(Vector.xy(30, HY - 24), Vector.xy(-30, HY - 24), Vector.xy(-36, HY + 22))
        f:close()
        outlined(r, f, c, 3)
        return
    end
    -- a cap of hair with a hairline that suits the style
    local cap = Path.new()
    cap:moveTo(Vector.xy(-34, HY - 2))
    cap:cubicTo(Vector.xy(-38, HY - 40), Vector.xy(-12, HY - 46), Vector.xy(2, HY - 45))
    cap:cubicTo(Vector.xy(28, HY - 44), Vector.xy(40, HY - 30), Vector.xy(34, HY - 2))
    if lk.hair == 'wavy' then
        cap:cubicTo(Vector.xy(26, HY - 22), Vector.xy(16, HY - 10), Vector.xy(8, HY - 22))
        cap:cubicTo(Vector.xy(0, HY - 10), Vector.xy(-10, HY - 26), Vector.xy(-16, HY - 16))
        cap:cubicTo(Vector.xy(-22, HY - 8), Vector.xy(-30, HY - 18), Vector.xy(-34, HY - 2))
    elseif lk.hair == 'short' then
        cap:cubicTo(Vector.xy(26, HY - 16), Vector.xy(10, HY - 22), Vector.xy(-2, HY - 20))
        cap:cubicTo(Vector.xy(-16, HY - 18), Vector.xy(-30, HY - 14), Vector.xy(-34, HY - 2))
    elseif lk.hair == 'bob' then
        cap:cubicTo(Vector.xy(24, HY - 12), Vector.xy(14, HY - 20), Vector.xy(2, HY - 14))
        cap:cubicTo(Vector.xy(-10, HY - 20), Vector.xy(-24, HY - 12), Vector.xy(-34, HY - 2))
    else
        -- a centre parting: braids, ponytail, the silver knot
        cap:cubicTo(Vector.xy(24, HY - 22), Vector.xy(8, HY - 30), Vector.xy(1, HY - 40))
        cap:cubicTo(Vector.xy(-6, HY - 30), Vector.xy(-24, HY - 22), Vector.xy(-34, HY - 2))
    end
    cap:close()
    if lk.hair == 'curly' then
        for k = -3, 3 do
            outlined(r, kit.circle(k * 10, HY - 34 + math.abs(k) * 4, 11), c, 2.4)
        end
        return
    end
    outlined(r, cap, c, 3)
    r:drawPath(curve(-20, HY - 34, -4, HY - 42, 14, HY - 38), kit.stroke(kit.alpha(kit.SURFACE, 0.18), 3))
end

-- Braids lie over the shoulders, so they are drawn after the body
local function braids(r: Renderer, lk: Look, HY: number)
    local function plait(x: number, sway: number)
        for k = 0, 4 do
            outlined(r, kit.ellipse(x + sway * k, HY + 22 + k * 11, 6.5, 7), lk.hairColor, 2)
        end
        r:drawPath(kit.circle(x + sway * 5, HY + 76, 4), kit.fill(Color.rgb(220, 70, 90)))
    end
    if lk.hair == 'twobraids' then
        plait(-27, -0.6)
        plait(27, 0.6)
    elseif lk.hair == 'braid' then
        plait(26, 0.8)
    end
end

local function helmet(r: Renderer, lk: Look, HY: number)
    local c = lk.helmetColor or kit.GOLD
    if lk.helmet == 'skate' then
        local dome = Path.new()
        dome:moveTo(Vector.xy(-37, HY - 14))
        dome:cubicTo(Vector.xy(-40, HY - 58), Vector.xy(40, HY - 58), Vector.xy(37, HY - 14))
        dome:close()
        outlined(r, dome, c, 3.2)
        for k = -1, 1 do
            r:drawPath(kit.line(k * 12, HY - 44, k * 14, HY - 28), kit.stroke(shade(c, 0.7), 3))
        end
        r:drawPath(curve(-33, HY - 12, -31, HY + 12, -20, HY + 26), kit.stroke(OUT, 2.4)) -- strap
        r:drawPath(curve(33, HY - 12, 31, HY + 12, 20, HY + 26), kit.stroke(OUT, 2.4))
    elseif lk.helmet == 'hard' then
        local dome = Path.new()
        dome:moveTo(Vector.xy(-33, HY - 10))
        dome:cubicTo(Vector.xy(-34, HY - 54), Vector.xy(34, HY - 54), Vector.xy(33, HY - 10))
        dome:close()
        outlined(r, dome, c, 3.2)
        r:drawPath(kit.line(0, HY - 47, 0, HY - 12), kit.stroke(shade(c, 0.78), 4))
        outlined(r, kit.rrect(-44, HY - 13, 88, 8, 4), c, 2.6) -- brim
    end
end

local function face(r: Renderer, p: Person, HY: number, t: number)
    local lk = p.look
    -- eyes: open and following, or squeezed into happy arcs
    local blink = if (t % 3.7) < 0.13 then 0.12 else 1
    local joy = kit.clamp((p.mouth - 0.6) / 0.3, 0, 1)
    local EY = HY + 1
    for i = -1, 1, 2 do
        local ex = i * 13
        if joy > 0.5 then
            r:drawPath(curve(ex - 7, EY + 2, ex, EY - 8, ex + 7, EY + 2), kit.stroke(OUT, 3.4))
        else
            outlined(r, kit.ellipse(ex, EY, 7.6, 9 * blink), kit.SURFACE, 2.4)
            if blink > 0.5 then
                r:drawPath(kit.circle(ex + p.px * 2.8, EY + p.py * 2.6, 4), kit.fill(OUT))
                r:drawPath(kit.circle(ex + p.px * 2.8 - 1.2, EY + p.py * 2.6 - 1.5, 1.3), kit.fill(kit.SURFACE))
            end
        end
    end
    if lk.glasses then
        local frame = kit.stroke(Color.rgb(40, 40, 44), 2.6)
        r:drawPath(kit.circle(-13, EY, 11), frame)
        r:drawPath(kit.circle(13, EY, 11), frame)
        r:drawPath(kit.line(-2, EY - 1, 2, EY - 1), frame)
    end
    -- brows: level, or one cocked when puzzled
    local cock = kit.clamp(-p.mouth, 0, 1)
    local bw = if lk.kid then 3 else 3.6
    r:drawPath(kit.line(-21, EY - 15, -7, EY - 16 + cock * 3), kit.stroke(shade(lk.hairColor, if lk.elder then 0.8 else 1), bw))
    r:drawPath(kit.line(7, EY - 16 - cock * 5, 21, EY - 15 - cock * 8), kit.stroke(shade(lk.hairColor, if lk.elder then 0.8 else 1), bw))
    if lk.elder then
        -- smile lines
        r:drawPath(curve(-24, EY + 10, -27, EY + 16, -23, EY + 21), kit.stroke(kit.alpha(OUT, 0.35), 1.8))
        r:drawPath(curve(24, EY + 10, 27, EY + 16, 23, EY + 21), kit.stroke(kit.alpha(OUT, 0.35), 1.8))
    end
    -- mouth: while their speech bubble is up, it opens and closes as they talk
    local MY = HY + 19
    if p.bubbleOn and p.bubble > 0.5 and p.mouth > -0.4 then
        local open = 0.5 + 0.5 * math.sin(t * 13 + math.sin(t * 5) * 2)
        outlined(r, kit.ellipse(0, MY + 5, 7, 2 + open * 6), MOUTH_IN, 2.4)
    elseif p.mouth > 0.6 then
        local mo = Path.new()
        mo:moveTo(Vector.xy(-10, MY))
        quad(mo, Vector.xy(-10, MY), Vector.xy(0, MY + 17 + joy * 3), Vector.xy(10, MY))
        mo:close()
        outlined(r, mo, MOUTH_IN, 2.6)
    elseif p.mouth < -0.4 then
        outlined(r, kit.ellipse(1, MY + 5, 4, 3.6), MOUTH_IN, 2.4)
    else
        r:drawPath(curve(-7, MY + 3, 0, MY + 9, 7, MY + 3), kit.stroke(OUT, 2.8))
    end
end

-- The wheelchair, seen from the front: two big wheels beside the hips, a seat, a footplate, casters.
local SEAT = -32 -- the seat, in the chair

local function chairBack(r: Renderer, lk: Look, roll: number)
    local c = lk.chairColor or Color.rgb(46, 52, 60)
    -- the backrest and push handles, behind the shoulders
    r:drawPath(kit.line(-30, SEAT - 66, -30, SEAT), kit.stroke(c, 5))
    r:drawPath(kit.line(30, SEAT - 66, 30, SEAT), kit.stroke(c, 5))
    r:drawPath(kit.line(-30, SEAT - 66, -38, SEAT - 70), kit.stroke(c, 5))
    r:drawPath(kit.line(30, SEAT - 66, 38, SEAT - 70), kit.stroke(c, 5))
    outlined(r, kit.rrect(-30, SEAT - 62, 60, 44, 8), shade(c, 1.45), 2.4)
end

-- The big wheels stand beside the hips (we see them edge-on, so they are narrow), with turning spokes.
local function chairWheels(r: Renderer, lk: Look, roll: number)
    local c = lk.chairColor or Color.rgb(46, 52, 60)
    for i = -1, 1, 2 do
        local wx, wy = i * 44, SEAT + 2
        outlined(r, kit.ellipse(wx, wy, 11, 31), Color.rgb(58, 62, 70), 2.6)
        r:drawPath(kit.ellipse(wx, wy, 5, 25), kit.stroke(Color.rgb(196, 202, 210), 2.2)) -- push rim
        for k = 0, 2 do
            local spin = math.sin(roll * 2 + k * 2.1 + i)
            r:drawPath(kit.line(wx, wy - 26 * spin, wx, wy + 26 * spin), kit.stroke(kit.alpha(kit.SURFACE, 0.5), 1.4))
        end
        -- frame from the seat down to the front caster
        r:drawPath(kit.line(i * 26, SEAT + 2, i * 22, -8), kit.stroke(c, 4))
        outlined(r, kit.ellipse(i * 22, -6, 5, 6), Color.rgb(58, 62, 70), 2)
    end
    outlined(r, kit.rrect(-16, -10, 32, 6, 3), c, 2) -- footplate
end

-- Seated legs: thighs come forward over the seat (short, seen end-on), shins down to the footplate.
local function seatedLegs(r: Renderer, lk: Look)
    for i = -1, 1, 2 do
        outlined(r, kit.rrect(i * 9 - 8, SEAT + 4, 16, 26, 6), lk.bottomColor, 3) -- shin
        outlined(r, kit.ellipse(i * 9, -10, 10, 5), lk.shoes, 2.4)
        outlined(r, kit.rrect(i * 12 - 11, SEAT - 10, 22, 18, 8), lk.bottomColor, 3) -- thigh
    end
end

function P.draw(r: Renderer, fonts: kit.Fonts, p: Person, t: number)
    local lk, s = p.look, p.s
    local chair = lk.wheelchair == true
    local stride = if chair then 0 else p.walking * math.sin(p.walk)
    local bob = if chair then 0 else p.walking * math.abs(math.sin(p.walk)) * 4

    -- shadow shrinks as they leave the ground
    local sh = 1 - kit.clamp(p.hop / 160, 0, 0.5)
    r:drawPath(kit.ellipse(p.x + 3, p.y + 3, (if chair then 56 else 40) * s * sh, 9 * s * sh), kit.soft(kit.alpha(kit.INK, 0.22), 6))

    r:save()
    r:transform(Mat2D.withTranslation(p.x, p.y - p.hop - bob) * Mat2D.withScale(s, s))
    local sq = kit.clamp(p.hopV / 2600, -0.1, 0.1)
    r:transform(Mat2D.withScale(1 - sq, 1 + sq))

    -- where the shoulders' top edge is: lower in the chair
    local top = if chair then SEAT - 56 else -96
    if chair then
        chairBack(r, lk, p.roll)
    else
        legs(r, lk, stride)
    end

    -- lean in toward what they are watching
    r:transform(Mat2D.withTranslation(0, top + 56) * Mat2D.withRotation(p.lean * 0.07 * (if p.px >= 0 then 1 else -1)) * Mat2D.withTranslation(0, -(top + 56)))
    local breath = 1 + 0.014 * math.sin(t * 2.3)
    local HY = top - 30

    hairBack(r, lk, HY, t)
    arm(r, lk, -1, p.armL, p.bendL, top)

    r:save()
    r:transform(Mat2D.withTranslation(0, top + 60) * Mat2D.withScale(1, breath) * Mat2D.withTranslation(0, -(top + 60)))
    torso(r, lk, top, fonts)
    r:restore()

    if chair then
        seatedLegs(r, lk) -- the thighs come forward over the bottom of the body
    end
    if lk.hair == 'twobraids' or lk.hair == 'braid' then
        braids(r, lk, HY)
    end
    arm(r, lk, 1, p.armR, p.bendR, top)
    if chair then
        chairWheels(r, lk, p.roll)
    end

    -- head, tilting from the neck: big, like Maji's, so a face reads from across a classroom
    r:save()
    r:transform(Mat2D.withTranslation(0, top + 2) * Mat2D.withRotation(p.tilt) * Mat2D.withTranslation(0, -(top + 2)))
    if lk.hair ~= 'covered' then
        outlined(r, kit.circle(-33, HY + 2, 7.5), lk.skin, 2.8)
        outlined(r, kit.circle(33, HY + 2, 7.5), lk.skin, 2.8)
    end
    if lk.hearingAid then
        local ha = Path.new()
        ha:moveTo(Vector.xy(38, HY - 6))
        ha:cubicTo(Vector.xy(46, HY - 6), Vector.xy(46, HY + 10), Vector.xy(38, HY + 12))
        r:drawPath(ha, kit.stroke(OUT, 6))
        r:drawPath(ha, kit.stroke(Color.rgb(98, 178, 214), 3.6))
    end
    outlined(r, kit.circle(0, HY, 33), lk.skin, 3.2)
    r:drawPath(kit.circle(-20, HY + 13, 7), kit.fill(kit.alpha(Color.rgb(226, 112, 92), 0.32)))
    r:drawPath(kit.circle(20, HY + 13, 7), kit.fill(kit.alpha(Color.rgb(226, 112, 92), 0.32)))
    if lk.helmet ~= 'hard' then
        hairFront(r, lk, HY)
    end
    helmet(r, lk, HY)
    face(r, p, HY, t)
    r:restore()
    r:restore()

    -- a question mark pops over their head when they are stuck
    local headTop = (HY - 40) * s
    if p.q > 0.02 then
        local qx, qy = p.x + 40 * s, p.y - p.hop + headTop - 26 + math.sin(t * 3) * 3
        local k = kit.back(p.q) * (1 - kit.clamp(p.bubble * 1.5, 0, 1)) -- a speech bubble takes its place
        r:drawPath(kit.circle(qx - 16 * s, qy + 22 * s, 4 * k), kit.fill(kit.SURFACE))
        r:drawPath(kit.circle(qx - 16 * s, qy + 22 * s, 4 * k), kit.stroke(kit.RED, 2))
        r:drawPath(kit.circle(qx, qy, 17 * k), kit.fill(kit.SURFACE))
        r:drawPath(kit.circle(qx, qy, 17 * k), kit.stroke(kit.RED, 3))
        if k > 0.6 then
            kit.label(r, fonts, '?', fonts.display, 22, kit.RED, qx, qy + 1, 0.5)
        end
    end

    -- what they say
    if p.bubble > 0.02 then
        local two = p.line2 ~= ''
        local w = math.max(kit.width(fonts, p.line1, fonts.display, 19), if two then kit.width(fonts, p.line2, fonts.display, 19) else 0) + 40
        local h = if two then 66 else 46
        local cx, btop = p.x + 54 * s, p.y - p.hop + headTop - 30 - h
        cx = kit.clamp(cx, kit.BX + w / 2 + 12, kit.BX + kit.BW - w / 2 - 12)
        local k = kit.back(p.bubble)
        r:save()
        r:modulateOpacity(kit.clamp(p.bubble * 1.6, 0, 1))
        r:transform(Mat2D.withTranslation(cx, btop + h) * Mat2D.withScale(k, k) * Mat2D.withTranslation(-cx, -(btop + h)))
        r:drawPath(kit.rrect(cx - w / 2 + 2, btop + 5, w, h, 16), kit.soft(kit.alpha(kit.INK, 0.16), 10))
        local tail = kit.poly({ Vector.xy(cx - 34, btop + h - 2), Vector.xy(cx - 12, btop + h - 2), Vector.xy(cx - 34, btop + h + 16) })
        r:drawPath(tail, kit.fill(kit.SURFACE))
        r:drawPath(tail, kit.stroke(kit.alpha(kit.INK, 0.35), 2.5)) -- a neutral edge: gold means "this moves"
        r:drawPath(kit.rrect(cx - w / 2, btop, w, h, 16), kit.fill(kit.SURFACE))
        r:drawPath(kit.rrect(cx - w / 2, btop, w, h, 16), kit.stroke(kit.alpha(kit.INK, 0.35), 2.5))
        r:drawPath(kit.line(cx - 32, btop + h - 1.5, cx - 15, btop + h - 1.5), kit.stroke(kit.SURFACE, 5))
        kit.label(r, fonts, p.line1, fonts.display, 19, kit.INK, cx, btop + (if two then 22 else 24), 0.5)
        if two then
            kit.label(r, fonts, p.line2, fonts.display, 19, kit.INK, cx, btop + 46, 0.5)
        end
        r:restore()
    end
end

return P
