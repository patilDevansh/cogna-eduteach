-- The world the Area lessons happen in: a living farm behind the board, the people who need the
-- student's help, and Maji (the lion cub who tells the lesson).
--
--   world.farm(r, t)                     sky, sun, drifting clouds, hills, a hut, birds, swaying grass
--   world.person() -> Person             Ramesh uncle; set .tx to walk him, .mood to change how he feels
--   world.personAdvance(p, dt, t)        every frame
--   world.personDraw(r, fonts, p, t)     every frame
--   world.speak(p, line1, line2?)        a speech bubble;  world.hush(p) takes it away
--   world.maji(r, img, sampler, x, y, h, t, mood)   one frame of Maji's sprite sheet
--
-- Moods: 'idle' · 'wave' · 'puzzled' (hand to head, a question mark) · 'watch' (leans in, eyes on
-- .lookX/.lookY) · 'point' · 'cheer' (both arms up, hopping). Everything eases between moods.

local kit = require('kit')

local W = {}

local TAU = math.pi * 2

local OUT = Color.rgb(74, 44, 18) -- the outline brown Maji is drawn with
local SKIN = Color.rgb(203, 144, 96)
local KURTA = Color.rgb(255, 246, 222)
local DHOTI = Color.rgb(252, 252, 248)
local TURBAN = Color.rgb(46, 140, 104)
local TURBAN_DK = Color.rgb(18, 98, 74)
local SANDAL = Color.rgb(120, 74, 30)

-- A quadratic curve from a through control c to b, written as a cubic (quadTo does not draw as a curve here).
local function quad(p: Path, a: Vector, c: Vector, b: Vector)
    p:cubicTo(Vector.xy(a.x + (c.x - a.x) * 2 / 3, a.y + (c.y - a.y) * 2 / 3), Vector.xy(b.x + (c.x - b.x) * 2 / 3, b.y + (c.y - b.y) * 2 / 3), b)
end

-- An open curve through one control point, ready to stroke.
local function curve(ax: number, ay: number, cx: number, cy: number, bx: number, by: number): Path
    local p = Path.new()
    p:moveTo(Vector.xy(ax, ay))
    quad(p, Vector.xy(ax, ay), Vector.xy(cx, cy), Vector.xy(bx, by))
    return p
end

-- Backdrop ---------------------------------------------------------------------

local HORIZON = kit.BY + 128

local function cloud(r: Renderer, x: number, y: number, s: number, a: number)
    local c = kit.fill(kit.alpha(kit.SURFACE, a))
    r:drawPath(kit.rrect(x - 46 * s, y - 4 * s, 92 * s, 22 * s, 11 * s), c)
    r:drawPath(kit.circle(x - 20 * s, y - 6 * s, 18 * s), c)
    r:drawPath(kit.circle(x + 6 * s, y - 14 * s, 24 * s), c)
    r:drawPath(kit.circle(x + 30 * s, y - 2 * s, 15 * s), c)
end

local function hills(r: Renderer, y: number, amp: number, phase: number, c: Color)
    local bx, bw = kit.BX, kit.BW
    local p = Path.new()
    p:moveTo(Vector.xy(bx, y + 60))
    p:lineTo(Vector.xy(bx, y - amp * (0.5 + 0.5 * math.sin(phase))))
    local n = 6
    local prev = Vector.xy(bx, y - amp * (0.5 + 0.5 * math.sin(phase)))
    for i = 1, n do
        local x0 = bx + bw * (i - 1) / n
        local x1 = bx + bw * i / n
        local y1 = y - amp * (0.5 + 0.5 * math.sin(phase + i * 1.9))
        local ym = y - amp * (0.5 + 0.5 * math.sin(phase + (i - 0.5) * 1.9 + 0.8)) * 1.25
        local nxt = Vector.xy(x1, y1)
        quad(p, prev, Vector.xy((x0 + x1) / 2, ym), nxt)
        prev = nxt
    end
    p:lineTo(Vector.xy(bx + bw, y + 60))
    p:close()
    r:drawPath(p, kit.fill(c))
end

local function bird(r: Renderer, x: number, y: number, s: number, flap: number)
    local w = 11 * s
    local up = (4 + 5 * flap) * s
    local p = Path.new()
    p:moveTo(Vector.xy(x - w, y - up))
    quad(p, Vector.xy(x - w, y - up), Vector.xy(x - w * 0.4, y - up * 1.3), Vector.xy(x, y))
    quad(p, Vector.xy(x, y), Vector.xy(x + w * 0.4, y - up * 1.3), Vector.xy(x + w, y - up))
    r:drawPath(p, kit.stroke(kit.alpha(kit.INK_SOFT, 0.55), 2.2 * s))
end

-- hutX: where the far-off hut stands, or nil for none (keep it clear of the lesson's own things)
function W.farm(r: Renderer, t: number, hutX: number?)
    local bx, by, bw, bh = kit.BX, kit.BY, kit.BW, kit.BH

    -- sky
    local sky = Gradient.linear(Vector.xy(0, by), Vector.xy(0, HORIZON + 20), {
        { position = 0, color = Color.rgb(206, 232, 238) },
        { position = 1, color = Color.rgb(238, 247, 243) },
    })
    r:drawPath(kit.rect(bx, by, bw, HORIZON - by + 30), Paint.with({ gradient = sky }))

    -- sun: a warm glow, slow rays, a disc
    local sx, sy = bx + bw - 118, by + 66
    r:drawPath(kit.circle(sx, sy, 62), kit.soft(kit.alpha(Color.rgb(255, 214, 120), 0.45), 34))
    for i = 0, 11 do
        local a = t * 0.12 + i * TAU / 12
        local r0 = 36
        local r1 = 48 + 5 * math.sin(t * 1.7 + i * 1.3)
        r:drawPath(
            kit.line(sx + math.cos(a) * r0, sy + math.sin(a) * r0, sx + math.cos(a) * r1, sy + math.sin(a) * r1),
            kit.stroke(kit.alpha(Color.rgb(246, 190, 84), 0.7), 4)
        )
    end
    r:drawPath(kit.circle(sx, sy, 27), kit.fill(Color.rgb(255, 216, 128)))
    r:drawPath(kit.circle(sx - 8, sy - 9, 10), kit.fill(kit.alpha(kit.SURFACE, 0.35)))

    -- clouds drift across and come round again
    local span = bw + 260
    cloud(r, bx - 130 + ((180 + t * 9) % span), by + 46, 1.0, 0.95)
    cloud(r, bx - 130 + ((640 + t * 6) % span), by + 82, 0.72, 0.85)
    cloud(r, bx - 130 + ((1010 + t * 12) % span), by + 34, 0.56, 0.8)

    -- two birds cross now and then
    local bt = (t * 0.045) % 1
    local bxp = bx + bw + 40 - bt * (bw + 120)
    local flap = 0.5 + 0.5 * math.sin(t * 9)
    bird(r, bxp, by + 70 + math.sin(t * 0.8) * 8, 1, flap)
    bird(r, bxp + 34, by + 88 + math.sin(t * 0.8 + 1) * 8, 0.8, 1 - flap)

    -- hills, far then near
    hills(r, HORIZON, 34, 0.6, Color.rgb(204, 228, 210))
    hills(r, HORIZON + 14, 22, 2.4, Color.rgb(188, 219, 193))

    -- a hut on the far side
    local hx, hy = hutX or -999, HORIZON + 8
    r:drawPath(kit.rrect(hx - 24, hy - 26, 48, 30, 3), kit.fill(Color.rgb(250, 238, 214)))
    r:drawPath(kit.rrect(hx - 24, hy - 26, 48, 30, 3), kit.stroke(kit.alpha(OUT, 0.55), 2))
    r:drawPath(kit.poly({ Vector.xy(hx - 32, hy - 24), Vector.xy(hx, hy - 50), Vector.xy(hx + 32, hy - 24) }), kit.fill(Color.rgb(203, 116, 78)))
    r:drawPath(kit.poly({ Vector.xy(hx - 32, hy - 24), Vector.xy(hx, hy - 50), Vector.xy(hx + 32, hy - 24) }), kit.stroke(kit.alpha(OUT, 0.55), 2))
    r:drawPath(kit.rrect(hx - 6, hy - 14, 12, 18, 2), kit.fill(kit.alpha(OUT, 0.6)))

    -- the meadow
    local ground = Gradient.linear(Vector.xy(0, HORIZON + 20), Vector.xy(0, by + bh), {
        { position = 0, color = Color.rgb(214, 234, 208) },
        { position = 1, color = Color.rgb(236, 246, 230) },
    })
    r:drawPath(kit.rect(bx, HORIZON + 20, bw, by + bh - HORIZON - 20), Paint.with({ gradient = ground }))

    -- tufts scattered over it, each with its own little sway
    for i = 0, 17 do
        local tx = bx + 40 + ((i * 197) % (bw - 80))
        local ty = HORIZON + 60 + ((i * 131) % (bh - (HORIZON - by) - 110))
        local sw = math.sin(t * 1.6 + i * 2.1) * 3
        local c = kit.stroke(kit.alpha(Color.rgb(120, 180, 118), 0.55), 2.4)
        r:drawPath(kit.line(tx - 5, ty, tx - 8 + sw, ty - 9), c)
        r:drawPath(kit.line(tx, ty, tx + sw, ty - 13), c)
        r:drawPath(kit.line(tx + 5, ty, tx + 8 + sw, ty - 9), c)
    end

    -- long grass along the front edge, nearest the student, swaying in the wind
    local base = by + bh
    for i = 0, 86 do
        local gx = bx + i * 14 + ((i * 37) % 9)
        local h = 14 + ((i * 53) % 16)
        local sw = math.sin(t * 1.9 + i * 0.55) * 5 + math.sin(t * 0.7 + i * 0.2) * 3
        local p = Path.new()
        local tip = Vector.xy(gx + sw, base - h)
        p:moveTo(Vector.xy(gx - 3, base + 2))
        quad(p, Vector.xy(gx - 3, base + 2), Vector.xy(gx - 1 + sw * 0.4, base - h * 0.6), tip)
        quad(p, tip, Vector.xy(gx + 2 + sw * 0.4, base - h * 0.6), Vector.xy(gx + 4, base + 2))
        p:close()
        r:drawPath(p, kit.fill(if i % 3 == 0 then Color.rgb(118, 184, 116) else Color.rgb(148, 204, 138)))
    end
end

-- People -----------------------------------------------------------------------

export type Person = {
    x: number,
    y: number,
    tx: number, -- where he is walking to
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
    px: number,
    py: number,
    line1: string,
    line2: string,
    bubble: number,
    bubbleOn: boolean,
}

function W.person(): Person
    return {
        x = -120, y = 0, tx = -120, s = 1, mood = 'idle', lookX = 640, lookY = 340,
        armL = 0.2, armR = 0.2, bendL = 0.1, bendR = 0.1, tilt = 0, mouth = 0, lean = 0, q = 0,
        hop = 0, hopV = 0, hopWait = 0, walk = 0, walking = 0, px = 0, py = 0,
        line1 = '', line2 = '', bubble = 0, bubbleOn = false,
    }
end

function W.speak(p: Person, a: string, b: string?)
    p.line1 = a
    p.line2 = b or ''
    p.bubbleOn = true
end

function W.hush(p: Person)
    p.bubbleOn = false
end

function W.personAdvance(p: Person, dt: number, t: number)
    -- walking
    local dx = p.tx - p.x
    if math.abs(dx) > 1.5 then
        p.x += kit.clamp(dx, -210 * dt, 210 * dt)
        p.walk += dt * 11
        p.walking = kit.follow(p.walking, 1, 14, dt)
    else
        p.x = p.tx
        p.walking = kit.follow(p.walking, 0, 10, dt)
    end

    -- what the mood asks of the body
    local aL, aR, bL, bR, tilt, mouth, lean, q = 0.2, 0.2, 0.1, 0.1, 0, 0.25, 0, 0
    local m = if p.walking > 0.5 then 'walk' else p.mood
    if m == 'walk' then
        aL = 0.2 + math.sin(p.walk) * 0.5
        aR = 0.2 - math.sin(p.walk) * 0.5
    elseif m == 'wave' then
        aR, bR = 2.5 + math.sin(t * 10) * 0.32, 0.45
        mouth = 1
    elseif m == 'puzzled' then
        aR, bR = 2.15, 1.95
        tilt, mouth, q = 0.12, -1, 1
    elseif m == 'watch' then
        aL, aR = 0.3, 0.3
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

    -- hopping for joy
    p.hopWait -= dt
    if m == 'cheer' and p.hop <= 0 and p.hopWait <= 0 then
        p.hopV = 360
        p.hopWait = 0.62
    end
    if p.hop > 0 or p.hopV > 0 then
        p.hop += p.hopV * dt
        p.hopV -= 1700 * dt
        if p.hop <= 0 then
            p.hop, p.hopV = 0, 0
        end
    end

    -- eyes follow what he is looking at
    local ex, ey = p.lookX - p.x, p.lookY - (p.y - 125 * p.s)
    local d = math.max(1, math.sqrt(ex * ex + ey * ey))
    p.px = kit.follow(p.px, ex / d, 8, dt)
    p.py = kit.follow(p.py, ey / d, 8, dt)

    p.bubble = kit.follow(p.bubble, if p.bubbleOn then 1 else 0, 12, dt)
end

local function outlined(r: Renderer, path: Path, c: Color, w: number)
    r:drawPath(path, kit.fill(c))
    r:drawPath(path, kit.stroke(OUT, w))
end

-- One arm: shoulder, elbow, hand. a is the swing from straight down (pi is straight up); bend folds the forearm further.
local function arm(r: Renderer, side: number, a: number, bend: number)
    local sx, sy = side * 22, -84
    local ex, ey = sx + side * math.sin(a) * 23, sy + math.cos(a) * 23
    local a2 = a + bend
    local hx, hy = ex + side * math.sin(a2) * 21, ey + math.cos(a2) * 21
    local whole = kit.polyline({ Vector.xy(sx, sy), Vector.xy(ex, ey), Vector.xy(hx, hy) })
    r:drawPath(whole, kit.stroke(OUT, 16))
    r:drawPath(whole, kit.stroke(SKIN, 10.5))
    -- the sleeve covers the upper arm
    local sleeve = kit.line(sx, sy, sx + (ex - sx) * 0.78, sy + (ey - sy) * 0.78)
    r:drawPath(sleeve, kit.stroke(OUT, 19))
    r:drawPath(sleeve, kit.stroke(KURTA, 13.5))
    outlined(r, kit.circle(hx, hy, 7), SKIN, 2.6)
end

function W.personDraw(r: Renderer, fonts: kit.Fonts, p: Person, t: number)
    local s = p.s
    local stride = p.walking * math.sin(p.walk)
    local bob = p.walking * math.abs(math.sin(p.walk)) * 4

    -- shadow shrinks as he leaves the ground
    local sh = 1 - kit.clamp(p.hop / 160, 0, 0.5)
    r:drawPath(kit.ellipse(p.x + 3, p.y + 3, 40 * s * sh, 9 * s * sh), kit.soft(kit.alpha(kit.INK, 0.22), 6))

    r:save()
    r:transform(Mat2D.withTranslation(p.x, p.y - p.hop - bob) * Mat2D.withScale(s, s))
    -- squash on landing, stretch on the way up
    local sq = kit.clamp(p.hopV / 2600, -0.1, 0.1)
    r:transform(Mat2D.withScale(1 - sq, 1 + sq))

    -- legs and sandals
    for i = -1, 1, 2 do
        local lift = math.max(0, stride * i) * 7
        local fwd = stride * i * 5
        outlined(r, kit.rrect(i * 11 - 9 + fwd, -44 - lift, 18, 42, 7), DHOTI, 3)
        outlined(r, kit.ellipse(i * 11 + fwd + 1, -3 - lift, 12, 5.5), SANDAL, 2.6)
    end

    -- lean in toward what he is watching
    r:transform(Mat2D.withTranslation(0, -40) * Mat2D.withRotation(p.lean * 0.07 * (if p.px >= 0 then 1 else -1)) * Mat2D.withTranslation(0, 40))
    local breath = 1 + 0.014 * math.sin(t * 2.3)

    arm(r, -1, p.armL, p.bendL)

    -- kurta
    r:save()
    r:transform(Mat2D.withTranslation(0, -36) * Mat2D.withScale(1, breath) * Mat2D.withTranslation(0, 36))
    outlined(r, kit.rrect(-25, -96, 50, 62, 17), KURTA, 3)
    r:drawPath(kit.polyline({ Vector.xy(-9, -95), Vector.xy(0, -78), Vector.xy(9, -95) }), kit.stroke(kit.GOLD, 3.2))
    r:drawPath(kit.line(0, -78, 0, -44), kit.stroke(kit.alpha(kit.GOLD, 0.8), 2.4))
    r:drawPath(kit.circle(0, -68, 2.2), kit.fill(kit.GOLD_DEEP))
    r:drawPath(kit.circle(0, -56, 2.2), kit.fill(kit.GOLD_DEEP))
    r:drawPath(kit.line(-22, -37, 22, -37), kit.stroke(kit.GOLD, 3))
    r:restore()

    arm(r, 1, p.armR, p.bendR)

    -- head, tilting from the neck: big, like Maji's, so his face reads from across a classroom
    r:save()
    r:transform(Mat2D.withTranslation(0, -94) * Mat2D.withRotation(p.tilt) * Mat2D.withTranslation(0, 94))
    local HY = -126
    outlined(r, kit.circle(-33, HY + 2, 7.5), SKIN, 2.8)
    outlined(r, kit.circle(33, HY + 2, 7.5), SKIN, 2.8)
    outlined(r, kit.circle(0, HY, 33), SKIN, 3.2)
    r:drawPath(kit.circle(-20, HY + 13, 7), kit.fill(kit.alpha(Color.rgb(226, 112, 92), 0.38)))
    r:drawPath(kit.circle(20, HY + 13, 7), kit.fill(kit.alpha(Color.rgb(226, 112, 92), 0.38)))

    -- turban: a wrapped dome with two folds and a gold pin
    local tb = Path.new()
    tb:moveTo(Vector.xy(-35, HY - 8))
    tb:cubicTo(Vector.xy(-42, HY - 44), Vector.xy(-14, HY - 52), Vector.xy(2, HY - 50))
    tb:cubicTo(Vector.xy(30, HY - 50), Vector.xy(42, HY - 34), Vector.xy(35, HY - 8))
    tb:cubicTo(Vector.xy(14, HY - 20), Vector.xy(-14, HY - 20), Vector.xy(-35, HY - 8))
    tb:close()
    outlined(r, tb, TURBAN, 3.2)
    r:drawPath(curve(-28, HY - 24, 0, HY - 46, 30, HY - 22), kit.stroke(TURBAN_DK, 2.8))
    r:drawPath(curve(-14, HY - 46, 10, HY - 38, 24, HY - 16), kit.stroke(TURBAN_DK, 2.8))
    r:drawPath(curve(-30, HY - 12, -12, HY - 30, 6, HY - 48), kit.stroke(kit.alpha(TURBAN_DK, 0.7), 2.4))
    outlined(r, kit.circle(4, HY - 49, 6.5), kit.GOLD, 2.6)

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
    -- brows: level, or one cocked when he is puzzled
    local cock = kit.clamp(-p.mouth, 0, 1)
    r:drawPath(kit.line(-21, EY - 14, -7, EY - 15 + cock * 3), kit.stroke(OUT, 3.4))
    r:drawPath(kit.line(7, EY - 15 - cock * 5, 21, EY - 14 - cock * 8), kit.stroke(OUT, 3.4))

    -- mouth, then the moustache over it
    local MY = HY + 21
    if p.mouth > 0.6 then
        local mo = Path.new()
        mo:moveTo(Vector.xy(-10, MY))
        quad(mo, Vector.xy(-10, MY), Vector.xy(0, MY + 17 + joy * 3), Vector.xy(10, MY))
        mo:close()
        outlined(r, mo, Color.rgb(150, 54, 44), 2.6)
    elseif p.mouth < -0.4 then
        outlined(r, kit.ellipse(1, MY + 5, 4, 3.6), Color.rgb(150, 54, 44), 2.4)
    else
        r:drawPath(curve(-7, MY + 3, 0, MY + 9, 7, MY + 3), kit.stroke(OUT, 2.8))
    end
    local TACHE = Color.rgb(34, 24, 18)
    r:drawPath(curve(0, MY - 2, -11, MY + 7, -23, MY - 5 - joy * 2), kit.stroke(TACHE, 7.5))
    r:drawPath(curve(0, MY - 2, 11, MY + 7, 23, MY - 5 - joy * 2), kit.stroke(TACHE, 7.5))
    r:restore()
    r:restore()

    -- a question mark pops over his head when he is stuck
    if p.q > 0.02 then
        local qx, qy = p.x + 40 * s, p.y - p.hop - 186 * s + math.sin(t * 3) * 3
        local k = kit.back(p.q) * (1 - kit.clamp(p.bubble * 1.5, 0, 1)) -- a speech bubble takes its place
        r:drawPath(kit.circle(qx - 16 * s, qy + 22 * s, 4 * k), kit.fill(kit.SURFACE))
        r:drawPath(kit.circle(qx - 16 * s, qy + 22 * s, 4 * k), kit.stroke(kit.RED, 2))
        r:drawPath(kit.circle(qx, qy, 17 * k), kit.fill(kit.SURFACE))
        r:drawPath(kit.circle(qx, qy, 17 * k), kit.stroke(kit.RED, 3))
        if k > 0.6 then
            kit.label(r, fonts, '?', fonts.display, 22, kit.RED, qx, qy + 1, 0.5)
        end
    end

    -- what he says
    if p.bubble > 0.02 then
        local two = p.line2 ~= ''
        local w = math.max(kit.width(fonts, p.line1, fonts.display, 19), if two then kit.width(fonts, p.line2, fonts.display, 19) else 0) + 40
        local h = if two then 66 else 46
        local cx, top = p.x + 54 * s, p.y - p.hop - 192 * s - h
        cx = kit.clamp(cx, kit.BX + w / 2 + 12, kit.BX + kit.BW - w / 2 - 12)
        local k = kit.back(p.bubble)
        r:save()
        r:modulateOpacity(kit.clamp(p.bubble * 1.6, 0, 1))
        r:transform(Mat2D.withTranslation(cx, top + h) * Mat2D.withScale(k, k) * Mat2D.withTranslation(-cx, -(top + h)))
        r:drawPath(kit.rrect(cx - w / 2 + 2, top + 5, w, h, 16), kit.soft(kit.alpha(kit.INK, 0.16), 10))
        local tail = kit.poly({ Vector.xy(cx - 34, top + h - 2), Vector.xy(cx - 12, top + h - 2), Vector.xy(cx - 34, top + h + 16) })
        r:drawPath(tail, kit.fill(kit.SURFACE))
        r:drawPath(tail, kit.stroke(kit.GOLD, 3))
        r:drawPath(kit.rrect(cx - w / 2, top, w, h, 16), kit.fill(kit.SURFACE))
        r:drawPath(kit.rrect(cx - w / 2, top, w, h, 16), kit.stroke(kit.GOLD, 3))
        r:drawPath(kit.line(cx - 32, top + h - 1.5, cx - 15, top + h - 1.5), kit.stroke(kit.SURFACE, 5))
        kit.label(r, fonts, p.line1, fonts.display, 19, kit.INK, cx, top + (if two then 22 else 24), 0.5)
        if two then
            kit.label(r, fonts, p.line2, fonts.display, 19, kit.INK, cx, top + 46, 0.5)
        end
        r:restore()
    end
end

-- Maji -------------------------------------------------------------------------

local MAJI_W, MAJI_H = 96, 104 -- one cell of maji.png (8 columns × 11 rows)
type Clip = { row: number, frames: number, fps: number }
local MAJI: { [string]: Clip } = {
    idle = { row = 0, frames = 6, fps = 4 },
    talk = { row = 0, frames = 6, fps = 7 },
    happy = { row = 4, frames = 5, fps = 9 },
    oops = { row = 5, frames = 8, fps = 6 },
    wave = { row = 3, frames = 4, fps = 6 },
}

-- x, y is where her paws rest; h is how tall she is drawn. Returns false until the picture has loaded.
function W.maji(r: Renderer, img: Image, sampler: ImageSampler, x: number, y: number, h: number, t: number, mood: string): boolean
    if img.width <= 0 then
        return false
    end
    local m: Clip = MAJI[mood] or MAJI['idle']
    local col = math.floor(t * m.fps) % m.frames
    local sc = h / MAJI_H
    local bounce = if mood == 'talk' then math.abs(math.sin(t * 7)) * 2.5 else 0
    r:drawPath(kit.ellipse(x, y - 2, MAJI_W * sc * 0.3, 5), kit.soft(kit.alpha(kit.INK, 0.2), 5))
    r:save()
    r:transform(Mat2D.withTranslation(x - MAJI_W * sc / 2, y - h * 0.95 - bounce) * Mat2D.withScale(sc, sc))
    r:clipPath(kit.rect(0.5, 0.5, MAJI_W - 1, MAJI_H - 1))
    r:transform(Mat2D.withTranslation(-col * MAJI_W, -m.row * MAJI_H))
    r:drawImage(img, sampler, 'srcOver', 1)
    r:restore()
    return true
end

return W
