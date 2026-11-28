-- The Area module: seven hands-on lessons, narrated by Kiara.
--
-- This script is the module around the lessons: the lesson map, the header, the task
-- chip, Kiara's captions, the step dots and Back / Next, sound, confetti, and the
-- lesson-complete card. Each lesson is its own module (l1 … l7) written against
-- kit.Lesson, and draws on the board. Everything is drawn every frame.
--
-- Keys: ← → steps · Esc back to the lessons · M mute. Lessons add their own.

local kit = require('kit')
local lines = require('lines')
local world = require('world')
local people = require('people')

type Fonts = kit.Fonts
type G = kit.G
type Lesson = kit.Lesson

local LESSONS: { Lesson } = {
    require('l1'),
    require('l2'),
    require('l3'),
    require('l4'),
    require('l5'),
    require('l6'),
    require('l7'),
    require('l8'),
}

-- each lesson brings its own lines (the people and places are the lesson's own); they join the shared ones
for _, Lz in LESSONS do
    local own = (Lz :: any).lines
    if type(own) == 'table' then
        for k, v in own do
            if type(k) == 'string' and type(v) == 'string' then
                lines[k] = v
            end
        end
    end
end

local SFX = {
    'snap', 'pickup', 'drop', 'pop', 'chime', 'sparkle', 'whoosh', 'slice', 'thud', 'oops', 'fanfare',
    'tick0', 'tick1', 'tick2', 'tick3', 'tick4', 'tick5', 'tick6', 'tick7', 'tick8', 'tick9', 'tick10', 'tick11',
}

type Bit = { x: number, y: number, vx: number, vy: number, life: number, rot: number, spin: number, size: number, col: Color, kind: number }

type Area = {
    fonts: Fonts?,
    g: G?,
    sfx: { [string]: AudioSource },
    maji: Image?,
    majiSampler: ImageSampler?,
    cheerAt: number, -- when the last task was finished: Maji jumps
    voices: { [string]: AudioSource },
    voice: AudioSound?,
    voiceKey: string,
    voiceAge: number,
    queue: { string },
    caption: string,
    captionAge: number,
    muted: boolean,
    t: number,
    screen: string, -- 'home' | 'lesson' | 'complete'
    screenAge: number,
    li: number,
    step: number,
    age: number,
    done: { [string]: boolean }, -- 'li:step'
    finished: { [number]: boolean },
    bits: { Bit },
    shakeT: number,
    shakeA: number,
    hintText: string,
    hintAge: number,
    hover: Vector,
    downOn: string,
    -- the bridge to the page that embeds the module (the trail app); see initBridge
    vm: ViewModel?,
    pLesson: Property<number>?,
    pHostVoice: Property<boolean>?,
    pSay: Property<string>?,
    pSayId: Property<number>?,
    pHeard: Property<number>?,
    pAnswer: Property<string>?,
    pAnswerId: Property<number>?,
    pDone: Property<number>?,
    hostVoice: boolean, -- the page speaks every line (its own voice player), so it can stop when the student moves on
    linked: boolean, -- opened on one lesson by the page: no lesson grid, no "All lessons"
    sayId: number,
    heard: number,
    answerId: number,
    context: Context?,
}

local function key(li: number, s: number): string
    return li .. ':' .. s
end

-- Sound ------------------------------------------------------------------------

local function sfx(self: Area, name: string)
    if self.muted then
        return
    end
    local src = self.sfx[name]
    if src ~= nil then
        Audio.play(src)
    end
end

local function estimate(text: string): number
    local n = 0
    for _ in string.gmatch(text, '%S+') do
        n += 1
    end
    return 0.9 + n * 0.37
end

local function stopVoice(self: Area)
    local v = self.voice
    if v ~= nil then
        v:stop()
    end
    self.voice = nil
end

-- Hand a line to the page to speak ('' stops whatever it is saying). The page reports back through `heard`.
local function publishLine(self: Area, text: string)
    self.sayId += 1
    local ps, pi = self.pSay, self.pSayId
    if ps ~= nil then
        ps.value = text
    end
    if pi ~= nil then
        pi.value = self.sayId
    end
end

local function say(self: Area, k: string)
    stopVoice(self)
    self.voiceKey = k
    self.voiceAge = 0
    self.caption = lines[k] or ''
    self.captionAge = 0
    if self.hostVoice then
        publishLine(self, if self.muted then '' else self.caption)
        return
    end
    if self.muted then
        return
    end
    local src = self.voices[k]
    if src ~= nil then
        self.voice = Audio.play(src)
    end
end

-- Is she still saying the current line? (The audio says so; if it can't, the line's length does.)
local function talking(self: Area): boolean
    if self.voiceKey == '' then
        return false
    end
    local est = estimate(lines[self.voiceKey] or '')
    if self.hostVoice then
        -- until the page says the line is over (spoken, cut short or skipped), with a safety net
        return not self.muted and self.heard < self.sayId and self.voiceAge < est * 2.2 + 3
    end
    local v = self.voice
    if v ~= nil then
        if v:completed() then
            return false
        end
        return self.voiceAge < est * 1.8 + 2
    end
    return not self.muted and self.voiceAge < est and self.voices[self.voiceKey] ~= nil
end

local function sayNext(self: Area, k: string)
    if not talking(self) and #self.queue == 0 then
        say(self, k)
    else
        table.insert(self.queue, k)
    end
end

-- Confetti and jolts ----------------------------------------------------------------

local CONFETTI = { kit.GOLD, kit.ACCENT, kit.ORANGE, kit.BLUE, Color.rgb(46, 160, 90) }

local function burst(self: Area, x: number, y: number, n: number)
    for i = 1, n do
        local a = (i / n) * math.pi * 2 + math.random() * 0.6
        local sp = 180 + math.random() * 320
        table.insert(self.bits, {
            x = x, y = y,
            vx = math.cos(a) * sp, vy = math.sin(a) * sp - 260,
            life = 1, rot = math.random() * 6, spin = (math.random() - 0.5) * 14,
            size = 5 + math.random() * 6, col = CONFETTI[(i % #CONFETTI) + 1], kind = i % 3,
        })
    end
end

-- Steps --------------------------------------------------------------------------

local function lesson(self: Area): Lesson
    return LESSONS[self.li]
end

local function enterStep(self: Area, s: number)
    local L = lesson(self)
    self.step = s
    self.age = 0
    self.queue = {}
    self.hintText = ''
    local g = self.g
    if g ~= nil then
        L.enter(g, s)
    end
    say(self, L.steps[s].line)
end

local function openLesson(self: Area, li: number)
    self.li = li
    self.screen = 'lesson'
    self.screenAge = 0
    sfx(self, 'whoosh')
    enterStep(self, 1)
end

local function goHome(self: Area)
    self.screen = 'home'
    self.screenAge = 0
    self.queue = {}
    stopVoice(self)
    if self.hostVoice then
        publishLine(self, '')
    end
    self.voiceKey = ''
    self.caption = ''
    sfx(self, 'pop')
end

local function nextStep(self: Area)
    local L = lesson(self)
    if self.step < #L.steps then
        sfx(self, 'pop')
        enterStep(self, self.step + 1)
    else
        self.finished[self.li] = true
        self.screen = 'complete'
        self.screenAge = 0
        self.queue = {}
        local pd = self.pDone
        if pd ~= nil then
            pd.value = self.li
        end
        -- In the trail (linked) the page moves straight on, so a "Lesson complete" line would only be cut off or repeated
        -- after every part of a day; the module on its own says it.
        if not self.linked then
            say(self, 'complete')
        end
        sfx(self, 'fanfare')
        burst(self, 640, 330, 90)
    end
end

local function prevStep(self: Area)
    if self.step > 1 then
        sfx(self, 'pop')
        enterStep(self, self.step - 1)
    end
end

-- Layout protocol ----------------------------------------------------------------

-- The page that embeds the module talks to it through the AreaBridge view model:
--   lesson    (page → module) 1–8 opens that lesson straight away (linked mode); 0 is the lesson grid; 99 the cast sheet
--   hostVoice (page → module) true: the page speaks the lines; the module publishes each one as `say` + `sayId`
--   heard     (page → module) the last sayId the page finished (spoken, cut short or skipped)
--   answer + answerId (module → page) 'qid|1 or 0|value|mixup' for every answer the student gives
--   done      (module → page) the number of the lesson just completed
local function initBridge(self: Area, context: Context)
    local vm = context:viewModel()
    if vm == nil then
        return
    end
    self.vm = vm
    self.pLesson = vm:getNumber('lesson')
    self.pHostVoice = vm:getBoolean('hostVoice')
    self.pSay = vm:getString('say')
    self.pSayId = vm:getNumber('sayId')
    self.pHeard = vm:getNumber('heard')
    self.pAnswer = vm:getString('answer')
    self.pAnswerId = vm:getNumber('answerId')
    self.pDone = vm:getNumber('done')
    local function applyHostVoice()
        local hv = self.pHostVoice
        self.hostVoice = hv ~= nil and hv.value == true
        if self.hostVoice then
            stopVoice(self) -- the page's voice takes over from Kiara's recordings
        end
    end
    local function applyLesson()
        local pl = self.pLesson
        if pl == nil then
            return
        end
        local n = math.floor(pl.value)
        if n >= 1 and n <= #LESSONS then
            self.linked = true
            openLesson(self, n)
        elseif n == 99 then
            self.screen = 'cast'
            self.screenAge = 0
        elseif n == 98 then
            -- the seven friends from the lessons, together (the trail shows this at the end of the two weeks)
            self.screen = 'crew'
            self.screenAge = 0
        elseif n == 0 and self.screen ~= 'home' then
            self.linked = false
            goHome(self)
        end
    end
    local function applyHeard()
        local ph = self.pHeard
        if ph ~= nil then
            self.heard = ph.value
        end
    end
    local hv, pl, ph = self.pHostVoice, self.pLesson, self.pHeard
    if hv ~= nil then
        hv:addListener(vm, function()
            applyHostVoice()
            context:markNeedsUpdate()
        end)
    end
    if pl ~= nil then
        pl:addListener(vm, function()
            applyLesson()
            context:markNeedsUpdate()
        end)
    end
    if ph ~= nil then
        ph:addListener(vm, function()
            applyHeard()
            context:markNeedsUpdate()
        end)
    end
    applyHostVoice()
    applyHeard()
    applyLesson()
end

function init(self: Area, context: Context): boolean
    local display = context:font('Display')
    local body = context:font('Body')
    local mono = context:font('Mono')
    local italic = context:font('MathItalic')
    if display == nil or body == nil or mono == nil or italic == nil then
        print('a font asset is missing')
        return false
    end
    local fonts: Fonts = { display = display:withOptions({ wght = 680 }), body = body, mono = mono, math = italic }
    self.fonts = fonts
    for _, n in SFX do
        local src: AudioSource? = context:audio(n)
        if src then
            self.sfx[n] = src
        else
            print('sound missing: ' .. n)
        end
    end
    self.maji = context:image('maji')
    self.majiSampler = ImageSampler('clamp', 'clamp', 'bilinear')
    local missing = 0
    for k in lines do
        local src: AudioSource? = context:audio('v_' .. k)
        if src then
            self.voices[k] = src
        else
            missing += 1
        end
    end
    if missing > 0 then
        print(missing .. ' voice lines not found')
    end

    local g: G = {
        fonts = fonts,
        t = 0,
        age = 0,
        step = 1,
        say = function(k: string)
            say(self, k)
        end,
        sayNext = function(k: string)
            sayNext(self, k)
        end,
        sfx = function(n: string)
            sfx(self, n)
        end,
        tick = function(i: number)
            sfx(self, 'tick' .. (math.floor(i) % 12))
        end,
        done = function()
            local k = key(self.li, self.step)
            if not self.done[k] then
                self.done[k] = true
                self.cheerAt = self.t
                sfx(self, 'chime')
            end
        end,
        isDone = function(): boolean
            return self.done[key(self.li, self.step)] == true
        end,
        talking = function(): boolean
            return talking(self)
        end,
        burst = function(x: number, y: number, n: number)
            burst(self, x, y, n)
        end,
        shake = function(a: number)
            self.shakeT = 0.3
            self.shakeA = a
        end,
        hint = function(text: string)
            self.hintText = text
            self.hintAge = 0
        end,
        report = function(qid: string, correct: boolean, value: string, mixup: string?)
            self.answerId += 1
            local pa, pi = self.pAnswer, self.pAnswerId
            if pa ~= nil then
                pa.value = qid .. '|' .. (if correct then '1' else '0') .. '|' .. value .. '|' .. (mixup or '')
            end
            if pi ~= nil then
                pi.value = self.answerId
            end
        end,
    }
    self.g = g
    self.context = context
    initBridge(self, context)
    if self.screen == 'home' then
        say(self, 'home')
    end
    return true
end

function resize(self: Area, size: Vector) end

-- Everyone in the lessons, standing in a row (lesson = 99 from the page): for checking the artwork.
local CAST_ORDER = { 'kavin', 'paati', 'tenzin', 'dolkar', 'remi', 'kiran', 'saroj', 'imran', 'birsa', 'phulmani', 'fiza', 'nani' }
local castPeople: { people.Person } = {}

-- The crew: the seven young people the student helped, side by side, each with where they are from (lesson = 98).
local CREW = {
    { key = 'kavin', from = 'Chennai', what = 'kolam patch' },
    { key = 'tenzin', from = 'Leh', what = 'greenhouse' },
    { key = 'remi', from = 'Aizawl', what = 'pennants' },
    { key = 'kiran', from = 'Madhya Pradesh', what = 'funbox ramp' },
    { key = 'imran', from = 'Pune', what = 'game island' },
    { key = 'birsa', from = 'Ranchi', what = 'kitchen floor' },
    { key = 'fiza', from = 'Ahmedabad', what = 'kites' },
}
local crewPeople: { people.Person } = {}

-- The cast sheet and the crew move in advance(), not draw(): a headless capture draws only once, at the end.
local function advancePeople(self: Area, dt: number)
    if self.screen == 'cast' then
        if #castPeople == 0 then
            for i, k in CAST_ORDER do
                local col = (i - 1) % 6
                local row = math.floor((i - 1) / 6)
                local p = people.new(people.CAST[k], 130 + col * 204)
                p.y = 380 + row * 320
                p.mood = if i % 3 == 0 then 'wave' elseif i % 3 == 1 then 'idle' else 'cheer'
                table.insert(castPeople, p)
            end
        end
        for _, p in castPeople do
            people.advance(p, dt, self.t)
        end
    elseif self.screen == 'crew' then
        if #crewPeople == 0 then
            for i, c in CREW do
                local p = people.new(people.CAST[c.key], 1400) -- they walk (or roll) in from the right, one after another
                p.tx = 130 + (i - 1) * 170
                p.y = 560
                table.insert(crewPeople, p)
            end
        end
        for i, p in crewPeople do
            if self.screenAge < 0.35 * (i - 1) then
                p.x = 1400
            end
            local arrived = math.abs(p.x - p.tx) < 2
            p.mood = if arrived then (if (math.floor(self.t * 0.5) + i) % 3 == 0 then 'cheer' else 'wave') else 'idle'
            p.lookX, p.lookY = 640, 300
            people.advance(p, dt, self.t)
        end
    end
end

function advance(self: Area, dt: number): boolean
    self.t += dt
    self.age += dt
    self.screenAge += dt
    self.voiceAge += dt
    self.captionAge += dt
    self.hintAge += dt
    self.shakeT = math.max(0, self.shakeT - dt)
    advancePeople(self, dt)
    -- queued lines wait their turn
    if #self.queue > 0 and not talking(self) then
        local k = table.remove(self.queue, 1)
        if k ~= nil then
            say(self, k)
        end
    end
    local v = self.voice
    if v ~= nil and v:completed() then
        self.voice = nil
    end
    -- confetti physics
    local keep: { Bit } = {}
    for _, b in self.bits do
        b.vy += 900 * dt
        b.vx *= math.exp(-1.6 * dt)
        b.vy *= math.exp(-0.9 * dt)
        b.x += b.vx * dt
        b.y += b.vy * dt
        b.rot += b.spin * dt
        b.life -= dt * 0.45
        if b.life > 0 and b.y < 820 then
            table.insert(keep, b)
        end
    end
    self.bits = keep
    local g = self.g
    if g ~= nil then
        g.t = self.t
        g.age = self.age
        g.step = self.step
        if self.screen == 'lesson' then
            lesson(self).advance(g, dt)
        end
    end
    return true
end

-- Input --------------------------------------------------------------------------------

local CARD_W, CARD_H = 272, 214

local function cardPos(i: number): (number, number)
    if i <= 4 then
        return 60 + (i - 1) * (CARD_W + 20), 196
    end
    return 60 + (i - 5) * (CARD_W + 20), 428
end

-- buttons of the lesson frame
local function frameHit(self: Area, p: Vector): string
    if not self.linked and kit.dist(p, Vector.xy(64, 52)) < 26 then
        return 'home'
    end
    if kit.dist(p, Vector.xy(1214, 52)) < 24 then
        return 'sound'
    end
    if self.screen == 'lesson' then
        if kit.inRect(p, 932, 706, 120, 46) and self.step > 1 then
            return 'back'
        end
        if kit.inRect(p, 1064, 706, 176, 46) then
            return 'next'
        end
        local L = lesson(self)
        for i = 1, #L.steps do
            if kit.dist(p, Vector.xy(70 + (i - 1) * 30, 729)) < 13 then
                return 'dot:' .. i
            end
        end
    elseif self.screen == 'complete' then
        if self.linked then
            return if kit.inRect(p, 535, 470, 210, 52) then 'replay' else ''
        end
        if kit.inRect(p, 420, 470, 210, 52) then
            return 'home'
        end
        if kit.inRect(p, 650, 470, 210, 52) then
            return if self.li < #LESSONS then 'nextLesson' else 'home'
        end
    elseif self.screen == 'home' then
        for i = 1, #LESSONS do
            local x, y = cardPos(i)
            if kit.inRect(p, x, y, CARD_W, CARD_H) then
                return 'open:' .. i
            end
        end
    end
    return ''
end

local function press(self: Area, id: string)
    if id == 'home' then
        goHome(self)
    elseif id == 'sound' then
        self.muted = not self.muted
        if self.muted then
            stopVoice(self)
            self.queue = {}
        else
            sfx(self, 'pop')
        end
    elseif id == 'next' then
        nextStep(self)
    elseif id == 'back' then
        prevStep(self)
    elseif id == 'nextLesson' then
        openLesson(self, self.li + 1)
    elseif id == 'replay' then
        openLesson(self, self.li)
    elseif string.sub(id, 1, 4) == 'dot:' then
        local n = tonumber(string.sub(id, 5))
        if n ~= nil and n ~= self.step then
            sfx(self, 'pop')
            enterStep(self, n)
        end
    elseif string.sub(id, 1, 5) == 'open:' then
        local n = tonumber(string.sub(id, 6))
        if n ~= nil then
            openLesson(self, n)
        end
    end
end

function pointerDown(self: Area, event: PointerEvent)
    local p = event.position
    self.hover = p
    local b = frameHit(self, p)
    if b ~= '' then
        press(self, b)
        event:hit()
        return
    end
    local g = self.g
    if g ~= nil and self.screen == 'lesson' then
        if lesson(self).down(g, p) then
            self.downOn = 'lesson'
        end
        event:hit()
    end
end

function pointerMove(self: Area, event: PointerEvent)
    local p = event.position
    self.hover = p
    local g = self.g
    if g ~= nil and self.screen == 'lesson' then
        lesson(self).move(g, p)
        event:hit()
    end
end

function pointerUp(self: Area, event: PointerEvent)
    local p = event.position
    local g = self.g
    if g ~= nil and self.screen == 'lesson' then
        lesson(self).up(g, p)
        event:hit()
    end
    self.downOn = ''
end

function pointerExit(self: Area, event: PointerEvent)
    self.hover = Vector.xy(-100, -100)
end

function keyboardEvent(self: Area, event: KeyboardEvent): boolean
    if event.phase == 'up' then
        return false
    end
    local k = event.key
    local g = self.g
    if self.screen == 'lesson' and g ~= nil and lesson(self).key(g, k) then
        return true
    end
    if k == 256 then -- Esc
        if self.screen ~= 'home' then
            goHome(self)
        end
    elseif k == 77 then -- M
        press(self, 'sound')
    elseif self.screen == 'home' and k >= 49 and k <= 55 then
        openLesson(self, k - 48)
    elseif self.screen == 'lesson' and k == 262 then
        nextStep(self)
    elseif self.screen == 'lesson' and k == 263 then
        prevStep(self)
    elseif self.screen == 'complete' and (k == 257 or k == 262) then
        if self.li < #LESSONS then
            openLesson(self, self.li + 1)
        else
            goHome(self)
        end
    else
        return false
    end
    return true
end

-- Drawing -------------------------------------------------------------------------------

local function button(self: Area, r: Renderer, fonts: Fonts, id: string, text: string, x: number, y: number, w: number, h: number, primary: boolean, enabled: boolean, glow: boolean)
    local over = enabled and frameHit(self, self.hover) == id
    local yy = if over then y - 2 else y
    if glow then
        local k = (self.t * 0.8) % 1
        local gg = 4 + k * 12
        r:drawPath(kit.rrect(x - gg, y - gg, w + gg * 2, h + gg * 2, h / 2 + gg), kit.stroke(kit.alpha(kit.ACCENT, 0.45 * (1 - k)), 3))
    end
    if enabled then
        r:drawPath(kit.rrect(x, yy + 3, w, h, h / 2), kit.soft(kit.alpha(kit.INK, 0.16), 8))
    end
    local bg = if primary then (if over then kit.ACCENT_DEEP else kit.ACCENT) else kit.SURFACE
    if not enabled then
        bg = Color.rgb(236, 241, 237)
    end
    r:drawPath(kit.rrect(x, yy, w, h, h / 2), kit.fill(bg))
    if not primary then
        r:drawPath(kit.rrect(x, yy, w, h, h / 2), kit.stroke(kit.LINE, 1.5))
    end
    kit.label(r, fonts, text, fonts.body, 17, if primary then kit.SURFACE elseif enabled then kit.INK else kit.INK_FAINT, x + w / 2, yy + h / 2, 0.5)
end

local function roundButton(self: Area, r: Renderer, id: string, x: number, y: number)
    local over = frameHit(self, self.hover) == id
    r:drawPath(kit.circle(x, y + 2, 22), kit.soft(kit.alpha(kit.INK, 0.12), 8))
    r:drawPath(kit.circle(x, y, 22), kit.fill(if over then kit.ACCENT_WASH else kit.SURFACE))
    r:drawPath(kit.circle(x, y, 22), kit.stroke(kit.LINE, 1.5))
end

local function drawSound(self: Area, r: Renderer)
    local x, y = 1214, 52
    roundButton(self, r, 'sound', x, y)
    local c = if self.muted then kit.INK_FAINT else kit.ACCENT_DEEP
    local sp = Path.new()
    sp:moveTo(Vector.xy(x - 9, y - 4))
    sp:lineTo(Vector.xy(x - 5, y - 4))
    sp:lineTo(Vector.xy(x + 1, y - 9))
    sp:lineTo(Vector.xy(x + 1, y + 9))
    sp:lineTo(Vector.xy(x - 5, y + 4))
    sp:lineTo(Vector.xy(x - 9, y + 4))
    sp:close()
    r:drawPath(sp, kit.fill(c))
    if self.muted then
        r:drawPath(kit.line(x + 5, y - 5, x + 12, y + 5), kit.stroke(c, 2.2))
        r:drawPath(kit.line(x + 12, y - 5, x + 5, y + 5), kit.stroke(c, 2.2))
    else
        local w = if talking(self) then 0.35 + 0.65 * math.abs(math.sin(self.t * 6)) else 1
        r:drawPath(kit.arc(x + 2, y, 6, -0.9, 0.9), kit.stroke(c, 2))
        r:drawPath(kit.arc(x + 2, y, 11, -0.9, 0.9), kit.stroke(kit.alpha(c, w), 2))
    end
end

local function drawHomeButton(self: Area, r: Renderer)
    local x, y = 64, 52
    roundButton(self, r, 'home', x, y)
    local c = kit.ACCENT_DEEP
    for i = 0, 1 do
        for j = 0, 1 do
            r:drawPath(kit.rrect(x - 9 + i * 10, y - 9 + j * 10, 8, 8, 2), kit.fill(c))
        end
    end
end

-- Kiara, as a little living orb: it breathes, and ripples while she talks
local function drawOrb(self: Area, r: Renderer, x: number, y: number, s: number)
    local tk = talking(self)
    local amp = if tk then 0.5 + 0.5 * math.abs(math.sin(self.t * 9)) * math.abs(math.sin(self.t * 3.7)) else 0
    for i = 1, 3 do
        local k = ((self.t * 0.9) + i / 3) % 1
        if tk then
            r:drawPath(kit.circle(x, y, s * (1 + k * 0.9)), kit.stroke(kit.alpha(kit.ACCENT, 0.35 * (1 - k)), 2))
        end
    end
    local br = s * (1 + 0.04 * math.sin(self.t * 2.4) + amp * 0.1)
    local grd = Gradient.radial(Vector.xy(x - br * 0.35, y - br * 0.4), br * 1.6, {
        { position = 0, color = Color.rgb(132, 214, 176) },
        { position = 0.55, color = kit.ACCENT },
        { position = 1, color = kit.ACCENT_DEEP },
    })
    r:drawPath(kit.circle(x + 1, y + 3, br), kit.soft(kit.alpha(kit.INK, 0.2), 6))
    r:drawPath(kit.circle(x, y, br), Paint.with({ gradient = grd }))
    -- two eyes that blink
    local blink = if (self.t % 4.2) < 0.12 then 0.15 else 1
    local ey = y - br * 0.08
    r:drawPath(kit.ellipse(x - br * 0.3, ey, br * 0.1, br * 0.16 * blink), kit.fill(kit.SURFACE))
    r:drawPath(kit.ellipse(x + br * 0.3, ey, br * 0.1, br * 0.16 * blink), kit.fill(kit.SURFACE))
    if tk then
        r:drawPath(kit.ellipse(x, y + br * 0.36, br * 0.16, br * 0.06 + amp * br * 0.12), kit.fill(kit.alpha(kit.SURFACE, 0.9)))
    end
end

local function drawCaption(self: Area, r: Renderer, fonts: Fonts, y: number)
    if self.caption == '' then
        return
    end
    local k = kit.ease(self.captionAge * 4)
    r:save()
    r:modulateOpacity(0.35 + 0.65 * k)
    r:transform(Mat2D.withTranslation(0, (1 - k) * 6))
    r:drawPath(kit.rrect(40, y, 1200, 52, 26), kit.fill(kit.SURFACE))
    r:drawPath(kit.rrect(40, y, 1200, 52, 26), kit.stroke(kit.LINE, 1.5))
    -- Maji tells the lesson: she sits on the caption bar, talks with it and jumps when a task is done
    local drew = false
    local img, smp = self.maji, self.majiSampler
    if img ~= nil and smp ~= nil then
        local mood = if self.t - self.cheerAt < 1.4 then 'happy' elseif talking(self) then 'talk' else 'idle'
        drew = world.maji(r, img, smp, 82, y + 50, 92, self.t, mood)
    end
    if not drew then
        drawOrb(self, r, 68, y + 26, 17)
    end
    local one = kit.width(fonts, self.caption, fonts.body, 17) < 1070
    kit.paragraph(r, fonts, self.caption, 17, if talking(self) then kit.INK else kit.INK_SOFT, 138, y + (if one then 15 else 5), 1080)
    r:restore()
end

local function drawTaskChip(self: Area, r: Renderer, fonts: Fonts)
    local L = lesson(self)
    local st = L.steps[self.step]
    local done = self.done[key(self.li, self.step)] == true
    local tag = if done then 'DONE' else 'YOUR TURN'
    local text = st.task
    local tw = kit.width(fonts, tag, fonts.mono, 12)
    local xw = kit.width(fonts, text, fonts.body, 16)
    local w = 18 + 26 + 10 + tw + 12 + xw + 22
    local x, y, h = 40, 102, 38
    local k = kit.ease(self.age * 2.5)
    r:save()
    r:modulateOpacity(k)
    local bg = if done then kit.ACCENT else kit.ACCENT_WASH
    r:drawPath(kit.rrect(x, y + 2, w, h, h / 2), kit.soft(kit.alpha(kit.INK, 0.1), 8))
    r:drawPath(kit.rrect(x, y, w, h, h / 2), kit.fill(bg))
    local ccx, ccy = x + 31, y + h / 2
    if done then
        r:drawPath(kit.circle(ccx, ccy, 12), kit.fill(kit.SURFACE))
        r:drawPath(kit.check(ccx, ccy, 13), kit.stroke(kit.ACCENT, 2.6))
    else
        local s = 0.6 + 0.4 * math.abs(math.sin(self.t * 3))
        r:drawPath(kit.circle(ccx, ccy, 12), kit.stroke(kit.ACCENT, 2))
        r:drawPath(kit.circle(ccx, ccy, 5 * s), kit.fill(kit.ACCENT))
    end
    kit.label(r, fonts, tag, fonts.mono, 12, if done then kit.ACCENT_WASH else kit.ACCENT, x + 54, ccy, 0)
    kit.label(r, fonts, text, fonts.body, 16, if done then kit.SURFACE else kit.ACCENT_DEEP, x + 54 + tw + 12, ccy, 0)
    r:restore()
end

local function drawLessonFrame(self: Area, r: Renderer, fonts: Fonts, g: G)
    local L = lesson(self)
    local st = L.steps[self.step]
    if not self.linked then
        drawHomeButton(self, r)
    end
    drawSound(self, r)
    local k = kit.ease(self.age * 2.5)
    r:save()
    r:modulateOpacity(k)
    r:transform(Mat2D.withTranslation(0, (1 - k) * 10))
    kit.label(r, fonts, 'AREA  ·  LESSON ' .. self.li .. '  ·  ' .. L.tag .. '  ·  STEP ' .. self.step .. ' OF ' .. #L.steps, fonts.mono, 13, kit.ACCENT, 104, 36, 0)
    kit.label(r, fonts, st.title, fonts.display, 30, kit.INK, 104, 70, 0)
    r:restore()
    drawTaskChip(self, r, fonts)

    -- the board
    local bx, by, bw, bh = kit.BX, kit.BY, kit.BW, kit.BH
    r:drawPath(kit.rrect(bx, by + 6, bw, bh, 24), kit.soft(kit.alpha(kit.INK, 0.08), 26))
    r:drawPath(kit.rrect(bx, by, bw, bh, 24), kit.fill(kit.SURFACE))
    r:save()
    r:clipPath(kit.rrect(bx, by, bw, bh, 24))
    local sx = 0
    if self.shakeT > 0 then
        sx = math.sin(self.shakeT * 70) * self.shakeA * (self.shakeT / 0.3)
    end
    r:transform(Mat2D.withTranslation(sx, 0))
    L.draw(g, r)
    r:restore()

    -- a hint chip
    if self.hintText ~= '' and self.hintAge < 7 then
        local hk = math.min(kit.ease(self.hintAge * 3), kit.clamp((7 - self.hintAge) * 2, 0, 1))
        local w = kit.width(fonts, self.hintText, fonts.body, 15) + 40
        r:save()
        r:modulateOpacity(hk)
        -- a hint is advice, not a thing to move: green, because gold means "this moves / this is where it goes"
        r:drawPath(kit.rrect(bx + 20, by + bh - 56, w, 36, 18), kit.fill(kit.ACCENT_WASH))
        r:drawPath(kit.rrect(bx + 20, by + bh - 56, w, 36, 18), kit.stroke(kit.alpha(kit.ACCENT, 0.5), 1.5))
        kit.label(r, fonts, self.hintText, fonts.body, 15, kit.ACCENT_DEEP, bx + 40, by + bh - 38, 0)
        r:restore()
    end

    drawCaption(self, r, fonts, 646)

    -- step dots
    for i = 1, #L.steps do
        local cx, cy = 70 + (i - 1) * 30, 729
        local on = i == self.step
        local dn = self.done[key(self.li, i)] == true
        local col = if on then kit.ACCENT elseif dn then kit.alpha(kit.ACCENT, 0.55) else kit.LINE
        r:drawPath(kit.circle(cx, cy, if on then 9 else 7), kit.fill(col))
        if dn then
            r:drawPath(kit.check(cx, cy, if on then 10 else 8), kit.stroke(kit.SURFACE, 1.8))
        end
    end
    local done = self.done[key(self.li, self.step)] == true
    button(self, r, fonts, 'back', 'Back', 932, 706, 120, 46, false, self.step > 1, false)
    button(self, r, fonts, 'next', if self.step == #L.steps then 'Finish' else 'Next', 1064, 706, 176, 46, true, true, done)
end

local function drawHome(self: Area, r: Renderer, fonts: Fonts, g: G)
    drawSound(self, r)
    local k = kit.ease(self.screenAge * 2)
    r:save()
    r:modulateOpacity(k)
    kit.label(r, fonts, 'CLASS 8 MATHS  ·  NCERT GANITA PRAKASH  ·  8 LESSONS', fonts.mono, 13, kit.ACCENT, 60, 46, 0)
    kit.label(r, fonts, 'Area', fonts.display, 56, kit.INK, 60, 100, 0)
    kit.label(r, fonts, 'Cut it, slide it, spin it, stretch it. Every rule, found with your own hands.', fonts.body, 19, kit.INK_SOFT, 200, 104, 0)
    r:restore()
    local nDone = 0
    for i = 1, #LESSONS do
        if self.finished[i] then
            nDone += 1
        end
    end
    -- progress bar
    r:drawPath(kit.rrect(940, 92, 240, 12, 6), kit.fill(kit.LINE))
    if nDone > 0 then
        r:drawPath(kit.rrect(940, 92, 240 * nDone / #LESSONS, 12, 6), kit.fill(kit.ACCENT))
    end
    kit.label(r, fonts, nDone .. ' of ' .. #LESSONS .. ' done', fonts.body, 14, kit.INK_SOFT, 1180, 124, 1)

    for i, L in LESSONS do
        local x, y = cardPos(i)
        local ck = kit.back((self.screenAge - 0.08 * i) * 2.2)
        if ck > 0 then
            local over = frameHit(self, self.hover) == 'open:' .. i
            local lift = if over then 6 else 0
            local nextUp = not self.finished[i] and (i == 1 or self.finished[i - 1] == true)
            r:save()
            r:modulateOpacity(kit.clamp(ck, 0, 1))
            r:transform(Mat2D.withTranslation(0, (1 - ck) * 30 - lift))
            r:drawPath(kit.rrect(x + 2, y + 8 + lift, CARD_W, CARD_H, 22), kit.soft(kit.alpha(kit.INK, if over then 0.18 else 0.1), if over then 22 else 14))
            r:drawPath(kit.rrect(x, y, CARD_W, CARD_H, 22), kit.fill(kit.SURFACE))
            r:drawPath(kit.rrect(x, y, CARD_W, CARD_H, 22), kit.stroke(if nextUp then kit.GOLD elseif over then kit.alpha(kit.ACCENT, 0.4) else kit.LINE, if nextUp then 2.5 else 1.5))
            -- live thumbnail
            r:save()
            r:clipPath(kit.rrect(x + 10, y + 10, CARD_W - 20, 112, 14))
            r:drawPath(kit.rect(x + 10, y + 10, CARD_W - 20, 112), kit.fill(kit.PAGE))
            L.thumb(g, r, x + 10, y + 10, CARD_W - 20, 112)
            r:restore()
            kit.label(r, fonts, 'LESSON ' .. i, fonts.mono, 11, kit.ACCENT, x + 18, y + 142, 0)
            -- a long title shrinks to fit the card instead of running off its edge
            local tw = kit.width(fonts, L.title, fonts.display, 21)
            local tsize = if tw > CARD_W - 36 then 21 * (CARD_W - 36) / tw else 21
            kit.label(r, fonts, L.title, fonts.display, tsize, kit.INK, x + 18, y + 168, 0)
            kit.label(r, fonts, L.blurb, fonts.body, 14, kit.INK_SOFT, x + 18, y + 194, 0)
            if self.finished[i] then
                r:drawPath(kit.circle(x + CARD_W - 28, y + 142, 13), kit.fill(kit.ACCENT))
                r:drawPath(kit.check(x + CARD_W - 28, y + 142, 13), kit.stroke(kit.SURFACE, 2.4))
            elseif nextUp then
                local pk = 0.5 + 0.5 * math.sin(self.t * 3)
                kit.label(r, fonts, 'START', fonts.mono, 11, kit.mix(kit.GOLD_DEEP, kit.GOLD, pk), x + CARD_W - 18, y + 142, 1)
            end
            r:restore()
        end
    end
    drawCaption(self, r, fonts, 676)
end

local function drawComplete(self: Area, r: Renderer, fonts: Fonts, g: G)
    -- the lesson stays behind, dimmed
    drawLessonFrame(self, r, fonts, g)
    local k = kit.ease(self.screenAge * 2.5)
    r:drawPath(kit.rect(0, 0, 1280, 760), kit.fill(kit.alpha(kit.PAGE, 0.82 * k)))
    local e = kit.back(self.screenAge * 2)
    r:save()
    r:modulateOpacity(kit.clamp(self.screenAge * 3, 0, 1))
    r:transform(Mat2D.withTranslation(640, 380) * Mat2D.withScale(0.85 + 0.15 * e, 0.85 + 0.15 * e) * Mat2D.withTranslation(-640, -380))
    r:drawPath(kit.rrect(322, 194, 636, 360, 30), kit.soft(kit.alpha(kit.INK, 0.18), 30))
    r:drawPath(kit.rrect(320, 186, 640, 360, 30), kit.fill(kit.SURFACE))
    -- three stars that pop in one by one
    for i = 1, 3 do
        local sk = kit.back((self.screenAge - 0.25 - i * 0.18) * 3)
        if sk > 0 then
            local cx, cy = 560 + (i - 1) * 80, 262 - (if i == 2 then 14 else 0)
            local rad = 30 * sk
            local P: { Vector } = {}
            for j = 0, 9 do
                local a = -math.pi / 2 + j * math.pi / 5
                local rr = if j % 2 == 0 then rad else rad * 0.45
                table.insert(P, Vector.xy(cx + math.cos(a) * rr, cy + math.sin(a) * rr))
            end
            r:drawPath(kit.poly(kit.offset(P, 2, 4)), kit.soft(kit.alpha(kit.INK, 0.2), 4))
            r:drawPath(kit.poly(P), kit.fill(kit.GOLD))
            r:drawPath(kit.poly(P), kit.stroke(kit.SURFACE, 2.5))
        end
    end
    local L = lesson(self)
    kit.label(r, fonts, 'LESSON ' .. self.li .. ' COMPLETE', fonts.mono, 13, kit.ACCENT, 640, 330, 0.5)
    kit.label(r, fonts, L.title, fonts.display, 34, kit.INK, 640, 372, 0.5)
    local nd = 0
    for s = 1, #L.steps do
        if self.done[key(self.li, s)] then
            nd += 1
        end
    end
    kit.label(r, fonts, nd .. ' of ' .. #L.steps .. ' tasks done with your own hands', fonts.body, 17, kit.INK_SOFT, 640, 414, 0.5)
    r:restore()
    if self.linked then
        button(self, r, fonts, 'replay', 'Do it again', 535, 470, 210, 52, false, true, false)
    else
        button(self, r, fonts, 'home', 'All lessons', 420, 470, 210, 52, false, true, false)
        button(self, r, fonts, if self.li < #LESSONS then 'nextLesson' else 'home', if self.li < #LESSONS then 'Next lesson' else 'Done', 650, 470, 210, 52, true, true, true)
    end
    drawCaption(self, r, fonts, 646)
end

local function drawCast(self: Area, r: Renderer, fonts: Fonts)
    kit.label(r, fonts, 'THE AREA CAST', fonts.mono, 13, kit.ACCENT, 60, 46, 0)
    for _, p in castPeople do
        people.draw(r, fonts, p, self.t)
        kit.label(r, fonts, p.look.name, fonts.display, 18, kit.INK, p.x, p.y + 30, 0.5)
    end
end

local function drawCrew(self: Area, r: Renderer, fonts: Fonts)
    local k = kit.ease(self.screenAge * 1.6)
    r:save()
    r:modulateOpacity(k)
    kit.label(r, fonts, 'YOUR AREA CREW', fonts.mono, 13, kit.ACCENT, 640, 120, 0.5)
    kit.label(r, fonts, 'Seven friends, seven problems, all solved with you', fonts.display, 34, kit.INK, 640, 166, 0.5)
    r:restore()
    -- a long soft stage for them to stand on
    r:drawPath(kit.rrect(60, 548, 1160, 26, 13), kit.soft(kit.alpha(kit.INK, 0.08), 12))
    for i, p in crewPeople do
        people.draw(r, fonts, p, self.t)
        if math.abs(p.x - p.tx) < 2 then
            kit.label(r, fonts, p.look.name, fonts.display, 20, kit.INK, p.x, p.y + 40, 0.5)
            kit.label(r, fonts, CREW[i].from, fonts.body, 15, kit.INK_SOFT, p.x, p.y + 64, 0.5)
            kit.label(r, fonts, CREW[i].what, fonts.mono, 12, kit.ACCENT, p.x, p.y + 86, 0.5)
        end
    end
end

local function drawBits(self: Area, r: Renderer)
    for _, b in self.bits do
        r:save()
        r:modulateOpacity(kit.clamp(b.life * 1.6, 0, 1))
        r:transform(Mat2D.withTranslation(b.x, b.y) * Mat2D.withRotation(b.rot))
        if b.kind == 0 then
            r:drawPath(kit.rect(-b.size / 2, -b.size * 0.3, b.size, b.size * 0.6), kit.fill(b.col))
        elseif b.kind == 1 then
            r:drawPath(kit.circle(0, 0, b.size * 0.45), kit.fill(b.col))
        else
            r:drawPath(kit.rrect(-b.size * 0.15, -b.size * 0.6, b.size * 0.3, b.size * 1.2, 2), kit.fill(b.col))
        end
        r:restore()
    end
end

function draw(self: Area, r: Renderer)
    local fonts = self.fonts
    local g = self.g
    if fonts == nil or g == nil then
        return
    end
    if self.screen == 'home' then
        drawHome(self, r, fonts, g)
    elseif self.screen == 'cast' then
        drawCast(self, r, fonts)
    elseif self.screen == 'crew' then
        drawCrew(self, r, fonts)
    elseif self.screen == 'lesson' then
        drawLessonFrame(self, r, fonts, g)
    else
        drawComplete(self, r, fonts, g)
    end
    drawBits(self, r)
end

return function(context: Context): Layout<Area>
    return {
        fonts = nil,
        g = nil,
        sfx = {},
        maji = nil,
        majiSampler = nil,
        cheerAt = -10,
        voices = {},
        voice = nil,
        voiceKey = '',
        voiceAge = 0,
        queue = {},
        caption = '',
        captionAge = 0,
        muted = false,
        t = 0,
        screen = 'home',
        screenAge = 0,
        li = 1,
        step = 1,
        age = 0,
        done = {},
        finished = {},
        bits = {},
        shakeT = 0,
        shakeA = 0,
        hintText = '',
        hintAge = 99,
        hover = Vector.xy(-100, -100),
        downOn = '',
        vm = nil,
        pLesson = nil,
        pHostVoice = nil,
        pSay = nil,
        pSayId = nil,
        pHeard = nil,
        pAnswer = nil,
        pAnswerId = nil,
        pDone = nil,
        hostVoice = false,
        linked = false,
        sayId = 0,
        heard = 0,
        answerId = 0,
        context = nil,
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
