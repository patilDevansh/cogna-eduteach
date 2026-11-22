-- The Brackets chapter: what the shell (rive-chapter-shell/main.luau) shows around its lessons.
local kit = require('kit')

local M: { name: string, kicker: string, blurb: string, lastLine: string, lessons: { kit.Lesson } } = {
    name = 'Brackets',
    kicker = 'CLASS 8 MATHS  ·  ALGEBRAIC EXPRESSIONS AND IDENTITIES  ·  3 LESSONS',
    blurb = 'Cut a field and the bracket opens itself.',
    lastLine = 'l3s3done', -- the last thing Kiara says in the last lesson (so "lesson complete" does not talk over it)
    lessons = { require('l1'), require('l2'), require('l3') },
}

return M
