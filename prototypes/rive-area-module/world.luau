-- Maji, the lion cub who tells the lesson: one frame of her sprite sheet at a time.
--
--   world.maji(r, img, sampler, x, y, h, t, mood)   draws her; moods 'idle' · 'talk' · 'happy' · 'oops' · 'wave'
--
-- The farm backdrop and Ramesh uncle that used to live here are gone (27 Nov 2026): each lesson now draws its
-- own setting, and the people are in people.luau (see CAST_AND_STORIES.md in the trail).

local kit = require('kit')

local W = {}

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
