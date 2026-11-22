-- The Squares chapter: what the shell (rive-chapter-shell/main.luau) shows around its lessons.
local kit = require('kit')

local M: { name: string, kicker: string, blurb: string, lastLine: string, lessons: { kit.Lesson } } = {
    name = 'Squares',
    kicker = 'CLASS 8 MATHS  ·  SQUARES AND SQUARE ROOTS  ·  3 LESSONS',
    blurb = 'Grow it, wrap it, shuffle it. Squares and roots, built by hand.',
    lastLine = 'l3s3done', -- the last thing Kiara says in the last lesson (so "lesson complete" does not talk over it)
    lessons = { require('l1'), require('l2'), require('l3') },
}

return M
