-- Trigonometry on the unit circle: a narrated, playable lesson.
--
-- Each step: Cogna explains it aloud (Sarvam "priya") and demonstrates by
-- moving the dot herself, then hands over with a small task that is checked
-- live. The dot lifts while dragged, clicks into place at the special angles
-- (where exact values such as √3/2 appear), and every action has a sound.
--
-- Input: drag the dot; Back / Next / the step dots; Play spins the dot;
-- the speaker button mutes. Keys: ← → steps, ↑ ↓ nudge 1°, space plays.
--
-- Everything on screen is computed from one number, the angle, every frame,
-- which is why this is a script; scene.rml only hosts it and its assets.

type Fonts = { display: Font, body: Font, mono: Font, math: Font }

type Button = { id: string, x: number, y: number, w: number, h: number }

type Seg = { to: number, dur: number } -- glide to `to` degrees over `dur` seconds

type Lesson = {
    fonts: Fonts?,
    sfx: { [string]: AudioSource },
    voices: { [string]: AudioSource },
    voice: AudioSound?,
    queued: string?,
    muted: boolean,
    size: Vector,
    t: number,
    angle: number, -- radians (wrapped, except during the step 4 spin)
    dragging: boolean,
    everDragged: boolean,
    lift: number,
    hover: string,
    playing: boolean,
    step: number,
    stepAge: number,
    pulse: number,
    lastSnap: number,
    demo: { Seg }?,
    demoIdx: number,
    demoT: number,
    demoFrom: number,
    trailUpto: number, -- step 4: how far (deg) the wave has been drawn
    taskDone: { [number]: boolean },
    doneFlash: number,
    tries: { [number]: boolean },
    tryCount: number,
    found45: boolean,
    found225: boolean,
    hinted: boolean,
    celebrate: number,
    buttons: { Button },
}

-- Cogna palette ------------------------------------------------------------

local INK = Color.rgb(22, 36, 29)
local INK_SOFT = Color.rgb(81, 99, 90)
local INK_FAINT = Color.rgb(125, 140, 132)
local LINE = Color.rgb(214, 224, 217)
local RING = Color.rgb(196, 209, 200)
local SURFACE = Color.rgb(255, 255, 255)
local ACCENT = Color.rgb(14, 107, 84)
local ACCENT_DEEP = Color.rgb(8, 70, 58)
local ACCENT_WASH = Color.rgb(227, 239, 233)
local COS_C = Color.rgb(37, 99, 235) -- across: blue
local SIN_C = Color.rgb(224, 112, 32) -- up: orange
local GOLD = Color.rgb(214, 160, 30)

local TAU = math.pi * 2

-- Board geometry
local CX, CY, R = 330, 455, 175
local GX0, GX1 = 640, 1220 -- graph x for 0° .. 360°
local FOOT_Y = 694

-- The lesson -----------------------------------------------------------------

type Step = { tag: string, title: string, body: string, task: string, from: number, demo: { Seg } }

-- The body is what Cogna says, as it reads on screen; tools/lines.json holds
-- the same words spelled out for the voice.
local STEPS: { Step } = {
    {
        tag = 'MEET THE UNIT CIRCLE',
        title = 'A circle whose radius is exactly 1',
        body = 'This is the unit circle: its radius is exactly 1. The angle θ starts on the right and grows as the dot turns anticlockwise. Watch first, then drag the dot yourself.',
        task = 'Drag the dot up to 90°',
        from = 0,
        demo = { { to = 0, dur = 3.5 }, { to = 150, dur = 4 }, { to = 150, dur = 0.8 }, { to = 35, dur = 1.6 } },
    },
    {
        tag = 'COS θ',
        title = 'cos θ is how far across the dot is',
        body = 'Drop a line straight down from the dot and you get a right-angled triangle. Its flat side, in blue, is cos θ: how far across the dot is. Left of the centre, cos θ is negative.',
        task = 'Make cos θ negative',
        from = 40,
        demo = { { to = 40, dur = 6.5 }, { to = 140, dur = 3.5 }, { to = 140, dur = 1.5 }, { to = 50, dur = 1.5 } },
    },
    {
        tag = 'SIN θ',
        title = 'sin θ is how far up the dot is',
        body = 'The standing side, in orange, is sin θ: how far up the dot is. At 90° it is 1, its biggest value. Below the centre, sin θ is negative.',
        task = 'Make sin θ equal −1',
        from = 30,
        demo = {
            { to = 30, dur = 4 },
            { to = 90, dur = 2.5 },
            { to = 90, dur = 2 },
            { to = 200, dur = 3 },
            { to = 200, dur = 1 },
            { to = 60, dur = 1.5 },
        },
    },
    {
        tag = 'THE SINE WAVE',
        title = 'Spin the dot and its height draws a wave',
        body = 'Watch the dot spin. Its height is carried straight across to the graph, and one full turn, 0° to 360°, draws one full sine wave.',
        task = 'Drag the dot to where the wave crosses 180°',
        from = 0,
        demo = { { to = 0, dur = 2 }, { to = 360, dur = 9 } },
    },
    {
        tag = 'THE BIG IDENTITY',
        title = 'Why sin²θ + cos²θ = 1 for every angle',
        body = 'The longest side of the triangle is the radius, 1. Pythagoras says across² + up² = 1², so cos²θ + sin²θ = 1 at every angle.',
        task = 'Try 3 different angles',
        from = 50,
        demo = { { to = 50, dur = 5 }, { to = 410, dur = 9 } },
    },
    {
        tag = 'YOUR TURN',
        title = 'Make sin θ exactly equal to cos θ',
        body = 'Drag the dot until the orange side and the blue side are the same length. There are two places on the circle where this happens. Find both.',
        task = 'Find both angles where sin θ = cos θ',
        from = 20,
        demo = {},
    },
}

local SFX_NAMES = { 'snap', 'pickup', 'drop', 'pop', 'chime', 'sparkle', 'whoosh', 'tick' }
local VOICE_NAMES = {
    'step1', 'step2', 'step3', 'step4', 'step5', 'step6',
    'done1', 'done2', 'done3', 'done4', 'done5',
    'found45', 'found225', 'foundBoth', 'hint6',
}
local SPECIAL = { 0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330 }

-- Small helpers ----------------------------------------------------------------

local function deg(a: number): number
    return a * 180 / math.pi
end

local function rad(d: number): number
    return d * math.pi / 180
end

local function wrap(a: number): number
    local w = a % TAU
    if w < 0 then
        w += TAU
    end
    return w
end

local function clamp(v: number, lo: number, hi: number): number
    return math.max(lo, math.min(hi, v))
end

local function ease(t: number): number
    local c = clamp(t, 0, 1)
    return 1 - (1 - c) ^ 3
end

local function smooth(t: number): number
    local c = clamp(t, 0, 1)
    return c * c * (3 - 2 * c)
end

local function fill(c: Color): Paint
    return Paint.with({ color = c })
end

local function stroke(c: Color, w: number): Paint
    return Paint.with({ style = 'stroke', thickness = w, color = c, cap = 'round', join = 'round' })
end

local function alpha(c: Color, a: number): Color
    return Color.opacity(c, a) :: Color
end

local K = 0.5522847498

local function circle(cx: number, cy: number, r: number): Path
    local p = Path.new()
    p:moveTo(Vector.xy(cx + r, cy))
    p:cubicTo(Vector.xy(cx + r, cy + r * K), Vector.xy(cx + r * K, cy + r), Vector.xy(cx, cy + r))
    p:cubicTo(Vector.xy(cx - r * K, cy + r), Vector.xy(cx - r, cy + r * K), Vector.xy(cx - r, cy))
    p:cubicTo(Vector.xy(cx - r, cy - r * K), Vector.xy(cx - r * K, cy - r), Vector.xy(cx, cy - r))
    p:cubicTo(Vector.xy(cx + r * K, cy - r), Vector.xy(cx + r, cy - r * K), Vector.xy(cx + r, cy))
    p:close()
    return p
end

local function roundRect(x: number, y: number, w: number, h: number, r: number): Path
    local p = Path.new()
    local k = r * (1 - K)
    p:moveTo(Vector.xy(x + r, y))
    p:lineTo(Vector.xy(x + w - r, y))
    p:cubicTo(Vector.xy(x + w - k, y), Vector.xy(x + w, y + k), Vector.xy(x + w, y + r))
    p:lineTo(Vector.xy(x + w, y + h - r))
    p:cubicTo(Vector.xy(x + w, y + h - k), Vector.xy(x + w - k, y + h), Vector.xy(x + w - r, y + h))
    p:lineTo(Vector.xy(x + r, y + h))
    p:cubicTo(Vector.xy(x + k, y + h), Vector.xy(x, y + h - k), Vector.xy(x, y + h - r))
    p:lineTo(Vector.xy(x, y + r))
    p:cubicTo(Vector.xy(x, y + k), Vector.xy(x + k, y), Vector.xy(x + r, y))
    p:close()
    return p
end

local function line(x1: number, y1: number, x2: number, y2: number): Path
    local p = Path.new()
    p:moveTo(Vector.xy(x1, y1))
    p:lineTo(Vector.xy(x2, y2))
    return p
end

local function dashed(x1: number, y1: number, x2: number, y2: number, dash: number, gap: number): Path
    local p = Path.new()
    local dx, dy = x2 - x1, y2 - y1
    local len = math.sqrt(dx * dx + dy * dy)
    if len < 0.5 then
        return p
    end
    local ux, uy = dx / len, dy / len
    local d = 0
    while d < len do
        local e = math.min(d + dash, len)
        p:moveTo(Vector.xy(x1 + ux * d, y1 + uy * d))
        p:lineTo(Vector.xy(x1 + ux * e, y1 + uy * e))
        d = e + gap
    end
    return p
end

-- An arc from maths angle a0 to a1 (anticlockwise, radians), as a polyline.
local function arc(cx: number, cy: number, r: number, a0: number, a1: number): Path
    local p = Path.new()
    local n = math.max(2, math.ceil(math.abs(a1 - a0) / 0.05))
    for i = 0, n do
        local a = a0 + (a1 - a0) * i / n
        local v = Vector.xy(cx + r * math.cos(a), cy - r * math.sin(a))
        if i == 0 then
            p:moveTo(v)
        else
            p:lineTo(v)
        end
    end
    return p
end

local function tick(x: number, y: number, s: number): Path
    local p = Path.new()
    p:moveTo(Vector.xy(x - s * 0.45, y + s * 0.02))
    p:lineTo(Vector.xy(x - s * 0.12, y + s * 0.34))
    p:lineTo(Vector.xy(x + s * 0.5, y - s * 0.32))
    return p
end

-- Text -------------------------------------------------------------------------

-- The Cogna text faces lack θ (and Instrument Sans lacks ² and √), so a string is
-- split into runs and those characters are set in a face that has them.
local function runs(text: Text, s: string, font: Font, fonts: Fonts, size: number, paint: Paint)
    local subs: { { ch: string, font: Font, scale: number } } = {
        { ch = 'θ', font = fonts.math, scale = 1.08 },
        { ch = '²', font = fonts.display, scale = 1 },
        { ch = '√', font = fonts.display, scale = 1 },
    }
    local start = 1
    while start <= #s do
        local bestI: number? = nil
        local bestJ = 0
        local bestSub = subs[1]
        for _, sub in subs do
            local i, j = string.find(s, sub.ch, start, true)
            if i ~= nil and j ~= nil and (bestI == nil or i < (bestI :: number)) then
                bestI, bestJ, bestSub = i, j, sub
            end
        end
        if bestI == nil then
            text:append(string.sub(s, start), { font = font, size = size, paint = paint })
            break
        end
        local i = bestI :: number
        if i > start then
            text:append(string.sub(s, start, i - 1), { font = font, size = size, paint = paint })
        end
        local f = if font == fonts.display and bestSub.ch ~= 'θ' then font else bestSub.font
        text:append(bestSub.ch, { font = f, size = size * bestSub.scale, paint = paint })
        start = bestJ + 1
    end
end

local function makeText(fonts: Fonts, s: string, font: Font, size: number, c: Color): Text
    local t = Text.new()
    t.sizing = 'autoWidth'
    t.origin = 'top'
    runs(t, s, font, fonts, size, fill(c))
    return t
end

local function measure(fonts: Fonts, s: string, font: Font, size: number): number
    local mn, mx = makeText(fonts, s, font, size, INK):bounds()
    return mx.x - mn.x
end

-- One line of text. anchor 0 = left edge at x, 0.5 = centred, 1 = right edge;
-- y is the top of the line. Returns the width drawn.
local function label(
    r: Renderer,
    fonts: Fonts,
    s: string,
    font: Font,
    size: number,
    c: Color,
    x: number,
    y: number,
    anchor: number
): number
    local t = makeText(fonts, s, font, size, c)
    local mn, mx = t:bounds()
    local w = mx.x - mn.x
    r:save()
    r:transform(Mat2D.withTranslation(x - w * anchor - mn.x, y))
    t:draw(r)
    r:restore()
    return w
end

local function paragraph(r: Renderer, fonts: Fonts, s: string, size: number, c: Color, x: number, y: number, width: number)
    local t = Text.new()
    t.sizing = 'autoHeight'
    t.origin = 'top'
    t.maxWidth = width
    t.align = 'left'
    runs(t, s, fonts.body, fonts, size, fill(c))
    r:save()
    r:transform(Mat2D.withTranslation(x, y))
    t:draw(r)
    r:restore()
end

local function fmt(v: number): string
    local s = string.format('%.2f', v)
    if s == '-0.00' then
        s = '0.00'
    end
    return (string.gsub(s, '^%-', '−'))
end

-- Exact values ---------------------------------------------------------------

local function exactDeg(a: number): number?
    local d = deg(wrap(a))
    local n = math.floor(d + 0.5) % 360
    if math.abs(d - math.floor(d + 0.5)) > 1e-6 then
        return nil
    end
    for _, sd in SPECIAL do
        if sd == n then
            return n
        end
    end
    return nil
end

-- The exact form of sin or cos (or tan) at a special angle: 1/2, 1/√2, √3/2 …
local function exact(v: number): string
    local a = math.abs(v)
    local sign = if v < -1e-9 then '−' else ''
    local forms: { { v: number, s: string } } = {
        { v = 0, s = '0' },
        { v = 0.5, s = '1/2' },
        { v = math.sqrt(0.5), s = '1/√2' },
        { v = math.sqrt(3) / 2, s = '√3/2' },
        { v = 1, s = '1' },
        { v = 1 / math.sqrt(3), s = '1/√3' },
        { v = math.sqrt(3), s = '√3' },
    }
    for _, f in forms do
        if math.abs(a - f.v) < 1e-6 then
            return if f.v == 0 then '0' else sign .. f.s
        end
    end
    return fmt(v)
end

-- Sound ------------------------------------------------------------------------

local function sfx(self: Lesson, name: string)
    if self.muted then
        return
    end
    local src = self.sfx[name]
    if src ~= nil then
        Audio.play(src)
    end
end

local function say(self: Lesson, key: string)
    local cur = self.voice
    if cur ~= nil then
        cur:stop()
        self.voice = nil
    end
    if self.muted then
        return
    end
    local src = self.voices[key]
    if src ~= nil then
        self.voice = Audio.play(src)
    end
end

-- Say it once the current line has finished.
local function sayNext(self: Lesson, key: string)
    self.queued = key
end

-- Lesson state -----------------------------------------------------------------

local function demoRunning(self: Lesson): boolean
    return self.demo ~= nil
end

local function stopDemo(self: Lesson)
    self.demo = nil
end

local function startStep(self: Lesson, s: number)
    local st = STEPS[s]
    self.step = s
    self.stepAge = 0
    self.playing = false
    self.queued = nil
    self.pulse = 0
    self.angle = rad(st.from)
    self.demoFrom = st.from
    self.demoIdx = 1
    self.demoT = 0
    self.demo = if #st.demo > 0 then st.demo else nil
    if s == 4 then
        self.trailUpto = 0
    end
    if s == 5 then
        self.tries = {}
        self.tryCount = 0
    end
    if s == 6 then
        self.found45 = false
        self.found225 = false
        self.hinted = false
        self.celebrate = 0
    end
    say(self, 'step' .. s)
end

local function goTo(self: Lesson, step: number)
    local s = clamp(step, 1, #STEPS)
    if s == self.step then
        return
    end
    sfx(self, 'pop')
    startStep(self, s)
end

local function completeTask(self: Lesson)
    if self.taskDone[self.step] then
        return
    end
    self.taskDone[self.step] = true
    self.doneFlash = 1
    sfx(self, 'chime')
    if self.step <= 5 then
        sayNext(self, 'done' .. self.step)
    end
end

local function setAngle(self: Lesson, a: number)
    local d = deg(wrap(a))
    -- Magnetic snap to the special angles while dragging.
    for _, sd in SPECIAL do
        local diff = math.abs(d - sd)
        if diff > 180 then
            diff = 360 - diff
        end
        if diff < 3 then
            if self.lastSnap ~= sd then
                self.lastSnap = sd
                self.pulse = 1
                sfx(self, 'snap')
            end
            self.angle = rad(sd)
            return
        end
    end
    self.lastSnap = -1
    self.angle = wrap(a)
end

local function nearDeg(self: Lesson, target: number): boolean
    local d = deg(wrap(self.angle))
    local diff = math.abs(d - target)
    if diff > 180 then
        diff = 360 - diff
    end
    return diff < 0.5
end

local function checkChallenge(self: Lesson)
    if self.step ~= 6 then
        return
    end
    local before45, before225 = self.found45, self.found225
    if nearDeg(self, 45) then
        self.found45 = true
    elseif nearDeg(self, 225) then
        self.found225 = true
    end
    if (self.found45 and not before45) or (self.found225 and not before225) then
        if self.found45 and self.found225 then
            self.celebrate = 1
            completeTask(self)
            self.queued = nil
            say(self, 'foundBoth')
        else
            sfx(self, 'sparkle')
            self.doneFlash = 1
            say(self, if self.found45 then 'found45' else 'found225')
        end
    end
end

-- The student's own placement: checked when the dot is let go.
local function checkTask(self: Lesson)
    local s = self.step
    local c = math.cos(self.angle)
    if s == 1 and nearDeg(self, 90) then
        completeTask(self)
    elseif s == 2 and c < -0.05 then
        completeTask(self)
    elseif s == 3 and nearDeg(self, 270) then
        completeTask(self)
    elseif s == 4 and nearDeg(self, 180) then
        completeTask(self)
    elseif s == 5 then
        local key = math.floor(deg(wrap(self.angle)) / 10 + 0.5) % 36
        if not self.tries[key] then
            self.tries[key] = true
            self.tryCount += 1
            if self.tryCount < 3 then
                sfx(self, 'tick')
            end
        end
        if self.tryCount >= 3 then
            completeTask(self)
        end
    elseif s == 6 then
        checkChallenge(self)
    end
end

-- Layout protocol ------------------------------------------------------------

local function loadAudio(context: Context, names: { string }, prefix: string, into: { [string]: AudioSource })
    for _, n in names do
        local src: AudioSource? = context:audio(prefix .. n)
        if src then
            into[n] = src
        else
            print('sound missing: ' .. prefix .. n)
        end
    end
end

local function loadSounds(self: Lesson, context: Context)
    loadAudio(context, SFX_NAMES, '', self.sfx)
    loadAudio(context, VOICE_NAMES, 'v_', self.voices)
end

function init(self: Lesson, context: Context): boolean
    local display = context:font('Display')
    local body = context:font('Body')
    local mono = context:font('Mono')
    local italic = context:font('MathItalic')
    if display == nil or body == nil or mono == nil or italic == nil then
        print('a font asset is missing')
        return false
    end
    self.fonts = {
        display = display:withOptions({ wght = 650 }),
        body = body,
        mono = mono,
        math = italic,
    }
    loadSounds(self, context)
    startStep(self, 1)
    return true
end

function resize(self: Lesson, size: Vector)
    self.size = size
end

function advance(self: Lesson, seconds: number): boolean
    self.t += seconds
    self.stepAge += seconds
    local target = if self.dragging then 1 else 0
    self.lift += (target - self.lift) * (1 - math.exp(-18 * seconds))
    self.pulse = math.max(0, self.pulse - seconds * 2.2)
    self.doneFlash = math.max(0, self.doneFlash - seconds * 1.4)
    self.celebrate = math.max(0, self.celebrate - seconds * 0.3)

    -- Cogna's demonstration: a list of eased glides.
    local demo = self.demo
    if demo ~= nil and not self.dragging then
        self.demoT += seconds
        local seg = demo[self.demoIdx]
        local k = if seg.dur > 0 then clamp(self.demoT / seg.dur, 0, 1) else 1
        local v = self.demoFrom + (seg.to - self.demoFrom) * smooth(k)
        if self.step == 4 then
            self.angle = rad(clamp(v, 0, 360))
            self.trailUpto = math.max(self.trailUpto, clamp(v, 0, 360))
        else
            self.angle = wrap(rad(v))
        end
        if k >= 1 then
            if seg.to ~= self.demoFrom then
                sfx(self, 'drop')
            end
            self.demoFrom = seg.to
            self.demoIdx += 1
            self.demoT = 0
            if self.demoIdx > #demo then
                self.demo = nil
            elseif demo[self.demoIdx].to ~= seg.to and self.step == 4 then
                sfx(self, 'whoosh')
            end
        end
    end

    -- Play: a steady spin, 60° a second.
    if self.playing and not self.dragging then
        self.angle = wrap(self.angle + seconds * rad(60))
    end

    -- Queued voice lines wait for the current one to finish.
    local q = self.queued
    if q ~= nil then
        local cur = self.voice
        if cur == nil or cur:completed() then
            self.queued = nil
            say(self, q)
        end
    end

    -- A hint if the challenge is taking a while.
    if self.step == 6 and not self.hinted and self.stepAge > 25 and not (self.found45 and self.found225) then
        self.hinted = true
        sayNext(self, 'hint6')
    end
    return true
end

-- Input ------------------------------------------------------------------------

-- Hit areas are fixed and independent of drawing, so input works before the
-- first frame is drawn (and in headless runs that only draw on screenshot).
local function layoutButtons(): { Button }
    local list: { Button } = {}
    for i = 1, #STEPS do
        local cx = 690 + (i - 1) * 26
        table.insert(list, { id = 'dot:' .. i, x = cx - 12, y = FOOT_Y + 8, w = 24, h = 28 })
    end
    table.insert(list, { id = 'play', x = 870, y = FOOT_Y, w = 100, h = 44 })
    table.insert(list, { id = 'back', x = 982, y = FOOT_Y, w = 100, h = 44 })
    table.insert(list, { id = 'next', x = 1094, y = FOOT_Y, w = 126, h = 44 })
    table.insert(list, { id = 'sound', x = 1176, y = 26, w = 44, h = 44 })
    return list
end

local function hitButton(self: Lesson, p: Vector): string
    for _, b in self.buttons do
        if p.x >= b.x and p.x <= b.x + b.w and p.y >= b.y and p.y <= b.y + b.h then
            return b.id
        end
    end
    return ''
end

local function press(self: Lesson, id: string)
    if id == 'next' then
        if self.step == #STEPS then
            sfx(self, 'pop')
            self.taskDone = {}
            startStep(self, 1)
        else
            goTo(self, self.step + 1)
        end
    elseif id == 'back' then
        goTo(self, self.step - 1)
    elseif id == 'play' then
        if self.step == 4 then
            -- replay the demonstration spin, from 0°
            self.playing = false
            self.trailUpto = 0
            self.angle = 0
            self.demoFrom = 0
            self.demoIdx = 1
            self.demoT = 0
            self.demo = { { to = 0, dur = 0.3 }, { to = 360, dur = 9 } }
        else
            stopDemo(self)
            self.playing = not self.playing
            if self.playing then
                sfx(self, 'whoosh')
            end
        end
    elseif id == 'sound' then
        self.muted = not self.muted
        if self.muted then
            local cur = self.voice
            if cur ~= nil then
                cur:stop()
                self.voice = nil
            end
            self.queued = nil
        else
            sfx(self, 'pop')
        end
    elseif string.sub(id, 1, 4) == 'dot:' then
        local n = tonumber(string.sub(id, 5))
        if n ~= nil then
            goTo(self, n)
        end
    end
end

local function dotPos(self: Lesson): Vector
    return Vector.xy(CX + R * math.cos(self.angle), CY - R * math.sin(self.angle))
end

function pointerDown(self: Lesson, event: PointerEvent)
    local p = event.position
    local b = hitButton(self, p)
    if b ~= '' then
        press(self, b)
        event:hit()
        return
    end
    -- Grab the dot, the ring, or anywhere inside the circle.
    local dx, dy = p.x - CX, p.y - CY
    if math.sqrt(dx * dx + dy * dy) < R + 40 then
        self.dragging = true
        self.everDragged = true
        self.playing = false
        stopDemo(self)
        if self.step == 4 then
            self.trailUpto = 360 -- the student takes over: show the whole wave
        end
        self.lastSnap = -2
        sfx(self, 'pickup')
        setAngle(self, math.atan2(-dy, dx))
        event:hit()
    end
end

function pointerMove(self: Lesson, event: PointerEvent)
    local p = event.position
    self.hover = hitButton(self, p)
    if self.dragging then
        setAngle(self, math.atan2(-(p.y - CY), p.x - CX))
        checkChallenge(self)
        event:hit()
    end
end

function pointerUp(self: Lesson, event: PointerEvent)
    if self.dragging then
        self.dragging = false
        sfx(self, 'drop')
        checkTask(self)
        event:hit()
    end
end

function pointerExit(self: Lesson, event: PointerEvent)
    self.hover = ''
end

local function nudge(self: Lesson, by: number)
    stopDemo(self)
    self.playing = false
    self.angle = wrap(self.angle + rad(by))
    local d = math.floor(deg(self.angle) + 0.5)
    self.angle = wrap(rad(d)) -- keep keyboard steps on whole degrees, so exact values show
    if exactDeg(self.angle) ~= nil then
        self.pulse = 1
        sfx(self, 'snap')
    end
    checkTask(self)
end

function keyboardEvent(self: Lesson, event: KeyboardEvent): boolean
    if event.phase == 'up' then
        return false
    end
    if event.key == 262 then -- right arrow
        press(self, 'next')
    elseif event.key == 263 then -- left arrow
        goTo(self, self.step - 1)
    elseif event.key == 32 then -- space
        press(self, 'play')
    elseif event.key == 265 then -- up arrow: +1°
        nudge(self, 1)
    elseif event.key == 264 then -- down arrow: −1°
        nudge(self, -1)
    else
        return false
    end
    return true
end

-- Drawing ----------------------------------------------------------------------

local function drawButton(
    self: Lesson,
    r: Renderer,
    fonts: Fonts,
    id: string,
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    primary: boolean,
    enabled: boolean
)
    local hovered = self.hover == id and enabled
    local yy = if hovered then y - 2 else y
    if enabled then
        r:drawPath(roundRect(x, yy + 3, w, h, h / 2), Paint.with({ color = alpha(INK, 0.16), feather = 8 }))
    end
    local bg = if primary then (if hovered then ACCENT_DEEP else ACCENT) else SURFACE
    if not enabled then
        bg = Color.rgb(236, 241, 237)
    end
    r:drawPath(roundRect(x, yy, w, h, h / 2), fill(bg))
    if not primary then
        r:drawPath(roundRect(x, yy, w, h, h / 2), stroke(if enabled then LINE else alpha(LINE, 0.5), 1.5))
    end
    local tc = if primary then SURFACE else INK
    if not enabled then
        tc = INK_FAINT
    end
    label(r, fonts, text, fonts.body, 17, tc, x + w / 2, yy + h / 2 - 11, 0.5)
end

local function drawSoundButton(self: Lesson, r: Renderer)
    local x, y = 1198, 48
    local hovered = self.hover == 'sound'
    r:drawPath(circle(x, y + 2, 20), Paint.with({ color = alpha(INK, 0.12), feather = 8 }))
    r:drawPath(circle(x, y, 20), fill(if hovered then ACCENT_WASH else SURFACE))
    r:drawPath(circle(x, y, 20), stroke(LINE, 1.5))
    local c = if self.muted then INK_FAINT else ACCENT_DEEP
    local sp = Path.new()
    sp:moveTo(Vector.xy(x - 9, y - 4))
    sp:lineTo(Vector.xy(x - 5, y - 4))
    sp:lineTo(Vector.xy(x + 1, y - 9))
    sp:lineTo(Vector.xy(x + 1, y + 9))
    sp:lineTo(Vector.xy(x - 5, y + 4))
    sp:lineTo(Vector.xy(x - 9, y + 4))
    sp:close()
    r:drawPath(sp, fill(c))
    if self.muted then
        r:drawPath(line(x + 5, y - 5, x + 12, y + 5), stroke(c, 2.2))
        r:drawPath(line(x + 12, y - 5, x + 5, y + 5), stroke(c, 2.2))
    else
        -- sound waves, gently alive while Cogna is talking
        local w = if self.voice ~= nil then 0.35 + 0.65 * math.abs(math.sin(self.t * 6)) else 1
        r:drawPath(arc(x + 2, y, 6, -0.9, 0.9), stroke(c, 2))
        r:drawPath(arc(x + 2, y, 11, -0.9, 0.9), stroke(alpha(c, w), 2))
    end
end

local function drawTask(self: Lesson, r: Renderer, fonts: Fonts)
    local st = STEPS[self.step]
    local done = self.taskDone[self.step] == true
    local watching = demoRunning(self) and not done
    local x, y, h = 60, 172, 38
    local text = st.task
    if self.step == 5 and not done then
        text = text .. '   ' .. self.tryCount .. ' of 3'
    end
    if done and self.step == 6 then
        text = 'You found both!'
    end
    local tag = if watching then 'WATCH' elseif done then 'DONE' else 'YOUR TURN'
    if watching then
        text = 'Cogna is showing you' .. string.rep('.', 1 + math.floor(self.t * 2.5) % 3)
    end
    local tagW = measure(fonts, tag, fonts.mono, 12)
    local textW = measure(fonts, text, fonts.body, 16)
    local w = 18 + 26 + 10 + tagW + 12 + textW + 22

    local k = ease(self.stepAge * 2.5)
    r:save()
    r:modulateOpacity(k)
    local bounce = math.sin(self.doneFlash * math.pi) * 5
    local yy = y - bounce
    local bg = if done then ACCENT else (if watching then SURFACE else ACCENT_WASH)
    r:drawPath(roundRect(x, y + 2, w, h, h / 2), Paint.with({ color = alpha(INK, 0.1), feather = 8 }))
    r:drawPath(roundRect(x, yy, w, h, h / 2), fill(bg))
    if not done then
        r:drawPath(roundRect(x, yy, w, h, h / 2), stroke(if watching then LINE else alpha(ACCENT, 0.35), 1.5))
    end
    local ccx, ccy = x + 18 + 13, yy + h / 2
    if done then
        r:drawPath(circle(ccx, ccy, 12), fill(SURFACE))
        r:drawPath(tick(ccx, ccy, 13), stroke(ACCENT, 2.6))
    elseif watching then
        local s = 0.6 + 0.4 * math.abs(math.sin(self.t * 3))
        r:drawPath(circle(ccx, ccy, 12), stroke(LINE, 2))
        r:drawPath(circle(ccx, ccy, 5 * s), fill(ACCENT))
    else
        r:drawPath(circle(ccx, ccy, 12), stroke(ACCENT, 2))
    end
    local tx = x + 18 + 26 + 10
    label(r, fonts, tag, fonts.mono, 12, if done then ACCENT_WASH else (if watching then INK_FAINT else ACCENT), tx, ccy - 8, 0)
    label(r, fonts, text, fonts.body, 16, if done then SURFACE else (if watching then INK_FAINT else ACCENT_DEEP), tx + tagW + 12, ccy - 11, 0)
    r:restore()
end

local function drawHeader(self: Lesson, r: Renderer, fonts: Fonts)
    local s = STEPS[self.step]
    local k = ease(self.stepAge * 2.5)
    r:save()
    r:modulateOpacity(k)
    r:transform(Mat2D.withTranslation(0, (1 - k) * 12))
    label(r, fonts, 'TRIGONOMETRY  ·  STEP ' .. self.step .. ' OF ' .. #STEPS .. '  ·  ' .. s.tag, fonts.mono, 13, ACCENT, 60, 34, 0)
    label(r, fonts, s.title, fonts.display, 34, INK, 60, 56, 0)
    paragraph(r, fonts, s.body, 18, INK_SOFT, 60, 106, 1080)
    r:restore()
    drawSoundButton(self, r)
    drawTask(self, r, fonts)
end

local function halfDisc(a0: number, a1: number): Path
    local p = arc(CX, CY, R, a0, a1)
    p:close()
    return p
end

local function drawCircle(self: Lesson, r: Renderer, fonts: Fonts)
    local step = self.step
    local a = self.angle
    local c, s = math.cos(a), math.sin(a)
    local P = dotPos(self)
    local ex = exactDeg(a)

    -- Board card
    r:drawPath(roundRect(40, 228, 1200, 440, 22), Paint.with({ color = alpha(INK, 0.08), feather = 24 }))
    r:drawPath(roundRect(40, 222, 1200, 440, 22), fill(SURFACE))

    -- Where the value is negative: the left half for cos, the bottom for sin
    if step == 2 then
        r:drawPath(halfDisc(math.pi / 2, math.pi * 3 / 2), fill(alpha(COS_C, 0.07)))
        label(r, fonts, 'cos θ < 0', fonts.body, 15, alpha(COS_C, 0.8), CX - R * 0.55, CY + R * 0.42, 0.5)
        label(r, fonts, 'cos θ > 0', fonts.body, 15, alpha(COS_C, 0.45), CX + R * 0.55, CY + R * 0.42, 0.5)
    elseif step == 3 then
        r:drawPath(halfDisc(math.pi, TAU), fill(alpha(SIN_C, 0.08)))
        label(r, fonts, 'sin θ < 0', fonts.body, 15, alpha(SIN_C, 0.85), CX + R * 0.5, CY + R * 0.55, 0.5)
        label(r, fonts, 'sin θ > 0', fonts.body, 15, alpha(SIN_C, 0.5), CX + R * 0.5, CY - R * 0.62, 0.5)
    end

    -- Axes and ring
    r:drawPath(line(CX - R - 30, CY, CX + R + 30, CY), stroke(LINE, 1.5))
    r:drawPath(line(CX, CY - R - 30, CX, CY + R + 30), stroke(LINE, 1.5))
    r:drawPath(circle(CX, CY, R), stroke(RING, 2.5))
    label(r, fonts, '1', fonts.mono, 13, INK_FAINT, CX + R + 6, CY + 6, 0)
    label(r, fonts, '−1', fonts.mono, 13, INK_FAINT, CX - R - 8, CY + 6, 1)
    label(r, fonts, '1', fonts.mono, 13, INK_FAINT, CX + 8, CY - R - 22, 0)
    label(r, fonts, '−1', fonts.mono, 13, INK_FAINT, CX + 8, CY + R + 6, 0)

    -- Special-angle ticks; the one the dot sits on lights up
    for _, sd in SPECIAL do
        local ta = rad(sd)
        local on = ex == sd
        local i0, o0 = R - (if on then 9 else 6), R + (if on then 9 else 6)
        r:drawPath(
            line(CX + i0 * math.cos(ta), CY - i0 * math.sin(ta), CX + o0 * math.cos(ta), CY - o0 * math.sin(ta)),
            stroke(if on then ACCENT else RING, if on then 3 else 2)
        )
    end

    -- Challenge answers, ringed in gold once found
    if step == 6 then
        for _, sd in { 45, 225 } do
            local got = if sd == 45 then self.found45 else self.found225
            if got then
                local ta = rad(sd)
                local gx, gy = CX + R * math.cos(ta), CY - R * math.sin(ta)
                r:drawPath(circle(gx, gy, 18), fill(alpha(GOLD, 0.22)))
                r:drawPath(circle(gx, gy, 18), stroke(GOLD, 2))
            end
        end
    end

    -- The triangle: radius, cos leg, sin leg
    local footX = P.x
    local emphCos = step == 2 or step >= 5
    local emphSin = step == 3 or step == 4 or step >= 5
    if step >= 2 then
        local tri = Path.new()
        tri:moveTo(Vector.xy(CX, CY))
        tri:lineTo(Vector.xy(footX, CY))
        tri:lineTo(P)
        tri:close()
        r:drawPath(tri, fill(alpha(ACCENT_WASH, 0.7)))

        if math.abs(c) > 0.08 and math.abs(s) > 0.08 then
            local sx = if c > 0 then -1 else 1
            local sy = if s > 0 then -1 else 1
            local m = 12
            local ra = Path.new()
            ra:moveTo(Vector.xy(footX + sx * m, CY))
            ra:lineTo(Vector.xy(footX + sx * m, CY + sy * m))
            ra:lineTo(Vector.xy(footX, CY + sy * m))
            r:drawPath(ra, stroke(INK_FAINT, 1.5))
        end

        r:drawPath(line(CX, CY, footX, CY), stroke(COS_C, if emphCos then 6 else 4))
        r:drawPath(line(footX, CY, footX, P.y), stroke(SIN_C, if emphSin then 6 else 4))

        if math.abs(c) > 0.18 then
            label(r, fonts, 'cos θ', fonts.body, 16, COS_C, (CX + footX) / 2, CY + (if s >= 0 then 10 else -30), 0.5)
        end
        if math.abs(s) > 0.18 then
            local lx = footX + (if c >= 0 then 12 else -12)
            label(r, fonts, 'sin θ', fonts.body, 16, SIN_C, lx, (CY + P.y) / 2 - 11, if c >= 0 then 0 else 1)
        end
    end

    -- radius (hypotenuse) = 1, glowing while Cogna introduces it
    local glow = if step == 1 and self.stepAge < 3.5 then 0.5 + 0.5 * math.sin(self.stepAge * 5) else 0
    if glow > 0 then
        r:drawPath(line(CX, CY, P.x, P.y), Paint.with({ style = 'stroke', thickness = 12, color = alpha(ACCENT, 0.3 * glow), cap = 'round', feather = 6 }))
    end
    r:drawPath(line(CX, CY, P.x, P.y), stroke(INK, 3))
    if step == 5 or step == 1 then
        local mx, my = (CX + P.x) / 2, (CY + P.y) / 2
        label(r, fonts, '1', fonts.display, 20, INK, mx - s * 16, my - c * 16 - 12, 0.5)
    end

    -- angle arc and its label
    local d = math.floor(deg(a) + 0.5)
    if a > 0.01 then
        r:drawPath(arc(CX, CY, 38, 0, a), stroke(ACCENT, 2.5))
        local mid = a / 2
        local lr = if a < 0.6 then 70 else 58
        local lx, ly = CX + lr * math.cos(mid) + 4, CY - lr * math.sin(mid) - 10
        local anchor = if math.cos(mid) >= -0.2 then 0 else 1
        if a > rad(150) then
            lx, ly, anchor = CX + 44, CY - 64, 0
        end
        label(r, fonts, 'θ = ' .. d .. '°', fonts.body, 16, ACCENT_DEEP, lx, ly, anchor)
    end

    -- Step 1: once Cogna has shown it, invite the drag with a curved arrow
    if step == 1 and not demoRunning(self) and not self.everDragged then
        local pulse = 0.55 + 0.45 * math.sin(self.t * 4)
        local a0 = a + 0.22
        local a1 = a + 0.75
        r:drawPath(arc(CX, CY, R + 30, a0, a1), stroke(alpha(ACCENT, pulse), 3))
        local hx, hy = CX + (R + 30) * math.cos(a1), CY - (R + 30) * math.sin(a1)
        local tx, ty = -math.sin(a1), -math.cos(a1) -- direction of travel on screen
        local nx, ny = math.cos(a1), -math.sin(a1)
        local head = Path.new()
        head:moveTo(Vector.xy(hx - tx * 10 + nx * 7, hy - ty * 10 + ny * 7))
        head:lineTo(Vector.xy(hx, hy))
        head:lineTo(Vector.xy(hx - tx * 10 - nx * 7, hy - ty * 10 - ny * 7))
        r:drawPath(head, stroke(alpha(ACCENT, pulse), 3))
        local am = (a0 + a1) / 2
        label(r, fonts, 'drag me', fonts.body, 15, alpha(ACCENT_DEEP, pulse), CX + (R + 60) * math.cos(am), CY - (R + 60) * math.sin(am) - 10, 0.5)
    end

    -- snap pulse, and a gold ring when a task is done
    if self.pulse > 0 then
        local pr = 14 + (1 - self.pulse) * 26
        r:drawPath(circle(P.x, P.y, pr), stroke(alpha(ACCENT, self.pulse * 0.6), 3))
    end
    if self.doneFlash > 0 then
        local pr = 16 + (1 - self.doneFlash) * 46
        r:drawPath(circle(P.x, P.y, pr), stroke(alpha(GOLD, self.doneFlash * 0.8), 4))
    end

    -- The dot: lifts, grows a little and casts a longer, softer shadow while held
    local lift = self.lift
    local breathe = if step == 1 and not self.everDragged and not demoRunning(self) then 1 + 0.07 * math.sin(self.t * 4) else 1
    local rr = (13 + lift * 4) * breathe
    local py = P.y - lift * 3
    r:drawPath(circle(P.x + 1, P.y + 3 + lift * 7, rr), Paint.with({ color = alpha(INK, 0.22 + lift * 0.08), feather = 6 + lift * 10 }))
    r:drawPath(circle(P.x, py, rr), fill(ACCENT))
    r:drawPath(circle(P.x - rr * 0.3, py - rr * 0.32, rr * 0.32), fill(alpha(SURFACE, 0.45)))
    r:drawPath(circle(P.x, py, rr), stroke(SURFACE, 3))

    -- coordinates of the dot, exact at the special angles
    local coord = if ex ~= nil then '(' .. exact(c) .. ', ' .. exact(s) .. ')' else '(' .. fmt(c) .. ', ' .. fmt(s) .. ')'
    local cx = P.x + (if c >= 0 then 22 else -22)
    local cy = P.y + (if s >= 0 then -34 else 12)
    label(r, fonts, coord, fonts.mono, 14, if ex ~= nil then ACCENT_DEEP else INK_SOFT, cx, cy, if c >= 0 then 0 else 1)
end

local function gx(d: number): number
    return GX0 + (GX1 - GX0) * d / 360
end

local function wavePath(upto: number): Path
    local w = Path.new()
    local n = math.max(2, math.ceil(upto / 3))
    for i = 0, n do
        local dd = upto * i / n
        local v = Vector.xy(gx(dd), CY - R * math.sin(rad(dd)))
        if i == 0 then
            w:moveTo(v)
        else
            w:lineTo(v)
        end
    end
    return w
end

local function card(r: Renderer, warm: boolean)
    local bx, by = 928, 262
    r:drawPath(roundRect(bx - 20, by - 14, 312, 174, 16), Paint.with({ color = alpha(INK, 0.12), feather = 14 }))
    r:drawPath(roundRect(bx - 20, by - 18, 312, 174, 16), fill(if warm then Color.rgb(250, 238, 205) else ACCENT_WASH))
end

local function drawGraph(self: Lesson, r: Renderer, fonts: Fonts)
    local step = self.step
    local P = dotPos(self)
    local d = deg(self.angle)
    local onGraph = step >= 4

    r:save()
    r:modulateOpacity(if onGraph then 1 else 0.45)
    r:drawPath(line(GX0, CY, GX1 + 10, CY), stroke(LINE, 1.5))
    r:drawPath(line(GX0, CY - R - 20, GX0, CY + R + 20), stroke(LINE, 1.5))
    r:drawPath(dashed(GX0, CY - R, GX1, CY - R, 4, 6), stroke(LINE, 1))
    r:drawPath(dashed(GX0, CY + R, GX1, CY + R, 4, 6), stroke(LINE, 1))
    label(r, fonts, '1', fonts.mono, 13, INK_FAINT, GX0 - 8, CY - R - 9, 1)
    label(r, fonts, '−1', fonts.mono, 13, INK_FAINT, GX0 - 8, CY + R - 9, 1)
    for _, tk in { 90, 180, 270, 360 } do
        r:drawPath(line(gx(tk), CY - 5, gx(tk), CY + 5), stroke(INK_FAINT, 1.5))
        label(r, fonts, tostring(tk) .. '°', fonts.mono, 13, INK_FAINT, gx(tk), CY + 10, 0.5)
    end
    label(r, fonts, 'sin θ  against  θ', fonts.body, 15, INK_FAINT, GX0 + 12, CY - R - 34, 0)
    r:drawPath(wavePath(360), stroke(alpha(SIN_C, 0.18), 3))
    r:restore()

    -- the traced wave (step 4) or the wave up to θ (later steps)
    local upto = if step == 4 then self.trailUpto else (if step > 4 then d else -1)
    if upto > 0 then
        r:drawPath(wavePath(upto), stroke(SIN_C, 4))
    end

    -- carry the height across: a dashed connector, then the dot on the graph
    if onGraph then
        local qx = gx(clamp(d, 0, 360))
        local qy = P.y
        r:drawPath(dashed(P.x, P.y, qx, qy, 6, 6), stroke(alpha(SIN_C, 0.7), 2))
        r:drawPath(line(qx, CY, qx, qy), stroke(alpha(SIN_C, 0.5), 2))
        r:drawPath(circle(qx, qy + 2, 9), Paint.with({ color = alpha(INK, 0.2), feather = 6 }))
        r:drawPath(circle(qx, qy, 9), fill(SIN_C))
        r:drawPath(circle(qx, qy, 9), stroke(SURFACE, 2.5))
    end

    local bx, by = 928, 262
    if step == 5 then
        local c, s = math.cos(self.angle), math.sin(self.angle)
        card(r, false)
        local x = bx
        x += label(r, fonts, 'cos²θ', fonts.display, 26, COS_C, x, by, 0)
        x += label(r, fonts, ' + ', fonts.display, 26, INK, x, by, 0)
        x += label(r, fonts, 'sin²θ', fonts.display, 26, SIN_C, x, by, 0)
        label(r, fonts, ' = 1', fonts.display, 26, INK, x, by, 0)
        local ex = exactDeg(self.angle) ~= nil
        local cs = if ex then exact(c) else fmt(c)
        local ss = if ex then exact(s) else fmt(s)
        label(r, fonts, '(' .. cs .. ')² + (' .. ss .. ')²', fonts.mono, 16, INK_SOFT, bx, by + 48, 0)
        label(r, fonts, '= ' .. string.format('%.3f', c * c + s * s), fonts.mono, 22, ACCENT_DEEP, bx, by + 78, 0)
        label(r, fonts, 'Exactly 1, at every angle.', fonts.body, 15, INK_SOFT, bx, by + 120, 0)
    elseif step == 6 then
        local both = self.found45 and self.found225
        card(r, both)
        local c, s = math.cos(self.angle), math.sin(self.angle)
        local same = math.abs(c - s) < 0.005
        label(r, fonts, if both then 'You found both!' else 'Find the two angles', fonts.display, 24, INK, bx, by, 0)
        label(r, fonts, 'Answer 1:  ' .. (if self.found45 then '45°' else '?'), fonts.mono, 17, if self.found45 then ACCENT_DEEP else INK_SOFT, bx, by + 44, 0)
        label(r, fonts, 'Answer 2:  ' .. (if self.found225 then '225°' else '?'), fonts.mono, 17, if self.found225 then ACCENT_DEEP else INK_SOFT, bx, by + 70, 0)
        local note = if both
            then 'Both 1/√2 at 45°, both −1/√2 at 225°.'
            elseif same then 'Yes! sin θ = cos θ here. Find the other.'
            elseif self.hinted then 'Hint: try halfway between 0° and 90°.'
            else 'Blue ' .. fmt(c) .. '  ·  orange ' .. fmt(s)
        paragraph(r, fonts, note, 15, if same or both or self.hinted then ACCENT_DEEP else INK_SOFT, bx, by + 108, 270)
    end
end

local function drawFooter(self: Lesson, r: Renderer, fonts: Fonts)
    local a = self.angle
    local c, s = math.cos(a), math.sin(a)
    local y = FOOT_Y
    local ex = exactDeg(a) ~= nil

    -- readout chips; at a special angle they show the exact value
    type Chip = { name: string, value: string, col: Color }
    local tanV = if math.abs(c) < 0.005 then 'undefined' else (if ex then exact(s / c) else fmt(s / c))
    local chips: { Chip } = {
        { name = 'θ', value = tostring(math.floor(deg(wrap(a)) + 0.5) % 360) .. '°', col = ACCENT_DEEP },
        { name = 'sin θ', value = if ex then exact(s) else fmt(s), col = SIN_C },
        { name = 'cos θ', value = if ex then exact(c) else fmt(c), col = COS_C },
        { name = 'tan θ', value = tanV, col = INK_SOFT },
    }
    local x = 60
    for _, chip in chips do
        local w = 136
        r:drawPath(roundRect(x, y, w, 44, 12), fill(if ex then ACCENT_WASH else SURFACE))
        r:drawPath(roundRect(x, y, w, 44, 12), stroke(if ex then alpha(ACCENT, 0.35) else LINE, 1.5))
        label(r, fonts, chip.name, fonts.body, 14, INK_FAINT, x + 14, y + 12, 0)
        if chip.value == 'undefined' then
            label(r, fonts, chip.value, fonts.body, 14, chip.col, x + w - 12, y + 12, 1)
        else
            label(r, fonts, chip.value, fonts.mono, 16, chip.col, x + w - 14, y + 11, 1)
        end
        x += w + 10
    end
    if ex then
        label(r, fonts, 'EXACT VALUES AT A SPECIAL ANGLE', fonts.mono, 10, ACCENT, 60, y - 17, 0)
    end

    -- step dots: done steps carry a tick
    for i = 1, #STEPS do
        local cx = 690 + (i - 1) * 26
        local on = i == self.step
        local done = self.taskDone[i] == true
        local col = if on then ACCENT else (if done then alpha(ACCENT, 0.55) else LINE)
        r:drawPath(circle(cx, y + 22, if on then 8 else 6), fill(col))
        if done then
            r:drawPath(tick(cx, y + 22, if on then 9 else 7), stroke(SURFACE, 1.8))
        end
    end

    local playLabel = if self.step == 4 then 'Replay' elseif self.playing then 'Pause' else 'Play'
    drawButton(self, r, fonts, 'play', playLabel, 870, y, 100, 44, false, true)
    drawButton(self, r, fonts, 'back', 'Back', 982, y, 100, 44, false, self.step > 1)

    -- Next glows once this step's task is done
    if self.taskDone[self.step] and self.step < #STEPS then
        local k = (self.t * 0.8) % 1
        local g = 4 + k * 12
        r:drawPath(roundRect(1094 - g, y - g, 126 + g * 2, 44 + g * 2, 22 + g), stroke(alpha(ACCENT, 0.45 * (1 - k)), 3))
    end
    drawButton(self, r, fonts, 'next', if self.step == #STEPS then 'Start again' else 'Next', 1094, y, 126, 44, true, true)
end

local function drawCelebration(self: Lesson, r: Renderer)
    if self.celebrate <= 0 then
        return
    end
    local k = 1 - self.celebrate
    local P = dotPos(self)
    for i = 1, 36 do
        local ang = i * 2.399 -- golden angle spread
        local dist = 20 + k * (110 + (i % 5) * 24)
        local x = P.x + math.cos(ang) * dist
        local y = P.y + math.sin(ang) * dist + k * k * 70
        local col = if i % 3 == 0 then GOLD elseif i % 3 == 1 then ACCENT else SIN_C
        r:drawPath(circle(x, y, 5 * (1 - k * 0.6)), fill(alpha(col, self.celebrate)))
    end
end

function draw(self: Lesson, renderer: Renderer)
    local fonts = self.fonts
    if fonts == nil then
        return
    end
    -- Drop the voice handle once it finishes, so the speaker stops pulsing.
    local cur = self.voice
    if cur ~= nil and cur:completed() and self.queued == nil then
        self.voice = nil
    end
    drawHeader(self, renderer, fonts)
    drawCircle(self, renderer, fonts)
    drawGraph(self, renderer, fonts)
    drawFooter(self, renderer, fonts)
    drawCelebration(self, renderer)
end

return function(context: Context): Layout<Lesson>
    return {
        fonts = nil,
        sfx = {},
        voices = {},
        voice = nil,
        queued = nil,
        muted = false,
        size = Vector.xy(1280, 760),
        t = 0,
        angle = 0,
        dragging = false,
        everDragged = false,
        lift = 0,
        hover = '',
        playing = false,
        step = 1,
        stepAge = 0,
        pulse = 0,
        lastSnap = -1,
        demo = nil,
        demoIdx = 1,
        demoT = 0,
        demoFrom = 0,
        trailUpto = 0,
        taskDone = {},
        doneFlash = 0,
        tries = {},
        tryCount = 0,
        found45 = false,
        found225 = false,
        hinted = false,
        celebrate = 0,
        buttons = layoutButtons(),
        init = init,
        resize = resize,
        advance = advance,
        draw = draw,
        pointerDown = pointerDown,
        pointerMove = pointerMove,
        pointerUp = pointerUp,
        pointerExit = pointerExit,
        keyboardEvent = keyboardEvent,
    }
end
